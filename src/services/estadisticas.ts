import api from './api';

export interface EstadisticasGenerales {
  totales: {
    ventas: number;
    gastosNegocio: number;
    gastosPersonales: number;
    utilidadNegocio: number;
    utilidadNeta: number;
    inventarioTotal: number;
    totalTransferencias: number;
    totalPlataGuardada: number;
    totalTransferenciasContadas: number;
  };
  graficos: {
    diario: { label: string; value: number }[];
    semanal: { label: string; value: number }[];
    mensual: { label: string; value: number }[];
  };
  productos: {
    nombre: string;
    cantidad: number;
    total: number;
    categoria: string;
  }[];
}

export const getEstadisticasGenerales = async (startDate?: string, endDate?: string, categoriaProducto?: string, vendedorId?: string): Promise<EstadisticasGenerales> => {
  const { data } = await api.get('/estadisticas/generales', {
    params: { startDate, endDate, categoriaProducto, vendedorId }
  });
  return data;
};

export const getInsumosDescuadres = async (startDate: string, endDate: string) => {
  const { data } = await api.get('/estadisticas/insumos-descuadres', {
    params: { startDate, endDate }
  });
  return data;
};
