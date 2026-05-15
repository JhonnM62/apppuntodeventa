import { createSale, SalePayload } from '../services/sales';
import api from '../services/api';

jest.mock('../services/api', () => ({
  post: jest.fn(),
}));

describe('Performance y Lógica de Ventas', () => {
  const mockPayload: SalePayload = {
    venta: {
      mesa: 'V.R',
      estado: 'PAGADO',
      medioDePago: 'EFECTIVO',
      efectivoRecibido: 10000,
      devueltas: 0,
      totalInput: 10000,
    },
    productos: [
      {
        productoId: '1',
        nombre: 'Producto Test',
        categoria: 'LO MAS VENDIDO',
        cantidad: 1,
        precio: 10000,
        precioTotal: 10000,
        estado: 'PAGADO',
      }
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('debe ejecutar createSale y retornar datos simulando menos de 1 segundo', async () => {
    const mockResponse = { data: { pedido: 'pedido-123' } };
    (api.post as jest.Mock).mockResolvedValueOnce(mockResponse);

    const startTime = performance.now();
    const result = await createSale(mockPayload);
    const endTime = performance.now();

    expect(api.post).toHaveBeenCalledWith('/ventas/completa', mockPayload);
    expect(result).toEqual(mockResponse);
    expect(endTime - startTime).toBeLessThan(1000);
  });

  it('debe propagar errores correctamente y medir el tiempo de fallo', async () => {
    (api.post as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const startTime = performance.now();
    await expect(createSale(mockPayload)).rejects.toThrow('Network error');
    const endTime = performance.now();

    expect(endTime - startTime).toBeLessThan(1000);
  });
});
