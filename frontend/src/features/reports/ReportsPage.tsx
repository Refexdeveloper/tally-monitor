import { Alert, Box, Card, Skeleton, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChartColumnBig } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { toApiError } from '@/api/client';
import { reportsApi } from '@/api/reportEndpoints';
import type { ReportKey } from '@/api/reportTypes';
import { IconTile } from '@/components/common/IconTile';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState } from '@/components/common/States';
import { brand } from '@/theme/theme';
import { ReportViewer } from './ReportViewer';

export function ReportsPage() {
  const theme = useTheme();
  const [params, setParams] = useSearchParams();
  const catalog = useQuery({ queryKey: ['reports', 'catalog'], queryFn: () => reportsApi.catalog() });
  const selected = (params.get('report') as ReportKey | null) ?? undefined;

  if (catalog.isLoading) {
    return (
      <Box>
        <PageHeader title="Reports & Analytics" subtitle="Operational and accounting reports with Excel, CSV and PDF export." />
        <Skeleton variant="rounded" height={420} sx={{ borderRadius: 4 }} />
      </Box>
    );
  }
  if (catalog.isError) return <ErrorState message={toApiError(catalog.error).message} onRetry={() => void catalog.refetch()} />;
  if (!catalog.data?.length) return <EmptyState title="No reports" description="The reporting catalog is empty." />;

  return (
    <Box>
      <PageHeader title="Reports & Analytics" subtitle="Ten operational reports with company, application and date filters. Exports are generated on the server under your company access." />

      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' },
          mb: 3,
        }}
      >
        {catalog.data.map((r, i) => {
          const active = (selected ?? catalog.data[0]!.key) === r.key;
          return (
            <Card
              key={r.key}
              component={motion.button}
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('report', r.key);
                setParams(next, { replace: true });
              }}
              sx={{
                p: 1.75,
                textAlign: 'left',
                cursor: 'pointer',
                border: `1px solid ${active ? brand.indigo.main : alpha(theme.palette.divider, 0.9)}`,
                bgcolor: active ? alpha(brand.indigo.main, 0.06) : 'background.paper',
                boxShadow: 'none',
                '&:hover': { borderColor: brand.indigo.main },
              }}
            >
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
                <IconTile icon={ChartColumnBig} color={brand.indigo.main} size={36} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" noWrap>
                    {r.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {r.description}
                  </Typography>
                </Box>
              </Stack>
            </Card>
          );
        })}
      </Box>

      {!selected && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 3 }}>
          Pick a report above, or use the selector in the viewer. Company-scoped users only see data for their companies.
        </Alert>
      )}

      <Card sx={{ p: { xs: 2, md: 3 } }}>
        <ReportViewer catalog={catalog.data} initialKey={selected ?? catalog.data[0]!.key} />
      </Card>
    </Box>
  );
}
