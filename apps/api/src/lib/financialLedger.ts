import { Prisma } from '@prisma/client';
import { AppError } from './errors';

type Tx = Prisma.TransactionClient;
type Line = { account_code: string; direction: 'DEBIT' | 'CREDIT'; amount_usd: number; owner_type?: string; owner_id?: string };

function money(value: number) { return Math.round(value * 100) / 100; }

export function bookingAllocation(amountUsd: number, platformFeeBps: number) {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new AppError('Payment amount must be positive', 500);
  if (!Number.isInteger(platformFeeBps) || platformFeeBps < 0 || platformFeeBps > 10000) throw new AppError('Invalid platform fee configuration', 500);
  const platformFee = money(amountUsd * platformFeeBps / 10000);
  return { gross: money(amountUsd), platformFee, studioNet: money(amountUsd - platformFee) };
}

export async function postFinancialTransaction(tx: Tx, input: { source_type: string; source_id: string; description: string; currency?: string; metadata?: Prisma.InputJsonValue; lines: Line[] }) {
  const debit = money(input.lines.filter(line => line.direction === 'DEBIT').reduce((sum, line) => sum + line.amount_usd, 0));
  const credit = money(input.lines.filter(line => line.direction === 'CREDIT').reduce((sum, line) => sum + line.amount_usd, 0));
  if (debit <= 0 || debit !== credit || input.lines.some(line => line.amount_usd <= 0)) throw new AppError('Financial transaction is not balanced', 500);
  const existing = await tx.financialTransaction.findUnique({ where: { source_type_source_id: { source_type: input.source_type, source_id: input.source_id } }, include: { entries: true } });
  if (existing) return existing;
  return tx.financialTransaction.create({ data: { source_type: input.source_type, source_id: input.source_id, description: input.description, currency: input.currency ?? 'USD', metadata: input.metadata ?? {}, entries: { create: input.lines } }, include: { entries: true } });
}

export async function recordBookingPayment(tx: Tx, input: { paymentId: string; provider: string; amountUsd: number; platformFeeBps: number; artistId: string; studioId: string; bookingId: string }) {
  const allocation = bookingAllocation(input.amountUsd, input.platformFeeBps);
  const lines: Line[] = [{ account_code: input.provider === 'wallet' ? 'WALLET_LIABILITY' : 'CASH_CLEARING', direction: 'DEBIT', amount_usd: allocation.gross, owner_type: 'ARTIST', owner_id: input.artistId }];
  if (allocation.studioNet > 0) lines.push({ account_code: 'STUDIO_PAYABLE', direction: 'CREDIT', amount_usd: allocation.studioNet, owner_type: 'STUDIO', owner_id: input.studioId });
  if (allocation.platformFee > 0) lines.push({ account_code: 'PLATFORM_REVENUE', direction: 'CREDIT', amount_usd: allocation.platformFee, owner_type: 'PLATFORM', owner_id: 'OIANO' });
  return postFinancialTransaction(tx, { source_type: 'BOOKING_PAYMENT', source_id: input.paymentId, description: `Booking ${input.bookingId} payment`, metadata: { booking_id: input.bookingId, provider: input.provider, platform_fee_bps: input.platformFeeBps }, lines });
}

// OIANO takes no platform fee on cash a studio collects at its own desk (owner
// decision, 2026-10-06). Card and wallet payments keep the studio's own rate.
export const CASH_PLATFORM_FEE_BPS = 0;

// Cash a studio took at its own desk for a booking. The payment itself posts
// through recordBookingPayment, with CASH_PLATFORM_FEE_BPS as its fee, so the gross
// is credited to the studio's payable and nothing to platform revenue. But the
// studio, not OIANO, is holding the money, so OIANO must not pay it out again: the
// cash the studio kept is set against what it is owed. The two postings net to
// zero on both STUDIO_PAYABLE and CASH_CLEARING; the studio is owed nothing and
// owes nothing for it. Posted once per payment, in the same database transaction
// as the payment.
export async function recordStudioCollectedCash(tx: Tx, input: { paymentId: string; amountUsd: number; studioId: string; bookingId: string }) {
  const gross = bookingAllocation(input.amountUsd, 0).gross;
  return postFinancialTransaction(tx, { source_type: 'STUDIO_COLLECTED_CASH', source_id: input.paymentId, description: `Booking ${input.bookingId} cash kept by studio`, metadata: { booking_id: input.bookingId, provider: 'cash' }, lines: [
    { account_code: 'STUDIO_PAYABLE', direction: 'DEBIT', amount_usd: gross, owner_type: 'STUDIO', owner_id: input.studioId },
    { account_code: 'CASH_CLEARING', direction: 'CREDIT', amount_usd: gross },
  ] });
}

export async function recordWalletTopUp(tx: Tx, input: { topUpId: string; walletId: string; amountUsd: number }) {
  return postFinancialTransaction(tx, { source_type: 'WALLET_TOPUP', source_id: input.topUpId, description: 'Wallet top-up', lines: [
    { account_code: 'CASH_CLEARING', direction: 'DEBIT', amount_usd: input.amountUsd },
    { account_code: 'WALLET_LIABILITY', direction: 'CREDIT', amount_usd: input.amountUsd, owner_type: 'WALLET', owner_id: input.walletId },
  ] });
}

// Demo money the seeds put in a wallet. Nobody paid it in, so it is funded from
// DEMO_FUNDING instead of cash, and a seeded database still reconciles.
export async function recordSeedWalletGrant(tx: Tx, input: { walletTransactionId: string; walletId: string; amountUsd: number; description: string }) {
  return postFinancialTransaction(tx, { source_type: 'SEED_WALLET_GRANT', source_id: input.walletTransactionId, description: input.description, lines: [
    { account_code: 'DEMO_FUNDING', direction: 'DEBIT', amount_usd: input.amountUsd },
    { account_code: 'WALLET_LIABILITY', direction: 'CREDIT', amount_usd: input.amountUsd, owner_type: 'WALLET', owner_id: input.walletId },
  ] });
}
