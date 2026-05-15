import { create } from 'zustand';
import { Gasto, getGastos, createGasto, updateGasto, deleteGasto } from '../services/gastos';

interface GastosState {
  gastos: Gasto[];
  isLoading: boolean;
  error: string | null;
  meta: any;
  fetchGastos: (params?: any) => Promise<void>;
  addGasto: (gasto: Partial<Gasto>) => Promise<void>;
  editGasto: (id: string, gasto: Partial<Gasto>) => Promise<void>;
  removeGasto: (id: string) => Promise<void>;
}

export const useGastosStore = create<GastosState>((set, get) => ({
  gastos: [],
  isLoading: false,
  error: null,
  meta: null,

  fetchGastos: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const result = await getGastos(params);
      const data = Array.isArray(result?.data) ? result.data : [];
      set({ gastos: data, meta: result?.meta, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  addGasto: async (gasto) => {
    try {
      await createGasto(gasto);
      // Refetch
      await get().fetchGastos();
    } catch (error: any) {
      throw error;
    }
  },

  editGasto: async (id, gasto) => {
    try {
      await updateGasto(id, gasto);
      await get().fetchGastos();
    } catch (error: any) {
      throw error;
    }
  },

  removeGasto: async (id) => {
    try {
      await deleteGasto(id);
      await get().fetchGastos();
    } catch (error: any) {
      throw error;
    }
  }
}));
