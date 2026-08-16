import jwt from 'jsonwebtoken';
import { AppError } from './errors';

// Mirrors notificationStreamTicket.ts: a short-lived, purpose-bound ticket so
// a file's content route can be reached via a plain URL (needed for <a href>/
// window.open, which can't carry an Authorization header) without ever
// exposing the underlying storage URL (R2 bucket URL or local disk path) to
// the client. The ticket is scoped to one specific fileId, not just the
// caller's identity, so a stolen ticket can't be replayed against other files.
const ISSUER = 'oiano-api';
const AUDIENCE = 'oiano-file-access';

export function issueFileAccessTicket(userId: string, fileId: string) {
  return jwt.sign(
    { sub: userId, fileId, purpose: 'file-access' },
    process.env.JWT_SECRET!,
    { expiresIn: '60s', issuer: ISSUER, audience: AUDIENCE },
  );
}

export function verifyFileAccessTicket(ticket: string, fileId: string) {
  try {
    const payload = jwt.verify(ticket, process.env.JWT_SECRET!, { issuer: ISSUER, audience: AUDIENCE }) as jwt.JwtPayload;
    if (payload.purpose !== 'file-access' || payload.fileId !== fileId || typeof payload.sub !== 'string') {
      throw new Error('Invalid purpose or file mismatch');
    }
    return payload.sub;
  } catch {
    throw new AppError('Invalid or expired file access ticket', 401);
  }
}
