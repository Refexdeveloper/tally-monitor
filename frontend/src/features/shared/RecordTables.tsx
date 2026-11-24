import { Chip, MenuItem, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { AuditRow, ExpenseRow, JobRow } from '@/api/adminTypes';
import { recordsApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import type { JobStatus } from '@/api/types';
import { JobStatusChip } from '@/components/common/StatusChip';
import { DataTable, type Column } from '@/components/data/DataTable';
import { SearchToolbar } from '@/components/data/SearchToolbar';
import { JOB_STATUS_META } from '@/config/status';
import { useListState } from '@/hooks/useListState';
import { formatDate, formatDateTime, formatMoney, humanize, timeAgo } from '@/utils/format';

interface Scope {
  companyId?: string;
  applicationId?: string;
}

function StatusFilter({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <TextField select size="small" label="Status" value={value ?? 'all'} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: 200 }}>
      <MenuItem value="all">All statuses</MenuItem>
      {(Object.keys(JOB_STATUS_META) as JobStatus[]).map((s) => (
        <MenuItem key={s} value={s}>
          {JOB_STATUS_META[s].label}
        </MenuItem>
      ))}
    </TextField>
  );
}

export function ExpensesTable({ scope, hideCompany, hideApplication }: { scope: Scope; hideCompany?: boolean; hideApplication?: boolean }) {
  const navigate = useNavigate();
  const list = useListState({ pageSize: 10, sort: 'receivedAt' });
  const q = useQuery({ queryKey: ['expenses', scope, list.params], queryFn: () => recordsApi.expenses({ ...list.params, ...scope }), placeholderData: (p) => p });
  const columns: Column<ExpenseRow>[] = [
    {
      key: 'request',
      header: 'Request',
      render: (e) => (
        <>
          <Typography variant="subtitle2">{e.requestNumber ?? e.sourceTransactionId}</Typography>
          <Typography variant="caption" color="text.secondary">
            {e.party ?? '-'} Â· {e.category ?? '-'}
          </Typography>
        </>
      ),
    },
    ...(hideCompany ? [] : [{ key: 'company', header: 'Company', render: (e: ExpenseRow) => e.company.name, hideBelow: 'md' as const }]),
    ...(hideApplication ? [] : [{ key: 'app', header: 'Application', render: (e: ExpenseRow) => e.application.name, hideBelow: 'md' as const }]),
    { key: 'date', header: 'Expense date', sortKey: 'expenseDate', render: (e) => formatDate(e.expenseDate), hideBelow: 'sm' },
    { key: 'amount', header: 'Amount', align: 'right', sortKey: 'amount', render: (e) => <b>{formatMoney(e.amount, e.currency)}</b> },
    { key: 'status', header: 'Status', render: (e) => <JobStatusChip status={e.status} /> },
    { key: 'voucher', header: 'Voucher', render: (e) => e.voucherNumber ?? '-', hideBelow: 'lg' },
    { key: 'received', header: 'Received', sortKey: 'receivedAt', render: (e) => <span title={formatDateTime(e.receivedAt)}>{timeAgo(e.receivedAt)}</span>, hideBelow: 'sm' },
  ];
  return (
    <DataTable
      plain
      columns={columns}
      rows={q.data?.items}
      rowKey={(r) => r.id}
      loading={q.isFetching}
      error={q.error ? toApiError(q.error).message : null}
      onRetry={() => void q.refetch()}
      meta={q.data?.meta}
      onPageChange={list.setPage}
      sort={{ key: list.params.sort, order: list.params.order ?? 'desc' }}
      onSortChange={list.setSort}
      onRowClick={(e) => navigate(`/expenses/${e.id}`)}
      emptyTitle="No expenses yet"
      emptyText="Expenses received from Kissflow will appear here."
      toolbar={
        <SearchToolbar value={list.params.search ?? ''} onChange={list.setSearch} placeholder="Search request, employee or category">
          <StatusFilter value={list.params.status as string | undefined} onChange={(status) => list.set({ status })} />
        </SearchToolbar>
      }
    />
  );
}

export function JobsTable({ scope, hideCompany, hideApplication }: { scope: Scope; hideCompany?: boolean; hideApplication?: boolean }) {
  const navigate = useNavigate();
  const list = useListState({ pageSize: 10, sort: 'createdAt' });
  const q = useQuery({ queryKey: ['jobs', scope, list.params], queryFn: () => recordsApi.jobs({ ...list.params, ...scope }), placeholderData: (p) => p });
  const columns: Column<JobRow>[] = [
    {
      key: 'job',
      header: 'Request',
      render: (j) => (
        <>
          <Typography variant="subtitle2">{j.expense.requestNumber ?? '-'}</Typography>
          <Typography variant="caption" color="text.secondary">
            {j.voucherType ?? 'Voucher type pending'}
          </Typography>
        </>
      ),
    },
    ...(hideCompany ? [] : [{ key: 'company', header: 'Company', render: (j: JobRow) => j.company, hideBelow: 'md' as const }]),
    ...(hideApplication ? [] : [{ key: 'app', header: 'Application', render: (j: JobRow) => j.application, hideBelow: 'md' as const }]),
    { key: 'amount', header: 'Amount', align: 'right', render: (j) => <b>{formatMoney(j.expense.amount, j.expense.currency)}</b> },
    {
      key: 'status',
      header: 'Status',
      render: (j) => (
        <>
          <JobStatusChip status={j.status} /> {j.isPaused && <Chip size="small" label="Paused" sx={{ ml: 0.5 }} />}
        </>
      ),
    },
    { key: 'attempts', header: 'Attempts', align: 'right', sortKey: 'attempts', render: (j) => `${j.attempts}/${j.maxAttempts}`, hideBelow: 'sm' },
    {
      key: 'error',
      header: 'Last error',
      hideBelow: 'lg',
      render: (j) =>
        j.errorCode ? (
          <Typography variant="caption" title={j.errorMessage ?? ''} sx={{ fontWeight: 600 }}>
            {j.errorCode}
          </Typography>
        ) : (
          '-'
        ),
    },
    { key: 'created', header: 'Created', sortKey: 'createdAt', render: (j) => timeAgo(j.createdAt), hideBelow: 'sm' },
  ];
  return (
    <DataTable
      plain
      columns={columns}
      rows={q.data?.items}
      rowKey={(r) => r.id}
      loading={q.isFetching}
      error={q.error ? toApiError(q.error).message : null}
      onRetry={() => void q.refetch()}
      meta={q.data?.meta}
      onPageChange={list.setPage}
      sort={{ key: list.params.sort, order: list.params.order ?? 'desc' }}
      onSortChange={list.setSort}
      onRowClick={(j) => navigate(`/queue/${j.id}`)}
      emptyTitle="No processing jobs"
      emptyText="Each received expense becomes a job in the processing queue."
      toolbar={
        <SearchToolbar value={list.params.search ?? ''} onChange={list.setSearch} placeholder="Search request or error code">
          <StatusFilter value={list.params.status as string | undefined} onChange={(status) => list.set({ status })} />
        </SearchToolbar>
      }
    />
  );
}

export function AuditTable({ scope }: { scope: Scope & { entityType?: string; entityId?: string } }) {
  const list = useListState({ pageSize: 10 });
  const q = useQuery({ queryKey: ['audit', scope, list.params], queryFn: () => recordsApi.audit({ ...list.params, ...scope }), placeholderData: (p) => p });
  const columns: Column<AuditRow>[] = [
    {
      key: 'action',
      header: 'Action',
      render: (a) => (
        <>
          <Typography variant="subtitle2">{humanize(a.action)}</Typography>
          {(a.previousStatus || a.newStatus) && (
            <Typography variant="caption" color="text.secondary">
              {a.previousStatus ? humanize(a.previousStatus) : '-'} â†’ {a.newStatus ? humanize(a.newStatus) : '-'}
            </Typography>
          )}
        </>
      ),
    },
    { key: 'actor', header: 'By', render: (a) => a.user ?? humanize(a.actorType) },
    { key: 'ref', header: 'Reference', render: (a) => a.reference ?? '-', hideBelow: 'md' },
    { key: 'ip', header: 'IP', render: (a) => a.ipAddress ?? '-', hideBelow: 'lg' },
    { key: 'when', header: 'When', render: (a) => <span title={formatDateTime(a.createdAt)}>{timeAgo(a.createdAt)}</span> },
  ];
  return (
    <DataTable
      plain
      columns={columns}
      rows={q.data?.items}
      rowKey={(r) => r.id}
      loading={q.isFetching}
      error={q.error ? toApiError(q.error).message : null}
      onRetry={() => void q.refetch()}
      meta={q.data?.meta}
      onPageChange={list.setPage}
      emptyTitle="No history yet"
      emptyText="Every configuration change and integration event is recorded here."
      toolbar={<SearchToolbar value={list.params.search ?? ''} onChange={list.setSearch} placeholder="Search action, reference or user" />}
    />
  );
}
