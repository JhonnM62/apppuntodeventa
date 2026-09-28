import { create } from 'zustand';

interface CajaCacheState {
  cajas: any[];
  cajaActiva: any | null;
  lastFetch: number;
  currentPage: number;
  hasMore: boolean;
  total: number;
  isFetchingMore: boolean;
  // Replace all cajas (first page or fresh load)
  setCajas: (cajas: any[], cajaActiva: any | null, total?: number, hasMore?: boolean) => void;
  // Append next pages (infinite scroll)
  appendCajas: (newCajas: any[], page: number, total: number, hasMore: boolean) => void;
  setCajaActiva: (cajaActiva: any | null) => void;
  setIsFetchingMore: (v: boolean) => void;
  clearCache: () => void;
}

export const useCajaCacheStore = create<CajaCacheState>((set) => ({
  cajas: [],
  cajaActiva: null,
  lastFetch: 0,
  currentPage: 0,
  hasMore: true,
  total: 0,
  isFetchingMore: false,
  setCajas: (cajas, cajaActiva, total = cajas.length, hasMore = false) =>
    set({ cajas, cajaActiva, lastFetch: Date.now(), currentPage: 0, hasMore, total }),
  appendCajas: (newCajas, page, total, hasMore) =>
    set((state) => ({
      cajas: [...state.cajas, ...newCajas],
      currentPage: page,
      hasMore,
      total,
      isFetchingMore: false,
    })),
  setCajaActiva: (cajaActiva) => set({ cajaActiva }),
  setIsFetchingMore: (v) => set({ isFetchingMore: v }),
  clearCache: () =>
    set({ cajas: [], cajaActiva: null, lastFetch: 0, currentPage: 0, hasMore: true, total: 0 }),
}));
