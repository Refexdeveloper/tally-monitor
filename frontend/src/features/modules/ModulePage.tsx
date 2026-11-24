import { Box, Button, Card, Chip, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import { ArrowLeft, CircleCheck, Rocket } from 'lucide-react';
import { useNavigate } from 'react-router';
import { IconTile } from '@/components/common/IconTile';
import { MascotIllustration } from '@/components/illustrations/MascotIllustration';
import { PHASE_NAMES, type NavItem } from '@/config/navigation';

/**
 * Shown for modules scheduled in a later delivery phase. It states the plan
 * honestly instead of rendering mock screens.
 */
export function ModulePage({ item }: { item: NavItem }) {
  const theme = useTheme();
  const navigate = useNavigate();

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <IconTile icon={item.icon} color={theme.palette.primary.main} size={52} />
        <Box>
          <Typography variant="h3">{item.label}</Typography>
          <Typography variant="body2" color="text.secondary">
            {item.description}
          </Typography>
        </Box>
      </Stack>

      <Card sx={{ p: { xs: 3, md: 5 }, background: theme.palette.gradient.brandSoft, boxShadow: 'none', border: `1px dashed ${alpha(theme.palette.primary.main, 0.3)}` }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} sx={{ alignItems: 'center' }}>
          <MascotIllustration size={200} mood="thinking" />
          <Box sx={{ flex: 1 }}>
            <Chip icon={<Rocket size={16} />} label={`Phase ${item.phase} · ${PHASE_NAMES[item.phase]}`} color="primary" sx={{ mb: 2 }} />
            <Typography variant="h4" sx={{ mb: 1 }}>
              This module is being built next
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 640 }}>
              The database tables and permissions it depends on are already in place. The capabilities below ship in Phase {item.phase} and will work against live MySQL data, never mock data.
            </Typography>
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              {item.capabilities.map((c, i) => (
                <Stack key={c} direction="row" spacing={1.25} component={motion.div} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }} sx={{ alignItems: 'flex-start', p: 1.5, borderRadius: 3, bgcolor: 'background.paper' }}>
                  <Box sx={{ color: 'success.main', mt: '2px' }}>
                    <CircleCheck size={18} />
                  </Box>
                  <Typography variant="body2">{c}</Typography>
                </Stack>
              ))}
            </Box>
            <Button startIcon={<ArrowLeft size={18} />} onClick={() => navigate('/')} sx={{ mt: 3 }}>
              Back to dashboard
            </Button>
          </Box>
        </Stack>
      </Card>
    </Stack>
  );
}
