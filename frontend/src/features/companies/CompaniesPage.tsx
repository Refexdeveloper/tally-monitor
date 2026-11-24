import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Company } from '@/api/adminTypes';
import { companiesApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import { IconTile } from '@/components/common/IconTile';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/data/DataTable';
import { SearchToolbar } from '@/components/data/SearchToolbar';
import { useListState } from '@/hooks/useListState';
import { useAuthStore } from '@/stores/auth';
import { brand } from '@/theme/theme';
import { formatMoney, formatNumber } from '@/utils/format';
import { CompanyStatusBadge } from '../shared/Badges';
import { CompanyFormDialog } from './CompanyFormDialog';

export function CompaniesPage() {
  const navigate = useNavigate();
  const canManage = useAuthStore((s) => s.hasPermission('companies.manage'));
  const allScope = useAuthStore((s) => s.user?.companyScope === 'ALL');
  const list = useListState({ sort: 'name', order: 'asc', status: 'all' });
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['companies', list.params], queryFn: () => companiesApi.list(list.params), placeholderData: (p) => p });

  const columns: Column<Company>[] = [
    {
      key: 'name',
      header: 'Company',
      sortKey: 'name',
      render: (c) => (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 40, height: 40, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: 'primary.lighter', color: 'primary.dark', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
            {c.code.slice(0, 3)}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap>
              {c.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {c.code}
              {c.gstin ? ` · ${c.gstin}` : ''}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    {
      key: 'tally',
      header: 'Tally company / server',
      hideBelow: 'md',
      render: (c) => (
        <>
          <Typography variant="body2" noWrap>
            {c.tallyCompanyName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {c.tallyServer ? c.tallyServer.name : 'No server assigned'}
          </Typography>
        </>
      ),
    },
    { key: 'apps', header: 'Apps', align: 'right', hideBelow: 'sm', render: (c) => formatNumber(c.stats.connectedApplications) },
    {
      key: 'expenses',
      header: 'Expenses',
      align: 'right',
      sortKey: 'expenses',
      hideBelow: 'lg',
      render: (c) => (
        <>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {formatNumber(c.stats.expenses)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatMoney(c.stats.expenseAmount, c.defaultCurrency, { compact: true })}
          </Typography>
        </>
      ),
    },
    { key: 'posted', header: 'Posted', align: 'right', hideBelow: 'lg', render: (c) => formatNumber(c.stats.postedVouchers) },
    { key: 'open', header: 'Pending jobs', align: 'right', sortKey: 'openJobs', hideBelow: 'sm', render: (c) => formatNumber(c.stats.openJobs) },
    { key: 'status', header: 'Integration', render: (c) => <CompanyStatusBadge status={c.integrationStatus} /> },
  ];

  return (
    <>
      <PageHeader
        icon={<IconTile icon={Building2} color={brand.purple.main} size={52} />}
        title="Companies"
        subtitle={q.data ? `${formatNumber(q.data.meta.total)} group companies` : 'Group companies and their TallyPrime targets'}
        actions={
          canManage &&
          allScope && (
            <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setCreating(true)}>
              Add company
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(c) => c.id}
        loading={q.isFetching}
        error={q.error ? toApiError(q.error).message : null}
        onRetry={() => void q.refetch()}
        meta={q.data?.meta}
        onPageChange={list.setPage}
        sort={{ key: list.params.sort, order: list.params.order ?? 'asc' }}
        onSortChange={list.setSort}
        onRowClick={(c) => navigate(`/companies/${c.id}`)}
        emptyTitle={list.params.search ? 'No matching companies' : 'No companies yet'}
        emptyText={list.params.search ? 'Try a different search.' : 'Add your first group company to start mapping Kissflow applications to Tally.'}
        emptyAction={
          canManage && allScope && !list.params.search ? (
            <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setCreating(true)}>
              Add company
            </Button>
          ) : undefined
        }
        toolbar={
          <SearchToolbar value={list.params.search ?? ''} onChange={list.setSearch} placeholder="Search name, code, GSTIN or Tally name">
            <TextField select size="small" label="Status" value={list.params.status} onChange={(e) => list.set({ status: e.target.value })} sx={{ minWidth: 160 }}>
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </TextField>
          </SearchToolbar>
        }
      />
      <CompanyFormDialog open={creating} onClose={() => setCreating(false)} onSaved={(c) => navigate(`/companies/${c.id}`)} />
    </>
  );
}
