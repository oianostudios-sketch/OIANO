import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { AppError } from './errors';
import { postFinancialTransaction } from './financialLedger';
import { emitActivityEvent } from './activityEvents';

function money(value: number) { return Math.round(value * 100) / 100; }

// Booking payments, refunds and top-ups post to the ledger in USD, and every
// amount is held as amount_usd. Payouts used to take their currency from the
// studio instead, so a studio pricing in euros would have been sent its dollar
// balance labelled as euros. Until amounts carry their own currency (the owner's
// decision of 2026-09-12), a studio is owed, and paid, in the currency the money
// was earned in: USD.
export const PAYABLE_CURRENCY = 'USD';

export interface StudioPayable {
  /** What OIANO owes the studio, in USD. */
  amountUsd: number;
  /** Other currencies this studio's payable has entries in; they must be reconciled before a payout. */
  otherCurrencies: string[];
}

// What OIANO still owes a studio, read from the ledger rather than a cached
// balance. STUDIO_PAYABLE is CREDITed when a booking is paid and DEBITed when it
// is refunded or paid out, so the outstanding amount is credits minus debits.
// Each entry counts in the currency its transaction was posted in, and amounts in
// different currencies are never added together.
export async function studioPayable(
  studioId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<StudioPayable> {
  const entries = await db.financialLedgerEntry.findMany({
    where: { account_code: 'STUDIO_PAYABLE', owner_type: 'STUDIO', owner_id: studioId },
    select: { direction: true, amount_usd: true, transaction: { select: { currency: true } } },
  });
  let amountUsd = 0;
  const otherCurrencies = new Set<string>();
  for (const entry of entries) {
    const currency = entry.transaction.currency.toUpperCase();
    if (currency !== PAYABLE_CURRENCY) {
      otherCurrencies.add(currency);
      continue;
    }
    amountUsd += entry.direction === 'CREDIT' ? Number(entry.amount_usd) : -Number(entry.amount_usd);
  }
  return { amountUsd: money(amountUsd), otherCurrencies: [...otherCurrencies].sort() };
}

export async function outstandingPayableUsd(
  studioId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  return (await studioPayable(studioId, db)).amountUsd;
}

export interface PayoutRequest {
  studioId: string;
  requestedBy: string;
}

// Reserves the studio's outstanding balance and records the intent to pay it.
//
// The payout row and the ledger debit are written in one transaction on purpose:
// the payable drops the moment the payout exists, so a second concurrent request
// reads the reduced balance and has nothing left to pay. Reserving in the ledger
// is what makes a double payout impossible — not a lock, not a status check.
//
// The external transfer happens afterwards and can still fail. That is why the
// row carries a status: a PENDING payout means money was reserved and the rail
// has not confirmed. Never edit the original ledger transaction to undo one —
// post a compensating reversal (see releaseFailedPayout).
export async function reserveStudioPayout(input: PayoutRequest) {
  return prisma.$transaction(async (tx) => {
    const studio = await tx.studio.findUnique({
      where: { id: input.studioId },
      select: { id: true, stripe_account_id: true },
    });
    if (!studio) throw new AppError('Studio not found', 404);

    const payable = await studioPayable(input.studioId, tx);
    // Entries in another currency were recorded before payouts stopped taking the
    // studio's currency: a dollar amount under another label. The dollar total
    // cannot be trusted while they stand, and paying it could pay the same money
    // twice, so someone reconciles the payable first.
    if (payable.otherCurrencies.length > 0) {
      throw new AppError(`This studio's payable has entries in ${payable.otherCurrencies.join(', ')}; reconcile them before paying out`, 409);
    }
    const outstanding = payable.amountUsd;
    if (outstanding <= 0) throw new AppError('Nothing is currently payable to this studio', 409);

    const payout = await tx.studioPayout.create({
      data: {
        studio_id: studio.id,
        amount_usd: new Prisma.Decimal(outstanding.toFixed(2)),
        currency: PAYABLE_CURRENCY,
        status: 'PENDING',
        requested_by: input.requestedBy,
      },
    });

    // Balanced by construction: what leaves the payable enters cash out.
    // postFinancialTransaction rejects an unbalanced set and is idempotent on
    // (source_type, source_id), so replaying this payout id cannot double-post.
    await postFinancialTransaction(tx, {
      source_type: 'STUDIO_PAYOUT',
      source_id: payout.id,
      description: `Payout to studio ${studio.id}`,
      currency: PAYABLE_CURRENCY,
      metadata: { studio_id: studio.id, requested_by: input.requestedBy },
      lines: [
        { account_code: 'STUDIO_PAYABLE', direction: 'DEBIT', amount_usd: outstanding, owner_type: 'STUDIO', owner_id: studio.id },
        { account_code: 'CASH_CLEARING', direction: 'CREDIT', amount_usd: outstanding },
      ],
    });

    return { payout, outstanding, connectAccountId: studio.stripe_account_id };
  });
}

// The rail refused. Return the money to the payable with a compensating entry so
// the studio can be paid again, and record why. The original transaction is left
// exactly as it was — a ledger that can be edited after the fact is not a ledger.
export async function releaseFailedPayout(payoutId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.studioPayout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new AppError('Payout not found', 404);
    if (payout.status !== 'PENDING') return payout;

    const amount = Number(payout.amount_usd);
    await postFinancialTransaction(tx, {
      source_type: 'STUDIO_PAYOUT_REVERSAL',
      source_id: payout.id,
      description: `Reversal of failed payout ${payout.id}`,
      currency: payout.currency,
      metadata: { payout_id: payout.id, reason },
      lines: [
        { account_code: 'CASH_CLEARING', direction: 'DEBIT', amount_usd: amount },
        { account_code: 'STUDIO_PAYABLE', direction: 'CREDIT', amount_usd: amount, owner_type: 'STUDIO', owner_id: payout.studio_id },
      ],
    });

    return tx.studioPayout.update({
      where: { id: payout.id },
      data: { status: 'FAILED', failure_reason: reason.slice(0, 500) },
    });
  });
}

export async function markPayoutPaid(payoutId: string, stripeTransferId: string) {
  const paid = await prisma.studioPayout.update({
    where: { id: payoutId },
    data: { status: 'PAID', stripe_transfer_id: stripeTransferId },
  });

  // Money reaching a studio is the most consequential thing that happens to it,
  // and until the event subject was widened beyond Artist there was no way to
  // record it. Emitted after the row is updated, and never allowed to fail the
  // payout — the money has already moved by this point.
  emitActivityEvent('payout.paid', {
    subject: { type: 'STUDIO', id: paid.studio_id },
    actorId: paid.requested_by,
    payout_id: paid.id,
    amount_usd: Number(paid.amount_usd),
    currency: paid.currency,
  }).catch((e: any) => console.error('[activity] payout.paid emit failed:', e?.message));

  return paid;
}
