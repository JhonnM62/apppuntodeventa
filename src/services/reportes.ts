import api from './api';

export interface CajaReporte {
  IDcaja: string;
  nombre: string;
  fechaDeApertura: string;
  plataGuardada: number;
  cuadroCaja: string;
  valorFaltante: number;
  valorExcedente: number;
}

export interface DineroRetirado {
  IDretiro: string;
  filterID: string;
  valor: number;
  retiro: number;
  sobrante: number;
  total: number;
  fechaYHora: string;
  observacion: string;
}

export interface ReporteFilter {
  FilterID: string;
  desde: string;
  hasta: string;
  tipoDeFiltro: string;
  totalDePlataGuardada: number;
}

export interface DetalleDineroGuardado {
  reporte: ReporteFilter;
  cajas: CajaReporte[];
  plataGuardadaInicial: number;
  totalRetirado: number;
  sobranteActual: number;
  retiros: DineroRetirado[];
}

export const getReportesDineroGuardado = async (): Promise<ReporteFilter[]> => {
  const data = await api.get('/reportes/dinero-guardado');
  return data as any;
};

export const crearReporteDineroGuardado = async (startDate: string, endDate: string): Promise<ReporteFilter> => {
  const data = await api.post('/reportes/dinero-guardado', { startDate, endDate });
  return data as any;
};

export const eliminarReporteDineroGuardado = async (filterId: string) => {
  const data = await api.delete(`/reportes/dinero-guardado/${filterId}`);
  return data;
};

export const getDetalleDineroGuardado = async (filterId: string): Promise<DetalleDineroGuardado> => {
  const data = await api.get(`/reportes/dinero-guardado/${filterId}`);
  return data as any;
};

export const crearRetiroDinero = async (filterId: string, payload: { retiroId: string; monto: number; observacion: string }) => {
  const data = await api.post(`/reportes/dinero-guardado/${filterId}/retiros`, payload);
  return data;
};

export const eliminarRetiroDinero = async (retiroId: string) => {
  const data = await api.delete(`/reportes/dinero-guardado/retiros/${retiroId}`);
  return data;
};
