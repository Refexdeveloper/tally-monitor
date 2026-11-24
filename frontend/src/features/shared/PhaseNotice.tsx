import { Box, Chip, Stack, Typography } from '@mui/material';
import { Rocket } from 'lucide-react';
import { MascotIllustration } from '@/components/illustrations/MascotIllustration';
import { PHASE_NAMES } from '@/config/navigation';

/** Placeholder for a tab whose feature ships in a later phase. States the plan instead of faking data. */
export function PhaseNotice({ phase, title, text }: { phase: number; title: string; text: string }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ alignItems: 'center', p: { xs: 3, md: 5 } }}>
      <MascotIllustration size={130} mood="thinking" />
      <Box>
        <Chip icon={<Rocket size={15} />} label={`Phase ${phase} · ${PHASE_NAMES[phase]}`} color="primary" size="small" sx={{ mb: 1.5 }} />
        <Typography variant="h5" sx={{ mb: 0.75 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 560 }}>
          {text}
        </Typography>
      </Box>
    </Stack>
  );
}
