import { Box, Card, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { ChartSkeleton, EmptyState, ErrorState } from '@/components/common/States';

interface ChartCardProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: boolean;
  emptyText?: string;
  height?: number;
  delay?: number;
  children: ReactNode;
}

export function ChartCard({ title, subtitle, action, loading, error, onRetry, empty, emptyText, height = 300, delay = 0, children }: ChartCardProps) {
  return (
    <Card
      component={motion.div}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h6">{title}</Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" component="div">
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Stack>
      <Box sx={{ flex: 1, minHeight: height }}>
        {loading ? (
          <ChartSkeleton height={height} />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} compact />
        ) : empty ? (
          <EmptyState title="No data yet" description={emptyText ?? 'Data will appear here as soon as transactions start flowing in.'} compact />
        ) : (
          <Box sx={{ height }}>{children}</Box>
        )}
      </Box>
    </Card>
  );
}

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

/** Glass tooltip shared by dashboard charts. */
export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  labelFormatter?: (label: string) => string;
  valueFormatter?: (value: number, entry: TooltipEntry) => string;
}) {
  const theme = useTheme();
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ px: 1.75, py: 1.25, borderRadius: 3, bgcolor: 'background.glass', backdropFilter: 'blur(12px)', boxShadow: '0 12px 32px -8px rgba(28,29,58,0.3)', border: `1px solid ${theme.palette.divider}`, minWidth: 140 }}>
      {label !== undefined && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
          {labelFormatter ? labelFormatter(String(label)) : label}
        </Typography>
      )}
      {payload.map((p) => (
        <Stack key={String(p.dataKey ?? p.name)} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.color }} />
          <Typography variant="body2" sx={{ flex: 1 }}>
            {p.name}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {valueFormatter ? valueFormatter(Number(p.value), p) : p.value}
          </Typography>
        </Stack>
      ))}
    </Box>
  );
}
