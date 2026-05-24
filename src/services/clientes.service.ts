import api from './api';

export interface Cliente {
  IDcliente: number;
  nombre: string | null;
  cedula: number | null;
  compras: string | null;
  fecha_y_hora_creacion: string | null;
  fecha_y_hora_actualizacion: string | null;
  evento: string | null;
  particpa: string | null;
  contador: number | null;
  whatsapp: string | null;
  observaciones: string | null;
  isActive: boolean;
}

export interface ClientesResponse {
  data: Cliente[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface ClienteQueryDto {
  page?: number;
  limit?: number;
  buscar?: string;
  isActive?: boolean;
}

export const getClientes = async (page = 1, limit = 20, buscar?: string, isActive?: boolean): Promise<ClientesResponse> => {
  console.log('[DEBUG clientes.service] getClientes params:', { page, limit, buscar, isActive });
  const response = await api.get('/clientes', {
    params: { page, limit, buscar, isActive }
  });
  console.log('[DEBUG clientes.service] raw response from api.get:', JSON.stringify(response).substring(0, 200));
  return response?.data ?? response;
};

export const getClienteById = async (id: number): Promise<Cliente> => {
  const { data } = await api.get(`/clientes/${id}`);
  return data;
};

export const createCliente = async (cliente: Partial<Cliente>): Promise<Cliente> => {
  const { data } = await api.post('/clientes', cliente);
  return data;
};

export const updateCliente = async (id: number, cliente: Partial<Cliente>): Promise<Cliente> => {
  const { data } = await api.patch(`/clientes/${id}`, cliente);
  return data;
};

export const deleteCliente = async (id: number): Promise<void> => {
  await api.delete(`/clientes/${id}`);
};

export const getVentasByCliente = async (
  clienteId: number,
  page = 1,
  limit = 10
): Promise<{ data: any[]; meta: any }> => {
  const response = await api.get('/ventas', {
    params: { clienteId, page, limit, includeDeleted: false }
  });
  return response?.data ?? response;
};
