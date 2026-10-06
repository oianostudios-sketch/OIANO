import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UsersRound } from 'lucide-react';
import { api } from '../lib/api';

// A contribution invitation is claimed with the link its project lead sent. An
// account at the invited email address is not enough, because signing up never
// proves an address. Claiming only links the invitation to this identity; the
// role is reviewed, and accepted or declined, in the contribution inbox.
export default function AcceptContributionInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const token = params.get('token') ?? '';
  const claim = useMutation({
    mutationFn: () => api.post('/contributions/claim', { token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contribution-inbox'] });
      navigate('/contributions', { replace: true });
    },
  });

  return <main className="grid min-h-screen place-items-center bg-studio-bg p-5 text-white">
    <section className="w-full max-w-md rounded-3xl border border-white/[.08] bg-studio-surface p-8 text-center">
      <UsersRound size={24} className="mx-auto text-violet-300"/>
      <p className="mt-6 text-[9px] font-mono uppercase tracking-[.25em] text-zinc-600">Contribution invitation</p>
      <h1 className="mt-3 font-display text-3xl">Join the work</h1>
      <p className="mt-4 text-xs leading-5 text-zinc-500">Claiming links this invitation to your OIANO identity. You will see the project and your role before you decide to join.</p>
      {claim.isError && <p role="alert" className="mt-5 rounded-xl border border-red-500/20 p-3 text-xs text-red-300">{(claim.error as any)?.response?.data?.error ?? 'This invitation is no longer valid.'}</p>}
      <button type="button" disabled={!token || claim.isPending} onClick={() => claim.mutate()} className="mt-7 w-full rounded-xl bg-violet-300 px-4 py-3 text-xs font-semibold text-black disabled:opacity-40">{claim.isPending ? 'Claiming…' : 'Claim invitation'}</button>
    </section>
  </main>;
}
