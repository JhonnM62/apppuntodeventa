import api from './api';

export interface SaleProduct {
  productoId: string;
  nombre: string;
  nombreProducto: string;
  categoria: string;
  categoriaProducto: string;
  cantidad: number;
  precio: number;
  precioTotal: number;
  estado: string;
  imagenUrl?: string;
  comentarios?: string;
}

export interface SalePayload {
  venta: {
    mesa: string;
    estado: string;
    medioDePago: string;
    efectivoRecibido: number;
    devueltas?: number;
    banco?: string;
    totalInput: number;
    descuento?: number;
    porcentajeDeDescuento?: string;
    pedido?: string;
    cartStartTime?: string;
    clienteId?: number;
  };
  productos: SaleProduct[];
}

export const createSale = async (data: SalePayload) => {
  const startTime = performance.now();
  try {
    const response = await api.post('/ventas/completa', data);
    const endTime = performance.now();
    console.log(`[Metrics] createSale (Cobro Completo) tomó ${(endTime - startTime).toFixed(2)}ms`);
    return response;
  } catch (error) {
    const endTime = performance.now();
    console.log(`[Metrics] createSale falló después de ${(endTime - startTime).toFixed(2)}ms`);
    throw error;
  }
};

export const getSales = async (params?: { 
  estado?: string; 
  page?: number; 
  limit?: number; 
  includeDeleted?: boolean; 
  fechaDesde?: string; 
  fechaHasta?: string; 
  usuario?: string; 
  medioDePago?: string; 
  search?: string;
  totalMin?: string;
  totalMax?: string;
}) => {
  const response = await api.get('/ventas', { params });
  
  return response?.data ?? response;
};

export const getSalesHoy = async () => {
  const response = await api.get('/ventas/hoy');
  return response?.data ?? response;
};

export const updateVentaEstado = async (ventaId: string, estado: string) => {
  return await api.patch(`/ventas/${ventaId}/estado`, { estado });
};

export const updateVentaPago = async (ventaId: string, data: any) => {
  return await api.patch(`/ventas/${ventaId}/pago`, data);
};

export const addProductosToVenta = async (ventaId: string, productos: SaleProduct[]) => {
  return await api.post(`/ventas/${ventaId}/productos`, { productos });
};

export const deleteSale = async (ventaId: string, reason: string = 'Eliminado por administrador') => {
  return await api.delete(`/ventas/${ventaId}`, { data: { reason } });
};

export const deleteSalesBulk = async (ventaIds: string[], reason: string = 'Eliminación masiva por administrador') => {
  return await api.delete(`/ventas/bulk`, { data: { ids: ventaIds, reason } });
};

export const restoreSale = async (ventaId: string) => {
  return await api.post(`/ventas/${ventaId}/restore`);
};

export const hardDeleteSale = async (ventaId: string) => {
  return await api.delete(`/ventas/${ventaId}/hard`);
};

export const hardDeleteSalesBulk = async (ids: string[]) => {
  const response = await api.delete(`/ventas/bulk/hard`, { data: { ids } });
  return response.data;
};

export const emptyTrashSales = async () => {
  return await api.delete(`/ventas/trash/empty`);
};
