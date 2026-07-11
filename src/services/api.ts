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

// Request interceptor — inject Authorization header and handle FormData
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Si estamos enviando un FormData, debemos eliminar el Content-Type por defecto
    // para que el navegador (o React Native) lo establezca automáticamente con el `boundary` correcto.
    if (config.data instanceof FormData) {
      if (config.headers) {
        delete config.headers['Content-Type'];
        delete config.headers['content-type'];
      }
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

    // For all other errors, pass through the original error so components can read response.data.message
    return Promise.reject(error);
  }
);

export const getConfiguracionIA = () => api.get('/configuracion/ia');
export const updateConfiguracionIA = (data: any) => api.put('/configuracion/ia', data);
export const extractDataWithIA = async (formData: FormData) => {
  const token = await AsyncStorage.getItem('token');
  const response = await fetch(`${API_URL}/ai/extract-data`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) throw data.error || data.message || 'Error de red';
  return data;
};

export const processVoiceOrderWithIA = async (formData: FormData) => {
  const token = await AsyncStorage.getItem('token');
  const response = await fetch(`${API_URL}/ai/voice-order`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) throw data.error || data.message || 'Error de red';
  return data;
};

export default api;