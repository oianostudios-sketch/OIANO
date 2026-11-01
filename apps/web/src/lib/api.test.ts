import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './api';
import { useAuthStore } from '../store/auth.store';

// The interceptors are registered as handler pairs on the shared instance, so
// they can be invoked directly with a request config or an error shape. That
// keeps these tests about the branching logic itself rather than about mocking
// a whole HTTP layer.
const requestHandler = (api.interceptors.request as any).handlers[0].fulfilled;
const responseRejected = (api.interceptors.response as any).handlers[0].rejected;

function setLocation(pathname: string) {
  const assigned: string[] = [];
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      pathname,
      set href(value: string) { assigned.push(value); },
      get href() { return assigned[assigned.length - 1] ?? ''; },
      get assigned() { return assigned; },
    },
  });
  return assigned;
}

function reject(error: unknown) {
  // The interceptor always re-rejects; swallow it so assertions can run.
  return responseRejected(error).catch(() => undefined);
}

describe('shared api instance', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.setState({ token: null, user: null });
    setLocation('/dashboard');
  });

  it('sends no Authorization header when signed out', () => {
    const config = requestHandler({ headers: {} as Record<string, string> });
    expect(config.headers.Authorization).toBeUndefined();
  });

  it('attaches the bearer token from the auth store', () => {
    useAuthStore.setState({ token: 'token-abc', user: null });
    const config = requestHandler({ headers: {} as Record<string, string> });
    expect(config.headers.Authorization).toBe('Bearer token-abc');
  });

  it('a 401 logs the user out and sends them to /login', async () => {
    useAuthStore.setState({ token: 'token-abc', user: null });
    const assigned = setLocation('/dashboard');

    await reject({ config: { headers: { Authorization: 'Bearer token-abc' } }, response: { status: 401 } });

    expect(useAuthStore.getState().token).toBeNull();
    expect(assigned).toContain('/login');
  });

  it('keeps sign-in and MFA failures on /enter so the caller can show the error without losing next', async () => {
    useAuthStore.setState({ token: 'stale-session', user: null });
    const assigned = setLocation('/enter');
    const error = { config: { headers: { Authorization: 'Bearer stale-session' } }, response: { status: 401, data: { error: 'Invalid authenticator code' } } };

    await expect(responseRejected(error)).rejects.toBe(error);

    expect(useAuthStore.getState().token).toBeNull();
    expect(assigned).toEqual([]);
  });

  it('redirects to studio selection only for that specific 409', async () => {
    useAuthStore.setState({ token: 'token-abc', user: null });
    const assigned = setLocation('/dashboard');
    await reject({ config: { headers: { Authorization: 'Bearer token-abc' } }, response: { status: 409, data: { error: 'Active studio selection required' } } });
    expect(assigned).toContain('/select-studio');
  });

  // 409 is also an ordinary conflict elsewhere — a booking time-slot clash is
  // the common one. Redirecting on those would throw the user out of whatever
  // they were doing, so the interceptor matches the message, not just the code.
  it('leaves an unrelated 409 alone', async () => {
    const assigned = setLocation('/book');
    await reject({ response: { status: 409, data: { error: 'That time slot is already booked' } } });
    expect(assigned).toEqual([]);
  });

  it('does not redirect when already on the studio selection page', async () => {
    useAuthStore.setState({ token: 'token-abc', user: null });
    const assigned = setLocation('/select-studio');
    await reject({ config: { headers: { Authorization: 'Bearer token-abc' } }, response: { status: 409, data: { error: 'Active studio selection required' } } });
    expect(assigned).toEqual([]);
  });

  it.each([401, 409])('an old session response (%s) cannot expire or redirect the new account', async status => {
    useAuthStore.setState({ token: 'previous-session', user: null });
    const config = requestHandler({ headers: {} as Record<string, string> });
    useAuthStore.setState({ token: 'current-session', user: { id: 'current', email: 'current@example.test', role: 'PRODUCER' } });
    const assigned = setLocation('/producer/passport');
    const error = { config, response: { status, data: { error: status === 409 ? 'Active studio selection required' : 'Unauthorized' } } };
    await expect(responseRejected(error)).rejects.toBe(error);
    expect(useAuthStore.getState().token).toBe('current-session');
    expect(useAuthStore.getState().user?.id).toBe('current');
    expect(assigned).toEqual([]);
  });

  it('passes a network error through without touching the session', async () => {
    useAuthStore.setState({ token: 'token-abc', user: null });
    const assigned = setLocation('/dashboard');

    await reject({ message: 'Network Error' });

    expect(useAuthStore.getState().token).toBe('token-abc');
    expect(assigned).toEqual([]);
  });

  it('always rejects so callers still see the failure', async () => {
    const error = { response: { status: 500 } };
    await expect(responseRejected(error)).rejects.toBe(error);
  });

  it('scopes every request under /api', () => {
    expect(api.defaults.baseURL?.endsWith('/api')).toBe(true);
  });

  // A hung request with no timeout spins forever with no feedback.
  it('bounds requests with a timeout', () => {
    expect(api.defaults.timeout).toBeGreaterThan(0);
  });
});
