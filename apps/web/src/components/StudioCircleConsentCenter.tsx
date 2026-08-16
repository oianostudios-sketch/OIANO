import { useCallback, useEffect, useState } from 'react';
import { Building2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import ArtistAvatar from './ArtistAvatar';
import { useToast } from './Toast';

type Visibility = 'INITIALS' | 'STAGE_NAME' | 'FULL_PROFILE';
type ConsentStatus = 'ELIGIBLE' | 'REQUESTED' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN';

interface Membership {
  id: string;
  consent_status: ConsentStatus;
  visibility: 'HIDDEN' | Visibility;
  show_session_count: boolean;
  show_projects: boolean;
  session_count: number;
  first_session_at: string;
  last_session_at: string;
  studio: { id: string; name: string; slug: string; address?: string | null; logo_url?: string | null };
}

interface Draft { visibility: Visibility; showSessionCount: boolean; showProjects: boolean }

const visibilityCopy: Record<Visibility, string> = {
  INITIALS: 'Initials only',
  STAGE_NAME: 'Stage name and image',
  FULL_PROFILE: 'Full Passport preview',
};

export default function StudioCircleConsentCenter({ artistName, avatarUrl }: { artistName: string; avatarUrl?: string | null }) {
  const toast = useToast();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/studio-circle/me');
      const next = (data.memberships ?? []) as Membership[];
      setMemberships(next);
      setDrafts(Object.fromEntries(next.map(member => [member.id, {
        visibility: member.visibility === 'HIDDEN' ? 'STAGE_NAME' : member.visibility,
        showSessionCount: member.show_session_count,
        showProjects: member.show_projects,
      }])));
    } catch { /* Passport remains usable if Circle data is unavailable. */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function update(member: Membership, action: 'accept' | 'decline' | 'withdraw') {
    setSavingId(member.id);
    try {
      const draft = drafts[member.id] ?? { visibility: 'STAGE_NAME', showSessionCount: false, showProjects: false };
      await api.patch(`/studio-circle/${member.id}/consent`, action === 'accept' ? {
        action,
        visibility: draft.visibility,
        show_session_count: draft.showSessionCount,
        show_projects: draft.showProjects,
      } : { action });
      await load();
      toast.success(action === 'accept' ? `You joined ${member.studio.name}'s Circle` : action === 'withdraw' ? 'Circle visibility withdrawn' : 'Invitation declined');
    } catch { toast.error('Could not update Circle permission'); }
    finally { setSavingId(null); }
  }

  return (
    <section className="circle-consent" aria-labelledby="circle-consent-title">
      <style>{`
        .circle-consent{border:1px solid #202020;border-radius:14px;background:linear-gradient(145deg,#0e1012,#090909);padding:18px;overflow:hidden}
        .ccc-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.ccc-head h2{margin:4px 0 0;color:#ddd;font:600 15px 'DM Sans',sans-serif}.ccc-head p{margin:5px 0 0;color:#555;font-size:10px;line-height:1.55;max-width:520px}.ccc-lock{display:flex;align-items:center;gap:6px;color:#5d826f;font:8px 'JetBrains Mono',monospace;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
        .ccc-list{display:grid;gap:12px;margin-top:16px}.ccc-card{border:1px solid #1c1c1c;border-radius:12px;background:#0a0a0a;padding:14px}.ccc-card-top{display:flex;gap:11px;align-items:center}.ccc-studio-icon{width:42px;height:42px;border-radius:11px;display:grid;place-items:center;background:#111820;border:1px solid #1c2b35;color:#719db9}.ccc-studio{min-width:0;flex:1}.ccc-studio strong{display:block;color:#d6d3d1;font-size:12px}.ccc-studio span{display:block;margin-top:3px;color:#484848;font-size:9px}.ccc-status{border-radius:10px;padding:3px 7px;font:7px 'JetBrains Mono',monospace;letter-spacing:.08em;text-transform:uppercase}.ccc-status.accepted{color:#46a987;border:1px solid #1D9E7540;background:#1D9E750e}.ccc-status.pending{color:#d3b35c;border:1px solid #C9A84C35;background:#C9A84C0c}.ccc-status.private{color:#71717a;border:1px solid #27272a}
        .ccc-preview{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:13px}.ccc-preview-card{display:flex;align-items:center;gap:10px;padding:11px;border:1px solid #1b242a;border-radius:10px;background:linear-gradient(135deg,#0e151a,#0b0b0b)}.ccc-preview-copy{min-width:0}.ccc-preview-copy small{display:block;color:#5986a4;font:7px 'JetBrains Mono',monospace;letter-spacing:.09em;text-transform:uppercase}.ccc-preview-copy strong{display:block;margin-top:4px;color:#ddd;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ccc-preview-copy span{display:block;margin-top:3px;color:#555;font-size:8px}.ccc-controls{display:grid;gap:8px}.ccc-controls select{width:100%;height:34px;border:1px solid #262626;border-radius:8px;background:#101010;color:#aaa;padding:0 9px;font:10px inherit}.ccc-check{display:flex;align-items:center;gap:8px;color:#777;font-size:9px}.ccc-check input{accent-color:#C9A84C}
        .ccc-actions{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-top:12px;padding-top:12px;border-top:1px solid #171717}.ccc-actions div{display:flex;gap:8px}.ccc-btn{min-height:34px;border-radius:8px;padding:0 11px;border:1px solid #292929;background:#111;color:#888;font:9px inherit;cursor:pointer}.ccc-btn.primary{border-color:#C9A84C;background:#C9A84C;color:#090909;font-weight:700}.ccc-btn.danger{color:#9f6666;border-color:#382323;background:#140c0c}.ccc-btn:disabled{opacity:.45;cursor:wait}.ccc-note{display:flex;gap:7px;align-items:flex-start;color:#494949;font-size:9px;line-height:1.45}.ccc-empty{margin-top:15px;padding:14px;border:1px dashed #242424;border-radius:10px;color:#555;font-size:10px;line-height:1.6}.ccc-policy{display:flex;gap:8px;margin-top:13px;padding-top:13px;border-top:1px solid #191919;color:#555;font-size:9px;line-height:1.55}.ccc-policy strong{color:#80745b}
        @media(max-width:700px){.ccc-preview{grid-template-columns:1fr}.ccc-head{display:block}.ccc-lock{margin-top:9px}.ccc-actions{align-items:flex-start;flex-direction:column}.ccc-actions div{width:100%}.ccc-btn{flex:1}}
      `}</style>
      <div className="ccc-head">
        <div><span className="pp-panel-label">Professional network</span><h2 id="circle-consent-title">Studio Circle permissions</h2><p>Preview and control how verified studios may present your professional relationship. Nothing becomes visible until you approve it.</p></div>
        <span className="ccc-lock"><ShieldCheck size={12} /> Artist controlled</span>
      </div>

      {loading ? <p className="ccc-empty">Loading verified studio relationships…</p> : memberships.length ? (
        <div className="ccc-list">{memberships.map(member => {
          const draft = drafts[member.id] ?? { visibility: 'STAGE_NAME', showSessionCount: false, showProjects: false };
          const accepted = member.consent_status === 'ACCEPTED';
          const canRespond = ['ELIGIBLE', 'REQUESTED', 'DECLINED', 'WITHDRAWN'].includes(member.consent_status);
          return <article key={member.id} className="ccc-card">
            <div className="ccc-card-top"><span className="ccc-studio-icon"><Building2 size={18} /></span><div className="ccc-studio"><strong>{member.studio.name}</strong><span>{member.studio.address ?? 'Verified OIANO studio'} · {member.session_count} completed session{member.session_count === 1 ? '' : 's'}</span></div><span className={`ccc-status ${accepted ? 'accepted' : member.consent_status === 'REQUESTED' ? 'pending' : 'private'}`}>{accepted ? 'Visible' : member.consent_status === 'REQUESTED' ? 'Invitation' : 'Private'}</span></div>
            <div className="ccc-preview">
              <div className="ccc-preview-card"><ArtistAvatar src={draft.visibility === 'INITIALS' ? null : avatarUrl} name={artistName} size={42} /><div className="ccc-preview-copy"><small>Public preview</small><strong>{draft.visibility === 'INITIALS' ? artistName.split(/\s+/).map(part => part[0]).join('').slice(0,2).toUpperCase() : artistName}</strong><span>Verified creator{draft.showSessionCount ? ` · ${member.session_count} session${member.session_count === 1 ? '' : 's'}` : ''}{draft.showProjects ? ' · Selected public projects' : ''}</span></div></div>
              <div className="ccc-controls"><select aria-label={`Visibility at ${member.studio.name}`} value={draft.visibility} onChange={event => setDrafts(current => ({...current,[member.id]:{...draft,visibility:event.target.value as Visibility}}))}>{Object.entries(visibilityCopy).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><label className="ccc-check"><input type="checkbox" checked={draft.showSessionCount} onChange={event=>setDrafts(current=>({...current,[member.id]:{...draft,showSessionCount:event.target.checked}}))}/> Show verified session count</label><label className="ccc-check"><input type="checkbox" checked={draft.showProjects} onChange={event=>setDrafts(current=>({...current,[member.id]:{...draft,showProjects:event.target.checked}}))}/> Show selected public projects</label></div>
            </div>
            <div className="ccc-actions"><span className="ccc-note">{accepted ? <Eye size={12}/> : <EyeOff size={12}/>} {accepted ? 'Your approved preview is visible in this Studio Circle.' : 'This relationship remains private to studio operations.'}</span><div>{accepted ? <button className="ccc-btn danger" disabled={savingId===member.id} onClick={()=>update(member,'withdraw')}>Withdraw</button> : <>{canRespond&&<button className="ccc-btn" disabled={savingId===member.id} onClick={()=>update(member,'decline')}>Keep private</button>}<button className="ccc-btn primary" disabled={savingId===member.id} onClick={()=>update(member,'accept')}>{savingId===member.id?'Saving…':member.consent_status==='REQUESTED'?'Approve preview':'Join Circle'}</button></>}</div></div>
          </article>;
        })}</div>
      ) : <p className="ccc-empty">After your first completed studio session, the verified relationship will appear here privately. You decide if it joins the studio’s public Circle.</p>}
      <div className="ccc-policy"><ShieldCheck size={13}/><span><strong>Circle permission is not advertising permission.</strong> Studios cannot use your image in paid campaigns, social promotions or release marketing through this approval.</span></div>
    </section>
  );
}
