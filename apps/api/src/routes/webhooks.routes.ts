import { Router } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { sendReceiptEmail } from '../services/email.service';
import { broadcastToUser } from './notifications.routes';
import { Prisma } from '@prisma/client';

export const webhooksRouter = Router();

webhooksRouter.post('/stripe', async (req, res, next) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const event = constructEvent(rawBody, req.header('Stripe-Signature'));

    try {
      await prisma.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return res.json({ received: true, duplicate: true });
      }
      throw err;
    }

    try {
      switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'checkout.session.async_payment_failed':
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as any);
        break;

      case 'charge.refunded':
        await handleRefund(event.data.object as Stripe.Charge);
        break;

      default:
        break;
      }

      await prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: { status: 'COMPLETED', processed_at: new Date() },
      });
    } catch (err) {
      await prisma.stripeWebhookEvent.delete({ where: { id: event.id } }).catch(() => undefined);
      throw err;
    }

    res.json({ received: true });
  } catch (err) { next(err); }
});

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const type = session.metadata?.type;
  if (type === 'wallet_topup') {
    await handleWalletTopUp(session);
  } else {
    await handleBookingPayment(session);
  }
}

async function handleBookingPayment(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId) return;

  const booking = await prisma.booking.findUnique({
    where:   { id: bookingId },
    include: {
      payment:  true,
      service:  true,
      room:     true,
      engineer: true,
      artist:   { include: { wallet: true, user: true } },
    },
  });
  if (!booking) return;

  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : (session.payment_intent as any)?.id ?? null;

  const applied = await prisma.$transaction(async (tx) => {
    // 1. Update payment — store payment_intent_id for reliable future matching
    const claimed = await tx.payment.updateMany({
      where: { booking_id: bookingId, status: { not: 'PAID' } },
      data: {
        provider_ref:      session.id,
        payment_intent_id: paymentIntentId,
        status:            'PAID',
        paid_at:           new Date(),
      },
    });
    if (claimed.count === 0) return false;

    // 2. Confirm booking
    await tx.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } });

    // Stripe payments do not mutate the studio-credit wallet ledger.
    // In-app notification
    if (booking.artist?.user_id) {
      await tx.notification.create({
        data: {
          user_id: booking.artist.user_id,
          title:   'Booking confirmed',
          body:    'Your session has been confirmed and payment received.',
          type:    'BOOKING_CONFIRMED',
        },
      });
    }
    return true;
  });

  if (!applied) return;

  // 5. Email receipt — outside transaction, non-fatal
  if (booking.artist?.user?.email) {
    sendReceiptEmail(booking.artist.user.email, booking as any).catch((e) =>
      console.error('[email] receipt failed:', e?.message),
    );
  }
}

async function handleWalletTopUp(session: Stripe.Checkout.Session) {
  const walletId = session.metadata?.wallet_id;
  if (!walletId) return;

  const amount = Number(session.amount_total ?? 0) / 100;
  if (!amount) return;

  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : null;

  // Mark top-up record paid
  const wallet = await prisma.$transaction(async (tx) => {
    const claimed = await tx.walletTopUp.updateMany({
      where: { wallet_id: walletId, provider_ref: session.id, status: 'PENDING' },
      data: { status: 'PAID', payment_intent_id: paymentIntentId },
    });
    if (claimed.count === 0) return null;

    // Credit wallet atomically
    const credited = await tx.wallet.update({
      where: { id: walletId },
      data:  { balance_usd: { increment: amount } },
      include: { artist: { include: { user: true } } },
    });

    await tx.walletTransaction.create({
      data: {
        wallet_id: walletId,
        amount_usd: amount,
        type: 'credit',
        description: `Stripe top-up ${session.id.slice(-8).toUpperCase()} - $${amount}`,
      },
    });
    return credited;
  });

  if (!wallet) return;

  if (wallet.artist?.user_id) {
    await prisma.notification.create({
      data: {
        user_id: wallet.artist.user_id,
        title:   `$${amount} added to your wallet`,
        body:    `Studio credits ready. New balance: $${Number(wallet.balance_usd).toFixed(2)}`,
        type:    'PAYMENT_CONFIRMED',
      },
    });
    // Real-time push so dashboard balance refreshes without polling
    broadcastToUser(wallet.artist.user_id, {
      type:       'wallet_updated',
      newBalance: Number(wallet.balance_usd),
      delta:      amount,
    });
  }

  // Send top-up confirmation email (fire-and-forget)
  const artistEmail = wallet.artist?.user?.email;
  const newBalance  = Number(wallet.balance_usd);
  if (artistEmail) {
    const { sendTopUpEmail } = await import('../services/email.service');
    sendTopUpEmail(artistEmail, amount, newBalance).catch((e) =>
      console.error('[email] top-up confirmation failed:', e?.message),
    );
  }
}

async function handlePaymentFailed(obj: any) {
  // Match by payment_intent_id — reliable, not fuzzy amount
  const paymentIntentId: string | null =
    obj.payment_intent ?? (obj.object === 'payment_intent' ? obj.id : null);
  if (!paymentIntentId) return;

  const payment = await prisma.payment.findFirst({
    where:   { payment_intent_id: paymentIntentId },
    include: { booking: { include: { artist: true } } },
  });
  if (!payment) return;

  await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });

  if (payment.booking.artist?.user_id) {
    await prisma.notification.create({
      data: {
        user_id: payment.booking.artist.user_id,
        title:   'Payment failed',
        body:    'Your payment could not be processed. Please retry or contact the studio.',
        type:    'PAYMENT_FAILED',
      },
    });
  }
}

async function handleRefund(charge: Stripe.Charge) {
  const paymentIntentId = charge.payment_intent as string | null;
  if (!paymentIntentId) return;

  const payment = await prisma.payment.findFirst({
    where: { payment_intent_id: paymentIntentId, status: 'PAID' },
  });
  if (!payment) return;

  await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
}

// ── Stripe event construction ─────────────────────────────────────────────────

function constructEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new AppError('Stripe webhook secret not configured', 503);
  if (!signature) throw new AppError('Missing Stripe-Signature header', 400);

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-06-24.dahlia' });
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err: any) {
    throw new AppError(`Webhook signature verification failed: ${err.message}`, 400);
  }
}
