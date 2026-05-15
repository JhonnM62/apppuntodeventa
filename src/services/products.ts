import api from './api';

export const getProducts = async (params?: any) => {
  try {
    const response = await api.get('/productos', { params, timeout: 5000 });
    // Soporta el formato paginado { data, meta }
    if (response?.data?.data && Array.isArray(response.data.data)) {
      return response.data; // Retorna { data, meta }
    }
    const result = response?.data?.data ?? response?.data ?? response;
    return { data: Array.isArray(result) ? result : [], meta: null };
  } catch (error: any) {
    console.error('Error fetching products:', error?.message || error);
    return { data: [], meta: null };
  }
};

export const getProductById = async (id: string) => {
  try {
    const response = await api.get(`/productos/${id}`);
    const result = response?.data?.data ?? response?.data ?? response;
    return result;
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
};

export const createProduct = async (data: any) => {
  try {
    const response = await api.post('/productos', data);
    return response.data;
  } catch (error) {
    console.error('Error creating product:', error);
    throw error;
  }
};

export const updateProduct = async (id: string, data: any) => {
  try {
    const response = await api.patch(`/productos/${id}`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
};

export const deleteProduct = async (id: string) => {
  try {
    const response = await api.delete(`/productos/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting product:', error);
    throw error;
  }
};
