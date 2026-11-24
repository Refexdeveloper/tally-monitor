import { Box, Button, Card, Stack, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import { ArrowRight, ChartColumnBig } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { DashboardOverview } from '@/api/types';
import { MascotIllustration } from '@/components/illustrations/MascotIllustration';
import { useAuthStore } from '@/stores/auth';
import { formatNumber } from '@/utils/format';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function WelcomeBanner({ overview }: { overview?: DashboardOverview }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canQueue = useAuthStore((s) => s.hasPermission('jobs.view'));
  const canReports = useAuthStore((s) => s.hasPermission('reports.view'));
  const firstName = user?.fullName.split(' ')[0] ?? '';

  let summary = 'Loading your integration summary...';
  if (overview) {
    const { awaitingApproval, failed, needsAttention } = overview.jobs;
    const parts = [
      awaitingApproval && `${formatNumber(awaitingApproval)} awaiting Finance approval`,
      failed && `${formatNumber(failed)} failed`,
      needsAttention && `${formatNumber(needsAttention)} blocked by validation or mapping`,
    ].filter(Boolean);
    summary = parts.length
      ? `Your queue has ${parts.join(', ')}. Let's keep every company's books in sync.`
      : overview.jobs.total
        ? 'Everything is flowing smoothly. No jobs need your attention right now.'
        : 'No transactions yet. Connect a Kissflow application to start receiving expenses.';
  }

  return (
    <Card
      component={motion.div}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      sx={{
        p: { xs: 3, md: 4 },
        height: '100%',
        color: '#FFFFFF',
        background: 'radial-gradient(circle at 85% 20%, rgba(255,138,61,0.55) 0%, transparent 40%), linear-gradient(135deg, #4338CA 0%, #6D28D9 60%, #8B5CF6 100%)',
        boxShadow: '0 24px 48px -20px rgba(79,70,229,0.6)',
      }}
    >
      <Box sx={{ position: 'absolute', inset: 0, opacity: 0.12, backgroundImage: 'radial-gradient(#FFFFFF 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ alignItems: 'center', position: 'relative', height: '100%' }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="overline" sx={{ opacity: 0.8 }}>
            {greeting()}
          </Typography>
          <Typography variant="h3" sx={{ mb: 1.5 }}>
            Hi {firstName}, welcome back!
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.88, maxWidth: 520, mb: 3 }}>
            {summary}
          </Typography>
          <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {canQueue && (
              <Button variant="contained" onClick={() => navigate('/queue')} endIcon={<ArrowRight size={18} />} sx={{ bgcolor: '#FFFFFF', color: 'primary.dark', backgroundImage: 'none', '&:hover': { bgcolor: '#EEF2FF' } }}>
                Review queue
              </Button>
            )}
            {canReports && (
              <Button variant="outlined" onClick={() => navigate('/reports')} startIcon={<ChartColumnBig size={18} />} sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: '#FFFFFF', bgcolor: 'rgba(255,255,255,0.08)' } }}>
                View reports
              </Button>
            )}
          </Stack>
        </Box>
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
          <MascotIllustration size={190} />
        </Box>
      </Stack>
    </Card>
  );
}
