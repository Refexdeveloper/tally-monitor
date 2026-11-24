import { Alert, Box, Button, Card, Chip, CircularProgress, Skeleton, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BookPlus, Link2, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { accountingApi } from '@/api/accountingEndpoints';
import { toApiError } from '@/api/client';
import { ErrorState } from '@/components/common/States';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { formatDate, humanize } from '@/utils/format';
import { VoucherTable } from '../vouchers/VoucherTable';

const OUTCOME = {
  OK: { severity: 'success' as const, text: 'Accounting is complete and balanced.' },
  MAPPING_REQUIRED: { severity: 'warning' as const, text: 'Some categories have no ledger mapping for this company.' },
  MASTER_CREATION_REQUIRED: { severity: 'warning' as const, text: 'Some ledgers do not exist in Tally yet; master creation requests are needed.' },
  VALIDATION_FAILED: { severity: 'error' as const, text: 'This expense cannot be posted until the issues below are fixed.' },
};

export function VoucherPreviewSection({ expenseId, companyId }: { expenseId: string; companyId: string }) {
  const navigate = useNavigate();
  const canValidate = useAuthStore((s) => s.hasPermission('jobs.manage'));
  const q = useQuery({ queryKey: ['expenses', 'detail', expenseId, 'voucher'], queryFn: () => accountingApi.preview(expenseId) });
  const validate = useApiMutation(() => accountingApi.validate(expenseId), {
    invalidate: [['expenses'], ['jobs'], ['master-requests'], ['ledgers'], ['dashboard']],
    onSuccess: (r) => {
      const label = humanize(r.status);
      if (r.outcome === 'OK') toast.success(`Validated: ${label}${r.status === 'AWAITING_APPROVAL' ? ' (Finance approval required)' : ''}`);
      else toast.warning(`${label}${r.masterRequestsCreated ? `; ${r.masterRequestsCreated} master request(s) raised for Finance` : ''}`, 'Validation incomplete');
    },
  });

  return (
    <Card component={motion.div} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} sx={{ p: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h6">Voucher preview</Typography>
          {q.data && (
            <Typography variant="body2" color="text.secondary">
              {q.data.voucherType ?? 'No voucher type'} in {q.data.tallyCompanyName} · {q.data.configSource}
            </Typography>
          )}
        </Box>
        {canValidate && q.data?.job && (
          <Button
            variant="contained"
            startIcon={validate.isPending ? <CircularProgress size={16} color="inherit" /> : <ShieldCheck size={17} />}
            disabled={!q.data.job.canValidate || validate.isPending}
            onClick={() => validate.mutate(undefined)}
            title={q.data.job.canValidate ? 'Run accounting validation and update the job status' : `A job in ${humanize(q.data.job.status)} cannot be revalidated`}
          >
            Validate & save
          </Button>
        )}
      </Stack>
      {q.error ? (
        <ErrorState message={toApiError(q.error).message} onRetry={() => void q.refetch()} compact />
      ) : !q.data ? (
        <Skeleton variant="rounded" height={220} />
      ) : (
        <Stack spacing={2}>
          <Alert severity={OUTCOME[q.data.outcome].severity} sx={{ borderRadius: 3 }}>
            {OUTCOME[q.data.outcome].text} {q.data.outcome === 'OK' && (q.data.approvalRequired ? 'Finance approval is required before posting.' : 'Below the approval threshold.')}
          </Alert>
          {q.data.issues.length > 0 && (
            <Stack spacing={0.75}>
              {q.data.issues.map((i, idx) => (
                <Typography key={idx} variant="body2" color={i.severity === 'error' ? 'error' : 'warning.main'}>
                  • {i.message}
                </Typography>
              ))}
              <Stack direction="row" spacing={1}>
                {q.data.issues.some((i) => i.code === 'MAPPING_MISSING') && (
                  <Button size="small" startIcon={<Link2 size={15} />} onClick={() => navigate(`/ledgers?company=${companyId}&tab=unmapped`)}>
                    Map categories
                  </Button>
                )}
                {q.data.requiredMasters.length > 0 && (
                  <Button size="small" startIcon={<BookPlus size={15} />} onClick={() => navigate(`/ledgers?company=${companyId}&tab=requests`)}>
                    Master requests
                  </Button>
                )}
              </Stack>
            </Stack>
          )}
          {q.data.entries.length > 0 && <VoucherTable entries={q.data.entries} currency={q.data.currency} totalDebit={q.data.totalDebit} totalCredit={q.data.totalCredit} balanced={q.data.balanced} />}
          <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <Typography variant="body2">
              <b>Voucher date:</b> {formatDate(q.data.voucherDate)}
            </Typography>
            <Typography variant="body2">
              <b>Voucher no.:</b> {q.data.voucherNumber ?? 'Tally automatic'}
            </Typography>
            <Typography variant="body2">
              <b>Party ledger:</b> {q.data.partyLedger ?? '-'}
            </Typography>
            <Typography variant="body2">
              <b>Reference:</b> <code>{q.data.reference}</code>
            </Typography>
            <Typography variant="body2" sx={{ gridColumn: '1 / -1' }}>
              <b>Narration:</b> {q.data.narration}
            </Typography>
          </Box>
          {q.data.job && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Chip size="small" variant="outlined" label={`Job: ${humanize(q.data.job.status)}`} />
              <Typography variant="caption" color="text.secondary">
                Preview reflects current mappings and ledgers. “Validate & save” locks it into the job; posting needs Finance approval (Phase 5).
              </Typography>
            </Stack>
          )}
        </Stack>
      )}
    </Card>
  );
}
