// apps/api/src/controllers/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { generatePassportCode } from '../lib/passport';
import { AppError } from '../lib/errors';
import { DEFAULT_STUDIO_SLUG } from '@oiano/shared';
import { emitActivityEvent } from '../lib/activityEvents';
import { writeAdminAudit } from '../lib/adminAudit';
import { decryptTotp, encryptTotp, newTotpSecret, verifyTotp } from '../lib/totp';

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).optional(),
  alias: z.string().optional(),
  role: z.enum(['ARTIST', 'PRODUCER']).optional().default('ARTIST'),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const EnterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

function signToken(userId: string, role: string): string {
  return jwt.sign({ sub: userId, role }, process.env.JWT_SECRET!, {
    expiresIn: '7d',
  });
}
function signMfaChallenge(userId:string, purpose:'setup'|'verify'){return jwt.sign({sub:userId,purpose,type:'mfa'},process.env.JWT_SECRET!,{expiresIn:'5m'});}

// POST /api/auth/signup
export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const data = SignupSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError('Email already in use', 409);

    const password_hash = await bcrypt.hash(data.password, 10);
    const role = data.role ?? 'ARTIST';
    const name = data.name?.trim() || data.email.split('@')[0];

    const passportCode = await generatePassportCode();

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password_hash,
        role,
        ...(role === 'ARTIST' && {
          artist: {
            create: {
              name,
              alias: data.alias,
              passport: {
                create: {
                  passport_code: passportCode,
                  profile_strength: 10,
                  creative_dna: {
                    genres: [],
                    influences: [],
                    vocal_type: null,
                    energy_profile: null,
                    key_themes: [],
                  },
                },
              },
              wallet: { create: { balance_usd: 0 } },
            },
          },
        }),
        ...(role === 'PRODUCER' && {
          producer: {
            create: {
              name,
              alias: data.alias ?? null,
              passport: {
                create: {
                  passport_code: passportCode,
                  genres_produced: [],
                  signature_tags: [],
                  profile_strength: 10,
                },
              },
            },
          },
        }),
      },
      include: {
        artist: { include: { passport: true, wallet: true } },
        producer: { include: { passport: true } },
      },
    });

    // Fired right after the profile record commits — not gated on completeness
    if (user.artist) {
      emitActivityEvent('profile.created', { artist_id: user.artist.id }).catch((e) =>
        console.error('[activity] profile.created emit failed:', e?.message),
      );
    }

    const token = signToken(user.id, user.role);
    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/login
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const data = LoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        artist: { include: { passport: true, wallet: true } },
        studio_staff: true,
        producer: { include: { passport: true } },
      },
    });

    if (!user || !user.password_hash) throw new AppError('Invalid credentials', 401);

    const valid = await bcrypt.compare(data.password, user.password_hash);
    if (!valid) throw new AppError('Invalid credentials', 401);

    if (user.role === 'OIANO_ADMIN') {
      if (!user.mfa_enabled || !user.mfa_secret_encrypted) {
        const secret=newTotpSecret(); await prisma.user.update({where:{id:user.id},data:{mfa_secret_encrypted:encryptTotp(secret),mfa_enabled:false}});
        await writeAdminAudit(user.id,'mfa.enrollment.started',req);
        return res.json({mfa_required:true,mfa_setup:true,challenge:signMfaChallenge(user.id,'setup'),secret,otpauth_uri:`otpauth://totp/OIANO:${encodeURIComponent(user.email)}?secret=${secret}&issuer=OIANO&digits=6&period=30`});
      }
      return res.json({mfa_required:true,mfa_setup:false,challenge:signMfaChallenge(user.id,'verify')});
    }
    const token = signToken(user.id, user.role);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    next(err)

  }
}

export async function verifyMfa(req:Request,res:Response,next:NextFunction){try{
 const {challenge,code}=z.object({challenge:z.string(),code:z.string().regex(/^\d{6}$/)}).parse(req.body);
 const payload=jwt.verify(challenge,process.env.JWT_SECRET!) as any;if(payload.type!=='mfa'||!['setup','verify'].includes(payload.purpose))throw new AppError('Invalid MFA challenge',401);
 const user=await prisma.user.findUnique({where:{id:payload.sub}});if(!user||user.role!=='OIANO_ADMIN'||!user.mfa_secret_encrypted)throw new AppError('Invalid MFA challenge',401);
 if(!verifyTotp(decryptTotp(user.mfa_secret_encrypted),code)){await writeAdminAudit(user.id,'mfa.verification.failed',req);throw new AppError('Invalid authenticator code',401);}
 if(payload.purpose==='setup')await prisma.user.update({where:{id:user.id},data:{mfa_enabled:true}});
 await writeAdminAudit(user.id,payload.purpose==='setup'?'mfa.enrollment.completed':'auth.login.success',req);
 const refreshed=await prisma.user.findUnique({where:{id:user.id}});res.json({token:signToken(user.id,user.role),user:sanitizeUser(refreshed)});
 }catch(error){next(error);}}

// POST /api/auth/enter — unified entry: verifies an existing account or
// creates a new ARTIST one, so the client never has to ask "signup or login?"
export async function enter(req: Request, res: Response, next: NextFunction) {
  try {
    const data = EnterSchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        artist: { include: { passport: true, wallet: true } },
        studio_staff: true,
        producer: { include: { passport: true } },
      },
    });

    let user = existing;
    let created = false;

    if (user) {
      if (!user.password_hash || !(await bcrypt.compare(data.password, user.password_hash))) {
        throw new AppError('Invalid credentials', 401);
      }
    } else {
      const password_hash = await bcrypt.hash(data.password, 10);
      const passportCode = await generatePassportCode();
      const name = data.email.split('@')[0];

      user = await prisma.user.create({
        data: {
          email: data.email,
          password_hash,
          role: 'ARTIST',
          artist: {
            create: {
              name,
              passport: {
                create: {
                  passport_code: passportCode,
                  profile_strength: 0,
                  creative_dna: {
                    genres: [],
                    influences: [],
                    vocal_type: null,
                    energy_profile: null,
                    key_themes: [],
                  },
                },
              },
              // Small welcome credit — lets a brand-new artist actually complete
              // a real booking during the onboarding sequence's demo flow
              // instead of hitting the wallet-balance guard at $0.
              wallet: { create: { balance_usd: 100 } },
            },
          },
        },
        include: {
          artist: { include: { passport: true, wallet: true } },
          studio_staff: true,
          producer: { include: { passport: true } },
        },
      });
      created = true;

      if (user.artist) {
        emitActivityEvent('profile.created', { artist_id: user.artist.id }).catch((e) =>
          console.error('[activity] profile.created emit failed:', e?.message),
        );
      }
    }

    const token = signToken(user.id, user.role);
    res.status(created ? 201 : 200).json({ token, user: sanitizeUser(user), created });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me
export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: (req as any).userId },
      include: {
        artist: { include: { passport: true, wallet: true } },
        studio_staff: true,
        producer: { include: { passport: true } },
      },
    });
    if (!user) throw new AppError('User not found', 404);
    res.json(sanitizeUser(user));
  } catch (err) {
    next(err);
  }
}

function sanitizeUser(user: any) {
  const { password_hash, ...safe } = user;
  return safe;
}
