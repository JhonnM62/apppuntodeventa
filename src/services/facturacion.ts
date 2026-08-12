import api from './api';

export const emitirFacturaDian = async (ventaId: string) => {
  return await api.post(`/facturacion/emitir/${ventaId}`);
};
