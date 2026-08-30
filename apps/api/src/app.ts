import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { validateEnv } from './lib/env';
import { prisma } from './lib/prisma';
import { initSentry } from './lib/sentry';
import { errorHandler } from './middleware/error.middleware';
import { requestId } from './middleware/requestId.middleware';
import { accessLog } from './middleware/accessLog.middleware';
import { rateLimit } from './middleware/rateLimit.middleware';
import { authRouter } from './routes/auth.routes';
import { passportRouter } from './routes/passport.routes';
import { studioRouter } from './routes/studio.routes';
import { availabilityRouter } from './routes/availability.routes';
import { bookingsRouter } from './routes/bookings.routes';
import { paymentsRouter } from './routes/payments.routes';
import { adminRouter, creditRequestRouter } from './routes/admin.routes';
import { artistsRouter } from './routes/artists.routes';
import { webhooksRouter } from './routes/webhooks.routes';
import { studioClockRouter } from './routes/studio-clock.routes';
import { filesRouter } from './routes/files.routes';
import { notificationsRouter } from './routes/notifications.routes';
import { engineersRouter } from './routes/engineers.routes';
import { cardRouter } from './routes/card.routes';
import { messagesRouter } from './routes/messages.routes';
import { projectMessagesRouter } from './routes/project-messages.routes';
import { artistReviewRouter } from './routes/artist-review.routes';
import { discoverRouter } from './routes/discover.routes';
import { statsRouter } from './routes/stats.routes';
import { pulseRouter } from './routes/pulse.routes';
import { producerRouter } from './routes/producer.routes';
import { connectRouter } from './routes/connect.routes';
import { artistProjectsRouter } from './routes/artist-projects.routes';
import { artistActivityRouter } from './routes/artist-activity.routes';
import { maintenanceRouter } from './routes/maintenance.routes';
import { facilitiesRouter } from './routes/facilities.routes';
import { networkExchangeRouter } from './routes/network-exchange.routes';
import { studioCircleRouter } from './routes/studio-circle.routes';
import { feedbackRouter } from './routes/feedback.routes';
import { networkMetricsRouter } from './routes/network-metrics.routes';
import { networkPulseRouter } from './routes/network-pulse.routes';
import { contributionsRouter } from './routes/contributions.routes';
import { studioPolicyRouter } from './routes/studio-policy.routes';

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: process.env.NODE_ENV !== 'test' });

validateEnv();
initSentry();

const app = express();
const developmentOrigins = process.env.NODE_ENV === 'production' ? [] : [
  'http://localhost:3000', 'http://localhost:3001',
  'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
  'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:5175',
];
const allowedOrigins = new Set([process.env.FRONTEND_URL, ...developmentOrigins].filter(Boolean));

// In dev, also allow any device on the local network hitting the Vite dev
// server ports (e.g. an iPad in the control room at http://192.168.x.x:5173).
// Vite's `host: '0.0.0.0'` makes it reachable this way; without this, every
// non-localhost origin gets rejected and logs a CORS error per request.
const LAN_DEV_ORIGIN = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):(5173|5174|5175)$/;

app.use(requestId);
app.use(accessLog);
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    if (process.env.NODE_ENV !== 'production' && LAN_DEV_ORIGIN.test(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true,
}));

// Coarse, generous safety net for every route not already covered by its own
// tighter limiter (e.g. bookings.routes.ts's create-booking/AI limiters) —
// a burst of concurrent traffic (a live event, a scripted retry storm)
// shouldn't be able to take the whole process down through an endpoint
// nobody thought to protect individually.
app.use(rateLimit({ max: 300, windowMs: 60_000, message: 'Too many requests — please slow down.' }));

// Static uploads — local disk fallback for dev (R2 replaces this in production)
// When R2_ACCOUNT_ID is set, files are served directly from R2's public URL
// and this route is unused for new uploads. Kept for backwards-compatibility
// with any files uploaded before R2 was configured.
//
// Helmet's default Cross-Origin-Resource-Policy: same-origin blocks <img>
// tags from ever rendering these — the frontend (5173) and API (4000) are
// different origins. Confirmed live: fetch() could read the bytes fine,
// but new Image() failed to load, for every uploaded avatar. Relaxed only
// for this route; the rest of the API keeps Helmet's stricter defaults.
app.use('/uploads', (_req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(process.cwd(), 'uploads')));

// Raw body for Stripe — must be before express.json()
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());

// SCALE_READINESS_ROADMAP.md Tier 0.5 — previously this was a static
// liveness check only; it would report "ok" even with Postgres unreachable.
// Now it actually proves the one dependency that matters most.
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'oiano-api', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString(), database: 'unreachable' });
  }
});

app.use('/api/auth',                     authRouter);
app.use('/api/passport',                 passportRouter);
app.use('/api/passport/stats',           statsRouter);
app.use('/api/studio/pulse',             pulseRouter);
app.use('/api/studio',                   studioRouter);
app.use('/api/studio-policies',          studioPolicyRouter);
app.use('/api/availability',             availabilityRouter);
app.use('/api/bookings',                 bookingsRouter);
app.use('/api/bookings/:id/messages',    messagesRouter);
app.use('/api/projects/:id/messages',    projectMessagesRouter);
app.use('/api/bookings/:id/artist-review', artistReviewRouter);
app.use('/api/payments',                 paymentsRouter);
app.use('/api/admin',                    creditRequestRouter);
app.use('/api/admin',                    adminRouter);
app.use('/api/artists/discover',         discoverRouter);  // must be before /:id catch-all
// filesRouter must be mounted before artistsRouter: artistsRouter.use(authenticate)
// is a blanket, path-unrestricted middleware, so if it ran first it would
// intercept filesRouter's ticket-only GET .../content route (which must be
// reachable without a Bearer header) before filesRouter ever got to match it.
app.use('/api/artists',                  filesRouter);
app.use('/api/artists',                  artistsRouter);
app.use('/api/webhooks',                 webhooksRouter);
app.use('/api/studio-clock',             studioClockRouter);
app.use('/api/notifications',            notificationsRouter);
app.use('/api/network-exchange',          networkExchangeRouter);
app.use('/api/network-metrics',           networkMetricsRouter);
app.use('/api/network',                   networkPulseRouter);
app.use('/api/contributions',             contributionsRouter);
app.use('/api/feedback',                  feedbackRouter);
app.use('/api/studio-circle',             studioCircleRouter);
app.use('/api/engineers',                engineersRouter);
app.use('/api/bookings',                 cardRouter);
app.use('/api/producer',                 producerRouter);
app.use('/api/connect',                  connectRouter);
app.use('/api/artist-projects',          artistProjectsRouter);
app.use('/api/artist-activity',          artistActivityRouter);
app.use('/api/maintenance',              maintenanceRouter);
app.use('/api/facilities',               facilitiesRouter);

app.use(errorHandler);

export { app };
