import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { authApi } from '@/api/endpoints';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Session may already be gone server-side; local sign-out still proceeds.
    }
    useAuthStore.getState().clear();
    queryClient.clear();
    navigate('/login', { replace: true });
    toast.info('You have been signed out.');
  }, [navigate, queryClient]);
}
