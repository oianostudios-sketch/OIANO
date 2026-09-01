import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activationGapSignal, failedPaymentsSignal, idleStudiosSignal, ledgerHealthSignal,
  pendingBookingsSignal, processingPaymentsSignal, revenueActivationSignal, sortSignals,
  walletDriftSignal, type BusinessSignal,
} from './businessSignals';

test('zero-data inputs never emit a signal', () => {
  assert.equal(failedPaymentsSignal(0), null);
  assert.equal(processingPaymentsSignal(0), null);
  assert.equal(walletDriftSignal([]), null);
  assert.equal(ledgerHealthSignal({ healthy: true, unbalanced_transactions: [], missing_payment_entries: [], missing_topup_entries: [] }), null);
  assert.equal(pendingBookingsSignal(0, null), null);
  assert.equal(idleStudiosSignal([]), null);
  assert.equal(activationGapSignal(0, 0), null);
  assert.equal(activationGapSignal(10, 0), null);
});

test('failed payments always fires at any count, including one', () => {
  const signal = failedPaymentsSignal(1);
  assert.equal(signal?.priority, 'CRITICAL');
  assert.equal(signal?.evidence.failed_payment_count, 1);
});

test('wallet drift signal sums absolute drift across wallets', () => {
  const signal = walletDriftSignal([
    { wallet_id: 'w1', artist: 'A', stored_balance: 10, computed_balance: 8, drift: 2 },
    { wallet_id: 'w2', artist: 'B', stored_balance: 5, computed_balance: 6, drift: -1 },
  ]);
  assert.equal(signal?.priority, 'CRITICAL');
  assert.equal(signal?.evidence.wallets_affected, 2);
  assert.equal(signal?.evidence.total_drift_usd, 3);
});

test('unbalanced ledger fires even with zero missing entries', () => {
  const signal = ledgerHealthSignal({
    healthy: false,
    unbalanced_transactions: [{ id: 't1' }],
    missing_payment_entries: [],
    missing_topup_entries: [],
  });
  assert.equal(signal?.priority, 'CRITICAL');
  assert.equal(signal?.evidence.unbalanced_transactions, 1);
});

test('pending bookings signal escalates its action hint past 48 hours', () => {
  const recent = pendingBookingsSignal(1, { id: 'b1', created_at: new Date(Date.now() - 3_600_000), studio_name: 'Studio A' });
  assert.doesNotMatch(recent!.action_hint, /48 hours/);

  const stale = pendingBookingsSignal(1, { id: 'b2', created_at: new Date(Date.now() - 72 * 3_600_000), studio_name: 'Studio A' });
  assert.match(stale!.action_hint, /48 hours/);
});

test('idle studios signal lists every affected studio by name', () => {
  const signal = idleStudiosSignal([{ id: 's1', name: 'North Room' }, { id: 's2', name: 'South Room' }]);
  assert.equal(signal?.evidence.studio_names, 'North Room, South Room');
});

test('activation gap computes a rounded percentage', () => {
  const signal = activationGapSignal(3, 1);
  assert.equal(signal?.evidence.never_booked_pct, 33);
});

test('revenue-not-activated signal requires real GMV and zero configured fees', () => {
  assert.equal(revenueActivationSignal(0, 0, 3), null, 'no GMV yet — nothing to activate');
  assert.equal(revenueActivationSignal(500, 1, 3), null, 'at least one studio already has a fee configured');
  assert.equal(revenueActivationSignal(500, 0, 0), null, 'no studios at all — not a revenue-activation opportunity');

  const signal = revenueActivationSignal(1234.5, 0, 3);
  assert.equal(signal?.priority, 'OPPORTUNITY');
  assert.equal(signal?.evidence.gmv_paid_usd, 1234.5);
});

test('sortSignals orders CRITICAL before ATTENTION before OPPORTUNITY before WATCH', () => {
  const make = (priority: BusinessSignal['priority']): BusinessSignal => ({
    id: priority, priority, domain: 'OPERATIONAL', headline: '', explanation: '', evidence: {}, action_hint: '', href: '',
  });
  const sorted = sortSignals([make('WATCH'), make('OPPORTUNITY'), make('CRITICAL'), make('ATTENTION')]);
  assert.deepEqual(sorted.map((s) => s.priority), ['CRITICAL', 'ATTENTION', 'OPPORTUNITY', 'WATCH']);
});
