import { create } from 'zustand';
import type { UserProfile } from '@/api/types';

export type AuthStatus = 'initializing' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  /** Kept in memory only; the refresh token lives in an HTTP-only cookie. */
  accessToken: string | null;
  user: UserProfile | null;
  setSession: (accessToken: string, user: UserProfile) => void;
  clear: () => void;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'initializing',
  accessToken: null,
  user: null,
  setSession: (accessToken, user) => set({ accessToken, user, status: 'authenticated' }),
  clear: () => set({ accessToken: null, user: null, status: 'anonymous' }),
  hasPermission: (permission) => get().user?.permissions.includes(permission) ?? false,
}));
