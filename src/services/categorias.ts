import api from './api';

export type CategoriaItem = {
  IDcategoria: string;
  nombre: string;
  image?: string;
  padreId?: string;
  productos?: {
    IDproductos: string;
    nombre: string;
    precioUnitario: number;
    cantidad: number;
  }[];
};

export type CreateCategoriaDto = {
  nombre: string;
  image?: string;
  padreId?: string;
};

export type UpdateCategoriaDto = Partial<CreateCategoriaDto>;

const categoriasService = {
  getAll: async (): Promise<CategoriaItem[]> => {
    const resp = await api.get('/categorias');
    return resp.data.data || resp.data;
  },

  getById: async (id: string): Promise<CategoriaItem> => {
    const resp = await api.get(`/categorias/${id}`);
    return resp.data.data || resp.data;
  },

  create: async (data: CreateCategoriaDto): Promise<CategoriaItem> => {
    const resp = await api.post('/categorias', data);
    return resp.data.data || resp.data;
  },

  update: async (id: string, data: UpdateCategoriaDto): Promise<CategoriaItem> => {
    const resp = await api.patch(`/categorias/${id}`, data);
    return resp.data.data || resp.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/categorias/${id}`);
  },
};

export default categoriasService;