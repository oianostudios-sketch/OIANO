import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  role: 'ARTIST' | 'STUDIO_ADMIN' | 'ENGINEER' | 'PRODUCER';
  artist?: {
    id: string;
    name: string;
    alias?: string;
    status?: 'AVAILABLE_FOR_BOOKING' | 'IN_SESSION' | 'UNAVAILABLE';
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
