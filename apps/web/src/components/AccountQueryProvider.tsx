import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useAuthStore } from '../store/auth.store';

export default function AccountQueryProvider({ children }: { children: ReactNode }) {
  const identity = useAuthStore(state => state.user?.id);
  const client = useMemo(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }), [identity]);
  useEffect(() => () => client.clear(), [client]);
  return <QueryClientProvider key={identity ?? 'signed-out'} client={client}>{children}</QueryClientProvider>;
}
