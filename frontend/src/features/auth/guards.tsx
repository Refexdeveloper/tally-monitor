import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { hasSessionHint, refreshSession } from '@/api/client';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { useAuthStore } from '@/stores/auth';

/** Restores the session from the refresh cookie once on app start. */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  useEffect(() => {
    if (useAuthStore.getState().status !== 'initializing') return;
    if (!hasSessionHint()) {
      useAuthStore.getState().clear();
      return;
    }
    refreshSession().catch(() => undefined);
  }, []);
  if (status === 'initializing') return <LoadingScreen label="Restoring your session" />;
  return <>{children}</>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}
