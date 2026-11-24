import { Chip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { Agent, Application, CompanyIntegrationStatus, TallyServer } from '@/api/adminTypes';
import { StatusDot } from '@/components/common/StatusChip';
import { brand } from '@/theme/theme';

function Pill({ label, color, pulse = false }: { label: string; color: string; pulse?: boolean }) {
  return (
    <Chip
      size="small"
      label={label}
      icon={<StatusDot color={color} pulse={pulse} size={7} />}
      sx={{ bgcolor: alpha(color, 0.14), color, '& .MuiChip-icon': { ml: 1, mr: -0.25 } }}
    />
  );
}

const GREY = '#94A3B8';

export function CompanyStatusBadge({ status }: { status: CompanyIntegrationStatus }) {
  const map: Record<CompanyIntegrationStatus, [string, string, boolean?]> = {
    CONNECTED: ['Connected', brand.emerald.main, true],
    AGENT_OFFLINE: ['Agent offline', brand.coral.main],
    NO_AGENT: ['No agent', brand.amber.main],
    NOT_CONFIGURED: ['Not configured', GREY],
    INACTIVE: ['Inactive', GREY],
  };
  const [label, color, pulse] = map[status];
  return <Pill label={label} color={color} pulse={pulse} />;
}

export function ApplicationStatusBadge({ status }: { status: Application['status'] }) {
  const map = { ACTIVE: ['Active', brand.emerald.main], DRAFT: ['Draft', brand.amber.main], INACTIVE: ['Inactive', GREY] } as const;
  const [label, color] = map[status];
  return <Pill label={label} color={color} pulse={status === 'ACTIVE'} />;
}

export function ServerStatusBadge({ status }: { status: TallyServer['effectiveStatus'] }) {
  const map = { ONLINE: ['Online', brand.emerald.main], OFFLINE: ['Offline', brand.coral.main], ERROR: ['Error', brand.coral.dark], UNKNOWN: ['Unknown', GREY], INACTIVE: ['Inactive', GREY] } as const;
  const [label, color] = map[status];
  return <Pill label={label} color={color} pulse={status === 'ONLINE'} />;
}

export function AgentStatusBadge({ status }: { status: Agent['status'] }) {
  const map = { ONLINE: ['Online', brand.emerald.main], OFFLINE: ['Offline', brand.coral.main], PENDING: ['Awaiting first connection', brand.amber.main], REVOKED: ['Revoked', GREY] } as const;
  const [label, color] = map[status];
  return <Pill label={label} color={color} pulse={status === 'ONLINE'} />;
}

export function ActiveBadge({ active, activeLabel = 'Active', inactiveLabel = 'Inactive' }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return <Pill label={active ? activeLabel : inactiveLabel} color={active ? brand.emerald.main : GREY} />;
}
