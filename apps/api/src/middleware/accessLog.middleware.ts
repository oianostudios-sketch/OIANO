// apps/api/src/middleware/accessLog.middleware.ts
import { Request, Response, NextFunction } from 'express';

// error.middleware.ts logs every failed request as structured JSON — but
// only failures. During a live event, normal traffic (which is most of it)
// produces zero log output, so there's no way to tell "quiet" from "down."
// One line per request, same JSON shape, deliberately minimal: no log
// aggregation service, just console lines tailable from Render's log stream
// for the duration of the event.
export function accessLog(req: Request, res: Response, next: NextFunction) {
  // Under NODE_ENV=test every request is a fixture. One line per success was
  // about 60% of a green integration run's output, burying the assertions a
  // reader (or an agent paying per token) actually needs. Failures still log
  // with full detail through error.middleware.ts, including the ones tests
  // provoke on purpose.
  if (process.env.NODE_ENV === 'test') return next();

  const startedAt = Date.now();

  res.on('finish', () => {
    // error.middleware.ts already logs failures with full detail (message,
    // stack) — skip those here to avoid a duplicate, noisier line per error.
    if (res.statusCode >= 400) return;

    const line = {
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: (req as any).userId,
      studioId: (req as any).studioId,
    };
    console.log(JSON.stringify(line));
  });

  next();
}
