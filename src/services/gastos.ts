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

export const createGasto = async (gasto: Partial<Gasto>) => {
  const { data } = await api.post('/gastos', gasto);
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

export const uploadGastoImage = async (imageUri: string): Promise<string> => {
  const filename = imageUri.split('/').pop() || 'comprobante.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? (match[1].toLowerCase() === 'pdf' ? 'application/pdf' : `image/${match[1]}`) : `image/jpeg`;

  const formData = new FormData();
  formData.append('file', {
    uri: imageUri,
    name: filename,
    type,
  } as any);

  const response = await api.post('/gastos/upload-image', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data?.imageUrl || (response as any).imageUrl || '';
};
