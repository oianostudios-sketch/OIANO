import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EnterPage from './EnterPage';
import ProfessionalOnboardingPage from './ProfessionalOnboardingPage';
import { useAuthStore } from '../store/auth.store';

// A studio membership accepted by an artist or producer account grants no staff access
// today (audit C04): every staff route checks the account role. Signup and onboarding
// used to promise that the same creative identity could hold staff positions.
vi.mock('../lib/api', () => ({ api: { post: vi.fn(), patch: vi.fn(), get: vi.fn() } }));
vi.mock('../components/SignatureUniverse3D', () => ({ default: () => null }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // jsdom has no WebGL; the sign-in page then shows its flat backdrop.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useAuthStore.setState({ user: null, token: null } as never);
});

async function render(page: () => JSX.Element) {
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(page))));
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes(text));
  if (!button) throw new Error(`No button reading ${text}`);
  await act(async () => button.click());
}

const PROMISES = [/same identity/i, /added separately through verified studio onboarding/i, /invite this/i];

describe('studio access copy', () => {
  it('signup tells a creative professional that studio work needs a separate studio account', async () => {
    await render(EnterPage);
    await click('Create account');
    await click('Produce, engineer, write');
    const text = host.textContent ?? '';
    expect(text).toContain('running a studio or working on a studio’s staff needs a separate studio account');
    for (const promise of PROMISES) expect(text).not.toMatch(promise);
  });

  it('professional onboarding says this profile cannot hold studio access', async () => {
    useAuthStore.setState({ user: { id: 'u1', role: 'PRODUCER', email: 'p@example.test', producer: { name: 'Pro', disciplines: ['PRODUCER'] } }, token: 't' } as never);
    await render(ProfessionalOnboardingPage);
    const text = host.textContent ?? '';
    expect(text).toContain('this profile cannot hold studio access');
    for (const promise of PROMISES) expect(text).not.toMatch(promise);
  });
});
