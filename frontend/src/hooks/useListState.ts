import { useCallback, useState } from 'react';
import type { ListParams } from '@/api/adminTypes';

/** Local pagination, search, sort and filter state for server-side tables. */
export function useListState(initial: ListParams = {}) {
  const [params, setParams] = useState<ListParams>({ page: 1, pageSize: 25, order: 'desc', ...initial });
  const set = useCallback((patch: ListParams) => setParams((p) => ({ ...p, ...patch, page: patch.page ?? 1 })), []);
  const setSearch = useCallback((search: string) => set({ search }), [set]);
  const setPage = useCallback((page: number, pageSize: number) => setParams((p) => ({ ...p, page, pageSize })), []);
  const setSort = useCallback((sort: string, order: 'asc' | 'desc') => set({ sort, order }), [set]);
  return { params, set, setSearch, setPage, setSort };
}
