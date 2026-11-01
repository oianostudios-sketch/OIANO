import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfessionalOnboardingPage from './ProfessionalOnboardingPage';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { disciplineLabel } from '../lib/creativeDisciplines';

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

async function fillPractice(value: string) {
  const input = host.querySelector<HTMLInputElement>('#custom-practice')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function addPractice() {
  await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Add practice')!.click());
}

describe('self-described creative practice', () => {
  it('displays authored labels without replacing them with a professional classification', () => {
    expect(disciplineLabel('Sound and spatial storytelling')).toBe('Sound and spatial storytelling');
    expect(disciplineLabel('MIX_ENGINEER')).toBe('Mix engineer');
    expect(disciplineLabel('  ')).toBe('Creative professional');
  });

  it('adds a self-written practice, makes it primary and saves through the existing contract', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    vi.mocked(api.get).mockResolvedValue({ data: user });
    await render(null);
    await fillPractice('  Sound and spatial storytelling  ');
    await addPractice();
    const custom = host.querySelector('[data-custom-practice]');
    expect(custom?.textContent).toContain('Sound and spatial storytelling');
    await act(async () => custom!.querySelector<HTMLButtonElement>('[aria-label^="Make"]')!.click());
    await complete();
    expect(api.patch).toHaveBeenCalledWith('/producer/me', expect.objectContaining({
      primary_discipline: 'Sound and spatial storytelling',
      disciplines: ['PRODUCER', 'Sound and spatial storytelling'],
    }));
  });

  it('rejects duplicate and empty labels explicitly and preserves the six-label limit', async () => {
    await render(null);
    await fillPractice('producer');
    await addPractice();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('already selected');
    await fillPractice('   ');
    await addPractice();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Enter');
    for (let index = 0; index < 5; index++) {
      await fillPractice(`Practice ${index}`);
      await addPractice();
    }
    await fillPractice('Seventh practice');
    await addPractice();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('six');
    expect(host.querySelectorAll('[data-custom-practice]')).toHaveLength(5);
  });

  it('retains existing authored practices on revisit and selects a valid primary after removal', async () => {
    useAuthStore.getState().setAuth('synthetic-session', {
      ...user, producer: { ...user.producer, disciplines: ['Sound art', 'PRODUCER'], primary_discipline: 'Sound art' },
    });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    vi.mocked(api.get).mockResolvedValue({ data: user });
    await render(null);
    expect(host.querySelector('[data-custom-practice]')?.textContent).toContain('Sound art');
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Remove Sound art"]')!.click());
    await complete();
    expect(api.patch).toHaveBeenCalledWith('/producer/me', expect.objectContaining({
      disciplines: ['PRODUCER'], primary_discipline: 'PRODUCER',
    }));
  });

  it('adds a suggested display label through Enter using its existing identifier', async () => {
    await render(null);
    await fillPractice('mix engineer');
    await act(async () => host.querySelector('#custom-practice')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    expect(api.patch).not.toHaveBeenCalled();
    expect(host.querySelectorAll('[data-custom-practice]')).toHaveLength(0);
    await fillPractice('MIX_ENGINEER');
    await addPractice();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('already selected');
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    vi.mocked(api.get).mockResolvedValue({ data: user });
    await complete();
    expect(api.patch).toHaveBeenCalledWith('/producer/me', expect.objectContaining({
      disciplines: ['PRODUCER', 'MIX_ENGINEER'],
    }));
  });

  it('keeps the final authored practice and enforces the API label length', async () => {
    useAuthStore.getState().setAuth('synthetic-session', {
      ...user, producer: { ...user.producer, disciplines: ['Sound art'], primary_discipline: 'PRODUCER' },
    });
    await render(null);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Remove Sound art"]')?.disabled).toBe(true);
    expect(host.querySelector('[aria-label="Make Sound art primary"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector<HTMLInputElement>('#custom-practice')?.maxLength).toBe(60);
    await fillPractice('x'.repeat(61));
    await addPractice();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('60');
    await fillPractice('x'.repeat(60));
    await addPractice();
    expect(host.querySelectorAll('[data-custom-practice]')).toHaveLength(2);
  });
});

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
