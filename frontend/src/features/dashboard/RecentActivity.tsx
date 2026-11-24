import { Avatar, Box, Card, Chip, Skeleton, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { AnimatePresence, motion } from 'framer-motion';
import { AppWindow, Bot, Cog, Globe, User } from 'lucide-react';
import { useState } from 'react';
import type { DashboardActivity } from '@/api/types';
import { JobStatusChip } from '@/components/common/StatusChip';
import { EmptyState, ErrorState } from '@/components/common/States';
import { chartColors } from '@/theme/theme';
import { formatDate, formatMoney, humanize, initials, timeAgo } from '@/utils/format';

interface Props {
  data?: DashboardActivity;
  loading: boolean;
  error?: string | null;
  onRetry: () => void;
}

function LoadingRows() {
  return (
    <Stack spacing={1.25} sx={{ p: 2 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={44} />
      ))}
    </Stack>
  );
}

export function ActivityTabs({ data, loading, error, onRetry }: Props) {
  const [tab, setTab] = useState<'expenses' | 'vouchers' | 'failed'>('expenses');

  const body = () => {
    if (loading) return <LoadingRows />;
    if (error || !data) return <ErrorState message={error ?? 'Unavailable'} onRetry={onRetry} compact />;
    if (tab === 'expenses') {
      if (!data.latestExpenses.length) return <EmptyState compact title="No expenses received yet" description="Approved Kissflow expenses will show up here the moment they arrive." />;
      return (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Request</TableCell>
                <TableCell>Company</TableCell>
                <TableCell>Category</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Received</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.latestExpenses.map((e) => (
                <TableRow key={e.uuid} hover>
                  <TableCell>
                    <Typography variant="subtitle2">{e.requestNumber ?? '-'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {e.party ?? '-'} · {e.application}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 180 }}>
                    <Typography variant="body2" noWrap>
                      {e.company}
                    </Typography>
                  </TableCell>
                  <TableCell>{e.category ?? '-'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {formatMoney(e.amount, e.currency)}
                  </TableCell>
                  <TableCell>
                    <JobStatusChip status={e.status} />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{timeAgo(e.receivedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      );
    }
    if (tab === 'vouchers') {
      if (!data.latestVouchers.length) return <EmptyState compact title="No vouchers posted yet" description="Vouchers appear here only after Tally confirms them on read-back." />;
      return (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Voucher</TableCell>
                <TableCell>Company</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Verified</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.latestVouchers.map((v) => (
                <TableRow key={v.uuid} hover>
                  <TableCell>
                    <Typography variant="subtitle2">
                      {v.voucherType} #{v.voucherNumber ?? '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>{v.company}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(v.voucherDate)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {formatMoney(v.amount, v.currency)}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{timeAgo(v.verifiedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      );
    }
    if (!data.failedJobs.length) return <EmptyState compact title="No failed jobs" description="Great news: nothing has failed or needs reconciliation." />;
    return (
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Request</TableCell>
              <TableCell>Company</TableCell>
              <TableCell>Error</TableCell>
              <TableCell align="right">Attempts</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Updated</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.failedJobs.map((j) => (
              <TableRow key={j.uuid} hover>
                <TableCell>
                  <Typography variant="subtitle2">{j.requestNumber ?? '-'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {j.application} · {formatMoney(j.amount, j.currency)}
                  </Typography>
                </TableCell>
                <TableCell>{j.company}</TableCell>
                <TableCell sx={{ maxWidth: 260 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {j.errorCode ?? '-'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap component="div" title={j.errorMessage ?? ''}>
                    {j.errorMessage}
                  </Typography>
                </TableCell>
                <TableCell align="right">{j.attempts}</TableCell>
                <TableCell>
                  <JobStatusChip status={j.status} />
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{timeAgo(j.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  return (
    <Card component={motion.div} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} sx={{ height: '100%' }}>
      <Box sx={{ px: 3, pt: 2.5 }}>
        <Typography variant="h6">Recent activity</Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 1 }} variant="scrollable" allowScrollButtonsMobile>
          <Tab value="expenses" label={`Latest expenses${data ? ` (${data.latestExpenses.length})` : ''}`} />
          <Tab value="vouchers" label="Posted vouchers" />
          <Tab
            value="failed"
            label={
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <span>Failed jobs</span>
                {data && data.failedJobs.length > 0 && <Chip size="small" color="error" label={data.failedJobs.length} sx={{ height: 20 }} />}
              </Stack>
            }
          />
        </Tabs>
      </Box>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <Box sx={{ px: 1, pb: 2 }}>{body()}</Box>
        </motion.div>
      </AnimatePresence>
    </Card>
  );
}

export function RecentApplications({ data, loading, error, onRetry }: Props) {
  const theme = useTheme();
  return (
    <Card component={motion.div} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} sx={{ p: 3, height: '100%' }}>
      <Typography variant="h6" sx={{ mb: 1.5 }}>
        Recently added applications
      </Typography>
      {loading ? (
        <LoadingRows />
      ) : error || !data ? (
        <ErrorState message={error ?? 'Unavailable'} onRetry={onRetry} compact />
      ) : !data.recentApplications.length ? (
        <EmptyState compact title="No applications yet" description="Register your first Kissflow application to start the flow." />
      ) : (
        <Stack spacing={1.5}>
          {data.recentApplications.map((a, i) => {
            const color = a.color ?? chartColors[i % chartColors.length]!;
            return (
              <Stack key={a.uuid} direction="row" spacing={1.5} component={motion.div} whileHover={{ x: 4 }} sx={{ alignItems: 'center' }}>
                <Avatar variant="rounded" sx={{ bgcolor: alpha(color, 0.16), color, borderRadius: 2.5, width: 42, height: 42 }}>
                  <AppWindow size={20} />
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" noWrap>
                    {a.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {a.code} · {a.companies} {a.companies === 1 ? 'company' : 'companies'} · {timeAgo(a.createdAt)}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label={humanize(a.status)}
                  sx={{
                    bgcolor: alpha(a.status === 'ACTIVE' ? theme.palette.success.main : theme.palette.text.secondary, 0.14),
                    color: a.status === 'ACTIVE' ? 'success.dark' : 'text.secondary',
                  }}
                />
              </Stack>
            );
          })}
        </Stack>
      )}
    </Card>
  );
}

const ACTOR_ICON = { USER: User, SYSTEM: Cog, AGENT: Bot, WEBHOOK: Globe } as const;

export function CompanyActivity({ data, loading, error, onRetry }: Props) {
  const theme = useTheme();
  return (
    <Card component={motion.div} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} sx={{ p: 3, height: '100%' }}>
      <Typography variant="h6" sx={{ mb: 1.5 }}>
        Recent company activity
      </Typography>
      {loading ? (
        <LoadingRows />
      ) : error || !data ? (
        <ErrorState message={error ?? 'Unavailable'} onRetry={onRetry} compact />
      ) : !data.companyActivity.length ? (
        <EmptyState compact title="No activity yet" description="Audit events for your companies will appear here." />
      ) : (
        <Box sx={{ position: 'relative', pl: 1 }}>
          {data.companyActivity.map((a, i) => {
            const Icon = ACTOR_ICON[a.actorType];
            const color = chartColors[i % chartColors.length]!;
            return (
              <Stack key={a.uuid} direction="row" spacing={1.75} sx={{ position: 'relative', pb: i === data.companyActivity.length - 1 ? 0 : 2 }}>
                {i < data.companyActivity.length - 1 && <Box sx={{ position: 'absolute', left: 13, top: 30, bottom: 0, borderLeft: `2px dashed ${theme.palette.divider}` }} />}
                <Avatar sx={{ width: 28, height: 28, bgcolor: alpha(color, 0.16), color, fontSize: 12 }}>
                  {a.user ? initials(a.user) : <Icon size={14} />}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ lineHeight: 1.3 }}>
                    {humanize(a.action)}
                    {a.newStatus ? ` → ${humanize(a.newStatus)}` : ''}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="div" noWrap>
                    {a.company}
                    {a.reference ? ` · ${a.reference}` : ''} · {timeAgo(a.createdAt)}
                  </Typography>
                </Box>
              </Stack>
            );
          })}
        </Box>
      )}
    </Card>
  );
}
