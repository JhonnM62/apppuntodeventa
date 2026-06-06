import { create } from 'zustand';

interface CajaCacheState {
  cajas: any[];
  cajaActiva: any | null;
  lastFetch: number;
  setCajas: (cajas: any[], cajaActiva: any | null) => void;
  clearCache: () => void;
}

export const useCajaCacheStore = create<CajaCacheState>((set) => ({
  cajas: [],
  cajaActiva: null,
  lastFetch: 0,
  setCajas: (cajas, cajaActiva) => set({ cajas, cajaActiva, lastFetch: Date.now() }),
  clearCache: () => set({ cajas: [], cajaActiva: null, lastFetch: 0 }),
}));
