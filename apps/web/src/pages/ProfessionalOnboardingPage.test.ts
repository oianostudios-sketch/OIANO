import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfessionalOnboardingPage from './ProfessionalOnboardingPage';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

vi.mock('../lib/api', () => ({ api: { patch: vi.fn(), get: vi.fn() } }));
let host: HTMLDivElement;
let root: Root;
const user = {
  id: 'test-user', email: 'test@example.test', role: 'PRODUCER' as const,
  producer: { id: 'test-profile', name: 'Test professional', disciplines: ['PRODUCER'], onboarding_complete: false },
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  useAuthStore.getState().setAuth('synthetic-session', user);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useAuthStore.getState().logout();
  vi.resetAllMocks();
});

async function render(next: string | null) {
  function CurrentLocation() {
    const { pathname, search, hash } = useLocation();
    return createElement('output', null, pathname + search + hash);
  }
  await act(async () => root.render(createElement(MemoryRouter, {
    initialEntries: [`/professional/onboarding${next === null ? '' : `?next=${encodeURIComponent(next)}`}`],
  }, createElement(ProfessionalOnboardingPage), createElement(CurrentLocation))));
}
async function complete() {
  const button = Array.from(host.querySelectorAll('button')).find((item) => item.textContent?.includes('Enter your professional home'))!;
  await act(async () => button.click());
}

describe('professional onboarding invitation continuity', () => {
  it.each([
    '/accept-contribution?token=synthetic%2Btoken%2Fvalue&view=terms#role',
    '/accept-studio-invite?token=synthetic-token',
  ])('saves, refreshes the account and returns to %s', async (next) => {
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    vi.mocked(api.get).mockResolvedValue({ data: { ...user, producer: { ...user.producer, onboarding_complete: true } } });
    await render(next);
    await complete();
    expect(api.patch).toHaveBeenCalledWith('/producer/me', expect.objectContaining({ onboarding_complete: true }));
    expect(api.get).toHaveBeenCalledWith('/auth/me');
    expect(useAuthStore.getState().user?.producer?.onboarding_complete).toBe(true);
    expect(host.querySelector('output')?.textContent).toBe(next);
  });

  it.each([null, '//example.test', '/\\example.test'])('uses the existing professional home for %j', async (next) => {
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    vi.mocked(api.get).mockResolvedValue({ data: user });
    await render(next);
    await complete();
    expect(host.querySelector('output')?.textContent).toBe('/producer');
  });

  it.each(['save', 'refresh'])('stays on onboarding and allows retry after a %s failure', async (step) => {
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    vi.mocked(api.get).mockResolvedValue({ data: user });
    const failure = { response: { data: { error: 'Please retry' } } };
    if (step === 'save') vi.mocked(api.patch).mockRejectedValueOnce(failure);
    else vi.mocked(api.get).mockRejectedValueOnce(failure);
    const next = '/accept-contribution?token=synthetic-token';
    await render(next);
    await complete();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Please retry');
    expect(host.querySelector('output')?.textContent).toContain('/professional/onboarding?next=');
    await complete();
    expect(host.querySelector('output')?.textContent).toBe(next);
  });
});
