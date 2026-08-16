// apps/api/src/routes/auth.routes.ts
import { Router } from 'express';
import { signup, login, enter, getMe, verifyMfa } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';

export const authRouter = Router();

// 10 attempts per minute per IP — blocks brute-force without disrupting real users
const authLimiter = rateLimit({ max: 10, windowMs: 60_000, message: 'Too many login attempts — wait a minute and try again.' });

authRouter.post('/signup', authLimiter, signup);
authRouter.post('/login',  authLimiter, login);
authRouter.post('/mfa/verify', authLimiter, verifyMfa);
authRouter.post('/enter',  authLimiter, enter);
authRouter.get('/me', authenticate, getMe);
