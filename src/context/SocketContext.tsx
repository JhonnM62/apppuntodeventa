// ============================================================
// Q'HUBO MOR ERP - Socket Context
// ============================================================
// Context API para manejar la conexión WebSocket en toda la app
//
// CARACTERÍSTICAS:
// - Reconexión automática con backoff exponencial
// - Rooms dinámicos (join/leave)
// - Estado de conexión reactivo
// - Tipado estricto
//
// USO:
// 1. Envolver App con <SocketProvider>
// 2. Usar useSocket() para acceder al contexto
// 3. Usar useSocketEvent() para escuchar eventos
// 4. Usar useSocketEmitter() para emitir eventos
//
// Ejemplo:
//   <SocketProvider>
//     <App />
//   </SocketProvider>
//
//   // En cualquier componente:
//   const { isConnected } = useSocket();
//   useSocketEvent('ordenRecibida', handleOrden);
// ============================================================

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ConnectionState,
  JoinRoomPayload,
  JoinedPayload,
  ErrorPayload,
} from '../types/socket.types';
import useAuthStore from '../store/useAuthStore';
import Toast from 'react-native-toast-message';

const SOCKET_URL = process.env.EXPO_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';
const NAMESPACE = '/pos';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  connectionState: ConnectionState;
  error: Error | null;
  joinRoom: (room: string) => Promise<boolean>;
  leaveRoom: (room: string) => Promise<boolean>;
  emit: (event: string, data: any) => boolean;
  getRooms: () => string[];
  initSocket: () => Promise<void>;
  disconnectSocket: () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

interface SocketProviderProps {
  children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [error, setError] = useState<Error | null>(null);
  const [joinedRooms, setJoinedRooms] = useState<Set<string>>(new Set());

  const socketRef = useRef<Socket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);

  const initSocket = useCallback(async () => {
    if (socketRef.current?.connected) {
      return;
    }

    try {
      setConnectionState(ConnectionState.CONNECTING);
      setError(null);

      const token = await AsyncStorage.getItem('token');
      
      // Si no hay token, no intentamos conectar todavía para no generar errores de Auth en el Backend
      if (!token) {
        setConnectionState(ConnectionState.DISCONNECTED);
        return;
      }

      const newSocket = io(`${SOCKET_URL}${NAMESPACE}`, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        timeout: 30000,
      });

      newSocket.on('connect', () => {
        if (!isMountedRef.current) return;

        console.log('[SocketContext] Connected:', newSocket.id);
        setIsConnected(true);
        setConnectionState(ConnectionState.CONNECTED);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Re-join rooms after reconnect
        joinedRooms.forEach((room) => {
          console.log('[SocketContext] Re-joining room after reconnect:', room);
          newSocket.emit('joinRoom', { room });
        });
      });

      newSocket.on('disconnect', (reason) => {
        if (!isMountedRef.current) return;

        console.log('[SocketContext] Disconnected:', reason);
        setIsConnected(false);
        setConnectionState(ConnectionState.DISCONNECTED);
      });

      newSocket.on('connect_error', (err) => {
        if (!isMountedRef.current) return;

        if (err.message === 'xhr poll error' || err.message.includes('Token requerido')) {
          // Ignorar error de red común y error de token faltante temporalmente
          return;
        }

        console.error('[SocketContext] Connection error:', err.message);
        setError(err);
        setConnectionState(ConnectionState.ERROR);
        reconnectAttemptsRef.current++;
      });

      newSocket.on('error', (data: ErrorPayload) => {
        if (!isMountedRef.current) return;
        
        // Evitar loggear error de auth cuando el usuario apenas va a iniciar sesión
        if (data?.code === 'AUTH_NO_TOKEN' || data?.message?.includes('Token requerido')) {
          return;
        }

        console.error('[SocketContext] Socket error:', data);
        setError(new Error(data.message));
      });

      newSocket.on('joined', (data: JoinedPayload) => {
        if (!isMountedRef.current) return;
        console.log('[SocketContext] Joined room:', data.room);
      });

      newSocket.on('userPermissionsUpdated', (data: { userId: string, permisos: any, rol: string }) => {
        if (!isMountedRef.current) return;
        
        console.log('[SocketContext] Permissions updated via socket', data);
        const { user, setUser } = useAuthStore.getState();
        
        // El id que viene del estado auth puede llamarse id o IDusuarios
        const currentUserId = user?.id || user?.IDusuarios;
        
        // Use loose equality or convert both to strings for safe comparison since IDs might be numeric or strings
        if (user && currentUserId && String(currentUserId) === String(data.userId)) {
          // Update the global user state with new permissions ensuring boolean conversion
          const parsedPermisos: any = {};
          if (data.permisos) {
            Object.keys(data.permisos).forEach(key => {
              parsedPermisos[key] = {
                read: data.permisos[key].read === true || String(data.permisos[key].read) === 'true',
                create: data.permisos[key].create === true || String(data.permisos[key].create) === 'true',
                edit: data.permisos[key].edit === true || String(data.permisos[key].edit) === 'true',
                delete: data.permisos[key].delete === true || String(data.permisos[key].delete) === 'true',
              };
            });
          }

          setUser({
            ...user,
            permisos: parsedPermisos,
            rol: data.rol
          });
          
          Toast.show({
            type: 'info',
            text1: 'Permisos actualizados',
            text2: 'Tus permisos han sido modificados por un administrador',
            position: 'top',
            visibilityTime: 4000,
          });
        }
      });

      socketRef.current = newSocket;
      setSocket(newSocket);
    } catch (err) {
      if (!isMountedRef.current) return;

      console.error('[SocketContext] Init error:', err);
      setError(err as Error);
      setConnectionState(ConnectionState.ERROR);
    }
  }, []);

  const { token } = useAuthStore();

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
      setConnectionState(ConnectionState.DISCONNECTED);
      setJoinedRooms(new Set());
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    
    // Conectar automáticamente cuando haya un token, o desconectar si se remueve (logout)
    if (token) {
      initSocket();
    } else {
      disconnectSocket();
    }

    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && token) {
        console.log('[SocketContext] App foregrounded, forcing socket reconnect to avoid silent drops');
        if (socketRef.current) {
          // Force disconnect and reconnect to ensure the connection is completely fresh
          socketRef.current.disconnect();
          setTimeout(() => {
            if (isMountedRef.current && token) {
              socketRef.current?.connect();
            }
          }, 500);
        } else {
          initSocket();
        }
      }
    });

    return () => {
      isMountedRef.current = false;
      appStateSubscription.remove();
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [token, initSocket, disconnectSocket]);

  const joinRoom = useCallback(async (room: string): Promise<boolean> => {
    if (!socketRef.current?.connected) {
      console.warn('[SocketContext] Cannot join room - not connected');
      return false;
    }

    return new Promise((resolve) => {
      socketRef.current!.emit('joinRoom', { room }, (response: any) => {
        if (response.success) {
          setJoinedRooms((prev) => new Set([...prev, room]));
          resolve(true);
        } else {
          console.error('[SocketContext] Failed to join room:', response.error);
          resolve(false);
        }
      });
    });
  }, []);

  const leaveRoom = useCallback(async (room: string): Promise<boolean> => {
    if (!socketRef.current?.connected) {
      console.warn('[SocketContext] Cannot leave room - not connected');
      return false;
    }

    return new Promise((resolve) => {
      socketRef.current!.emit('leaveRoom', { room }, (response: any) => {
        if (response.success) {
          setJoinedRooms((prev) => {
            const next = new Set(prev);
            next.delete(room);
            return next;
          });
          resolve(true);
        } else {
          console.error('[SocketContext] Failed to leave room:', response.error);
          resolve(false);
        }
      });
    });
  }, []);

  const emit = useCallback((event: string, data: any): boolean => {
    if (!socketRef.current?.connected) {
      console.warn('[SocketContext] Cannot emit - not connected');
      return false;
    }

    socketRef.current.emit(event, data);
    return true;
  }, []);

  const getRooms = useCallback((): string[] => {
    return [...joinedRooms];
  }, [joinedRooms]);

  const value = useMemo(
    () => ({
      socket: socketRef.current,
      isConnected,
      connectionState,
      error,
      joinRoom,
      leaveRoom,
      emit,
      getRooms,
      initSocket, // Exponemos initSocket para forzar la reconexión después del login
      disconnectSocket, // Exponemos disconnectSocket para desconectar después del logout
    }),
    [isConnected, connectionState, error, joinRoom, leaveRoom, emit, getRooms, initSocket, disconnectSocket]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = (): SocketContextValue => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

export default SocketContext;
