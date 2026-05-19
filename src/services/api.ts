import axios, { InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000, // 10 segundos de tiempo de espera máximo
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar el token JWT
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Interceptor para manejar respuestas (opcional)
api.interceptors.response.use(
  (response: AxiosResponse) => {
    console.log(`[DEBUG api.ts] URL: ${response.config.url} | typeof data: ${typeof response.data} | isArray: ${Array.isArray(response.data)}`);
    return response.data;
  },
  (error: AxiosError<any>) => {
    // Si la respuesta tiene el formato { success, error: { message, code } }
    if (error.response && error.response.data && error.response.data.error) {
      return Promise.reject(error.response.data.error);
    }
    return Promise.reject(error);
  }
);

export const getConfiguracionIA = () => api.get('/configuracion/ia');
export const updateConfiguracionIA = (data: any) => api.put('/configuracion/ia', data);
export const extractDataWithIA = (formData: FormData) => api.post('/ai/extract-data', formData, {
  headers: {
    'Content-Type': 'multipart/form-data',
  },
  timeout: 30000, // 30 seconds timeout for AI processing
});
export const processVoiceOrderWithIA = (formData: FormData) => api.post('/ai/voice-order', formData, {
  headers: {
    'Content-Type': 'multipart/form-data',
  },
  timeout: 30000, // 30 seconds timeout for AI voice processing to prevent Network Error on slow connections
});

export default api;