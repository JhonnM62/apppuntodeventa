import api from './api';

export interface Turno {
  IDturno: string;
  usuarioId: string;
  fechaContable: string;
  horaEntrada: string;
  horaSalida?: string;
  fotoEntrada?: string;
  fotoSalida?: string;
  latitud?: number;
  longitud?: number;
  ceno?: boolean;
  cargoId?: string;
  salarioTurno?: number;
  valorTurno?: number;
  isTest?: boolean;
  isLiquidado?: boolean;
  estado: string;
  usuario?: any;
  createdAt: string;
  updatedAt: string;
}

export interface Descuento {
  IDdescuento: string;
  usuarioId: string;
  turnoId?: string;
  fecha: string;
  concepto: string;
  valor: number;
  visto: boolean;
  loteId?: string;
  usuario?: any;
  createdAt: string;
}

export const getTurnoActivo = async () => {
  const { data } = await api.get('/nomina/turno/activo-hoy');
  return data; // { success: true, data: Turno | null }
};

export const uploadAsistenciaImage = async (imageUri: string): Promise<string> => {
  const filename = imageUri.split('/').pop() || 'asistencia.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? (match[1].toLowerCase() === 'png' ? 'image/png' : `image/jpeg`) : `image/jpeg`;

  const formData = new FormData();
  formData.append('foto', {
    uri: imageUri,
    name: filename,
    type,
  } as any);

  const response = await api.post('/nomina/upload-asistencia', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data?.data?.url || '';
};

export const registrarEntrada = async (params: { 
  latitud?: number; 
  longitud?: number; 
  fotoUri?: string 
}) => {
  const formData = new FormData();
  if (params.latitud) formData.append('latitud', params.latitud.toString());
  if (params.longitud) formData.append('longitud', params.longitud.toString());

  if (params.fotoUri) {
    const filename = params.fotoUri.split('/').pop() || 'entrada.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : `image/jpeg`;
    formData.append('foto', { uri: params.fotoUri, name: filename, type } as any);
  }

  const { data } = await api.post('/nomina/turno/entrada', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

export const registrarSalida = async (id: string, params: {
  latitud?: number;
  longitud?: number;
  ceno: boolean;
  notaDeCena?: string;
}) => {
  const { data } = await api.patch(`/nomina/turno/${id}/salida`, params);
  return data;
};

export const getMisTurnos = async (params?: { limit?: number; page?: number; fechaDesde?: string; fechaHasta?: string }) => {
  const { data } = await api.get('/nomina/mis-turnos', { params });
  return data;
};

export const getMisDescuentos = async (params?: { visto?: boolean }) => {
  const { data } = await api.get('/nomina/mis-descuentos', { params });
  return data;
};

export const marcarDescuentoVisto = async (id: string) => {
  const { data } = await api.patch(`/nomina/descuento/${id}/visto`);
  return data;
};

export const createDescuento = async (descuento: {
  usuarioId: string;
  concepto: string;
  valor: number;
}) => {
  const { data } = await api.post('/nomina/descuento', descuento);
  return data;
};

export const getDescuentos = async (params?: { usuarioId?: string; fechaDesde?: string; fechaHasta?: string; estado?: string; page?: number; limit?: number }) => {
  const { data } = await api.get('/nomina/descuentos', { params });
  return data;
};

export const repartirDescuento = async (reparto: {
  usuarioIds: string[];
  montoTotal: number;
  concepto: string;
  descripcion: string;
}) => {
  const { data } = await api.post('/nomina/descuento/repartir', reparto);
  return data;
};

export const liquidarEmpleado = async (params: {
  usuarioId: string;
  fechaDesde: string;
  fechaHasta: string;
}) => {
  const { data } = await api.post('/nomina/liquidar', params);
  return data;
};

export const getTurnos = async (params?: { usuarioId?: string; fechaDesde?: string; fechaHasta?: string; estado?: string; limit?: number; page?: number }) => {
  const { data } = await api.get('/nomina/turnos', { params });
  return data;
};

export const getLiquidaciones = async (params?: { usuarioId?: string; page?: number; limit?: number }) => {
  const { data } = await api.get('/nomina/liquidaciones', { params });
  return data;
};

export const getResumenEmpleado = async (params?: { fechaDesde?: string; fechaHasta?: string }) => {
  const { data } = await api.get('/nomina/resumen/mio', { params });
  return data;
};

export const getResumenEmpleadoAdmin = async (usuarioId: string, params?: { fechaDesde?: string; fechaHasta?: string }) => {
  const { data } = await api.get(`/nomina/resumen/${usuarioId}`, { params });
  return data;
};
