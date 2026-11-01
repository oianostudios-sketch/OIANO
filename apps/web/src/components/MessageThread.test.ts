import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MessageThread from './MessageThread';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

// IR-02: a conversation that failed to load said it was empty, and a message that
// failed to send gave no sign of it. Both variants share this component.
const unreachable = () => Object.assign(new Error('Network Error'), { response: undefined });
const message = (id: string, body: string, senderId = 'lead') => ({
  id, body, created_at: '2026-10-27T10:00:00.000Z', sender: { id: senderId, role: 'PRODUCER', producer: { name: 'Project Lead' } },
});

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
  useAuthStore.setState({ user: { id: 'me', email: 'me@example.test', role: 'ARTIST' } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  useAuthStore.setState({ user: null, token: null });
  vi.resetAllMocks();
});

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
async function render(variant: 'booking' | 'project') {
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(MessageThread, {
    variant, endpoint: '/thread', queryKey: ['thread', variant], sseMatch: () => false,
    title: 'Conversation', emptyTitle: 'No messages yet', emptySubtitle: 'Say hello.', placeholder: 'Write a message',
  }))));
  await settle();
}
const alert = () => host.querySelector('[role="alert"]')?.textContent ?? null;
const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const field = () => host.querySelector('[placeholder="Write a message"]') as HTMLInputElement | HTMLTextAreaElement;
async function click(element: HTMLElement | undefined) {
  expect(element).toBeTruthy();
  await act(async () => { element!.click(); });
  await settle();
}
async function type(value: string) {
  const input = field();
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const sendButton = () => host.querySelector('button[aria-label="Send message"]') as HTMLButtonElement;

describe.each(['booking', 'project'] as const)('the %s conversation', (variant) => {
  it('says it could not load, never that it is empty, and shows the messages once a retry succeeds', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(unreachable());
    await render(variant);

    expect(alert()).toContain("We couldn't load this conversation.");
    expect(host.textContent).not.toContain('No messages yet');
    expect(host.textContent).not.toContain('0 messages');

    vi.mocked(api.get).mockResolvedValueOnce({ data: [message('m1', 'Session moved to Friday')] } as never);
    await click(button('Try again'));

    expect(alert()).toBeNull();
    expect(host.textContent).toContain('Session moved to Friday');
  });

  it('shows the empty state only for a conversation that loaded with no messages', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as never);
    await render(variant);
    expect(alert()).toBeNull();
    expect(host.textContent).toContain('No messages yet');
  });

  it('keeps an unsent draft with a visible failure, and clears it only when a retry is sent', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as never);
    await render(variant);

    vi.mocked(api.post).mockRejectedValueOnce(unreachable());
    await type('See you at seven');
    await click(sendButton());

    expect(alert()).toContain("Your message wasn't sent");
    expect(field().value).toBe('See you at seven');

    vi.mocked(api.post).mockResolvedValueOnce({ data: message('m2', 'See you at seven', 'me') } as never);
    vi.mocked(api.get).mockResolvedValue({ data: [message('m2', 'See you at seven', 'me')] } as never);
    await click(button('Try again'));

    expect(api.post).toHaveBeenLastCalledWith('/thread', { body: 'See you at seven' });
    expect(alert()).toBeNull();
    expect(field().value).toBe('');
    expect(host.textContent).toContain('See you at seven');
  });
});
