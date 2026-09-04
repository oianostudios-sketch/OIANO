import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from './auth.store';

const STORAGE_KEY = 'oiano-auth';

const user = {
  id: 'user-1',
  email: 'artist@example.test',
  role: 'ARTIST' as const,
  artist: { id: 'artist-1', name: 'Test Artist' },
};

function reset() {
  window.localStorage.clear();
  useAuthStore.setState({ token: null, user: null });
}

describe('auth store', () => {
  beforeEach(reset);

  it('holds the token and user set at sign-in', () => {
    useAuthStore.getState().setAuth('token-abc', user);
    expect(useAuthStore.getState().token).toBe('token-abc');
    expect(useAuthStore.getState().user?.email).toBe('artist@example.test');
  });

  it('persists the session so a reload keeps the user signed in', async () => {
    useAuthStore.getState().setAuth('token-abc', user);
    // zustand's persist middleware writes asynchronously.
    await useAuthStore.persist.rehydrate();
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('token-abc');
  });

  // The invariant CLAUDE.md calls out explicitly: clearing in-memory state is
  // not logging out — persist.clearStorage() has to remove the entry.
  //
  // Asserting only "no longer contains the token" is not enough to catch a
  // missing clearStorage(): set({token: null}) makes the persist middleware
  // rewrite the entry with nulls, which passes that check while leaving a
  // stale session record behind. Verified by deleting the clearStorage() call
  // and watching the weaker assertion still pass. So assert the entry is gone.
  it('logout removes the persisted session entry, not just memory', async () => {
    useAuthStore.getState().setAuth('token-abc', user);
    await useAuthStore.persist.rehydrate();
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('token-abc');

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('logout is safe when no one is signed in', () => {
    expect(() => useAuthStore.getState().logout()).not.toThrow();
    expect(useAuthStore.getState().token).toBeNull();
  });
});
