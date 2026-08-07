import { useEffect, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import { useSocketEvent } from './useSocketEvent';
import { useSalesStore } from '../store/useSalesStore';
import { getSales } from '../services/sales';
import { Room, SocketEvent } from '../types/socket.types';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useGlobalSalesSync = () => {
  const { joinRoom, isConnected } = useSocket();
  const addVenta = useSalesStore((state) => state.addVenta);
  const updateVenta = useSalesStore((state) => state.updateVenta);
  const setCachedVentas = useSalesStore((state) => state.setVentas);
  const shouldRefetchVentas = useSalesStore((state) => state.shouldRefetch);

  const fetchSales = useCallback(async () => {
    try {
      const data = await getSales({ limit: 100 });
      setCachedVentas(data?.data || []);
    } catch (err) {
      console.error('[useGlobalSalesSync] Error fetching sales:', err);
    }
  }, [setCachedVentas]);

  useEffect(() => {
    const initFetch = async () => {
      const token = await AsyncStorage.getItem('token');
      if (token && shouldRefetchVentas()) {
        fetchSales();
      }
    };
    initFetch();
  }, [shouldRefetchVentas, fetchSales]);

  useEffect(() => {
    if (isConnected) {
      joinRoom(Room.KITCHEN);
    }
  }, [isConnected, joinRoom]);

  const handleOrdenRecibida = useCallback((data: any) => {
    console.log('[GlobalSalesSync] Orden recibida:', JSON.stringify(data)?.slice(0, 100));
    if (data) {
      if (data.ventaId && data.venta) {
        const ventaConProductos = { ...data.venta, ordenVentas: data.productos };
        addVenta(ventaConProductos);
      } else if (data.IDventas) {
        addVenta(data);
      }
    }
  }, [addVenta]);

  const removeVenta = useSalesStore((state) => state.removeVenta);

  const handleOrdenActualizada = useCallback((data: any) => {
    console.log('[GlobalSalesSync] Orden actualizada:', JSON.stringify(data)?.slice(0, 100));
    if (data) {
      if (data.action === 'delete' || data.action === 'hardDelete') {
        if (data.ventaId) removeVenta(data.ventaId);
      } else if (data.action === 'bulkDelete' || data.action === 'hardBulkDelete') {
        if (Array.isArray(data.ventaIds)) {
          data.ventaIds.forEach((id: string) => removeVenta(id));
        }
      } else if (data.action === 'restore' || data.action === 'create' || data.action === 'updateEstado') {
        if (data.venta) {
          if (data.action === 'create' || data.action === 'restore') {
            addVenta(data.venta);
          } else {
            updateVenta(data.venta.IDventas || data.ventaId, data.venta);
          }
        }
      } else {
        // Fallback for standard updates without action wrapper
        if (data.venta) {
          updateVenta(data.venta.IDventas || data.IDventas || data.ventaId, data.venta);
        } else if (data.IDventas) {
          updateVenta(data.IDventas, data);
        } else if (data.ventaId) {
          updateVenta(data.ventaId, data);
        }
      }
    }
  }, [updateVenta, addVenta, removeVenta]);

  useSocketEvent('nuevaOrden', handleOrdenRecibida, [handleOrdenRecibida]);
  useSocketEvent('ordenRecibida', handleOrdenRecibida, [handleOrdenRecibida]);
  useSocketEvent('ordenActualizadaKitchen', handleOrdenActualizada, [handleOrdenActualizada]);
  useSocketEvent('ordenActualizadaCaja', handleOrdenActualizada, [handleOrdenActualizada]);
  useSocketEvent('ordenActualizada', handleOrdenActualizada, [handleOrdenActualizada]);
  useSocketEvent(SocketEvent.REFRESH_VENTAS, handleOrdenActualizada, [handleOrdenActualizada]);
};
