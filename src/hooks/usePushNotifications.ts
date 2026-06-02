import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import api from '../services/api';
import useAuthStore from '../store/useAuthStore';
import { useNotificationStore } from '../store/useNotificationStore';

// Configurar comportamiento nativo cuando la app está en primer plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, // Muestra el popup visual arriba
    shouldPlaySound: true, // Suena
    shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string>('');
  const [notification, setNotification] = useState<Notifications.Notification | false>(false);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  const { user } = useAuthStore();
  const { incrementUnread } = useNotificationStore();

  useEffect(() => {
    // Si no hay usuario o no es admin, no pedimos permisos ni mandamos token
    if (!user || (user.rol !== 'Admin app' && user.rol !== 'Admin negocio')) {
      return;
    }

    registerForPushNotificationsAsync().then(token => {
      if (token) {
        setExpoPushToken(token);
        // Enviar el token al backend
        api.post('/notifications/token', {
          userId: user.id || user.IDusuarios,
          token: token,
          deviceName: Device.modelName || 'Unknown Device'
        }).catch(err => console.error("Error saving push token:", err));
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
      incrementUnread(); // Incrementamos el badge de la campana en tiempo real
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      // Aquí podemos manejar qué hacer cuando tocan la notificación
      console.log(response);
    });

    return () => {
      try {
        if (notificationListener.current) {
          notificationListener.current.remove();
        }
        if (responseListener.current) {
          responseListener.current.remove();
        }
      } catch (e) {
        console.log('[PushNotifications] Error al limpiar listeners', e);
      }
    };
  }, [user]);

  return { expoPushToken, notification };
}

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('No se obtuvieron permisos para notificaciones push');
      return;
    }

    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      
      if (!projectId) {
        console.warn('Se necesita un Project ID en app.json para Expo Push');
      }
      
      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;
      
    } catch (e: any) {
      console.log('Error obteniendo Expo Push Token:', e.message);
      // Evitar que el error de Firebase no inicializado crashee la app si aún no se ha configurado
    }
  } else {
    console.log('Las notificaciones push nativas requieren un dispositivo físico (No Emulador)');
  }

  return token;
}
