// The wallet is frozen (owner decision, 2026-11-01): nothing is added to it or spent
// from it, and a booking is settled at the studio. Off unless the build says otherwise,
// matching isWalletEnabled() in the API.
export const WALLET_ENABLED = import.meta.env.VITE_WALLET_ENABLED === 'true';
