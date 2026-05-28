import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mesa } from '../services/mesas';

interface MesaStore {
  mesas: Mesa[];
  lastFetched: number | null;
  isLoading: boolean;
  setMesas: (mesas: Mesa[]) => void;
  addMesa: (mesa: Mesa) => void;
  updateMesaState: (id: string, data: Partial<Mesa>) => void;
  removeMesaState: (id: string) => void;
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

      addMesa: (mesa) => {
        set((state) => ({
          mesas: [...state.mesas, mesa].sort((a, b) => a.nombre.localeCompare(b.nombre)),
        }));
      },

      updateMesaState: (id, data) => {
        set((state) => ({
          mesas: state.mesas.map((m) => (m.IdMesas === id ? { ...m, ...data } : m)).sort((a, b) => a.nombre.localeCompare(b.nombre)),
        }));
      },

      removeMesaState: (id) => {
        set((state) => ({
          mesas: state.mesas.filter((m) => m.IdMesas !== id),
        }));
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