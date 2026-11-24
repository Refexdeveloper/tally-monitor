import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system';

interface UiState {
  themePreference: ThemePreference;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandPaletteOpen: boolean;
  setThemePreference: (p: ThemePreference) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      themePreference: 'system',
      sidebarCollapsed: false,
      mobileNavOpen: false,
      commandPaletteOpen: false,
      setThemePreference: (themePreference) => set({ themePreference }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
    }),
    {
      name: 'tm-ui',
      partialize: (s) => ({ themePreference: s.themePreference, sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);
