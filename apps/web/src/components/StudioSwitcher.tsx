import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './Toast';

type Membership = {
  studio: { id: string; name: string; slug: string; logo_url?: string | null };
  role: string;
  position: string;
  capabilities: string[];
};

type MembershipResponse = {
  active_studio_id: string | null;
  memberships: Membership[];
};

export default function StudioSwitcher({ onSwitched }: { onSwitched?: () => void } = {}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data } = useQuery<MembershipResponse>({
    queryKey: ['studio-memberships'],
    queryFn: async () => (await api.get('/studio/memberships')).data,
    staleTime: 60_000,
  });
  const switchStudio = useMutation({
    mutationFn: async (studio_id: string) => (await api.patch('/studio/active', { studio_id })).data,
    onSuccess: async (result) => {
      queryClient.setQueryData<MembershipResponse>(['studio-memberships'], current => current
        ? { ...current, active_studio_id: result.active_studio.id }
        : current);
      await queryClient.invalidateQueries({ predicate: query => query.queryKey[0] !== 'studio-memberships' });
      toast.success(`Now working in ${result.active_studio.name}`);
      onSwitched?.();
    },
    onError: (error: any) => toast.error(error?.response?.data?.error ?? 'Studio could not be switched'),
  });

  if (!data?.memberships.length) return null;
  const active = data.memberships.find(item => item.studio.id === data.active_studio_id) ?? data.memberships[0];
  if (data.memberships.length === 1) {
    return <div className="hidden items-center gap-2 text-[10px] text-zinc-500 sm:flex"><Building2 size={13}/><span>{active.studio.name}</span><span className="text-zinc-700">· {active.position.replaceAll('_', ' ').toLowerCase()}</span></div>;
  }

  return (
    <label className="relative flex items-center gap-2 rounded-lg border border-white/[.08] bg-white/[.025] px-3 py-2 text-[10px] text-zinc-300">
      <Building2 size={13} className="text-dome" aria-hidden="true"/>
      <span className="sr-only">Active studio</span>
      <select
        value={active.studio.id}
        disabled={switchStudio.isPending}
        onChange={event => switchStudio.mutate(event.target.value)}
        className="max-w-[180px] appearance-none bg-transparent pr-5 text-[10px] font-medium text-zinc-300 outline-none disabled:opacity-50"
        aria-label="Switch active studio"
      >
        {data.memberships.map(item => <option key={item.studio.id} value={item.studio.id}>{item.studio.name} · {item.position.replaceAll('_', ' ')}</option>)}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2 text-zinc-600" aria-hidden="true"/>
    </label>
  );
}
