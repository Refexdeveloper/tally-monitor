import { Box, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import type { JobStatus } from '@/api/types';
import { JOB_STATUS_META } from '@/config/status';

const STAGES = ['Received', 'Validated', 'Awaiting Approval', 'Queued', 'Processing', 'Posted'] as const;

/** Maps a processing status onto the six-stage journey; alternate statuses mark the stage where they occur. */
function position(status: JobStatus): { index: number; alternate: boolean } {
  switch (status) {
    case 'RECEIVED':
      return { index: 0, alternate: false };
    case 'VALIDATING':
      return { index: 1, alternate: false };
    case 'VALIDATION_FAILED':
    case 'MAPPING_REQUIRED':
    case 'MASTER_CREATION_REQUIRED':
      return { index: 1, alternate: true };
    case 'AWAITING_APPROVAL':
      return { index: 2, alternate: false };
    case 'READY_TO_POST':
    case 'RETRY_PENDING':
      return { index: 3, alternate: status === 'RETRY_PENDING' };
    case 'PROCESSING':
      return { index: 4, alternate: false };
    case 'FAILED':
    case 'RECONCILIATION_REQUIRED':
      return { index: 4, alternate: true };
    case 'POSTED':
      return { index: 5, alternate: false };
    case 'CANCELLED':
      return { index: 2, alternate: true };
  }
}

export function ExpenseTimeline({ status }: { status: JobStatus }) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const { index, alternate } = position(status);
  const done = status === 'POSTED';
  const meta = JOB_STATUS_META[status];

  return (
    <Box sx={{ overflowX: 'auto', py: 1 }}>
      <Stack direction="row" sx={{ alignItems: 'flex-start', minWidth: 640 }}>
        {STAGES.map((label, i) => {
          const complete = i < index || (done && i === index);
          const current = i === index && !done;
          const color = current ? (alternate ? meta.color : theme.palette.primary.main) : complete ? theme.palette.success.main : theme.palette.text.disabled;
          return (
            <Box key={label} sx={{ flex: 1, position: 'relative', textAlign: 'center' }}>
              {i > 0 && (
                <Box sx={{ position: 'absolute', top: 18, right: '50%', width: '100%', height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.text.disabled, 0.2), overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: reduce ? (i <= index ? '100%' : '0%') : '0%' }}
                    animate={{ width: i <= index ? '100%' : '0%' }}
                    transition={{ duration: 0.5, delay: i * 0.12 }}
                    style={{ height: '100%', background: i === index && alternate ? meta.color : theme.palette.success.main }}
                  />
                </Box>
              )}
              <Box
                component={motion.div}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.12 }}
                sx={{
                  position: 'relative',
                  mx: 'auto',
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: complete ? color : current ? alpha(color, 0.16) : 'background.paper',
                  color: complete ? '#fff' : color,
                  border: `3px solid ${color}`,
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {complete ? <Check size={18} strokeWidth={3} /> : current && alternate && ['FAILED', 'CANCELLED', 'VALIDATION_FAILED'].includes(status) ? <X size={18} strokeWidth={3} /> : i + 1}
                {current && !reduce && (
                  <motion.span
                    style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: `2px solid ${color}` }}
                    animate={{ scale: [1, 1.25], opacity: [0.7, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                  />
                )}
              </Box>
              <Typography variant="caption" sx={{ display: 'block', mt: 1, fontWeight: current || complete ? 700 : 500, color: current ? color : complete ? 'text.primary' : 'text.secondary' }}>
                {label}
              </Typography>
              {current && alternate && (
                <Typography variant="caption" sx={{ display: 'block', color: meta.color, fontWeight: 700 }}>
                  {meta.label}
                </Typography>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
