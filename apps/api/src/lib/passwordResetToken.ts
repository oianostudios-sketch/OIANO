import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AppError } from './errors';

const ISSUER = 'oiano-api';
const AUDIENCE = 'oiano-password-reset';

// A fingerprint of the current password_hash, not the hash itself — embedding
// it in the token means the token stops verifying the moment the password
// actually changes, giving stateless single-use semantics with no DB table
// and no separate revocation list to maintain.
function fingerprint(passwordHash: string): string {
  return crypto.createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

export function issuePasswordResetToken(userId: string, currentPasswordHash: string): string {
  return jwt.sign(
    { sub: userId, purpose: 'password-reset', pwv: fingerprint(currentPasswordHash) },
    process.env.JWT_SECRET!,
    { expiresIn: '30m', issuer: ISSUER, audience: AUDIENCE },
  );
}

export function verifyPasswordResetToken(token: string): { userId: string; passwordVersion: string } {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!, { issuer: ISSUER, audience: AUDIENCE }) as jwt.JwtPayload;
    if (payload.purpose !== 'password-reset' || typeof payload.sub !== 'string' || typeof payload.pwv !== 'string') {
      throw new Error('Invalid purpose');
    }
    return { userId: payload.sub, passwordVersion: payload.pwv };
  } catch {
    throw new AppError('This reset link is invalid or has expired', 400);
  }
}

export function passwordVersionMatches(currentPasswordHash: string, tokenPasswordVersion: string): boolean {
  return fingerprint(currentPasswordHash) === tokenPasswordVersion;
}
