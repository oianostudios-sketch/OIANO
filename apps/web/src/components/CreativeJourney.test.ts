import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import CreativeIdentity from './CreativeIdentity';
import CurrentWork from './CurrentWork';
import UpcomingSessions, { type UpcomingBooking } from './UpcomingSessions';
import PassportPage from '../pages/PassportPage';
import ProducerDashboardPage from '../pages/ProducerDashboardPage';
import { ToastProvider } from './Toast';
import { useAuthStore } from '../store/auth.store';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const project = { id: 'project with spaces', title: 'Moving images and sound', phase: 'MIXING', is_active: true, producer: { name: 'Project lead', alias: 'Lead alias' } };
const contribution = { id: 'contribution with spaces', status: 'ACTIVE', role: 'SONGWRITER', project: { ...project, id: 'shared-project', title: 'A song made together' } };
const person = { id: 'artist-1', name: 'Review person', alias: 'Chosen creative name', bio: 'I work across film, sound and installation.', passport: { collaboration_interests: ['Film', 'Installation'], creative_dna: {}, passport_code: 'REVIEW', profile_strength: 0 } };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(api.get).mockImplementation(async endpoint => ({ data: endpoint === '/contributions/inbox' ? [] : [project] }));
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

  it('keeps the home identity compact without showing collaboration or access metadata', async () => {
    await render(createElement(CreativeIdentity, {
      ...person,
      interests: person.passport.collaboration_interests,
      compact: true,
    }));
    expect(host.querySelector('.creative-identity')?.classList.contains('is-compact')).toBe(true);
    expect(host.querySelector('h1')?.textContent).toBe(person.alias);
    expect(host.querySelector('ul')).toBeNull();
    expect(host.querySelector('.creative-access')).toBeNull();
  });
});

describe('current work', () => {
  it('surfaces waiting invitations without calling them accepted work', async () => {
    vi.mocked(api.get).mockImplementation(async endpoint => ({
      data: endpoint === '/contributions/inbox' ? [{ ...contribution, status: 'INVITED' }, { ...contribution, id: 'declined', status: 'DECLINED' }] : [],
    }));
    await render(createElement(CurrentWork));
    expect(host.querySelector('[aria-label="Contribution invitations"]')?.textContent).toContain('1 invitation waiting');
    expect(host.querySelector('.creative-work-link')).toBeNull();
  });
  it('uses the existing professional project cache and authorized project links for professionals', async () => {
    useAuthStore.setState({ user: { id: 'professional', email: 'review@example.test', role: 'PRODUCER' } });
    const profile = { projects: [{ ...project, producer: undefined, artist: { name: 'Project artist' } }] };
    client.setQueryData(['producer', 'me'], profile);
    vi.mocked(api.get).mockImplementation(async endpoint => ({ data: endpoint === '/producer/me' ? profile : [contribution] }));
    await render(createElement(CurrentWork));
    expect(api.get).not.toHaveBeenCalledWith('/artist-projects');
    expect(host.querySelector('a[href="/producer"]')?.textContent).toContain('All projects');
    expect(host.querySelector('a[href="/producer/projects/project%20with%20spaces"]')?.textContent).toContain('Project artist');
    expect(host.querySelector('a[href="/contributions/contribution%20with%20spaces/workspace"]')).not.toBeNull();
  });

  it('brings accepted collaborations home with the role and exact workspace link', async () => {
    vi.mocked(api.get).mockImplementation(async endpoint => ({
      data: endpoint === '/contributions/inbox' ? [contribution] : [],
    }));
    await render(createElement(CurrentWork));
    const link = host.querySelector('.creative-work-link');
    expect(link?.getAttribute('href')).toBe('/contributions/contribution%20with%20spaces/workspace');
    expect(link?.textContent).toContain(contribution.project.title);
    expect(link?.textContent).toContain('Your role: Songwriter');
    expect(link?.textContent).toContain('Lead alias');
    expect(link?.textContent).toContain('Mixing');
    expect(host.querySelector('.creative-work-empty')).toBeNull();
    expect(host.querySelector('a[href="/contributions"]')?.textContent).toContain('All contributions');
  });

  describe('professional home', () => {
    it('separates the attention and current-work home from the existing project board', async () => {
      useAuthStore.setState({ user: { id: 'professional', email: 'review@example.test', role: 'PRODUCER' } });
      const profile = {
        id: 'professional-profile', name: 'Creative person', alias: 'Sound practice',
        onboarding_complete: true, disciplines: ['Sound art'], projects: [project],
      };
      client.setQueryData(['producer', 'me'], profile);
      vi.mocked(api.get).mockImplementation(async endpoint => ({ data: endpoint === '/producer/me' ? profile : [] }));
      client.setQueryData(['context'], { next: { kind: 'ALL_CLEAR', detail: 'No pending decisions.' }, attention: [] });
      await render(createElement(ProducerDashboardPage, { home: true }));
      expect(host.querySelector('h1')?.textContent).toBe('Sound practice');
      expect(host.querySelector('[aria-label="What to do next"]')).not.toBeNull();
      expect(host.querySelector('#current-work-title')?.textContent).toBe('Your current work');
      expect(host.textContent).not.toContain('Project contribution board');
      expect(host.querySelector('a[href="/producer/passport"]')).not.toBeNull();
      expect(host.querySelector('a[href="/projects"]')).toBeNull();
    });

    it('shows a retryable read error instead of offering account setup after a failed profile read', async () => {
      useAuthStore.setState({ user: { id: 'professional', email: 'review@example.test', role: 'PRODUCER' } });
      vi.mocked(api.get).mockRejectedValue(new Error('Unavailable'));
      await render(createElement(ProducerDashboardPage, { home: true }));
      expect(host.querySelector('[role="alert"]')?.textContent).toContain('couldn’t load');
      expect(host.textContent).not.toContain('Set up your producer profile');
      vi.mocked(api.get).mockImplementation(async endpoint => ({
        data: endpoint === '/producer/me' ? { name: 'Recovered person', onboarding_complete: true, projects: [] }
          : endpoint === '/context' ? { next: { kind: 'ALL_CLEAR', detail: 'No pending decisions.' }, attention: [] } : [],
      }));
      await act(async () => host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
      await settle();
      expect(host.querySelector('h1')?.textContent).toBe('Recovered person');
      expect(host.querySelector('[role="alert"]')).toBeNull();
    });

    it('preserves actual missing-profile and incomplete-onboarding setup gates', async () => {
      const missing = new AxiosError('Not found', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 404, statusText: 'Not Found', data: {}, headers: {}, config: { headers: new AxiosHeaders() },
      });
      vi.mocked(api.get).mockRejectedValue(missing);
      await render(createElement(ProducerDashboardPage, { home: true }));
      expect(host.textContent).toContain('Set up your producer profile');
      expect(host.querySelector('#current-work-title')).toBeNull();
      client.clear();
      vi.mocked(api.get).mockResolvedValue({ data: { onboarding_complete: false } });
      await render(createElement(ProducerDashboardPage, { home: true }));
      expect(host.textContent).toContain('Complete professional setup');
      expect(host.querySelector('#current-work-title')).toBeNull();
    });
  });

  it('shows only accepted, ongoing contributions and avoids duplicate project cards', async () => {
    vi.mocked(api.get).mockImplementation(async endpoint => ({
      data: endpoint === '/contributions/inbox' ? [
        contribution,
        { ...contribution, id: 'second-role', role: 'COMPOSER' },
        ...['INVITED', 'DECLINED', 'CORRECTION_REQUESTED', 'REMOVED'].map(status => ({
          ...contribution, id: status, status, project: { ...project, id: status, title: status },
        })),
        { ...contribution, id: 'archived', project: { ...project, title: 'Archived collaboration', is_active: false } },
        { ...contribution, id: 'delivered', project: { ...project, title: 'Delivered collaboration', phase: 'DELIVERED' } },
      ] : [contribution.project, project],
    }));
    await render(createElement(CurrentWork));
    expect(host.querySelectorAll('.creative-work-link')).toHaveLength(2);
    expect(host.querySelector('.creative-work-link')?.textContent).toContain(contribution.project.title);
    expect(host.textContent).not.toContain('Archived collaboration');
    expect(host.textContent).not.toContain('Delivered collaboration');
    expect(host.textContent).not.toContain('Your role: Composer');
    for (const status of ['INVITED', 'DECLINED', 'CORRECTION_REQUESTED', 'REMOVED']) {
      expect(host.textContent).not.toContain(status);
    }
  });

  it('does not declare an empty account while contributions are still loading', async () => {
    vi.mocked(api.get).mockImplementation(endpoint => endpoint === '/contributions/inbox'
      ? new Promise(() => {})
      : Promise.resolve({ data: [] }));
    await render(createElement(CurrentWork));
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(host.querySelector('.creative-work-empty')).toBeNull();
  });

  it('keeps projects available when contributions fail and retries the failed read', async () => {
    vi.mocked(api.get).mockImplementation(async endpoint => {
      if (endpoint === '/contributions/inbox') throw new Error('Unavailable');
      return { data: [project] };
    });
    await render(createElement(CurrentWork));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('contributions');
    expect(host.querySelector('.creative-work-link')?.textContent).toContain(project.title);
    expect(host.querySelector('.creative-work-empty')).toBeNull();
    vi.mocked(api.get).mockImplementation(async endpoint => ({
      data: endpoint === '/contributions/inbox' ? [contribution] : [project],
    }));
    await act(async () => host.querySelector('button')!.click());
    await settle();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelectorAll('.creative-work-link')).toHaveLength(2);
  });

  it('keeps accepted work visible when the artist-project read fails', async () => {
    vi.mocked(api.get).mockImplementation(async endpoint => {
      if (endpoint === '/artist-projects') throw new Error('Unavailable');
      return { data: [contribution] };
    });
    await render(createElement(CurrentWork));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('projects');
    expect(host.querySelector('.creative-work-link')?.textContent).toContain(contribution.project.title);
    expect(host.querySelector('.creative-work-empty')).toBeNull();
  });

  it('opens the exact project, preserving its real title, lead and labelled phase', async () => {
    await render(createElement(CurrentWork));
    const link = host.querySelector('.creative-work-link');
    expect(link?.getAttribute('href')).toBe('/projects?project=project%20with%20spaces');
    expect(link?.textContent).toContain(project.title);
    expect(link?.textContent).toContain('Lead alias');
    expect(link?.textContent).toContain('Mixing');
    expect(api.get).toHaveBeenCalledWith('/artist-projects');
  });

  it('shows only supplied project collaborators without inventing cover art', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [{
      ...project,
      participants: [{ display_name: 'Actual collaborator' }],
    }] });
    await render(createElement(CurrentWork));
    expect(host.textContent).toContain('Actual collaborator');
    expect(host.querySelector('img')).toBeNull();
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
    vi.mocked(api.get).mockImplementation(async endpoint => {
      if (endpoint === '/artist-projects') throw new Error('Unavailable');
      return { data: [] };
    });
    await render(createElement(CurrentWork));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('couldn’t refresh');
    expect(host.querySelector('.creative-work-empty')).toBeNull();
    vi.mocked(api.get).mockImplementation(async endpoint => ({ data: endpoint === '/contributions/inbox' ? [] : [project] }));
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

  it('marks cached contributions as stale without hiding accepted work', async () => {
    client.setQueryData(['contribution-inbox'], [contribution]);
    vi.mocked(api.get).mockImplementation(async endpoint => {
      if (endpoint === '/contributions/inbox') throw new Error('Unavailable');
      return { data: [] };
    });
    await render(createElement(CurrentWork));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('may be out of date');
    expect(host.querySelector('.creative-work-link')?.textContent).toContain(contribution.project.title);
    expect(host.querySelector('.creative-work-empty')).toBeNull();
  });

  it('caps the combined preview while retaining both complete-list destinations', async () => {
    vi.mocked(api.get).mockImplementation(async endpoint => ({
      data: endpoint === '/contributions/inbox' ? [contribution] : Array.from({ length: 5 }, (_, index) => ({
        ...project, id: `project-${index}`,
      })),
    }));
    await render(createElement(CurrentWork));
    expect(host.querySelectorAll('.creative-work-link')).toHaveLength(4);
    expect(host.querySelector('.creative-work-link')?.textContent).toContain(contribution.project.title);
    expect(host.querySelector('a[href="/projects"]')).not.toBeNull();
    expect(host.querySelector('a[href="/contributions"]')).not.toBeNull();
  });
});

describe('upcoming sessions', () => {
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const booking: UpcomingBooking = {
    id: 'booking-123',
    starts_at: startsAt,
    ends_at: new Date(Date.parse(startsAt) + 60 * 60 * 1000).toISOString(),
    status: 'CONFIRMED',
    studio: { name: 'North Studio', timezone: 'UTC' },
    room: { name: 'Live Room' },
    service: { name: 'Recording' },
  };
  const props = (overrides: Partial<Parameters<typeof UpcomingSessions>[0]> = {}) => ({
    bookings: [booking],
    isLoading: false,
    isError: false,
    isFetching: false,
    onRetry: vi.fn(),
    ...overrides,
  });

  it('links each real upcoming booking and presents its actual session details', async () => {
    await render(createElement(UpcomingSessions, props()));
    expect(host.querySelector('a[href="/bookings/booking-123"]')?.textContent).toContain('Recording');
    expect(host.textContent).toContain('North Studio');
    expect(host.textContent).toContain('Live Room');
    expect(host.textContent).toContain('Confirmed');
  });

  it('does not present past or cancelled bookings as upcoming', async () => {
    const past = { ...booking, id: 'past', starts_at: new Date(Date.now() - 60_000).toISOString() };
    const cancelled = { ...booking, id: 'cancelled', status: 'CANCELLED' as const };
    await render(createElement(UpcomingSessions, props({ bookings: [past, cancelled] })));
    expect(host.querySelectorAll('.upcoming-session-row')).toHaveLength(0);
    expect(host.textContent).toContain('No upcoming sessions');
  });

  it('distinguishes loading from an empty calendar', async () => {
    await render(createElement(UpcomingSessions, props({ bookings: [], isLoading: true })));
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Checking your sessions');
    expect(host.querySelector('.upcoming-sessions-empty')).toBeNull();
  });

  it('shows stale bookings on error and calls the supplied retry action', async () => {
    const onRetry = vi.fn();
    await render(createElement(UpcomingSessions, props({ isError: true, onRetry })));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('may be out of date');
    expect(host.querySelector('a[href="/bookings/booking-123"]')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('.upcoming-sessions-error button')!.click());
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('offers calendar and booking links for a successful empty result', async () => {
    await render(createElement(UpcomingSessions, props({ bookings: [] })));
    expect(host.querySelector('.upcoming-sessions-empty a')?.getAttribute('href')).toBe('/book');
    expect(host.querySelector('.upcoming-sessions-calendar')?.getAttribute('href')).toBe('/calendar');
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
