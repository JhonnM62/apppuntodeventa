import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ProductCache {
  productos: any[];
  categorias: string[];
  lastFetched: number | null;
}

interface ProductStore {
  productos: any[];
  categorias: string[];
  lastFetched: number | null;
  isLoading: boolean;
  setProductos: (productos: any[]) => void;
  setLoading: (loading: boolean) => void;
  getCategorias: () => string[];
  shouldRefetch: () => boolean;
  clearCache: () => void;
}

const CACHE_DURATION = 5 * 60 * 1000;

export const useProductStore = create<ProductStore>()(
  persist(
    (set, get) => ({
      productos: [],
      categorias: [],
      lastFetched: null,
      isLoading: false,

      setProductos: (productos) => {
        const categoriasSet = new Set<string>(['LO MAS VENDIDO']);
        productos.forEach((p) => {
          if (p.categoriaNombre) categoriasSet.add(p.categoriaNombre);
          if (p.categoria) categoriasSet.add(p.categoria);
        });
        set({
          productos,
          categorias: Array.from(categoriasSet),
          lastFetched: Date.now(),
        });
      },

      setLoading: (isLoading) => set({ isLoading }),

      getCategorias: () => get().categorias,

      shouldRefetch: () => {
        const { lastFetched } = get();
        if (!lastFetched) return true;
        return Date.now() - lastFetched > CACHE_DURATION;
      },

      clearCache: () => set({ productos: [], categorias: [], lastFetched: null }),
    }),
    {
      name: 'product-cache',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        productos: state.productos,
        categorias: state.categorias,
        lastFetched: state.lastFetched,
      }),
    }
  )
);
