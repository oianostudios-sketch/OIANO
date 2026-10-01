import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectDetailPage from './ProjectDetailPage';
import { ToastProvider } from '../components/Toast';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

const participant = (id: string, display_name: string, status: string, participant_ref_id: string | null) =>
  ({ id, display_name, email: `${id}@example.test`, role: 'SONGWRITER', status, participant_ref_id });
const project = {
  id: 'project-1', artist_id: null, artist: null, title: 'Night Drive', phase: 'TRACKING', notes: null, is_active: true,
  last_session_at: null, updated_at: '2026-09-14T00:00:00.000Z', created_at: '2026-09-01T00:00:00.000Z',
  bookings: [], credits: [], promotional_consents: [], rights_agreements: [],
  participants: [
    participant('unclaimed', 'Ada Writer', 'INVITED', null),
    participant('claimed', 'Ben Mixer', 'INVITED', 'user-ben'),
    participant('joined', 'Cy Engineer', 'ACTIVE', 'user-cy'),
  ],
};

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // jsdom has no layout, and the project conversation scrolls to its latest message.
  Element.prototype.scrollIntoView = () => {};
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useAuthStore.setState({ user: { id: 'lead', email: 'lead@example.test', role: 'PRODUCER' } });
  vi.mocked(api.get).mockImplementation(async (url: string) => ({
    data: url === '/producer/projects' ? [project] : url === '/producer/me' ? { id: 'producer-1', name: 'Project Lead', alias: null, passport: null } : [],
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
      createElement(MemoryRouter, { initialEntries: ['/producer/projects/project-1'] },
        createElement(Routes, null, createElement(Route, { path: '/producer/projects/:id', element: createElement(ProjectDetailPage) })))))));
  await settle();
}
const buttons = (text: string) => [...host.querySelectorAll('button')].filter(button => button.textContent === text);
async function click(element: Element | null | undefined) {
  await act(async () => { (element as HTMLElement).click(); });
  await settle();
}
async function type(placeholder: string, value: string) {
  const input = host.querySelector(`input[placeholder="${placeholder}"]`) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const linkShownFor = (name: string) => (host.querySelector(`input[aria-label="Invitation link for ${name}"]`) as HTMLInputElement | null)?.value;

describe('contribution invitation links on the project page', () => {
  it('shows the link for the invitation just made, until the lead dismisses it', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { ...participant('new', 'Dee Vocals', 'INVITED', null), invite_url: 'http://localhost:5173/accept-contribution?token=first-link' } } as never);
    await render();
    await click(buttons('+ Invite contributor')[0]);
    await type('Name', 'Dee Vocals');
    await type('Their email, for your records', 'dee@example.test');
    await click(buttons('Invite')[0]);

    expect(api.post).toHaveBeenCalledWith('/producer/projects/project-1/participants', { display_name: 'Dee Vocals', email: 'dee@example.test', role: 'FEATURED_ARTIST' });
    expect(linkShownFor('Dee Vocals')).toBe('http://localhost:5173/accept-contribution?token=first-link');
    await click(host.querySelector('button[aria-label="Dismiss invitation link"]'));
    expect(host.querySelector('input[aria-label^="Invitation link"]')).toBeNull();
  });

  it('offers a new link only while nobody has claimed the invitation, and keeps the email as a hint', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { invite_url: 'http://localhost:5173/accept-contribution?token=replacement' } } as never);
    await render();
    expect(host.textContent).toContain('unclaimed@example.test');
    expect(host.textContent).toContain('Link not claimed');
    expect(host.textContent).toContain('Awaiting answer');
    expect(buttons('New link')).toHaveLength(1);

    await click(buttons('New link')[0]);
    expect(api.post).toHaveBeenCalledWith('/producer/projects/project-1/participants/unclaimed/invitation', {});
    expect(linkShownFor('Ada Writer')).toBe('http://localhost:5173/accept-contribution?token=replacement');
  });
});
