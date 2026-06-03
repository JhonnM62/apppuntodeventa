import api from './api';

const isNotFoundError = (error: any) => {
  const status =
    error?.statusCode ??
    error?.status ??
    error?.response?.status ??
    error?.response?.data?.statusCode ??
    error?.response?.data?.error?.statusCode;
  const code = error?.code ?? error?.response?.data?.code ?? error?.response?.data?.error?.code;
  const message = String(
    error?.message ??
    error?.response?.data?.message ??
    error?.response?.data?.error?.message ??
    ''
  );

  return status === 404 || code === 'NOT_FOUND' || message.includes('Cannot PATCH');
};

const logInventarioRouteAttempt = (label: string, path: string, payload?: unknown) => {
  console.log(
    `[inventarioService] ${label} | baseURL: ${api.defaults.baseURL} | path: ${path} | payload: ${JSON.stringify(payload)}`
  );
};

export type InventarioItem = {
  IDinventario: string;
  nombre: string;
  fechaYHora: string;
  tipo: string;
  total: number;
  descuento: number;
  ordenInventario?: OrderInventarioItem[];
};

export type OrderInventarioItem = {
  IDorderinventario: string;
  IDinventario: string;
  categoria: string;
  nombreDelAlimento: string;
  cantidad: number;
  observacion: string;
  nombreCategoria: string;
  fecha: string;
  precio: number;
  precioActual?: number;
  subtotal?: number;
  precioAnterior?: number;
  cantInsumos?: number;
  agregarAInsumos?: string;
  provedor?: string;
  telefonoProvedor?: string;
  direccionProvedor?: string;
  disponible: string;
  fechaYHora: string;
  seCompro: string;
  inventario?: InventarioItem;
};

export type CreateInventarioDto = {
  nombre: string;
  tipo?: string;
  total?: number;
  descuento?: number;
};

export type CreateOrderInventarioDto = {
  IDinventario?: string;
  categoria: string;
  nombreDelAlimento: string;
  cantidad: number;
  observacion?: string;
  nombreCategoria?: string;
  fecha?: string;
  precio?: number;
  precioActual?: number;
  subtotal?: number;
  precioAnterior?: number;
  disponible?: string;
  seCompro?: string;
  provedor?: string;
  telefonoProvedor?: string;
  direccionProvedor?: string;
};

export type UpdateOrderInventarioDto = Partial<CreateOrderInventarioDto>;

const parseInventario = (item: any): InventarioItem => ({
  IDinventario: item.IDinventario,
  nombre: item.nombre,
  fechaYHora: item.fechaYHora,
  tipo: item.tipo,
  total: Number(item.total) || 0,
  descuento: Number(item.descuento) || 0,
  ordenInventario: item.ordenInventario?.map(parseOrden),
});

const parseOrden = (item: any): OrderInventarioItem => ({
  IDorderinventario: item.IDorderinventario,
  IDinventario: item.IDinventario,
  categoria: item.categoria || '',
  nombreDelAlimento: item.nombreDelAlimento || item.Nombre_del_Alimento || '',
  cantidad: item.cantidad || item.Cantidad || 0,
  observacion: item.observacion || item.Observacion || '',
  nombreCategoria: item.nombreCategoria || item.NombreCategoria || '',
  fecha: item.fecha || item.Fecha || '',
  precio: Number(item.precio || item.Precio || 0),
  precioActual: item.precioActual ? Number(item.precioActual) : undefined,
  subtotal: item.subtotal ? Number(item.subtotal) : undefined,
  precioAnterior: item.precioAnterior ? Number(item.precioAnterior) : undefined,
  cantInsumos: item.cantInsumos || item.Cant_insumos,
  agregarAInsumos: item.agregarAInsumos || item['Agregar a Insumos?'],
  provedor: item.provedor || item.Provedor || '',
  telefonoProvedor: item.telefonoProvedor || item.Telefono_Provedor || '',
  direccionProvedor: item.direccionProvedor || item.Direccion_Provedor || '',
  disponible: item.disponible || item.Disponible || 'Si',
  fechaYHora: item.fechaYHora || item['Fecha y hora'] || '',
  seCompro: item.seCompro || item['Se compro?'] || 'No',
  inventario: item.inventario ? parseInventario(item.inventario) : undefined,
});

const extractData = (resp: any): any => {
  console.log('[DEBUG] extractData input:', JSON.stringify(resp)?.slice(0, 500));
  if (Array.isArray(resp)) return resp;
  if (resp?.data?.data) return resp.data.data;
  if (resp?.data) return resp.data;
  return resp;
};

export const inventarioService = {
  async getAll(params?: { limit?: number }): Promise<InventarioItem[]> {
    const limit = params?.limit || 10000;
    const resp = await api.get(`/inventario?limit=${limit}`);
    const data = extractData(resp);
    if (Array.isArray(data)) return data.map(parseInventario);
    return [];
  },

  async getAllOrdenes(params?: { limit?: number; page?: number; buscar?: string; tipo?: string; provedor?: string; categoria?: string; fechaInicio?: string; fechaFin?: string }): Promise<{data: OrderInventarioItem[], meta: any}> {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.page) query.append('page', params.page.toString());
    if (params?.buscar) query.append('buscar', params.buscar);
    if (params?.tipo) query.append('tipo', params.tipo);
    if (params?.provedor) query.append('provedor', params.provedor);
    if (params?.categoria) query.append('categoria', params.categoria);
    if (params?.fechaInicio) query.append('fechaInicio', params.fechaInicio);
    if (params?.fechaFin) query.append('fechaFin', params.fechaFin);

    const resp = await api.get(`/inventario/items?${query.toString()}`);
    const resData = resp?.data || resp;
    
    if (resData?.data && Array.isArray(resData.data)) {
      return {
        data: resData.data.map(parseOrden),
        meta: resData.meta || {}
      };
    }
    
    const data = extractData(resp);
    if (Array.isArray(data)) return { data: data.map(parseOrden), meta: {} };
    return { data: [], meta: {} };
  },

  async getById(id: string): Promise<InventarioItem> {
    const resp = await api.get(`/inventario/${id}`);
    const data = extractData(resp);
    if (data && typeof data === 'object') return parseInventario(data);
    return data;
  },

  async create(data: CreateInventarioDto): Promise<InventarioItem> {
    const resp = await api.post('/inventario', data);
    const item = extractData(resp);
    return parseInventario(item);
  },

  async update(id: string, data: Partial<CreateInventarioDto>): Promise<InventarioItem> {
    const resp = await api.patch(`/inventario/${id}`, data);
    const item = extractData(resp);
    return parseInventario(item);
  },

  async delete(id: string, restoreStock: boolean = true): Promise<void> {
    await api.delete(`/inventario/${id}?restoreStock=${restoreStock}`);
  },

  async createOrdenInventario(data: CreateOrderInventarioDto): Promise<OrderInventarioItem> {
    const resp = await api.post('/inventario/item', data);
    const item = extractData(resp);
    return parseOrden(item);
  },

  async updateOrdenInventario(id: string, data: UpdateOrderInventarioDto): Promise<OrderInventarioItem> {
    const primaryPath = `/inventario/item/${id}/update`;
    const legacyPath = `/inventario/item/update/${id}`;

    try {
      logInventarioRouteAttempt('PATCH primary', primaryPath, data);
      const resp = await api.patch(primaryPath, data);
      const item = extractData(resp);
      return parseOrden(item);
    } catch (error: any) {
      if (!isNotFoundError(error)) {
        console.error('[inventarioService] PATCH primary failed without fallback:', error);
        throw error;
      }

      console.warn('[inventarioService] Primary route returned 404, trying legacy route.', {
        baseURL: api.defaults.baseURL,
        primaryPath,
        legacyPath,
      });

      try {
        logInventarioRouteAttempt('PATCH legacy', legacyPath, data);
        const resp = await api.patch(legacyPath, data);
        const item = extractData(resp);
        return parseOrden(item);
      } catch (legacyError: any) {
        console.error('[inventarioService] Both update routes failed.', {
          baseURL: api.defaults.baseURL,
          primaryPath,
          legacyPath,
          primaryError: error,
          legacyError,
        });

        if (isNotFoundError(legacyError)) {
          throw {
            code: 'BACKEND_ROUTE_MISSING',
            statusCode: 404,
            message:
              'El backend publicado no tiene habilitado el endpoint para actualizar items de inventario. Debes desplegar la version nueva del modulo de inventario.',
            details: {
              baseURL: api.defaults.baseURL,
              primaryPath,
              legacyPath,
            },
          };
        }

        throw legacyError;
      }
    }
  },

  async deleteOrdenInventario(id: string, restoreStock: boolean = true): Promise<void> {
    await api.delete(`/inventario/item/${id}?restoreStock=${restoreStock}`);
  },

  async toggleComprado(id: string, seCompro: 'Si' | 'No'): Promise<OrderInventarioItem> {
    const resp = await api.patch(`/inventario/item/${id}/comprar`, { seCompro });
    const item = extractData(resp);
    return parseOrden(item);
  },

  async marcarVariosComprado(ids: string[]): Promise<any[]> {
    const resp = await api.patch(`/inventario/items/comprar`, { ids });
    return extractData(resp);
  },

  async recalcularStock(): Promise<any> {
    const resp = await api.post('/inventario/recalcular-stock');
    return extractData(resp);
  },

  async calcularStockHistorico(insumoId: string): Promise<{
    insumoId: string;
    nombre: string;
    stockActual: number;
    stockCalculado: number;
    diferencia: number;
    alerta: boolean;
    resumen: { totalEntradas: number; totalSalidas: number; totalMovimientos: number };
    movimientos: Array<{ fecha: string | null; tipo: string; cantidad: number; observacion: string | null }>;
  }> {
    const resp = await api.get(`/inventario/insumo/${insumoId}/stock-calculado`);
    const data = extractData(resp);
    return data;
  },
};

export default inventarioService;
