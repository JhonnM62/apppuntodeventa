import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '../services/auth';
import { useDockStore } from './useDockStore';

export interface User {
  id?: string;
  email?: string;
  name?: string;
  nombre?: string;
  [key: string]: any;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (nombre: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  setUser: (user: User | null) => void;
}

const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  isLoading: false,
  error: null,
  isInitialized: false,

  setUser: (user) => {
    if (user) AsyncStorage.setItem('user', JSON.stringify(user)).catch(console.error);
    set({ user });
  },

  init: async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const userStr = await AsyncStorage.getItem('user');
      if (token && userStr) {
        const cachedUser = JSON.parse(userStr);
        set({ token, user: cachedUser, isInitialized: true });
        
        // Fetch fresh user data from API in background to ensure permissions are up to date
        // Use the authService logic or a direct api call to get the latest profile
        const userId = cachedUser.id || cachedUser.IDusuarios;
        if (userId) {
          // We can silently update the user if the token is still valid
          try {
            // Using the api directly since authService might not have it
            const api = (await import('../services/api')).default;
            const response = await api.get(`/usuarios/${userId}`);
            if (response && response.data) {
              const freshUser = response.data;
              await AsyncStorage.setItem('user', JSON.stringify(freshUser));
              set({ user: freshUser });
            }
          } catch (silentError) {
            console.log('Silent user update failed, using cached user', silentError);
          }
        }
      } else {
        set({ isInitialized: true });
      }
    } catch (e) {
      console.error('Error init auth', e);
      set({ isInitialized: true });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login(email, password);
      // El backend retorna: { success: true, data: { accessToken, user } }
      if (response && response.data && response.data.accessToken) {
        const { accessToken, user } = response.data;
        await AsyncStorage.setItem('token', accessToken);
        await AsyncStorage.setItem('user', JSON.stringify(user));
        set({ token: accessToken, user, isLoading: false });
        return true;
      } else {
        throw new Error('Respuesta inválida del servidor');
      }
    } catch (error: any) {
      let errorMessage = error.message || 'Error al iniciar sesión';
      if (error.message === 'Network Error' || error.code === 'ECONNABORTED') {
        errorMessage = 'No se pudo conectar al servidor. Verifica tu red o la IP del backend.';
      }
      set({ 
        error: errorMessage, 
        isLoading: false 
      });
      return false;
    }
  },

  register: async (nombre, email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.register({ nombre, email, password });
      set({ isLoading: false });
      return true;
    } catch (error: any) {
      let errorMessage = error.message || 'Error al registrarse';
      if (error.message === 'Network Error' || error.code === 'ECONNABORTED') {
        errorMessage = 'No se pudo conectar al servidor. Verifica tu red o la IP del backend.';
      }
      set({ 
        error: errorMessage, 
        isLoading: false 
      });
      return false;
    }
  },

  logout: async () => {
    try {
      await AsyncStorage.multiRemove(['token', 'user']);
      useDockStore.getState().clearHistory();
      set({ token: null, user: null });
    } catch (error) {
      console.error('Error in logout:', error);
    }
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;