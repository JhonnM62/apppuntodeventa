import { create } from 'zustand';
import { 
  ReporteFilter, 
  DetalleDineroGuardado, 
  getReportesDineroGuardado, 
  crearReporteDineroGuardado,
  eliminarReporteDineroGuardado,
  getDetalleDineroGuardado,
  crearRetiroDinero,
  eliminarRetiroDinero
} from '../services/reportes';

interface ReportesState {
  reportesDineroGuardado: ReporteFilter[];
  detalleActual: DetalleDineroGuardado | null;
  isLoading: boolean;
  error: string | null;
  
  fetchReportesDineroGuardado: () => Promise<void>;
  crearReporte: (startDate: string, endDate: string) => Promise<void>;
  eliminarReporte: (filterId: string) => Promise<void>;
  fetchDetalleDineroGuardado: (filterId: string) => Promise<void>;
  crearRetiro: (filterId: string, retiroId: string, monto: number, observacion: string) => Promise<void>;
  eliminarRetiro: (filterId: string, retiroId: string) => Promise<void>;
}

export const useReportesStore = create<ReportesState>((set, get) => ({
  reportesDineroGuardado: [],
  detalleActual: null,
  isLoading: false,
  error: null,

  fetchReportesDineroGuardado: async () => {
    set({ isLoading: true, error: null });
    try {
      const res: any = await getReportesDineroGuardado();
      let data = res;
      if (res && res.success !== undefined && res.data) {
        data = res.data;
      } else if (res && res.data && res.data.data) {
        data = res.data.data;
      }
      set({ reportesDineroGuardado: data || [], isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  crearReporte: async (startDate: string, endDate: string) => {
    set({ isLoading: true, error: null });
    try {
      await crearReporteDineroGuardado(startDate, endDate);
      await get().fetchReportesDineroGuardado(); // recargar lista
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  eliminarReporte: async (filterId: string) => {
    set({ isLoading: true, error: null });
    try {
      await eliminarReporteDineroGuardado(filterId);
      await get().fetchReportesDineroGuardado(); // recargar lista
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  fetchDetalleDineroGuardado: async (filterId) => {
    set({ isLoading: true, error: null });
    try {
      const res: any = await getDetalleDineroGuardado(filterId);
      // El interceptor de Axios general envuelve todo en `res.data` para las respuestas de Axios, pero el backend devuelve { success: true, data: { ... } }
      // Entonces si `res` tiene `success: true` y `data`, la info real está en `res.data`.
      // Si no, podría estar en `res.data.data` (si Axios y el Interceptor anidan doble).
      let data = res;
      if (res && res.success !== undefined && res.data) {
        data = res.data;
      } else if (res && res.data && res.data.data) {
        data = res.data.data;
      }
      
      set({ detalleActual: data || null, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  crearRetiro: async (filterId, retiroId, monto, observacion) => {
    set({ isLoading: true, error: null });
    try {
      await crearRetiroDinero(filterId, { retiroId, monto, observacion });
      const res: any = await getDetalleDineroGuardado(filterId);
      let data = res;
      if (res && res.success !== undefined && res.data) {
        data = res.data;
      } else if (res && res.data && res.data.data) {
        data = res.data.data;
      }
      set({ detalleActual: data || null, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  eliminarRetiro: async (filterId, retiroId) => {
    set({ isLoading: true, error: null });
    try {
      await eliminarRetiroDinero(retiroId);
      const res: any = await getDetalleDineroGuardado(filterId);
      let data = res;
      if (res && res.success !== undefined && res.data) {
        data = res.data;
      } else if (res && res.data && res.data.data) {
        data = res.data.data;
      }
      set({ detalleActual: data || null, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  }
}));
