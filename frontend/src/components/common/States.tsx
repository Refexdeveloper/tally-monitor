import { Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyBoxIllustration } from '@/components/illustrations/EmptyBoxIllustration';

export function EmptyState({ title, description, action, compact = false }: { title: string; description?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <Stack component={motion.div} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} spacing={1} sx={{ alignItems: 'center', textAlign: 'center', py: compact ? 3 : 6, px: 2 }}>
      <EmptyBoxIllustration size={compact ? 96 : 130} />
      <Typography variant="subtitle1">{title}</Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>
          {description}
        </Typography>
      )}
      {action}
    </Stack>
  );
}

export function ErrorState({ message, onRetry, compact = false }: { message: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <Stack spacing={1.25} sx={{ alignItems: 'center', textAlign: 'center', py: compact ? 3 : 6, px: 2 }} role="alert">
      <Box sx={{ width: 52, height: 52, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: 'error.lighter', color: 'error.dark' }}>
        <TriangleAlert size={26} />
      </Box>
      <Typography variant="subtitle1">Couldn't load this</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380 }}>
        {message}
      </Typography>
      {onRetry && (
        <Button size="small" variant="outlined" startIcon={<RefreshCw size={16} />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </Stack>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <Box sx={{ height, display: 'flex', alignItems: 'flex-end', gap: 1.5, px: 1 }} aria-busy>
      {Array.from({ length: 12 }, (_, i) => (
        <Skeleton key={i} variant="rounded" sx={{ flex: 1, borderRadius: 2 }} height={`${30 + ((i * 37) % 60)}%`} />
      ))}
    </Box>
  );
}
