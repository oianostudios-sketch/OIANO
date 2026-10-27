import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EnterPage from './EnterPage';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { homePathForRole, type UserRole } from '../lib/accountArchitecture';

vi.mock('../lib/api', () => ({ api: { post: vi.fn() } }));
vi.mock('../components/SignatureUniverse3D', () => ({ default: () => null }));

let host: HTMLDivElement;
let root: Root;
const invitation = '/accept-contribution?token=synthetic%2Btoken%2Fvalue&view=terms#role';

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  useAuthStore.setState({ token: null, user: null });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useAuthStore.getState().logout();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

function CurrentLocation() {
  const { pathname, search, hash } = useLocation();
  return createElement('output', null, pathname + search + hash);
}

async function render(next: string | null = invitation) {
  await act(async () => root.render(createElement(MemoryRouter, {
    initialEntries: [`/enter${next === null ? '' : `?next=${encodeURIComponent(next)}`}`],
  }, createElement(EnterPage), createElement(CurrentLocation))));
}

async function fill(selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit() {
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}

async function finish() {
  await act(async () => { await vi.advanceTimersByTimeAsync(850); });
}

function login(role: UserRole) {
  return { data: { token: 'synthetic-session', user: { id: 'test-user', email: 'test@example.test', role } } };
}

async function credentials() {
  await fill('#enter-email', 'test@example.test');
  await fill('#enter-password', 'synthetic-password');
}

describe('invitation return through authentication', () => {
  it.each<UserRole>(['ARTIST', 'PRODUCER', 'STUDIO_ADMIN', 'ENGINEER', 'OIANO_ADMIN'])('returns a signed-in %s to the complete invitation', async (role) => {
    vi.mocked(api.post).mockResolvedValue(login(role));
    await render();
    await credentials();
    await submit();
    await finish();
    expect(host.querySelector('output')?.textContent).toBe(invitation);
    expect(useAuthStore.getState().user?.role).toBe(role);
  });

  it.each([false, true])('waits for successful MFA (setup=%s), retaining the destination on retry', async (setup) => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { mfa_required: true, challenge: 'synthetic-challenge', mfa_setup: setup } })
      .mockRejectedValueOnce({ response: { data: { error: 'Invalid authenticator code' } } })
      .mockResolvedValueOnce(login('OIANO_ADMIN'));
    await render();
    await credentials();
    await submit();
    await finish();
    expect(useAuthStore.getState().token).toBeNull();
    expect(host.querySelector('output')?.textContent).toContain('/enter?next=');
    await fill('#mfa-code', '123456');
    await submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Invalid authenticator code');
    expect(useAuthStore.getState().token).toBeNull();
    await submit();
    await finish();
    expect(api.post).toHaveBeenLastCalledWith('/auth/mfa/verify', { challenge: 'synthetic-challenge', code: '123456' });
    expect(host.querySelector('output')?.textContent).toBe(invitation);
  });

  it.each(['ARTIST', 'PRODUCER'] as const)('carries the invitation through %s signup onboarding', async (role) => {
    vi.mocked(api.post).mockResolvedValue(login(role));
    await render();
    await act(async () => (host.querySelectorAll('[role="tab"]')[1] as HTMLButtonElement).click());
    if (role === 'PRODUCER') {
      await act(async () => (host.querySelectorAll('[role="radio"]')[1] as HTMLButtonElement).click());
    }
    await credentials();
    await submit();
    await finish();
    const onboarding = role === 'ARTIST' ? '/onboarding' : '/professional/onboarding';
    expect(host.querySelector('output')?.textContent).toBe(`${onboarding}?next=${encodeURIComponent(invitation)}`);
  });

  describe.each([null, '//example.test', '/\\example.test'])('fallback for %j', (next) => {
    it.each<UserRole>(['ARTIST', 'PRODUCER', 'STUDIO_ADMIN', 'ENGINEER', 'OIANO_ADMIN'])('retains the %s home', async (role) => {
      vi.mocked(api.post).mockResolvedValue(login(role));
      await render(next);
      await credentials();
      await submit();
      await finish();
      expect(host.querySelector('output')?.textContent).toBe(homePathForRole(role));
    });
  });

  it('does not navigate or authenticate after invalid credentials', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Invalid credentials' } } });
    await render();
    await credentials();
    await submit();
    await finish();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Invalid credentials');
    expect(host.querySelector('output')?.textContent).toContain('/enter?next=');
    expect(useAuthStore.getState().token).toBeNull();
  });
});
