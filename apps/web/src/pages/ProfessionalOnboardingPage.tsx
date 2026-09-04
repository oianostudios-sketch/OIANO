import { useState } from 'react';
import { ArrowRight, Check, MapPin, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { CREATIVE_DISCIPLINES, type CreativeDiscipline } from '../lib/creativeDisciplines';
import { useAuthStore } from '../store/auth.store';

const COMMON_SERVICES = ['Production', 'Recording', 'Editing', 'Mixing', 'Mastering', 'Songwriting', 'Composition', 'Session performance', 'Creative direction'];

export default function ProfessionalOnboardingPage() {
  const navigate = useNavigate();
  const { user, token, setAuth } = useAuthStore();
  const existing = (user?.producer?.disciplines ?? ['PRODUCER']) as CreativeDiscipline[];
  const [name, setName] = useState(user?.producer?.name ?? '');
  const [alias, setAlias] = useState(user?.producer?.alias ?? '');
  const [disciplines, setDisciplines] = useState<CreativeDiscipline[]>(existing);
  const [primary, setPrimary] = useState<CreativeDiscipline>((user?.producer?.primary_discipline as CreativeDiscipline) ?? existing[0] ?? 'PRODUCER');
  const [services, setServices] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleDiscipline(id: CreativeDiscipline) {
    setDisciplines((current) => {
      if (current.includes(id)) {
        if (current.length === 1) return current;
        const next = current.filter((item) => item !== id);
        if (primary === id) setPrimary(next[0]);
        return next;
      }
      return current.length < 6 ? [...current, id] : current;
    });
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
      navigate('/producer', { replace: true });
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
          <legend className="text-xs font-semibold">Your disciplines</legend>
          <p className="mt-1 text-[11px] text-zinc-600">Choose up to six. Select the star to define the discipline shown first.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CREATIVE_DISCIPLINES.map((item) => { const selected=disciplines.includes(item.id); return <div key={item.id} className={`rounded-2xl border p-4 ${selected?'border-dome/40 bg-dome/[.06]':'border-white/[.06]'}`}>
              <button type="button" onClick={()=>toggleDiscipline(item.id)} aria-pressed={selected} className="flex w-full items-start gap-3 text-left"><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${selected?'border-dome bg-dome text-black':'border-zinc-700'}`}>{selected&&<Check size={12}/>}</span><span><b className="block text-xs">{item.label}</b><span className="mt-1 block text-[10px] leading-4 text-zinc-600">{item.description}</span></span></button>
              {selected&&<button type="button" onClick={()=>setPrimary(item.id)} className={`mt-3 text-[9px] uppercase tracking-wider ${primary===item.id?'text-dome':'text-zinc-700 hover:text-zinc-400'}`}>{primary===item.id?'★ Primary discipline':'☆ Make primary'}</button>}
            </div>; })}
          </div>
        </fieldset>

        <fieldset><legend className="text-xs font-semibold">Services you offer</legend><div className="mt-3 flex flex-wrap gap-2">{COMMON_SERVICES.map((service)=>{const active=services.includes(service);return <button type="button" key={service} aria-pressed={active} onClick={()=>setServices((current)=>active?current.filter((item)=>item!==service):[...current,service])} className={`rounded-full border px-3 py-2 text-[10px] ${active?'border-sky-400/50 bg-sky-400/10 text-sky-200':'border-white/[.07] text-zinc-600'}`}>{service}</button>})}</div></fieldset>

        <div className="grid gap-4 md:grid-cols-2"><label className="text-[10px] uppercase tracking-wider text-zinc-500"><span className="flex items-center gap-2"><MapPin size={12}/>Location</span><input value={location} onChange={(e)=>setLocation(e.target.value)} placeholder="City, country or Remote" className="mt-2 w-full rounded-xl border border-white/[.08] bg-black/30 p-3 text-sm normal-case text-white outline-none focus:border-dome" /></label><label className="text-[10px] uppercase tracking-wider text-zinc-500">Short professional introduction<textarea value={bio} onChange={(e)=>setBio(e.target.value)} rows={3} className="mt-2 w-full resize-y rounded-xl border border-white/[.08] bg-black/30 p-3 text-sm normal-case text-white outline-none focus:border-dome" /></label></div>
        <div className="rounded-2xl border border-sky-400/10 bg-sky-400/[.025] p-4 text-[11px] leading-5 text-zinc-500"><Sparkles size={14} className="mb-2 text-sky-300"/>Studio ownership is not a discipline. A verified studio can invite this same identity as an owner, manager, engineer or other staff position—with its own accountable permissions.</div>
        {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
        <button type="button" disabled={saving||!name.trim()||!disciplines.length} onClick={complete} className="inline-flex items-center justify-center gap-2 rounded-xl bg-dome px-5 py-4 text-sm font-semibold text-black disabled:opacity-40">{saving?'Building your workspace…':'Enter your professional home'}<ArrowRight size={16}/></button>
      </section>
    </div>
  </main>;
}
