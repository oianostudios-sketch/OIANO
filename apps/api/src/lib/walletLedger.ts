import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { AppError } from './errors';

type TxClient = Prisma.TransactionClient;

/**
 * The only sanctioned way to change a wallet's balance. Writes the signed
 * WalletTransaction row and applies the same delta to Wallet.balance_usd in
 * one step, so the two can never drift apart — previously each call site
 * mutated balance_usd and wrote the audit row as two independent statements
 * (one of them not even inside a transaction), which is how a wallet's
 * stored balance and its own transaction history could disagree (AUD-017).
 *
 * amountUsd is signed: positive credits, negative debits. Assumes the
 * wallet row already exists — callers that might not have one yet (see
 * admin.routes.ts's manual-credit route) must create it first.
 */
export async function applyWalletDelta(
  tx: TxClient,
  walletId: string,
  amountUsd: number,
  type: string,
  description: string,
) {
  if (amountUsd < 0) {
    const debited = await tx.wallet.updateMany({
      where: { id: walletId, balance_usd: { gte: -amountUsd } },
      data: { balance_usd: { decrement: -amountUsd } },
    });
    if (debited.count !== 1) throw new AppError('Insufficient wallet balance', 402);
  } else if (amountUsd > 0) {
    await tx.wallet.update({
      where: { id: walletId },
      data: { balance_usd: { increment: amountUsd } },
    });
  }
  return tx.walletTransaction.create({
    data: { wallet_id: walletId, amount_usd: amountUsd, type, description },
  });
}

/**
 * Reconciliation check for OIANO_ADMIN: compares each wallet's stored
 * balance_usd against the sum of its own WalletTransaction history. Any
 * mismatch means the two were mutated independently at some point (a bug,
 * or a row written outside applyWalletDelta) and needs investigation.
 */
export async function findWalletDrift() {
  const wallets = await prisma.wallet.findMany({
    select: {
      id: true,
      balance_usd: true,
      artist: { select: { name: true, alias: true } },
      transactions: { select: { amount_usd: true } },
    },
  });
  return wallets
    .map((wallet) => {
      const computed = wallet.transactions.reduce((sum, t) => sum + Number(t.amount_usd), 0);
      const stored = Number(wallet.balance_usd);
      return {
        wallet_id: wallet.id,
        artist: wallet.artist.alias ?? wallet.artist.name,
        stored_balance: stored,
        computed_balance: computed,
        drift: Math.round((stored - computed) * 100) / 100,
      };
    })
    .filter((row) => Math.abs(row.drift) > 0.005);
}
