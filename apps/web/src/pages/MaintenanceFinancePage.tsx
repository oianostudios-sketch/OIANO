import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDollarSign, Clock3, CreditCard, WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MaintenanceShell from '../components/MaintenanceShell';
import { api } from '../lib/api';

type Provider = { provider: string; count: number; volume: number };
type StudioRow = { id: string; name: string; payments: number; collected: number };
type Payment = { id: string; created_at: string; paid_at: string | null; status: string; provider: string; amount_usd: number; refunded_usd: number; studio: string; artist: string; booking_id: string };
type WalletDrift = { wallet_id: string; artist: string; stored_balance: number; computed_balance: number; drift: number };
type Finance = {
  totals: { booked_value: number; collected: number; wallet_liability: number; wallet_topups: number; failed: number; refunded: number; processing: number; wallet_drift_count: number };
  providers: Provider[];
  studios: StudioRow[];
  payments: Payment[];
  wallet_reconciliation: WalletDrift[];
  ledger_reconciliation: { healthy: boolean; unbalanced_transactions: Array<{id:string;source_type:string;source_id:string;debit:number;credit:number}>; missing_payment_entries: string[]; missing_topup_entries: string[]; accounts: Array<{account_code:string;debit:number;credit:number;balance:number;entries:number}> };
};

const usd = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n);
const tone = (status: string) =>
  status === 'PAID' ? 'text-emerald-400 bg-emerald-500/10'
  : status === 'PARTIALLY_REFUNDED' ? 'text-sky-300 bg-sky-500/10'
  : status === 'FAILED' ? 'text-red-400 bg-red-500/10'
  : status === 'REFUNDED' ? 'text-violet-300 bg-violet-500/10'
  : 'text-amber-300 bg-amber-500/10';

export default function MaintenanceFinancePage() {
  const nav = useNavigate();
  const { data, isLoading, error } = useQuery<Finance>({
    queryKey: ['maintenance-finance-v3'],
    queryFn: async () => (await api.get('/maintenance/finance')).data,
    refetchInterval: 30000,
  });

  return (
    <MaintenanceShell title="Payments" eyebrow="Oiano financial infrastructure">
      <div className="mx-auto max-w-[1380px] px-5 py-10 md:px-8">
        <button onClick={() => nav('/maintenance')} className="mb-7 flex items-center gap-2 text-xs text-zinc-600 hover:text-white">
          <ArrowLeft size={13} />Network overview
        </button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl">Money, with evidence.</h1>
            <p className="mt-3 text-sm text-zinc-600">Wallet-funded and Stripe-paid bookings, reconciled against each wallet's own transaction history.</p>
          </div>
        </div>

        {isLoading ? (
          <p className="mt-14 text-xs text-zinc-700">Reconciling accounts…</p>
        ) : error || !data ? (
          <p className="mt-12 text-red-400">Payments intelligence unavailable.</p>
        ) : (
          <>
            <div className="mt-9 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                [CircleDollarSign, 'Collected', usd(data.totals.collected)],
                [WalletCards, 'Wallet liability', usd(data.totals.wallet_liability)],
                [Clock3, 'Processing', String(data.totals.processing)],
                [CreditCard, 'Failed', String(data.totals.failed)],
                [AlertTriangle, 'Wallet drift', String(data.totals.wallet_drift_count)],
              ].map(([Icon, label, value]: any) => (
                <article key={label} className="rounded-2xl border border-white/[.065] bg-[#0b0d0f] p-5">
                  <Icon size={15} className={label === 'Wallet drift' && data.totals.wallet_drift_count > 0 ? 'text-amber-400' : 'text-[#C9A84C]'} />
                  <b className="mt-7 block text-xl">{value}</b>
                  <p className="mt-2 text-[8px] font-mono uppercase tracking-wider text-zinc-700">{label}</p>
                </article>
              ))}
            </div>

            <article className={`mt-5 rounded-2xl border p-5 ${data.ledger_reconciliation.healthy ? 'border-emerald-500/15 bg-emerald-500/[.035]' : 'border-red-500/20 bg-red-500/[.04]'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2">{data.ledger_reconciliation.healthy?<CheckCircle2 size={14} className="text-emerald-400"/>:<AlertTriangle size={14} className="text-red-400"/>}<h2 className="text-sm font-semibold">Double-entry reconciliation</h2></div><span className={`text-[9px] font-mono uppercase ${data.ledger_reconciliation.healthy?'text-emerald-400':'text-red-400'}`}>{data.ledger_reconciliation.healthy?'Balanced':'Exceptions found'}</span></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{data.ledger_reconciliation.accounts.map(account=><div key={account.account_code} className="rounded-xl border border-white/[.05] bg-black/20 p-3"><p className="text-[8px] font-mono uppercase text-zinc-600">{account.account_code.replaceAll('_',' ')}</p><p className="mt-2 text-sm">{usd(Math.abs(account.balance))}</p><p className="mt-1 text-[8px] text-zinc-700">{account.entries} entries · {account.balance>=0?'debit':'credit'} balance</p></div>)}</div>
              {!data.ledger_reconciliation.healthy&&<p className="mt-4 text-[10px] text-red-300">{data.ledger_reconciliation.unbalanced_transactions.length} unbalanced · {data.ledger_reconciliation.missing_payment_entries.length} payments missing · {data.ledger_reconciliation.missing_topup_entries.length} top-ups missing</p>}
            </article>

            {data.totals.wallet_drift_count > 0 && (
              <article className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/[.04] p-5">
                <div className="mb-4 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-400" />
                  <h2 className="text-sm font-semibold text-amber-300">Wallet reconciliation exceptions</h2>
                </div>
                <p className="mb-4 text-[10px] text-zinc-500">A wallet's stored balance no longer matches the sum of its own transaction history — investigate before trusting its balance.</p>
                <div className="space-y-2">
                  {data.wallet_reconciliation.map((row) => (
                    <div key={row.wallet_id} className="flex items-center justify-between rounded-xl border border-amber-500/10 bg-black/20 px-4 py-3 text-xs">
                      <span className="font-medium">{row.artist}</span>
                      <span className="text-zinc-500">stored {usd(row.stored_balance)} · computed {usd(row.computed_balance)}</span>
                      <span className="font-mono text-amber-400">{row.drift > 0 ? '+' : ''}{usd(row.drift)}</span>
                    </div>
                  ))}
                </div>
              </article>
            )}
            {data.totals.wallet_drift_count === 0 && (
              <div className="mt-5 flex items-center gap-2 rounded-2xl border border-emerald-500/15 bg-emerald-500/[.04] px-5 py-3 text-[10px] text-emerald-400">
                <CheckCircle2 size={13} /> All wallet balances reconciled against their transaction history.
              </div>
            )}

            {data.providers.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {data.providers.map((p) => (
                  <span key={p.provider} className="rounded-full border border-white/[.06] px-3 py-1.5 text-[9px] uppercase text-zinc-400">
                    {p.provider} · {p.count} · {usd(p.volume)}
                  </span>
                ))}
              </div>
            )}

            <article className="mt-5 overflow-x-auto rounded-2xl border border-white/[.065] bg-[#0b0d0f] p-5">
              <div className="mb-5">
                <h2 className="text-sm font-semibold">Payments</h2>
                <p className="mt-1 text-[10px] text-zinc-700">Every booking payment, wallet-funded or Stripe-paid.</p>
              </div>
              <table className="w-full min-w-[820px] text-left">
                <thead>
                  <tr className="border-b border-white/[.06] text-[8px] uppercase text-zinc-700">
                    {['Studio / artist', 'Provider', 'Amount', 'Status', 'Date'].map((x) => <th className="pb-3" key={x}>{x}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id} className="border-b border-white/[.04] text-[10px]">
                      <td className="py-4"><b>{p.artist}</b><p className="mt-1 text-[8px] text-zinc-700">{p.studio}</p></td>
                      <td className="text-zinc-500">{p.provider}</td>
                      <td>{usd(p.amount_usd)}{p.refunded_usd>0&&<p className="mt-1 text-[8px] text-violet-300">{usd(p.refunded_usd)} refunded</p>}</td>
                      <td><span className={'rounded-full px-2 py-1 text-[8px] ' + tone(p.status)}>{p.status}</span></td>
                      <td className="text-zinc-600">{new Date(p.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {!data.payments.length && (
                    <tr><td colSpan={5} className="py-14 text-center text-xs text-zinc-700">No payments yet.</td></tr>
                  )}
                </tbody>
              </table>
            </article>
          </>
        )}
      </div>
    </MaintenanceShell>
  );
}
