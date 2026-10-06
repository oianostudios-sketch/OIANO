import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AcceptContributionInvitePage from './AcceptContributionInvitePage';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { post: vi.fn() } }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.resetAllMocks();
});

async function render(path: string) {
  function CurrentLocation() {
    const { pathname, search } = useLocation();
    return createElement('output', { 'aria-label': 'Current location' }, pathname + search);
  }
  await act(async () => root.render(createElement(QueryClientProvider, { client },
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(AcceptContributionInvitePage), createElement(CurrentLocation)))));
}

async function claim() {
  await act(async () => { (host.querySelector('button') as HTMLButtonElement).click(); });
  // The mutation settles, and React Query reports it, on a later tick.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
}

describe('claiming a contribution invitation', () => {
  it('sends the token from the link, then opens the inbox where the role is decided', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'participant-1', project_id: 'project-1', status: 'INVITED' } } as never);
    await render('/accept-contribution?token=link-from-the-project-lead');
    await claim();
    expect(api.post).toHaveBeenCalledWith('/contributions/claim', { token: 'link-from-the-project-lead' });
    expect(host.querySelector('output')?.textContent).toBe('/contributions');
  });

  it('says why a spent or expired link was refused, and stays on the link', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'That invitation is no longer valid' } } });
    await render('/accept-contribution?token=spent-link');
    await claim();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('That invitation is no longer valid');
    expect(host.querySelector('output')?.textContent).toBe('/accept-contribution?token=spent-link');
  });

  it('offers nothing to claim without a link', async () => {
    await render('/accept-contribution');
    expect((host.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
