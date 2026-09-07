// What a checkout redirect is allowed to make the interface say.
//
// Returning from Stripe means the browser came back with a query parameter. It
// does not mean money moved: the parameter survives a copy-paste, a bookmark and
// a reload, and anyone can type one. Settlement is asynchronous besides, so even
// an honest return can arrive before the webhook that records the payment.
//
// So the rule lives here, in one place, stated once, and both the booking page
// and the wallet top-up read it rather than each deciding for itself:
//
//   only the recorded payment state may say that a payment was received.
//
// A second rule rides along with it. Payment and booking confirmation are
// different facts owned by different domains; a settled payment never licenses a
// claim about the booking, and this module deliberately has no opinion about
// booking status at all.

/** The `?payment=` / `?topup=` value carried back from the checkout redirect. */
export type CheckoutReturn = 'success' | 'cancelled' | null;

/** The payment record's own status, as the server reports it. */
export type RecordedPaymentState = string | null | undefined;

export type SettlementView =
  /** Not a checkout return, or already resolved — show nothing. */
  | { kind: 'none' }
  /** Returned successfully; still waiting for the server to record it. */
  | { kind: 'checking' }
  /** Waited long enough. Say so honestly and offer a retry. */
  | { kind: 'unrecorded' }
  /** The server records money. This is the only state that may say so. */
  | { kind: 'settled'; state: 'PAID' | 'PARTIAL' }
  /** The user abandoned checkout and nothing was taken. */
  | { kind: 'cancelled' };

/**
 * The single question this module exists to answer. `true` only for states the
 * payment domain actually reports; every hopeful string — including 'success',
 * which is what the URL carries — is false.
 */
export function mayClaimPaymentReceived(recorded: RecordedPaymentState): boolean {
  return recorded === 'PAID' || recorded === 'PARTIAL';
}

export function settlementView(input: {
  returned: CheckoutReturn;
  recorded: RecordedPaymentState;
  /** How many times the settlement check has re-read the server. */
  attempts: number;
  attemptLimit: number;
}): SettlementView {
  const { returned, recorded, attempts, attemptLimit } = input;

  // Recorded money outranks everything, including a `cancelled` return: a user
  // who pays and then hits back should not be told nothing was taken.
  if (mayClaimPaymentReceived(recorded)) {
    return { kind: 'settled', state: recorded === 'PAID' ? 'PAID' : 'PARTIAL' };
  }
  if (returned === 'cancelled') return { kind: 'cancelled' };
  if (returned !== 'success') return { kind: 'none' };
  return attempts >= attemptLimit ? { kind: 'unrecorded' } : { kind: 'checking' };
}
