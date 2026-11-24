import { Box, Button, Card, Skeleton, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Pencil, PlugZap, Power, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { CheckResult } from '@/api/adminTypes';
import { applicationsApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import { CheckResultsDialog, ConfirmDialog } from '@/components/common/Dialogs';
import { IconTile } from '@/components/common/IconTile';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState } from '@/components/common/States';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useAuthStore } from '@/stores/auth';
import { brand } from '@/theme/theme';
import { formatCompact, formatDate, formatMoney, formatNumber, timeAgo } from '@/utils/format';
import { Field, StatCard } from '../companies/CompanyDetailPage';
import { ApplicationStatusBadge } from '../shared/Badges';
import { ExpensesTable, JobsTable } from '../shared/RecordTables';
import { ApiLogsPanel } from './ApiLogsPanel';
import { APPLICATION_TYPE_LABELS, appIcon, AUTH_LABELS, MODE_LABELS, VOUCHER_KIND_LABELS } from './appMeta';
import { ApplicationEditDialog, CompanyLinksPanel, IntegrationPanel } from './ApplicationPanels';
import { FieldMappingPanel } from './FieldMappingPanel';

const TABS = [
  ['overview', 'Overview'],
  ['companies', 'Connected Companies'],
  ['expenses', 'Expense Transactions'],
  ['jobs', 'Processing Jobs'],
  ['mapping', 'Field Mapping'],
  ['integration', 'Integration Configuration'],
  ['logs', 'API Logs'],
  ['settings', 'Settings'],
] as const;

export function ApplicationDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as (typeof TABS)[number][0]) ?? 'overview';
  const canManage = useAuthStore((s) => s.hasPermission('applications.manage'));
  const canExpenses = useAuthStore((s) => s.hasPermission('expenses.view'));
  const canJobs = useAuthStore((s) => s.hasPermission('jobs.view'));
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'toggle' | 'delete' | null>(null);
  const [testResult, setTestResult] = useState<CheckResult | null>(null);

  const q = useQuery({ queryKey: ['applications', 'detail', id], queryFn: () => applicationsApi.get(id) });
  const toggle = useApiMutation(() => applicationsApi.update(id, { status: q.data!.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }), {
    success: (r) => (r.application.status === 'ACTIVE' ? 'Application activated' : 'Application deactivated'),
    invalidate: [['applications'], ['dashboard']],
    onSuccess: () => setConfirm(null),
  });
  const remove = useApiMutation(() => applicationsApi.remove(id), {
    success: 'Application deleted',
    invalidate: [['applications'], ['dashboard']],
    onSuccess: () => navigate('/applications', { replace: true }),
  });
  const test = useApiMutation(() => applicationsApi.testConnection(id), { invalidate: [['audit']], onSuccess: (r) => setTestResult(r) });

  if (q.error) return <ErrorState message={toApiError(q.error).message} onRetry={() => void q.refetch()} />;
  const app = q.data;
  if (!app) return <Skeleton variant="rounded" height={320} sx={{ borderRadius: 5 }} />;
  const color = app.color ?? brand.indigo.main;
  const visibleTabs = TABS.filter(([k]) => (k === 'expenses' ? canExpenses : k === 'jobs' ? canJobs : true));

  return (
    <>
      <PageHeader
        icon={<IconTile icon={appIcon(app.icon)} color={color} size={52} />}
        crumbs={[{ label: 'Applications', to: '/applications' }, { label: app.code }]}
        title={app.name}
        subtitle={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
            <ApplicationStatusBadge status={app.status} />
            <span>
              {MODE_LABELS[app.integrationMode].label} · {AUTH_LABELS[app.authMethod]}
            </span>
          </Stack>
        }
        actions={
          canManage && (
            <>
              <Button variant="outlined" startIcon={<PlugZap size={17} />} onClick={() => test.mutate(undefined)} disabled={test.isPending}>
                {test.isPending ? 'Testing...' : 'Test connection'}
              </Button>
              <Button variant="outlined" color={app.status === 'ACTIVE' ? 'error' : 'success'} startIcon={<Power size={17} />} onClick={() => setConfirm('toggle')}>
                {app.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              </Button>
              <Button variant="contained" startIcon={<Pencil size={17} />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            </>
          )
        }
      />

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 3 }}>
        <StatCard index={0} label="Connected companies" value={formatNumber(app.stats.connectedCompanies)} color={brand.purple.main} />
        <StatCard index={1} label="Expenses received" value={formatCompact(app.stats.expenses)} color={brand.orange.main} />
        <StatCard index={2} label="Total value" value={formatMoney(app.stats.expenseAmount, 'INR', { compact: true })} color={brand.indigo.main} />
        <StatCard index={3} label="Pending jobs" value={formatNumber(app.stats.openJobs)} color={brand.amber.main} />
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
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Field label="Description" value={app.description || 'No description'} />
              </Box>
              <Field label="Application code" value={app.code} />
              <Field label="Type" value={APPLICATION_TYPE_LABELS[app.applicationType]} />
              <Field label="Kissflow account" value={app.kissflowAccount} />
              <Field label="Kissflow application ID" value={app.kissflowAppId} />
              <Field label="Process / flow ID" value={app.kissflowProcessId} />
              <Field label="Default voucher type" value={app.defaultVoucherKind ? VOUCHER_KIND_LABELS[app.defaultVoucherKind] : null} />
              <Field label="Last request" value={timeAgo(app.lastRequestAt)} />
              <Field label="Last successful posting" value={timeAgo(app.lastSuccessAt)} />
              <Field label="Created" value={formatDate(app.createdAt)} />
            </Box>
          )}
          {tab === 'companies' && <CompanyLinksPanel app={app} canManage={canManage} />}
          {tab === 'expenses' && <ExpensesTable scope={{ applicationId: app.id }} hideApplication />}
          {tab === 'jobs' && <JobsTable scope={{ applicationId: app.id }} hideApplication />}
          {tab === 'mapping' && <FieldMappingPanel app={app} canManage={canManage} />}
          {tab === 'integration' && <IntegrationPanel app={app} canManage={canManage} />}
          {tab === 'logs' && <ApiLogsPanel app={app} />}
          {tab === 'settings' && (
            <Stack spacing={3} sx={{ p: 3, maxWidth: 760 }}>
              <Box>
                <Typography variant="h6">Status</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Only active applications accept incoming transactions. Activation requires at least one active company and valid credentials.
                </Typography>
                <Button variant="outlined" color={app.status === 'ACTIVE' ? 'error' : 'success'} startIcon={<Power size={17} />} disabled={!canManage} onClick={() => setConfirm('toggle')}>
                  {app.status === 'ACTIVE' ? 'Deactivate application' : 'Activate application'}
                </Button>
              </Box>
              <Box>
                <Typography variant="h6" color="error">
                  Delete application
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Deletion is blocked while jobs are open. Credentials are revoked; past transactions and audit history are kept.
                </Typography>
                <Button variant="contained" color="error" startIcon={<Trash2 size={17} />} disabled={!canManage} onClick={() => setConfirm('delete')}>
                  Delete application
                </Button>
              </Box>
            </Stack>
          )}
        </Box>
      </Card>

      <ApplicationEditDialog app={app} open={editing} onClose={() => setEditing(false)} />
      <CheckResultsDialog open={Boolean(testResult)} title={`Connection test · ${app.name}`} result={testResult} onClose={() => setTestResult(null)} />
      <ConfirmDialog
        open={confirm === 'toggle'}
        danger={app.status === 'ACTIVE'}
        title={app.status === 'ACTIVE' ? `Deactivate ${app.name}?` : `Activate ${app.name}?`}
        message={app.status === 'ACTIVE' ? 'Incoming transactions from this application will be rejected until it is reactivated.' : 'The application will start accepting transactions for its connected companies.'}
        confirmLabel={app.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        loading={toggle.isPending}
        onConfirm={() => toggle.mutate(undefined)}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        danger
        title={`Delete ${app.name}?`}
        message="This revokes its credentials and removes it from the list. This cannot be undone from the UI."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
