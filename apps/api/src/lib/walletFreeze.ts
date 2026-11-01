// The wallet is frozen (owner decision, 2026-11-01): nobody adds to it or spends
// from it until counsel advises, because value spendable at any studio is an open
// legal question and a wallet-paid booking has no refund path. Existing balances and
// history stay as they are.
//
// Checked live at the point of use, like STRIPE_ENABLED (lib/env.ts), and off unless
// set, so a deployment that says nothing is frozen.
export function isWalletEnabled(): boolean {
  return process.env.WALLET_ENABLED === 'true';
}
