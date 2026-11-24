import { Box, Card, IconButton, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import { Bot, CloudCog, Database, History, RefreshCw, Server, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ComponentStatus, IntegrationHealth } from '@/api/types';
import { ComponentStatusBadge, StatusDot } from '@/components/common/StatusChip';
import { ErrorState } from '@/components/common/States';
import { COMPONENT_STATUS_META } from '@/config/status';
import { timeAgo } from '@/utils/format';

function Row({ icon: Icon, label, status, detail }: { icon: LucideIcon; label: string; status?: ComponentStatus; detail: string }) {
  const theme = useTheme();
  const color = status ? COMPONENT_STATUS_META[status].color : theme.palette.text.secondary;
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1.1 }}>
      <Box sx={{ width: 38, height: 38, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: alpha(color, 0.14), color, flexShrink: 0 }}>
        <Icon size={19} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2">{label}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div" title={detail}>
          {detail}
        </Typography>
      </Box>
      {status && <ComponentStatusBadge status={status} />}
    </Stack>
  );
}

function uptime(seconds: number) {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} d`;
}

export function HealthWidget({ data, loading, error, onRefresh, refreshing }: { data?: IntegrationHealth; loading: boolean; error?: string | null; onRefresh: () => void; refreshing: boolean }) {
  const theme = useTheme();
  const overall = data?.overall;

  return (
    <Card component={motion.div} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} sx={{ p: 3, height: '100%' }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          {overall && <StatusDot color={COMPONENT_STATUS_META[overall].color} pulse={overall === 'UP'} />}
          <Typography variant="h6">Integration health</Typography>
        </Stack>
        <Tooltip title={data ? `Checked ${timeAgo(data.checkedAt)}` : 'Refresh'}>
          <IconButton size="small" onClick={onRefresh} aria-label="Refresh health" disabled={refreshing}>
            <motion.span style={{ display: 'grid' }} animate={refreshing ? { rotate: 360 } : { rotate: 0 }} transition={refreshing ? { repeat: Infinity, duration: 1, ease: 'linear' } : { duration: 0 }}>
              <RefreshCw size={17} />
            </motion.span>
          </IconButton>
        </Tooltip>
      </Stack>

      {loading ? (
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} variant="rounded" height={40} />
          ))}
        </Stack>
      ) : error || !data ? (
        <ErrorState message={error ?? 'Health information unavailable'} onRetry={onRefresh} compact />
      ) : (
        <Box sx={{ '& > *:not(:last-child)': { borderBottom: `1px dashed ${theme.palette.divider}` } }}>
          <Row icon={CloudCog} label="Cloud API" status={data.api.status} detail={`v${data.api.version} · ${data.api.environment} · up ${uptime(data.api.uptimeSeconds)}`} />
          <Row
            icon={Database}
            label="MySQL database"
            status={data.database.status}
            detail={data.database.status === 'UP' ? `Responding in ${data.database.latencyMs} ms` : (data.database.error ?? 'Not reachable')}
          />
          <Row
            icon={Bot}
            label="Tally Bridge Agent"
            status={data.agents.status}
            detail={
              data.agents.items.length === 0
                ? 'No agent registered yet'
                : data.agents.items.map((a) => `${a.name}: ${a.lastHeartbeatAt ? `heartbeat ${timeAgo(a.lastHeartbeatAt)}` : 'never connected'}`).join(' · ')
            }
          />
          <Row
            icon={Server}
            label="TallyPrime"
            status={data.tally.status}
            detail={
              data.tally.items.length === 0
                ? 'No Tally server configured'
                : data.tally.items
                    .map((s) => `${s.name}${s.release ? ` (${s.release})` : ''}: ${s.lastHealthCheckAt ? `checked ${timeAgo(s.lastHealthCheckAt)}` : 'awaiting first agent check'}`)
                    .join(' · ')
            }
          />
          <Row icon={History} label="Last successful sync" detail={data.lastSuccessfulSync ? `Voucher verified ${timeAgo(data.lastSuccessfulSync)}` : 'No verified postings yet'} />
          <Row
            icon={TriangleAlert}
            label="Last failed job"
            detail={data.lastFailedJob ? `${data.lastFailedJob.company} · ${data.lastFailedJob.errorCode ?? 'ERROR'} · ${timeAgo(data.lastFailedJob.at)}` : 'No failed jobs'}
          />
        </Box>
      )}
    </Card>
  );
}
