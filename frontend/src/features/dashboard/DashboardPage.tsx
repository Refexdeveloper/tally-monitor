import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toApiError } from '@/api/client';
import { dashboardApi } from '@/api/endpoints';
import { formatMoney, formatNumber, timeAgo } from '@/utils/format';
import { ChartCard } from './ChartCard';
import { ApplicationExpensesChart, CompanyExpensesChart, DailyTransactionsChart, MonthlyTrendsChart, PostingOutcomeChart, QueueDistributionChart } from './Charts';
import { HealthWidget } from './HealthWidget';
import { MetricCards } from './MetricCards';
import { ActivityTabs, CompanyActivity, RecentApplications } from './RecentActivity';
import { WelcomeBanner } from './WelcomeBanner';

const RANGES = [7, 30, 90] as const;

const row = (columns: Record<string, string>) => ({ display: 'grid', gap: 3, gridTemplateColumns: columns }) as const;

export function DashboardPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);

  const overview = useQuery({ queryKey: ['dashboard', 'overview'], queryFn: dashboardApi.overview, refetchInterval: 60_000 });
  const analytics = useQuery({ queryKey: ['dashboard', 'analytics', days], queryFn: () => dashboardApi.analytics(days), placeholderData: (prev) => prev });
  const activity = useQuery({ queryKey: ['dashboard', 'activity'], queryFn: dashboardApi.activity, refetchInterval: 60_000 });
  const health = useQuery({ queryKey: ['dashboard', 'health'], queryFn: dashboardApi.health, refetchInterval: 30_000 });

  const a = analytics.data;
  const analyticsError = analytics.error ? toApiError(analytics.error).message : null;
  const chartProps = { loading: analytics.isLoading, error: analyticsError, onRetry: () => void analytics.refetch() };
  const successRate = a && a.postingOutcome.totals.posted + a.postingOutcome.totals.failed > 0
    ? Math.round((a.postingOutcome.totals.posted / (a.postingOutcome.totals.posted + a.postingOutcome.totals.failed)) * 1000) / 10
    : null;
  const totalInRange = a?.dailyTransactions.reduce((s, d) => s + d.count, 0) ?? 0;
  const amountInRange = a?.dailyTransactions.reduce((s, d) => s + d.amount, 0) ?? 0;

  return (
    <Stack spacing={3}>
      <Box sx={row({ xs: '1fr', lg: '1.7fr 1fr' })}>
        <WelcomeBanner overview={overview.data} />
        <HealthWidget
          data={health.data}
          loading={health.isLoading}
          error={health.error ? toApiError(health.error).message : null}
          onRefresh={() => void health.refetch()}
          refreshing={health.isFetching}
        />
      </Box>

      {overview.error ? (
        <Typography color="error" role="alert">
          {toApiError(overview.error).message}
        </Typography>
      ) : (
        <MetricCards data={overview.data} loading={overview.isLoading} />
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', pt: 1 }}>
        <Box>
          <Typography variant="h4">Analytics</Typography>
          <Typography variant="body2" color="text.secondary">
            {a ? `${a.range.from} to ${a.range.to}` : 'Loading range...'}
            {overview.data && ` · updated ${timeAgo(overview.data.generatedAt)}`}
          </Typography>
        </Box>
        <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v)} aria-label="Date range">
          {RANGES.map((r) => (
            <ToggleButton key={r} value={r} sx={{ px: 2, fontWeight: 600 }}>
              {r} days
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <Box sx={row({ xs: '1fr', md: '1.8fr 1fr' })}>
        <ChartCard
          title="Daily expense transactions"
          subtitle={a ? `${formatNumber(totalInRange)} transactions worth ${formatMoney(amountInRange, 'INR', { compact: true })}` : undefined}
          empty={a && totalInRange === 0}
          {...chartProps}
        >
          {a && <DailyTransactionsChart data={a.dailyTransactions} />}
        </ChartCard>
        <ChartCard title="Queue status distribution" subtitle="Current state of every job" empty={a && a.queueDistribution.length === 0} delay={0.05} {...chartProps}>
          {a && <QueueDistributionChart data={a.queueDistribution} />}
        </ChartCard>
      </Box>

      <Box sx={row({ xs: '1fr', md: '1.4fr 1fr' })}>
        <ChartCard title="Expenses by company" subtitle={`Value received in the last ${days} days`} empty={a && a.expensesByCompany.every((c) => c.amount === 0)} {...chartProps}>
          {a && <CompanyExpensesChart data={a.expensesByCompany} />}
        </ChartCard>
        <ChartCard title="Expenses by application" subtitle="Share of value by Kissflow source" empty={a && a.expensesByApplication.length === 0} delay={0.05} {...chartProps}>
          {a && <ApplicationExpensesChart data={a.expensesByApplication} />}
        </ChartCard>
      </Box>

      <Box sx={row({ xs: '1fr', md: '1fr 1.4fr' })}>
        <ChartCard
          title="Posting success vs failure"
          subtitle={successRate !== null ? `${successRate}% success rate · ${formatNumber(a!.postingOutcome.totals.posted)} verified` : 'Verified postings vs failed attempts'}
          empty={a && a.postingOutcome.totals.posted + a.postingOutcome.totals.failed === 0}
          {...chartProps}
        >
          {a && <PostingOutcomeChart data={a.postingOutcome.daily} />}
        </ChartCard>
        <ChartCard title="Monthly posting trends" subtitle="Last 12 months" empty={a && a.monthlyTrends.every((m) => m.expenses === 0 && m.posted === 0)} delay={0.05} {...chartProps}>
          {a && <MonthlyTrendsChart data={a.monthlyTrends} />}
        </ChartCard>
      </Box>

      <ActivityTabs data={activity.data} loading={activity.isLoading} error={activity.error ? toApiError(activity.error).message : null} onRetry={() => void activity.refetch()} />

      <Box sx={row({ xs: '1fr', md: '1fr 1fr' })}>
        <RecentApplications data={activity.data} loading={activity.isLoading} error={activity.error ? toApiError(activity.error).message : null} onRetry={() => void activity.refetch()} />
        <CompanyActivity data={activity.data} loading={activity.isLoading} error={activity.error ? toApiError(activity.error).message : null} onRetry={() => void activity.refetch()} />
      </Box>
    </Stack>
  );
}
