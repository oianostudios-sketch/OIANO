import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSSE } from './useSSE';
import { ToastProvider } from '../components/Toast';
import { useAuthStore } from '../store/auth.store';

// The live stream has no replay, so a message sent while it was down arrives only
// if the open conversation re-reads when the stream comes back.
class FakeEventSource {
  static opened: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeEventSource.opened.push(this); }
  close() {}
}

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, EventSource: FakeEventSource });
  FakeEventSource.opened = [];
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ticket: 'ticket' }) })));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  useAuthStore.setState({ token: 'token', user: { id: 'me', email: 'me@example.test', role: 'ARTIST' } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  useAuthStore.setState({ user: null, token: null });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const flush = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });

describe('useSSE reconnection', () => {
  it('re-reads open project and booking conversations when the stream comes back, not on first connect', async () => {
    vi.useFakeTimers();
    const reads = { project: 0, booking: 0 };
    function Harness() {
      useSSE();
      useQuery({ queryKey: ['project-messages', 'p1'], queryFn: async () => { reads.project += 1; return []; } });
      useQuery({ queryKey: ['booking-messages', 'b1'], queryFn: async () => { reads.booking += 1; return []; } });
      return null;
    }
    await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ToastProvider, null, createElement(Harness)))));
    await flush();

    const first = FakeEventSource.opened[0];
    await act(async () => first.onopen!());
    await flush();
    expect(reads).toEqual({ project: 1, booking: 1 });

    await act(async () => first.onerror!());
    await act(async () => { vi.advanceTimersByTime(1_000); });
    await flush();
    const second = FakeEventSource.opened[1];
    expect(second).toBeDefined();
    await act(async () => second.onopen!());
    await flush();

    expect(reads).toEqual({ project: 2, booking: 2 });
  });
});
