import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MyOrbit from './MyOrbit';
import EcosystemNetworkPage from '../pages/EcosystemNetworkPage';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

vi.mock('../lib/api', () => ({ api: { get: vi.fn() } }));
vi.mock('./NetworkMetrics', () => ({ default: () => createElement('p', null, 'Scoped metrics') }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const context = { self: 'Creative person', chain: [
  { kind: 'SELF', label: 'Creative person' },
  { kind: 'PROJECT', label: 'Sound and space' },
  { kind: 'PRODUCER', label: 'Project lead' },
  { kind: 'STUDIO', label: 'Session place' },
] };
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.setState({ user: { id: 'person', email: 'network@example.test', role: 'ARTIST' } });
  vi.mocked(api.get).mockResolvedValue({ data: context });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  useAuthStore.setState({ user: null, token: null });
  vi.resetAllMocks();
});
async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
}
async function render(component: ComponentType) {
  await act(async () => root.render(createElement(QueryClientProvider, { client },
    createElement(MemoryRouter, null, createElement(component)))));
  await settle();
}

it('represents only supplied context entries without claiming verified graph connections', async () => {
  await render(MyOrbit);
  expect([...host.querySelectorAll('li strong')].map(item => item.textContent)).toEqual(context.chain.map(item => item.label));
  expect(host.textContent).toContain('not proof of completed work');
  expect(host.textContent).not.toContain('Trusted connection');
  expect(host.querySelectorAll('a')).toHaveLength(0);
  expect(api.get).toHaveBeenCalledWith('/network/orbit');
});

it('makes a failed read explicit and recovers on retry', async () => {
  vi.mocked(api.get).mockRejectedValue(new Error('Unavailable'));
  await render(MyOrbit);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('couldn’t load');
  vi.mocked(api.get).mockResolvedValue({ data: context });
  await act(async () => host.querySelector('button')!.click());
  await settle();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.textContent).toContain('Sound and space');
});

it('retains cached context with a visible stale warning', async () => {
  client.setQueryData(['network-orbit'], context, { updatedAt: 1 });
  vi.mocked(api.get).mockRejectedValue(new Error('Unavailable'));
  await render(MyOrbit);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('out of date');
  expect(host.textContent).toContain('Sound and space');
});

it('distinguishes loading, empty and operational perspectives', async () => {
  vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
  await render(MyOrbit);
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Loading');
  client.setQueryData(['network-orbit'], { self: 'Creative person', chain: [] });
  await settle();
  expect(host.textContent).toContain('No work context');
  client.setQueryData(['network-orbit'], { self: null, chain: [], note: 'Individual context does not apply to this operational account.' });
  await settle();
  expect(host.textContent).toContain('Individual context does not apply');
});

it('separates recorded context, discovery and the explanatory access guide', async () => {
  await render(EcosystemNetworkPage);
  expect(host.textContent).toContain('Sound and space');
  expect(host.querySelector('a[href="/discover"]')).not.toBeNull();
  expect(host.querySelector('a[href="/producers"]')).not.toBeNull();
  expect(host.querySelector('a[href="/contributions"]')).not.toBeNull();
  const guide = host.querySelector('details');
  expect(guide?.open).toBe(false);
  expect(guide?.textContent).toContain('not a map of participants');
  expect(host.textContent).toContain('No public opportunity board');
  expect(host.querySelector('form')).toBeNull();
});
