'use strict';

const { requireValue, github, output, summary, assertApprovalEnvironment } = require('./common.cjs');
const stages = require('./stages.json');

async function guard(env = process.env, request = github) {
  const number = requireValue(env, 'PR_NUMBER');
  if (!/^[1-9]\d*$/.test(number)) throw new Error('PR_NUMBER must be a positive integer.');
  const stage = requireValue(env, 'MIGRATION_STAGE');
  if (!Object.hasOwn(stages, stage)) throw new Error('Unknown migration stage.');
  if (env.GITHUB_REF !== 'refs/heads/main') throw new Error('Dispatch this workflow from main only.');
  const [pr, main, environment] = await Promise.all([
    request(`pulls/${number}`), request('git/ref/heads/main'), request('environments/Production'),
  ]);
  assertApprovalEnvironment(environment);
  if (pr.state !== 'open' || pr.base.ref !== 'main' || pr.head.repo?.full_name !== env.GITHUB_REPOSITORY) {
    throw new Error('Use an open, same-repository PR targeting main. Stacked PRs must be retargeted after their prerequisite merges.');
  }
  const expected = env.EXPECTED_SHA || pr.head.sha;
  if (!/^[a-f0-9]{40}$/.test(expected) || pr.head.sha !== expected) {
    throw new Error('The PR changed after rehearsal. Start a new workflow run and approval.');
  }
  if (main.object.sha !== env.GITHUB_SHA) {
    throw new Error('Main changed after dispatch. Start a new workflow run against the new baseline.');
  }
  // Require the PR to include this exact baseline, not a moving merge ref.
  const comparison = await request(`compare/${env.GITHUB_SHA}...${expected}`);
  if (!['ahead', 'identical'].includes(comparison.status)) {
    throw new Error('Update the PR from main and let CI pass before rehearsal.');
  }
  const checks = await request(`commits/${expected}/check-runs?filter=latest&per_page=100`);
  for (const name of ['verify', 'integration']) {
    if (!checks.check_runs.some(check => check.name === name && check.app?.slug === 'github-actions'
      && check.status === 'completed' && check.conclusion === 'success')) {
      throw new Error('Both CI jobs must pass on the exact PR head before production work.');
    }
  }
  return { sha: expected, stage, number };
}

if (require.main === module) guard().then(result => {
  output('sha', result.sha);
  summary(`## Production migration\nPR #${result.number} · commit \`${result.sha}\` · stage \`${result.stage}\`\n\n` +
    'Approval covers this commit only. Review the rehearsal result, pause legacy writers where required, and verify recovery readiness before approving Production.');
}).catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { guard };
