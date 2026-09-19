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
  _hasHydrated: boolean;
  setVentas: (ventas: VentaItem[]) => void;
  addVenta: (venta: VentaItem) => void;
  updateVenta: (ventaId: string, updates: Partial<VentaItem>) => void;
  removeVenta: (ventaId: string) => void;
  setLoading: (loading: boolean) => void;
  shouldRefetch: () => boolean;
  clearCache: () => void;
  getVentasByEstado: (estado: string) => VentaItem[];
  getPendingOrdersCount: () => number;
  calculateNextPedidoNumber: (mesaNombre: string, userName: string) => string;
}

const CACHE_DURATION = 2 * 60 * 1000;

export const useSalesStore = create<SalesStore>()(
  persist(
    (set, get) => ({
      ventas: [],
      lastFetched: null,
      isLoading: false,
      _hasHydrated: false,

      setVentas: (ventas: any) => {
        let ventasArray: VentaItem[] = [];
        if (Array.isArray(ventas)) {
          ventasArray = ventas;
        } else if (ventas?.data && Array.isArray(ventas.data)) {
          ventasArray = ventas.data;
        } else if (ventas?.data?.data && Array.isArray(ventas.data.data)) {
          ventasArray = ventas.data.data;
        }
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
          v.estado === 'en_proceso' || 
          v.estado === 'listo'
        ).length;
      },

      calculateNextPedidoNumber: (mesaNombre: string, userName: string) => {
        const { ventas } = get();
        let maxConsecutivo = 0;
        const ventasArray = Array.isArray(ventas) ? ventas : [];
        for (const venta of ventasArray) {
          if (venta.pedido && typeof venta.pedido === 'string') {
            const match = venta.pedido.match(/-(\d+)$/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxConsecutivo) {
                maxConsecutivo = num;
              }
            }
          }
        }
        const siguienteNumero = maxConsecutivo + 1;
        const numeroConsecutivo = siguienteNumero.toString().padStart(3, '0');
        
        let mesaStr = 'V.R';
        if (mesaNombre && mesaNombre !== 'V.R' && mesaNombre !== 'CAJA') {
          mesaStr = mesaNombre; 
        }

        const inicial = userName ? userName.charAt(0).toUpperCase() : 'X';
        return `${mesaStr}-${inicial}-${numeroConsecutivo}`;
      }
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
          // FIX: NO persistir lastFetched. Esto fuerza un API call fresco en cada carga de página,
          // evitando que el cache shortcircuit muestre solo pedidos locales en navegadores móviles.
        };
      },
      // FIX: merge personalizado para que la hidratación no sobrescriba datos frescos del API.
      // Si el store actual ya tiene datos frescos (lastFetched reciente), conservarlos.
      // Solo restaurar datos persistidos si el store está vacío (arranque fresco).
      merge: (persistedState, currentState) => {
        const current = currentState as SalesStore;
        // Si el store actual ya fue poblado por un fetch del API (tiene lastFetched),
        // NO dejar que la hidratación sobrescriba con datos viejos del localStorage.
        if (current.lastFetched && current.ventas.length > 0) {
          return { ...current, _hasHydrated: true };
        }
        // Si el store está vacío (arranque fresco), restaurar los datos persistidos
        const persisted = (persistedState as Partial<SalesStore>) || {};
        const persistedVentas = Array.isArray(persisted.ventas) ? persisted.ventas : [];
        return {
          ...current,
          ventas: persistedVentas.length > 0 ? persistedVentas : current.ventas,
          // No restaurar lastFetched — forzar un fetch fresco
          _hasHydrated: true,
        };
      },
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (error) {
            console.warn('[useSalesStore] Error al rehidratar desde localStorage:', error);
          }
          // Marcar como hidratado para que fetchVentas sepa que puede confiar en el cache
          useSalesStore.setState({ _hasHydrated: true });
        };
      },
    }
  )
);
