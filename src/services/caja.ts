import api from './api';

export interface InsumoApertura {
  nombreInsumo: string;
  cantApertura: number;
  unidadDeMedida?: string;
  categoria?: string;
}

export interface InsumoCierre {
  nombreInsumo: string;
  cantDeCierre: number;
}

export interface AperturaCajaPayload {
  nombre?: string;
  apertura?: string;
  efectivoDeApertura?: number;
  insumos?: InsumoApertura[];
}

export interface CierreCajaPayload {
  efectivoDeCierre?: number;
  resumen?: number;
  plataGuardada?: number;
  valorFaltante?: number;
  valorExcedente?: number;
  observaciones?: string;
  insumos?: InsumoCierre[];
}

export const checkCajaActiva = async () => {
  const response = await api.get('/caja/activa');
  return response.data;
};

export const getCajas = async () => {
  const response = await api.get('/caja');
  return response.data;
};

export const abrirCaja = async (data: AperturaCajaPayload) => {
  const response = await api.post('/caja/abrir', data);
  return response.data;
};

import { useSyncStore } from '../store/useSyncStore';
import Toast from 'react-native-toast-message';

export const cerrarCaja = async (id: string, data: CierreCajaPayload) => {
  try {
    const response = await api.patch(`/caja/cerrar/${id}`, data);
    return response.data;
  } catch (error: any) {
    if (error.message === 'Network Error' || error.code === 'ECONNABORTED' || !error.response) {
      console.log(`[Offline] Guardando cierre de caja en cola local...`);
      useSyncStore.getState().enqueueAction({
        type: 'PATCH',
        url: `/caja/cerrar/${id}`,
        payload: data,
      });
      Toast.show({
        type: 'info',
        text1: 'Cierre Offline',
        text2: 'Se ha forzado el cierre localmente. No borres los datos de la app hasta reconectar.',
      });
      return {
        success: true,
        offline: true,
        data: {
          id,
          ...data,
          estado: 'CERRADA',
          horaCierre: new Date().toISOString(),
        }
      };
    }
    throw error;
  }
};

export const reabrirCaja = async (id: string) => {
  const response = await api.patch(`/caja/reabrir/${id}`);
  return response.data || response;
};

export const updateCaja = async (id: string, data: Partial<CierreCajaPayload> & { horaCongelada?: string }) => {
  const response = await api.patch(`/caja/${id}`, data);
  return response.data;
};

export const getResumenCaja = async (id: string, horaCorteSnapshot?: string) => {
  let url = `/caja/resumen/${id}`;
  if (horaCorteSnapshot) {
    url += `?horaCorteSnapshot=${encodeURIComponent(horaCorteSnapshot)}`;
  }
  const response = await api.get(url);
  return response.data;
};

export const deleteCaja = async (id: string) => {
  const response = await api.delete(`/caja/${id}`);
  return response.data;
};

export interface InsumoVerificacion {
  id: string;
  nombre: string;
  unidadDeMedida: string;
  disponibleEnSistema: number;
  ultimoConteoAt: string | null;
  conteoVerificadoHoy: boolean;
}

export interface VerificacionPendienteResponse {
  pendientes: InsumoVerificacion[];
  totalPendientes: number;
  yaVerificadoHoy: boolean;
  todasVerificadas: boolean;
  contadorPosposiciones: number;
  posposicionesRestantes: number;
  puedePosponer: boolean;
}

export interface InsumoConteoPayload {
  idInsumo: string;
  cantContada: number;
  disponibleEnSistema: number;
}

export const getVerificacionPendiente = async (cajaId: string): Promise<VerificacionPendienteResponse> => {
  const response = await api.get(`/caja/${cajaId}/verificacion-pendiente`);
  if (!response) {
    throw new Error('No se recibió respuesta del servidor');
  }
  if (response?.data) {
    return response.data as VerificacionPendienteResponse;
  }
  return response as unknown as VerificacionPendienteResponse;
};

export const registrarConteo = async (cajaId: string, insumos: InsumoConteoPayload[]) => {
  const response = await api.post(`/caja/${cajaId}/registrar-conteo`, { insumos });
  return response.data || response;
};

export const posponerVerificacion = async (cajaId: string) => {
  const response = await api.post(`/caja/${cajaId}/posponer-verificacion`);
  return response.data || response;
};

export const eliminarConteo = async (cajaId: string, insumoId: string, conteoIndex: number) => {
  const response = await api.delete(`/caja/${cajaId}/insumo/${insumoId}/conteo/${conteoIndex}`);
  return response.data;
};

export const editarConteo = async (cajaId: string, insumoId: string, conteoIndex: number, cantContada: number) => {
  const { data } = await api.patch(`/caja/${cajaId}/insumo/${insumoId}/conteo/${conteoIndex}`, { cantContada });
  return data;
};

export const getAutoCuadrePreview = async (cajaId: string) => {
  const { data } = await api.post(`/caja/${cajaId}/auto-cuadre/preview`, {}, { timeout: 30000 });
  return data;
};

export const executeAutoCuadre = async (cajaId: string, planIA: any) => {
  const { data } = await api.post(`/caja/${cajaId}/auto-cuadre/execute`, planIA, { timeout: 30000 });
  return data;
};
