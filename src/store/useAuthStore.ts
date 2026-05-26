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

// ─── Helper: Decode JWT payload (no library needed) ──────────────────────────
function decodeJwtExp(token: string): number | null {
  try {
    const base64Payload = token.split('.')[1];
    const decoded = JSON.parse(atob(base64Payload));
    return typeof decoded.exp === 'number' ? decoded.exp : null;
  } catch {
    return null;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

interface AuthStore {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
  isSessionExpired: boolean;
  _refreshTimer: ReturnType<typeof setTimeout> | null;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (nombre: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  setUser: (user: User | null) => void;
  /** Called by api.ts interceptor after a successful silent refresh */
  setTokenSilently: (newToken: string) => void;
  /** Called by api.ts interceptor when refresh fails to show the modal */
  setSessionExpired: (expired: boolean) => void;
  /** Proactively schedule a token refresh 5 min before expiry (Option C) */
  scheduleTokenRefresh: (token: string) => void;
}

const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: null,
  isLoading: false,
  error: null,
  isInitialized: false,
  isSessionExpired: false,
  _refreshTimer: null,

  setUser: (user) => {
    if (user) AsyncStorage.setItem('user', JSON.stringify(user)).catch(console.error);
    set({ user });
  },

  setTokenSilently: (newToken) => {
    set({ token: newToken });
  },

  setSessionExpired: (expired) => {
    set({ isSessionExpired: expired });
  },

  scheduleTokenRefresh: (token: string) => {
    // Clear any existing timer
    const existing = get()._refreshTimer;
    if (existing) clearTimeout(existing);

    const exp = decodeJwtExp(token);
    if (!exp) return;

    // Refresh 5 minutes before expiry
    const msUntilRefresh = exp * 1000 - Date.now() - 5 * 60 * 1000;

    if (msUntilRefresh <= 0) {
      // Token already expired or about to — attempt refresh immediately
      console.log('[AuthStore] Token expired or expiring soon, refreshing immediately...');
      authService.refreshToken(token)
        .then(async (result) => {
          await AsyncStorage.setItem('token', result.accessToken);
          set({ token: result.accessToken });
          get().scheduleTokenRefresh(result.accessToken);
          console.log('[AuthStore] Proactive token refresh successful');
        })
        .catch(async (err) => {
          console.warn('[AuthStore] Proactive refresh failed, forcing logout:', err);
          await get().logout();
          set({ isSessionExpired: true });
        });
      return;
    }

    console.log(`[AuthStore] Scheduling proactive token refresh in ${Math.round(msUntilRefresh / 1000 / 60)}min`);
    const timer = setTimeout(async () => {
      const currentToken = await AsyncStorage.getItem('token');
      if (!currentToken) return;
      try {
        const result = await authService.refreshToken(currentToken);
        await AsyncStorage.setItem('token', result.accessToken);
        set({ token: result.accessToken });
        get().scheduleTokenRefresh(result.accessToken);
        console.log('[AuthStore] Proactive token refresh successful');
      } catch (err) {
        console.warn('[AuthStore] Scheduled refresh failed, forcing logout:', err);
        await get().logout();
        set({ isSessionExpired: true });
      }
    }, msUntilRefresh);

    set({ _refreshTimer: timer });
  },

  init: async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const userStr = await AsyncStorage.getItem('user');
      if (token && userStr) {
        const cachedUser = JSON.parse(userStr);
        set({ token, user: cachedUser, isInitialized: true });

        // Schedule proactive refresh based on stored token (Option C)
        get().scheduleTokenRefresh(token);

        // Silently update user profile in background
        const userId = cachedUser.id || cachedUser.IDusuarios;
        if (userId) {
          try {
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
      if (response && response.data && response.data.accessToken) {
        const { accessToken, user } = response.data;
        await AsyncStorage.setItem('token', accessToken);
        await AsyncStorage.setItem('user', JSON.stringify(user));
        set({ token: accessToken, user, isLoading: false, isSessionExpired: false });
        // Schedule proactive refresh after login (Option C)
        get().scheduleTokenRefresh(accessToken);
        return true;
      } else {
        throw new Error('Respuesta inválida del servidor');
      }
    } catch (error: any) {
      let errorMessage = error.message || 'Error al iniciar sesión';
      if (error.message === 'Network Error' || error.code === 'ECONNABORTED') {
        errorMessage = 'No se pudo conectar al servidor. Verifica tu red o la IP del backend.';
      }
      set({ error: errorMessage, isLoading: false });
      return false;
    }
  },

  register: async (nombre, email, password) => {
    set({ isLoading: true, error: null });
    try {
      await authService.register({ nombre, email, password });
      set({ isLoading: false });
      return true;
    } catch (error: any) {
      let errorMessage = error.message || 'Error al registrarse';
      if (error.message === 'Network Error' || error.code === 'ECONNABORTED') {
        errorMessage = 'No se pudo conectar al servidor. Verifica tu red o la IP del backend.';
      }
      set({ error: errorMessage, isLoading: false });
      return false;
    }
  },

  logout: async () => {
    try {
      // Clear scheduled refresh timer
      const timer = get()._refreshTimer;
      if (timer) clearTimeout(timer);

      await AsyncStorage.multiRemove(['token', 'user']);
      useDockStore.getState().clearHistory();
      set({ token: null, user: null, _refreshTimer: null });
    } catch (error) {
      console.error('Error in logout:', error);
    }
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;