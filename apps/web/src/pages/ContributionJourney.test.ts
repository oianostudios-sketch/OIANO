import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContributionInboxPage from './ContributionInboxPage';
import ContributionWorkspacePage from './ContributionWorkspacePage';
import MessageThread from '../components/MessageThread';
import { ToastProvider } from '../components/Toast';
import { useAuthStore } from '../store/auth.store';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn() } }));
vi.mock('../components/MessageThread', () => ({ default: vi.fn(() => null) }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const invitation = {
  id: 'invited', display_name: 'DIYAA', email: null, role: 'SOUND_DESIGNER', status: 'INVITED', updated_at: '',
  credits: [],
  project: { id: 'project-1', title: 'Moving images', phase: 'MIXING', is_active: true, updated_at: '',
    producer: { name: 'Lead name', alias: 'GTGHV3', user_id: 'lead' }, artist: null, bookings: [] },
};
const credit = { id: 'credit-1', credited_name: 'DIYAA', participant_id: 'accepted', role: 'SOUND_DESIGNER', scope: 'Installation', status: 'DRAFT' };
const workspace = {
  id: 'accepted', display_name: 'DIYAA', role: 'SOUND_DESIGNER',
  project: { ...invitation.project, notes: 'Build a shared sound installation.',
    participants: [{ id: 'accepted', display_name: 'DIYAA', role: 'SOUND_DESIGNER' }],
    credits: [credit],
    rights_agreements: [{ id: 'rights-1', title: 'Master proposal', agreement_type: 'MASTER', status: 'DRAFT',
      shares: [{ id: 'share-1', holder_name: 'DIYAA', role: 'SOUND_DESIGNER', percentage: 10 }],
      decisions: [{ id: 'decision-1', holder_user_id: 'user-1', holder_name: 'DIYAA', status: 'PENDING' }] }],
  },
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.mocked(api.patch).mockResolvedValue({ data: {} });
  useAuthStore.setState({ user: { id: 'user-1', email: 'review@example.test', role: 'PRODUCER' } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  useAuthStore.setState({ user: null, token: null });
  vi.resetAllMocks();
});

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
async function render(element: ReactElement, path = '/contributions') {
  await act(async () => root.render(createElement(QueryClientProvider, { client },
    createElement(ToastProvider, null, createElement(MemoryRouter, { initialEntries: [path] }, element)))));
  await settle();
}
const renderWorkspace = () => render(createElement(Routes, null,
  createElement(Route, { path: '/contributions/:participantId/workspace', element: createElement(ContributionWorkspacePage) })),
  '/contributions/accepted/workspace');
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === text);
  expect(button, `button: ${text}`).toBeDefined();
  await act(async () => button!.click());
  await settle();
}

describe('contribution inbox journey', () => {
  it('does not present zero decisions or an empty list while loading', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    await render(createElement(ContributionInboxPage));
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Loading your contributions');
    expect(host.textContent).not.toContain('Invitations waiting');
    expect(host.textContent).not.toContain('No contribution invitations');
  });

  it('distinguishes failure from empty and refreshes the inbox on retry', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Unavailable'));
    await render(createElement(ContributionInboxPage));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not be refreshed');
    expect(host.textContent).not.toContain('Invitations waiting');
    vi.mocked(api.get).mockResolvedValue({ data: [invitation] });
    await click('Try again');
    expect(api.get).toHaveBeenLastCalledWith('/contributions/inbox');
    expect(host.textContent).toContain(invitation.project.title);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('explains a successful empty inbox without fabricating a workspace', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    await render(createElement(ContributionInboxPage));
    expect(host.textContent).toContain('No contribution invitations need your response');
    expect(host.querySelector('a[href$="/workspace"]')).toBeNull();
  });

  it('links only accepted contributions to their exact participant and labels archived context', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [
      invitation, { ...invitation, id: 'declined', status: 'DECLINED' },
      { ...invitation, id: 'correction', status: 'CORRECTION_REQUESTED' },
      { ...invitation, id: 'accepted with spaces', status: 'ACTIVE', project: { ...invitation.project, is_active: false } },
    ] });
    await render(createElement(ContributionInboxPage));
    const links = [...host.querySelectorAll('a[href$="/workspace"]')];
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/contributions/accepted%20with%20spaces/workspace');
    expect(links[0].textContent).toContain('DIYAA · Sound Designer · Mixing · Archived project');
    expect(links[0].textContent).toContain('Led by GTGHV3');
    expect(host.textContent).not.toContain('Active projects');
  });

  it.each(['Accept', 'Decline'])('preserves the %s request and query invalidations', async action => {
    vi.mocked(api.get).mockResolvedValue({ data: [invitation] });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await render(createElement(ContributionInboxPage));
    await click(action);
    expect(api.patch).toHaveBeenCalledWith('/contributions/invited/respond', { decision: action === 'Accept' ? 'ACCEPT' : 'DECLINE', note: undefined });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['contribution-inbox'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['network-metrics'] });
  });

  it('retains a failed correction draft and sends the unchanged note on retry', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [invitation] });
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue({ data: {} });
    await render(createElement(ContributionInboxPage));
    await click('Correct');
    const textarea = host.querySelector('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'Please clarify the scope.');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('Send request');
    expect(host.querySelector('textarea')?.value).toBe('Please clarify the scope.');
    await click('Send request');
    expect(api.patch).toHaveBeenLastCalledWith('/contributions/invited/respond', { decision: 'REQUEST_CORRECTION', note: 'Please clarify the scope.' });
    expect(host.querySelector('textarea')).toBeNull();
  });
});

describe('accepted contribution workspace', () => {
  beforeEach(() => vi.mocked(api.get).mockResolvedValue({ data: workspace }));

  it('renders actual role, brief and team with working section anchors and scoped conversation', async () => {
    await renderWorkspace();
    expect(api.get).toHaveBeenCalledWith('/contributions/accepted/workspace');
    expect(host.querySelector('#your-contribution-title')?.textContent).toBe('DIYAA');
    expect(host.textContent).toContain('sound designer');
    expect(host.textContent).toContain(workspace.project.notes);
    expect(host.querySelector('#contribution-team')?.textContent).toContain('DIYAA (you)');
    expect(host.querySelector('#contribution-team')?.textContent).toContain('GTGHV3');
    for (const link of host.querySelectorAll('.contribution-sections a, .contribution-next a')) {
      expect(host.querySelector(link.getAttribute('href')!)).not.toBeNull();
    }
    const props = vi.mocked(MessageThread).mock.calls.at(-1)![0];
    expect(props.endpoint).toBe('/projects/project-1/messages');
    expect(props.queryKey).toEqual(['project-messages', 'project-1']);
    expect(props.sseMatch?.({ type: 'new_project_message', projectId: 'project-1' })).toBe(true);
    expect(props.sseMatch?.({ type: 'new_project_message', projectId: 'another-project' })).toBe(false);
    expect(host.textContent).not.toContain('Your verified credits');
  });

  it('shows only this contribution’s proposed credits and this user’s pending ownership responses', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...workspace, project: { ...workspace.project,
      credits: [credit, { ...credit, id: 'other-credit', participant_id: 'someone-else' }],
      rights_agreements: [...workspace.project.rights_agreements, { ...workspace.project.rights_agreements[0], id: 'other-agreement', decisions: [{ ...workspace.project.rights_agreements[0].decisions[0], holder_user_id: 'someone-else' }] }],
    } } });
    await renderWorkspace();
    expect(host.querySelector('.contribution-next')?.textContent).toContain('Review 1 proposed credit');
    expect(host.querySelector('.contribution-next')?.textContent).toContain('Review 1 ownership proposal');
    expect([...host.querySelectorAll('button')].filter(item => item.textContent?.trim() === 'Confirm')).toHaveLength(1);
  });

  it('does not invent a brief, pending response or completion state', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...workspace, project: { ...workspace.project, notes: '', credits: [], rights_agreements: [] } } });
    await renderWorkspace();
    expect(host.textContent).toContain('No project brief has been recorded');
    expect(host.querySelector('.contribution-next')?.textContent).toContain('No credit or ownership response is waiting');
    expect(host.textContent).not.toContain('Review 0');
    expect(host.querySelector('.contribution-next a')?.getAttribute('href')).toBe('#contribution-conversation');
  });

  it('preserves credit and rights payloads without conflating the two decisions', async () => {
    await renderWorkspace();
    await click('Confirm');
    expect(api.patch).toHaveBeenLastCalledWith('/contributions/credits/credit-1/respond', { decision: 'CONFIRM' });
    await click('Approve my share');
    expect(api.patch).toHaveBeenLastCalledWith('/contributions/rights/rights-1/respond', { action: 'APPROVE', note: undefined });
    await click('Request correction');
    expect(api.patch).toHaveBeenLastCalledWith('/contributions/rights/rights-1/respond', { action: 'DISPUTE', note: 'The proposed share needs correction.' });
  });

  it('reports server failure as unavailable, not refused, and recovers on retry', async () => {
    vi.mocked(api.get).mockRejectedValue({ isAxiosError: true, response: { status: 503 } });
    await renderWorkspace();
    expect(host.textContent).toContain('Try again to check your contribution');
    expect(host.textContent).not.toContain('Only accepted contributors');
    expect(MessageThread).not.toHaveBeenCalled();
    vi.mocked(api.get).mockResolvedValue({ data: workspace });
    await click('Try again');
    expect(host.querySelector('#your-contribution-title')?.textContent).toBe('DIYAA');
  });

  it.each([403, 404])('does not expose project content when the API refuses with %s', async status => {
    vi.mocked(api.get).mockRejectedValue({ isAxiosError: true, response: { status } });
    await renderWorkspace();
    expect(host.textContent).toContain('not available to your account');
    expect(host.querySelector('a[href="/contributions"]')).not.toBeNull();
    expect(host.querySelector('button')).toBeNull();
    expect(MessageThread).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain(workspace.project.title);
  });
});
