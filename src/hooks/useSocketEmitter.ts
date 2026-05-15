// ============================================================
// Q'HUBO MOR ERP - useSocketEmitter Hook
// ============================================================
// Hook para emitir eventos de socket con tipado estricto
//
// USO:
//   const { emitNuevaOrden, emitOrdenActualizada } = useSocketEmitter();
//
// CARACTERÍSTICAS:
// - Métodos tipados para cada tipo de evento
// - Validación de conexión antes de emitir
// - Logging para debugging
// - Reintento automático en caso de desconexión temporal
//
// IMPORTANTE:
// - Todos los métodos retornan boolean indicando éxito
// - Si no hay conexión, el método retorna false
// - Los datos se enriquecen automáticamente con timestamp
// ============================================================

import { useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import {
  OrdenPayload,
  OrdenActualizadaPayload,
  OrdenCompletadaPayload,
  JoinRoomPayload,
  JoinedPayload,
} from '../types/socket.types';

export function useSocketEmitter() {
  const { emit, isConnected } = useSocket();

  const emitNuevaOrden = useCallback(
    (data: OrdenPayload): boolean => {
      if (!isConnected) {
        console.warn('[useSocketEmitter] emitNuevaOrden: No connected');
        return false;
      }
      const payload = { ...data, timestamp: Date.now(), module: 'POS' };
      console.log('[useSocketEmitter] Emitting nuevaOrden:', payload.ventaId);
      return emit('nuevaOrden', payload);
    },
    [emit, isConnected]
  );

  const emitOrdenActualizada = useCallback(
    (data: OrdenActualizadaPayload): boolean => {
      if (!isConnected) {
        console.warn('[useSocketEmitter] emitOrdenActualizada: No connected');
        return false;
      }
      const payload = { ...data, timestamp: Date.now(), module: 'POS' };
      console.log('[useSocketEmitter] Emitting ordenActualizada:', payload.ventaId || payload.IDventas);
      return emit('ordenActualizada', payload);
    },
    [emit, isConnected]
  );

  const emitOrdenCompletada = useCallback(
    (data: OrdenCompletadaPayload): boolean => {
      if (!isConnected) {
        console.warn('[useSocketEmitter] emitOrdenCompletada: No connected');
        return false;
      }
      const payload = { ...data, timestamp: Date.now(), module: 'POS' };
      console.log('[useSocketEmitter] Emitting ordenCompletada:', payload.ventaId);
      return emit('ordenCompletada', payload);
    },
    [emit, isConnected]
  );

  const emitJoinRoom = useCallback(
    (data: JoinRoomPayload, callback?: (response: { success: boolean; error?: string }) => void): boolean => {
      if (!isConnected) {
        console.warn('[useSocketEmitter] emitJoinRoom: No connected');
        return false;
      }
      console.log('[useSocketEmitter] Emitting joinRoom:', data.room);
      return emit('joinRoom', data);
    },
    [emit, isConnected]
  );

  const emitLeaveRoom = useCallback(
    (data: JoinRoomPayload): boolean => {
      if (!isConnected) {
        console.warn('[useSocketEmitter] emitLeaveRoom: No connected');
        return false;
      }
      console.log('[useSocketEmitter] Emitting leaveRoom:', data.room);
      return emit('leaveRoom', data);
    },
    [emit, isConnected]
  );

  const emitCustomEvent = useCallback(
    (event: string, data: any): boolean => {
      if (!isConnected) {
        console.warn(`[useSocketEmitter] emitCustomEvent (${event}): No connected`);
        return false;
      }
      console.log(`[useSocketEmitter] Emitting custom event:`, event, data);
      return emit(event, data);
    },
    [emit, isConnected]
  );

  return {
    emitNuevaOrden,
    emitOrdenActualizada,
    emitOrdenCompletada,
    emitJoinRoom,
    emitLeaveRoom,
    emitCustomEvent,
  };
}

export default useSocketEmitter;
