import { Box, Card, LinearProgress, Skeleton, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { motion, useReducedMotion } from 'framer-motion';
import { AppWindow, Building2, CircleCheckBig, ClipboardClock, Cog, Hourglass, type LucideIcon, ReceiptText, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DashboardOverview, DailyPoint } from '@/api/types';
import { IconTile } from '@/components/common/IconTile';
import { Sparkline } from '@/components/common/Sparkline';
import { StatusDot } from '@/components/common/StatusChip';
import { brand } from '@/theme/theme';
import { formatCompact, formatMoney, formatNumber } from '@/utils/format';

interface MetricDef {
  key: string;
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
  trendPct?: number | null;
  /** When true a rising number is bad (e.g. failures). */
  invertTrend?: boolean;
  series?: DailyPoint[];
  footer?: ReactNode;
  progress?: { value: number; label: string };
  live?: boolean;
}

function Trend({ pct, invert }: { pct: number; invert?: boolean }) {
  const theme = useTheme();
  const up = pct >= 0;
  const good = invert ? !up : up;
  const color = pct === 0 ? theme.palette.text.secondary : good ? theme.palette.success.main : theme.palette.error.main;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color }} title="Last 7 days vs previous 7 days">
      <Icon size={16} strokeWidth={2.4} />
      <Typography variant="caption" sx={{ fontWeight: 700 }}>
        {up ? '+' : ''}
        {pct}%
      </Typography>
    </Stack>
  );
}

function MetricCard({ m, index }: { m: MetricDef; index: number }) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const dark = theme.palette.mode === 'dark';
  return (
    <Card
      component={motion.div}
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, delay: index * 0.05, ease: 'easeOut' }}
      whileHover={reduce ? undefined : { y: -6 }}
      sx={{
        p: 2.5,
        height: '100%',
        cursor: 'default',
        background: dark
          ? `linear-gradient(135deg, ${alpha(m.color, 0.22)} 0%, ${alpha(m.color, 0.08)} 100%)`
          : `linear-gradient(135deg, ${alpha(m.color, 0.16)} 0%, ${alpha(m.color, 0.05)} 100%)`,
        boxShadow: 'none',
        border: `1px solid ${alpha(m.color, 0.16)}`,
        transition: 'box-shadow .25s',
        '&:hover': { boxShadow: `0 18px 36px -18px ${alpha(m.color, 0.7)}` },
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          opacity: 0.5,
          backgroundImage: `radial-gradient(${alpha(m.color, 0.18)} 1px, transparent 1px)`,
          backgroundSize: '14px 14px',
          maskImage: 'linear-gradient(200deg, #000 0%, transparent 55%)',
          pointerEvents: 'none',
        },
      }}
    >
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <IconTile icon={m.icon} color={m.color} />
        {m.trendPct !== undefined && m.trendPct !== null ? <Trend pct={m.trendPct} invert={m.invertTrend} /> : m.live ? <StatusDot color={m.color} pulse size={9} /> : null}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end', justifyContent: 'space-between', mt: 2.5, position: 'relative' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: dark ? alpha('#FFFFFF', 0.85) : alpha(theme.palette.text.primary, 0.8) }} noWrap>
            {m.label}
          </Typography>
          <Typography variant="h3" component="p" sx={{ fontSize: { xs: '1.6rem', md: '1.85rem' }, mt: 0.5 }} title={formatNumber(m.value)}>
            {formatCompact(m.value)}
          </Typography>
        </Box>
        {m.series && m.series.some((p) => p.value > 0) && <Sparkline data={m.series} color={m.color} />}
      </Stack>
      {m.progress && (
        <Box sx={{ mt: 1.5, position: 'relative' }}>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, m.progress.value)}
            sx={{ height: 6, borderRadius: 3, bgcolor: alpha(m.color, 0.15), '& .MuiLinearProgress-bar': { bgcolor: m.color, borderRadius: 3 } }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {m.progress.label}
          </Typography>
        </Box>
      )}
      {m.footer && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: m.progress ? 0 : 1, position: 'relative' }} noWrap>
          {m.footer}
        </Typography>
      )}
    </Card>
  );
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function MetricCards({ data, loading }: { data?: DashboardOverview; loading: boolean }) {
  const grid = { display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' } } as const;

  if (loading || !data) {
    return (
      <Box sx={grid}>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} variant="rounded" height={168} sx={{ borderRadius: 5 }} />
        ))}
      </Box>
    );
  }

  const { jobs } = data;
  const primaryCurrency = data.expenses.byCurrency[0];
  const metrics: MetricDef[] = [
    {
      key: 'apps',
      label: 'Total Applications',
      value: data.applications.total,
      icon: AppWindow,
      color: brand.indigo.main,
      progress: { value: pct(data.applications.active, data.applications.total), label: `${data.applications.active} active integrations` },
    },
    {
      key: 'companies',
      label: 'Total Companies',
      value: data.companies.total,
      icon: Building2,
      color: brand.purple.main,
      progress: { value: pct(data.companies.active, data.companies.total), label: `${data.companies.active} active companies` },
    },
    {
      key: 'expenses',
      label: 'Total Expenses Received',
      value: data.expenses.total,
      icon: ReceiptText,
      color: brand.orange.main,
      trendPct: data.expenses.trendPct,
      series: data.expenses.daily,
      footer: primaryCurrency ? `${formatMoney(primaryCurrency.amount, primaryCurrency.currency, { compact: true })} total value` : 'No expenses yet',
    },
    {
      key: 'pending',
      label: 'Pending Jobs',
      value: jobs.pending,
      icon: Hourglass,
      color: brand.amber.main,
      progress: { value: pct(jobs.pending, jobs.total), label: `${pct(jobs.pending, jobs.total)}% of ${formatNumber(jobs.total)} jobs` },
    },
    {
      key: 'processing',
      label: 'Processing Jobs',
      value: jobs.processing,
      icon: Cog,
      color: brand.sky.main,
      live: jobs.processing > 0,
      footer: jobs.processing > 0 ? 'Bridge Agent is posting now' : 'Nothing in flight',
    },
    {
      key: 'posted',
      label: 'Successfully Posted',
      value: jobs.posted,
      icon: CircleCheckBig,
      color: brand.emerald.main,
      trendPct: jobs.postedTrendPct,
      series: jobs.postedDaily,
      footer: 'Verified by Tally read-back',
    },
    {
      key: 'failed',
      label: 'Failed Jobs',
      value: jobs.failed,
      icon: TriangleAlert,
      color: brand.coral.main,
      trendPct: jobs.failedTrendPct,
      invertTrend: true,
      series: jobs.failedDaily,
      footer: jobs.needsAttention ? `+${formatNumber(jobs.needsAttention)} blocked by validation` : 'Failed attempts, last 14 days',
    },
    {
      key: 'approval',
      label: 'Pending Finance Approval',
      value: jobs.awaitingApproval,
      icon: ClipboardClock,
      color: '#EC4899',
      progress: { value: pct(jobs.awaitingApproval, jobs.total), label: `${formatNumber(data.masterRequestsPending)} master requests awaiting review` },
    },
  ];

  return (
    <Box sx={grid}>
      {metrics.map((m, i) => (
        <MetricCard key={m.key} m={m} index={i} />
      ))}
    </Box>
  );
}
