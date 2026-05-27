import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff } from 'lucide-react-native';
import { useSyncStore } from '../../store/useSyncStore';

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

  if (isConnected && !isSyncing) return null;

  return (
    <View style={{ paddingTop: isConnected ? 0 : insets.top, backgroundColor: isConnected ? '#3b82f6' : '#ef4444' }} className="w-full z-50 shadow-sm">
      <View className="py-1 px-4 flex-row items-center justify-center">
        {!isConnected ? (
          <>
            <WifiOff size={14} color="white" />
            <Text className="text-white text-xs font-bold ml-2">
              SIN CONEXIÓN {queueSize > 0 ? `(Esperando para sincronizar ${queueSize} elementos)` : ''}
            </Text>
          </>
        ) : isSyncing ? (
          <Text className="text-white text-xs font-bold ml-2">Sincronizando con el servidor...</Text>
        ) : null}
      </View>
    </View>
  );
}
