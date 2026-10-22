import api from './api';

export interface DomicilioItemMapeado {
  productoId?: string;
  nombre: string;
  cantidad: number;
  precioUnitario?: number;
  precioTotal?: number;
  descuento?: number;
  comentarios?: string;
  encontradoEnCatalogo?: boolean;
}

export interface DomicilioItemExterno {
  nombre: string;
  cantidad: number;
  observacion?: string;
}

export interface DomicilioWAItem {
  IDdomicilio: string;
  orderIdWA: string;
  clienteTelefono: string;
  clienteNombre?: string;
  direccion?: string;
  botNombre?: string;
  detalleTextoWA: string;
  itemsMapeados: DomicilioItemMapeado[];
  itemsExternos?: DomicilioItemExterno[];
  totalWA: number;
  totalCalculado?: number;
  metodoPagoWA?: string;
  estado: 'RECIENTE' | 'TOMADO' | 'EN_PREPARACION' | 'DESPACHADO' | 'COBRADO' | 'CANCELADO' | string;
  origen?: string;
  ventaId?: string;
  ventaRelacion?: any;
  timestampPedido: string;
  atendidoAt?: string;
  atendidoPor?: string;
  createdAt: string;
  updatedAt: string;
}

export const getDomicilios = async (estado?: string): Promise<DomicilioWAItem[]> => {
  const params = estado && estado !== 'TODOS' ? { estado } : {};
  const res = await api.get('/domicilios', { params });
  return (res as any)?.data || res;
};

export const getDomicilioById = async (id: string): Promise<DomicilioWAItem> => {
  const res = await api.get(`/domicilios/${id}`);
  return (res as any)?.data || res;
};

export const updateDomicilioEstado = async (id: string, estado: string): Promise<DomicilioWAItem> => {
  const res = await api.patch(`/domicilios/${id}/estado`, { estado });
  return (res as any)?.data || res;
};

export const vincularVentaDomicilio = async (id: string, ventaId: string, estado?: string): Promise<DomicilioWAItem> => {
  const res = await api.post(`/domicilios/${id}/vincular-venta`, { ventaId, estado });
  return (res as any)?.data || res;
};

export const deleteDomicilio = async (id: string): Promise<any> => {
  const res = await api.delete(`/domicilios/${id}`);
  return (res as any)?.data || res;
};
