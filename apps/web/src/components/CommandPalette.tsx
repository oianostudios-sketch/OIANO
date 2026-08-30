import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PaletteItem {
  id: string;
  icon: string;
  label: string;
  sublabel?: string;
  group: string;
  hint?: string;
  action: () => void;
}

// ── Role-aware action sets ────────────────────────────────────────────────────

function useNavItems(navigate: ReturnType<typeof useNavigate>, role?: string): PaletteItem[] {
  const items: PaletteItem[] = [];

  // Always available
  items.push({ id: 'book',     icon: '＋', label: 'New booking',       group: 'QUICK ACTIONS', hint: 'B', action: () => navigate('/book') });
  items.push({ id: 'calendar', icon: '◫',  label: 'Calendar',          group: 'QUICK ACTIONS', hint: 'C', action: () => navigate('/calendar') });
  items.push({ id: 'access',   icon: '◇',  label: 'Access & responsibilities', group: 'ACCOUNT', action: () => navigate('/access') });
  items.push({ id: 'network',  icon: '◎',  label: 'Explore the OIANO network', group: 'NETWORK', action: () => navigate('/network') });
  items.push({ id: 'contributions', icon: '✦', label: 'Contribution inbox', group: 'NETWORK', action: () => navigate('/contributions') });

  if (role === 'STUDIO_ADMIN') {
    items.push({ id: 'pulse',   icon: '◉', label: 'Studio Pulse',      group: 'QUICK ACTIONS', hint: 'P', action: () => navigate('/pulse') });
    items.push({ id: 'admin',   icon: '⚙',  label: 'Operator dashboard', group: 'QUICK ACTIONS', hint: 'O', action: () => navigate('/admin') });
    items.push({ id: 'run',     icon: '◳',  label: 'Runsheet',          group: 'QUICK ACTIONS',            action: () => navigate('/runsheet') });
    items.push({ id: 'policies', icon: '◆', label: 'Studio standards & exceptions', group: 'QUICK ACTIONS', action: () => navigate('/admin/policies') });
    items.push({ id: 'studio-team', icon: '♙', label: 'Studio team & permissions', group: 'QUICK ACTIONS', action: () => navigate('/admin/team') });
  }
  if (role === 'STUDIO_ADMIN' || role === 'ENGINEER') {
    items.push({ id: 'facilities', icon: '⚑', label: 'Facilities', sublabel: 'Room & equipment readiness', group: 'QUICK ACTIONS', action: () => navigate('/facilities') });
  }

  if (role === 'ARTIST') {
    items.push({ id: 'passport',  icon: '🛂', label: 'My passport',    group: 'QUICK ACTIONS', action: () => navigate('/artist/passport') });
    items.push({ id: 'discover',  icon: '◈',  label: 'Discover artists', group: 'QUICK ACTIONS', action: () => navigate('/discover') });
  }

  // Navigate group — catch-all
  items.push({ id: 'dash',  icon: '→', label: 'Dashboard',  group: 'NAVIGATE', action: () => navigate('/dashboard') });
  if (role !== 'ARTIST') {
    items.push({ id: 'admin2', icon: '→', label: 'Studio Operator', group: 'NAVIGATE', action: () => navigate('/admin') });
  }
  items.push({ id: 'cal2',  icon: '→', label: 'Calendar',   group: 'NAVIGATE', action: () => navigate('/calendar') });

  return items;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function score(label: string, q: string): boolean {
  return label.toLowerCase().includes(q.toLowerCase());
}

// ── Command Palette component ─────────────────────────────────────────────────

export default function CommandPalette() {
  const navigate     = useNavigate();
  const { user }     = useAuthStore();
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const [artists, setArtists] = useState<any[]>([]);
  const [fetched, setFetched] = useState(false);
  const [sel, setSel]       = useState(0);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);
  const navItems  = useNavItems(navigate, user?.role);

  // ── Fetch artists once on first open ────────────────────────────────────────
  useEffect(() => {
    if (open && !fetched) {
      setFetched(true);
      api.get('/artists', { params: { limit: 200 } })
        .then(r => {
          const list = Array.isArray(r.data) ? r.data : r.data?.data ?? [];
          setArtists(list);
        })
        .catch(() => {/* non-fatal */});
    }
  }, [open, fetched]);

  // ── Global keyboard trigger ──────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(v => !v);
        if (!open) setQuery('');
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const close = useCallback(() => { setOpen(false); setQuery(''); }, []);

  // ── Build flat results list ──────────────────────────────────────────────────
  const results: PaletteItem[] = [];

  // Quick actions / Navigate (filtered by query)
  for (const item of navItems) {
    if (!query || score(item.label, query) || score(item.group, query)) {
      results.push(item);
    }
  }

  // Artists (only when query ≥ 1 char)
  if (query.length >= 1) {
    const matched = artists
      .filter(a => score(a.name ?? '', query) || score(a.alias ?? '', query))
      .slice(0, 6);
    for (const a of matched) {
      results.push({
        id: `artist-${a.id}`,
        icon: '◎',
        label: a.alias ?? a.name,
        sublabel: a.alias ? a.name : (a.email ?? ''),
        group: 'ARTISTS',
        action: () => navigate(`/artists/${a.id}`),
      });
    }
  }

  // ── Keyboard navigation inside palette ──────────────────────────────────────
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel(s => Math.min(s + 1, results.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel(s => Math.max(s - 1, 0));
    }
    if (e.key === 'Enter' && results[sel]) {
      results[sel].action();
      close();
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${sel}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  // Reset selection when query changes
  useEffect(() => { setSel(0); }, [query]);

  if (!open) return null;

  // Group results for rendering
  const groups: { name: string; items: typeof results }[] = [];
  for (const item of results) {
    const g = groups.find(g => g.name === item.group);
    if (g) g.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }

  let globalIdx = 0;

  return (
    <>
      <style>{PALETTE_CSS}</style>

      {/* Overlay */}
      <div className="cp-overlay" onClick={close} />

      {/* Modal */}
      <div className="cp-modal" role="dialog" aria-modal="true" aria-label="Command palette">

        {/* Search input */}
        <div className="cp-input-wrap">
          <span className="cp-search-icon">⌕</span>
          <input
            ref={inputRef}
            className="cp-input"
            type="text"
            placeholder="Search artists, actions, pages…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button className="cp-clear" onClick={() => setQuery('')} tabIndex={-1}>✕</button>
          )}
        </div>

        {/* Results */}
        <div className="cp-results" ref={listRef}>
          {results.length === 0 ? (
            <div className="cp-empty">No results for "{query}"</div>
          ) : groups.map(group => {
            const items = group.items.map((item, _) => {
              const idx = globalIdx++;
              return (
                <button
                  key={item.id}
                  data-idx={idx}
                  className={`cp-item ${idx === sel ? 'cp-item-sel' : ''}`}
                  onMouseEnter={() => setSel(idx)}
                  onClick={() => { item.action(); close(); }}
                >
                  <span className="cp-item-icon">{item.icon}</span>
                  <span className="cp-item-label">
                    {item.label}
                    {item.sublabel && <span className="cp-item-sub"> · {item.sublabel}</span>}
                  </span>
                  {item.hint && <kbd className="cp-hint">{item.hint}</kbd>}
                </button>
              );
            });
            // Only show group header if more than one group or group isn't default
            return (
              <div key={group.name} className="cp-group">
                <div className="cp-group-label">{group.name}</div>
                {items}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="cp-footer">
          <span><kbd className="cp-key">↑↓</kbd> navigate</span>
          <span><kbd className="cp-key">↵</kbd> select</span>
          <span><kbd className="cp-key">Esc</kbd> close</span>
          <span style={{ marginLeft: 'auto', color: '#2a2a2a' }}>
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const PALETTE_CSS = `
  @keyframes cp-overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes cp-modal-in {
    from { opacity: 0; transform: scale(0.97) translateY(-8px); }
    to   { opacity: 1; transform: scale(1)    translateY(0); }
  }

  .cp-overlay {
    position: fixed; inset: 0; z-index: 8000;
    background: rgba(0,0,0,0.72);
    backdrop-filter: blur(3px);
    animation: cp-overlay-in 120ms ease forwards;
  }
  .cp-modal {
    position: fixed; z-index: 8001;
    top: 15vh; left: 50%; transform: translateX(-50%);
    width: min(560px, 92vw);
    background: #0f0f0f;
    border: 1px solid #5A9BCB28;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px #5A9BCB08;
    animation: cp-modal-in 150ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    display: flex; flex-direction: column;
    max-height: 68vh;
  }

  .cp-input-wrap {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid #1a1a1a;
    flex-shrink: 0;
  }
  .cp-search-icon {
    font-size: 18px; color: #555; flex-shrink: 0; user-select: none;
  }
  .cp-input {
    flex: 1; background: transparent; border: none; outline: none;
    font-size: 15px; color: #f0f0f0; font-family: 'DM Sans', sans-serif;
    placeholder-color: #444;
  }
  .cp-input::placeholder { color: #3f3f46; }
  .cp-clear {
    background: transparent; border: none; color: #444; cursor: pointer;
    font-size: 13px; padding: 2px 4px; line-height: 1;
    transition: color 0.1s;
  }
  .cp-clear:hover { color: #888; }

  .cp-results {
    overflow-y: auto; flex: 1;
    scrollbar-width: thin;
    scrollbar-color: #2a2a2a transparent;
  }
  .cp-group { }
  .cp-group-label {
    padding: 10px 16px 4px;
    font-size: 9px; color: #333;
    letter-spacing: 0.14em; text-transform: uppercase;
    font-family: 'JetBrains Mono', monospace;
    position: sticky; top: 0; background: #0f0f0f;
  }
  .cp-item {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 10px 16px;
    background: transparent; border: none; cursor: pointer;
    text-align: left; font-family: 'DM Sans', sans-serif;
    border-left: 2px solid transparent;
    transition: background 0.08s, border-color 0.08s;
  }
  .cp-item:hover { background: #161616; }
  .cp-item-sel {
    background: #0f0d08 !important;
    border-left-color: #5A9BCB !important;
  }
  .cp-item-icon {
    font-size: 14px; width: 22px; text-align: center;
    color: #555; flex-shrink: 0; line-height: 1;
  }
  .cp-item-sel .cp-item-icon { color: #5A9BCB; }
  .cp-item-label {
    flex: 1; font-size: 13px; color: #d4d4d8; line-height: 1;
  }
  .cp-item-sel .cp-item-label { color: #f0f0f0; }
  .cp-item-sub { color: #52525b; font-size: 11px; }
  .cp-hint {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #333; background: #1a1a1a; border: 1px solid #2a2a2a;
    padding: 2px 6px; border-radius: 4px;
    flex-shrink: 0;
  }
  .cp-item-sel .cp-hint { color: #5A9BCB88; border-color: #5A9BCB22; background: #5A9BCB0a; }

  .cp-footer {
    display: flex; align-items: center; gap: 14px;
    padding: 9px 16px; border-top: 1px solid #141414;
    font-size: 11px; color: #333;
    flex-shrink: 0;
  }
  .cp-key {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    color: #444; background: #1a1a1a; border: 1px solid #2a2a2a;
    padding: 2px 5px; border-radius: 3px; margin-right: 3px;
  }
  .cp-empty {
    padding: 28px 16px; text-align: center;
    font-size: 13px; color: #3f3f46;
  }
`;
