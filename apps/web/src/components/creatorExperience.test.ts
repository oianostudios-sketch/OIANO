import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CreatorNavigation from './CreatorNavigation';
import NextAction from './NextAction';
import MobileBottomNav from './MobileBottomNav';
import { useAuthStore } from '../store/auth.store';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { get: vi.fn() } }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  useAuthStore.setState({ user: null, token: null });
  vi.resetAllMocks();
});

async function render(component: typeof CreatorNavigation | typeof NextAction | typeof MobileBottomNav, path = '/dashboard') {
  function CurrentPath() { return createElement('output', { 'aria-label': 'Current path' }, useLocation().pathname); }
  await act(async () => root.render(createElement(QueryClientProvider, { client },
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(component), createElement(CurrentPath)))));
}

describe('shared creator navigation', () => {
  it.each(['ARTIST', 'PRODUCER'] as const)('does not add a second mobile map for %s', async role => {
    useAuthStore.setState({ user: { id: 'test', email: 'demo@example.com', role } });
    await render(MobileBottomNav);
    expect(host.querySelector('nav')).toBeNull();
  });
  it.each(['STUDIO_ADMIN', 'ENGINEER'] as const)('keeps operational destinations for %s', async role => {
    useAuthStore.setState({ user: { id: 'test', email: 'demo@example.com', role } });
    await render(MobileBottomNav);
    expect([...host.querySelectorAll('button')].map(button => button.getAttribute('aria-label')))
      .toEqual(['Home', 'Calendar', 'Runsheet', role === 'STUDIO_ADMIN' ? 'Pulse' : 'Comms', 'Facilities']);
  });
  it.each(['ARTIST', 'PRODUCER'] as const)('exposes projects and contributions for %s', async role => {
    useAuthStore.setState({ user: { id: 'test', email: 'demo@example.com', role } });
    await render(CreatorNavigation);
    const links = [...host.querySelectorAll('a')];
    expect(links.map(a => a.textContent)).toEqual(['Home', 'Projects', 'Contributions', 'People', 'Passport', 'Messages', 'Account']);
    expect(links[1].getAttribute('href')).toBe(role === 'ARTIST' ? '/projects' : '/producer');
    expect(links[2].getAttribute('href')).toBe('/contributions');
    expect(links[4].getAttribute('href')).toBe(role === 'ARTIST' ? '/artist/passport' : '/producer/passport');
  });
  it('does not mark producer Projects active on Passport', async () => {
    useAuthStore.setState({ user: { id: 'test', email: 'demo@example.com', role: 'PRODUCER' } });
    await render(CreatorNavigation, '/producer/passport');
    expect([...host.querySelectorAll('[aria-current="page"]')].map(a => a.textContent)).toEqual(['Passport']);
  });
  it('keeps the contribution workspace within Contributions', async () => {
    useAuthStore.setState({ user: { id: 'test', email: 'demo@example.com', role: 'ARTIST' } });
    await render(CreatorNavigation, '/contributions/123/workspace');
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('Contributions');
  });
  it('opens contributions when the user follows that navigation link', async () => {
    useAuthStore.setState({ user: { id: 'test', email: 'demo@example.com', role: 'ARTIST' } });
    await render(CreatorNavigation);
    await act(async () => { (host.querySelector('a[href="/contributions"]') as HTMLAnchorElement).click(); });
    expect(host.querySelector('output')?.textContent).toBe('/contributions');
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('Contributions');
  });
  it('does not expose creator destinations to studio operators', async () => {
    useAuthStore.setState({ user: { id: 'test', email: 'demo@example.com', role: 'STUDIO_ADMIN' } });
    await render(CreatorNavigation);
    expect(host.querySelector('nav')).toBeNull();
  });
});

describe('next decision presentation', () => {
  function seed(kind: string, href = '/book') {
    client.setQueryData(['context'], { next: { kind, title: 'Server decision', detail: 'Source detail', href }, attention: [], money: { outstanding_usd: 0 } });
  }
  it.each(['NO_WORK_YET', 'ALL_CLEAR'])('%s offers projects and contributions without a booking sales prompt', async kind => {
    seed(kind);
    await render(NextAction);
    expect([...host.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(['/projects', '/contributions', '/discover']);
    expect(host.textContent).not.toContain('Book a session');
    expect(host.textContent).not.toContain('Start Work');
  });
  it('retains a real settlement decision and its source link', async () => {
    seed('BALANCE_DUE', '/bookings/real-booking');
    await render(NextAction);
    expect(host.querySelector('h2')?.textContent).toBe('Server decision');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/bookings/real-booking');
    expect(host.querySelector('a')?.textContent).toContain('Settle balance');
  });
  it('does not turn an unavailable context into an all-clear state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Unavailable'));
    await render(NextAction);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(host.textContent).toContain("We couldn't load what needs you");
    expect(host.textContent).not.toContain('Nothing needs a decision');
    expect(host.querySelector('button')?.textContent).toContain('Try again');
  });
  it('shows that decisions are still being checked while the request is pending', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    await render(NextAction);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Checking what needs your attention');
    expect(host.querySelector('a')).toBeNull();
  });
});
