import { Box, ButtonBase, Drawer, IconButton, Stack, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { Logo } from '@/components/common/Logo';
import { CURRENT_PHASE, NAV_SECTIONS, type NavItem } from '@/config/navigation';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

export const SIDEBAR_WIDTH = 272;
export const SIDEBAR_MINI_WIDTH = 92;

function isActive(pathname: string, item: NavItem) {
  return item.path === '/' ? pathname === '/' : pathname === item.path || pathname.startsWith(`${item.path}/`);
}

function NavEntry({ item, mini, active, onNavigate }: { item: NavItem; mini: boolean; active: boolean; onNavigate?: () => void }) {
  const theme = useTheme();
  const Icon = item.icon;
  const activeBg = alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.22 : 0.1);

  const content = mini ? (
    <Stack spacing={0.5} sx={{ alignItems: 'center', py: 1.1, width: '100%', position: 'relative', zIndex: 1 }}>
      <Icon size={22} strokeWidth={active ? 2.4 : 2} />
      <Typography variant="caption" sx={{ fontSize: 10.5, fontWeight: active ? 700 : 600, lineHeight: 1.1 }}>
        {item.shortLabel}
      </Typography>
    </Stack>
  ) : (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1.1, px: 1.5, width: '100%', position: 'relative', zIndex: 1 }}>
      <Icon size={20} strokeWidth={active ? 2.4 : 2} />
      <Typography variant="body2" sx={{ fontWeight: active ? 700 : 500, flex: 1 }}>
        {item.label}
      </Typography>
      {item.phase > CURRENT_PHASE && (
        <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700, px: 0.75, py: 0.1, borderRadius: 1, bgcolor: alpha(theme.palette.text.secondary, 0.1), color: 'text.secondary' }}>
          P{item.phase}
        </Typography>
      )}
    </Stack>
  );

  const button = (
    <ButtonBase
      component={NavLink}
      to={item.path}
      end={item.path === '/'}
      onClick={onNavigate}
      aria-label={item.label}
      sx={{
        width: '100%',
        borderRadius: 2.5,
        position: 'relative',
        color: active ? 'primary.main' : 'text.secondary',
        justifyContent: 'flex-start',
        transition: 'color .2s, background-color .2s',
        '&:hover': { bgcolor: active ? undefined : alpha(theme.palette.text.secondary, 0.08), color: active ? undefined : 'text.primary' },
        ...(theme.palette.mode === 'dark' && active ? { color: 'primary.light' } : {}),
      }}
    >
      {active && (
        <motion.span
          layoutId={mini ? 'nav-active-mini' : 'nav-active'}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          style={{ position: 'absolute', inset: 0, borderRadius: 10, background: activeBg }}
        />
      )}
      {content}
    </ButtonBase>
  );

  return mini ? (
    <Tooltip title={item.label} placement="right">
      {button}
    </Tooltip>
  ) : (
    button
  );
}

function SidebarContent({ mini, onNavigate }: { mini: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const sections = NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => permissions.includes(i.permission)) })).filter((s) => s.items.length);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ px: mini ? 0 : 2.5, py: 2.5, display: 'flex', justifyContent: mini ? 'center' : 'flex-start' }}>
        <Logo collapsed={mini} />
      </Box>
      <Box component="nav" aria-label="Main navigation" sx={{ flex: 1, overflowY: 'auto', px: mini ? 1 : 2, pb: 3 }}>
        {sections.map((section) => (
          <Box key={section.title} sx={{ mb: mini ? 0.5 : 2 }}>
            {!mini && (
              <Typography variant="overline" sx={{ display: 'block', px: 1.5, mb: 0.75, color: 'text.disabled' }}>
                {section.title}
              </Typography>
            )}
            <Stack spacing={mini ? 0.5 : 0.25}>
              {section.items.map((item) => (
                <NavEntry key={item.key} item={item} mini={mini} active={isActive(pathname, item)} onNavigate={onNavigate} />
              ))}
            </Stack>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function Sidebar() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const mobileOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileOpen = useUiStore((s) => s.setMobileNavOpen);

  if (!isDesktop) {
    return (
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        slotProps={{ paper: { sx: { width: SIDEBAR_WIDTH, bgcolor: 'background.default', borderRight: 'none' } } }}
      >
        <SidebarContent mini={false} onNavigate={() => setMobileOpen(false)} />
      </Drawer>
    );
  }

  const width = collapsed ? SIDEBAR_MINI_WIDTH : SIDEBAR_WIDTH;
  return (
    <Box
      component={motion.aside}
      animate={{ width }}
      initial={false}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      sx={{
        position: 'fixed',
        inset: '0 auto 0 0',
        zIndex: theme.zIndex.appBar + 1,
        borderRight: `1px dashed ${theme.palette.divider}`,
        bgcolor: 'background.default',
      }}
    >
      <SidebarContent mini={collapsed} />
      <IconButton
        onClick={toggle}
        size="small"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        sx={{
          position: 'absolute',
          top: 30,
          right: -13,
          width: 26,
          height: 26,
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: 'background.paper',
          boxShadow: '0 4px 10px -4px rgba(28,29,58,0.25)',
          '&:hover': { bgcolor: 'background.paper', color: 'primary.main' },
        }}
      >
        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </IconButton>
    </Box>
  );
}
