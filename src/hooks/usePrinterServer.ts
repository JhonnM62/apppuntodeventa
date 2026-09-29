/**
 * usePrinterServer
 *
 * Hook que activa el "modo servidor de impresión" en este dispositivo.
 * Cuando el dispositivo tiene una impresora BT conectada, se registra en el
 * Socket.IO para recibir trabajos de otros dispositivos sin impresora.
 *
 * Flujo:
 *  1. Detecta isConnected + currentPrinter en usePrinterStore.
 *  2. Emite 'print:register' al servidor con el negocioId.
 *  3. Escucha 'print:job' — ejecuta la impresión local.
 *  4. Emite 'print:done' con el resultado.
 *
 * Se monta en el componente raíz (App.tsx / RootLayout) una vez autenticado.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import usePrinterStore from '../store/usePrinterStore';
import useAuthStore from '../store/useAuthStore';
import { useSocket } from '../context/SocketContext';
import { executePrint } from '../utils/printer';
import { PrintJobPayload } from '../types/socket.types';
import { SocketEvent } from '../types/socket.types';

export const usePrinterServer = () => {
  const { isConnected: printerConnected, currentPrinter, paperSize, servidorActivo } = usePrinterStore();
  const { socket, emit, isConnected: socketConnected } = useSocket();
  const user = useAuthStore((s) => s.user);
  const registeredRef = useRef(false);

  const negocioId = (user as any)?.negocioId ?? (user as any)?.IDnegocio ?? 'default';

  useEffect(() => {
    // Solo en móvil y si hay BT conectado y socket disponible
    if (Platform.OS === 'web') return;
    if (!printerConnected || !currentPrinter || !socketConnected || !socket || !servidorActivo) {
      registeredRef.current = false;
      return;
    }

    // Registrarse como servidor de impresión
    emit(SocketEvent.PRINT_REGISTER, { negocioId });
    registeredRef.current = true;

    const handleJob = async (payload: PrintJobPayload) => {
      try {
        await executePrint(
          payload.ticketData,
          payload.paperSize ?? paperSize,
          currentPrinter.inner_mac_address,
          payload.type,
        );
        emit(SocketEvent.PRINT_DONE, { jobId: payload.jobId, success: true });
      } catch (err: any) {
        emit(SocketEvent.PRINT_DONE, {
          jobId: payload.jobId,
          success: false,
          error: err?.message ?? 'Error de impresión',
        });
      }
    };

    socket.on(SocketEvent.PRINT_JOB, handleJob);

    return () => {
      socket.off(SocketEvent.PRINT_JOB, handleJob);
      registeredRef.current = false;
    };
  }, [printerConnected, currentPrinter, socketConnected, socket, negocioId]);
};
