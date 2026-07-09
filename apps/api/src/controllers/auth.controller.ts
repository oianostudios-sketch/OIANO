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

// POST /api/auth/signup
export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const data = SignupSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError('Email already in use', 409);

    const password_hash = await bcrypt.hash(data.password, 10);
    const role = data.role ?? 'ARTIST';
    const name = data.name?.trim() || data.email.split('@')[0];

    // Only generate a passport code for artists (not needed for producers at signup)
    const passportCode = role === 'ARTIST' ? await generatePassportCode() : null;

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
                  passport_code: passportCode!,
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
                  passport_code: `PROD-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
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

    const token = signToken(user.id, user.role);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    next(err)

  }
}

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
