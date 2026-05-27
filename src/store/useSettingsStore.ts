import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsState {
  primaryColor: string;
  fontScale: number;
  setPrimaryColor: (color: string) => void;
  setFontScale: (scale: number) => void;
  resetSettings: () => void;
}

const DEFAULT_COLOR = '#16a34a'; // Tailwind green-600
const DEFAULT_FONT_SCALE = 1;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      primaryColor: DEFAULT_COLOR,
      fontScale: DEFAULT_FONT_SCALE,
      setPrimaryColor: (color) => set({ primaryColor: color }),
      setFontScale: (scale) => set({ fontScale: scale }),
      resetSettings: () => set({ primaryColor: DEFAULT_COLOR, fontScale: DEFAULT_FONT_SCALE }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
