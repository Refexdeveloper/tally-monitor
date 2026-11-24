import { Box, Chip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { motion, useReducedMotion } from 'framer-motion';
import type { ComponentStatus, JobStatus } from '@/api/types';
import { COMPONENT_STATUS_META, JOB_STATUS_META } from '@/config/status';

export function JobStatusChip({ status, size = 'small' }: { status: JobStatus; size?: 'small' | 'medium' }) {
  const meta = JOB_STATUS_META[status] ?? { label: status, color: '#94A3B8' };
  return (
    <Chip
      size={size}
      label={meta.label}
      icon={<StatusDot color={meta.color} pulse={status === 'PROCESSING'} size={7} />}
      sx={{ bgcolor: alpha(meta.color, 0.14), color: meta.color, '& .MuiChip-icon': { ml: 1, mr: -0.25 } }}
    />
  );
}

export function StatusDot({ color, pulse = false, size = 10 }: { color: string; pulse?: boolean; size?: number }) {
  const reduce = useReducedMotion();
  return (
    <Box component="span" sx={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      {pulse && !reduce && (
        <motion.span
          style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color }}
          animate={{ scale: [1, 2.4], opacity: [0.55, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <Box component="span" sx={{ position: 'relative', width: size, height: size, borderRadius: '50%', bgcolor: color }} />
    </Box>
  );
}

export function ComponentStatusBadge({ status }: { status: ComponentStatus }) {
  const meta = COMPONENT_STATUS_META[status];
  return (
    <Chip
      size="small"
      label={meta.label}
      icon={<StatusDot color={meta.color} pulse={status === 'UP'} size={7} />}
      sx={{ bgcolor: alpha(meta.color, 0.14), color: meta.color, '& .MuiChip-icon': { ml: 1, mr: -0.25 } }}
    />
  );
}
