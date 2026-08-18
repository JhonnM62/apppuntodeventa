import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface VentaItem {
  IDventas: string;
  pedido?: string;
  estado?: string;
  medioDePago?: string;
  efectivoRecibido?: number;
  devueltas?: number;
  banco?: string;
  totalInput?: number;
  mesa?: string;
  ordenVentas?: any[];
  createdAt?: string;
  [key: string]: any;
}

interface SalesStore {
  ventas: VentaItem[];
  lastFetched: number | null;
  isLoading: boolean;
  setVentas: (ventas: VentaItem[]) => void;
  addVenta: (venta: VentaItem) => void;
  updateVenta: (ventaId: string, updates: Partial<VentaItem>) => void;
  removeVenta: (ventaId: string) => void;
  setLoading: (loading: boolean) => void;
  shouldRefetch: () => boolean;
  clearCache: () => void;
  getVentasByEstado: (estado: string) => VentaItem[];
  getPendingOrdersCount: () => number;
}

const CACHE_DURATION = 2 * 60 * 1000;

export const useSalesStore = create<SalesStore>()(
  persist(
    (set, get) => ({
      ventas: [],
      lastFetched: null,
      isLoading: false,

      setVentas: (ventas) => {
        // Asegurarnos de que siempre estamos guardando un array
        const ventasArray = Array.isArray(ventas) ? ventas : (ventas as any)?.data || [];
        set({ ventas: ventasArray, lastFetched: Date.now() });
      },

      addVenta: (venta) => {
        const { ventas } = get();
        const ventasArray = Array.isArray(ventas) ? ventas : [];
        const existsIndex = ventasArray.findIndex(v => v.IDventas === venta.IDventas);
        if (existsIndex >= 0) {
          const updatedVentas = [...ventasArray];
          updatedVentas[existsIndex] = { ...updatedVentas[existsIndex], ...venta };
          set({ ventas: updatedVentas, lastFetched: Date.now() });
        } else {
          set({ ventas: [venta, ...ventasArray], lastFetched: Date.now() });
        }
      },

      updateVenta: (ventaId, updates) => {
        const { ventas } = get();
        const ventasArray = Array.isArray(ventas) ? ventas : [];
        const updatedVentas = ventasArray.map(v =>
          v.IDventas === ventaId ? { ...v, ...updates } : v
        );
        set({ ventas: updatedVentas, lastFetched: Date.now() });
      },

      removeVenta: (ventaId) => {
        const { ventas } = get();
        const ventasArray = Array.isArray(ventas) ? ventas : [];
        set({ ventas: ventasArray.filter(v => v.IDventas !== ventaId) });
      },

      setLoading: (isLoading) => set({ isLoading }),

      shouldRefetch: () => {
        const { lastFetched } = get();
        if (!lastFetched) return true;
        return Date.now() - lastFetched > CACHE_DURATION;
      },

      clearCache: () => set({ ventas: [], lastFetched: null }),

      getVentasByEstado: (estado) => {
        const { ventas } = get();
        if (!Array.isArray(ventas)) return [];
        if (estado === 'todos') return ventas;
        return ventas.filter(v => {
          const estadoUpper = (v.estado || '').toUpperCase().replace(/_/g, ' ');
          const targetUpper = estado.toUpperCase().replace(/_/g, ' ');
          return estadoUpper === targetUpper;
        });
      },

      getPendingOrdersCount: () => {
        const { ventas } = get();
        if (!Array.isArray(ventas)) return 0;
        return ventas.filter(v => 
          v.estado && v.estado !== 'PAGADO' && v.estado !== 'ENTREGADO'
        ).length;
      },
    }),
    {
      name: 'sales-cache',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => {
        const ventasArray = Array.isArray(state.ventas) ? state.ventas : [];
        // Para evitar QuotaExceededError (5MB limit en web localStorage), 
        // persistimos todos los pendientes y solo los 50 pagados/entregados más recientes.
        const pending = ventasArray.filter(v => v.estado && v.estado !== 'PAGADO' && v.estado !== 'ENTREGADO');
        const completed = ventasArray.filter(v => v.estado === 'PAGADO' || v.estado === 'ENTREGADO').slice(0, 50);
        
        return {
          ventas: [...pending, ...completed],
          lastFetched: state.lastFetched,
        };
      },
    }
  )
);
