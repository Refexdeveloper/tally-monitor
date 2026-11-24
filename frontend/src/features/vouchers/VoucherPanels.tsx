import { Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, FormControlLabel, IconButton, MenuItem, Skeleton, Stack, Switch, TextField, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { FileStack, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { LedgerRule, PostedVoucherRow, VoucherConfig, VoucherRoutingRule } from '@/api/accountingTypes';
import { vouchersApi } from '@/api/accountingEndpoints';
import { companiesApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import { ConfirmDialog, DialogHeader } from '@/components/common/Dialogs';
import { IconTile } from '@/components/common/IconTile';
import { EmptyState, ErrorState } from '@/components/common/States';
import { DataTable } from '@/components/data/DataTable';
import { SearchToolbar } from '@/components/data/SearchToolbar';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useListState } from '@/hooks/useListState';
import { useAuthStore } from '@/stores/auth';
import { chartColors } from '@/theme/theme';
import { formatDate, formatMoney, humanize, timeAgo } from '@/utils/format';
import { ActiveBadge } from '../shared/Badges';
import { VoucherConfigDialog } from './VoucherConfigDialog';

function ruleText(rule: LedgerRule | null, fallback: string) {
  if (!rule) return fallback;
  switch (rule.source) {
    case 'LEDGER_MAPPING':
      return 'Mapped category ledger';
    case 'FIXED':
      return rule.ledger;
    case 'EMPLOYEE_LEDGER':
      return `Employee ledger ${rule.template ?? '{{employeeName}}'}`;
    case 'VENDOR_LEDGER':
      return `Vendor ledger ${rule.template ?? '{{vendorName}}'}`;
    case 'CREDIT_LEDGER':
      return 'Same as credit';
    case 'NONE':
      return 'None';
  }
}

export function VoucherConfigsPanel({ companyId }: { companyId: string }) {
  const canManage = useAuthStore((s) => s.hasPermission('vouchers.manage'));
  const [editing, setEditing] = useState<VoucherConfig | null | 'new'>(null);
  const q = useQuery({ queryKey: ['voucher-configs', companyId], queryFn: () => vouchersApi.configs(companyId) });
  if (q.error) return <ErrorState message={toApiError(q.error).message} onRetry={() => void q.refetch()} compact />;
  return (
    <Box sx={{ p: 3 }}>
      {canManage && (
        <Stack direction="row" sx={{ justifyContent: 'flex-end', mb: 2 }}>
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setEditing('new')}>
            New configuration
          </Button>
        </Stack>
      )}
      {!q.data ? (
        <Skeleton variant="rounded" height={220} />
      ) : q.data.length === 0 ? (
        <EmptyState title="No voucher configurations" description="Create one per voucher type this company posts (e.g. Journal for reimbursements, Payment for direct payouts)." />
      ) : (
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' } }}>
          {q.data.map((c, i) => (
            <Card
              key={c.id}
              component={motion.div}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              sx={{ p: 2.5, boxShadow: 'none', border: (t) => `1px solid ${t.palette.divider}`, opacity: c.isActive ? 1 : 0.6 }}
            >
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
                <IconTile icon={FileStack} color={chartColors[i % chartColors.length]!} size={40} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="h6" noWrap>
                    {c.tallyVoucherTypeName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {humanize(c.voucherKind)} · {c.numberingMode === 'TALLY_AUTO' ? 'Tally numbering' : c.numberingMode === 'SOURCE_REFERENCE' ? 'Kissflow number' : c.numberingTemplate}
                  </Typography>
                </Box>
                <ActiveBadge active={c.isActive} />
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1.5, rowGap: 0.5, fontSize: 13, p: 1.5, borderRadius: 2, bgcolor: (t) => alpha(t.palette.text.secondary, 0.05) }}>
                <Typography variant="caption" color="text.secondary">Debit</Typography>
                <Typography variant="caption">{ruleText(c.debitLedgerRule, 'Mapped category ledger')}</Typography>
                <Typography variant="caption" color="text.secondary">Credit</Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>{ruleText(c.creditLedgerRule, 'Not set')}</Typography>
                <Typography variant="caption" color="text.secondary">Party</Typography>
                <Typography variant="caption">{ruleText(c.partyLedgerRule, 'Same as credit')}</Typography>
                <Typography variant="caption" color="text.secondary">Tax</Typography>
                <Typography variant="caption">{ruleText(c.taxLedgerRule, 'None')}</Typography>
              </Box>
              <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, flexWrap: 'wrap' }} useFlexGap>
                <Chip size="small" color="secondary" variant="outlined" label={c.approvalPolicy === 'ABOVE_THRESHOLD' ? `Approval above ${formatMoney(c.approvalThreshold ?? '0', 'INR', { compact: true })}` : 'Finance approval always'} />
                {c.costCentreEnabled && <Chip size="small" variant="outlined" label="Cost centres" />}
                {c.billAllocationEnabled && <Chip size="small" variant="outlined" label="Bill allocation" />}
                {c.usage.defaultFor.map((a) => (
                  <Chip key={a} size="small" label={`Default for ${a}`} />
                ))}
              </Stack>
              <Stack direction="row" sx={{ mt: 1.5, alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">
                  {c.usage.mappings} rules · {c.usage.jobs} jobs · updated {timeAgo(c.updatedAt)}
                </Typography>
                {canManage && (
                  <Button size="small" startIcon={<Pencil size={15} />} onClick={() => setEditing(c)}>
                    Edit
                  </Button>
                )}
              </Stack>
            </Card>
          ))}
        </Box>
      )}
      {editing !== null && <VoucherConfigDialog companyId={companyId} config={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Box>
  );
}

function RuleDialog({ companyId, rule, configs, onClose }: { companyId: string; rule: VoucherRoutingRule | null; configs: VoucherConfig[]; onClose: () => void }) {
  const apps = useQuery({ queryKey: ['companies', 'detail', companyId, 'apps'], queryFn: () => companiesApi.applications(companyId) });
  const [appId, setAppId] = useState(rule?.application.id ?? '');
  const [category, setCategory] = useState(rule?.expenseCategory ?? '');
  const [configId, setConfigId] = useState(rule?.configuration.id ?? configs.find((c) => c.isActive)?.id ?? '');
  const [priority, setPriority] = useState(String(rule?.priority ?? 100));
  const [active, setActive] = useState(rule?.isActive ?? true);
  const save = useApiMutation(
    () =>
      rule
        ? vouchersApi.updateRule(rule.id, { expenseCategory: category.trim() || null, voucherConfigurationId: configId, priority: Number(priority), isActive: active })
        : vouchersApi.createRule({ companyId, applicationId: appId, expenseCategory: category.trim() || null, voucherConfigurationId: configId, priority: Number(priority), isActive: active }),
    { success: 'Voucher rule saved', invalidate: [['voucher-rules'], ['voucher-configs']], onSuccess: onClose },
  );
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogHeader title={rule ? 'Edit voucher rule' : 'Add voucher rule'} subtitle="Chooses which voucher configuration an application's expenses use. Category rules win over application-wide rules." onClose={onClose} />
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField select label="Application" value={appId} onChange={(e) => setAppId(e.target.value)} disabled={Boolean(rule)}>
            {apps.data?.map((a) => (
              <MenuItem key={a.applicationId} value={a.applicationId}>
                {a.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Expense category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} helperText="Leave empty to apply to every category of the application" />
          <TextField select label="Voucher configuration" value={configId} onChange={(e) => setConfigId(e.target.value)}>
            {configs.map((c) => (
              <MenuItem key={c.id} value={c.id} disabled={!c.isActive}>
                {c.tallyVoucherTypeName} ({humanize(c.voucherKind)}){c.isActive ? '' : ' - inactive'}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value.replace(/\D/g, ''))} helperText="Lower runs first when several rules match" />
          <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!appId || !configId || !priority || save.isPending} onClick={() => save.mutate(undefined)}>
          Save rule
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function VoucherRulesPanel({ companyId }: { companyId: string }) {
  const canManage = useAuthStore((s) => s.hasPermission('vouchers.manage'));
  const configs = useQuery({ queryKey: ['voucher-configs', companyId], queryFn: () => vouchersApi.configs(companyId) });
  const q = useQuery({ queryKey: ['voucher-rules', companyId], queryFn: () => vouchersApi.rules(companyId) });
  const [editing, setEditing] = useState<VoucherRoutingRule | null | 'new'>(null);
  const [deleting, setDeleting] = useState<VoucherRoutingRule | null>(null);
  const remove = useApiMutation((r: VoucherRoutingRule) => vouchersApi.deleteRule(r.id), { success: 'Rule deleted', invalidate: [['voucher-rules'], ['voucher-configs']], onSuccess: () => setDeleting(null) });
  return (
    <>
      <DataTable
        plain
        rows={q.data}
        rowKey={(r) => r.id}
        loading={q.isFetching}
        error={q.error ? toApiError(q.error).message : null}
        onRetry={() => void q.refetch()}
        emptyTitle="No voucher rules"
        emptyText="Without rules, each application uses its default voucher type's configuration for this company."
        toolbar={
          canManage && (
            <Stack direction="row" sx={{ p: 2.5, justifyContent: 'flex-end' }}>
              <Button variant="contained" startIcon={<Plus size={16} />} disabled={!configs.data?.length} onClick={() => setEditing('new')}>
                Add rule
              </Button>
            </Stack>
          )
        }
        columns={[
          { key: 'app', header: 'Application', render: (r) => <Typography variant="subtitle2">{r.application.name}</Typography> },
          { key: 'cat', header: 'Category', render: (r) => r.expenseCategory ?? <Typography variant="caption" color="text.secondary">Any category</Typography> },
          { key: 'cfg', header: 'Voucher configuration', render: (r) => `${r.configuration.name} (${humanize(r.configuration.voucherKind)})` },
          { key: 'prio', header: 'Priority', align: 'right', render: (r) => r.priority, hideBelow: 'sm' },
          { key: 'status', header: 'Status', render: (r) => <ActiveBadge active={r.isActive && r.configuration.isActive} inactiveLabel={r.configuration.isActive ? 'Inactive' : 'Config inactive'} /> },
          ...(canManage
            ? [
                {
                  key: 'act',
                  header: '',
                  align: 'right' as const,
                  render: (r: VoucherRoutingRule) => (
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                      <IconButton size="small" onClick={() => setEditing(r)}>
                        <Pencil size={16} />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleting(r)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </Stack>
                  ),
                },
              ]
            : []),
        ]}
      />
      {editing !== null && configs.data && <RuleDialog companyId={companyId} rule={editing === 'new' ? null : editing} configs={configs.data} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={Boolean(deleting)} danger title="Delete voucher rule?" message="Expenses fall back to the next matching rule or the application's default voucher type." confirmLabel="Delete" loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting)} onClose={() => setDeleting(null)} />
    </>
  );
}

export function PostedVouchersPanel({ companyId }: { companyId: string | null }) {
  const navigate = useNavigate();
  const list = useListState({ pageSize: 25, sort: 'verifiedAt' });
  const q = useQuery({ queryKey: ['posted-vouchers', companyId, list.params], queryFn: () => vouchersApi.posted({ ...list.params, companyId: companyId ?? undefined }), placeholderData: (p) => p });
  return (
    <DataTable
      plain
      rows={q.data?.items}
      rowKey={(v) => v.id}
      loading={q.isFetching}
      error={q.error ? toApiError(q.error).message : null}
      onRetry={() => void q.refetch()}
      meta={q.data?.meta}
      onPageChange={list.setPage}
      sort={{ key: list.params.sort, order: list.params.order ?? 'desc' }}
      onSortChange={list.setSort}
      onRowClick={(v) => navigate(`/expenses/${v.expense.id}`)}
      emptyTitle="No posted vouchers"
      emptyText="Vouchers are listed here only after Tally confirms them on read-back."
      toolbar={
        <SearchToolbar value={list.params.search ?? ''} onChange={list.setSearch} placeholder="Search voucher no., reference or request">
          <TextField select size="small" label="Verification" value={(list.params.verificationStatus as string) ?? ''} onChange={(e) => list.set({ verificationStatus: e.target.value || undefined })} sx={{ minWidth: 150 }}>
            <MenuItem value="">Any</MenuItem>
            <MenuItem value="VERIFIED">Verified</MenuItem>
            <MenuItem value="PENDING">Pending</MenuItem>
            <MenuItem value="MISMATCH">Mismatch</MenuItem>
          </TextField>
        </SearchToolbar>
      }
      columns={[
        { key: 'no', header: 'Voucher', render: (v) => <Typography variant="subtitle2">{v.voucherType} #{v.voucherNumber ?? '-'}</Typography> },
        ...(companyId ? [] : [{ key: 'company', header: 'Company', render: (v: PostedVoucherRow) => v.company.name }]),
        { key: 'date', header: 'Voucher date', sortKey: 'voucherDate', render: (v) => formatDate(v.voucherDate) },
        { key: 'req', header: 'Request', render: (v) => v.expense.requestNumber ?? '-', hideBelow: 'md' },
        { key: 'ref', header: 'Reference', render: (v) => <code>{v.reference}</code>, hideBelow: 'lg' },
        { key: 'ids', header: 'MasterID / AlterID', render: (v) => `${v.tallyMasterId ?? '-'} / ${v.tallyAlterId ?? '-'}`, hideBelow: 'lg' },
        { key: 'amt', header: 'Amount', align: 'right', sortKey: 'amount', render: (v) => <b>{formatMoney(v.amount, v.currency)}</b> },
        { key: 'ver', header: 'Verification', render: (v) => <Chip size="small" color={v.verificationStatus === 'VERIFIED' ? 'success' : v.verificationStatus === 'MISMATCH' ? 'error' : 'warning'} label={humanize(v.verificationStatus)} /> },
        { key: 'at', header: 'Verified', sortKey: 'verifiedAt', render: (v) => timeAgo(v.verifiedAt), hideBelow: 'sm' },
      ]}
    />
  );
}
