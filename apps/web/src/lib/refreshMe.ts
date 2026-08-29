import { api } from './api';

// Re-fetches the canonical user object from the server and syncs it into the
// auth store. Use this after any mutation that changes profile data the auth
// store caches (name, avatar_url, status...) instead of hand-patching the
// cached object locally — a local patch is lost if the tab reloads or the
// user navigates away before the mutation's own response comes back, even
// though the server-side change already landed. Non-fatal on failure: the
// cached user just stays as it was, which is never worse than not calling this.
export async function refreshMe(setAuth: (token: string, user: any) => void, token: string | null) {
  if (!token) return;
  try {
    const { data } = await api.get('/auth/me');
    setAuth(token, data);
  } catch (_) { /* non-fatal */ }
}
