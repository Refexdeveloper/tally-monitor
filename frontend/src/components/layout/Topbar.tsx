import { Avatar, Badge, Box, Button, Chip, Divider, IconButton, Menu, MenuItem, MenuList, Popover, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BookPlus, Building2, CircleAlert, ClipboardCheck, LogOut, Menu as MenuIcon, Monitor, Moon, Search, Sun, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { dashboardApi } from '@/api/endpoints';
import { useLogout } from '@/features/auth/useLogout';
import { useResolvedMode } from '@/theme/AppThemeProvider';
import { useAuthStore } from '@/stores/auth';
import { useUiStore, type ThemePreference } from '@/stores/ui';
import { formatNumber, initials } from '@/utils/format';

function ThemeToggle() {
  const mode = useResolvedMode();
  const setPreference = useUiStore((s) => s.setThemePreference);
  return (
    <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
      <IconButton onClick={() => setPreference(mode === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={mode}
            initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ display: 'grid' }}
          >
            {mode === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
          </motion.span>
        </AnimatePresence>
      </IconButton>
    </Tooltip>
  );
}

function Notifications() {
  const navigate = useNavigate();
  const theme = useTheme();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const canView = useAuthStore((s) => s.hasPermission('dashboard.view'));
  const { data } = useQuery({ queryKey: ['dashboard', 'overview'], queryFn: dashboardApi.overview, enabled: canView, refetchInterval: 60_000 });

  const items = data
    ? [
        { key: 'approval', count: data.jobs.awaitingApproval, label: 'jobs awaiting finance approval', icon: ClipboardCheck, color: theme.palette.secondary.main, path: '/queue' },
        { key: 'failed', count: data.jobs.failed, label: 'failed jobs need review', icon: TriangleAlert, color: theme.palette.error.main, path: '/queue' },
        { key: 'masters', count: data.masterRequestsPending, label: 'master creation requests pending', icon: BookPlus, color: theme.palette.accent.main, path: '/ledgers' },
        { key: 'attention', count: data.jobs.needsAttention, label: 'jobs blocked by validation or mapping', icon: CircleAlert, color: theme.palette.warning.main, path: '/queue' },
      ].filter((i) => i.count > 0)
    : [];

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label={`Notifications (${items.length})`}>
          <Badge badgeContent={items.length} color="error">
            <motion.span
              style={{ display: 'grid' }}
              animate={items.length ? { rotate: [0, -12, 10, -6, 0] } : undefined}
              transition={{ duration: 0.8, repeat: items.length ? Infinity : 0, repeatDelay: 6 }}
            >
              <Bell size={20} />
            </motion.span>
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 360, mt: 1 } } }}
      >
        <Stack direction="row" spacing={1} sx={{ px: 2.5, py: 2, alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6">Needs your attention</Typography>
            <Typography variant="caption" color="text.secondary">
              Live counts from the processing queue
            </Typography>
          </Box>
          <Tooltip title="Close">
            <IconButton size="small" onClick={() => setAnchor(null)} aria-label="Close notifications" sx={{ mt: -0.5, mr: -1 }}>
              <X size={18} />
            </IconButton>
          </Tooltip>
        </Stack>
        <Divider sx={{ borderStyle: 'dashed' }} />
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
            All clear. Nothing is waiting on you right now.
          </Typography>
        ) : (
          <MenuList sx={{ p: 1 }} aria-label="Notifications">
            {items.map(({ key, count, label, icon: Icon, color, path }) => (
              <MenuItem
                key={key}
                onClick={() => {
                  setAnchor(null);
                  navigate(path);
                }}
                sx={{ borderRadius: 2, py: 1.25, gap: 1.5, whiteSpace: 'normal' }}
              >
                <Box sx={{ width: 38, height: 38, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: alpha(color, 0.14), color, flexShrink: 0 }}>
                  <Icon size={18} />
                </Box>
                <Typography variant="body2">
                  <b>{formatNumber(count)}</b> {label}
                </Typography>
              </MenuItem>
            ))}
          </MenuList>
        )}
      </Popover>
    </>
  );
}

function AccountMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const preference = useUiStore((s) => s.themePreference);
  const setPreference = useUiStore((s) => s.setThemePreference);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!user) return null;

  return (
    <>
      <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Account menu" sx={{ p: 0.4, background: 'linear-gradient(135deg,#4F46E5,#FF8A3D)' }}>
        <Avatar sx={{ width: 36, height: 36, fontSize: 14, fontWeight: 700, bgcolor: 'background.paper', color: 'primary.main', border: '2px solid', borderColor: 'background.paper' }} src={user.avatarUrl ?? undefined}>
          {initials(user.fullName)}
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 280, mt: 1 } } }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle1" noWrap>
            {user.fullName}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {user.email}
          </Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
            {user.roles.map((r) => (
              <Chip key={r.code} label={r.name} size="small" color="primary" variant="outlined" />
            ))}
          </Stack>
        </Box>
        <Divider sx={{ borderStyle: 'dashed' }} />
        <Box sx={{ px: 2, py: 1.25 }}>
          <Typography variant="caption" color="text.secondary">
            Appearance
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            fullWidth
            value={preference}
            onChange={(_, v: ThemePreference | null) => v && setPreference(v)}
            sx={{ mt: 0.75 }}
          >
            <ToggleButton value="light" aria-label="Light">
              <Sun size={16} />
            </ToggleButton>
            <ToggleButton value="dark" aria-label="Dark">
              <Moon size={16} />
            </ToggleButton>
            <ToggleButton value="system" aria-label="System">
              <Monitor size={16} />
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Divider sx={{ borderStyle: 'dashed' }} />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            void logout();
          }}
          sx={{ color: 'error.main', mx: 1, my: 0.5, borderRadius: 2, gap: 1.25 }}
        >
          <LogOut size={18} /> Sign out
        </MenuItem>
      </Menu>
    </>
  );
}

export function Topbar() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const setMobileOpen = useUiStore((s) => s.setMobileNavOpen);
  const openPalette = useUiStore((s) => s.setCommandPaletteOpen);
  const user = useAuthStore((s) => s.user);
  const scopeLabel = user?.companyScope === 'ALL' ? 'All companies' : `${user?.companies?.length ?? 0} companies`;
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: theme.zIndex.appBar,
        height: 72,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: { xs: 2, md: 4 },
        bgcolor: 'background.glass',
        backdropFilter: 'blur(14px) saturate(160%)',
      }}
    >
      {!isDesktop && (
        <IconButton onClick={() => setMobileOpen(true)} aria-label="Open navigation" edge="start">
          <MenuIcon size={22} />
        </IconButton>
      )}
      <Chip
        icon={<Building2 size={16} />}
        label={scopeLabel}
        variant="outlined"
        sx={{ display: { xs: 'none', sm: 'inline-flex' }, borderStyle: 'dashed', fontWeight: 600, '& .MuiChip-icon': { color: 'primary.main' } }}
      />
      <Box sx={{ flex: 1 }} />
      <Button
        onClick={() => openPalette(true)}
        color="inherit"
        startIcon={<Search size={18} />}
        sx={{ color: 'text.secondary', bgcolor: alpha(theme.palette.text.secondary, 0.08), px: 1.5, minWidth: 0, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } } }}
        aria-label="Search"
      >
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, fontSize: 12, fontWeight: 700 }}>
          {isMac ? '⌘K' : 'Ctrl K'}
        </Box>
      </Button>
      <ThemeToggle />
      <Notifications />
      <AccountMenu />
    </Box>
  );
}
