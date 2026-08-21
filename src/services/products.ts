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

import { Platform } from 'react-native';

export const uploadImage = async (imageUri: string): Promise<string> => {
  try {
    const formData = new FormData();

    if (Platform.OS === 'web') {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      formData.append('file', blob, 'image.jpg');
    } else {
      const filename = imageUri.split('/').pop() || 'image.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;

      formData.append('file', {
        uri: imageUri,
        name: filename,
        type,
      } as any);
    }

    const response = await api.post('/productos/upload-image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data?.imageUrl || (response as any).imageUrl || '';
  } catch (error) {
    console.error('Error uploading product image:', error);
    throw error;
  }
};
