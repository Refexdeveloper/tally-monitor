import { Alert, Box, Button, Chip, Dialog, DialogContent, MenuItem, Skeleton, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Application, ReceiptRow } from '@/api/adminTypes';
import { intakeApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import { DialogHeader } from '@/components/common/Dialogs';
import { JsonViewer } from '@/components/common/JsonViewer';
import { ErrorState } from '@/components/common/States';
import { DataTable } from '@/components/data/DataTable';
import { SearchToolbar } from '@/components/data/SearchToolbar';
import { useListState } from '@/hooks/useListState';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime, humanize, timeAgo } from '@/utils/format';
import { AuditTable } from '../shared/RecordTables';

const STATUS_COLOR = { ACCEPTED: 'success', DUPLICATE: 'info', REJECTED: 'error', FAILED: 'warning' } as const;

export function ReceiptStatus({ status }: { status: ReceiptRow['status'] }) {
  return <Chip size="small" color={STATUS_COLOR[status]} label={humanize(status)} variant={status === 'ACCEPTED' ? 'filled' : 'outlined'} />;
}

function ReceiptDialog({ app, receiptId, onClose }: { app: Application; receiptId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'payload' | 'normalized' | 'headers' | 'error'>('payload');
  const q = useQuery({ queryKey: ['receipts', app.id, receiptId], queryFn: () => intakeApi.receipt(app.id, receiptId) });
  const r = q.data;
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogHeader title="Intake request" subtitle={r ? `${r.source.toLowerCase()} · ${formatDateTime(r.createdAt)} · HTTP ${r.httpStatus}` : undefined} onClose={onClose} />
      <DialogContent>
        {q.error ? (
          <ErrorState message={toApiError(q.error).message} compact />
        ) : !r ? (
          <Skeleton variant="rounded" height={300} />
        ) : (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
              <ReceiptStatus status={r.status} />
              <Chip size="small" label={`Auth: ${humanize(r.authResult)}`} variant="outlined" />
              {r.sourceTransactionId && <Chip size="small" label={`Source ID ${r.sourceTransactionId}`} variant="outlined" />}
              {r.durationMs !== null && <Chip size="small" label={`${r.durationMs} ms`} variant="outlined" />}
              {r.expenseId && (
                <Button size="small" onClick={() => navigate(`/expenses/${r.expenseId}`)}>
                  Open expense
                </Button>
              )}
            </Stack>
            {r.errorMessage && (
              <Alert severity={r.status === 'DUPLICATE' ? 'info' : 'error'} sx={{ borderRadius: 3 }}>
                <b>{r.errorCode}</b>: {r.errorMessage}
              </Alert>
            )}
            <Tabs value={tab} onChange={(_, v) => setTab(v)}>
              <Tab value="payload" label="Payload" />
              <Tab value="normalized" label="Normalized" disabled={!r.normalized} />
              <Tab value="headers" label="Headers" />
              <Tab value="error" label="Details" disabled={!r.errorDetails} />
            </Tabs>
            {tab === 'payload' &&
              (r.payload ? (
                <JsonViewer value={r.payload} />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Payload not stored (unauthenticated requests are never stored).
                </Typography>
              ))}
            {tab === 'normalized' && <JsonViewer value={r.normalized} />}
            {tab === 'headers' && <JsonViewer value={{ ...r.requestHeaders, 'x-forwarded-for / ip': r.ipAddress }} maxHeight={240} />}
            {tab === 'error' && <JsonViewer value={r.errorDetails} />}
            <Typography variant="caption" color="text.secondary">
              Payload hash {r.payloadHash ?? '-'} · Banking and contact fields are masked before storage.
            </Typography>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RequestsTable({ app }: { app: Application }) {
  const list = useListState({ pageSize: 25, status: 'all', source: 'all' });
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['receipts', app.id, list.params], queryFn: () => intakeApi.receipts(app.id, list.params), placeholderData: (p) => p, refetchInterval: 20_000 });
  return (
    <>
      <DataTable
        plain
        rows={q.data?.items}
        rowKey={(r) => r.id}
        loading={q.isFetching}
        error={q.error ? toApiError(q.error).message : null}
        onRetry={() => void q.refetch()}
        meta={q.data?.meta}
        onPageChange={list.setPage}
        onRowClick={(r) => setOpen(r.id)}
        emptyTitle="No requests yet"
        emptyText="Webhook deliveries, API syncs and manual imports for this application appear here."
        toolbar={
          <SearchToolbar value={list.params.search ?? ''} onChange={list.setSearch} placeholder="Search source ID or error code">
            <TextField select size="small" label="Outcome" value={list.params.status} onChange={(e) => list.set({ status: e.target.value })} sx={{ minWidth: 150 }}>
              {['all', 'ACCEPTED', 'DUPLICATE', 'REJECTED', 'FAILED'].map((s) => (
                <MenuItem key={s} value={s}>
                  {s === 'all' ? 'All outcomes' : humanize(s)}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Source" value={list.params.source} onChange={(e) => list.set({ source: e.target.value })} sx={{ minWidth: 140 }}>
              {['all', 'WEBHOOK', 'API', 'MANUAL'].map((s) => (
                <MenuItem key={s} value={s}>
                  {s === 'all' ? 'All sources' : humanize(s)}
                </MenuItem>
              ))}
            </TextField>
          </SearchToolbar>
        }
        columns={[
          { key: 'when', header: 'Received', render: (r) => <span title={formatDateTime(r.createdAt)}>{timeAgo(r.createdAt)}</span> },
          { key: 'source', header: 'Source', render: (r) => humanize(r.source) },
          { key: 'status', header: 'Outcome', render: (r) => <ReceiptStatus status={r.status} /> },
          { key: 'http', header: 'HTTP', align: 'right', render: (r) => r.httpStatus, hideBelow: 'sm' },
          { key: 'id', header: 'Source ID', render: (r) => <code>{r.sourceTransactionId ?? '-'}</code>, hideBelow: 'md' },
          {
            key: 'reason',
            header: 'Reason',
            render: (r) =>
              r.errorCode ? (
                <Typography variant="caption" title={r.errorMessage ?? ''} sx={{ fontWeight: 600 }}>
                  {r.errorCode}
                </Typography>
              ) : (
                '-'
              ),
          },
          { key: 'auth', header: 'Auth', render: (r) => humanize(r.authResult), hideBelow: 'lg' },
        ]}
      />
      {open && <ReceiptDialog app={app} receiptId={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function ApiLogsPanel({ app }: { app: Application }) {
  const canAudit = useAuthStore((s) => s.hasPermission('audit.view'));
  const [tab, setTab] = useState<'requests' | 'history'>('requests');
  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 3, pt: 1 }}>
        <Tab value="requests" label="Intake requests" />
        {canAudit && <Tab value="history" label="Integration history" />}
      </Tabs>
      {tab === 'requests' ? <RequestsTable app={app} /> : <AuditTable scope={{ applicationId: app.id }} />}
    </Box>
  );
}
