import { Alert, Box, Card, Chip, Skeleton, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { FileText, Paperclip, ReceiptText } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useParams } from 'react-router';
import type { ExpenseDetail } from '@/api/adminTypes';
import { recordsApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import { IconTile } from '@/components/common/IconTile';
import { JsonViewer } from '@/components/common/JsonViewer';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState } from '@/components/common/States';
import { JobStatusChip } from '@/components/common/StatusChip';
import { brand } from '@/theme/theme';
import { formatDate, formatDateTime, formatMoney, humanize, timeAgo } from '@/utils/format';
import { Field } from '../companies/CompanyDetailPage';
import { ReceiptStatus } from '../applications/ApiLogsPanel';
import { VOUCHER_KIND_LABELS } from '../applications/appMeta';
import { ExpenseTimeline } from './ExpenseTimeline';
import { VoucherPreviewSection } from './VoucherPreviewSection';

function Section({ title, action, children, delay = 0 }: { title: string; action?: ReactNode; children: ReactNode; delay?: number }) {
  return (
    <Card component={motion.div} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} sx={{ p: 3 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">{title}</Typography>
        {action}
      </Stack>
      {children}
    </Card>
  );
}

const LEDGER_STATUS = {
  RESOLVED: { label: 'Resolved', color: 'success' as const },
  MAPPED: { label: 'Mapped', color: 'success' as const },
  MASTER_MISSING: { label: 'Ledger missing in Tally', color: 'warning' as const },
  UNMAPPED: { label: 'Not mapped', color: 'error' as const },
};

function LineItems({ e }: { e: ExpenseDetail }) {
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Category</TableCell>
            <TableCell>Description</TableCell>
            <TableCell>Cost centre</TableCell>
            <TableCell>Tally ledger</TableCell>
            <TableCell align="right">Tax</TableCell>
            <TableCell align="right">Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {e.items.map((i) => (
            <TableRow key={i.lineNo}>
              <TableCell>{i.lineNo}</TableCell>
              <TableCell>{i.category ?? '-'}</TableCell>
              <TableCell>{i.description ?? '-'}</TableCell>
              <TableCell>{i.costCentre ?? '-'}</TableCell>
              <TableCell>
                <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                  <span>{i.ledger ?? '-'}</span>
                  <Chip size="small" variant="outlined" color={LEDGER_STATUS[i.ledgerStatus].color} label={LEDGER_STATUS[i.ledgerStatus].label} />
                </Stack>
              </TableCell>
              <TableCell align="right">{formatMoney(i.taxAmount, e.currency)}</TableCell>
              <TableCell align="right">
                <b>{formatMoney(i.amount, e.currency)}</b>
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell colSpan={5} sx={{ fontWeight: 700 }}>
              Total
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>
              {formatMoney(e.taxAmount, e.currency)}
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>
              {formatMoney(e.amount, e.currency)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Ledger resolution reflects the company's current mappings; “Validate & save” below locks it into the job.
      </Typography>
    </Box>
  );
}

function Jobs({ e }: { e: ExpenseDetail }) {
  const theme = useTheme();
  if (!e.jobs.length) return <Typography color="text.secondary">No processing job.</Typography>;
  return (
    <Stack spacing={2}>
      {e.jobs.map((j) => (
        <Box key={j.id} sx={{ p: 2, borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 1 }} useFlexGap>
            <JobStatusChip status={j.status} />
            <Chip size="small" variant="outlined" label={`Attempts ${j.attempts}/${j.maxAttempts}`} />
            <Chip size="small" variant="outlined" label={`Priority ${j.priority}`} />
            {j.voucherType && <Chip size="small" variant="outlined" label={j.voucherType} />}
            {j.isPaused && <Chip size="small" color="warning" label="Paused" />}
            {j.isDeadLetter && <Chip size="small" color="error" label="Dead letter" />}
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              <RouterLink to={`/queue/${j.id}`}>Job {j.id.slice(0, 8)}</RouterLink> · created {timeAgo(j.createdAt)}
            </Typography>
          </Stack>
          {j.errorCode && (
            <Alert severity="error" sx={{ mb: 1, borderRadius: 2 }}>
              <b>{j.errorCode}</b> {j.errorMessage}
            </Alert>
          )}
          {j.approvedAt && (
            <Typography variant="body2" color="text.secondary">
              Approved by {j.approvedBy ?? 'unknown'} {timeAgo(j.approvedAt)}
            </Typography>
          )}
          {j.rejectionReason && (
            <Typography variant="body2" color="error">
              Rejected: {j.rejectionReason}
            </Typography>
          )}
          {j.attempts_.length > 0 && (
            <Table size="small" sx={{ mt: 1 }}>
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Operation</TableCell>
                  <TableCell>Outcome</TableCell>
                  <TableCell>Transition</TableCell>
                  <TableCell>Error</TableCell>
                  <TableCell>Started</TableCell>
                  <TableCell align="right">Duration</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {j.attempts_.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.attemptNo}</TableCell>
                    <TableCell>{humanize(a.operation)}</TableCell>
                    <TableCell>
                      <Chip size="small" color={a.outcome === 'SUCCESS' ? 'success' : a.outcome === 'IN_PROGRESS' ? 'info' : 'error'} variant="outlined" label={humanize(a.outcome)} />
                    </TableCell>
                    <TableCell>{a.fromStatus && a.toStatus ? `${humanize(a.fromStatus)} → ${humanize(a.toStatus)}` : '-'}</TableCell>
                    <TableCell title={a.errorMessage ?? ''}>{a.errorCode ?? '-'}</TableCell>
                    <TableCell>{formatDateTime(a.startedAt)}</TableCell>
                    <TableCell align="right">{a.durationMs !== null ? `${a.durationMs} ms` : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
      ))}
    </Stack>
  );
}

export function ExpenseDetailPage() {
  const { id = '' } = useParams();
  const theme = useTheme();
  const [payloadTab, setPayloadTab] = useState<'original' | 'normalized'>('original');
  const q = useQuery({ queryKey: ['expenses', 'detail', id], queryFn: () => recordsApi.expense(id), refetchInterval: 30_000 });

  if (q.error) return <ErrorState message={toApiError(q.error).message} onRetry={() => void q.refetch()} />;
  const e = q.data;
  if (!e) return <Skeleton variant="rounded" height={360} sx={{ borderRadius: 5 }} />;
  const warnings = e.validationResults?.intake?.warnings ?? [];
  const voucher = e.postedVouchers.find((v) => v.verificationStatus === 'VERIFIED') ?? e.postedVouchers[0];

  return (
    <>
      <PageHeader
        icon={<IconTile icon={ReceiptText} color={brand.orange.main} size={52} />}
        crumbs={[{ label: 'Expense Transactions', to: '/expenses' }, { label: e.requestNumber ?? e.sourceTransactionId }]}
        title={
          <>
            {formatMoney(e.amount, e.currency)} <Typography component="span" variant="h5" color="text.secondary">· {e.requestNumber ?? e.sourceTransactionId}</Typography>
          </>
        }
        subtitle={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
            <JobStatusChip status={e.status} />
            <Chip size="small" variant="outlined" color={e.approvalStatus === 'APPROVED' ? 'success' : 'warning'} label={`Kissflow: ${humanize(e.approvalStatus)}`} />
            <span>
              {e.company.name} · received {timeAgo(e.receivedAt)}
            </span>
          </Stack>
        }
      />

      <Card sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
        <ExpenseTimeline status={e.status} />
      </Card>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: '1.6fr 1fr' }, alignItems: 'start' }}>
        <Stack spacing={3}>
          <Section title="Expense information">
            <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' } }}>
              <Field label="Employee / vendor" value={[e.employeeName ?? e.vendorName, e.employeeCode].filter(Boolean).join(' · ') || '-'} />
              <Field label="Expense date" value={formatDate(e.expenseDate)} />
              <Field label="Category" value={e.category} />
              <Field label="Amount" value={formatMoney(e.amount, e.currency)} />
              <Field label="Tax" value={formatMoney(e.taxAmount, e.currency)} />
              <Field label="Cost centre" value={e.costCentre} />
              <Field label="Voucher type" value={e.voucherKind ? VOUCHER_KIND_LABELS[e.voucherKind] : 'Decided at validation'} />
              <Field label="Kissflow request ID" value={<code>{e.kissflowRequestId}</code>} />
              <Field label="Request number" value={e.requestNumber} />
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Field label="Description" value={e.description} />
              </Box>
            </Box>
          </Section>

          <Section title={`Line items (${e.items.length})`} delay={0.05}>
            <LineItems e={e} />
          </Section>

          <VoucherPreviewSection expenseId={e.id} companyId={e.company.id} />

          <Section title="Processing job history" delay={0.1}>
            <Jobs e={e} />
          </Section>

          <Section
            title="Source payload"
            delay={0.15}
            action={
              <Tabs value={payloadTab} onChange={(_, v) => setPayloadTab(v)} sx={{ minHeight: 0, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}>
                <Tab value="original" label="Original" />
                <Tab value="normalized" label="Normalized" />
              </Tabs>
            }
          >
            <JsonViewer value={payloadTab === 'original' ? e.originalPayload : e.normalizedPayload} maxHeight={520} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Banking and contact fields are masked. Payload hash {e.payloadHash.slice(0, 16)}… · idempotency key <code>{e.idempotencyKey}</code>
            </Typography>
          </Section>
        </Stack>

        <Stack spacing={3}>
          <Section title="Routing">
            <Stack spacing={2}>
              <Field label="Source application" value={<RouterLink to={`/applications/${e.application.id}`}>{e.application.name}</RouterLink>} />
              <Field label="Company" value={<RouterLink to={`/companies/${e.company.id}`}>{e.company.name}</RouterLink>} />
              <Field label="Tally company" value={e.company.tallyCompanyName} />
              <Field label="Currency" value={`${e.currency}${e.currency !== e.company.defaultCurrency ? ` (company: ${e.company.defaultCurrency})` : ''}`} />
            </Stack>
          </Section>

          <Section title="Validation" delay={0.05}>
            {warnings.length === 0 ? (
              <Alert severity="success" sx={{ borderRadius: 3 }}>
                Intake checks passed: approved in Kissflow, routed to an active company, mapped without errors.
              </Alert>
            ) : (
              <Stack spacing={1}>
                {warnings.map((w, i) => (
                  <Alert key={i} severity="warning" sx={{ borderRadius: 3 }}>
                    <b>{w.field}</b>: {w.message}
                  </Alert>
                ))}
              </Stack>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Accounting validation (ledgers, voucher configuration, debit = credit) runs in the queue engine.
            </Typography>
          </Section>

          <Section title="Posted voucher" delay={0.1}>
            {voucher ? (
              <Stack spacing={1.5}>
                <Chip sx={{ alignSelf: 'flex-start' }} color={voucher.verificationStatus === 'VERIFIED' ? 'success' : 'warning'} label={humanize(voucher.verificationStatus)} />
                <Field label="Voucher" value={`${voucher.voucherType} #${voucher.voucherNumber ?? '-'}`} />
                <Field label="Voucher date" value={formatDate(voucher.voucherDate)} />
                <Field label="Amount" value={formatMoney(voucher.amount, voucher.currency)} />
                <Field label="Tally MasterID / AlterID" value={`${voucher.tallyMasterId ?? '-'} / ${voucher.tallyAlterId ?? '-'}`} />
                <Field label="Reference" value={<code>{voucher.reference}</code>} />
                <Field label="Verified" value={voucher.verifiedAt ? formatDateTime(voucher.verifiedAt) : 'Not yet'} />
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Not posted yet. Vouchers appear here only after Tally confirms them on read-back.
              </Typography>
            )}
          </Section>

          <Section title="Tally responses" delay={0.12}>
            {e.tallyResponses.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No Tally requests yet.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {e.tallyResponses.map((t) => (
                  <Tooltip key={t.id} title={t.responseExcerpt ?? ''}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 1, borderRadius: 2, bgcolor: alpha(t.errors ? theme.palette.error.main : theme.palette.success.main, 0.08) }}>
                      <FileText size={16} />
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {humanize(t.operation)} · created {t.created}, altered {t.altered}, errors {t.errors}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {timeAgo(t.createdAt)}
                      </Typography>
                    </Stack>
                  </Tooltip>
                ))}
              </Stack>
            )}
          </Section>

          <Section title={`Supporting documents (${e.supportingDocuments.length})`} delay={0.14}>
            {e.supportingDocuments.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No attachments referenced.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {e.supportingDocuments.map((d, i) => (
                  <Stack key={`${d.key}-${i}`} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Paperclip size={16} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" noWrap>
                        {d.name ?? 'Attachment'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ fontFamily: 'monospace' }}>
                        {d.key}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            )}
          </Section>

          <Section title="Activity" delay={0.16}>
            <Stack spacing={1.25}>
              {e.timeline.map((t) => (
                <Box key={t.id}>
                  <Typography variant="subtitle2">
                    {humanize(t.action)}
                    {t.newStatus ? ` → ${humanize(t.newStatus)}` : ''}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t.user ?? humanize(t.actorType)} · {formatDateTime(t.createdAt)}
                  </Typography>
                </Box>
              ))}
              {e.receipts.length > 0 && (
                <Box sx={{ pt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Intake requests
                  </Typography>
                  {e.receipts.map((r) => (
                    <Stack key={r.id} direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
                      <ReceiptStatus status={r.status as 'ACCEPTED'} />
                      <Typography variant="caption">
                        {humanize(r.source)} · HTTP {r.httpStatus} · {timeAgo(r.createdAt)}
                      </Typography>
                    </Stack>
                  ))}
                </Box>
              )}
            </Stack>
          </Section>
        </Stack>
      </Box>
    </>
  );
}
