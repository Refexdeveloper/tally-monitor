import { Alert, Box, Button, Card, Skeleton, Stack, Tab, Tabs, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Building2, Pencil, Power } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { companiesApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import { ConfirmDialog } from '@/components/common/Dialogs';
import { IconTile } from '@/components/common/IconTile';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState } from '@/components/common/States';
import { DataTable } from '@/components/data/DataTable';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useAuthStore } from '@/stores/auth';
import { brand } from '@/theme/theme';
import { formatDate, formatMoney, formatNumber, timeAgo } from '@/utils/format';
import { ActiveBadge, ApplicationStatusBadge, CompanyStatusBadge } from '../shared/Badges';
import { AuditTable, ExpensesTable, JobsTable } from '../shared/RecordTables';
import { MappingsPanel } from '../ledgers/LedgerPanels';
import { ReportViewer } from '../reports/ReportViewer';
import { VoucherConfigsPanel, VoucherRulesPanel } from '../vouchers/VoucherPanels';
import { CompanyFormDialog } from './CompanyFormDialog';
import { reportsApi } from '@/api/reportEndpoints';

const TABS = [
  ['overview', 'Overview'],
  ['applications', 'Connected Applications'],
  ['expenses', 'Expenses'],
  ['ledgers', 'Ledger Mapping'],
  ['vouchers', 'Voucher Mapping'],
  ['tally', 'Tally Configuration'],
  ['queue', 'Processing Queue'],
  ['reports', 'Reports'],
  ['audit', 'Audit History'],
] as const;

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }} component="div">
        {value ?? '-'}
      </Typography>
    </Box>
  );
}

export function StatCard({ label, value, color, index = 0 }: { label: string; value: ReactNode; color: string; index?: number }) {
  return (
    <Card component={motion.div} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} sx={{ p: 2.5, boxShadow: 'none', border: `1px solid ${alpha(color, 0.2)}`, background: `linear-gradient(135deg, ${alpha(color, 0.14)}, ${alpha(color, 0.04)})` }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }} color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h4" sx={{ mt: 0.5 }}>
        {value}
      </Typography>
    </Card>
  );
}

export function CompanyDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as (typeof TABS)[number][0]) ?? 'overview';
  const canManage = useAuthStore((s) => s.hasPermission('companies.manage'));
  const canAudit = useAuthStore((s) => s.hasPermission('audit.view'));
  const canExpenses = useAuthStore((s) => s.hasPermission('expenses.view'));
  const canJobs = useAuthStore((s) => s.hasPermission('jobs.view'));
  const [editing, setEditing] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(false);

  const q = useQuery({ queryKey: ['companies', 'detail', id], queryFn: () => companiesApi.get(id) });
  const apps = useQuery({ queryKey: ['companies', 'detail', id, 'apps'], queryFn: () => companiesApi.applications(id), enabled: tab === 'applications' || tab === 'overview' });
  const toggle = useApiMutation(() => companiesApi.update(id, { isActive: !q.data!.isActive }), {
    success: (c) => (c.isActive ? 'Company activated' : 'Company deactivated'),
    invalidate: [['companies'], ['dashboard']],
    onSuccess: () => setConfirmToggle(false),
  });

  if (q.error) return <ErrorState message={toApiError(q.error).message} onRetry={() => void q.refetch()} />;
  const c = q.data;
  if (!c) return <Skeleton variant="rounded" height={320} sx={{ borderRadius: 5 }} />;

  const visibleTabs = TABS.filter(([key]) => (key === 'audit' ? canAudit : key === 'expenses' ? canExpenses : key === 'queue' ? canJobs : true));

  return (
    <>
      <PageHeader
        icon={<IconTile icon={Building2} color={brand.purple.main} size={52} />}
        crumbs={[{ label: 'Companies', to: '/companies' }, { label: c.code }]}
        title={c.name}
        subtitle={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
            <CompanyStatusBadge status={c.integrationStatus} />
            <ActiveBadge active={c.isActive} />
            <span>Tally: {c.tallyCompanyName}</span>
          </Stack>
        }
        actions={
          canManage && (
            <>
              <Button variant="outlined" color={c.isActive ? 'error' : 'success'} startIcon={<Power size={17} />} onClick={() => setConfirmToggle(true)}>
                {c.isActive ? 'Deactivate' : 'Activate'}
              </Button>
              <Button variant="contained" startIcon={<Pencil size={17} />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            </>
          )
        }
      />

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, mb: 3 }}>
        <StatCard index={0} label="Applications" value={formatNumber(c.stats.connectedApplications)} color={brand.indigo.main} />
        <StatCard index={1} label="Expenses" value={formatNumber(c.stats.expenses)} color={brand.orange.main} />
        <StatCard index={2} label="Total value" value={formatMoney(c.stats.expenseAmount, c.defaultCurrency, { compact: true })} color={brand.purple.main} />
        <StatCard index={3} label="Posted vouchers" value={formatNumber(c.stats.postedVouchers)} color={brand.emerald.main} />
        <StatCard index={4} label="Pending jobs" value={formatNumber(c.stats.openJobs)} color={brand.amber.main} />
      </Box>

      <Card>
        <Tabs value={tab} onChange={(_, v) => setParams({ tab: v }, { replace: true })} variant="scrollable" allowScrollButtonsMobile sx={{ px: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
          {visibleTabs.map(([key, label]) => (
            <Tab key={key} value={key} label={label} />
          ))}
        </Tabs>
        <Box component={motion.div} key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {tab === 'overview' && (
            <Box sx={{ p: 3, display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' } }}>
              <Field label="Company code" value={c.code} />
              <Field label="GSTIN" value={c.gstin} />
              <Field label="Default currency" value={c.defaultCurrency} />
              <Field label="Financial year start" value={c.financialYearStart ? formatDate(c.financialYearStart) : null} />
              <Field label="Tally company name" value={c.tallyCompanyName} />
              <Field label="Tally server" value={c.tallyServer?.name ?? 'Not assigned'} />
              <Field label="Bridge Agent" value={c.agent ? `${c.agent.name}${c.agent.overridden ? ' (override)' : ''}` : 'None'} />
              <Field label="Failed jobs" value={formatNumber(c.stats.failedJobs)} />
              <Field label="Created" value={formatDate(c.createdAt)} />
              <Field label="Last updated" value={timeAgo(c.updatedAt)} />
            </Box>
          )}
          {tab === 'applications' && (
            <DataTable
              plain
              rows={apps.data}
              loading={apps.isFetching}
              error={apps.error ? toApiError(apps.error).message : null}
              rowKey={(a) => a.applicationId}
              onRowClick={(a) => navigate(`/applications/${a.applicationId}?tab=companies`)}
              emptyTitle="No applications connected"
              emptyText="Connect Kissflow applications to this company from the Applications module."
              columns={[
                {
                  key: 'name',
                  header: 'Application',
                  render: (a) => (
                    <>
                      <Typography variant="subtitle2">{a.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {a.code} · {a.integrationMode.toLowerCase()}
                      </Typography>
                    </>
                  ),
                },
                { key: 'key', header: 'Source company key', render: (a) => <code>{a.sourceCompanyKey}</code> },
                { key: 'expenses', header: 'Expenses', align: 'right', render: (a) => formatNumber(a.expenses) },
                { key: 'last', header: 'Last received', render: (a) => timeAgo(a.lastReceivedAt), hideBelow: 'sm' },
                { key: 'link', header: 'Link', render: (a) => <ActiveBadge active={a.isActive} /> },
                { key: 'status', header: 'App status', render: (a) => <ApplicationStatusBadge status={a.status} />, hideBelow: 'md' },
              ]}
            />
          )}
          {tab === 'expenses' && <ExpensesTable scope={{ companyId: c.id }} hideCompany />}
          {tab === 'ledgers' && (
            <Box>
              <Stack direction="row" spacing={1} sx={{ px: 3, pt: 2.5, alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Category → ledger mappings for {c.name}. Unmapped categories, missing ledgers and master requests are in Ledger Management.
                </Typography>
                <Button size="small" onClick={() => navigate(`/ledgers?company=${c.id}`)}>
                  Open Ledger Management
                </Button>
              </Stack>
              <MappingsPanel companyId={c.id} />
            </Box>
          )}
          {tab === 'vouchers' && (
            <Box>
              <VoucherConfigsPanel companyId={c.id} />
              <Typography variant="h6" sx={{ px: 3, pt: 1 }}>
                Routing rules
              </Typography>
              <VoucherRulesPanel companyId={c.id} />
            </Box>
          )}
          {tab === 'tally' && (
            <Box sx={{ p: 3, display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
              <Field label="Exact Tally company name" value={c.tallyCompanyName} />
              <Field label="Tally server" value={c.tallyServer ? `${c.tallyServer.name}${c.tallyServer.endpoint ? ` (${c.tallyServer.endpoint})` : ''}` : 'Not assigned'} />
              <Field label="Tally release" value={c.tallyServer?.release} />
              <Field label="Last agent health check" value={c.tallyServer?.lastHealthCheckAt ? timeAgo(c.tallyServer.lastHealthCheckAt) : 'Never'} />
              <Field label="Bridge Agent" value={c.agent ? c.agent.name : 'None'} />
              <Field label="Agent heartbeat" value={c.agent?.lastHeartbeatAt ? timeAgo(c.agent.lastHeartbeatAt) : 'Never'} />
              <Field
                label="Open in TallyPrime"
                value={c.tallyServer?.companyLoaded == null ? 'Not reported yet' : c.tallyServer.companyLoaded ? `Yes${c.tallyServer.discoveredAt ? ` (checked ${timeAgo(c.tallyServer.discoveredAt)})` : ''}` : 'No: postings will wait'}
              />
              <Field label="Ledgers synced from Tally" value={c.ledgersSyncedAt ? timeAgo(c.ledgersSyncedAt) : 'Never'} />
              {c.tallyServer?.companyLoaded === false && (
                <Alert severity="warning" sx={{ gridColumn: '1 / -1', borderRadius: 3 }}>
                  The Bridge Agent cannot find "{c.tallyCompanyName}" among the companies open in TallyPrime. Open it in Tally, or make the Tally company name above match exactly.
                </Alert>
              )}
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Typography variant="body2" color="text.secondary">
                  Every Tally request explicitly names this company. Postings never rely on whichever company is open in TallyPrime.
                </Typography>
                {canManage && (
                  <Button sx={{ mt: 1.5 }} variant="outlined" startIcon={<Pencil size={16} />} onClick={() => setEditing(true)}>
                    Change Tally configuration
                  </Button>
                )}
              </Box>
            </Box>
          )}
          {tab === 'queue' && <JobsTable scope={{ companyId: c.id }} hideCompany />}
          {tab === 'reports' && <CompanyReports companyId={c.id} />}
          {tab === 'audit' && <AuditTable scope={{ companyId: c.id }} />}
        </Box>
      </Card>

      <CompanyFormDialog open={editing} company={c} onClose={() => setEditing(false)} />
      <ConfirmDialog
        open={confirmToggle}
        danger={c.isActive}
        title={c.isActive ? `Deactivate ${c.name}?` : `Activate ${c.name}?`}
        message={c.isActive ? 'New expenses for this company will be held and no postings will run until it is reactivated.' : 'The company will start accepting and processing transactions again.'}
        confirmLabel={c.isActive ? 'Deactivate' : 'Activate'}
        loading={toggle.isPending}
        onConfirm={() => toggle.mutate(undefined)}
        onClose={() => setConfirmToggle(false)}
      />
    </>
  );
}

function CompanyReports({ companyId }: { companyId: string }) {
  const catalog = useQuery({ queryKey: ['reports', 'catalog'], queryFn: () => reportsApi.catalog() });
  if (catalog.isLoading) return <Skeleton variant="rounded" height={320} sx={{ m: 2, borderRadius: 3 }} />;
  if (catalog.isError) return <ErrorState message={toApiError(catalog.error).message} onRetry={() => void catalog.refetch()} />;
  if (!catalog.data?.length) return null;
  return (
    <Box sx={{ p: 2.5 }}>
      <ReportViewer catalog={catalog.data} lockedCompanyId={companyId} initialKey="company-expenses" />
    </Box>
  );
}
