import { Badge, Box, Button, Card, Chip, Collapse, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Filter, ReceiptText, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { ExpenseRow, VoucherKind } from '@/api/adminTypes';
import { applicationsApi, companiesApi, recordsApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import type { JobStatus } from '@/api/types';
import { IconTile } from '@/components/common/IconTile';
import { PageHeader } from '@/components/common/PageHeader';
import { JobStatusChip } from '@/components/common/StatusChip';
import { DataTable, type Column } from '@/components/data/DataTable';
import { SearchToolbar } from '@/components/data/SearchToolbar';
import { JOB_STATUS_META } from '@/config/status';
import { useListState } from '@/hooks/useListState';
import { brand } from '@/theme/theme';
import { formatDate, formatDateTime, formatMoney, formatNumber, humanize } from '@/utils/format';
import { VOUCHER_KIND_LABELS } from '../applications/appMeta';

const FILTER_KEYS = ['companyId', 'applicationId', 'dateFrom', 'dateTo', 'amountMin', 'amountMax', 'category', 'approvalStatus', 'status', 'voucherKind'] as const;

export function ExpensesPage() {
  const navigate = useNavigate();
  const list = useListState({ sort: 'receivedAt' });
  const [showFilters, setShowFilters] = useState(false);
  const q = useQuery({ queryKey: ['expenses', 'module', list.params], queryFn: () => recordsApi.expenses(list.params), placeholderData: (p) => p });
  const companies = useQuery({ queryKey: ['companies', 'all'], queryFn: () => companiesApi.list({ pageSize: 100, sort: 'name', order: 'asc' }), enabled: showFilters });
  const apps = useQuery({ queryKey: ['applications', 'all'], queryFn: () => applicationsApi.list({ pageSize: 100, sort: 'name', order: 'asc' }), enabled: showFilters });
  const categories = useQuery({ queryKey: ['expenses', 'categories'], queryFn: recordsApi.expenseCategories, enabled: showFilters });
  const active = FILTER_KEYS.filter((k) => list.params[k] !== undefined && list.params[k] !== '');
  const setFilter = (key: (typeof FILTER_KEYS)[number], value: string) => list.set({ [key]: value || undefined });

  const columns: Column<ExpenseRow>[] = [
    {
      key: 'id',
      header: 'Transaction',
      render: (e) => (
        <>
          <Typography variant="subtitle2" noWrap>
            {e.requestNumber ?? e.sourceTransactionId}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {e.id.slice(0, 8)}
          </Typography>
        </>
      ),
    },
    { key: 'app', header: 'Source application', render: (e) => e.application.name, hideBelow: 'lg' },
    { key: 'company', header: 'Company', render: (e) => e.company.name, hideBelow: 'md' },
    { key: 'kf', header: 'Kissflow request ID', render: (e) => <code>{e.kissflowRequestId ?? '-'}</code>, hideBelow: 'lg' },
    { key: 'date', header: 'Expense date', sortKey: 'expenseDate', render: (e) => formatDate(e.expenseDate), hideBelow: 'sm' },
    { key: 'party', header: 'Employee / vendor', render: (e) => e.party ?? '-', hideBelow: 'md' },
    { key: 'category', header: 'Category', render: (e) => e.category ?? '-', hideBelow: 'md' },
    { key: 'amount', header: 'Amount', align: 'right', sortKey: 'amount', render: (e) => <b>{formatMoney(e.amount, e.currency)}</b> },
    { key: 'approval', header: 'Approval', render: (e) => <Chip size="small" variant="outlined" color={e.approvalStatus === 'APPROVED' ? 'success' : e.approvalStatus === 'REJECTED' ? 'error' : 'warning'} label={humanize(e.approvalStatus)} />, hideBelow: 'lg' },
    { key: 'status', header: 'Processing', render: (e) => <JobStatusChip status={e.status} /> },
    { key: 'voucher', header: 'Tally voucher', render: (e) => e.voucherNumber ?? '-', hideBelow: 'lg' },
    { key: 'created', header: 'Created', sortKey: 'receivedAt', render: (e) => <span title={formatDateTime(e.receivedAt)}>{formatDate(e.createdAt)}</span>, hideBelow: 'sm' },
  ];

  return (
    <>
      <PageHeader
        icon={<IconTile icon={ReceiptText} color={brand.orange.main} size={52} />}
        title="Expense Transactions"
        subtitle={q.data ? `${formatNumber(q.data.meta.total)} transactions${active.length ? ' match your filters' : ' received from Kissflow'}` : 'Expenses received from Kissflow applications'}
      />
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(e) => e.id}
        loading={q.isFetching}
        error={q.error ? toApiError(q.error).message : null}
        onRetry={() => void q.refetch()}
        meta={q.data?.meta}
        onPageChange={list.setPage}
        sort={{ key: list.params.sort, order: list.params.order ?? 'desc' }}
        onSortChange={list.setSort}
        onRowClick={(e) => navigate(`/expenses/${e.id}`)}
        emptyTitle={active.length || list.params.search ? 'No matching transactions' : 'No expenses received yet'}
        emptyText={active.length || list.params.search ? 'Adjust or clear the filters.' : 'Configure an application webhook and field mapping to start receiving expenses.'}
        toolbar={
          <>
            <SearchToolbar value={list.params.search ?? ''} onChange={list.setSearch} placeholder="Search request no., source ID, employee, vendor or category">
              <Badge badgeContent={active.length} color="primary">
                <Button variant={showFilters ? 'contained' : 'outlined'} startIcon={<Filter size={16} />} onClick={() => setShowFilters((v) => !v)}>
                  Filters
                </Button>
              </Badge>
              {active.length > 0 && (
                <Button color="inherit" startIcon={<X size={16} />} onClick={() => list.set(Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])))}>
                  Clear
                </Button>
              )}
            </SearchToolbar>
            <Collapse in={showFilters}>
              <Card variant="outlined" sx={{ mx: 2.5, mb: 2.5, p: 2, boxShadow: 'none' }}>
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' } }}>
                  <TextField select size="small" label="Company" value={list.params.companyId ?? ''} onChange={(e) => setFilter('companyId', e.target.value)}>
                    <MenuItem value="">All companies</MenuItem>
                    {companies.data?.items.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField select size="small" label="Application" value={list.params.applicationId ?? ''} onChange={(e) => setFilter('applicationId', e.target.value)}>
                    <MenuItem value="">All applications</MenuItem>
                    {apps.data?.items.map((a) => (
                      <MenuItem key={a.id} value={a.id}>
                        {a.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField size="small" type="date" label="Expense date from" value={list.params.dateFrom ?? ''} onChange={(e) => setFilter('dateFrom', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                  <TextField size="small" type="date" label="Expense date to" value={list.params.dateTo ?? ''} onChange={(e) => setFilter('dateTo', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                  <TextField select size="small" label="Category" value={list.params.category ?? ''} onChange={(e) => setFilter('category', e.target.value)}>
                    <MenuItem value="">All categories</MenuItem>
                    {categories.data?.map((c) => (
                      <MenuItem key={c} value={c}>
                        {c}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField size="small" label="Min amount" value={list.params.amountMin ?? ''} onChange={(e) => setFilter('amountMin', e.target.value.replace(/[^\d.]/g, ''))} />
                  <TextField size="small" label="Max amount" value={list.params.amountMax ?? ''} onChange={(e) => setFilter('amountMax', e.target.value.replace(/[^\d.]/g, ''))} />
                  <TextField select size="small" label="Approval status" value={list.params.approvalStatus ?? ''} onChange={(e) => setFilter('approvalStatus', e.target.value)}>
                    <MenuItem value="">Any</MenuItem>
                    {['APPROVED', 'PENDING', 'REJECTED'].map((s) => (
                      <MenuItem key={s} value={s}>
                        {humanize(s)}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField select size="small" label="Processing status" value={list.params.status ?? ''} onChange={(e) => setFilter('status', e.target.value)}>
                    <MenuItem value="">Any</MenuItem>
                    {(Object.keys(JOB_STATUS_META) as JobStatus[]).map((s) => (
                      <MenuItem key={s} value={s}>
                        {JOB_STATUS_META[s].label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField select size="small" label="Voucher type" value={list.params.voucherKind ?? ''} onChange={(e) => setFilter('voucherKind', e.target.value)}>
                    <MenuItem value="">Any</MenuItem>
                    {(Object.keys(VOUCHER_KIND_LABELS) as VoucherKind[]).map((k) => (
                      <MenuItem key={k} value={k}>
                        {VOUCHER_KIND_LABELS[k]}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>
                <Stack direction="row" sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Amounts filter on the expense total; dates filter on the expense date.
                  </Typography>
                </Stack>
              </Card>
            </Collapse>
          </>
        }
      />
    </>
  );
}
