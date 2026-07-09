import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { validateEnv } from './lib/env';
import { errorHandler } from './middleware/error.middleware';
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
import { artistReviewRouter } from './routes/artist-review.routes';
import { discoverRouter } from './routes/discover.routes';
import { statsRouter } from './routes/stats.routes';
import { pulseRouter } from './routes/pulse.routes';
import { producerRouter } from './routes/producer.routes';
import { connectRouter } from './routes/connect.routes';

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

validateEnv();

const app = express();
const allowedOrigins = new Set([
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
].filter(Boolean));

// In dev, also allow any device on the local network hitting the Vite dev
// server ports (e.g. an iPad in the control room at http://192.168.x.x:5173).
// Vite's `host: '0.0.0.0'` makes it reachable this way; without this, every
// non-localhost origin gets rejected and logs a CORS error per request.
const LAN_DEV_ORIGIN = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):(5173|5174|5175)$/;

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

// Static uploads — local disk fallback for dev (R2 replaces this in production)
// When R2_ACCOUNT_ID is set, files are served directly from R2's public URL
// and this route is unused for new uploads. Kept for backwards-compatibility
// with any files uploaded before R2 was configured.
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Raw body for Stripe — must be before express.json()
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), studio: 'dreamz-music-lab' });
});

app.use('/api/auth',                     authRouter);
app.use('/api/passport',                 passportRouter);
app.use('/api/passport/stats',           statsRouter);
app.use('/api/studio',                   studioRouter);
app.use('/api/studio/pulse',             pulseRouter);
app.use('/api/availability',             availabilityRouter);
app.use('/api/bookings',                 bookingsRouter);
app.use('/api/bookings/:id/messages',    messagesRouter);
app.use('/api/bookings/:id/artist-review', artistReviewRouter);
app.use('/api/payments',                 paymentsRouter);
app.use('/api/admin',                    creditRequestRouter);
app.use('/api/admin',                    adminRouter);
app.use('/api/artists/discover',         discoverRouter);  // must be before /:id catch-all
app.use('/api/artists',                  artistsRouter);
app.use('/api/artists',                  filesRouter);
app.use('/api/webhooks',                 webhooksRouter);
app.use('/api/studio-clock',             studioClockRouter);
app.use('/api/notifications',            notificationsRouter);
app.use('/api/engineers',                engineersRouter);
app.use('/api/bookings',                 cardRouter);
app.use('/api/producer',                 producerRouter);
app.use('/api/connect',                  connectRouter);

app.use(errorHandler);

export { app };
