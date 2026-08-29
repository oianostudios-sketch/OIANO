import { prisma } from './prisma';

export async function reconcileFinancialLedger() {
  const [accountGroups, unbalanced, settledPayments, paidTopUps, paymentTransactions, topUpTransactions] = await Promise.all([
    prisma.financialLedgerEntry.groupBy({ by: ['account_code', 'direction'], _sum: { amount_usd: true }, _count: true }),
    prisma.$queryRaw<Array<{ id: string; source_type: string; source_id: string; debit: unknown; credit: unknown }>>`
      SELECT ft.id, ft.source_type, ft.source_id,
        COALESCE(SUM(CASE WHEN fle.direction='DEBIT' THEN fle.amount_usd ELSE 0 END),0) AS debit,
        COALESCE(SUM(CASE WHEN fle.direction='CREDIT' THEN fle.amount_usd ELSE 0 END),0) AS credit
      FROM financial_transactions ft LEFT JOIN financial_ledger_entries fle ON fle.transaction_id=ft.id
      GROUP BY ft.id HAVING COALESCE(SUM(CASE WHEN fle.direction='DEBIT' THEN fle.amount_usd ELSE 0 END),0) <> COALESCE(SUM(CASE WHEN fle.direction='CREDIT' THEN fle.amount_usd ELSE 0 END),0)`,
    prisma.payment.findMany({ where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, select: { id: true } }),
    prisma.walletTopUp.findMany({ where: { status: 'PAID' }, select: { id: true } }),
    prisma.financialTransaction.findMany({ where: { source_type: 'BOOKING_PAYMENT' }, select: { source_id: true } }),
    prisma.financialTransaction.findMany({ where: { source_type: 'WALLET_TOPUP' }, select: { source_id: true } }),
  ]);
  const paymentSources = new Set(paymentTransactions.map(item => item.source_id));
  const topUpSources = new Set(topUpTransactions.map(item => item.source_id));
  const accounts = new Map<string, { debit: number; credit: number; entries: number }>();
  for (const group of accountGroups) {
    const row = accounts.get(group.account_code) ?? { debit: 0, credit: 0, entries: 0 };
    row[group.direction === 'DEBIT' ? 'debit' : 'credit'] += Number(group._sum.amount_usd ?? 0);
    row.entries += group._count;
    accounts.set(group.account_code, row);
  }
  return {
    healthy: unbalanced.length === 0 && settledPayments.every(payment => paymentSources.has(payment.id)) && paidTopUps.every(topUp => topUpSources.has(topUp.id)),
    unbalanced_transactions: unbalanced.map(item => ({ ...item, debit: Number(item.debit), credit: Number(item.credit) })),
    missing_payment_entries: settledPayments.filter(payment => !paymentSources.has(payment.id)).map(payment => payment.id),
    missing_topup_entries: paidTopUps.filter(topUp => !topUpSources.has(topUp.id)).map(topUp => topUp.id),
    accounts: [...accounts].map(([account_code, value]) => ({ account_code, ...value, balance: Math.round((value.debit - value.credit) * 100) / 100 })),
  };
}
