import axios from 'axios';
import { useAuthStore } from '../store/auth.store';

export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api`,
  headers: { 'Content-Type': 'application/json' },
  // Without this, a hung request (a stalled connection, a backend under
  // heavy load) spins forever with no feedback. File uploads use a direct
  // fetch() to a presigned URL, not this instance, so a large upload is
  // never subject to this timeout.
  timeout: 20_000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    // studioScope.middleware.ts throws exactly this 409 when a staff member
    // belongs to 2+ studios with none active — every studio-scoped request
    // fails with it until they pick one. Matched on the specific message,
    // not just the status code: 409 is also a normal conflict response
    // elsewhere (e.g. a booking time-slot clash), which must NOT redirect
    // the user away from whatever they were doing.
    if (
      err.response?.status === 409 &&
      err.response?.data?.error === 'Active studio selection required' &&
      window.location.pathname !== '/select-studio'
    ) {
      window.location.href = '/select-studio';
    }
    return Promise.reject(err);
  }
);
