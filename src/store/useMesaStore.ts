import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface MesaStore {
  mesas: any[];
  lastFetched: number | null;
  isLoading: boolean;
  setMesas: (mesas: any[]) => void;
  setLoading: (loading: boolean) => void;
  shouldRefetch: () => boolean;
  clearCache: () => void;
}

const CACHE_DURATION = 5 * 60 * 1000;

export const useMesaStore = create<MesaStore>()(
  persist(
    (set, get) => ({
      mesas: [],
      lastFetched: null,
      isLoading: false,

      setMesas: (mesas) => {
        set({
          mesas,
          lastFetched: Date.now(),
        });
      },

      setLoading: (isLoading) => set({ isLoading }),

      shouldRefetch: () => {
        const { lastFetched } = get();
        if (!lastFetched) return true;
        return Date.now() - lastFetched > CACHE_DURATION;
      },

      clearCache: () => set({ mesas: [], lastFetched: null }),
    }),
    {
      name: 'mesa-cache',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        mesas: state.mesas,
        lastFetched: state.lastFetched,
      }),
    }
  )
);