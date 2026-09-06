import { Router } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { resolveStaffStudio } from '../middleware/studioScope.middleware';
import {
  outstandingPayableUsd,
  reserveStudioPayout,
  releaseFailedPayout,
  markPayoutPaid,
} from '../lib/studioPayout';

// Money leaving OIANO. STUDIO_PAYABLE accrued from the first booking and had no
// way out; this is that way out.
//
// Every route here is scoped to the caller's own studio via resolveStaffStudio —
// a studio admin can only see and settle their own balance, never another
// studio's, and the studio id is never taken from the request.
export const payoutsRouter = Router();
payoutsRouter.use(authenticate);

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new AppError('Stripe is not configured', 503);
  return new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
}

// GET /api/payouts/balance — what OIANO currently owes this studio, and whether
// it can be received yet. Read straight from the ledger; nothing is cached.
payoutsRouter.get('/balance', requireRole('STUDIO_ADMIN'), async (req: any, res, next) => {
  try {
    const studio = await resolveStaffStudio(req.userId);
    const [outstanding, pending] = await Promise.all([
      outstandingPayableUsd(studio.id),
      prisma.studioPayout.count({ where: { studio_id: studio.id, status: 'PENDING' } }),
    ]);
    res.json({
      studio_id: studio.id,
      currency: studio.currency,
      outstanding_usd: outstanding,
      pending_payouts: pending,
      payouts_enabled: Boolean(studio.stripe_account_id),
    });
  } catch (error) { next(error); }
});

// GET /api/payouts — this studio's settlement history.
payoutsRouter.get('/', requireRole('STUDIO_ADMIN'), async (req: any, res, next) => {
  try {
    const studio = await resolveStaffStudio(req.userId);
    const payouts = await prisma.studioPayout.findMany({
      where: { studio_id: studio.id },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    res.json(payouts);
  } catch (error) { next(error); }
});

// POST /api/payouts/connect — begin Stripe Connect onboarding so this studio can
// be paid. Returns the hosted onboarding URL; the account id is stored now and
// only becomes usable once Stripe reports the account as payout-ready.
payoutsRouter.post('/connect', requireRole('STUDIO_ADMIN'), async (req: any, res, next) => {
  try {
    const studio = await resolveStaffStudio(req.userId);
    const stripe = getStripe();

    let accountId = studio.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        metadata: { studio_id: studio.id },
      });
      accountId = account.id;
      await prisma.studio.update({ where: { id: studio.id }, data: { stripe_account_id: accountId } });
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.FRONTEND_URL}/admin/payouts`,
      return_url: `${process.env.FRONTEND_URL}/admin/payouts`,
      type: 'account_onboarding',
    });
    res.json({ url: link.url });
  } catch (error) { next(error); }
});

// POST /api/payouts — settle the outstanding balance.
//
// Order matters and is deliberate. The balance is reserved in the ledger first,
// inside a transaction with the payout row, so a second concurrent request finds
// nothing left to pay. Only then is the transfer attempted. If the rail refuses,
// the reservation is released with a compensating entry rather than by editing
// the original transaction.
payoutsRouter.post('/', requireRole('STUDIO_ADMIN'), async (req: any, res, next) => {
  try {
    const studio = await resolveStaffStudio(req.userId);
    if (!studio.stripe_account_id) {
      throw new AppError('Connect a payout account before requesting a payout', 409);
    }

    const { payout, outstanding, connectAccountId } = await reserveStudioPayout({
      studioId: studio.id,
      requestedBy: req.userId,
    });

    try {
      const stripe = getStripe();
      const transfer = await stripe.transfers.create(
        {
          amount: Math.round(outstanding * 100),
          currency: (payout.currency ?? 'USD').toLowerCase(),
          destination: connectAccountId!,
          metadata: { payout_id: payout.id, studio_id: studio.id },
        },
        // The payout id is the idempotency key, so a retried request cannot
        // transfer twice even if this process dies between call and response.
        { idempotencyKey: `oiano-payout-${payout.id}` },
      );
      const paid = await markPayoutPaid(payout.id, transfer.id);
      res.status(201).json(paid);
    } catch (transferError: any) {
      // The money never left. Put it back where the ledger can see it.
      await releaseFailedPayout(payout.id, transferError?.message ?? 'Transfer failed');
      throw new AppError('Payout could not be completed; the balance remains payable', 502);
    }
  } catch (error) { next(error); }
});
