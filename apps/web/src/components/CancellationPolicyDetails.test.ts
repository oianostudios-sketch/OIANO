import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import CancellationPolicyDetails from './CancellationPolicyDetails';

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
});

it('does not promise unresolved cancellation fees or wallet refunds for pilot sessions', async () => {
  await act(async () => root.render(createElement(CancellationPolicyDetails, { walletEnabled: false })));

  expect(host.textContent).toContain('Cancellation terms for pilot sessions are not available here yet.');
  expect(host.textContent).toContain('Please contact the studio before changing your session.');
  expect(host.textContent).not.toMatch(/credits|wallet|72h|48h|24h|no extra charge|full session cost/i);
});

it('preserves the existing cancellation copy when wallet settlement is enabled', async () => {
  await act(async () => root.render(createElement(CancellationPolicyDetails, { walletEnabled: true })));

  expect(host.textContent).toContain('Your credits are returned in full.');
  expect(host.textContent).toContain('50% of session credits are retained.');
  expect(host.textContent).toContain('The rest return to your wallet.');
});
