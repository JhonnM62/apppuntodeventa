import api from './api';

export const authService = {
  login: async (email: string, password: string): Promise<any> => {
    return await api.post('/auth/login', { email, password });
  },
  register: async (data: any): Promise<any> => {
    return await api.post('/auth/register', data);
  }
};