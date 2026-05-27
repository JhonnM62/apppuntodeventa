import axios, { InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Mutex Queue for Token Refresh ───────────────────────────────────────────
// Ensures only ONE refresh request is in flight at a time.
// All other 401-failing requests wait in the queue and are retried after refresh.
let isRefreshing = false;
let refreshSubscribers: ((newToken: string) => void)[] = [];

function subscribeTokenRefresh(cb: (newToken: string) => void) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

function onRefreshFailed() {
  refreshSubscribers = [];
}
// ─────────────────────────────────────────────────────────────────────────────

// Request interceptor — inject Authorization header
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

// Response interceptor — handle 401 with silent token refresh
api.interceptors.response.use(
  (response: AxiosResponse) => {
    // Si es una petición GET, guardamos en caché
    if (response.config.method?.toLowerCase() === 'get') {
      const cacheKey = `cache_${response.config.url}`;
      AsyncStorage.setItem(cacheKey, JSON.stringify(response.data)).catch(() => {});
    }
    console.log(`[DEBUG api.ts] URL: ${response.config.url} | typeof data: ${typeof response.data} | isArray: ${Array.isArray(response.data)}`);
    return response.data;
  },
  async (error: AxiosError<any>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Si hay un error de red y es GET, devolver caché
    if ((error.message === 'Network Error' || error.code === 'ECONNABORTED' || !error.response) && originalRequest?.method?.toLowerCase() === 'get') {
      try {
        const cacheKey = `cache_${originalRequest.url}`;
        const cachedData = await AsyncStorage.getItem(cacheKey);
        if (cachedData) {
          console.log(`[DEBUG api.ts] Offline fallback for URL: ${originalRequest.url}`);
          return JSON.parse(cachedData);
        }
      } catch (e) {
        // Ignorar si falla lectura del caché
      }
    }

    const is401 = error.response?.status === 401;
    const isRefreshEndpoint = originalRequest?.url?.includes('/auth/refresh');
    const isLoginEndpoint = originalRequest?.url?.includes('/auth/login');
    const isRegisterEndpoint = originalRequest?.url?.includes('/auth/register');
    const alreadyRetried = originalRequest?._retry;

    // If it's a 401 on a non-refresh/login endpoint and we haven't retried yet
    if (is401 && !isRefreshEndpoint && !isLoginEndpoint && !isRegisterEndpoint && !alreadyRetried) {
      originalRequest._retry = true;

      if (isRefreshing) {
        // Another request is already refreshing — wait for it
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((newToken: string) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(api(originalRequest));
          });
          // If refresh fails, this promise will be abandoned (request silently fails)
          // The SESSION_EXPIRED event will handle logout/modal
        });
      }

      isRefreshing = true;

      try {
        const oldToken = await AsyncStorage.getItem('token');
        if (!oldToken) throw new Error('No token stored');

        // Import authService lazily to avoid circular dependency
        const { authService } = await import('./auth');
        const result = await authService.refreshToken(oldToken);
        const newToken = result.accessToken;

        // Persist new token
        await AsyncStorage.setItem('token', newToken);

        // Update Zustand store without triggering a re-login
        const useAuthStore = (await import('../store/useAuthStore')).default;
        useAuthStore.getState().setTokenSilently(newToken);
        useAuthStore.getState().scheduleTokenRefresh(newToken);

        isRefreshing = false;
        onTokenRefreshed(newToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        onRefreshFailed();

        // Refresh failed — session truly expired, trigger logout
        const useAuthStore = (await import('../store/useAuthStore')).default;
        await useAuthStore.getState().logout();
        // Signal the UI to show the SessionExpiredModal
        useAuthStore.getState().setSessionExpired(true);

        return Promise.reject(refreshError);
      }
    }

    // For all other errors, pass through the structured error if available
    if (error.response?.data?.error) {
      return Promise.reject(error.response.data.error);
    }
    return Promise.reject(error.message ?? error);
  }
);

export const getConfiguracionIA = () => api.get('/configuracion/ia');
export const updateConfiguracionIA = (data: any) => api.put('/configuracion/ia', data);
export const extractDataWithIA = (formData: FormData) => api.post('/ai/extract-data', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: 30000,
});
export const processVoiceOrderWithIA = (formData: FormData) => api.post('/ai/voice-order', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: 30000,
});

export default api;