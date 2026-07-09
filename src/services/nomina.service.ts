import { Platform } from 'react-native';
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
  observacion?: string;
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

/**
 * Convierte un URI (file://, blob:, data:) a un Blob real para FormData en Web.
 * En React Native el FileReader nativo del RN maneja { uri, name, type } directamente.
 */
const uriToBlob = async (uri: string, type: string): Promise<Blob> => {
  console.log(`[DEBUG uriToBlob] Iniciando fetch para URI:`, uri);
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    console.log(`[DEBUG uriToBlob] Fetch exitoso. Blob size:`, blob.size, `type:`, blob.type);
    return blob;
  } catch (error) {
    console.error(`[DEBUG uriToBlob] ERROR al hacer fetch del URI:`, error);
    
    // Fallback: si fetch falla y es un data URI (muy común en base64 de Expo Web)
    if (uri.startsWith('data:')) {
      console.log(`[DEBUG uriToBlob] Intentando fallback manual de base64...`);
      try {
        const arr = uri.split(',');
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type });
      } catch (fallbackError) {
        console.error(`[DEBUG uriToBlob] Fallback falló:`, fallbackError);
      }
    }
    
    throw error;
  }
};

export const uploadAsistenciaImage = async (imageUri: string): Promise<string> => {
  const filename = imageUri.split('/').pop() || 'asistencia.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? (match[1].toLowerCase() === 'png' ? 'image/png' : `image/jpeg`) : `image/jpeg`;

  const formData = new FormData();

  if (Platform.OS === 'web') {
    // En Web: convertir URI a Blob real que el browser pueda enviar
    const blob = await uriToBlob(imageUri, type);
    formData.append('foto', blob, filename);
  } else {
    // En React Native APK: usar la sintaxis nativa { uri, name, type }
    formData.append('foto', { uri: imageUri, name: filename, type } as any);
  }

  const response = await api.post('/nomina/upload-asistencia', formData, {
    // IMPORTANTE: No establecer Content-Type en web — el browser lo agrega
    // automáticamente con el boundary correcto para multipart/form-data.
    // En RN sí hay que forzarlo.
    headers: Platform.OS === 'web' ? undefined : { 'Content-Type': 'multipart/form-data' },
  });

  return response.data?.data?.url || '';
};

export const registrarEntrada = async (params: { 
  latitud?: number; 
  longitud?: number; 
  fotoUri?: string;
  observacion?: string;
}) => {
  console.log(`[DEBUG registrarEntrada] Iniciando... Platform:`, Platform.OS);
  const formData = new FormData();
  if (params.latitud) formData.append('latitud', params.latitud.toString());
  if (params.longitud) formData.append('longitud', params.longitud.toString());
  if (params.observacion) formData.append('observacion', params.observacion);

  if (params.fotoUri) {
    const filename = params.fotoUri.split('/').pop() || 'entrada.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : `image/jpeg`;

    if (Platform.OS === 'web') {
      console.log(`[DEBUG registrarEntrada] Convirtiendo URI a Blob en Web...`);
      // Web: convertir URI a Blob real
      const blob = await uriToBlob(params.fotoUri, type);
      formData.append('foto', blob, filename);
      console.log(`[DEBUG registrarEntrada] Blob agregado al FormData en Web`);
    } else {
      console.log(`[DEBUG registrarEntrada] Usando sintaxis nativa de RN para FormData`);
      // APK React Native: sintaxis nativa
      formData.append('foto', { uri: params.fotoUri, name: filename, type } as any);
    }
  }

  console.log(`[DEBUG registrarEntrada] Enviando petición a /nomina/turno/entrada`);
  try {
    const { data } = await api.post('/nomina/turno/entrada', formData);
    console.log(`[DEBUG registrarEntrada] Petición exitosa:`, data);
    return data;
  } catch (error: any) {
    console.error(`[DEBUG registrarEntrada] ERROR en petición:`, error?.response?.data || error);
    throw error;
  }
};

export const registrarSalida = async (id: string, params: {
  latitud?: number;
  longitud?: number;
  fotoUri?: string;
  ceno: boolean;
  notaDeCena?: string;
  observacion?: string;
}) => {
  const formData = new FormData();
  formData.append('ceno', String(params.ceno));
  
  if (params.latitud !== undefined) formData.append('latitud', String(params.latitud));
  if (params.longitud !== undefined) formData.append('longitud', String(params.longitud));
  
  const obs = params.observacion || params.notaDeCena;
  if (obs) formData.append('observacion', obs);

  if (params.fotoUri) {
    const filename = params.fotoUri.split('/').pop() || 'selfie_out.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';
    
    if (Platform.OS === 'web') {
      console.log(`[DEBUG registrarSalida] Convirtiendo URI a Blob en Web...`);
      // Web: convertir URI a Blob real
      const blob = await uriToBlob(params.fotoUri, type);
      formData.append('foto', blob, filename);
      console.log(`[DEBUG registrarSalida] Blob agregado al FormData en Web`);
    } else {
      console.log(`[DEBUG registrarSalida] Usando sintaxis nativa de RN para FormData`);
      // APK React Native: sintaxis nativa
      formData.append('foto', { uri: params.fotoUri, name: filename, type } as any);
    }
  }

  console.log(`[DEBUG registrarSalida] Enviando petición a /nomina/turno/${id}/salida`);
  try {
    const { data } = await api.patch(`/nomina/turno/${id}/salida`, formData);
    console.log(`[DEBUG registrarSalida] Petición exitosa:`, data);
    return data;
  } catch (error: any) {
    console.error(`[DEBUG registrarSalida] ERROR en petición:`, error?.response?.data || error);
    throw error;
  }
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
  fecha?: string;
}) => {
  const { data } = await api.post('/nomina/descuento/repartir', reparto);
  return data;
};

export const liquidarEmpleado = async (data: { usuarioId: string, fechaDesde: string, fechaHasta: string, firmaAdmin?: string, extraTurnosIds?: string[] }) => {
  const response = await api.post('/nomina/liquidar', {
    usuarioId: data.usuarioId,
    fechaInicio: data.fechaDesde,
    fechaFin: data.fechaHasta,
    extraTurnosIds: data.extraTurnosIds,
    firmaAdmin: data.firmaAdmin
  });
  return response.data;
};

// --- FIRMA DEL EMPLEADO ---

export const firmarLiquidacion = async (liquidacionId: string, data: { firmaEmpleado: string }) => {
  const response = await api.post(`/nomina/liquidar/${liquidacionId}/firmar`, data);
  return response.data;
};

export const getLiquidacionById = async (liquidacionId: string) => {
  const response = await api.get(`/nomina/liquidaciones/${liquidacionId}`);
  return response.data;
};

export const getLiquidaciones = async (params?: { usuarioId?: string; page?: number; limit?: number }) => {
  const response = await api.get('/nomina/liquidaciones', { params });
  return response.data;
};

export const reenviarNotificacionFirma = async (liquidacionId: string) => {
  const response = await api.post(`/nomina/liquidaciones/${liquidacionId}/reenviar-notificacion`);
  return response.data;
};

// --- TURNOS MANUALES ---

export const createTurnoManual = async (data: { usuarioId: string, fechas: string[], horaEntrada: string, horaSalida?: string }) => {
  const response = await api.post('/nomina/turno/manual', data);
  return response.data;
};

export const getTurnos = async (params?: { usuarioId?: string; fechaDesde?: string; fechaHasta?: string; estado?: string; limit?: number; page?: number }) => {
  const { data } = await api.get('/nomina/turnos', { params });
  return data;
};

export const updateTurnoAdmin = async (id: string, params: { horaEntrada?: Date; horaSalida?: Date; ceno?: boolean; valorTurno?: number; estado?: string }) => {
  const { data } = await api.patch(`/nomina/turno/${id}`, params);
  return data;
};

export const deleteTurno = async (id: string) => {
  const { data } = await api.delete(`/nomina/turno/${id}`);
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

export const updateDescuento = async (id: string, params: { descripcion?: string; valor?: number; estado?: string }) => {
  const { data } = await api.patch(`/nomina/descuento/${id}`, params);
  return data;
};

export const deleteDescuento = async (descuentoId: string) => {
  const { data } = await api.delete(`/nomina/descuento/${descuentoId}`);
  return data;
};

export const getLote = async (loteId: string) => {
  const { data } = await api.get(`/nomina/descuentos/lote/${loteId}`);
  return data;
};

export const updateLote = async (loteId: string, dto: {
  usuarioIds: string[];
  montoTotal: number;
  concepto: string;
  descripcion: string;
  fecha?: string;
}) => {
  const { data } = await api.patch(`/nomina/descuentos/lote/${loteId}`, dto);
  return data;
};

export const deleteLote = async (loteId: string) => {
  const { data } = await api.delete(`/nomina/descuentos/lote/${loteId}`);
  return data;
};

