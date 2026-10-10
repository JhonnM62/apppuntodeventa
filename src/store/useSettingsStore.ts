import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsState {
  primaryColor: string;
  fontScale: number;
  gridColumnsWeb: number;
  gridColumnsMobile: number;
  enableSound: boolean;
  forceEarpiece: boolean;
  setPrimaryColor: (color: string) => void;
  setFontScale: (scale: number) => void;
  setGridColumnsWeb: (cols: number) => void;
  setGridColumnsMobile: (cols: number) => void;
  setEnableSound: (enable: boolean) => void;
  setForceEarpiece: (force: boolean) => void;
  resetSettings: () => void;
}

const DEFAULT_COLOR = '#16a34a'; // Tailwind green-600
const DEFAULT_FONT_SCALE = 1;
const DEFAULT_GRID_WEB = 8;
const DEFAULT_GRID_MOBILE = 4;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      primaryColor: DEFAULT_COLOR,
      fontScale: DEFAULT_FONT_SCALE,
      gridColumnsWeb: DEFAULT_GRID_WEB,
      gridColumnsMobile: DEFAULT_GRID_MOBILE,
      enableSound: true,
      forceEarpiece: false,
      setPrimaryColor: (color) => set({ primaryColor: color }),
      setFontScale: (scale) => set({ fontScale: scale }),
      setGridColumnsWeb: (cols) => set({ gridColumnsWeb: cols }),
      setGridColumnsMobile: (cols) => set({ gridColumnsMobile: cols }),
      setEnableSound: (enable) => set({ enableSound: enable }),
      setForceEarpiece: (force) => set({ forceEarpiece: force }),
      resetSettings: () => set({ 
        primaryColor: DEFAULT_COLOR, 
        fontScale: DEFAULT_FONT_SCALE,
        gridColumnsWeb: DEFAULT_GRID_WEB,
        gridColumnsMobile: DEFAULT_GRID_MOBILE,
        enableSound: true,
        forceEarpiece: false
      }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
