// apps/api/src/controllers/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { generatePassportCode } from '../lib/passport';
import { AppError } from '../lib/errors';
import { emitActivityEvent } from '../lib/activityEvents';
import { writeAdminAudit } from '../lib/adminAudit';
import { decryptTotp, encryptTotp, newTotpSecret, tryDecryptTotp, verifyTotp } from '../lib/totp';
import { issuePasswordResetToken, verifyPasswordResetToken, passwordVersionMatches } from '../lib/passwordResetToken';
import { sendPasswordResetEmail } from '../services/email.service';

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

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

function signToken(userId: string, role: string, authVersion: number): string {
  return jwt.sign({ sub: userId, role, ver: authVersion }, process.env.JWT_SECRET!, {
    expiresIn: '7d',
  });
}
function signMfaChallenge(userId:string, purpose:'setup'|'verify'){return jwt.sign({sub:userId,purpose,type:'mfa'},process.env.JWT_SECRET!,{expiresIn:'5m'});}

// Single choke point for "does this user get a real session token, or an MFA
// challenge?" — every credential-verifying endpoint (login, enter,
// reset-password) must route through this rather than calling signToken
// directly, so OIANO_ADMIN's MFA requirement can't be silently skipped by a
// new or alternate entry point again (it previously was, in two of the three).
type SessionOutcome =
  | { mfaRequired: true; body: Record<string, unknown> }
  | { mfaRequired: false; token: string };

async function beginSession(user: any, req: Request): Promise<SessionOutcome> {
  if (user.role === 'OIANO_ADMIN') {
    if (!user.mfa_enabled) {
      // Reuse a still-pending, unverified secret instead of minting a new one
      // on every attempt — otherwise a secret the admin already scanned into
      // their authenticator app is silently invalidated by the next call.
      let secret = user.mfa_secret_encrypted ? tryDecryptTotp(user.mfa_secret_encrypted) : null;
      if (!secret) {
        secret = newTotpSecret();
        await prisma.user.update({ where: { id: user.id }, data: { mfa_secret_encrypted: encryptTotp(secret) } });
        if (user.mfa_secret_encrypted) await writeAdminAudit(user.id, 'mfa.enrollment.secret_recovered', req);
      }
      await writeAdminAudit(user.id, 'mfa.enrollment.started', req);
      return {
        mfaRequired: true,
        body: {
          mfa_required: true,
          mfa_setup: true,
          challenge: signMfaChallenge(user.id, 'setup'),
          secret,
          otpauth_uri: `otpauth://totp/OIANO:${encodeURIComponent(user.email)}?secret=${secret}&issuer=OIANO&digits=6&period=30`,
        },
      };
    }
    return { mfaRequired: true, body: { mfa_required: true, mfa_setup: false, challenge: signMfaChallenge(user.id, 'verify') } };
  }
  return { mfaRequired: false, token: signToken(user.id, user.role, user.auth_version) };
}

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

    const token = signToken(user.id, user.role, user.auth_version);
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

    const outcome = await beginSession(user, req);
    if (outcome.mfaRequired) return res.json(outcome.body);
    res.json({ token: outcome.token, user: sanitizeUser(user) });
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
 const refreshed=await prisma.user.findUnique({where:{id:user.id}});res.json({token:signToken(user.id,user.role,user.auth_version),user:sanitizeUser(refreshed)});
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
              // Production identities must begin from financially explainable
              // state. Demo purchasing power belongs in explicit test/seed data,
              // never in the public account-creation path.
              wallet: { create: { balance_usd: 0 } },
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

    const outcome = await beginSession(user, req);
    const status = created ? 201 : 200;
    if (outcome.mfaRequired) return res.status(status).json({ ...outcome.body, created });
    res.status(status).json({ token: outcome.token, user: sanitizeUser(user), created });
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

// POST /api/auth/forgot-password — always returns the same generic response,
// whether or not the email belongs to a real account, so this endpoint can't
// be used to enumerate registered emails.
export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = ForgotPasswordSchema.parse(req.body);
    const genericResponse = { message: 'If an account exists for that email, a reset link is on its way.' };

    const user = await prisma.user.findUnique({ where: { email } });
    if (user?.password_hash) {
      const token = issuePasswordResetToken(user.id, user.password_hash);
      const resetUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/reset-password?token=${token}`;
      sendPasswordResetEmail(email, resetUrl).catch((e) => console.error('[email] password reset failed:', e?.message));
    }

    res.json(genericResponse);
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/reset-password — the token embeds a fingerprint of the
// password hash that existed when it was issued, so it stops verifying the
// instant the password actually changes (stateless single-use, no token
// table needed). Logs the user straight in on success.
export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, password } = ResetPasswordSchema.parse(req.body);
    const { userId, passwordVersion } = verifyPasswordResetToken(token);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        artist: { include: { passport: true, wallet: true } },
        studio_staff: true,
        producer: { include: { passport: true } },
      },
    });
    if (!user?.password_hash || !passwordVersionMatches(user.password_hash, passwordVersion)) {
      throw new AppError('This reset link is invalid or has already been used', 400);
    }

    const password_hash = await bcrypt.hash(password, 10);
    const consumed = await prisma.user.updateMany({
      where: { id: user.id, password_hash: user.password_hash },
      data: { password_hash, auth_version: { increment: 1 } },
    });
    if (consumed.count !== 1) {
      throw new AppError('This reset link is invalid or has already been used', 400);
    }

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        artist: { include: { passport: true, wallet: true } },
        studio_staff: true,
        producer: { include: { passport: true } },
      },
    });

    const outcome = await beginSession(updated, req);
    if (outcome.mfaRequired) return res.json(outcome.body);
    res.json({ token: outcome.token, user: sanitizeUser(updated) });
  } catch (err) {
    next(err);
  }
}

function sanitizeUser(user: any) {
  const { password_hash, mfa_secret_encrypted, ...safe } = user;
  return safe;
}
