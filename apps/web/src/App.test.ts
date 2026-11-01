import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useAuthStore } from './store/auth.store';
import type { UserRole } from './lib/accountArchitecture';

vi.mock('./hooks/useSSE', () => ({ useSSE: vi.fn() }));
vi.mock('./context/StudioState', () => ({ StudioStateProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('./components/MobileBottomNav', () => ({ default: () => null }));
vi.mock('./components/CreatorNavigation', () => ({ default: () => null }));
vi.mock('./components/StudioStatusBar', () => ({ default: () => null }));
vi.mock('./components/ArtistStatusToggle', () => ({ default: () => null }));
vi.mock('./components/CommandPalette', () => ({ default: () => null }));
vi.mock('./components/EcosystemNetworkPanel', () => ({ default: () => null }));
vi.mock('./components/FeedbackWidget', () => ({ default: () => null }));
vi.mock('./pages/PassportPage', () => ({ default: () => 'Artist Passport' }));
vi.mock('./pages/ProducerPassportPage', () => ({ default: () => 'Professional Passport' }));
vi.mock('./pages/EngineerDashboardPage', () => ({ default: () => 'Engineer Home' }));
vi.mock('./pages/AdminDashboardPage', () => ({ default: () => 'Studio Home' }));
vi.mock('./pages/MaintenancePage', () => ({ default: () => 'Platform Home' }));
vi.mock('./pages/EnterPage', () => ({ default: () => 'Sign in' }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useAuthStore.setState({ user: null, token: null });
});
async function render(path: string, role?: UserRole) {
  useAuthStore.setState({
    user: role ? { id: 'routing-test', email: 'routing@example.test', role } : null,
    token: role ? 'routing-test-session' : null,
  });
  function CurrentLocation() {
    const location = useLocation();
    return createElement('output', { 'aria-label': 'Current location' }, location.pathname + location.search + location.hash);
  }
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: [path] },
    createElement(App), createElement(CurrentLocation))));
}

describe.each(['/profile', '/passport'])('%s legacy alias', alias => {
  it.each([
    ['ARTIST', '/artist/passport', 'Artist Passport'],
    ['PRODUCER', '/producer/passport', 'Professional Passport'],
    ['ENGINEER', '/dashboard', 'Engineer Home'],
    ['STUDIO_ADMIN', '/admin', 'Studio Home'],
    ['OIANO_ADMIN', '/maintenance', 'Platform Home'],
  ] as const)('sends %s to its existing authorized destination', async (role, destination, content) => {
    await render(alias, role);
    expect(host.querySelector('output')?.textContent).toBe(destination);
    expect(host.textContent).toContain(content);
    expect(host.textContent).not.toContain('outside your current access');
  });
  it('keeps the original destination through sign-in', async () => {
    await render(`${alias}?section=credits`);
    const location = host.querySelector('output')?.textContent;
    expect(location).toBe(`/enter?next=${encodeURIComponent(`${alias}?section=credits`)}`);
    expect(host.textContent).toContain('Sign in');
  });
  it('retains the profile query and section for an authenticated professional', async () => {
    await render(`${alias}?section=credits#credits`, 'PRODUCER');
    expect(host.querySelector('output')?.textContent).toBe('/producer/passport?section=credits#credits');
  });
});

it.each([
  ['PRODUCER', '/artist/passport'],
  ['ARTIST', '/producer/passport'],
] as const)('does not widen the %s account permissions', async (role, path) => {
  await render(path, role);
  expect(host.querySelector('output')?.textContent).toBe(path);
  expect(host.textContent).toContain('outside your current access');
});
