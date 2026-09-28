/**
 * useInsumosCacheStore — SWR (Stale-While-Revalidate) cache para insumos y productos.
 *
 * Evita refetchear 1000+ items cada vez que el usuario entra al formulario de caja.
 * La caché se invalida automáticamente si tiene más de CACHE_TTL_MS de antigüedad.
 */
import { create } from 'zustand';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

interface InsumosCacheState {
  insumos: any[];
  productos: any[];
  lastFetch: number;
  isStale: () => boolean;
  setInsumos: (insumos: any[]) => void;
  setProductos: (productos: any[]) => void;
  setAll: (insumos: any[], productos: any[]) => void;
  clearCache: () => void;
}

export const useInsumosCacheStore = create<InsumosCacheState>((set, get) => ({
  insumos: [],
  productos: [],
  lastFetch: 0,

  /** Returns true if cache is empty or older than TTL */
  isStale: () => {
    const { lastFetch } = get();
    return lastFetch === 0 || Date.now() - lastFetch > CACHE_TTL_MS;
  },

  setInsumos: (insumos) => set({ insumos, lastFetch: Date.now() }),
  setProductos: (productos) => set({ productos, lastFetch: Date.now() }),
  setAll: (insumos, productos) => set({ insumos, productos, lastFetch: Date.now() }),
  clearCache: () => set({ insumos: [], productos: [], lastFetch: 0 }),
}));
