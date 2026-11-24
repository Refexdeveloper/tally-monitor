import { Box, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useOutlet } from 'react-router';
import { useUiStore } from '@/stores/ui';
import { CommandPalette } from './CommandPalette';
import { Sidebar, SIDEBAR_MINI_WIDTH, SIDEBAR_WIDTH } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const location = useLocation();
  const outlet = useOutlet();
  const offset = isDesktop ? (collapsed ? SIDEBAR_MINI_WIDTH : SIDEBAR_WIDTH) : 0;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Sidebar />
      <Box component={motion.div} animate={{ paddingLeft: offset }} initial={false} transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
        <Topbar />
        <Box component="main" sx={{ px: { xs: 2, sm: 3, md: 4 }, pb: 6, pt: 1, maxWidth: 1600, mx: 'auto' }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </Box>
      </Box>
      <CommandPalette />
    </Box>
  );
}
