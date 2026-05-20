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

export const cerrarCaja = async (id: string, data: CierreCajaPayload) => {
  const response = await api.patch(`/caja/cerrar/${id}`, data);
  return response.data;
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
  cantApertura?: number;
  ultimoConteoAt: string | null;
  conteoVerificadoHoy: boolean;
  diferenciaDetectada: boolean;
}

export interface VerificacionPendienteResponse {
  success: boolean;
  data: {
    pendientes: InsumoVerificacion[];
    totalPendientes: number;
    yaVerificadoHoy: boolean;
    todasVerificadas: boolean;
  };
}

export interface InsumoConteoPayload {
  idcierreyapertura: string;
  cantContada: number;
  diferenciaDetectada?: boolean;
  razonDiferencia?: string;
  pinConfirmacion?: string;
}

export const getVerificacionPendiente = async (cajaId: string): Promise<VerificacionPendienteResponse> => {
  const response = await api.get(`/caja/${cajaId}/verificacion-pendiente`);
  if (!response) {
    throw new Error('No se recibió respuesta del servidor');
  }
  return response.data || response;
};

export const registrarConteo = async (cajaId: string, insumos: InsumoConteoPayload[]) => {
  const response = await api.post(`/caja/${cajaId}/registrar-conteo`, { insumos });
  return response.data || response;
};
