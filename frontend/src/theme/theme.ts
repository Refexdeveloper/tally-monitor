import { alpha, createTheme, type PaletteMode, type Theme } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Palette {
    accent: Palette['primary'];
    gradient: { brand: string; brandSoft: string; sunrise: string };
  }
  interface PaletteOptions {
    accent?: PaletteOptions['primary'];
    gradient?: { brand: string; brandSoft: string; sunrise: string };
  }
  interface TypeBackground {
    neutral: string;
    glass: string;
  }
}

declare module '@mui/material/Button' {
  interface ButtonPropsColorOverrides {
    accent: true;
  }
}

declare module '@mui/material/Chip' {
  interface ChipPropsColorOverrides {
    accent: true;
  }
}

export const brand = {
  indigo: { lighter: '#E0E7FF', light: '#818CF8', main: '#4F46E5', dark: '#3730A3', darker: '#1E1B4B' },
  purple: { lighter: '#EDE9FE', light: '#A78BFA', main: '#8B5CF6', dark: '#6D28D9', darker: '#2E1065' },
  orange: { lighter: '#FFEDD5', light: '#FFB27A', main: '#FF8A3D', dark: '#E8641B', darker: '#7C2D12' },
  emerald: { lighter: '#D1FAE5', light: '#34D399', main: '#10B981', dark: '#047857', darker: '#064E3B' },
  amber: { lighter: '#FEF3C7', light: '#FCD34D', main: '#F59E0B', dark: '#B45309', darker: '#78350F' },
  coral: { lighter: '#FFE4E1', light: '#FF9B8F', main: '#F7685B', dark: '#D9443A', darker: '#7F1D1D' },
  sky: { lighter: '#E0F2FE', light: '#7DD3FC', main: '#0EA5E9', dark: '#0369A1', darker: '#0C4A6E' },
};

/** Ordered palette for categorical charts. */
export const chartColors = ['#4F46E5', '#8B5CF6', '#FF8A3D', '#10B981', '#0EA5E9', '#F59E0B', '#F7685B', '#EC4899', '#14B8A6', '#64748B'];

export function createAppTheme(mode: PaletteMode): Theme {
  const dark = mode === 'dark';
  const text = dark
    ? { primary: '#F1F2FF', secondary: '#A3A8C7', disabled: '#5D6285' }
    : { primary: '#1C1D3A', secondary: '#666B8F', disabled: '#A6AAC4' };
  const divider = dark ? alpha('#A3A8C7', 0.14) : alpha('#666B8F', 0.14);

  const theme = createTheme({
    palette: {
      mode,
      primary: { ...brand.indigo, contrastText: '#FFFFFF' },
      secondary: { ...brand.purple, contrastText: '#FFFFFF' },
      accent: { ...brand.orange, contrastText: '#FFFFFF' },
      success: { ...brand.emerald, contrastText: '#FFFFFF' },
      warning: { ...brand.amber, contrastText: '#1C1D3A' },
      error: { ...brand.coral, contrastText: '#FFFFFF' },
      info: { ...brand.sky, contrastText: '#FFFFFF' },
      text,
      divider,
      background: dark
        ? { default: '#0E0F24', paper: '#161835', neutral: '#1D2042', glass: alpha('#161835', 0.72) }
        : { default: '#F6F7FC', paper: '#FFFFFF', neutral: '#F1F2F9', glass: alpha('#FFFFFF', 0.78) },
      gradient: {
        brand: 'linear-gradient(135deg, #4F46E5 0%, #8B5CF6 55%, #C084FC 100%)',
        brandSoft: dark
          ? 'linear-gradient(135deg, rgba(79,70,229,0.28) 0%, rgba(139,92,246,0.22) 100%)'
          : 'linear-gradient(135deg, #EEF0FF 0%, #F3EDFF 100%)',
        sunrise: 'linear-gradient(135deg, #FF8A3D 0%, #F7685B 100%)',
      },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
      h1: { fontFamily: '"Poppins", sans-serif', fontWeight: 700, fontSize: '2.5rem', lineHeight: 1.2 },
      h2: { fontFamily: '"Poppins", sans-serif', fontWeight: 700, fontSize: '2rem', lineHeight: 1.25 },
      h3: { fontFamily: '"Poppins", sans-serif', fontWeight: 700, fontSize: '1.6rem', lineHeight: 1.3 },
      h4: { fontFamily: '"Poppins", sans-serif', fontWeight: 700, fontSize: '1.375rem', lineHeight: 1.35 },
      h5: { fontFamily: '"Poppins", sans-serif', fontWeight: 600, fontSize: '1.125rem' },
      h6: { fontFamily: '"Poppins", sans-serif', fontWeight: 600, fontSize: '1rem' },
      subtitle1: { fontWeight: 600, fontSize: '0.95rem' },
      subtitle2: { fontWeight: 600, fontSize: '0.85rem' },
      body2: { fontSize: '0.875rem' },
      caption: { fontSize: '0.75rem' },
      overline: { fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.68rem' },
      button: { fontFamily: '"Poppins", sans-serif', fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
    },
  });

  const cardShadow = dark
    ? '0 0 0 1px rgba(163,168,199,0.08), 0 12px 32px -12px rgba(0,0,0,0.5)'
    : '0 0 2px 0 rgba(28,29,58,0.08), 0 12px 24px -6px rgba(28,29,58,0.08)';

  return createTheme(theme, {
    components: {
      MuiUseMediaQuery: { defaultProps: { noSsr: true } },
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: theme.palette.background.default, WebkitFontSmoothing: 'antialiased' },
          '*::-webkit-scrollbar': { width: 8, height: 8 },
          '*::-webkit-scrollbar-thumb': { background: alpha(text.secondary, 0.25), borderRadius: 8 },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important' },
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
      MuiCard: {
        styleOverrides: {
          root: { borderRadius: 20, boxShadow: cardShadow, position: 'relative', overflow: 'hidden' },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 12, paddingInline: 18, minHeight: 40 },
          sizeLarge: { minHeight: 50, fontSize: '0.975rem', borderRadius: 14 },
          containedPrimary: {
            backgroundImage: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
            boxShadow: `0 8px 20px -8px ${alpha(brand.indigo.main, 0.7)}`,
            '&:hover': { boxShadow: `0 10px 24px -8px ${alpha(brand.indigo.main, 0.85)}` },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: dark ? alpha('#FFFFFF', 0.02) : '#FFFFFF',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(text.secondary, 0.24) },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(text.primary, 0.5) },
          },
        },
      },
      MuiChip: {
        styleOverrides: { root: { fontWeight: 600, borderRadius: 8 } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { backgroundColor: dark ? '#F1F2FF' : '#1C1D3A', color: dark ? '#1C1D3A' : '#FFFFFF', fontWeight: 500, borderRadius: 8 },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 14,
            backdropFilter: 'blur(20px)',
            backgroundColor: theme.palette.background.glass,
            boxShadow: '0 0 2px 0 rgba(28,29,58,0.2), -20px 20px 40px -4px rgba(28,29,58,0.18)',
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            backdropFilter: 'blur(20px)',
            backgroundColor: theme.palette.background.glass,
            boxShadow: '0 0 2px 0 rgba(28,29,58,0.2), -20px 20px 40px -4px rgba(28,29,58,0.18)',
          },
        },
      },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 20 } } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } } },
      MuiTableCell: {
        styleOverrides: {
          head: { color: text.secondary, fontWeight: 600, backgroundColor: theme.palette.background.neutral, borderBottom: 'none' },
          root: { borderBottomColor: divider },
        },
      },
    },
  });
}
