import NetInfo from '@react-native-community/netinfo';
import { useSyncStore } from '../store/useSyncStore';
import api from './api';
import Toast from 'react-native-toast-message';
import { AppState, AppStateStatus } from 'react-native';

export class SyncManager {
  private static isRunning = false;
  private static unsubscribeNetInfo: (() => void) | null = null;
  private static intervalId: NodeJS.Timeout | null = null;
  private static appStateSubscription: any = null;

  static init() {
    if (this.unsubscribeNetInfo) return;

    // 1. Escuchar cambios de red (Wi-Fi/Datos)
    this.unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        this.processQueue();
      }
    });

    // 2. Escuchar cuando la app pasa de segundo plano a primer plano
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        this.processQueue();
      }
    });

    // 3. Polling periódico cada 30 segundos si hay algo en la cola
    this.intervalId = setInterval(() => {
      const { queue } = useSyncStore.getState();
      if (queue.length > 0) {
        this.processQueue();
      }
    }, 30000);
  }

  static async processQueue() {
    if (this.isRunning) return;
    
    const { queue, setSyncing, dequeueAction, incrementRetry } = useSyncStore.getState();
    if (queue.length === 0) return;

    this.isRunning = true;
    setSyncing(true);

    let successCount = 0;
    
    console.log(`[SyncManager] Iniciando sincronización de ${queue.length} acciones...`);

    // Procesar secuencialmente para mantener el orden (ej. Crear venta -> Actualizar venta)
    for (const action of [...queue].sort((a, b) => a.timestamp - b.timestamp)) {
      try {
        if (action.type === 'POST') {
          await api.post(action.url, action.payload);
        } else if (action.type === 'PATCH') {
          await api.patch(action.url, action.payload);
        } else if (action.type === 'PUT') {
          await api.put(action.url, action.payload);
        } else if (action.type === 'DELETE') {
          await api.delete(action.url, { data: action.payload });
        }
        
        dequeueAction(action.id);
        successCount++;
        console.log(`[SyncManager] Acción ${action.id} (${action.url}) sincronizada con éxito.`);
      } catch (error: any) {
        console.log(`[SyncManager] Falló acción ${action.id}:`, error);
        incrementRetry(action.id);
        
        const isNetworkError = error.message === 'Network Error' || error.code === 'ECONNABORTED' || !error.response;
        
        // Si el servidor responde con 4xx (excepto 401), la data está corrupta o ya se sincronizó, la eliminamos.
        if (error.response && error.response.status >= 400 && error.response.status !== 401 && error.response.status < 500) {
           dequeueAction(action.id);
           console.log(`[SyncManager] Acción descartada por error de cliente (HTTP ${error.response.status}).`);
        } else if (isNetworkError || error.response?.status >= 500) {
           console.log(`[SyncManager] Servidor inalcanzable o caído. Abortando el resto de la sincronización...`);
           break; // <-- BREAK THE LOOP: Si no hay red real o el backend está en 500, no seguimos bombardeando
        }
      }
    }

    setSyncing(false);
    this.isRunning = false;

    if (successCount > 0) {
      Toast.show({
        type: 'success',
        text1: 'Sincronización Completada',
        text2: `Se sincronizaron ${successCount} registro(s) pendientes con el servidor.`,
      });
      
      // Emitir evento para que las listas globales se recarguen
      import('../hooks/useGlobalSalesSync').then(({ triggerGlobalSalesRefresh }) => {
         triggerGlobalSalesRefresh();
      });
    }
  }

  static cleanup() {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
