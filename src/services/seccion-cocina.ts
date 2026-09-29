import api from './api';

export interface SeccionCocina {
  IDseccion: string;
  nombre: string;
  color: string;
  icono: string;
  orden: number;
  activa: boolean;
}

export const getSecciones = async (): Promise<SeccionCocina[]> => {
  const response = await api.get('/secciones-cocina');
  return response.data;
};

export const getSeccionesAll = async (): Promise<SeccionCocina[]> => {
  const response = await api.get('/secciones-cocina/all');
  return response.data;
};

export const getSeccion = async (id: string): Promise<SeccionCocina> => {
  const response = await api.get(`/secciones-cocina/${id}`);
  return response.data;
};

export const createSeccion = async (data: Omit<SeccionCocina, 'IDseccion' | 'createdAt' | 'updatedAt'>): Promise<SeccionCocina> => {
  const response = await api.post('/secciones-cocina', data);
  return response.data;
};

export const updateSeccion = async (id: string, data: Partial<SeccionCocina>): Promise<SeccionCocina> => {
  const response = await api.patch(`/secciones-cocina/${id}`, data);
  return response.data;
};

export const deleteSeccion = async (id: string): Promise<SeccionCocina> => {
  const response = await api.delete(`/secciones-cocina/${id}`);
  return response.data;
};
