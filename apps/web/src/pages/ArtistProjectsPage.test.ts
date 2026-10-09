import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArtistProjectsPage from './ArtistProjectsPage';
import { ToastProvider } from '../components/Toast';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

const project = {
  id: 'project-1', title: 'Night Drive', phase: 'TRACKING', notes: null, is_active: true, is_public: false,
  updated_at: '2026-10-01T00:00:00.000Z', producer: { id: 'producer-1', name: 'Project Lead', alias: null, avatar_url: null },
  bookings: [], files: [], collaborators: [], feedback: [], credits: [], promotional_consents: [], rights_agreements: [],
};
const session = { id: 'booking-1', starts_at: '2026-11-02T18:00:00.000Z', studio: { name: 'North Room', timezone: 'UTC' }, service: { name: 'Vocal tracking' } };

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Element.prototype.scrollIntoView = () => {};
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useAuthStore.setState({ user: { id: 'artist-user', email: 'artist@example.test', role: 'ARTIST' } });
  vi.mocked(api.get).mockImplementation(async (url: string) => ({
    data: url === '/artist-projects' ? [project] : url === '/artist-projects/project-1/available-sessions' ? [session] : [],
  }) as never);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  useAuthStore.setState({ user: null, token: null });
  vi.resetAllMocks();
});

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
async function render() {
  await act(async () => root.render(createElement(QueryClientProvider, { client },
    createElement(ToastProvider, null,
      createElement(MemoryRouter, { initialEntries: ['/projects?project=project-1'] }, createElement(ArtistProjectsPage))))));
  await settle();
}
const buttons = (text: string) => [...host.querySelectorAll('button')].filter(button => button.textContent === text);
async function click(element: Element | null | undefined) {
  await act(async () => { (element as HTMLElement).click(); });
  await settle();
}

describe('attaching a session from the artist\'s side', () => {
  it('lists the artist\'s own unattached sessions and attaches the one chosen to the project', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'booking-1', project_id: 'project-1' } } as never);
    await render();
    expect(vi.mocked(api.get).mock.calls.some(([url]) => String(url).includes('available-sessions'))).toBe(false);

    await click(buttons('+ Attach a session')[0]);
    expect(api.get).toHaveBeenCalledWith('/artist-projects/project-1/available-sessions');
    expect(host.textContent).toContain('Attaching shares the session, its messages and its deliverables with this project’s producer.');
    expect(host.textContent).toContain('Vocal tracking');

    await click(buttons('Attach')[0]);
    expect(api.post).toHaveBeenCalledWith('/artist-projects/project-1/bookings', { booking_id: 'booking-1' });
  });

  it('detaches an attached session only after the artist confirms', async () => {
    const attached = { ...session, id: 'booking-2', room: { name: 'A' } };
    vi.mocked(api.get).mockImplementation(async (url: string) => ({
      data: url === '/artist-projects' ? [{ ...project, bookings: [attached] }] : [],
    }) as never);
    vi.mocked(api.delete).mockResolvedValue({ data: undefined } as never);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await render();

    await click(buttons('Detach')[0]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(api.delete).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await click(buttons('Detach')[0]);
    expect(api.delete).toHaveBeenCalledWith('/artist-projects/project-1/bookings/booking-2');
    confirm.mockRestore();
  });

  it('offers no attach on an archived project', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => ({
      data: url === '/artist-projects' ? [{ ...project, is_active: false, phase: 'DELIVERED' }] : [],
    }) as never);
    await render();
    await click(buttons('DELIVERED 1')[0]);
    expect(host.textContent).toContain('Night Drive');
    expect(buttons('+ Attach a session')).toHaveLength(0);
  });
});
