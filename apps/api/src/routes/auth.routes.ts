// apps/api/src/routes/auth.routes.ts
import { Router } from 'express';
import { signup, login, enter, getMe, verifyMfa, forgotPassword, resetPassword } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';

export const authRouter = Router();

// Sign-in traffic is anonymous by definition, so it cannot be counted per caller
// the way the rest of the API is (lib/rateLimitKey.ts). Counted per address
// alone, a studio or an event venue gets one person's budget and the room locks
// itself out at the door. So an account keeps the tight budget that stops a
// password being guessed, and the address keeps a wider one of its own: guessing
// one account from one machine is still ten attempts a minute, while a shared
// address now has room for everyone else behind it.
const attemptsPerAccount = rateLimit({
  max: 10, windowMs: 60_000,
  message: 'Too many login attempts — wait a minute and try again.',
  // Scoped to the address as well as the account, so nobody can lock someone out
  // of their own account by guessing at it from somewhere else. A request that
  // names no account (an MFA challenge, a reset token) is counted by address, as
  // every auth route was before.
  key: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const address = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    return email ? `ip:${address}|account:${email}` : `ip:${address}`;
  },
});
const attemptsPerAddress = rateLimit({
  max: 120, windowMs: 60_000,
  message: 'Too many sign-in attempts from this network — wait a minute and try again.',
});

authRouter.post('/signup', attemptsPerAddress, attemptsPerAccount, signup);
authRouter.post('/login',  attemptsPerAddress, attemptsPerAccount, login);
authRouter.post('/mfa/verify', attemptsPerAddress, attemptsPerAccount, verifyMfa);
authRouter.post('/enter',  attemptsPerAddress, attemptsPerAccount, enter);
authRouter.post('/forgot-password', attemptsPerAddress, attemptsPerAccount, forgotPassword);
authRouter.post('/reset-password',  attemptsPerAddress, attemptsPerAccount, resetPassword);
authRouter.get('/me', authenticate, getMe);
