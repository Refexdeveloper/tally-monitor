import { Alert, Box, Card, Chip, Skeleton, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ListOrdered, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useParams } from 'react-router';
import { toApiError } from '@/api/client';
import { queueApi } from '@/api/queueEndpoints';
import { IconTile } from '@/components/common/IconTile';
import { JsonViewer } from '@/components/common/JsonViewer';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState } from '@/components/common/States';
import { JobStatusChip } from '@/components/common/StatusChip';
import { brand } from '@/theme/theme';
import { formatDate, formatDateTime, formatMoney, humanize, timeAgo } from '@/utils/format';
import { Field } from '../companies/CompanyDetailPage';
import { ExpenseTimeline } from '../expenses/ExpenseTimeline';
import { VoucherTable } from '../vouchers/VoucherTable';
import { JobActionButtons } from './JobActions';

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card component={motion.div} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} sx={{ p: 3 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">{title}</Typography>
        {action}
      </Stack>
      {children}
    </Card>
  );
}

export function JobDetailPage() {
  const { id = '' } = useParams();
  const [payloadTab, setPayloadTab] = useState<'draft' | 'normalized' | 'original'>('draft');
  const q = useQuery({ queryKey: ['jobs', 'detail', id], queryFn: () => queueApi.get(id), refetchInterval: 10_000 });
  if (q.error) return <ErrorState message={toApiError(q.error).message} onRetry={() => void q.refetch()} />;
  const j = q.data;
  if (!j) return <Skeleton variant="rounded" height={360} sx={{ borderRadius: 5 }} />;
  const d = j.voucherDraft;

  return (
    <>
      <PageHeader
        icon={<IconTile icon={ListOrdered} color={brand.sky.main} size={52} />}
        crumbs={[{ label: 'Processing Queue', to: '/queue' }, { label: `Job ${j.id.slice(0, 8)}` }]}
        title={
          <>
            {formatMoney(j.expense.amount, j.expense.currency)}{' '}
            <Typography component="span" variant="h5" color="text.secondary">
              · {j.expense.requestNumber ?? j.expense.sourceTransactionId}
            </Typography>
          </>
        }
        subtitle={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
            <JobStatusChip status={j.status} />
            {j.isPaused && <Chip size="small" color="warning" label={`Paused by ${j.pausedBy ?? 'someone'}`} />}
            {j.isDeadLetter && <Chip size="small" color="error" label="Dead letter" />}
            <span>
              {j.company.name} · {j.application.name} · attempts {j.attempts}/{j.maxAttempts}
            </span>
          </Stack>
        }
        actions={<JobActionButtons job={j} />}
      />

      <Card sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
        <ExpenseTimeline status={j.status} />
      </Card>

      {j.status === 'RECONCILIATION_REQUIRED' && (
        <Alert severity="warning" icon={<ShieldAlert />} sx={{ mb: 3, borderRadius: 3 }}>
          This posting may already exist in <b>{j.company.tallyCompanyName}</b>. Search Tally for reference <code>{d?.reference}</code> and record the result with <b>Reconcile with Tally</b>. It is never retried automatically.
          {j.errorMessage && <Box sx={{ mt: 0.5 }}>{j.errorMessage}</Box>}
        </Alert>
      )}
      {j.errorCode && j.status !== 'RECONCILIATION_REQUIRED' && (
        <Alert severity={j.status === 'FAILED' ? 'error' : 'warning'} sx={{ mb: 3, borderRadius: 3 }}>
          <b>{j.errorCode}</b>: {j.errorMessage}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: '1.6fr 1fr' }, alignItems: 'start' }}>
        <Stack spacing={3}>
          <Section title="Voucher to post" action={d && <Chip size="small" variant="outlined" label={`${d.voucherType ?? '-'} · ${formatDate(d.voucherDate)}`} />}>
            {d ? (
              <Stack spacing={1.5}>
                <VoucherTable entries={d.entries} currency={j.expense.currency} totalDebit={d.totalDebit} totalCredit={d.totalCredit} balanced={d.balanced} />
                <Typography variant="body2">
                  <b>Reference:</b> <code>{d.reference}</code> · <b>Narration:</b> {d.narration}
                </Typography>
                {d.issues.length > 0 && d.issues.map((i, k) => <Typography key={k} variant="body2" color={i.severity === 'error' ? 'error' : 'warning.main'}>• {i.message}</Typography>)}
              </Stack>
            ) : (
              <Typography color="text.secondary">Not validated yet.</Typography>
            )}
          </Section>

          <Section title="Execution history">
            {j.attemptsHistory.length === 0 ? (
              <Typography color="text.secondary">No attempts yet.</Typography>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Operation</TableCell>
                      <TableCell>By</TableCell>
                      <TableCell>Outcome</TableCell>
                      <TableCell>Result</TableCell>
                      <TableCell>Error</TableCell>
                      <TableCell>Started</TableCell>
                      <TableCell align="right">Duration</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {j.attemptsHistory.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.attemptNo}</TableCell>
                        <TableCell>{humanize(a.operation)}</TableCell>
                        <TableCell>{a.by}</TableCell>
                        <TableCell>
                          <Chip size="small" variant="outlined" color={a.outcome === 'SUCCESS' ? 'success' : a.outcome === 'IN_PROGRESS' ? 'info' : a.outcome === 'AMBIGUOUS' ? 'warning' : 'error'} label={humanize(a.outcome)} />
                        </TableCell>
                        <TableCell>{a.toStatus ? humanize(a.toStatus) : '-'}</TableCell>
                        <TableCell title={a.errorMessage ?? ''} sx={{ maxWidth: 220 }}>
                          <Typography variant="caption" noWrap component="div">
                            {a.errorCode ?? (a.operation === 'RECONCILE' ? a.errorMessage : '-')}
                          </Typography>
                        </TableCell>
                        <TableCell>{formatDateTime(a.startedAt)}</TableCell>
                        <TableCell align="right">{a.durationMs !== null ? `${a.durationMs} ms` : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Section>

          <Section title="Tally responses">
            {j.tallyResponses.length === 0 ? (
              <Typography color="text.secondary">No response from Tally yet.</Typography>
            ) : (
              <Stack spacing={2}>
                {j.tallyResponses.map((t) => (
                  <Box key={t.id}>
                    <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }} useFlexGap>
                      <Chip size="small" label={`Attempt ${t.attemptNo ?? '-'}`} />
                      <Chip size="small" variant="outlined" label={`HTTP ${t.httpStatus ?? '-'}`} />
                      <Chip size="small" variant="outlined" color={t.errors ? 'error' : 'success'} label={`created ${t.created} · altered ${t.altered} · errors ${t.errors}`} />
                      <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                        {formatDateTime(t.createdAt)}
                      </Typography>
                    </Stack>
                    {t.lineError && <Alert severity="error" sx={{ mb: 1, borderRadius: 2 }}>{t.lineError}</Alert>}
                    {t.responseBody && <JsonViewer value={t.responseBody} maxHeight={220} />}
                  </Box>
                ))}
              </Stack>
            )}
          </Section>

          <Section
            title="Payloads"
            action={
              <Tabs value={payloadTab} onChange={(_, v) => setPayloadTab(v)} sx={{ minHeight: 0, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}>
                <Tab value="draft" label="Voucher draft" />
                <Tab value="normalized" label="Normalized" />
                <Tab value="original" label="Original" />
              </Tabs>
            }
          >
            <JsonViewer value={payloadTab === 'draft' ? d : payloadTab === 'normalized' ? j.expense.normalizedPayload : j.expense.originalPayload} maxHeight={420} />
          </Section>
        </Stack>

        <Stack spacing={3}>
          <Section title="Job">
            <Stack spacing={1.5}>
              <Field label="Expense" value={<RouterLink to={`/expenses/${j.expense.id}`}>{j.expense.requestNumber ?? j.expense.sourceTransactionId}</RouterLink>} />
              <Field label="Company / Tally company" value={`${j.company.name} / ${j.company.tallyCompanyName}`} />
              <Field label="Voucher configuration" value={j.voucherConfiguration?.name ?? 'Not resolved'} />
              <Field label="Priority" value={j.priority} />
              <Field label="Next retry" value={j.nextRetryAt && j.status === 'RETRY_PENDING' ? `${formatDateTime(j.nextRetryAt)} (${timeAgo(j.nextRetryAt)})` : '-'} />
              <Field label="Idempotency key" value={<code>{j.idempotencyKey}</code>} />
              <Field label="Created" value={formatDateTime(j.createdAt)} />
            </Stack>
          </Section>

          <Section title="Approval">
            {j.approval ? (
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  {j.approval.hashMatches ? <ShieldCheck size={18} color={brand.emerald.main} /> : <ShieldAlert size={18} color={brand.coral.main} />}
                  <Typography variant="body2">
                    Approved by <b>{j.approval.by}</b> {timeAgo(j.approval.at)}
                  </Typography>
                </Stack>
                <Typography variant="caption" color={j.approval.hashMatches ? 'text.secondary' : 'error'}>
                  {j.approval.hashMatches ? 'Bound to the exact voucher above.' : 'The voucher changed after approval; it will be sent back for approval.'}
                </Typography>
                {j.approval.notes && <Typography variant="body2">“{j.approval.notes}”</Typography>}
              </Stack>
            ) : j.rejection ? (
              <Typography variant="body2" color="error">
                Rejected by {j.rejection.by} {timeAgo(j.rejection.at)}: {j.rejection.reason}
              </Typography>
            ) : j.status === 'READY_TO_POST' ? (
              <Typography variant="body2" color="text.secondary">Below the approval threshold of its voucher configuration.</Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">Not approved yet.</Typography>
            )}
            {j.cancellation && (
              <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                Cancelled by {j.cancellation.by} {timeAgo(j.cancellation.at)}: {j.cancellation.reason}
              </Typography>
            )}
          </Section>

          {j.lock && (
            <Section title="Processing lock">
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Lock size={16} />
                  <Typography variant="body2">
                    Held by <b>{j.lock.agent}</b> since {timeAgo(j.lock.lockedAt)}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Lease expires {timeAgo(j.lock.expiresAt)} · heartbeat {timeAgo(j.lock.heartbeatAt)} · {j.lock.submissionStartedAt ? `submitted to Tally ${timeAgo(j.lock.submissionStartedAt)}` : 'not yet submitted to Tally'}
                </Typography>
              </Stack>
            </Section>
          )}

          <Section title="Activity">
            <Stack spacing={1.25}>
              {j.timeline.map((t) => (
                <Box key={t.id}>
                  <Typography variant="subtitle2">
                    {humanize(t.action)}
                    {t.newStatus && t.newStatus !== t.previousStatus ? ` → ${humanize(t.newStatus)}` : ''}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t.by} · {formatDateTime(t.createdAt)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Section>
        </Stack>
      </Box>
    </>
  );
}
