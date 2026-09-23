/**
 * Lightweight in-process rate limiter — no external dependency.
 * Uses a sliding-window counter keyed by caller (lib/rateLimitKey.ts).
 *
 * Usage:
 *   router.post('/login', rateLimit({ max: 10, windowMs: 60_000 }), handler);
 *
 * The store lives in this process, so with more than one API instance each
 * enforces its own share of the budget (SCALE_READINESS_ROADMAP.md Tier 1.2).
 */
import { Request, Response, NextFunction } from 'express';
import { rateLimitKey } from '../lib/rateLimitKey';

interface RateLimitOptions {
  /** Max requests allowed within windowMs. Default 10. */
  max?: number;
  /** Window length in ms. Default 60 000 (1 min). */
  windowMs?: number;
  /** Message sent when limit is exceeded. */
  message?: string;
  /**
   * What to count this request against. Defaults to the caller: their identity
   * when the request proves one, their address when it does not. A route whose
   * callers are all anonymous can narrow it further — see auth.routes.ts, which
   * counts sign-in attempts per account as well as per address.
   */
  key?: (req: Request) => string;
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
  // Express resolves req.ip against the trust-proxy setting in app.ts, so the
  // address is the one the proxy reports rather than a header the caller wrote.
  const keyFor    = opts.key ?? ((req: Request) => rateLimitKey({
    authorization: req.headers.authorization,
    address: req.ip ?? req.socket?.remoteAddress ?? 'unknown',
    secret: process.env.JWT_SECRET,
  }));

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyFor(req);
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 1, resetAt: now + windowMs };
      store.set(key, entry);
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
