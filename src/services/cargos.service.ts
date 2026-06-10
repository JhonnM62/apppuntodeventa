import api from './api';

export interface Cargo {
  IDcargo: string;
  nombre: string;
  salarioBase: number;
  esFijo: boolean;
  createdAt: string;
  updatedAt: string;
}

export const getCargos = async () => {
  const { data } = await api.get('/cargos');
  return data; // { success: true, data: Cargo[] }
};

export const getCargoById = async (id: string) => {
  const { data } = await api.get(`/cargos/${id}`);
  return data;
};

export const createCargo = async (cargo: Partial<Cargo>) => {
  const { data } = await api.post('/cargos', cargo);
  return data;
};

export const updateCargo = async (id: string, cargo: Partial<Cargo>) => {
  const { data } = await api.patch(`/cargos/${id}`, cargo);
  return data;
};

export const deleteCargo = async (id: string) => {
  const { data } = await api.delete(`/cargos/${id}`);
  return data;
};
