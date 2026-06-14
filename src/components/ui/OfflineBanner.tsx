import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff, RefreshCw } from 'lucide-react-native';
import { useSyncStore } from '../../store/useSyncStore';
import { SyncManager } from '../../services/SyncManager';

export default function OfflineBanner() {
  const [isConnected, setIsConnected] = useState(true);
  const insets = useSafeAreaInsets();
  const queueSize = useSyncStore(state => state.queue.length);
  const isSyncing = useSyncStore(state => state.isSyncing);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(!!(state.isConnected && state.isInternetReachable !== false));
    });
    return () => unsubscribe();
  }, []);

  if (isConnected && !isSyncing && queueSize === 0) return null;

  // Si hay conexión pero hay elementos atascados en la cola, mostrar banner para forzar
  const isStuck = isConnected && queueSize > 0 && !isSyncing;

  return (
    <TouchableOpacity 
      activeOpacity={0.8}
      disabled={isSyncing}
      onPress={() => SyncManager.processQueue()}
      style={{ paddingTop: (isConnected && !isStuck) ? 0 : insets.top, backgroundColor: isConnected ? '#f59e0b' : '#ef4444' }} 
      className="w-full z-50 shadow-sm"
    >
      <View className="py-2 px-4 flex-row items-center justify-center">
        {!isConnected ? (
          <>
            <WifiOff size={16} color="white" />
            <Text className="text-white text-xs font-bold ml-2">
              SIN CONEXIÓN {queueSize > 0 ? `(Esperando para sincronizar ${queueSize} elementos)` : ''}
            </Text>
          </>
        ) : isSyncing ? (
          <Text className="text-white text-xs font-bold ml-2">Sincronizando con el servidor...</Text>
        ) : isStuck ? (
          <>
            <RefreshCw size={16} color="white" />
            <Text className="text-white text-xs font-bold ml-2">
              Toca para sincronizar {queueSize} venta(s) pendiente(s)
            </Text>
          </>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
