import { Box, Button, Card, Checkbox, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bot, CheckCheck, Cog, ListOrdered, Pause, Skull } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { JobRow } from '@/api/adminTypes';
import { applicationsApi, companiesApi, recordsApi, tallyApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import { queueApi } from '@/api/queueEndpoints';
import type { JobStatus } from '@/api/types';
import { ConfirmDialog } from '@/components/common/Dialogs';
import { IconTile } from '@/components/common/IconTile';
import { PageHeader } from '@/components/common/PageHeader';
import { JobStatusChip, StatusDot } from '@/components/common/StatusChip';
import { DataTable, type Column } from '@/components/data/DataTable';
import { SearchToolbar } from '@/components/data/SearchToolbar';
import { JOB_STATUS_META } from '@/config/status';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useListState } from '@/hooks/useListState';
import { useAuthStore } from '@/stores/auth';
import { brand } from '@/theme/theme';
import { formatDateTime, formatMoney, formatNumber, timeAgo } from '@/utils/format';
import { JobActionsMenu } from './JobActions';

const ORDER: JobStatus[] = ['RECEIVED', 'MAPPING_REQUIRED', 'MASTER_CREATION_REQUIRED', 'VALIDATION_FAILED', 'AWAITING_APPROVAL', 'READY_TO_POST', 'PROCESSING', 'RETRY_PENDING', 'FAILED', 'RECONCILIATION_REQUIRED', 'POSTED', 'CANCELLED'];

function WorkerBar() {
  const theme = useTheme();
  const worker = useQuery({ queryKey: ['queue', 'worker'], queryFn: queueApi.worker, refetchInterval: 15_000 });
  const canTally = useAuthStore((s) => s.hasPermission('tally.view'));
  const agents = useQuery({ queryKey: ['tally', 'agents'], queryFn: tallyApi.agents, refetchInterval: 30_000, enabled: canTally });
  const w = worker.data;
  const color = w?.status === 'RUNNING' ? theme.palette.success.main : w?.status === 'STALLED' ? theme.palette.error.main : theme.palette.text.disabled;
  const online = agents.data?.filter((a) => a.status === 'ONLINE').length ?? 0;
  return (
    <Card sx={{ p: 2, mb: 3, display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', background: `linear-gradient(135deg, ${alpha(color, 0.1)}, transparent)` }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <StatusDot color={color} pulse={w?.status === 'RUNNING'} />
        <Cog size={18} />
        <Typography variant="subtitle2">Queue worker: {w ? w.status.toLowerCase().replace('_', ' ') : '…'}</Typography>
      </Stack>
      {w?.stats && (
        <Typography variant="body2" color="text.secondary">
          Last run {timeAgo(w.stats.lastTickAt)} · {w.stats.duePostings} due for posting · auto-validation {w.settings.autoValidate ? 'on' : 'off'} · {w.settings.serializePerCompany ? 'one posting per company at a time' : 'parallel per company'} · max {w.settings.maxAttempts} attempts
        </Typography>
      )}
      {canTally && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', ml: 'auto' }}>
          <Bot size={18} />
          <Typography variant="body2" color={online ? 'success.main' : 'text.secondary'} sx={{ fontWeight: 600 }}>
            {agents.data?.length ? `${online}/${agents.data.filter((a) => a.status !== 'REVOKED').length} Bridge Agents online` : 'No Bridge Agent registered: approved jobs wait until one connects'}
          </Typography>
        </Stack>
      )}
    </Card>
  );
}

export function QueuePage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const canApprove = useAuthStore((s) => s.hasPermission('jobs.approve'));
  const list = useListState({ sort: 'createdAt', statusGroup: 'open' });
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const summary = useQuery({ queryKey: ['queue', 'summary'], queryFn: queueApi.summary, refetchInterval: 15_000 });
  const q = useQuery({ queryKey: ['jobs', 'queue', list.params], queryFn: () => recordsApi.jobs(list.params), placeholderData: (p) => p, refetchInterval: 15_000 });
  const companies = useQuery({ queryKey: ['companies', 'all'], queryFn: () => companiesApi.list({ pageSize: 100, sort: 'name', order: 'asc' }) });
  const apps = useQuery({ queryKey: ['applications', 'all'], queryFn: () => applicationsApi.list({ pageSize: 100, sort: 'name', order: 'asc' }) });
  const bulk = useApiMutation(() => queueApi.bulkApprove(selected), {
    success: (r) => `${r.approved} approved${r.failed ? `, ${r.failed} skipped` : ''}`,
    invalidate: [['jobs'], ['queue'], ['expenses'], ['dashboard']],
    onSuccess: () => {
      setSelected([]);
      setConfirmBulk(false);
    },
  });

  const approvable = useMemo(() => (q.data?.items ?? []).filter((j) => j.status === 'AWAITING_APPROVAL' && !j.isPaused), [q.data]);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const activeStatus = list.params.status as JobStatus | undefined;

  const columns: Column<JobRow>[] = [
    ...(canApprove
      ? [
          {
            key: 'select',
            header: <Checkbox size="small" checked={approvable.length > 0 && approvable.every((j) => selected.includes(j.id))} indeterminate={selected.length > 0 && !approvable.every((j) => selected.includes(j.id))} onChange={(e) => setSelected(e.target.checked ? approvable.map((j) => j.id) : [])} disabled={!approvable.length} />,
            width: 40,
            render: (j: JobRow) => <Checkbox size="small" checked={selected.includes(j.id)} disabled={j.status !== 'AWAITING_APPROVAL' || j.isPaused} onClick={(e) => e.stopPropagation()} onChange={() => toggle(j.id)} />,
          },
        ]
      : []),
    {
      key: 'job',
      header: 'Job / expense',
      render: (j) => (
        <>
          <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>
            {j.id.slice(0, 8)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {j.expense.requestNumber ?? j.expense.id.slice(0, 8)}
          </Typography>
        </>
      ),
    },
    { key: 'app', header: 'Application', render: (j) => j.application, hideBelow: 'lg' },
    { key: 'company', header: 'Company', render: (j) => j.company, hideBelow: 'md' },
    { key: 'vt', header: 'Voucher type', render: (j) => j.voucherType ?? '-', hideBelow: 'lg' },
    { key: 'amt', header: 'Amount', align: 'right', render: (j) => <b>{formatMoney(j.expense.amount, j.expense.currency)}</b> },
    {
      key: 'status',
      header: 'Status',
      render: (j) => (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
          <JobStatusChip status={j.status} />
          {j.isPaused && <Chip size="small" icon={<Pause size={12} />} label="Paused" color="warning" variant="outlined" />}
        </Stack>
      ),
    },
    { key: 'prio', header: 'Priority', align: 'right', sortKey: 'priority', render: (j) => j.priority, hideBelow: 'lg' },
    { key: 'att', header: 'Attempts', align: 'right', sortKey: 'attempts', render: (j) => `${j.attempts}/${j.maxAttempts}`, hideBelow: 'sm' },
    { key: 'created', header: 'Created', sortKey: 'createdAt', render: (j) => <span title={formatDateTime(j.createdAt)}>{timeAgo(j.createdAt)}</span>, hideBelow: 'md' },
    { key: 'last', header: 'Last attempt', render: (j) => (j.lastAttemptAt ? timeAgo(j.lastAttemptAt) : '-'), hideBelow: 'lg' },
    { key: 'next', header: 'Next retry', render: (j) => (j.nextRetryAt && j.status === 'RETRY_PENDING' ? <span title={formatDateTime(j.nextRetryAt)}>{timeAgo(j.nextRetryAt)}</span> : '-'), hideBelow: 'lg' },
    { key: 'err', header: 'Last error', render: (j) => (j.errorCode ? <Typography variant="caption" title={j.errorMessage ?? ''} sx={{ fontWeight: 600 }}>{j.errorCode}</Typography> : '-'), hideBelow: 'lg' },
    { key: 'actions', header: '', align: 'right', render: (j) => <JobActionsMenu job={j} /> },
  ];

  return (
    <>
      <PageHeader
        icon={<IconTile icon={ListOrdered} color={brand.sky.main} size={52} />}
        title="Processing Queue"
        subtitle={summary.data ? `${formatNumber(summary.data.total)} jobs · ${formatNumber(summary.data.byStatus.AWAITING_APPROVAL ?? 0)} awaiting approval · ${formatNumber(summary.data.deadLetter)} dead-lettered` : 'Persistent MySQL-backed posting queue'}
        actions={
          canApprove &&
          selected.length > 0 && (
            <Button variant="contained" color="success" startIcon={<CheckCheck size={18} />} onClick={() => setConfirmBulk(true)}>
              Approve {selected.length} selected
            </Button>
          )
        }
      />
      <WorkerBar />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Chip label={`Open (${formatNumber(ORDER.filter((s) => s !== 'POSTED' && s !== 'CANCELLED').reduce((a, s) => a + (summary.data?.byStatus[s] ?? 0), 0))})`} color={list.params.statusGroup === 'open' && !activeStatus ? 'primary' : 'default'} onClick={() => list.set({ statusGroup: 'open', status: undefined, deadLetter: undefined, paused: undefined })} />
        <Chip label="Needs attention" color={list.params.statusGroup === 'attention' ? 'error' : 'default'} onClick={() => list.set({ statusGroup: 'attention', status: undefined })} />
        {ORDER.map((s, i) => {
          const n = summary.data?.byStatus[s] ?? 0;
          const meta = JOB_STATUS_META[s];
          const active = activeStatus === s;
          return (
            <Chip
              key={s}
              component={motion.div}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              label={`${meta.label} ${formatNumber(n)}`}
              onClick={() => list.set({ status: active ? undefined : s, statusGroup: active ? 'open' : 'all' })}
              sx={{ fontWeight: 700, bgcolor: active ? meta.color : alpha(meta.color, 0.12), color: active ? '#fff' : meta.color, opacity: n ? 1 : 0.5 }}
            />
          );
        })}
        <Chip icon={<Skull size={14} />} label={`Dead letter ${formatNumber(summary.data?.deadLetter ?? 0)}`} variant={list.params.deadLetter ? 'filled' : 'outlined'} color="error" onClick={() => list.set({ deadLetter: list.params.deadLetter ? undefined : 'true', statusGroup: 'all', status: undefined })} />
        <Chip icon={<Pause size={14} />} label={`Paused ${formatNumber(summary.data?.paused ?? 0)}`} variant={list.params.paused ? 'filled' : 'outlined'} color="warning" onClick={() => list.set({ paused: list.params.paused ? undefined : 'true', statusGroup: 'all', status: undefined })} />
      </Box>
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(j) => j.id}
        loading={q.isFetching}
        error={q.error ? toApiError(q.error).message : null}
        onRetry={() => void q.refetch()}
        meta={q.data?.meta}
        onPageChange={list.setPage}
        sort={{ key: list.params.sort, order: list.params.order ?? 'desc' }}
        onSortChange={list.setSort}
        onRowClick={(j) => navigate(`/queue/${j.id}`)}
        emptyTitle="Queue is clear"
        emptyText="No jobs match these filters."
        toolbar={
          <SearchToolbar value={list.params.search ?? ''} onChange={list.setSearch} placeholder="Search request no. or error code">
            <TextField select size="small" label="Company" value={(list.params.companyId as string) ?? ''} onChange={(e) => list.set({ companyId: e.target.value || undefined })} sx={{ minWidth: 200 }}>
              <MenuItem value="">All companies</MenuItem>
              {companies.data?.items.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Application" value={(list.params.applicationId as string) ?? ''} onChange={(e) => list.set({ applicationId: e.target.value || undefined })} sx={{ minWidth: 200 }}>
              <MenuItem value="">All applications</MenuItem>
              {apps.data?.items.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name}
                </MenuItem>
              ))}
            </TextField>
          </SearchToolbar>
        }
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, color: theme.palette.text.secondary }}>
        Approved jobs are posted by the Bridge Agent one company at a time. Anything that may have reached Tally without verification waits in Reconciliation and is never retried automatically.
      </Typography>
      <ConfirmDialog
        open={confirmBulk}
        title={`Approve ${selected.length} job(s)?`}
        message="Each approval is tied to the exact voucher shown in its preview. Jobs you imported yourself are skipped (separation of duties)."
        confirmLabel="Approve"
        loading={bulk.isPending}
        onConfirm={() => bulk.mutate(undefined)}
        onClose={() => setConfirmBulk(false)}
      />
    </>
  );
}
