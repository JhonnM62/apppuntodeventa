import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EstadisticasGenerales, getEstadisticasGenerales, getInsumosDescuadres, getInsumosPreciosMulti, VariacionPreciosResponse } from '../services/estadisticas';

interface EstadisticasState {
  data: EstadisticasGenerales | null;
  auditoriaData: any | null;
  preciosData: VariacionPreciosResponse['data'] | null;
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;
  fetchData: (startDate?: string, endDate?: string, categoriaProducto?: string, vendedorId?: string) => Promise<void>;
  fetchAuditoriaData: (startDate: string, endDate: string) => Promise<void>;
  fetchPreciosData: (startDate: string, endDate: string, categoriaId?: string) => Promise<void>;
}

export const useEstadisticasStore = create<EstadisticasState>()(
  persist(
    (set, get) => ({
      data: null,
      auditoriaData: null,
      preciosData: null,
      isLoading: false,
      error: null,
      lastFetched: null,
      fetchData: async (startDate, endDate, categoriaProducto, vendedorId) => {
        // Simple cache invalidation (e.g., 5 minutes) could be added here,
        // but since filters change often, we fetch but keep the old data visible while loading
        set({ isLoading: true, error: null });
        try {
          const result = await getEstadisticasGenerales(startDate, endDate, categoriaProducto, vendedorId);
          set({ data: result, isLoading: false, lastFetched: Date.now() });
        } catch (error: any) {
          set({ error: error.message || 'Error', isLoading: false });
        }
      },
      fetchAuditoriaData: async (startDate, endDate) => {
        set({ isLoading: true, error: null });
        try {
          const result = await getInsumosDescuadres(startDate, endDate);
          set({ auditoriaData: result, isLoading: false });
        } catch (error: any) {
          set({ error: error.message || 'Error', isLoading: false });
        }
      },
      fetchPreciosData: async (startDate, endDate, categoriaId) => {
        set({ isLoading: true, error: null });
        try {
          const res = await getInsumosPreciosMulti(startDate, endDate, categoriaId);
          set({ preciosData: res?.data || null, isLoading: false });
        } catch (error: any) {
          set({ error: error.message || 'Error', isLoading: false });
        }
      },
    }),
    {
      name: 'estadisticas-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ data: state.data, lastFetched: state.lastFetched }), // Only persist data
    }
  )
);
