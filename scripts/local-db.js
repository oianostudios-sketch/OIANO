#!/usr/bin/env node
// scripts/local-db.js
//
// A private PostgreSQL for development and verification, so no command in this
// repository needs the database named in .env. That database is shared, and
// apps/api/src/app.ts and lib/prisma.ts load .env with override unless
// NODE_ENV=test, which silently replaces an exported DATABASE_URL.
//
//   node scripts/local-db.js start          start the local cluster, creating it on first use
//   node scripts/local-db.js stop           stop it
//   node scripts/local-db.js status         say whether it runs, and list its databases
//   node scripts/local-db.js fresh [label]  create an empty database and print its URL
//   node scripts/local-db.js test           run the integration suite on a fresh database
//   node scripts/local-db.js dev            run the API and web app against a seeded local database
//   node scripts/local-db.js prune          drop every database `fresh` created
//
// Requires PostgreSQL 14+ command-line tools: set PG_BIN to their folder, put
// pg_ctl on PATH, or install PostgreSQL in its default location. Data stays in
// .oiano/ (gitignored). The cluster trusts local connections and listens on
// 127.0.0.1 only. OIANO_LOCAL_PG_PORT changes its port (default 55432).
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, '.oiano', 'postgres');
const logFile = path.join(root, '.oiano', 'postgres.log');
const host = '127.0.0.1';
const port = String(process.env.OIANO_LOCAL_PG_PORT || 55432);
const superuser = 'oiano';
const devDatabase = 'oiano_dev_test';
const windows = process.platform === 'win32';

function fail(message) {
  console.error(`local-db: ${message}`);
  process.exit(1);
}

function findPgBin() {
  const candidates = [process.env.PG_BIN, ...(process.env.PATH || '').split(path.delimiter)];
  for (const version of ['17', '16', '15', '14']) {
    candidates.push(windows ? `C:\\Program Files\\PostgreSQL\\${version}\\bin` : `/usr/lib/postgresql/${version}/bin`);
  }
  if (!windows) candidates.push('/opt/homebrew/bin', '/usr/local/bin');
  const executable = (dir, name) => path.join(dir, windows ? `${name}.exe` : name);
  const found = candidates.find((dir) => dir && fs.existsSync(executable(dir, 'pg_ctl')) && fs.existsSync(executable(dir, 'initdb')));
  if (!found) fail('PostgreSQL command-line tools were not found. Install PostgreSQL 14 or later, or set PG_BIN to the folder that contains pg_ctl.');
  return found;
}

let pgBin;
function tool(name, args, options = {}) {
  if (!pgBin) pgBin = findPgBin();
  return spawnSync(path.join(pgBin, windows ? `${name}.exe` : name), args, { encoding: 'utf8', stdio: 'pipe', ...options });
}

const urlFor = (database) => `postgresql://${superuser}@${host}:${port}/${database}`;
const clusterExists = () => fs.existsSync(path.join(dataDir, 'PG_VERSION'));
const running = () => tool('pg_isready', ['-h', host, '-p', port]).status === 0;
const query = (database, sql) => tool('psql', ['-h', host, '-p', port, '-U', superuser, '-d', database, '-Atc', sql]);

function start({ quiet = false } = {}) {
  if (!clusterExists()) {
    fs.mkdirSync(dataDir, { recursive: true });
    const init = tool('initdb', ['-D', dataDir, '-U', superuser, '-A', 'trust', '-E', 'UTF8', '--no-locale']);
    if (init.status !== 0) fail(`initdb failed:\n${init.stderr || init.stdout}`);
    console.log(`Created a local PostgreSQL cluster in ${path.relative(root, dataDir)}`);
  }
  if (!running()) {
    // The server outlives this command, so it must not inherit this process's pipes.
    const started = tool('pg_ctl', ['-D', dataDir, '-o', `-p ${port} -c listen_addresses=${host}`, '-l', logFile, '-w', 'start'], { stdio: 'ignore' });
    if (started.status !== 0 || !running()) fail(`the local cluster did not start; see ${path.relative(root, logFile)}`);
  }
  if (!quiet) console.log(`Local PostgreSQL is running on ${host}:${port}`);
}

function stop() {
  if (!clusterExists() || !running()) return console.log('Local PostgreSQL is not running');
  const stopped = tool('pg_ctl', ['-D', dataDir, '-m', 'fast', 'stop'], { stdio: 'ignore' });
  if (stopped.status !== 0) fail('the local cluster did not stop cleanly');
  console.log('Local PostgreSQL stopped');
}

function status() {
  if (!clusterExists()) return console.log('No local cluster yet; `npm run db:local:start` creates one');
  if (!running()) return console.log(`Local PostgreSQL is stopped (${path.relative(root, dataDir)})`);
  const names = query('postgres', "select datname from pg_database where datname like 'oiano%' order by datname").stdout.split(/\r?\n/).filter(Boolean);
  console.log(`Local PostgreSQL is running on ${host}:${port}`);
  console.log(names.length ? names.map((name) => `  ${urlFor(name)}`).join('\n') : '  (no OIANO databases yet)');
}

function fresh(label = 'check', { quiet = false } = {}) {
  start({ quiet: true });
  const slug = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'check';
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17);
  // The standalone "test" segment is what scripts/run-api-integration-tests.js requires.
  const database = `oiano_${slug}_${stamp}_test`;
  const created = tool('createdb', ['-h', host, '-p', port, '-U', superuser, database]);
  if (created.status !== 0) fail(`createdb failed:\n${created.stderr || created.stdout}`);
  if (!quiet) console.log(urlFor(database));
  return urlFor(database);
}

function prune() {
  start({ quiet: true });
  const names = query('postgres', `select datname from pg_database where datname like 'oiano\\_%\\_test' and datname <> '${devDatabase}'`)
    .stdout.split(/\r?\n/).filter(Boolean);
  if (!names.length) return console.log('Nothing to prune');
  for (const name of names) {
    const dropped = tool('dropdb', ['-h', host, '-p', port, '-U', superuser, name]);
    console.log(dropped.status === 0 ? `dropped ${name}` : `could not drop ${name}: ${(dropped.stderr || '').trim()}`);
  }
}

function integration() {
  const databaseUrl = fresh('integration', { quiet: true });
  console.log(`Integration suite on ${databaseUrl}`);
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'run-api-integration-tests.js')], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, INTEGRATION_DATABASE_URL: databaseUrl },
  });
  process.exit(result.status ?? 1);
}

// Resolves true when something already accepts connections on the port.
function inUse(candidate) {
  return new Promise((resolve) => {
    const socket = net.connect({ port: Number(candidate), host });
    const done = (busy) => { socket.destroy(); resolve(busy); };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(1000, () => done(false));
  });
}

async function choosePort(what, explicit, candidates, variable) {
  if (explicit) {
    if (await inUse(explicit)) fail(`port ${explicit} for the ${what} is already in use; set ${variable} to another`);
    return String(explicit);
  }
  for (const candidate of candidates) if (!(await inUse(candidate))) return String(candidate);
  return fail(`ports ${candidates.join(', ')} for the ${what} are all in use; set ${variable}`);
}

// The API will not boot without DATABASE_URL, JWT_SECRET, FRONTEND_URL and
// MFA_ENCRYPTION_KEY, and .env cannot supply a variable that is already set.
// Outside services are blanked on purpose, so a local session cannot take a
// payment, send email, call an AI model, upload to storage or report errors
// for real.
function localEnv(databaseUrl, apiPort, webPort) {
  return {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    PORT: apiPort,
    JWT_SECRET: 'local-development-only-jwt-secret-change-me',
    MFA_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    FRONTEND_URL: `http://localhost:${webPort}`,
    VITE_API_URL: `http://localhost:${apiPort}`,
    OIANO_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
    STRIPE_ENABLED: 'false',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    SENDGRID_API_KEY: '',
    SENDGRID_FROM_EMAIL: '',
    OIANO_AI_ENABLED: 'false',
    ANTHROPIC_API_KEY: '',
    R2_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    R2_BUCKET_NAME: '',
    R2_PUBLIC_URL: '',
    SENTRY_DSN: '',
  };
}

// npm is a .cmd file on Windows, which Node will not spawn without a shell.
// Under `npm run`, npm_execpath names npm's own script, so no shell is needed.
function npmCommand(args) {
  if (process.env.npm_execpath) return [process.execPath, [process.env.npm_execpath, ...args], {}];
  return [windows ? 'npm.cmd' : 'npm', args, { shell: windows }];
}

function npmSync(args, env) {
  const [command, commandArgs, options] = npmCommand(args);
  return spawnSync(command, commandArgs, { cwd: root, env, stdio: 'inherit', ...options });
}

function npmSpawn(args, env) {
  const [command, commandArgs, options] = npmCommand(args);
  return spawn(command, commandArgs, { cwd: root, env, stdio: 'inherit', ...options });
}

async function dev() {
  // A browser preview passes the web port it expects as PORT. Other dev servers
  // may already hold the usual ports, so each side takes the first free one; the
  // web app is pointed at this API, never at whatever else answers on 4000.
  const apiPort = await choosePort('API', process.env.OIANO_LOCAL_API_PORT, [4000, 4100, 4200, 4300], 'OIANO_LOCAL_API_PORT');
  const webPort = await choosePort('web app', process.env.OIANO_LOCAL_WEB_PORT || process.env.PORT, [5173, 5174, 5175], 'OIANO_LOCAL_WEB_PORT');

  start({ quiet: true });
  if (!query('postgres', `select 1 from pg_database where datname = '${devDatabase}'`).stdout.trim()) {
    const created = tool('createdb', ['-h', host, '-p', port, '-U', superuser, devDatabase]);
    if (created.status !== 0) fail(`createdb failed:\n${created.stderr || created.stdout}`);
  }
  const databaseUrl = urlFor(devDatabase);
  const env = localEnv(databaseUrl, apiPort, webPort);

  if (!fs.existsSync(path.join(root, 'packages', 'shared', 'dist'))) {
    if (npmSync(['run', 'build', '--workspace=packages/shared'], env).status !== 0) fail('building packages/shared failed');
  }
  const prismaCli = require.resolve('prisma/build/index.js', { paths: [root] });
  const migrated = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: root, env, stdio: 'inherit' });
  if (migrated.status !== 0) fail('migrations did not apply to the local database');
  if (query(devDatabase, 'select count(*) from users').stdout.trim() === '0') {
    console.log('Seeding demo data into the local database');
    if (npmSync(['run', 'db:seed'], env).status !== 0) fail('seeding the local database failed');
  }

  console.log(`API http://localhost:${apiPort} and web app http://localhost:${webPort}, on ${databaseUrl}`);
  const children = [
    npmSpawn(['run', 'dev', '--workspace=apps/api'], env),
    npmSpawn(['run', 'dev', '--workspace=apps/web', '--', '--port', webPort], env),
  ];
  let stopping = false;
  const stopAll = (code) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (child.exitCode !== null) continue;
      if (windows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGTERM');
    }
    process.exit(code);
  };
  for (const child of children) child.on('exit', (code) => stopAll(code ?? 0));
  process.on('SIGINT', () => stopAll(0));
  process.on('SIGTERM', () => stopAll(0));
}

const [command, label] = process.argv.slice(2);
const commands = { start: () => start(), stop, status, fresh: () => fresh(label), test: integration, dev, prune };
if (!commands[command]) {
  console.log('Usage: node scripts/local-db.js <start | stop | status | fresh [label] | test | dev | prune>');
  process.exit(command ? 1 : 0);
}
commands[command]();
