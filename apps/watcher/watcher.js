#!/usr/bin/env node
/**
 * OIANO StudioOS — DAW File Sync Watcher
 * ────────────────────────────────────────
 * Watches a local DAW project folder (FL Studio, Ableton, Logic, etc.)
 * and on every file save:
 *   1. Uploads the file to the artist's drop-box via POST /api/artists/:id/files
 *   2. Pings the Studio Clock session activity endpoint so the clock stays live
 *
 * Config is read from watcher.config.json in this directory (written by the
 * studio system when a session starts, or manually by the engineer).
 *
 * Usage:
 *   node watcher.js                  # reads watcher.config.json
 *   node watcher.js --config /path/to/config.json
 */

'use strict';

const chokidar  = require('chokidar');
const axios     = require('axios');
const FormData  = require('form-data');
const fs        = require('fs');
const path      = require('path');
const os        = require('os');

// ── Config ────────────────────────────────────────────────────────────────────

const configPath = (() => {
  const flagIdx = process.argv.indexOf('--config');
  return flagIdx !== -1
    ? process.argv[flagIdx + 1]
    : path.join(__dirname, 'watcher.config.json');
})();

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    console.error(`\n[watcher] Config not found: ${configPath}`);
    console.error('[watcher] Create watcher.config.json or run from the studio dashboard.\n');
    console.error(JSON.stringify({
      api_url:    'http://localhost:4000',
      token:      '<paste your JWT token here>',
      artist_id:  '<artist UUID>',
      watch_path: 'C:\\Users\\YourName\\Documents\\Image-Line\\FL Studio\\Projects',
      extensions: ['.flp', '.wav', '.mp3', '.aiff', '.aif', '.ogg', '.mid', '.zip'],
      debounce_ms: 2000,
    }, null, 2));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

let cfg = loadConfig();
fs.watch(configPath, () => {
  try { cfg = loadConfig(); console.log('[watcher] Config reloaded'); } catch {}
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: cfg.api_url ?? 'http://localhost:4000',
  headers: { Authorization: `Bearer ${cfg.token}` },
  timeout: 30_000,
});

// Re-read token from config on every request (config may be hot-reloaded)
api.interceptors.request.use(req => {
  req.headers.Authorization = `Bearer ${cfg.token}`;
  req.baseURL = cfg.api_url ?? 'http://localhost:4000';
  return req;
});

const debounceMap = new Map();
function debounce(key, fn, ms) {
  clearTimeout(debounceMap.get(key));
  debounceMap.set(key, setTimeout(fn, ms));
}

const uploadedHashes = new Set();
function fileHash(filePath) {
  // Simple hash: path + mtime + size — avoids re-uploading unchanged files
  try {
    const stat = fs.statSync(filePath);
    return `${filePath}::${stat.mtimeMs}::${stat.size}`;
  } catch { return null; }
}

// ── Upload ────────────────────────────────────────────────────────────────────

async function uploadFile(filePath) {
  const hash = fileHash(filePath);
  if (!hash || uploadedHashes.has(hash)) return;

  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const allowed = (cfg.extensions ?? ['.flp','.wav','.mp3','.aiff','.aif','.ogg','.mid','.zip']);
  if (!allowed.includes(ext)) return;

  let stat;
  try { stat = fs.statSync(filePath); } catch { return; }

  // Skip very large files (>500 MB) or temp files
  if (stat.size > 500 * 1024 * 1024) {
    console.log(`[watcher] Skipping large file (${(stat.size / 1048576).toFixed(0)} MB): ${filename}`);
    return;
  }
  if (filename.startsWith('~') || filename.startsWith('.')) return;

  // Derive relative folder from the file's path vs the watch root
  // e.g. watch_path = ".../Projects", file = ".../Projects/MyAlbum/track.flp"
  //      → folder = "MyAlbum"
  const relDir = path.relative(watchPath, path.dirname(filePath));
  const folder = relDir && relDir !== '.' ? relDir.replace(/\\/g, '/') : null;

  console.log(`[watcher] ↑ Uploading: ${folder ? folder + '/' : ''}${filename} (${(stat.size / 1024).toFixed(1)} KB)`);

  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), { filename });
    if (folder) form.append('folder', folder);
    form.append('source', 'daw_watcher');

    const res = await api.post(
      `/api/artists/${cfg.artist_id}/files`,
      form,
      { headers: form.getHeaders() }
    );

    uploadedHashes.add(hash);
    console.log(`[watcher] ✓ Synced: ${filename} → ${res.data?.url ?? 'stored'}`);

    // Ping session activity so the studio clock knows work is happening
    await pingActivity(filename);

  } catch (err) {
    const msg = err.response?.data?.error ?? err.message;
    console.error(`[watcher] ✗ Upload failed: ${filename} — ${msg}`);
  }
}

// ── Clock activity ping ───────────────────────────────────────────────────────

async function pingActivity(filename) {
  if (!cfg.session_id) return; // optional — only when a live session is active
  try {
    await api.post(`/api/studio-clock/sessions/${cfg.session_id}/activity`, {
      note: `File saved: ${filename}`,
      source: 'daw_watcher',
    });
  } catch {
    // Clock ping failure is non-fatal — session may not be active
  }
}

// ── Watcher ───────────────────────────────────────────────────────────────────

const watchPath = cfg.watch_path ?? path.join(os.homedir(), 'Documents', 'Image-Line', 'FL Studio', 'Projects');

if (!fs.existsSync(watchPath)) {
  console.warn(`[watcher] Watch path does not exist yet, will watch once created: ${watchPath}`);
}

const watcher = chokidar.watch(watchPath, {
  persistent:       true,
  ignoreInitial:    true,          // don't upload existing files on start
  followSymlinks:   false,
  usePolling:       cfg.use_polling ?? false,  // set true for network drives
  interval:         cfg.poll_interval_ms ?? 1000,
  awaitWriteFinish: {
    stabilityThreshold: 800,       // wait 800ms after last write before triggering
    pollInterval: 200,
  },
  ignored: [
    /(^|[/\\])\../,                // hidden files
    /~[^/\\]+$/,                   // temp files (FL Studio writes ~filename during save)
    /\.tmp$/,
    /Autosave/i,                   // FL Studio autosave subfolder (optional — remove to include)
  ],
});

const debounceMs = cfg.debounce_ms ?? 2000;

watcher
  .on('add',    filePath => debounce(filePath, () => uploadFile(filePath), debounceMs))
  .on('change', filePath => debounce(filePath, () => uploadFile(filePath), debounceMs))
  .on('error',  err => console.error('[watcher] Watch error:', err))
  .on('ready',  () => {
    console.log('\n🎛  OIANO DAW Watcher — online');
    console.log(`   Watching : ${watchPath}`);
    console.log(`   Studio   : ${cfg.api_url ?? 'http://localhost:4000'}`);
    console.log(`   Artist   : ${cfg.artist_id}`);
    console.log(`   Session  : ${cfg.session_id ?? '(none — set in config to link clock)'}`);
    console.log(`   Exts     : ${(cfg.extensions ?? ['.flp','.wav','.mp3']).join(', ')}`);
    console.log('\n   Waiting for file saves…\n');
  });

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on('SIGINT', async () => {
  console.log('\n[watcher] Shutting down…');
  await watcher.close();
  process.exit(0);
});
