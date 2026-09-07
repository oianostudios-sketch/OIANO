import { describe, expect, it } from 'vitest';
import { mayClaimPaymentReceived, settlementView, type SettlementView } from './paymentReturn';

const LIMIT = 6;
const view = (
  returned: 'success' | 'cancelled' | null,
  recorded: string | null | undefined,
  attempts = 0,
): SettlementView => settlementView({ returned, recorded, attempts, attemptLimit: LIMIT });

describe('mayClaimPaymentReceived', () => {
  it('is true only for states the payment record actually reports', () => {
    expect(mayClaimPaymentReceived('PAID')).toBe(true);
    expect(mayClaimPaymentReceived('PARTIAL')).toBe(true);
  });

  // The regression this module exists for. 'success' is what the URL carries, so
  // it is the one string that must never be mistaken for a payment record.
  it('rejects every value a URL could supply, including "success"', () => {
    for (const forged of ['success', 'SUCCESS', 'paid', 'Paid', 'true', '1', 'COMPLETE', 'CONFIRMED']) {
      expect(mayClaimPaymentReceived(forged), `${forged} must not read as received`).toBe(false);
    }
  });

  it('rejects absent and unpaid states', () => {
    for (const empty of ['UNPAID', 'FAILED', 'PROCESSING', '', null, undefined]) {
      expect(mayClaimPaymentReceived(empty)).toBe(false);
    }
  });
});

describe('settlementView', () => {
  it('shows nothing when this is not a checkout return', () => {
    expect(view(null, 'UNPAID')).toEqual({ kind: 'none' });
    expect(view(null, null)).toEqual({ kind: 'none' });
  });

  // A forged or replayed ?payment=success must never reach 'settled'.
  it('never settles on the redirect alone, however long it waits', () => {
    for (let attempts = 0; attempts <= LIMIT + 3; attempts++) {
      const result = view('success', 'UNPAID', attempts);
      expect(result.kind, `attempt ${attempts}`).not.toBe('settled');
    }
  });

  it('checks first, then admits it is unrecorded rather than waiting forever', () => {
    expect(view('success', 'UNPAID', 0)).toEqual({ kind: 'checking' });
    expect(view('success', 'UNPAID', LIMIT - 1)).toEqual({ kind: 'checking' });
    expect(view('success', 'UNPAID', LIMIT)).toEqual({ kind: 'unrecorded' });
    expect(view('success', 'UNPAID', LIMIT + 1)).toEqual({ kind: 'unrecorded' });
  });

  it('settles only once the server records the payment', () => {
    expect(view('success', 'PAID', 0)).toEqual({ kind: 'settled', state: 'PAID' });
    expect(view('success', 'PARTIAL', 2)).toEqual({ kind: 'settled', state: 'PARTIAL' });
  });

  it('reports a settled payment even with no redirect parameter at all', () => {
    // Delayed settlement: the user reloads a clean URL after the webhook lands.
    expect(view(null, 'PAID')).toEqual({ kind: 'settled', state: 'PAID' });
  });

  it('tells a user who abandoned checkout that nothing was taken', () => {
    expect(view('cancelled', 'UNPAID')).toEqual({ kind: 'cancelled' });
    expect(view('cancelled', null)).toEqual({ kind: 'cancelled' });
  });

  // Truth outranks the redirect in both directions.
  it('does not claim nothing was taken when the server recorded a payment', () => {
    expect(view('cancelled', 'PAID')).toEqual({ kind: 'settled', state: 'PAID' });
  });
});
