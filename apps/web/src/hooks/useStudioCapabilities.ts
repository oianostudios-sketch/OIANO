import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { activeMembership, membershipHolds, type MembershipResponse } from '../lib/studioCapabilities';

// Shares StudioSwitcher's query, so switching studio refreshes what the caller may do.
// Until the memberships load, nothing is held: an action appears once it is known to be
// allowed rather than vanishing after a click.
export function useStudioCapabilities() {
  const { data, isLoading } = useQuery<MembershipResponse>({
    queryKey: ['studio-memberships'],
    queryFn: async () => (await api.get('/studio/memberships')).data,
    staleTime: 60_000,
  });
  const membership = activeMembership(data);
  return {
    membership,
    isLoading,
    can: (capability: string) => membershipHolds(membership, capability),
  };
}
