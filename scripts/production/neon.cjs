'use strict';

const fs = require('node:fs');
const { requireValue, databaseUrl } = require('./common.cjs');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class Neon {
  constructor(env = process.env, fetcher = fetch, pause = sleep) {
    this.env = env; this.fetcher = fetcher; this.pause = pause;
    this.key = requireValue(env, 'NEON_API_KEY');
    this.project = requireValue(env, 'NEON_PROJECT_ID');
    this.parent = requireValue(env, 'NEON_PRODUCTION_BRANCH_ID');
    this.host = requireValue(env, 'NEON_PRODUCTION_HOST');
    if (![this.project, this.parent].every(value => /^[a-z0-9-]{1,60}$/.test(value))) throw new Error('Invalid Neon project or branch ID.');
    if (!/^\d+$/.test(env.GITHUB_RUN_ID || '') || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT || '')) throw new Error('Missing GitHub run identity.');
    this.name = `oiano-rehearsal-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  }

  async request(route, method = 'GET', body) {
    // Retry only responses Neon documents as safe for mutations. A lost POST
    // response is not retried; cleanup locates its deterministic branch name.
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await this.fetcher(`https://console.neon.tech/api/v2/projects/${this.project}/${route}`, {
        method, headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000),
      });
      if ([423, 503].includes(response.status) && attempt < 5) { await this.pause(3000); continue; }
      if (!response.ok) throw new Error(`Neon request failed (${response.status}); no response body was logged.`);
      return response.status === 204 ? {} : response.json();
    }
  }

  async wait(operations = []) {
    for (const initial of operations) {
      let operation = initial;
      for (let attempt = 0; !['finished', 'skipped'].includes(operation.status); attempt++) {
        if (attempt >= 60 || ['failed', 'cancelled', 'cancelling'].includes(operation.status)) throw new Error('Neon operation did not complete successfully.');
        await this.pause(2000);
        ({ operation } = await this.request(`operations/${encodeURIComponent(operation.id)}`));
      }
    }
  }

  assertDisposable(branch) {
    if (!branch || branch.id === this.parent || branch.parent_id !== this.parent || branch.name !== this.name || branch.protected) {
      throw new Error('Refusing to modify a branch that is not this run\'s disposable child.');
    }
  }

  async create() {
    const role = requireValue(this.env, 'NEON_DATABASE_ROLE');
    const database = requireValue(this.env, 'NEON_DATABASE_NAME');
    const { endpoints } = await this.request('endpoints');
    if (!endpoints.some(endpoint => endpoint.branch_id === this.parent && endpoint.host === this.host && endpoint.type === 'read_write')) {
      throw new Error('The configured production host is not the direct endpoint of the selected parent branch.');
    }
    const result = await this.request('branches', 'POST', {
      branch: { name: this.name, parent_id: this.parent, expires_at: new Date(Date.now() + 6 * 3600000).toISOString() },
      endpoints: [{ type: 'read_write' }],
    });
    this.assertDisposable(result.branch);
    await this.wait(result.operations);
    const branchId = result.branch.id;
    // A clone initially inherits role passwords. Rotate EVERY inherited role,
    // including owners, before any candidate code can read the copy's catalogs.
    const { roles } = await this.request(`branches/${branchId}/roles`);
    if (!roles.some(item => item.name === role)) throw new Error('The configured migration role is absent on the clone.');
    for (const item of roles) {
      const reset = await this.request(`branches/${branchId}/roles/${encodeURIComponent(item.name)}/reset_password`, 'POST');
      await this.wait(reset.operations);
    }
    const params = new URLSearchParams({ branch_id: branchId, database_name: database, role_name: role, pooled: 'false' });
    const { uri } = await this.request(`connection_uri?${params}`);
    const parsed = databaseUrl(uri);
    const endpoint = result.endpoints?.find(item => item.branch_id === branchId && item.type === 'read_write');
    if (!endpoint || parsed.hostname !== endpoint.host || parsed.hostname === this.host || parsed.searchParams.get('sslmode') !== 'require') {
      throw new Error('Neon returned an unexpected clone endpoint.');
    }
    return uri;
  }

  async cleanup() {
    let cursor;
    do {
      const params = new URLSearchParams({ limit: '100' });
      if (cursor) params.set('cursor', cursor);
      const page = await this.request(`branches?${params}`);
      for (const branch of page.branches.filter(item => item.name === this.name)) {
        this.assertDisposable(branch);
        await this.wait((await this.request(`branches/${branch.id}`, 'DELETE')).operations);
      }
      cursor = page.pagination?.next;
    } while (cursor);
  }
}

async function main() {
  const neon = new Neon();
  if (process.argv[2] === 'cleanup') { await neon.cleanup(); console.log('Disposable branch cleanup completed.'); return; }
  if (process.argv[2] !== 'create') throw new Error('Use create or cleanup.');
  const uri = await neon.create();
  if (/[\r\n]/.test(uri)) throw new Error('Invalid clone URL.');
  for (const secret of [uri, new URL(uri).password, decodeURIComponent(new URL(uri).password)]) {
    if (secret) console.log(`::add-mask::${secret.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
  }
  fs.appendFileSync(requireValue(process.env, 'GITHUB_ENV'), `REHEARSAL_DATABASE_URL=${uri}\n`);
  console.log('Disposable branch created; inherited passwords rotated; expiry set to six hours.');
}

if (require.main === module) main().catch(() => {
  console.error('Neon branch operation failed. Check project/branch configuration and the cleanup job. No credentials or API response bodies were logged.');
  process.exitCode = 1;
});
module.exports = { Neon };
