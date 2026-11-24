import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toApiError } from '@/api/client';
import { toast } from '@/stores/toast';

/** Mutation that toasts success/failure and refreshes the given query keys. */
export function useApiMutation<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string | null); invalidate?: QueryKey[]; onSuccess?: (r: TResult, vars: TVars) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      await Promise.all((opts.invalidate ?? []).map((key) => qc.invalidateQueries({ queryKey: key })));
      const msg = typeof opts.success === 'function' ? opts.success(result) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(result, vars);
    },
    onError: (err) => toast.error(toApiError(err).message),
  });
}

/** Maps API field validation details onto react-hook-form errors. */
export function applyServerErrors(err: unknown, setError: (name: never, e: { message: string }) => void) {
  const apiErr = toApiError(err);
  if (apiErr.code === 'VALIDATION_ERROR' && Array.isArray(apiErr.details)) {
    for (const d of apiErr.details as { path: string; message: string }[]) if (d.path) setError(d.path as never, { message: d.message });
  }
  return apiErr;
}
