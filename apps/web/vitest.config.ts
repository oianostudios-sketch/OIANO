import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.ts: that file carries the dev-server
// proxy and plugin setup the test run has no use for, and keeping them apart
// means a change to how the app is served can't quietly change how it's tested.
export default defineConfig({
  test: {
    // jsdom, not node: the highest-value units here are the auth store and the
    // shared axios instance, and both are defined by their interaction with
    // localStorage and window.location.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
});
