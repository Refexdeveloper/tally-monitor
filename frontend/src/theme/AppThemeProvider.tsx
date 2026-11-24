import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { useMemo, type ReactNode } from 'react';
import { useUiStore } from '@/stores/ui';
import { createAppTheme } from './theme';

export function useResolvedMode() {
  const preference = useUiStore((s) => s.themePreference);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });
  return preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const mode = useResolvedMode();
  const theme = useMemo(() => createAppTheme(mode), [mode]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}
