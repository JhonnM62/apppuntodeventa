import api from './api';

export interface Mesa {
  IdMesas: string;
  nombre: string;
}

export const getMesas = async (): Promise<Mesa[]> => {
  try {
    const response = await api.get('/mesas');
    if (Array.isArray(response)) {
      return response;
    }
    if (response && Array.isArray((response as any).data)) {
      return (response as any).data;
    }
    return [];
  } catch (error) {
    console.error('Error fetching mesas:', error);
    return [];
  }
};

export const createMesa = async (data: Omit<Mesa, 'IdMesas'>): Promise<Mesa> => {
  try {
    const response = await api.post('/mesas', data);
    return response.data || response;
  } catch (error) {
    console.error('Error creating mesa:', error);
    throw error;
  }
};

export const updateMesa = async (id: string, data: Partial<Mesa>): Promise<Mesa> => {
  try {
    const response = await api.patch(`/mesas/${id}`, data);
    return response.data || response;
  } catch (error) {
    console.error('Error updating mesa:', error);
    throw error;
  }
};

export const deleteMesa = async (id: string): Promise<any> => {
  try {
    const response = await api.delete(`/mesas/${id}`);
    return response.data || response;
  } catch (error) {
    console.error('Error deleting mesa:', error);
    throw error;
  }
};
