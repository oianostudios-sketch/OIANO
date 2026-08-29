// apps/api/src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { captureError } from '../lib/sentry';

// One structured JSON line per error, covering every branch below (not just
// the unhandled-500 case) — DIAG-01/03: a failed request should be
// reconstructable from logs alone (timestamp, request id, route, status,
// caller) without secrets. request-scoped context comes from requestId
// middleware + auth.middleware, both of which run before this handler.
function logError(req: Request, statusCode: number, message: string, err: unknown) {
  const line = {
    timestamp: new Date().toISOString(),
    requestId: (req as any).requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    userId: (req as any).userId,
    userRole: (req as any).userRole,
    studioId: (req as any).studioId,
    message,
    stack: statusCode >= 500 && err instanceof Error ? err.stack : undefined,
  };
  console.error(JSON.stringify(line));
  // Only genuine 5xx failures — a validation error or a 404 isn't an
  // incident, it's normal request handling and would just be noise.
  if (statusCode >= 500) captureError(err);
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    const message = 'Validation error';
    logError(req, 400, message, err);
    return res.status(400).json({
      error: message,
      issues: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
      requestId: (req as any).requestId,
    });
  }

  if (err instanceof AppError) {
    logError(req, err.statusCode, err.message, err);
    return res.status(err.statusCode).json({ error: err.message, requestId: (req as any).requestId });
  }

  logError(req, 500, 'Internal server error', err);
  res.status(500).json({ error: 'Internal server error', requestId: (req as any).requestId });
}
