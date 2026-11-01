import { createElement, act, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CreatorNavigation from './CreatorNavigation';
import NextAction from './NextAction';
import MobileBottomNav from './MobileBottomNav';
import DiscoverPage from '../pages/DiscoverPage';
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

async function render(component: ComponentType, path = '/dashboard') {
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
  it('keeps the network context within People rather than adding a competing navigation surface', async () => {
    useAuthStore.setState({ user: { id: 'test', email: 'demo@example.com', role: 'ARTIST' } });
    await render(CreatorNavigation, '/network');
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('People');
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
  it('offers the authorized project destination for a quiet professional home', async () => {
    useAuthStore.setState({ user: { id: 'professional', email: 'review@example.test', role: 'PRODUCER' } });
    seed('ALL_CLEAR');
    await render(NextAction);
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/producer');
    expect(host.querySelector('a[href="/projects"]')).toBeNull();
  });
  it('routes professional rights attention through contributions rather than an artist-only project page', async () => {
    useAuthStore.setState({ user: { id: 'professional', email: 'review@example.test', role: 'PRODUCER' } });
    seed('RIGHTS_DECISION_PENDING', '/projects?project=shared-work');
    await render(NextAction);
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/contributions');
    expect(host.querySelector('a')?.textContent).toContain('Review contributions');
  });
  it.each(['NO_WORK_YET', 'ALL_CLEAR'])('%s offers projects and contributions without a booking sales prompt', async kind => {
    seed(kind);
    await render(NextAction);
    expect([...host.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(['/projects', '/contributions', '/discover']);
    expect(host.textContent).not.toContain('Book a session');
    expect(host.textContent).not.toContain('Start Work');
  });
  it('does not imply a new account when the context has no pending decision', async () => {
    seed('NO_WORK_YET');
    await render(NextAction);
    expect(host.querySelector('h2')?.textContent).toBe('Choose your next creative step');
    expect(host.textContent).toContain('Return to a project');
  });
  it('retains a real settlement decision and its source link', async () => {
    seed('BALANCE_DUE', '/bookings/real-booking');
    await render(NextAction);
    expect(host.querySelector('h2')?.textContent).toBe('Server decision');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/bookings/real-booking');
    expect(host.querySelector('a')?.textContent).toContain('Review balance');
  });
  it('does not turn an unavailable context into an all-clear state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Unavailable'));
    await render(NextAction);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(host.textContent).toContain('We couldn’t load what needs you');
    expect(host.textContent).not.toContain('Nothing needs a decision');
    expect(host.querySelector('button')?.textContent).toContain('Try again');
  });
  it('shows that decisions are still being checked while the request is pending', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    await render(NextAction);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Checking what needs your attention');
    expect(host.querySelector('a')).toBeNull();
  });
  it('shows server-ranked secondary decisions and preserves their supplied destinations', async () => {
    client.setQueryData(['context'], {
      next: { kind: 'SESSION_IMMINENT', title: 'Session begins soon', detail: 'Check the room', href: '/bookings/primary' },
      attention: [
        { kind: 'BALANCE_DUE', title: 'Review balance', detail: 'A balance is due', href: '/bookings/settle-this' },
        { kind: 'CONSENT_REQUESTED', title: 'Review consent', detail: 'A collaborator asked', href: '/projects?project=exact-id' },
      ],
      attention_total: 3,
    });
    await render(NextAction);
    expect(host.querySelector('a[href="/bookings/primary"]')).not.toBeNull();
    expect(host.querySelector('a[href="/bookings/settle-this"]')).not.toBeNull();
    expect(host.querySelector('a[href="/projects?project=exact-id"]')).not.toBeNull();
    expect(host.textContent).toContain('3 items');
  });
});

describe('creator discovery', () => {
  const artist = {
    id: 'artist-1',
    name: 'Avery North',
    alias: 'A. North',
    bio: 'Sound for moving images.',
    avatar: null,
    profile_strength: 62,
    overlap_score: 4,
    shared_genres: ['Ambient'],
    shared_themes: ['Cinema'],
    creative_dna: { genres: ['Ambient', 'Electronic'], energy_profile: 'DREAMER' },
  };

  it('surfaces roster failures, preserves stale profiles, and retries the real endpoint', async () => {
    client.setQueryData(['discover'], [artist]);
    vi.mocked(api.get).mockRejectedValue(new Error('Unavailable'));
    useAuthStore.setState({ user: { id: 'artist-viewer', email: 'demo@example.com', role: 'ARTIST' } });
    await render(DiscoverPage, '/discover');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('may be out of date');
    expect(host.textContent).toContain('Avery North');
    vi.mocked(api.get).mockResolvedValue({ data: [artist] });
    await act(async () => host.querySelector<HTMLButtonElement>('.discover-read-error button')!.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/artists/discover');
  });

  it('exposes filter state accessibly and keeps connect restricted to artists', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [artist] });
    useAuthStore.setState({ user: { id: 'producer-viewer', email: 'demo@example.com', role: 'PRODUCER' } });
    await render(DiscoverPage, '/discover');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    const genre = host.querySelector<HTMLButtonElement>('.discover-filter-chip')!;
    expect(genre.getAttribute('aria-pressed')).toBe('false');
    await act(async () => genre.click());
    expect(genre.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('a[href="/connect/artist-1"]')).toBeNull();
    expect(host.querySelector('label[for="discover-search"]')).not.toBeNull();
    await act(async () => {
      useAuthStore.setState({ user: { id: 'artist-viewer', email: 'demo@example.com', role: 'ARTIST' } });
    });
    expect(host.querySelector('a[href="/connect/artist-1"]')).not.toBeNull();
  });

  it('distinguishes discovery from evidence and offers existing network destinations', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [artist] });
    await render(DiscoverPage, '/discover');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(host.querySelector('a[href="/producers"]')).not.toBeNull();
    expect(host.querySelector('a[href="/network"]')).not.toBeNull();
    expect(host.textContent).toContain('not evidence of completed work');
    expect(host.textContent).not.toContain('62%');
    expect(host.textContent).not.toContain('4 match');
    expect(host.textContent).not.toContain('ranked by creative DNA');
    expect(host.querySelector('a[href="/artists/artist-1"]')).not.toBeNull();
  });
});
