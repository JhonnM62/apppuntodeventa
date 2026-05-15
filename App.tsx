import React, { useEffect, useState } from 'react';
import './global.css';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { PortalHost } from '@rn-primitives/portal';
import RootNavigator from './src/navigation/RootNavigator';
import { SocketProvider } from './src/context/SocketContext';
import { useProductStore } from './src/store/useProductStore';
import usePrinterStore from './src/store/usePrinterStore';
import { getProducts } from './src/services/products';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast, { BaseToast, ErrorToast, ToastConfig } from 'react-native-toast-message';
import { usePushNotifications } from './src/hooks/usePushNotifications';

let BLEPrinter: any = null;
try {
  const PrinterModule = require('react-native-thermal-receipt-printer-image-qr');
  BLEPrinter = PrinterModule.BLEPrinter;
} catch (error) {
  console.log('Bluetooth printer library not available');
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const setProductos = useProductStore((state) => state.setProductos);
  const shouldRefetch = useProductStore((state) => state.shouldRefetch);
  const productos = useProductStore((state) => state.productos);
  const [isReady, setIsReady] = useState(false);

  // Auto-connect printer state
  const { currentPrinter, isConnected, setConnected } = usePrinterStore();

  useEffect(() => {
    const autoConnectPrinter = async () => {
      // Si hay una impresora guardada, el módulo existe, y no está conectada
      if (currentPrinter && BLEPrinter && !isConnected) {
        try {
          console.log('Intentando auto-conectar impresora en segundo plano...');
          await BLEPrinter.init();
          await new Promise(resolve => setTimeout(resolve, 500));
          await BLEPrinter.connectPrinter(currentPrinter.inner_mac_address);
          setConnected(true);
          console.log('¡Impresora auto-conectada con éxito!');
        } catch (error) {
          console.log('Fallo la auto-conexión de la impresora:', error);
          setConnected(false);
        }
      }
    };
    
    // Agregamos un pequeño delay para asegurarnos de que la app terminó de cargar
    const timeoutId = setTimeout(() => {
      autoConnectPrinter();
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [currentPrinter?.inner_mac_address]); // Se ejecuta cuando la impresora cargue del storage

  useEffect(() => {
    const preloadProducts = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) {
          setIsReady(true);
          return;
        }
      } catch {
        setIsReady(true);
        return;
      }

      if (shouldRefetch() || productos.length === 0) {
        try {
          const data = await getProducts();
          if (Array.isArray(data)) {
            setProductos(data);
          }
        } catch (error) {
          console.log('Error preloading products:', error);
        }
      }
      setIsReady(true);
    };
    preloadProducts();
  }, []);

  if (!isReady) {
    return null;
  }

  return <>{children}</>;
}

const toastConfig: ToastConfig = {
  success: (props) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: '#16a34a', backgroundColor: '#f0fdf4', borderRadius: 12, height: 'auto', paddingVertical: 12 }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{ fontSize: 16, fontWeight: '700', color: '#16a34a' }}
      text2Style={{ fontSize: 14, color: '#15803d' }}
    />
  ),
  error: (props) => (
    <ErrorToast
      {...props}
      style={{ borderLeftColor: '#dc2626', backgroundColor: '#fef2f2', borderRadius: 12, height: 'auto', paddingVertical: 12 }}
      text1Style={{ fontSize: 16, fontWeight: '700', color: '#dc2626' }}
      text2Style={{ fontSize: 14, color: '#b91c1c' }}
    />
  ),
  warning: (props) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: '#d97706', backgroundColor: '#fffbeb', borderRadius: 12, height: 'auto', paddingVertical: 12 }}
      text1Style={{ fontSize: 16, fontWeight: '700', color: '#d97706' }}
      text2Style={{ fontSize: 14, color: '#b45309' }}
    />
  )
};

export default function App() {
  usePushNotifications();
  
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor="transparent" translucent />
      <SocketProvider>
        <AppInitializer>
          <RootNavigator />
        </AppInitializer>
      </SocketProvider>
      <PortalHost />
      <Toast config={toastConfig} />
    </SafeAreaProvider>
  );
}
