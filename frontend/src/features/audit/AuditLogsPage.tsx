import { Alert, Box, Chip, Dialog, DialogContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Bot, Cog, Globe, ScrollText, ShieldCheck, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { AuditRow } from '@/api/adminTypes';
import { applicationsApi, companiesApi, recordsApi } from '@/api/adminEndpoints';
import { get, toApiError } from '@/api/client';
import { DialogHeader } from '@/components/common/Dialogs';
import { IconTile } from '@/components/common/IconTile';
import { JsonViewer } from '@/components/common/JsonViewer';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/data/DataTable';
import { SearchToolbar } from '@/components/data/SearchToolbar';
import { useListState } from '@/hooks/useListState';
import { brand } from '@/theme/theme';
import { formatDateTime, formatNumber, humanize, timeAgo } from '@/utils/format';
import { Field } from '../companies/CompanyDetailPage';

const ACTOR_ICON = { USER: User, SYSTEM: Cog, AGENT: Bot, WEBHOOK: Globe } as const;

function AuditDetail({ row, onClose }: { row: AuditRow; onClose: () => void }) {
  const navigate = useNavigate();
  const link = row.entityType === 'job' && row.entityId ? `/queue/${row.entityId}` : row.entityType === 'expense' && row.entityId ? `/expenses/${row.entityId}` : row.entityType === 'application' && row.entityId ? `/applications/${row.entityId}` : row.entityType === 'company' && row.entityId ? `/companies/${row.entityId}` : null;
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogHeader title={humanize(row.action)} subtitle={formatDateTime(row.createdAt)} onClose={onClose} />
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, mb: 2 }}>
          <Field label="Actor" value={`${row.user ?? humanize(row.actorType)} (${humanize(row.actorType)})`} />
          <Field label="Company" value={row.company} />
          <Field label="Application" value={row.application} />
          <Field label="Status change" value={row.previousStatus || row.newStatus ? `${row.previousStatus ? humanize(row.previousStatus) : '-'} → ${row.newStatus ? humanize(row.newStatus) : '-'}` : '-'} />
          <Field label="Reference" value={row.reference} />
          <Field label="IP address" value={row.ipAddress} />
          <Field label="Entity" value={row.entityType ? `${humanize(row.entityType)} ${row.entityId?.slice(0, 8) ?? ''}` : '-'} />
        </Box>
        {link && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            <a href={link} onClick={(e) => { e.preventDefault(); onClose(); navigate(link); }}>
              Open {humanize(row.entityType!)}
            </a>
          </Typography>
        )}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Metadata
        </Typography>
        <JsonViewer value={row.metadata ?? {}} maxHeight={320} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Secrets and banking details are redacted before they are written to the audit trail.
        </Typography>
      </DialogContent>
    </Dialog>
  );
}

export function AuditLogsPage() {
  const list = useListState({ pageSize: 50 });
  const [open, setOpen] = useState<AuditRow | null>(null);
  const q = useQuery({ queryKey: ['audit', 'module', list.params], queryFn: () => recordsApi.audit(list.params), placeholderData: (p) => p });
  const actions = useQuery({ queryKey: ['audit', 'actions'], queryFn: () => get<string[]>('/audit-logs/actions') });
  const companies = useQuery({ queryKey: ['companies', 'all'], queryFn: () => companiesApi.list({ pageSize: 100, sort: 'name', order: 'asc' }) });
  const apps = useQuery({ queryKey: ['applications', 'all'], queryFn: () => applicationsApi.list({ pageSize: 100, sort: 'name', order: 'asc' }) });
  const set = (key: string, value: string) => list.set({ [key]: value || undefined });

  const columns: Column<AuditRow>[] = [
    { key: 'when', header: 'When', render: (a) => <span title={formatDateTime(a.createdAt)}>{timeAgo(a.createdAt)}</span> },
    {
      key: 'action',
      header: 'Action',
      render: (a) => (
        <>
          <Typography variant="subtitle2">{humanize(a.action)}</Typography>
          {(a.previousStatus || a.newStatus) && a.previousStatus !== a.newStatus && (
            <Typography variant="caption" color="text.secondary">
              {a.previousStatus ? humanize(a.previousStatus) : '-'} → {a.newStatus ? humanize(a.newStatus) : '-'}
            </Typography>
          )}
        </>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (a) => {
        const Icon = ACTOR_ICON[a.actorType];
        return (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Icon size={15} />
            <span>{a.user ?? humanize(a.actorType)}</span>
          </Stack>
        );
      },
    },
    { key: 'company', header: 'Company', render: (a) => a.company ?? '-', hideBelow: 'md' },
    { key: 'app', header: 'Application', render: (a) => a.application ?? '-', hideBelow: 'lg' },
    { key: 'ref', header: 'Reference', render: (a) => a.reference ?? '-', hideBelow: 'lg' },
    { key: 'ip', header: 'IP', render: (a) => a.ipAddress ?? '-', hideBelow: 'lg' },
  ];

  return (
    <>
      <PageHeader icon={<IconTile icon={ScrollText} color={brand.purple.main} size={52} />} title="Audit Logs" subtitle={q.data ? `${formatNumber(q.data.meta.total)} records` : 'Immutable trail of every important action'} />
      <Alert severity="info" icon={<ShieldCheck size={20} />} sx={{ mb: 3, borderRadius: 4 }}>
        The audit trail is append-only: the database itself rejects any update or deletion of audit records.
      </Alert>
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(a) => a.id}
        loading={q.isFetching}
        error={q.error ? toApiError(q.error).message : null}
        onRetry={() => void q.refetch()}
        meta={q.data?.meta}
        onPageChange={list.setPage}
        onRowClick={setOpen}
        emptyTitle="No audit records match"
        toolbar={
          <>
            <SearchToolbar value={list.params.search ?? ''} onChange={list.setSearch} placeholder="Search action, reference or user">
              <TextField select size="small" label="Actor" value={(list.params.actorType as string) ?? ''} onChange={(e) => set('actorType', e.target.value)} sx={{ minWidth: 130 }}>
                <MenuItem value="">All actors</MenuItem>
                {['USER', 'SYSTEM', 'AGENT', 'WEBHOOK'].map((a) => (
                  <MenuItem key={a} value={a}>
                    {humanize(a)}
                  </MenuItem>
                ))}
              </TextField>
            </SearchToolbar>
            <Box sx={{ px: 2.5, pb: 2.5, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' } }}>
              <TextField select size="small" label="Action" value={(list.params.action as string) ?? ''} onChange={(e) => set('action', e.target.value)}>
                <MenuItem value="">All actions</MenuItem>
                {actions.data?.map((a) => (
                  <MenuItem key={a} value={a}>
                    {humanize(a)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Company" value={(list.params.companyId as string) ?? ''} onChange={(e) => set('companyId', e.target.value)}>
                <MenuItem value="">All companies</MenuItem>
                {companies.data?.items.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Application" value={(list.params.applicationId as string) ?? ''} onChange={(e) => set('applicationId', e.target.value)}>
                <MenuItem value="">All applications</MenuItem>
                {apps.data?.items.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField size="small" type="date" label="From" value={(list.params.dateFrom as string) ?? ''} onChange={(e) => set('dateFrom', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" type="date" label="To" value={(list.params.dateTo as string) ?? ''} onChange={(e) => set('dateTo', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </Box>
            {(list.params.action || list.params.companyId || list.params.applicationId || list.params.dateFrom || list.params.dateTo || list.params.actorType) && (
              <Stack direction="row" sx={{ px: 2.5, pb: 2 }}>
                <Chip label="Clear filters" onDelete={() => list.set({ action: undefined, companyId: undefined, applicationId: undefined, dateFrom: undefined, dateTo: undefined, actorType: undefined })} />
              </Stack>
            )}
          </>
        }
      />
      {open && <AuditDetail row={open} onClose={() => setOpen(null)} />}
    </>
  );
}
