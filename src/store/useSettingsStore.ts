import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsState {
  primaryColor: string;
  fontScale: number;
  gridColumnsWeb: number;
  gridColumnsMobile: number;
  setPrimaryColor: (color: string) => void;
  setFontScale: (scale: number) => void;
  setGridColumnsWeb: (cols: number) => void;
  setGridColumnsMobile: (cols: number) => void;
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
      setPrimaryColor: (color) => set({ primaryColor: color }),
      setFontScale: (scale) => set({ fontScale: scale }),
      setGridColumnsWeb: (cols) => set({ gridColumnsWeb: cols }),
      setGridColumnsMobile: (cols) => set({ gridColumnsMobile: cols }),
      resetSettings: () => set({ 
        primaryColor: DEFAULT_COLOR, 
        fontScale: DEFAULT_FONT_SCALE,
        gridColumnsWeb: DEFAULT_GRID_WEB,
        gridColumnsMobile: DEFAULT_GRID_MOBILE
      }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
