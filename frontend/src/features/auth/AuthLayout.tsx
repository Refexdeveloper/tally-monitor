import { Box, Stack, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import { BadgeCheck, Building2, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo, LogoMark } from '@/components/common/Logo';
import { BridgeIllustration } from '@/components/illustrations/BridgeIllustration';

const HIGHLIGHTS = [
  { icon: ShieldCheck, title: 'Secure bridge', text: 'Tally stays private behind an outbound-only agent.' },
  { icon: BadgeCheck, title: 'Verified postings', text: 'Every voucher is read back from Tally before it counts.' },
  { icon: Building2, title: 'Company-safe', text: 'Each group company keeps its own ledgers and queue.' },
];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 1fr' }, bgcolor: 'background.default' }}>
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: { md: 5, lg: 7 },
          color: '#FFFFFF',
          position: 'relative',
          overflow: 'hidden',
          background: 'radial-gradient(circle at 15% 15%, #6D63FF 0%, transparent 45%), radial-gradient(circle at 90% 90%, #FF8A3D 0%, transparent 35%), linear-gradient(140deg, #3730A3 0%, #4F46E5 45%, #7C3AED 100%)',
        }}
      >
        <Box sx={{ position: 'absolute', inset: 0, opacity: 0.12, backgroundImage: 'radial-gradient(#FFFFFF 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        <Box sx={{ position: 'relative' }}>
          <Logo inverse />
        </Box>
        <Box sx={{ position: 'relative' }}>
          <Typography component={motion.h1} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} variant="h2" sx={{ maxWidth: 520, mb: 1.5 }}>
            Every expense, posted right.
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.85, maxWidth: 480 }}>
            Tally Monitor validates Kissflow expenses, routes them through Finance approval and posts verified vouchers into the right TallyPrime company.
          </Typography>
          <Box sx={{ maxWidth: 520, mx: 'auto', my: { md: 2, lg: 3 } }}>
            <BridgeIllustration />
          </Box>
          <Stack direction="row" spacing={2}>
            {HIGHLIGHTS.map(({ icon: Icon, title, text }, i) => (
              <Box
                key={title}
                component={motion.div}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.1 }}
                sx={{ flex: 1, p: 2, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(10px)' }}
              >
                <Icon size={22} />
                <Typography variant="subtitle2" sx={{ mt: 1 }}>
                  {title}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {text}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 3, sm: 6 } }}>
        <Box sx={{ width: '100%', maxWidth: 420 }}>
          <Box sx={{ display: { xs: 'flex', md: 'none' }, justifyContent: 'center', mb: 4 }}>
            <LogoMark size={56} />
          </Box>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
