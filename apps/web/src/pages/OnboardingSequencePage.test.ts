import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingSequencePage from './OnboardingSequencePage';
import { useAuthStore } from '../store/auth.store';

vi.mock('../components/Toast', () => ({ useToast: () => ({ error: vi.fn() }) }));
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  useAuthStore.getState().setAuth('synthetic-session', {
    id: 'test-artist', email: 'artist@example.test', role: 'ARTIST',
    artist: { id: 'test-profile', name: 'Test artist', onboarding_completed_at: '2026-10-27T00:00:00Z' },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useAuthStore.getState().logout();
});

describe('completed artist onboarding destinations', () => {
  it.each([
    ['/accept-contribution?token=synthetic%2Btoken%2Fvalue#role', '/accept-contribution?token=synthetic%2Btoken%2Fvalue#role'],
    [null, '/dashboard'],
    ['//example.test', '/dashboard'],
    ['/\\example.test', '/dashboard'],
  ])('returns safely for %j', async (next, expected) => {
    function CurrentLocation() {
      const { pathname, search, hash } = useLocation();
      return createElement('output', null, pathname + search + hash);
    }
    await act(async () => root.render(createElement(MemoryRouter, {
      initialEntries: [`/onboarding${next === null ? '' : `?next=${encodeURIComponent(next)}`}`],
    }, createElement(OnboardingSequencePage), createElement(CurrentLocation))));
    expect(host.querySelector('output')?.textContent).toBe(expected);
  });
});
