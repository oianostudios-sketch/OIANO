import { Router } from 'express';
import Stripe from 'stripe';
import { authenticate } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';

export const paymentsRouter = Router();
paymentsRouter.use(authenticate);

const TOP_UP_PRESETS = [50, 100, 200, 500];
const TOP_UP_MIN = 10;
const TOP_UP_MAX = 5000;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new AppError('Stripe is not configured', 503);
  return new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
}

// ── POST /api/payments/stripe/checkout-session ────────────────────────────────
// Artist pays for a booking via Stripe checkout
paymentsRouter.post('/stripe/checkout-session', async (req: any, res, next) => {
  try {
    const { booking_id } = req.body;
    if (!booking_id) throw new AppError('booking_id is required', 400);

    const booking = await prisma.booking.findUnique({
      where: { id: booking_id },
      include: { service: true, artist: { include: { user: true } }, payment: true },
    });
    if (!booking) throw new AppError('Booking not found', 404);
    if (booking.payment?.status === 'PAID') throw new AppError('Booking is already paid', 400);

    const stripe = getStripe();
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const amountCents = Math.round(Number(booking.total_usd) * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: booking.artist?.user?.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: booking.service?.name ?? 'Studio Session',
              description: `Booking ${booking.id.slice(0, 8).toUpperCase()} — Dreamz Music Lab`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        type:       'booking_payment',
        booking_id: booking.id,
        artist_id:  booking.artist_id,
      },
      success_url: `${frontendUrl}/bookings/${booking.id}?payment=success`,
      cancel_url:  `${frontendUrl}/bookings/${booking.id}?payment=cancelled`,
    });

    // Upsert Payment record — store checkout session id immediately
    await prisma.payment.upsert({
      where:  { booking_id },
      create: {
        booking_id,
        provider:     'stripe',
        provider_ref: session.id,
        amount_usd:   booking.total_usd,
        status:       'PROCESSING',
      },
      update: {
        provider_ref: session.id,
        status:       'PROCESSING',
      },
    });

    res.json({ checkout_url: session.url, booking_id, session_id: session.id });
  } catch (err) { next(err); }
});

// ── POST /api/payments/wallet/top-up ─────────────────────────────────────────
// Artist tops up their wallet via Stripe checkout
paymentsRouter.post('/wallet/top-up', async (req: any, res, next) => {
  try {
    const userId = req.userId as string;
    const { amount_usd } = req.body;

    const amt = Math.round(Number(amount_usd) * 100) / 100; // round to cents
    if (isNaN(amt) || amt < TOP_UP_MIN || amt > TOP_UP_MAX) {
      throw new AppError(`Amount must be between $${TOP_UP_MIN} and $${TOP_UP_MAX}`, 400);
    }

    const artist = await prisma.artist.findUnique({
      where: { user_id: userId },
      include: { wallet: true, user: true },
    });
    if (!artist?.wallet) throw new AppError('Wallet not found', 404);

    const stripe = getStripe();
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: artist.user?.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency:   'usd',
            unit_amount: amt * 100,
            product_data: {
              name:        `Dreamz Music Lab — Studio Credits`,
              description: `$${amt} added to your studio wallet`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        type:      'wallet_topup',
        wallet_id: artist.wallet.id,
        artist_id: artist.id,
        user_id:   userId,
      },
      success_url: `${frontendUrl}/dashboard?topup=success&amount=${amt}`,
      cancel_url:  `${frontendUrl}/dashboard?topup=cancelled`,
    });

    // Record pending top-up
    await prisma.walletTopUp.create({
      data: {
        wallet_id:   artist.wallet.id,
        provider_ref: session.id,
        amount_usd:  amt,
        status:      'PENDING',
      },
    });

    res.json({ checkout_url: session.url, session_id: session.id });
  } catch (err) { next(err); }
});

// ── GET /api/payments/wallet/transactions ─────────────────────────────────────
// Artist views their wallet ledger
paymentsRouter.get('/wallet/transactions', async (req: any, res, next) => {
  try {
    const userId = req.userId as string;
    const artist = await prisma.artist.findUnique({
      where: { user_id: userId },
      include: { wallet: { include: { transactions: { orderBy: { created_at: 'desc' }, take: 50 }, top_ups: { orderBy: { created_at: 'desc' }, take: 20 } } } },
    });
    if (!artist?.wallet) throw new AppError('Wallet not found', 404);

    res.json({
      balance_usd:  Number(artist.wallet.balance_usd),
      transactions: artist.wallet.transactions,
      top_ups:      artist.wallet.top_ups,
    });
  } catch (err) { next(err); }
});
