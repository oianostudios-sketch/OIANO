import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ProjectWorkspaceHeader from './ProjectWorkspaceHeader';

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

const props: ComponentProps<typeof ProjectWorkspaceHeader> = {
  title: 'A project from the API', phase: 'MIXING', active: true,
  producerName: 'Actual producer', updatedLabel: 'Updated today',
  sessions: 2, collaborators: 3, files: 4,
};

async function render(overrides: Partial<typeof props> = {}) {
  await act(async () => root.render(createElement(ProjectWorkspaceHeader, { ...props, ...overrides })));
}

describe('project workspace presentation', () => {
  it('uses the supplied identity and counts, not prototype fixtures', async () => {
    await render();
    expect(host.querySelector('h2')?.textContent).toBe(props.title);
    expect(host.textContent).toContain('With Actual producer');
    expect([...host.querySelectorAll('dd')].map(item => item.textContent)).toEqual(['2', '3', '4']);
    expect(host.textContent).not.toMatch(/Bad Habits|DIYAA|GTGHV3|Malik|Sarah/);
    expect(host.querySelector('.project-workspace-art')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks only the actual phase, not completion or verification', async () => {
    await render();
    const current = host.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe('Mixing');
    expect(host.querySelectorAll('ol li')).toHaveLength(6);
    expect(host.textContent).toContain('Project phase, not a completion score');
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
    expect(host.textContent).not.toMatch(/verified|100%/i);
  });

  it('represents archived projects and zero counts without invented people', async () => {
    await render({ active: false, phase: 'DELIVERED', producerName: null, sessions: 0, collaborators: 0, files: 0 });
    expect(host.textContent).toContain('Archived project');
    expect(host.textContent).toContain('Producer to be assigned');
    expect(host.querySelector('[aria-current="step"]')?.textContent).toBe('Delivered');
    expect([...host.querySelectorAll('dd')].map(item => item.textContent)).toEqual(['0', '0', '0']);
  });

  it('exposes section shortcuts as native fragment links', async () => {
    await render();
    expect([...host.querySelectorAll('nav a')].map(item => item.getAttribute('href'))).toEqual([
      '#project-decisions', '#project-conversation', '#project-context', '#project-files',
    ]);
    expect(host.querySelector('[role="tab"]')).toBeNull();
  });
});
