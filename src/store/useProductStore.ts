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
  reservasGlobales: Record<string, number>;
  setProductos: (productos: any[]) => void;
  setReservasGlobales: (reservas: Record<string, number>) => void;
  updateReservaGlobal: (productoId: string, cantidad: number) => void;
  setLoading: (loading: boolean) => void;
  getDisponibilidadReal: (productoId: string) => number;
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
      reservasGlobales: {},

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

      setReservasGlobales: (reservas) => set({ reservasGlobales: reservas }),
      
      updateReservaGlobal: (productoId, cantidad) => set((state) => ({
        reservasGlobales: {
          ...state.reservasGlobales,
          [productoId]: Math.max(0, cantidad)
        }
      })),

      setLoading: (isLoading) => set({ isLoading }),

      getDisponibilidadReal: (productoId: string) => {
        const state = get();
        const p = state.productos.find((prod: any) => prod.IDproductos === productoId);
        if (!p) return 0;
        
        let maxPossible = Number(p.disponibilidadCalculada ?? p.cantidad ?? p.Stock ?? 0);
        
        if (p.insumosRequeridos && p.insumosRequeridos.length > 0) {
          // Calculate insumosReservadosGlobales first
          const insumosReservadosGlobales: Record<string, number> = {};
          state.productos.forEach((prod: any) => {
            const reservado = state.reservasGlobales[prod.IDproductos] || 0;
            if (reservado > 0 && prod.insumosRequeridos && prod.insumosRequeridos.length > 0) {
              prod.insumosRequeridos.forEach((ins: any) => {
                insumosReservadosGlobales[ins.IDinsumo] = (insumosReservadosGlobales[ins.IDinsumo] || 0) + (ins.cantidad * reservado);
              });
            }
          });

          maxPossible = Infinity;
          p.insumosRequeridos.forEach((ins: any) => {
            const stockRestante = Math.max(0, ins.stockGlobal - (insumosReservadosGlobales[ins.IDinsumo] || 0));
            const cantRequerida = ins.cantidad;
            if (cantRequerida > 0) {
              const possible = Math.floor(stockRestante / cantRequerida);
              if (possible < maxPossible) maxPossible = possible;
            }
          });
          if (maxPossible === Infinity) maxPossible = 0;
        } else {
          const reservado = state.reservasGlobales[p.IDproductos] || 0;
          maxPossible = Math.max(0, maxPossible - reservado);
        }
        
        return maxPossible;
      },

      getCategorias: () => get().categorias,

      shouldRefetch: () => {
        const { lastFetched } = get();
        if (!lastFetched) return true;
        return Date.now() - lastFetched > CACHE_DURATION;
      },

      clearCache: () => set({ lastFetched: null }),
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
