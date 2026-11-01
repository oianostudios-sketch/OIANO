import { act, createElement, StrictMode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it } from 'vitest';
import AccountQueryProvider from './AccountQueryProvider';
import { useAuthStore } from '../store/auth.store';

let host: HTMLDivElement;
let root: Root;
let clients: QueryClient[];
const identity = (id: string) => ({ id, email: `${id}@example.test`, role: 'PRODUCER' as const });
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  clients = [];
  useAuthStore.setState({ user: identity('first'), token: 'first-session' });
});
afterEach(async () => {
  await act(async () => root.unmount());
  for (const client of clients) client.clear();
  host.remove();
  useAuthStore.setState({ user: null, token: null });
});
async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
}

it('discards cached reads, mutation state and component drafts when identity changes', async () => {
  function PrivateProfile() {
    const user = useAuthStore(state => state.user);
    const client = useQueryClient();
    if (!clients.includes(client)) clients.push(client);
    const [draft, setDraft] = useState('');
    const { data } = useQuery({ queryKey: ['producer-me'], queryFn: async () => user?.id ?? 'signed-out' });
    return createElement('section', null,
      createElement('output', null, data ?? 'Loading'),
      createElement('button', { onClick: () => setDraft('private unsent draft') }, 'Edit'),
      createElement('p', null, draft));
  }
  await act(async () => root.render(createElement(StrictMode, null, createElement(AccountQueryProvider, null, createElement(PrivateProfile)))));
  await settle();
  expect(host.querySelector('output')?.textContent).toBe('first');
  await act(async () => host.querySelector('button')!.click());
  const firstClient = clients[0];
  const mutation = firstClient.getMutationCache().build(firstClient, { mutationKey: ['private-mutation'] });
  mutation.state.data = 'first-account private result';
  await act(async () => useAuthStore.setState({ user: identity('second'), token: 'second-session' }));
  expect(host.querySelector('output')?.textContent).not.toBe('first');
  expect(host.textContent).not.toContain('private unsent draft');
  await settle();
  expect(host.querySelector('output')?.textContent).toBe('second');
  expect(firstClient.getQueryCache().getAll()).toHaveLength(0);
  expect(firstClient.getMutationCache().getAll()).toHaveLength(0);
  expect(clients.at(-1)).not.toBe(firstClient);
  await act(async () => useAuthStore.getState().logout());
  expect(host.querySelector('output')?.textContent).not.toBe('second');
  await settle();
  expect(host.querySelector('output')?.textContent).toBe('signed-out');
});

it('cancels old in-flight queries and cannot install their late result in the new session', async () => {
  let resolveFirst: (value: string) => void = () => { throw new Error('query did not start'); };
  let aborted = false;
  function PrivateRead() {
    const user = useAuthStore(state => state.user);
    const client = useQueryClient();
    if (!clients.includes(client)) clients.push(client);
    const { data } = useQuery({
      queryKey: ['private-work'],
      queryFn: ({ signal }) => {
        if (user?.id !== 'first') return Promise.resolve('second account work');
        signal.addEventListener('abort', () => { aborted = true; });
        return new Promise<string>(resolve => { resolveFirst = resolve; });
      },
    });
    return createElement('output', null, data ?? 'Loading');
  }
  await act(async () => root.render(createElement(AccountQueryProvider, null, createElement(PrivateRead))));
  await act(async () => useAuthStore.setState({ user: identity('second'), token: 'second-session' }));
  await settle();
  expect(host.textContent).toBe('second account work');
  expect(aborted).toBe(true);
  await act(async () => resolveFirst('first account private work'));
  await settle();
  expect(host.textContent).toBe('second account work');
  expect(clients[0].getQueryCache().getAll()).toHaveLength(0);
});

it('preserves the current account cache and draft when only its token changes', async () => {
  let reads = 0;
  function CurrentAccount() {
    const client = useQueryClient();
    if (!clients.includes(client)) clients.push(client);
    const [draft, setDraft] = useState('');
    const { data } = useQuery({
      queryKey: ['current-work'],
      queryFn: async () => { reads += 1; return 'current work'; },
    });
    return createElement('section', null,
      createElement('output', null, data ?? 'Loading'),
      createElement('button', { onClick: () => setDraft('keep this draft') }, 'Edit'),
      createElement('p', null, draft));
  }
  await act(async () => root.render(createElement(AccountQueryProvider, null, createElement(CurrentAccount))));
  await settle();
  await act(async () => host.querySelector('button')!.click());
  await act(async () => useAuthStore.setState({ token: 'refreshed-session' }));
  await settle();
  expect(reads).toBe(1);
  expect(clients).toHaveLength(1);
  expect(host.textContent).toContain('keep this draft');
});
