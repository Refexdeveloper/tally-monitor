import { Box, ButtonBase, Dialog, InputBase, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { CURRENT_PHASE, NAV_ITEMS, PHASE_NAMES } from '@/config/navigation';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const navigate = useNavigate();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useUiStore.getState().commandPaletteOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return NAV_ITEMS.filter((i) => permissions.includes(i.permission)).filter(
      (i) => !q || i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.capabilities.some((c) => c.toLowerCase().includes(q)),
    );
  }, [query, permissions]);

  useEffect(() => setIndex(0), [query, open]);

  const go = (path: string) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: { mt: { xs: 4, sm: 12 }, alignSelf: 'flex-start', bgcolor: 'background.glass', backdropFilter: 'blur(24px)' } } }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2.5, py: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Search size={20} color={theme.palette.text.secondary} />
        <InputBase
          autoFocus
          fullWidth
          placeholder="Search modules and features..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setIndex((i) => Math.min(i + 1, results.length - 1));
            if (e.key === 'ArrowUp') setIndex((i) => Math.max(i - 1, 0));
            if (e.key === 'Enter' && results[index]) go(results[index].path);
          }}
          slotProps={{ input: { 'aria-label': 'Search' } }}
        />
        <Typography variant="caption" sx={{ px: 1, py: 0.25, borderRadius: 1, border: `1px solid ${theme.palette.divider}`, color: 'text.secondary' }}>
          Esc
        </Typography>
      </Stack>
      <Box sx={{ maxHeight: 420, overflowY: 'auto', p: 1 }} role="listbox">
        {results.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
            Nothing matches "{query}"
          </Typography>
        )}
        {results.map((item, i) => {
          const Icon = item.icon;
          const selected = i === index;
          return (
            <ButtonBase
              key={item.key}
              role="option"
              aria-selected={selected}
              onMouseEnter={() => setIndex(i)}
              onClick={() => go(item.path)}
              sx={{
                width: '100%',
                justifyContent: 'flex-start',
                textAlign: 'left',
                borderRadius: 2.5,
                px: 1.5,
                py: 1.25,
                gap: 1.5,
                bgcolor: selected ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
              }}
            >
              <Box sx={{ width: 36, height: 36, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main' }}>
                <Icon size={18} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2">{item.label}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                  {item.phase > CURRENT_PHASE ? `Phase ${item.phase} · ${PHASE_NAMES[item.phase]} — ` : ''}
                  {item.description}
                </Typography>
              </Box>
              {selected && <CornerDownLeft size={16} color={theme.palette.text.secondary} />}
            </ButtonBase>
          );
        })}
      </Box>
    </Dialog>
  );
}
