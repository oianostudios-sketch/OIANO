/**
 * Lightweight in-process rate limiter — no external dependency.
 * Uses a sliding-window counter keyed by IP address.
 *
 * Usage:
 *   router.post('/login', rateLimit({ max: 10, windowMs: 60_000 }), handler);
 */
import { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  /** Max requests allowed within windowMs. Default 10. */
  max?: number;
  /** Window length in ms. Default 60 000 (1 min). */
  windowMs?: number;
  /** Message sent when limit is exceeded. */
  message?: string;
}

interface Counter {
  count: number;
  resetAt: number;
}

// One store per rate-limit instance so separate limiters don't share counts
function createStore() {
  const store = new Map<string, Counter>();

  // Prune stale entries every 5 minutes to avoid unbounded memory growth
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of store.entries()) {
      if (val.resetAt <= now) store.delete(key);
    }
  }, 5 * 60_000).unref();

  return store;
}

export function rateLimit(opts: RateLimitOptions = {}) {
  const max       = opts.max       ?? 10;
  const windowMs  = opts.windowMs  ?? 60_000;
  const message   = opts.message   ?? 'Too many requests — please try again later.';
  const store     = createStore();

  return (req: Request, res: Response, next: NextFunction) => {
    // Prefer X-Forwarded-For when behind a proxy, fall back to socket IP
    const ip  = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
             ?? req.socket?.remoteAddress
             ?? 'unknown';

    const now = Date.now();
    let entry = store.get(ip);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 1, resetAt: now + windowMs };
      store.set(ip, entry);
    } else {
      entry.count += 1;
    }

    // Expose standard rate-limit headers
    res.setHeader('X-RateLimit-Limit',     max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset',     Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: message });
    }

    next();
  };
}
