import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserRole } from '../lib/accountArchitecture';

interface User {
  id: string;
  email: string;
  role: UserRole;
  mfa_enabled?: boolean;
  studio_staff?: Array<{ id: string; studio_id: string; role: UserRole; position?: string; capabilities?: string[] }>;
  artist?: {
    id: string;
    name: string;
    alias?: string;
    avatar_url?: string | null;
    status?: 'AVAILABLE_FOR_BOOKING' | 'IN_SESSION' | 'UNAVAILABLE';
    onboarding_completed_at?: string | null;
    passport?: { passport_code: string; profile_strength: number };
    wallet?: { balance_usd: number };
  };
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => {
        set({ token: null, user: null });
        useAuthStore.persist.clearStorage();
      },
    }),
    { name: 'oiano-auth' }
  )
);
