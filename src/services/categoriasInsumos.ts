import api from './api';

export interface CategoriaInsumoItem {
  IDcategoriainsumos: string;
  nombre: string;
  imagen?: string;
  _count?: {
    insumos: number;
  };
}

export const categoriasInsumosService = {
  getAll: async (): Promise<CategoriaInsumoItem[]> => {
    try {
      const response = await api.get('/categorias-insumos');
      return response.data;
    } catch (error) {
      console.error('Error fetching categorias insumos:', error);
      throw error;
    }
  },

  getById: async (id: string): Promise<CategoriaInsumoItem> => {
    try {
      const response = await api.get(`/categorias-insumos/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching categoria insumo ${id}:`, error);
      throw error;
    }
  },

  create: async (data: Omit<CategoriaInsumoItem, 'IDcategoriainsumos'>): Promise<CategoriaInsumoItem> => {
    try {
      const response = await api.post('/categorias-insumos', data);
      return response.data;
    } catch (error) {
      console.error('Error creating categoria insumo:', error);
      throw error;
    }
  },

  update: async (id: string, data: Partial<CategoriaInsumoItem>): Promise<CategoriaInsumoItem> => {
    try {
      const response = await api.patch(`/categorias-insumos/${id}`, data);
      return response.data;
    } catch (error) {
      console.error(`Error updating categoria insumo ${id}:`, error);
      throw error;
    }
  },

  remove: async (id: string): Promise<void> => {
    try {
      await api.delete(`/categorias-insumos/${id}`);
    } catch (error) {
      console.error(`Error deleting categoria insumo ${id}:`, error);
      throw error;
    }
  }
};
