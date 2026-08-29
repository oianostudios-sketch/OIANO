import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { useToast } from './Toast';
import { PERSONALITIES, getPersonality, type PersonalityKey } from '../lib/personality';
import { refreshMe } from '../lib/refreshMe';

// ── ChipInput ────────────────────────────────────────────────────────────────

interface ChipInputProps {
  chips: string[];
  onChange: (chips: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  maxChips?: number;
}

function ChipInput({ chips, onChange, placeholder = 'Type and press Enter…', suggestions = [], maxChips = 20 }: ChipInputProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function addChip(value: string) {
    const trimmed = value.trim();
    if (!trimmed || chips.includes(trimmed) || chips.length >= maxChips) return;
    onChange([...chips, trimmed]);
    setInput('');
  }

  function removeChip(chip: string) {
    onChange(chips.filter((c) => c !== chip));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addChip(input);
    } else if (e.key === 'Backspace' && input === '' && chips.length > 0) {
      removeChip(chips[chips.length - 1]);
    }
  }

  // Suggestions not already selected
  const available = suggestions.filter((s) => !chips.includes(s));
  // Filter by current input if any
  const filtered = input
    ? available.filter((s) => s.toLowerCase().includes(input.toLowerCase()))
    : available;

  return (
    <div>
      {/* Chips + text input container */}
      <div
        className="flex flex-wrap gap-1.5 bg-studio-muted border border-studio-border rounded-lg px-3 py-2.5 min-h-[44px] cursor-text focus-within:border-dome transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((chip) => (
          <span
            key={chip}
            className="flex items-center gap-1 bg-dome/10 border border-dome/30 text-dome text-xs px-2.5 py-1 rounded-full"
          >
            {chip}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeChip(chip); }}
              className="text-dome/60 hover:text-dome leading-none ml-0.5"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (input.trim()) addChip(input); }}
          placeholder={chips.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-white text-sm placeholder-zinc-600 focus:outline-none"
        />
      </div>

      {/* Suggestion pills */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {filtered.slice(0, 12).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addChip(s)}
              className="text-xs px-2.5 py-1 rounded-full border border-studio-border bg-studio-bg text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SingleChipSelect ──────────────────────────────────────────────────────────

interface ChipSuggestion { label: string; value: string; }

interface SingleChipSelectProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: (string | ChipSuggestion)[];
  placeholder?: string;
  // Overrides how the committed value renders in the pill — for suggestions
  // where the stored value is a machine key but the chip showed a friendly
  // label (e.g. energy_profile: 'high' displaying as "Radiant").
  displayLabel?: string;
}

function SingleChipSelect({ value, onChange, suggestions, placeholder = 'Type or pick one…', displayLabel }: SingleChipSelectProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(v: string) {
    const trimmed = v.trim();
    onChange(trimmed);
    setInput('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(input);
    } else if (e.key === 'Backspace' && input === '' && value) {
      onChange('');
    }
  }

  const items: ChipSuggestion[] = suggestions.map(s => typeof s === 'string' ? { label: s, value: s } : s);
  const filtered = items.filter(
    (s) => !input || s.label.toLowerCase().includes(input.toLowerCase())
  );

  return (
    <div>
      {value ? (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 bg-dome/10 border border-dome/30 text-dome text-sm px-3.5 py-1.5 rounded-full">
            {displayLabel ?? value}
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-dome/60 hover:text-dome leading-none"
            >
              ×
            </button>
          </span>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => { if (input.trim()) commit(input); }}
            placeholder={placeholder}
            className="w-full bg-studio-muted border border-studio-border text-white placeholder-zinc-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-dome transition-colors"
          />
          {filtered.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {filtered.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => commit(s.value)}
                  className="text-xs px-2.5 py-1 rounded-full border border-studio-border bg-studio-bg text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  initialData?: {
    bio?: string;
    alias?: string;
    genres?: string[];
    vocal_type?: string;
    energy_profile?: string;
    key_themes?: string[];
    profile_strength?: number;
  };
}

const GENRE_SUGGESTIONS = [
  'Afrobeats', 'Amapiano', 'Hip-Hop', 'R&B', 'Dancehall', 'Reggae',
  'Gospel', 'Pop', 'Soul', 'Jazz', 'Electronic', 'Trap', 'Drill',
  'Highlife', 'Bongo Flava', 'Kizomba', 'Kuduro', 'Baile Funk',
  'Cumbia', 'Reggaeton', 'Lo-fi', 'Neo-soul', 'UK Garage', 'Grime',
];
const VOCAL_SUGGESTIONS = [
  'Vocalist', 'Rapper', 'Producer', 'Songwriter', 'Instrumentalist',
  'Multi-hyphenate', 'Beatmaker', 'DJ', 'Composer', 'Arranger',
];
// Chip label is the friendly personality name; committed value is the
// canonical energy_profile storage key (high/medium/low/chaotic) — the same
// one ArtistPassportCard and DiscoverPage read to color the passport. Free
// text is still allowed for anything outside the four, it just won't pick
// up a personality color (see lib/personality.ts).
const ENERGY_SUGGESTIONS: ChipSuggestion[] = (Object.keys(PERSONALITIES) as PersonalityKey[])
  .map(key => ({ label: PERSONALITIES[key].label, value: key }));
const THEME_SUGGESTIONS = [
  'loyalty', 'love', 'growth', 'street life', 'struggle', 'faith',
  'identity', 'freedom', 'family', 'ambition', 'healing', 'nostalgia',
];

export default function ProfileEditDrawer({ open, onClose, initialData }: Props) {
  const { user, token, setAuth } = useAuthStore();
  const qc = useQueryClient();
  const toast = useToast();

  const [bio, setBio] = useState(initialData?.bio ?? '');
  const [alias, setAlias] = useState(initialData?.alias ?? '');
  const [genres, setGenres] = useState<string[]>(initialData?.genres ?? []);
  const [vocalType, setVocalType] = useState(initialData?.vocal_type ?? '');
  const [energyProfile, setEnergyProfile] = useState(initialData?.energy_profile ?? '');
  const [keyThemes, setKeyThemes] = useState<string[]>(initialData?.key_themes ?? []);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setBio(initialData?.bio ?? '');
    setAlias(initialData?.alias ?? '');
    setGenres(initialData?.genres ?? []);
    setVocalType(initialData?.vocal_type ?? '');
    setEnergyProfile(initialData?.energy_profile ?? '');
    setKeyThemes(initialData?.key_themes ?? []);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => closeRef.current?.focus(), 0);
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const saveProfile = useMutation({
    mutationFn: () =>
      api.patch('/passport/profile', {
        bio,
        alias,
        creative_dna: {
          genres,
          vocal_type: vocalType,
          energy_profile: energyProfile,
          key_themes: keyThemes,
        },
      }),
    onSuccess: async (res) => {
      const strength = res.data?.passport?.profile_strength;
      await refreshMe(setAuth, token);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['passport'] }),
        qc.invalidateQueries({ queryKey: ['artist', user?.artist?.id] }),
      ]);
      toast.success(`Profile updated${strength != null ? ` · ${strength}% strength` : ''}`);
      onClose();
    },
    onError: (error: any) => toast.error(error?.response?.data?.message ?? 'Failed to save profile'),
  });

  if (!open) return null;

  const currentStrength = initialData?.profile_strength ?? user?.artist?.passport?.profile_strength ?? 0;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} aria-hidden="true" />

      <div className="fixed right-0 top-0 h-full w-full max-w-md z-50 bg-studio-surface border-l border-studio-border overflow-y-auto flex flex-col" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-studio-border sticky top-0 bg-studio-surface">
          <div>
            <p className="label-mono mb-0.5">Edit Profile</p>
            <h3 id="profile-edit-title" className="font-display text-lg text-white">{user?.artist?.name}</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-zinc-500 text-xs">Passport score</p>
              <p className="text-dome font-display text-lg">{currentStrength}%</p>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close profile editor" className="text-zinc-500 hover:text-white transition-colors text-xl leading-none">×</button>
          </div>
        </div>

        {/* Strength bar */}
        <div className="px-6 pt-4 pb-0">
          <div className="w-full h-1 bg-studio-border rounded-full">
            <div className="h-full bg-dome rounded-full transition-all duration-300" style={{ width: `${currentStrength}%` }} />
          </div>
        </div>

        {/* Fields */}
        <div className="flex-1 px-6 py-5 space-y-7">

          {/* Alias */}
          <div>
            <label className="label-mono block mb-2">Artist alias</label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              maxLength={120}
              placeholder="e.g. DJ Nova, The Kid"
              className="w-full bg-studio-muted border border-studio-border text-white placeholder-zinc-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-dome transition-colors"
            />
          </div>

          {/* Bio */}
          <div>
            <label className="label-mono block mb-2">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={2000}
              placeholder="Tell your story — where you're from, what drives your sound, where you're headed..."
              rows={4}
              className="w-full bg-studio-muted border border-studio-border text-white placeholder-zinc-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-dome transition-colors resize-none"
            />
            <p className="mt-1 text-right text-xs text-zinc-600">{bio.length}/2000</p>
          </div>

          {/* Genres */}
          <div>
            <label className="label-mono block mb-2">
              Genres
            </label>
            <ChipInput
              chips={genres}
              onChange={setGenres}
              placeholder="Type a genre and press Enter…"
              suggestions={GENRE_SUGGESTIONS}
            />
          </div>

          {/* Vocal / Role type */}
          <div>
            <label className="label-mono block mb-2">
              You are a…
            </label>
            <SingleChipSelect
              value={vocalType}
              onChange={setVocalType}
              suggestions={VOCAL_SUGGESTIONS}
              placeholder="Vocalist, Producer, Rapper… type or pick"
            />
          </div>

          {/* Energy profile */}
          <div>
            <label className="label-mono block mb-2">
              Energy
            </label>
            <SingleChipSelect
              value={energyProfile}
              onChange={setEnergyProfile}
              suggestions={ENERGY_SUGGESTIONS}
              placeholder="Radiant, Steady, Introspective, Volatile…"
              displayLabel={
                energyProfile && energyProfile.toLowerCase() in PERSONALITIES
                  ? getPersonality(energyProfile).label
                  : undefined
              }
            />
          </div>

          {/* Key themes */}
          <div>
            <label className="label-mono block mb-2">
              Key themes
            </label>
            <ChipInput
              chips={keyThemes}
              onChange={setKeyThemes}
              placeholder="loyalty, growth, love… press Enter to add"
              suggestions={THEME_SUGGESTIONS}
            />
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-studio-border sticky bottom-0 bg-studio-surface flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-studio-border text-zinc-400 py-3 rounded-lg text-sm hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveProfile.mutate()}
            disabled={saveProfile.isPending}
            className="flex-1 bg-dome text-black font-semibold py-3 rounded-lg text-sm hover:bg-dome-light transition-colors disabled:opacity-50"
          >
            {saveProfile.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </div>
    </>
  );
}
