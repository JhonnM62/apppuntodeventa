import api from './api';
import { Platform } from 'react-native';

export type InsumoItem = {
  IDalimentos: string;
  Nombre?: string;
  nombre?: string;
  Categoria?: string;
  categoria?: string;
  NombreCategoria?: string;
  nombreCategoria?: string;
  categoriaNombre?: string;
  Unidades?: string;
  unidades?: string;
  cantidadPorPaquete?: number;
  paquetesEnBodega?: number;
  ultimoAjustePendiente?: any;
  Cantidad?: number;
  cantidad?: number;
  imagen?: string;
  imageUrl?: string;
  fecha_de_vencimiento?: string;
  fechaDeVencimiento?: string;
  Precio?: number;
  precio?: number;
  Total?: number;
  total?: number;
  agregar_cantidad?: number;
  agregarCantidad?: number;
  descontar_cant_de_ventas?: string;
  descontarCantDeVentas?: string;
  notificar_a_whatsapp?: string;
  notificarAWhatsapp?: string;
  apartir_de_cantidad?: number;
  apartirDeCantidad?: number;
  enviar_si_o_no?: string;
  enviarSiONo?: string;
  Disponible?: string;
  disponible?: string;
  llevarControlEnCaja?: string;
  llevar_control_en_caja?: string;
  cuadrarInsumos?: boolean;
  estadoStock?: 'critico' | 'normal' | 'sobrante';
  estado?: string;
};

export type CreateInsumoDto = {
  nombre: string;
  categoria?: string;
  nombreCategoria?: string;
  unidades?: string;
  cantidad?: number;
  imagen?: string;
  imageUrl?: string;
  fecha_de_vencimiento?: string;
  precio?: number;
  total?: number;
  apartir_de_cantidad?: number;
  agregar_cantidad?: number;
  disponible?: string;
  descontar_cant_de_ventas?: string;
  notificar_a_whatsapp?: string;
  llevar_control_en_caja?: string;
  cuadrarInsumos?: boolean;
  contador?: number;
  contador2?: number;
  imagencard?: string;
  fecha?: string;
  estado?: string;
  cantidadPorPaquete?: number;
  paquetesEnBodega?: number;
  ajusteRequiereAprobacion?: boolean;
};

export type UpdateInsumoDto = Partial<CreateInsumoDto>;

export type InsumoQuery = {
  page?: number;
  limit?: number;
  buscar?: string;
  categoria?: string;
  disponible?: string;
  estadoStock?: 'critico' | 'normal' | 'sobrante';
  ordenarPor?: string;
  orden?: 'asc' | 'desc';
};

export type MovimientoStock = {
  tipo: 'entrada' | 'salida' | 'ajuste';
  cantidad: number;
  motivo: string;
};

export type Estadisticas = {
  totalInsumos: number;
  totalValor: number;
  totalUnidades: number;
  porEstado: {
    criticos: number;
    normales: number;
    sobrantes: number;
  };
};

export type Alerta = {
  tipo: 'critico';
  insumo: string;
  id: string;
  cantidadActual: number;
  mensaje: string;
};

const parseResponse = (response: any): any[] => {
  console.log('[DEBUG] parseResponse input:', JSON.stringify(response)?.slice(0, 500));
  if (Array.isArray(response)) return response;
  if (response?.data?.data && Array.isArray(response.data.data)) return response.data.data;
  if (response?.data && Array.isArray(response.data)) return response.data;
  if (typeof response === 'object' && response !== null) {
    const keys = Object.keys(response);
    for (const key of keys) {
      if (Array.isArray(response[key])) return response[key];
    }
    if (response.data && typeof response.data === 'object') {
      for (const key of Object.keys(response.data)) {
        if (Array.isArray(response.data[key])) return response.data[key];
      }
    }
  }
  return [];
};

export const insumosService = {
  async getAll(query: InsumoQuery = {}): Promise<InsumoItem[]> {
    const params = new URLSearchParams();
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());
    if (query.buscar) params.append('buscar', query.buscar);
    if (query.categoria) params.append('categoria', query.categoria);
    if (query.disponible) params.append('disponible', query.disponible);
    if (query.estadoStock) params.append('estadoStock', query.estadoStock);
    if (query.ordenarPor) params.append('ordenarPor', query.ordenarPor);
    if (query.orden) params.append('orden', query.orden);

    const response = await api.get(`/insumos?${params.toString()}`);
    return parseResponse(response);
  },

  async getById(id: string): Promise<InsumoItem> {
    const response = await api.get(`/insumos/${id}`);
    const data = response?.data?.data || response?.data || response;
    if (Array.isArray(data)) return data[0] || data;
    return data;
  },

  async create(data: CreateInsumoDto): Promise<any> {
    return api.post('/insumos', data);
  },

  async update(id: string, data: UpdateInsumoDto): Promise<any> {
    return api.patch(`/insumos/${id}`, data);
  },

  async uploadImage(imageUri: string): Promise<string> {
    const formData = new FormData();

    if (Platform.OS === 'web') {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      formData.append('file', blob, 'image.jpg');
    } else {
      const filename = imageUri.split('/').pop() || 'image.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;

      formData.append('file', {
        uri: imageUri,
        name: filename,
        type,
      } as any);
    }

    const response = await api.post('/insumos/upload-image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data?.imageUrl || (response as any).imageUrl || '';
  },

  async delete(id: string): Promise<any> {
    return api.delete(`/insumos/${id}`);
  },

  async movimientoStock(id: string, data: MovimientoStock): Promise<any> {
    return api.post(`/insumos/${id}/movimiento`, data);
  },

  async agregarStock(id: string, cantidad: number, observacion?: string): Promise<any> {
    return api.post(`/insumos/${id}/agregar`, { cantidad, observacion });
  },

  async descontarStock(id: string, cantidad: number, observacion?: string): Promise<any> {
    return api.post(`/insumos/${id}/descontar`, { cantidad, observacion });
  },

  async getMovimientos(id: string, limit = 50): Promise<any[]> {
    const response = await api.get(`/insumos/${id}/movimientos?limit=${limit}`);
    return parseResponse(response);
  },

  async getAlertas(): Promise<Alerta[]> {
    const response = await api.get('/insumos/alertas');
    return parseResponse(response);
  },

  async getEstadisticas(): Promise<Estadisticas> {
    return api.get('/insumos/estadisticas');
  },

  async bulkCreate(insumos: CreateInsumoDto[]): Promise<any> {
    return api.post('/insumos/bulk', { insumos });
  },
};

export default insumosService;