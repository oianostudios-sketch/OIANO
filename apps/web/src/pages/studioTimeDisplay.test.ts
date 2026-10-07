import { createElement, act, type FunctionComponent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BookingDetailPage from './BookingDetailPage';
import ReceiptPage from './ReceiptPage';
import { ToastProvider } from '../components/Toast';
import { isoAngle } from '../components/SmartClock/smartClockModel';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

// A session at a studio in Auckland, 3 PM to 6 PM on Tuesday 6 October 2026,
// opened by an artist whose browser is in Los Angeles, where the same instants
// are 7 PM to 10 PM on Monday the 5th. Every time on these pages belongs to the
// studio, so the Los Angeles clock must not appear.
const booking = {
  id: 'booking-1', status: 'CONFIRMED',
  starts_at: '2026-10-06T02:00:00.000Z', ends_at: '2026-10-06T05:00:00.000Z',
  total_usd: '300', project_id: null, project: null, deliverables: [], payment: null, session_log: null, engineer: null,
  studio: { id: 'studio-akl', name: 'Harbour Room', timezone: 'Pacific/Auckland' },
  room: { name: 'Room A' }, service: { name: 'Tracking' },
  artist: { id: 'artist-1', name: 'Ada', alias: null, user_id: 'artist-user', user: { id: 'artist-user', email: 'ada@example.test' } },
};

const spaces = (value: string | null | undefined) => (value ?? '').replace(/[\s  ]+/g, ' ');

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let savedTz: string | undefined;

beforeEach(() => {
  savedTz = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // jsdom has no layout, and the booking conversation scrolls to its latest message.
  Element.prototype.scrollIntoView = () => {};
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useAuthStore.setState({ user: { id: 'artist-user', email: 'ada@example.test', role: 'ARTIST' } });
  vi.mocked(api.get).mockImplementation(async (url: string) => ({ data: url === '/bookings/booking-1' ? booking : [] }) as never);
  vi.spyOn(window, 'print').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  useAuthStore.setState({ user: null, token: null });
  vi.resetAllMocks();
  if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz;
});

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
async function render(path: string, pattern: string, page: FunctionComponent) {
  await act(async () => root.render(createElement(QueryClientProvider, { client },
    createElement(ToastProvider, null,
      createElement(MemoryRouter, { initialEntries: [path] },
        createElement(Routes, null, createElement(Route, { path: pattern, element: createElement(page) })))))));
  await settle();
}
async function click(element: Element | null | undefined) {
  await act(async () => { (element as HTMLElement).click(); });
  await settle();
}
const text = () => spaces(host.textContent);

describe('session times on booking pages, for a viewer outside the studio zone', () => {
  it('the booking page states the session in the studio clock, with its zone', async () => {
    await render('/bookings/booking-1', '/bookings/:id', BookingDetailPage);
    expect(text()).toContain('Tuesday, October 6, 2026');
    expect(text()).toContain('03:00 PM → 06:00 PM GMT+13 (3h)');
    expect(text()).not.toContain('07:00 PM');
  });

  it('reschedule starts from, and sends, the studio wall clock', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: booking } as never);
    await render('/bookings/booking-1', '/bookings/:id', BookingDetailPage);
    await click([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Reschedule this booking')));
    const date = host.querySelector('input[type="date"]') as HTMLInputElement;
    const time = host.querySelector('input[type="time"]') as HTMLInputElement;
    expect([date.value, time.value]).toEqual(['2026-10-06', '15:00']);
    await click([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Confirm new time')));
    // Unchanged fields name the same instants the booking already has.
    expect(api.patch).toHaveBeenCalledWith('/bookings/booking-1/reschedule', { starts_at: booking.starts_at, ends_at: booking.ends_at });
  });

  it('the receipt states the session in the studio clock and always names the zone', async () => {
    await render('/bookings/booking-1/receipt', '/bookings/:id/receipt', ReceiptPage);
    expect(text()).toContain('Tuesday, October 6, 2026');
    expect(text()).toContain('03:00 PM → 06:00 PM GMT+13 (3.0h)');
    expect(text()).not.toContain('07:00 PM');
  });
});

describe('the studio clock dial', () => {
  it('places a session at its hour of the studio day', () => {
    // 3 PM is 15/24 of the way round the studio's day; 7 PM would be the browser's.
    expect(isoAngle(booking.starts_at, 'Pacific/Auckland')).toBe(225);
    expect(isoAngle(booking.starts_at)).toBe(285);
  });
});
