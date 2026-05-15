import api from './api';

export interface Comentario {
  ID: string;
  comentarios: string;
  tipo?: string;
  precio?: number;
  createdAt?: string;
  updatedAt?: string;
}

export const getComentarios = async (): Promise<Comentario[]> => {
  const response = await api.get('/comentarios');
  return response?.data ?? response;
};

export const createComentario = async (data: Partial<Comentario>): Promise<Comentario> => {
  const response = await api.post('/comentarios', data);
  return response?.data ?? response;
};

export const updateComentario = async (id: string, data: Partial<Comentario>): Promise<Comentario> => {
  const response = await api.patch(`/comentarios/${id}`, data);
  return response?.data ?? response;
};

export const deleteComentario = async (id: string): Promise<void> => {
  await api.delete(`/comentarios/${id}`);
};
