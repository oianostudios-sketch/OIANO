import { useState } from 'react';
import { ArrowRight, Check, MapPin, Sparkles } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { CREATIVE_DISCIPLINES, disciplineLabel } from '../lib/creativeDisciplines';
import { useAuthStore } from '../store/auth.store';
import { isSignupPlaceholderName } from '../../../../packages/shared/src/placeholderNames';
import { safeReturnDestination } from '../lib/returnDestination';

const COMMON_SERVICES = ['Production', 'Recording', 'Editing', 'Mixing', 'Mastering', 'Songwriting', 'Composition', 'Session performance', 'Creative direction'];

export default function ProfessionalOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const destination = safeReturnDestination(searchParams.get('next')) ?? '/producer';
  const { user, token, setAuth } = useAuthStore();
  const existing = user?.producer?.disciplines?.length ? user.producer.disciplines : ['PRODUCER'];
  // Signup without a name gives a neutral placeholder; ask for the real one here.
  const [name, setName] = useState(isSignupPlaceholderName(user?.producer?.name) ? '' : user?.producer?.name ?? '');
  const [alias, setAlias] = useState(user?.producer?.alias ?? '');
  const [disciplines, setDisciplines] = useState<string[]>(existing);
  const [primary, setPrimary] = useState(existing.find(id => id === user?.producer?.primary_discipline) ?? existing[0]);
  const [customPractice, setCustomPractice] = useState('');
  const [practiceError, setPracticeError] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleDiscipline(id: string) {
    setPracticeError('');
    if (disciplines.includes(id)) {
      if (disciplines.length === 1) {
        setPracticeError('Keep at least one practice selected.');
        return;
      }
      const next = disciplines.filter(item => item !== id);
      if (primary === id) setPrimary(next[0]);
      setDisciplines(next);
      return;
    }
    if (disciplines.length >= 6) {
      setPracticeError('Choose up to six practices. Remove one before adding another.');
      return;
    }
    setDisciplines([...disciplines, id]);
  }

  function addPractice() {
    const value = customPractice.trim();
    if (!value) { setPracticeError('Enter your own practice description before adding it.'); return; }
    if (value.length > 60) { setPracticeError('Use 60 characters or fewer for a practice label.'); return; }
    if (disciplines.some(id => id.trim().toLowerCase() === value.toLowerCase() || disciplineLabel(id).toLowerCase() === value.toLowerCase())) {
      setPracticeError('That practice is already selected.'); return;
    }
    if (disciplines.length >= 6) {
      setPracticeError('Choose up to six practices. Remove one before adding another.'); return;
    }
    const suggested = CREATIVE_DISCIPLINES.find(item => item.label.toLowerCase() === value.toLowerCase());
    setDisciplines(current => [...current, suggested?.id ?? value]);
    setCustomPractice('');
    setPracticeError('');
  }

  async function complete() {
    if (!name.trim() || !disciplines.length || !disciplines.includes(primary)) return;
    setSaving(true); setError('');
    try {
      await api.patch('/producer/me', {
        name: name.trim(), alias: alias.trim() || undefined, bio: bio.trim() || undefined,
        disciplines, primary_discipline: primary, services,
        location: location.trim() || null, onboarding_complete: true,
      });
      const refreshed = await api.get('/auth/me');
      if (token) setAuth(token, refreshed.data);
      navigate(destination, { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Your professional profile could not be saved.');
    } finally { setSaving(false); }
  }

  return <main className="min-h-screen bg-studio-bg px-5 py-10 text-white md:py-16">
    <div className="mx-auto max-w-4xl">
      <header className="max-w-2xl">
        <p className="font-mono text-[9px] uppercase tracking-[.28em] text-dome">Creative professional identity</p>
        <h1 className="mt-4 font-display text-4xl md:text-5xl">Make your contribution unmistakable.</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-500">Your disciplines describe what you do. Project roles document what you did. Studio permissions determine what you can operate.</p>
      </header>

      <section className="mt-10 grid gap-8 rounded-3xl border border-white/[.07] bg-studio-surface p-6 md:p-8">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Professional name *<input autoFocus value={name} onChange={(e)=>setName(e.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-black/30 p-3 text-sm normal-case text-white outline-none focus:border-dome" /></label>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Public alias<input value={alias ?? ''} onChange={(e)=>setAlias(e.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-black/30 p-3 text-sm normal-case text-white outline-none focus:border-dome" /></label>
        </div>

        <fieldset>
          <legend className="text-xs font-semibold">Your creative practice</legend>
          <p id="practice-help" className="mt-1 text-[11px] text-zinc-400">Use a suggestion or your own words, up to six labels. The primary label appears first; it does not grant permissions or define your project role.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CREATIVE_DISCIPLINES.map((item) => { const selected=disciplines.includes(item.id); return <div key={item.id} className={`rounded-2xl border p-4 ${selected?'border-dome/40 bg-dome/[.06]':'border-white/[.06]'}`}>
              <button type="button" onClick={()=>toggleDiscipline(item.id)} aria-pressed={selected} className="flex w-full items-start gap-3 text-left"><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${selected?'border-dome bg-dome text-black':'border-zinc-700'}`}>{selected&&<Check size={12}/>}</span><span><b className="block text-xs">{item.label}</b><span className="mt-1 block text-[10px] leading-4 text-zinc-600">{item.description}</span></span></button>
              {selected&&<button type="button" onClick={()=>setPrimary(item.id)} className={`mt-3 text-[9px] uppercase tracking-wider ${primary===item.id?'text-dome':'text-zinc-700 hover:text-zinc-400'}`}>{primary===item.id?'★ Primary discipline':'☆ Make primary'}</button>}
            </div>; })}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {disciplines.filter(id => !CREATIVE_DISCIPLINES.some(item => item.id === id)).map(id => (
              <div key={id} data-custom-practice className="min-w-0 max-w-full rounded-xl border border-dome/40 p-3">
                <p className="break-words text-sm">{id}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <button type="button" aria-label={`Make ${id} primary`} aria-pressed={primary === id} onClick={() => setPrimary(id)} className="min-h-11 text-xs text-dome">{primary === id ? 'Primary practice' : 'Make primary'}</button>
                  <button type="button" aria-label={`Remove ${id}`} disabled={disciplines.length === 1} onClick={() => toggleDiscipline(id)} className="min-h-11 text-xs text-zinc-300 disabled:opacity-40">Remove</button>
                </div>
              </div>
            ))}
          </div>
          <label htmlFor="custom-practice" className="mt-5 block text-sm text-zinc-300">Describe your practice in your own words</label>
          <div className="mt-2 flex flex-wrap gap-3">
            <input id="custom-practice" value={customPractice} maxLength={60} aria-describedby="practice-help practice-feedback" aria-invalid={!!practiceError} onChange={event => { setCustomPractice(event.target.value); setPracticeError(''); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addPractice(); } }} placeholder="For example, sound and spatial storytelling" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/20 bg-black/30 px-3 text-sm text-white focus:border-dome" />
            <button type="button" onClick={addPractice} className="min-h-11 rounded-xl border border-dome/40 px-4 text-sm text-dome">Add practice</button>
          </div>
          <p id="practice-feedback" role={practiceError ? 'alert' : 'status'} className={`mt-2 text-xs ${practiceError ? 'text-red-300' : 'text-zinc-400'}`}>{practiceError || `${disciplines.length} of 6 practices selected. You can edit these later.`}</p>
        </fieldset>

        <fieldset><legend className="text-xs font-semibold">Services you offer</legend><div className="mt-3 flex flex-wrap gap-2">{COMMON_SERVICES.map((service)=>{const active=services.includes(service);return <button type="button" key={service} aria-pressed={active} onClick={()=>setServices((current)=>active?current.filter((item)=>item!==service):[...current,service])} className={`rounded-full border px-3 py-2 text-[10px] ${active?'border-sky-400/50 bg-sky-400/10 text-sky-200':'border-white/[.07] text-zinc-600'}`}>{service}</button>})}</div></fieldset>

        <div className="grid gap-4 md:grid-cols-2"><label className="text-[10px] uppercase tracking-wider text-zinc-500"><span className="flex items-center gap-2"><MapPin size={12}/>Location</span><input value={location} onChange={(e)=>setLocation(e.target.value)} placeholder="City, country or Remote" className="mt-2 w-full rounded-xl border border-white/[.08] bg-black/30 p-3 text-sm normal-case text-white outline-none focus:border-dome" /></label><label className="text-[10px] uppercase tracking-wider text-zinc-500">Short professional introduction<textarea value={bio} onChange={(e)=>setBio(e.target.value)} rows={3} className="mt-2 w-full resize-y rounded-xl border border-white/[.08] bg-black/30 p-3 text-sm normal-case text-white outline-none focus:border-dome" /></label></div>
        <div className="rounded-2xl border border-sky-400/10 bg-sky-400/[.025] p-4 text-[11px] leading-5 text-zinc-500"><Sparkles size={14} className="mb-2 text-sky-300"/>Studio ownership is not a discipline. For now, running a studio or working on a studio’s staff needs a separate studio account; this profile cannot hold studio access.</div>
        {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
        <button type="button" disabled={saving||!name.trim()||!disciplines.length} onClick={complete} className="inline-flex items-center justify-center gap-2 rounded-xl bg-dome px-5 py-4 text-sm font-semibold text-black disabled:opacity-40">{saving?'Building your workspace…':'Enter your professional home'}<ArrowRight size={16}/></button>
      </section>
    </div>
  </main>;
}
