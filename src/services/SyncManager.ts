import NetInfo from '@react-native-community/netinfo';
import { useSyncStore } from '../store/useSyncStore';
import api from './api';
import Toast from 'react-native-toast-message';

export class SyncManager {
  private static isRunning = false;
  private static unsubscribeNetInfo: (() => void) | null = null;

  static init() {
    if (this.unsubscribeNetInfo) return;

    this.unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        this.processQueue();
      }
    });
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
        
        // Si el servidor responde con 4xx (excepto 401), probablemente la data está corrupta o ya se sincronizó, la eliminamos.
        // Si es error de red, la dejamos en la cola para intentar después.
        if (error.response && error.response.status >= 400 && error.response.status !== 401 && error.response.status < 500) {
           dequeueAction(action.id);
           console.log(`[SyncManager] Acción descartada por error de cliente (HTTP ${error.response.status}).`);
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
    }
  }

  static cleanup() {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
  }
}
