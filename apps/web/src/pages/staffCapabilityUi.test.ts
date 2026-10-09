import { createElement, act, type FunctionComponent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminDashboardPage from './AdminDashboardPage';
import StudioTeamPage from './StudioTeamPage';
import { ToastProvider } from '../components/Toast';
import { useStudioCapabilities } from '../hooks/useStudioCapabilities';
import { activeMembership, membershipHolds, type MembershipResponse } from '../lib/studioCapabilities';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

// C34: the server refuses an operator action the caller's membership does not hold.
// The web app reads the same membership (GET /studio/memberships) and stops offering
// those actions, so a receptionist is not shown a team form, and a member without
// MANAGE_BOOKINGS is not shown a walk-in form, that would only be refused.

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('../components/NetworkExchangePanel', () => ({ default: () => null }));
vi.mock('../components/NotificationBell', () => ({ default: () => null }));
vi.mock('../components/StudioSwitcher', () => ({ default: () => null }));

const studio = { id: 'studio-1', name: 'Harbour Room', slug: 'harbour', logo_url: null };
const member = (role: string, capabilities: string[]) => ({ studio, role, position: 'X', capabilities });
const memberships = (membership: ReturnType<typeof member>, active: string | null = studio.id): MembershipResponse =>
  ({ active_studio_id: active, memberships: [membership] });

const RECEPTION = member('STUDIO_ADMIN', ['VIEW_CALENDAR', 'MANAGE_CALENDAR', 'MANAGE_BOOKINGS']);
const FINANCE_ONLY = member('STUDIO_ADMIN', ['VIEW_FINANCE']);
const LEGACY_OWNER = member('STUDIO_ADMIN', []);
const ENGINEER = member('ENGINEER', ['VIEW_CALENDAR', 'MANAGE_ASSIGNED_SESSIONS', 'UPLOAD_DELIVERABLES']);

describe('membershipHolds and activeMembership', () => {
  it('follows the server rule: the capability, or a STUDIO_ADMIN membership with none at all', () => {
    expect(membershipHolds(RECEPTION, 'MANAGE_BOOKINGS')).toBe(true);
    expect(membershipHolds(RECEPTION, 'MANAGE_STAFF')).toBe(false);
    expect(membershipHolds(LEGACY_OWNER, 'MANAGE_STAFF')).toBe(true);
    // An ENGINEER membership with no capabilities is not an owner.
    expect(membershipHolds(member('ENGINEER', []), 'MANAGE_BOOKINGS')).toBe(false);
    expect(membershipHolds(null, 'MANAGE_BOOKINGS')).toBe(false);
  });

  it('reads the active studio\'s membership, and none while a choice between several is pending', () => {
    const other = { ...LEGACY_OWNER, studio: { ...studio, id: 'studio-2' } };
    expect(activeMembership({ active_studio_id: 'studio-1', memberships: [other, RECEPTION] })).toBe(RECEPTION);
    expect(activeMembership({ active_studio_id: null, memberships: [RECEPTION] })).toBe(RECEPTION);
    expect(activeMembership({ active_studio_id: null, memberships: [other, RECEPTION] })).toBeNull();
    expect(activeMembership({ active_studio_id: null, memberships: [] })).toBeNull();
  });
});

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useAuthStore.setState({ user: { id: 'staff-user', email: 'staff@example.test', role: 'STUDIO_ADMIN' } } as never);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  useAuthStore.setState({ user: null, token: null } as never);
  vi.resetAllMocks();
});

const pendingBooking = {
  id: 'booking-1', status: 'PENDING', starts_at: '2026-10-20T10:00:00.000Z', ends_at: '2026-10-20T12:00:00.000Z',
  artist: { id: 'artist-1', name: 'Ada' }, room: { name: 'Room A' }, service: { name: 'Tracking' }, total_usd: '100',
};
function serve(membership: MembershipResponse) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/studio/memberships') return { data: membership } as never;
    if (url === '/bookings') return { data: [pendingBooking] } as never;
    if (url === '/studio/current') return { data: { id: studio.id, name: studio.name, timezone: 'UTC', rooms: [] } } as never;
    if (url === '/admin/analytics') return { data: { total_artists: 1 } } as never;
    if (url === '/studio/team') return { data: { studio, capabilities: [], members: [], invitations: [] } } as never;
    return { data: [] } as never;
  });
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
async function render(page: FunctionComponent) {
  await act(async () => root.render(createElement(QueryClientProvider, { client },
    createElement(ToastProvider, null, createElement(MemoryRouter, null, createElement(page))))));
  await settle();
}
const buttons = () => [...host.querySelectorAll('button')].map(button => button.textContent?.trim() ?? '');
const links = () => [...host.querySelectorAll('a')].map(link => link.getAttribute('href'));

describe('useStudioCapabilities', () => {
  function Probe() {
    const { can } = useStudioCapabilities();
    return createElement('p', null, ['MANAGE_BOOKINGS', 'MANAGE_STAFF', 'VIEW_FINANCE'].filter(can).join(',') || 'none');
  }

  it('answers for the active membership, from GET /studio/memberships', async () => {
    serve(memberships(RECEPTION));
    await render(Probe);
    expect(host.textContent).toBe('MANAGE_BOOKINGS');
    expect(vi.mocked(api.get)).toHaveBeenCalledWith('/studio/memberships');
  });

  it('gives the legacy owner everything and an engineer none of these', async () => {
    serve(memberships(LEGACY_OWNER));
    await render(Probe);
    expect(host.textContent).toBe('MANAGE_BOOKINGS,MANAGE_STAFF,VIEW_FINANCE');
    await act(async () => root.unmount());
    root = createRoot(host);
    client.clear();
    serve(memberships(ENGINEER));
    await render(Probe);
    expect(host.textContent).toBe('none');
  });

  it('holds nothing until the memberships arrive, or when they cannot be read', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('offline'));
    await render(Probe);
    expect(host.textContent).toBe('none');
  });
});

describe('AdminDashboardPage', () => {
  it('offers walk-ins and booking decisions to MANAGE_BOOKINGS, and the team only to MANAGE_STAFF', async () => {
    serve(memberships(RECEPTION));
    await render(AdminDashboardPage);
    expect(buttons().some(text => text.includes('Add walk-in'))).toBe(true);
    expect(buttons()).toContain('+ Walk-in');
    expect(buttons()).toContain('Confirm');
    expect(links()).not.toContain('/admin/team');
  });

  it('hides walk-ins and booking decisions from a member without MANAGE_BOOKINGS', async () => {
    serve(memberships(FINANCE_ONLY));
    await render(AdminDashboardPage);
    expect(buttons().some(text => text.includes('walk-in') || text.includes('Walk-in'))).toBe(false);
    expect(buttons()).not.toContain('Confirm');
    expect(links()).not.toContain('/admin/team');
  });

  it('shows the legacy owner everything', async () => {
    serve(memberships(LEGACY_OWNER));
    await render(AdminDashboardPage);
    expect(buttons().some(text => text.includes('Add walk-in'))).toBe(true);
    expect(buttons()).toContain('Confirm');
    expect(links()).toContain('/admin/team');
  });
});

describe('StudioTeamPage', () => {
  it('tells a member without MANAGE_STAFF why, and never asks the server for the team', async () => {
    serve(memberships(RECEPTION));
    await render(StudioTeamPage);
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/staff management permission/);
    expect(buttons()).not.toContain('Send secure invitation');
    expect(vi.mocked(api.get)).not.toHaveBeenCalledWith('/studio/team');
  });

  it('shows the team to the legacy owner', async () => {
    serve(memberships(LEGACY_OWNER));
    await render(StudioTeamPage);
    expect(buttons()).toContain('Send secure invitation');
    expect(vi.mocked(api.get)).toHaveBeenCalledWith('/studio/team');
  });
});
