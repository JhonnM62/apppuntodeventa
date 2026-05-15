// ============================================================
// Q'HUBO MOR ERP - useSocketEvent Hook
// ============================================================
// Hook para escuchar eventos de socket con cleanup automático
//
// USO:
//   useSocketEvent<OrderPayload>('ordenRecibida', handleOrden, []);
//
// CARACTERÍSTICAS:
// - Cleanup automático al desmontar
// - Tipado estricto con generics
// - Recepción de datos pendientes tras reconexión
// - Manejo de errores en handlers
//
// IMPORTANTE:
// - Este hook DEBE ser usado en lugar de socket.on() directo
// - Asegura que los listeners se limpien correctamente
// - Previene memory leaks
//
// EJEMPLO:
//   function PedidosScreen() {
//     useSocketEvent<OrderPayload>('ordenRecibida', (data) => {
//       addVenta(data.venta);
//     });
//   }
// ============================================================

import { useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';

export function useSocketEvent<T = any>(
  event: string,
  handler: (data: T) => void,
  dependencies: any[] = []
): void {
  const { socket, isConnected } = useSocket();
  const handlerRef = useRef(handler);
  const lastDataRef = useRef<T | null>(null);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!socket) {
      console.log(`[useSocketEvent] No socket available for event: ${event}`);
      return;
    }

    const socketHandler = (data: T) => {
      if (data == null) {
        console.log(`[useSocketEvent] Received null/undefined data for event: ${event}`);
        return;
      }
      lastDataRef.current = data;
      try {
        handlerRef.current(data);
      } catch (error) {
        console.error(`[useSocketEvent] Error in handler for ${event}:`, error);
      }
    };

    console.log(`[useSocketEvent] Adding listener for event: ${event}`);
    socket.on(event, socketHandler);

    return () => {
      console.log(`[useSocketEvent] Removing listener for event: ${event}`);
      socket.off(event, socketHandler);
    };
  }, [socket, event, ...dependencies]);

  useEffect(() => {
    if (isConnected && lastDataRef.current) {
      console.log(`[useSocketEvent] Re-triggering handler with last data for event: ${event}`);
      handlerRef.current(lastDataRef.current);
    }
  }, [isConnected]);
}

export default useSocketEvent;
