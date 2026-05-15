import { getProducts } from '../products';
import { createSale } from '../sales';
import api from '../api';

jest.mock('../api');

describe('API Services', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('products service', () => {
    it('getProducts should fetch and return products data', async () => {
      const mockData = { data: [{ id: 1, name: 'Product 1' }], meta: null };
      (api.get as jest.Mock).mockResolvedValueOnce({ data: mockData });

      const result = await getProducts();
      expect(api.get).toHaveBeenCalledWith('/productos', { timeout: 5000 });
      expect(result).toEqual(mockData);
    });
  });

  describe('sales service', () => {
    it('createSale should post payload and return response', async () => {
      const payload = {
        Metodo_Pago: 'Efectivo',
        Detalles: [{ Id_Producto: '1', Cantidad: 1, Precio_Unitario: 100 }]
      };
      const mockResponse = { message: 'Venta creada', id: '123' };
      (api.post as jest.Mock).mockResolvedValueOnce({ data: mockResponse });

      const result = await createSale(payload);
      expect(api.post).toHaveBeenCalledWith('/ventas', payload);
      expect(result).toEqual(mockResponse);
    });
  });
});
