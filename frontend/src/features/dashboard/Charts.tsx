import { Box, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardAnalytics } from '@/api/types';
import { JOB_STATUS_META } from '@/config/status';
import { brand, chartColors } from '@/theme/theme';
import { formatCompact, formatMoney, formatNumber, shortDay, shortMonth } from '@/utils/format';
import { ChartTooltip } from './ChartCard';

function useAxis() {
  const theme = useTheme();
  return {
    tick: { fill: theme.palette.text.secondary, fontSize: 12 },
    grid: alpha(theme.palette.text.secondary, 0.14),
  };
}

export function DailyTransactionsChart({ data }: { data: DashboardAnalytics['dailyTransactions'] }) {
  const axis = useAxis();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="daily-count" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={brand.indigo.main} stopOpacity={0.35} />
            <stop offset="100%" stopColor={brand.indigo.main} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke={axis.grid} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDay} tick={axis.tick} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis yAxisId="count" tick={axis.tick} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis yAxisId="amount" orientation="right" tick={axis.tick} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompact(v)} width={56} />
        <Tooltip
          content={<ChartTooltip labelFormatter={shortDay} valueFormatter={(v, e) => (e.dataKey === 'amount' ? formatMoney(v, 'INR', { compact: true }) : formatNumber(v))} />}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
        <Area yAxisId="count" type="monotone" dataKey="count" name="Transactions" stroke={brand.indigo.main} strokeWidth={3} fill="url(#daily-count)" />
        <Line yAxisId="amount" type="monotone" dataKey="amount" name="Amount" stroke={brand.orange.main} strokeWidth={2.5} dot={false} strokeDasharray="6 4" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function QueueDistributionChart({ data }: { data: DashboardAnalytics['queueDistribution'] }) {
  const theme = useTheme();
  const total = data.reduce((a, b) => a + b.count, 0);
  const rows = data.map((d) => ({ ...d, name: JOB_STATUS_META[d.status]?.label ?? d.status, color: JOB_STATUS_META[d.status]?.color ?? '#94A3B8' }));
  return (
    <Stack direction={{ xs: 'column', sm: 'row', md: 'column', xl: 'row' }} spacing={2} sx={{ alignItems: 'center', height: '100%' }}>
      <Box sx={{ position: 'relative', width: 200, height: 200, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="count" nameKey="name" innerRadius={64} outerRadius={94} paddingAngle={2} cornerRadius={6} stroke="none">
              {rows.map((r) => (
                <Cell key={r.status} fill={r.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip valueFormatter={(v) => `${formatNumber(v)} (${Math.round((v / total) * 100)}%)`} />} />
          </PieChart>
        </ResponsiveContainer>
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
          <Box>
            <Typography variant="h4">{formatCompact(total)}</Typography>
            <Typography variant="caption" color="text.secondary">
              total jobs
            </Typography>
          </Box>
        </Box>
      </Box>
      <Box sx={{ flex: 1, width: '100%', maxHeight: 220, overflowY: 'auto', pr: 0.5 }}>
        {rows.map((r) => (
          <Stack key={r.status} direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: 1, bgcolor: r.color, flexShrink: 0 }} />
            <Typography variant="body2" sx={{ flex: 1 }} noWrap>
              {r.name}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
              {formatNumber(r.count)}
            </Typography>
          </Stack>
        ))}
      </Box>
    </Stack>
  );
}

export function CompanyExpensesChart({ data }: { data: DashboardAnalytics['expensesByCompany'] }) {
  const axis = useAxis();
  const rows = data.slice(0, 8);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap={14}>
        <defs>
          <linearGradient id="company-bar" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={brand.indigo.main} />
            <stop offset="100%" stopColor={brand.purple.light} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke={axis.grid} horizontal={false} />
        <XAxis type="number" tick={axis.tick} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompact(v)} />
        <YAxis type="category" dataKey="name" tick={axis.tick} axisLine={false} tickLine={false} width={150} tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)} />
        <Tooltip
          cursor={{ fill: alpha(brand.indigo.main, 0.06) }}
          content={<ChartTooltip valueFormatter={(v, e) => (e.dataKey === 'amount' ? formatMoney(v, String(e.payload?.currency ?? 'INR')) : formatNumber(v))} />}
        />
        <Bar dataKey="amount" name="Amount" fill="url(#company-bar)" radius={[0, 8, 8, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ApplicationExpensesChart({ data }: { data: DashboardAnalytics['expensesByApplication'] }) {
  const total = data.reduce((a, b) => a + b.amount, 0);
  const rows = data.map((d, i) => ({ ...d, color: d.color || chartColors[i % chartColors.length] }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={rows}
          dataKey="amount"
          nameKey="name"
          outerRadius="82%"
          stroke="#FFFFFF"
          strokeWidth={3}
          labelLine={false}
          label={({ percent, x, y }: { percent?: number; x?: number; y?: number }) =>
            (percent ?? 0) > 0.05 ? (
              <text x={x} y={y} fill="#FFFFFF" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700}>
                {`${((percent ?? 0) * 100).toFixed(1)}%`}
              </text>
            ) : null
          }
        >
          {rows.map((r) => (
            <Cell key={r.uuid} fill={r.color} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip valueFormatter={(v) => `${formatMoney(v, 'INR', { compact: true })} · ${total ? Math.round((v / total) * 100) : 0}%`} />} />
        <Legend iconType="circle" layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: 13 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function PostingOutcomeChart({ data }: { data: DashboardAnalytics['postingOutcome']['daily'] }) {
  const axis = useAxis();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid strokeDasharray="4 4" stroke={axis.grid} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDay} tick={axis.tick} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tick={axis.tick} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip cursor={{ fill: alpha(brand.emerald.main, 0.06) }} content={<ChartTooltip labelFormatter={shortDay} valueFormatter={(v) => formatNumber(v)} />} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
        <Bar dataKey="posted" name="Posted" stackId="o" fill={brand.emerald.main} radius={[0, 0, 4, 4]} />
        <Bar dataKey="failed" name="Failed attempts" stackId="o" fill={brand.coral.main} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyTrendsChart({ data }: { data: DashboardAnalytics['monthlyTrends'] }) {
  const axis = useAxis();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 8, left: -8, bottom: 0 }} barGap={6}>
        <CartesianGrid strokeDasharray="4 4" stroke={axis.grid} vertical={false} />
        <XAxis dataKey="month" tickFormatter={shortMonth} tick={axis.tick} axisLine={false} tickLine={false} />
        <YAxis yAxisId="count" tick={axis.tick} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis yAxisId="amount" orientation="right" tick={axis.tick} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompact(v)} width={56} />
        <Tooltip
          cursor={{ fill: alpha(brand.indigo.main, 0.05) }}
          content={<ChartTooltip labelFormatter={shortMonth} valueFormatter={(v, e) => (e.dataKey === 'postedAmount' ? formatMoney(v, 'INR', { compact: true }) : formatNumber(v))} />}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
        <Bar yAxisId="count" dataKey="expenses" name="Expenses received" fill={brand.amber.main} radius={[6, 6, 0, 0]} maxBarSize={18} />
        <Bar yAxisId="count" dataKey="posted" name="Vouchers posted" fill={brand.emerald.dark} radius={[6, 6, 0, 0]} maxBarSize={18} />
        <Line yAxisId="amount" type="monotone" dataKey="postedAmount" name="Posted value" stroke={brand.purple.main} strokeWidth={3} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}