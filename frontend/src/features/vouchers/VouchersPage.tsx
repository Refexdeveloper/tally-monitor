import { Box, Card, Tab, Tabs } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { FileStack } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { IconTile } from '@/components/common/IconTile';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/States';
import { brand } from '@/theme/theme';
import { CompanyPicker, useSelectedCompany } from '../shared/CompanyPicker';
import { PostedVouchersPanel, VoucherConfigsPanel, VoucherRulesPanel } from './VoucherPanels';

const TABS = ['configurations', 'rules', 'posted'] as const;

export function VouchersPage() {
  const theme = useTheme();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as (typeof TABS)[number]) : 'configurations';
  const { companyId, companies, setCompany, loading } = useSelectedCompany();
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };
  return (
    <>
      <PageHeader
        icon={<IconTile icon={FileStack} color={brand.indigo.main} size={52} />}
        title="Voucher Management"
        subtitle="Voucher configurations, routing rules and the verified posting register"
        actions={<CompanyPicker value={companyId} companies={companies} onChange={setCompany} />}
      />
      {!loading && !companies.length ? (
        <Card>
          <EmptyState title="No companies available" description="Voucher configurations are maintained per company." />
        </Card>
      ) : (
        <Card>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
            <Tab value="configurations" label="Configurations" />
            <Tab value="rules" label="Routing rules" />
            <Tab value="posted" label="Posted vouchers" />
          </Tabs>
          <Box>
            {companyId && tab === 'configurations' && <VoucherConfigsPanel companyId={companyId} />}
            {companyId && tab === 'rules' && <VoucherRulesPanel companyId={companyId} />}
            {companyId && tab === 'posted' && <PostedVouchersPanel companyId={companyId} />}
          </Box>
        </Card>
      )}
    </>
  );
}
