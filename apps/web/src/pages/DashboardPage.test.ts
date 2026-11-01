import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

vi.mock('../lib/api', () => ({ api: { get: vi.fn() } }));
vi.mock('../context/StudioState', () => ({ useStudioState: () => ({ isLive: false, todaySessions: [] }) }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ info: vi.fn() }) }));
vi.mock('../components/ProfileEditDrawer', () => ({ default: () => null }));
vi.mock('../components/NotificationBell', () => ({ default: () => null }));
vi.mock('../components/ArtistStatusToggle', () => ({ default: () => null }));
vi.mock('../components/SessionStats', () => ({ default: () => null }));
vi.mock('../components/MySignal', () => ({ default: () => createElement('p', null, 'Signal detail') }));
vi.mock('../components/MyOrbit', () => ({ default: () => createElement('p', null, 'Orbit detail') }));
vi.mock('../components/OianoNow', () => ({ default: () => createElement('p', null, 'Network detail') }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.setState({ user: { id: 'artist', email: 'home@example.test', role: 'ARTIST', artist: { id: 'profile', name: 'Creative person' } } });
  vi.mocked(api.get).mockImplementation(async endpoint => ({
    data: endpoint === '/context' ? { next: { kind: 'ALL_CLEAR', detail: 'No pending decisions.' }, attention: [] }
      : endpoint === '/passport/portfolio' ? {}
        : endpoint === '/admin/announcements' ? [{ id: 'notice', title: 'Studio update', body: 'Announcement text' }] : [],
  }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  useAuthStore.setState({ user: null, token: null });
  vi.resetAllMocks();
});

it('keeps attention, current work and sessions ahead of optional network detail', async () => {
  await act(async () => root.render(createElement(QueryClientProvider, { client },
    createElement(MemoryRouter, null, createElement(DashboardPage)))));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  const main = host.querySelector('main')!;
  const attention = main.querySelector('[aria-label="What to do next"]')!;
  const work = main.querySelector('.creative-current-work')!;
  const network = main.querySelector('[aria-label="Network activity and connections"]')!;
  const disclosure = network.closest('details')!;
  expect(disclosure).not.toBeNull();
  expect(main.querySelector('#upcoming-sessions-title')!.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(attention.compareDocumentPosition(work) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(work.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(disclosure.open).toBe(false);
  expect(Array.from(main.querySelectorAll('details')).find(item => item.querySelector('summary')?.textContent === 'Your creative profile details')?.open).toBe(false);
  expect(disclosure.textContent).toContain('Signal detail');
  expect(disclosure.textContent).toContain('Orbit detail');
  expect(main.querySelector('a[href="/contributions"]')).not.toBeNull();
  const dismiss = host.querySelector<HTMLButtonElement>('[aria-label="Dismiss studio announcement"]')!;
  expect(dismiss).not.toBeNull();
  await act(async () => dismiss.click());
  expect(host.textContent).not.toContain('Announcement text');
});
