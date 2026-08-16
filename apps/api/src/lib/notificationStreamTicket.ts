import jwt from 'jsonwebtoken';
import { AppError } from './errors';

const ISSUER = 'oiano-api';
const AUDIENCE = 'oiano-notification-stream';

export function issueNotificationStreamTicket(userId: string) {
  return jwt.sign(
    { sub: userId, purpose: 'notification-stream' },
    process.env.JWT_SECRET!,
    { expiresIn: '60s', issuer: ISSUER, audience: AUDIENCE },
  );
}

export function verifyNotificationStreamTicket(ticket: string) {
  try {
    const payload = jwt.verify(ticket, process.env.JWT_SECRET!, { issuer: ISSUER, audience: AUDIENCE }) as jwt.JwtPayload;
    if (payload.purpose !== 'notification-stream' || typeof payload.sub !== 'string') throw new Error('Invalid purpose');
    return payload.sub;
  } catch {
    throw new AppError('Invalid stream ticket', 401);
  }
}
