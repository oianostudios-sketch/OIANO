import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

// Attaches a short-lived, per-request correlation id so a failure logged by
// error.middleware.ts can be tied back to the exact request that caused it
// (DIAG-03: "a failed operation can be reconstructed"). Echoed back as a
// response header so a bug report ("it happened around 2:14pm") can be
// matched to a specific log line if the tester includes it, without logging
// anything sensitive.
export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = randomUUID();
  (req as any).requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
