import { Badge, Box, Button, Card, CircularProgress, Stack, Tab, Tabs } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { accountingApi, ledgersApi } from '@/api/accountingEndpoints';
import { IconTile } from '@/components/common/IconTile';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/States';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useAuthStore } from '@/stores/auth';
import { brand } from '@/theme/theme';
import { CompanyPicker, useSelectedCompany } from '../shared/CompanyPicker';
import { LedgersTable, MappingsPanel, MasterRequestsPanel, MissingLedgersPanel, UnmappedPanel } from './LedgerPanels';

const TABS = ['mappings', 'unmapped', 'missing', 'requests', 'ledgers'] as const;

export function RevalidateButton({ companyId }: { companyId: string }) {
  const canManage = useAuthStore((s) => s.hasPermission('jobs.manage'));
  const run = useApiMutation(() => accountingApi.revalidateCompany(companyId), {
    success: (r) => `Revalidated ${r.processed} blocked expense(s): ${Object.entries(r).filter(([k]) => !['company', 'candidates', 'processed', 'failed'].includes(k)).map(([k, v]) => `${v} ${k.toLowerCase().replace(/_/g, ' ')}`).join(', ') || 'no changes'}`,
    invalidate: [['expenses'], ['jobs'], ['ledgers'], ['master-requests'], ['dashboard']],
  });
  if (!canManage) return null;
  return (
    <Button variant="outlined" startIcon={run.isPending ? <CircularProgress size={16} /> : <RefreshCw size={16} />} disabled={run.isPending} onClick={() => run.mutate(undefined)}>
      Revalidate blocked expenses
    </Button>
  );
}

export function LedgersPage() {
  const theme = useTheme();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as (typeof TABS)[number]) : 'mappings';
  const { companyId, companies, setCompany, loading } = useSelectedCompany();
  const unmapped = useQuery({ queryKey: ['ledgers', companyId, 'unmapped'], queryFn: () => ledgersApi.unmapped(companyId!), enabled: Boolean(companyId) });
  const missing = useQuery({ queryKey: ['ledgers', companyId, 'missing'], queryFn: () => ledgersApi.missing(companyId!), enabled: Boolean(companyId) });
  const pending = useQuery({ queryKey: ['master-requests', companyId, 'count'], queryFn: () => ledgersApi.requests({ companyId: companyId!, status: 'PENDING_REVIEW', pageSize: 1 }), enabled: Boolean(companyId) });

  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        icon={<IconTile icon={BookOpenCheck} color={brand.emerald.main} size={52} />}
        title="Ledger Management"
        subtitle="Company-specific ledgers, category mappings and Finance-approved master creation"
        actions={
          <>
            <CompanyPicker value={companyId} companies={companies} onChange={setCompany} />
            {companyId && <RevalidateButton companyId={companyId} />}
          </>
        }
      />
      {!loading && !companies.length ? (
        <Card>
          <EmptyState title="No companies available" description="Create a company first; ledgers and mappings are maintained per company." />
        </Card>
      ) : (
        <Card>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ px: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
            <Tab value="mappings" label="Category mappings" />
            <Tab value="unmapped" label={<Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}><span>Unmapped categories</span><Badge color="error" badgeContent={unmapped.data?.length ?? 0} /></Stack>} />
            <Tab value="missing" label={<Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}><span>Missing ledgers</span><Badge color="warning" badgeContent={missing.data?.length ?? 0} /></Stack>} />
            <Tab value="requests" label={<Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}><span>Master requests</span><Badge color="secondary" badgeContent={pending.data?.meta.total ?? 0} /></Stack>} />
            <Tab value="ledgers" label="Tally ledgers" />
          </Tabs>
          <Box>
            {companyId && tab === 'mappings' && <MappingsPanel companyId={companyId} />}
            {companyId && tab === 'unmapped' && <UnmappedPanel companyId={companyId} />}
            {companyId && tab === 'missing' && <MissingLedgersPanel companyId={companyId} />}
            {companyId && tab === 'requests' && <MasterRequestsPanel companyId={companyId} />}
            {companyId && tab === 'ledgers' && <LedgersTable companyId={companyId} />}
          </Box>
        </Card>
      )}
    </>
  );
}
