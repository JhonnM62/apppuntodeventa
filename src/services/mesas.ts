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
