import api from './api';

export const authService = {
  login: async (email: string, password: string): Promise<any> => {
    return await api.post('/auth/login', { email, password });
  },
  register: async (data: any): Promise<any> => {
    return await api.post('/auth/register', data);
  },
  refreshToken: async (token: string): Promise<{ accessToken: string }> => {
    // Call directly with axios to avoid the interceptor loop
    const axios = (await import('axios')).default;
    const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
    const response = await axios.post(`${API_URL}/auth/refresh`, { token });
    return response.data?.data ?? response.data;
  },
};