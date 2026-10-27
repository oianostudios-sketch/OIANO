import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CreativeIdentity from './CreativeIdentity';
import CurrentWork from './CurrentWork';
import PassportPage from '../pages/PassportPage';
import { ToastProvider } from './Toast';
import { useAuthStore } from '../store/auth.store';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const project = { id: 'project with spaces', title: 'Moving images and sound', phase: 'MIXING', is_active: true, producer: { name: 'Project lead', alias: 'Lead alias' } };
const person = { id: 'artist-1', name: 'Review person', alias: 'Chosen creative name', bio: 'I work across film, sound and installation.', passport: { collaboration_interests: ['Film', 'Installation'], creative_dna: {}, passport_code: 'REVIEW', profile_strength: 0 } };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(api.get).mockResolvedValue({ data: [project] });
  useAuthStore.setState({ user: { id: 'user-1', email: 'review@example.test', role: 'ARTIST', artist: { id: person.id, name: person.name } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  useAuthStore.setState({ user: null, token: null });
  vi.resetAllMocks();
});

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
async function render(element: ReactElement) {
  await act(async () => root.render(createElement(QueryClientProvider, { client },
    createElement(ToastProvider, null, createElement(MemoryRouter, null, element)))));
  await settle();
}

describe('person-first identity', () => {
  it('leads with the chosen name, actual bio and multiple interests, not the access role', async () => {
    await render(createElement(CreativeIdentity, { ...person, interests: person.passport.collaboration_interests }));
    expect(host.querySelector('h1')?.textContent).toBe(person.alias);
    expect(host.textContent).toContain(person.bio);
    expect([...host.querySelectorAll('li')].map(item => item.textContent)).toEqual(['Film', 'Installation']);
    expect(host.querySelector('details')?.open).toBe(false);
    expect(host.querySelector('details')?.textContent).toContain('does not grant permissions');
    expect(host.querySelector('img')).toBeNull();
  });

  it('uses the real name and honest empty copy without inventing a biography or discipline', async () => {
    await render(createElement(CreativeIdentity, { name: person.name, alias: '  ', bio: '' }));
    expect(host.querySelector('h1')?.textContent).toBe(person.name);
    expect(host.textContent).toContain('Your profile can describe');
    expect(host.querySelector('ul')).toBeNull();
  });

  it('keeps long identity text intact and renders supplied text, not markup', async () => {
    const name = 'LongName'.repeat(30);
    const bio = '<script>not executable</script>';
    await render(createElement(CreativeIdentity, { name, bio }));
    expect(host.querySelector('h1')?.textContent).toBe(name);
    expect(host.textContent).toContain(bio);
    expect(host.querySelector('script')).toBeNull();
  });
});

describe('current work', () => {
  it('opens the exact project, preserving its real title, lead and labelled phase', async () => {
    await render(createElement(CurrentWork));
    const link = host.querySelector('.creative-work-link');
    expect(link?.getAttribute('href')).toBe('/projects?project=project%20with%20spaces');
    expect(link?.textContent).toContain(project.title);
    expect(link?.textContent).toContain('Lead alias');
    expect(link?.textContent).toContain('Mixing');
    expect(api.get).toHaveBeenCalledWith('/artist-projects');
  });

  it('excludes archived and delivered work, caps the preview and retains the complete list link', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [
      { ...project, id: 'archived', title: 'Archived work', is_active: false },
      { ...project, id: 'delivered', title: 'Delivered work', phase: 'DELIVERED' },
      ...Array.from({ length: 6 }, (_, index) => ({ ...project, id: `${index}`, title: `Active ${index}`, producer: null })),
    ] });
    await render(createElement(CurrentWork));
    expect(host.querySelectorAll('.creative-work-link')).toHaveLength(4);
    expect(host.textContent).not.toContain('Archived work');
    expect(host.textContent).not.toContain('Delivered work');
    expect(host.textContent).toContain('Producer to be assigned');
    expect(host.querySelector('a[href="/projects"]')?.textContent).toContain('All projects');
  });

  it('offers invitations for a confirmed empty list', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    await render(createElement(CurrentWork));
    expect(host.querySelector('a[href="/contributions"]')).not.toBeNull();
    expect(host.textContent).not.toContain('couldn’t refresh');
  });

  it('shows loading rather than claiming there is no work', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    await render(createElement(CurrentWork));
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Loading your projects');
    expect(host.querySelector('.creative-work-empty')).toBeNull();
  });

  it('distinguishes failure from empty and successfully retries', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Unavailable'));
    await render(createElement(CurrentWork));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('couldn’t refresh');
    expect(host.querySelector('.creative-work-empty')).toBeNull();
    vi.mocked(api.get).mockResolvedValue({ data: [project] });
    await act(async () => host.querySelector('button')!.click());
    await settle();
    expect(host.querySelector('.creative-work-link')?.textContent).toContain(project.title);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('marks cached work as stale after a failed refresh, without discarding it', async () => {
    client.setQueryData(['artist-projects'], [project]);
    vi.mocked(api.get).mockRejectedValue(new Error('Unavailable'));
    await render(createElement(CurrentWork));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('may be out of date');
    expect(host.querySelector('.creative-work-link')).not.toBeNull();
  });
});

describe('Passport journey integration', () => {
  it('places identity before the card, opens the existing editor and links back to the exact work', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => ({
      data: url === '/passport/portfolio' ? { artist: { ...person, projects: [project] } } : url === '/bookings' ? [] : {},
    }));
    await render(createElement(PassportPage));
    expect(host.querySelector('h1')?.textContent).toBe(person.alias);
    const identity = host.querySelector('.creative-identity')!;
    const card = host.querySelector('.pp-card-col')!;
    expect(identity.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.querySelector('a[href="/projects?project=project%20with%20spaces"]')).not.toBeNull();
    expect(host.querySelector('.creative-actions a')?.getAttribute('href')).toBe('/projects');
    await act(async () => host.querySelector<HTMLButtonElement>('.creative-actions button')!.click());
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Edit Profile');
    expect(host.querySelector('label[for="profile-bio"]')?.textContent).toContain('Bio');
    expect(host.querySelector('label[for="profile-alias"]')?.textContent).toBe('Artist alias');
    expect(host.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(person.bio);
  });

  it('does not present a failed profile read as an empty identity and retries the real read', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/passport/portfolio') throw new Error('Unavailable');
      return { data: url === '/bookings' ? [] : {} };
    });
    await render(createElement(PassportPage));
    expect(host.textContent).toContain('We couldn’t load your artist passport.');
    expect(host.querySelector('.creative-identity')).toBeNull();
    vi.mocked(api.get).mockImplementation(async (url: string) => ({
      data: url === '/passport/portfolio' ? { artist: person } : url === '/bookings' ? [] : {},
    }));
    await act(async () => host.querySelector('button')!.click());
    await settle();
    expect(host.querySelector('h1')?.textContent).toBe(person.alias);
  });
});
