import jwt from 'jsonwebtoken';

/**
 * Who a rate limit counts.
 *
 * Counting by address alone rations a whole building to one budget: a studio, an
 * office or an event venue reaches the API from a single public address, so fifty
 * people signing in share the ten attempts meant for one. A request that carries
 * an identity is counted against that identity instead, and only an anonymous one
 * falls back to its address.
 *
 * The token is verified, not merely decoded. An unverified `sub` would let anyone
 * mint themselves a fresh budget by inventing a subject, which is worse than
 * counting by address.
 */
export function rateLimitKey(input: { authorization?: string; address: string; secret?: string }): string {
  const header = input.authorization ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (bearer && input.secret) {
    try {
      const claims = jwt.verify(bearer, input.secret);
      const subject = typeof claims === 'object' && claims ? (claims as { sub?: unknown }).sub : undefined;
      if (typeof subject === 'string' && subject) return `user:${subject}`;
    } catch {
      // Expired, forged, or signed with another secret: counted by address, like
      // any other caller who cannot prove who they are.
    }
  }
  return `ip:${input.address}`;
}
