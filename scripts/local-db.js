#!/usr/bin/env node
// scripts/local-db.js
//
// A private PostgreSQL for development and verification, so no command in this
// repository needs the database named in .env. That database is shared, and
// apps/api/src/app.ts and lib/prisma.ts load .env with override unless
// NODE_ENV=test, which silently replaces an exported DATABASE_URL.
//
//   node scripts/local-db.js start          start this checkout's cluster, creating it on first use
//   node scripts/local-db.js stop           stop it
//   node scripts/local-db.js status         say whether it runs and on which port, and list its databases
//   node scripts/local-db.js fresh [label]  create an empty database and print its URL
//   node scripts/local-db.js test           run the integration suite on a fresh database
//   node scripts/local-db.js dev            run the API and web app against a seeded local database
//   node scripts/local-db.js prune          drop the databases `fresh` created in this checkout
//
// Requires PostgreSQL 14+ command-line tools: set PG_BIN to their folder, put
// pg_ctl on PATH, or install PostgreSQL in its default location. Data stays in
// .oiano/ (gitignored). The cluster trusts local connections and listens on
// 127.0.0.1 only.
//
// Each checkout and worktree has its own cluster. A server answering on the
// port is used only when it reports this checkout's data directory; otherwise
// these commands would create, migrate and drop databases on another checkout's
// cluster. The cluster listens on 55432. When another server holds the port it
// wants, it starts on the first free port from 55432 up, and .oiano/port keeps
// the choice. OIANO_LOCAL_PG_PORT names the port instead, and a command stops
// rather than use that port while another server holds it.
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, '.oiano', 'postgres');
const logFile = path.join(root, '.oiano', 'postgres.log');
const portFile = path.join(root, '.oiano', 'port');
// One name per line, written by `fresh`. `prune` drops only these, so a
// database another checkout created on this cluster survives it.
const createdFile = path.join(root, '.oiano', 'created-databases');
const host = '127.0.0.1';
const defaultPort = 55432;
const portsToTry = 100;
const superuser = 'oiano';
const devDatabase = 'oiano_dev_test';
const windows = process.platform === 'win32';
// The port this checkout's running cluster listens on, set by start() or status().
let port;

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
const query = (database, sql) => tool('psql', ['-h', host, '-p', port, '-U', superuser, '-d', database, '-Atc', sql]);
const isPort = (value) => /^\d{1,5}$/.test(value) && Number(value) >= 1 && Number(value) <= 65535;

function readFile(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function chosenPort() {
  const chosen = process.env.OIANO_LOCAL_PG_PORT;
  if (!chosen) return undefined;
  if (!isPort(chosen)) fail(`OIANO_LOCAL_PG_PORT must be a port number, not "${chosen}"`);
  return String(Number(chosen));
}

// The port this checkout's cluster starts on: the one OIANO_LOCAL_PG_PORT names,
// else the one it last ran on, else the default.
function preferredPort() {
  const saved = readFile(portFile).trim();
  return chosenPort() || (isPort(saved) ? saved : String(defaultPort));
}

// PostgreSQL reports its data directory in its own spelling (C:/projects/...),
// so both sides are resolved through links and, on Windows, compared without case.
function sameDirectory(reported, expected) {
  const canonical = (dir) => {
    let resolved = path.resolve(dir);
    try {
      resolved = fs.realpathSync.native(resolved);
    } catch {
      // A directory this machine cannot see keeps the spelling it was given.
    }
    return windows ? resolved.toLowerCase() : resolved;
  };
  return canonical(reported) === canonical(expected);
}

// What answers on a port: nothing ('free'), this checkout's cluster ('own'),
// another cluster ('other', with the data directory it reports), or something
// psql cannot ask ('unknown'). The TCP check comes first because psql takes two
// seconds to give up on a closed port on Windows.
async function probe(candidate) {
  if (!(await inUse(candidate))) return { state: 'free' };
  const answer = tool('psql', ['-w', '-h', host, '-p', candidate, '-U', superuser, '-d', 'postgres', '-Atc', 'show data_directory'], {
    env: { ...process.env, PGCONNECT_TIMEOUT: '5' },
  });
  const reported = answer.status === 0 ? answer.stdout.trim() : '';
  if (!reported) return { state: 'unknown', detail: (answer.stderr || '').trim().split(/\r?\n/)[0] };
  return { state: sameDirectory(reported, dataDir) ? 'own' : 'other', dataDirectory: reported };
}

function holder(found) {
  if (found.state === 'other') return `the PostgreSQL cluster in ${found.dataDirectory}`;
  return `a server that psql could not ask for its data directory${found.detail ? ` (${found.detail})` : ''}`;
}

// Finds this checkout's cluster. A running server writes its port into the lock
// file in its data directory, but a crash leaves that file behind, so the server
// on the port must also report this data directory.
async function locate() {
  const preferred = preferredPort();
  const locked = (readFile(path.join(dataDir, 'postmaster.pid')).split(/\r?\n/)[3] || '').trim();
  if (isPort(locked) && locked !== preferred && (await probe(locked)).state === 'own') return { running: true, port: locked };
  const found = await probe(preferred);
  return { running: found.state === 'own', port: preferred, found };
}

// A port another server holds is never used. When OIANO_LOCAL_PG_PORT named it,
// the command stops; otherwise the cluster takes the first free port from the default.
async function portInstead(held, found) {
  if (chosenPort()) {
    fail(`port ${held} from OIANO_LOCAL_PG_PORT is held by ${holder(found)}, not this checkout's cluster. Choose a free port, or unset OIANO_LOCAL_PG_PORT and this checkout will pick one.`);
  }
  for (let candidate = defaultPort; candidate < defaultPort + portsToTry; candidate += 1) {
    if (await inUse(candidate)) continue;
    console.error(`local-db: port ${held} is held by ${holder(found)}, so this checkout's cluster starts on port ${candidate} instead`);
    return String(candidate);
  }
  return fail(`ports ${defaultPort} to ${defaultPort + portsToTry - 1} are all in use; set OIANO_LOCAL_PG_PORT to a free port`);
}

// Another checkout can take a free port between the check and the start, so a
// start that fails while something else answers on the port tries another one.
async function startServer(candidate, found) {
  for (let attempt = 1; ; attempt += 1) {
    if (found.state !== 'free') candidate = await portInstead(candidate, found);
    // The server outlives this command, so it must not inherit this process's pipes.
    const started = tool('pg_ctl', ['-D', dataDir, '-o', `-p ${candidate} -c listen_addresses=${host}`, '-l', logFile, '-w', 'start'], { stdio: 'ignore' });
    found = await probe(candidate);
    if (found.state === 'own') return candidate;
    if (started.status === 0 || found.state === 'free' || attempt === 3) fail(`the local cluster did not start; see ${path.relative(root, logFile)}`);
  }
}

async function start({ quiet = false } = {}) {
  if (!clusterExists()) {
    fs.mkdirSync(dataDir, { recursive: true });
    const init = tool('initdb', ['-D', dataDir, '-U', superuser, '-A', 'trust', '-E', 'UTF8', '--no-locale']);
    if (init.status !== 0) fail(`initdb failed:\n${init.stderr || init.stdout}`);
    console.log(`Created a local PostgreSQL cluster in ${path.relative(root, dataDir)}`);
  }
  const cluster = await locate();
  if (cluster.running) {
    const chosen = chosenPort();
    if (chosen && chosen !== cluster.port) fail(`this checkout's cluster is already running on port ${cluster.port}; stop it before starting it on OIANO_LOCAL_PG_PORT=${chosen}`);
    port = cluster.port;
  } else {
    // A server that is still starting or stopping holds the lock file but does not answer yet.
    if (tool('pg_ctl', ['status', '-D', dataDir]).status === 0) fail(`this checkout's cluster is starting or stopping; try again shortly, or see ${path.relative(root, logFile)}`);
    port = await startServer(cluster.port, cluster.found);
  }
  if (readFile(portFile).trim() !== port) fs.writeFileSync(portFile, `${port}\n`);
  if (!quiet) console.log(`Local PostgreSQL is running on ${host}:${port}`);
}

async function stop() {
  // pg_ctl -D signals only the server whose lock file is in this checkout's data
  // directory, so it cannot stop another checkout's cluster.
  if (clusterExists() && tool('pg_ctl', ['status', '-D', dataDir]).status === 0) {
    const stopped = tool('pg_ctl', ['-D', dataDir, '-m', 'fast', 'stop'], { stdio: 'ignore' });
    if (stopped.status !== 0) fail('the local cluster did not stop cleanly');
    return console.log('Local PostgreSQL stopped');
  }
  const preferred = preferredPort();
  const found = await probe(preferred);
  if (found.state === 'other' || found.state === 'unknown') {
    return console.log(`This checkout's local PostgreSQL is not running. Port ${preferred} belongs to ${holder(found)}, which was left running.`);
  }
  console.log('Local PostgreSQL is not running');
}

async function status() {
  if (!clusterExists()) return console.log('No local cluster yet; `npm run db:local:start` creates one');
  const cluster = await locate();
  if (!cluster.running) {
    console.log(`Local PostgreSQL is stopped (${path.relative(root, dataDir)})`);
    if (cluster.found.state !== 'free') {
      console.log(`  port ${cluster.port} belongs to ${holder(cluster.found)}; \`npm run db:local:start\` ${chosenPort() ? 'will refuse it' : 'will use another port'}`);
    }
    return;
  }
  port = cluster.port;
  const names = query('postgres', "select datname from pg_database where datname like 'oiano%' order by datname").stdout.split(/\r?\n/).filter(Boolean);
  console.log(`Local PostgreSQL is running on ${host}:${port}`);
  console.log(names.length ? names.map((name) => `  ${urlFor(name)}`).join('\n') : '  (no OIANO databases yet)');
}

async function fresh(label = 'check', { quiet = false } = {}) {
  await start({ quiet: true });
  const slug = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'check';
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17);
  // The standalone "test" segment is what scripts/run-api-integration-tests.js requires.
  const database = `oiano_${slug}_${stamp}_test`;
  const created = tool('createdb', ['-h', host, '-p', port, '-U', superuser, database]);
  if (created.status !== 0) fail(`createdb failed:\n${created.stderr || created.stdout}`);
  fs.appendFileSync(createdFile, `${database}\n`);
  if (!quiet) console.log(urlFor(database));
  return urlFor(database);
}

async function prune() {
  await start({ quiet: true });
  const listed = query('postgres', `select datname from pg_database where datname like 'oiano\\_%\\_test' and datname <> '${devDatabase}' order by datname`);
  if (listed.status !== 0) fail(`could not list the local databases:\n${listed.stderr || listed.stdout}`);
  const names = listed.stdout.split(/\r?\n/).filter(Boolean);
  const recorded = new Set(readFile(createdFile).split(/\r?\n/).filter(Boolean));
  // Recorded names that are gone from the server, or are dropped below, leave the record.
  const forget = new Set([...recorded].filter((name) => !names.includes(name)));
  for (const name of names.filter((name) => recorded.has(name))) {
    const dropped = tool('dropdb', ['-h', host, '-p', port, '-U', superuser, name]);
    if (dropped.status === 0) forget.add(name);
    console.log(dropped.status === 0 ? `dropped ${name}` : `could not drop ${name}: ${(dropped.stderr || '').trim()}`);
  }
  if (forget.size) {
    // Read the record again: a `fresh` running meanwhile may have added to it.
    const kept = readFile(createdFile).split(/\r?\n/).filter((name) => name && !forget.has(name));
    fs.writeFileSync(createdFile, kept.map((name) => `${name}\n`).join(''));
  }
  const unrecorded = names.filter((name) => !recorded.has(name));
  if (unrecorded.length) {
    console.log(`Left in place, because \`fresh\` in this checkout did not record creating them:\n${unrecorded.map((name) => `  ${name}`).join('\n')}`);
    console.log(`Drop one that is yours with: dropdb -h ${host} -p ${port} -U ${superuser} <name>`);
  }
  if (!names.length) console.log('Nothing to prune');
}

async function integration() {
  const databaseUrl = await fresh('integration', { quiet: true });
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

  await start({ quiet: true });
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
