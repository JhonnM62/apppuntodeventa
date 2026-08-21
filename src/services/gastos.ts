import api from './api';

export interface Gasto {
  IDgastos: string;
  concepto: string;
  fechaYHora: string;
  fecha: string;
  valor: number;
  fotos?: string;
  medioDePago?: string;
  relacionConInsumos?: string;
  tipo: 'NEGOCIO' | 'PERSONAL';
}

export const getGastos = async (params?: { page?: number; limit?: number; tipo?: string; fechaDesde?: string; fechaHasta?: string }) => {
  const { data } = await api.get('/gastos', { params });
  return data; // { data: Gasto[], meta: any }
};

export const getGastoById = async (id: string) => {
  const { data } = await api.get(`/gastos/${id}`);
  return data;
};

import { useSyncStore } from '../store/useSyncStore';
import Toast from 'react-native-toast-message';

export const createGasto = async (gasto: Partial<Gasto>) => {
  try {
    const { data } = await api.post('/gastos', gasto);
    return data;
  } catch (error: any) {
    if (error.message === 'Network Error' || error.code === 'ECONNABORTED' || !error.response) {
      console.log(`[Offline] Guardando gasto en cola local...`);
      useSyncStore.getState().enqueueAction({
        type: 'POST',
        url: '/gastos',
        payload: gasto,
      });
      Toast.show({
        type: 'info',
        text1: 'Gasto Guardado Localmente',
        text2: 'Sin conexión. El gasto se sincronizará cuando vuelva el internet.',
      });
      return {
        ...gasto,
        IDgastos: 'offline-' + Date.now(),
        fechaYHora: new Date().toISOString(),
      };
    }
    throw error;
  }
};

export const createBulkGastos = async (gastos: Partial<Gasto>[]) => {
  const { data } = await api.post('/gastos/bulk', { gastos });
  return data;
};

export const updateGasto = async (id: string, gasto: Partial<Gasto>) => {
  const { data } = await api.patch(`/gastos/${id}`, gasto);
  return data;
};

export const deleteGasto = async (id: string) => {
  const { data } = await api.delete(`/gastos/${id}`);
  return data;
};

import { Platform } from 'react-native';

export const uploadGastoImage = async (imageUri: string): Promise<string> => {
  const formData = new FormData();

  if (Platform.OS === 'web') {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    formData.append('file', blob, 'comprobante.jpg');
  } else {
    const filename = imageUri.split('/').pop() || 'comprobante.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? (match[1].toLowerCase() === 'pdf' ? 'application/pdf' : `image/${match[1]}`) : `image/jpeg`;

    formData.append('file', {
      uri: imageUri,
      name: filename,
      type,
    } as any);
  }

  const response = await api.post('/gastos/upload-image', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data?.imageUrl || (response as any).imageUrl || '';
};
