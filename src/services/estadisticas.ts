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

export interface InsumoPrecioPunto {
  date: string;
  label: string;
  value: number;
  precioAnterior?: number;
  proveedor: string;
  cantidad: number;
  subtotal: number;
}

export interface InsumoPrecioItem {
  id: string;
  nombre: string;
  categoria: string;
  unidad: string;
  color: string;
  precioActual: number;
  precioInicial: number;
  precioPromedio: number;
  precioMin: number;
  precioMax: number;
  variacionPorcentual: number;
  variacionAbsoluta: number;
  totalComprado: number;
  subtotalComprado: number;
  ultimoProveedor: string;
  comprasRegistradas: number;
  seriePuntos: InsumoPrecioPunto[];
}

export interface VariacionPreciosResponse {
  success: boolean;
  data: {
    resumen: {
      totalInsumosAuditados: number;
      insumosConCompras: number;
      insumosConAumento: number;
      insumosConBaja: number;
      insumosEstables: number;
    };
    insumos: InsumoPrecioItem[];
  };
}

export const getInsumosPreciosMulti = async (
  startDate?: string,
  endDate?: string,
  categoriaId?: string
): Promise<VariacionPreciosResponse> => {
  const { data } = await api.get('/estadisticas/insumos-precios-multi', {
    params: { startDate, endDate, categoriaId }
  });
  return data;
};
