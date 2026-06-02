import { getSales } from '../sales';
import api from '../api';

jest.mock('../api');

const mockApi = api as jest.Mocked<typeof api>;

describe('sales service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSales', () => {
    it('should return array when backend returns nested { data: { data: [...] } }', async () => {
      const mockVentas = [
        { IDventas: '1', estado: 'PAGADO', totalInput: 10000 },
        { IDventas: '2', estado: 'pendiente', totalInput: 20000 },
      ];
      mockApi.get.mockResolvedValueOnce({
        success: true,
        data: { data: mockVentas, meta: { total: 2 } },
        meta: { timestamp: '2026-01-01', path: '/api/v1/ventas' },
      });

      const result = await getSales();
      expect(result).toEqual(mockVentas);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array when response data is not an array', async () => {
      mockApi.get.mockResolvedValueOnce({
        success: true,
        data: { data: 'not an array', meta: {} },
        meta: { timestamp: '2026-01-01', path: '/api/v1/ventas' },
      });

      const result = await getSales();
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array when backend returns undefined', async () => {
      mockApi.get.mockResolvedValueOnce(undefined);

      const result = await getSales();
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array when response is null', async () => {
      mockApi.get.mockResolvedValueOnce(null);

      const result = await getSales();
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array when api throws error', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('Network error'));

      const result = await getSales();
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should pass query params correctly', async () => {
      const mockVentas = [{ IDventas: '3', estado: 'PAGADO' }];
      mockApi.get.mockResolvedValueOnce({
        success: true,
        data: { data: mockVentas, meta: {} },
        meta: {},
      });

      await getSales({ estado: 'PAGADO', page: 1, limit: 20 });

      expect(mockApi.get).toHaveBeenCalledWith('/api/v1/ventas?estado=PAGADO&page=1&limit=20');
    });
  });
});

describe('sales filtering logic', () => {
  const mockVentas = [
    { IDventas: '1', estado: 'PAGADO', totalInput: 10000 },
    { IDventas: '2', estado: 'pendiente', totalInput: 20000 },
    { IDventas: '3', estado: 'PAGADO', totalInput: 30000 },
    { IDventas: '4', estado: 'en_preparacion', totalInput: 40000 },
    { IDventas: '5', estado: 'cancelado', totalInput: 50000 },
  ];

  it('should filter by PAGADO status', () => {
    const filtered = mockVentas.filter(v => v.estado?.toLowerCase() === 'pagado');
    expect(filtered).toHaveLength(2);
    expect(filtered.every(v => v.estado === 'PAGADO')).toBe(true);
  });

  it('should filter by pendiente status', () => {
    const filtered = mockVentas.filter(v => v.estado?.toLowerCase() === 'pendiente');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].IDventas).toBe('2');
  });

  it('should return all when no filter applied', () => {
    const filtered = mockVentas;
    expect(filtered).toHaveLength(5);
  });

  it('should handle case-insensitive status matching', () => {
    const filtered = mockVentas.filter(v => v.estado?.toLowerCase() === 'pagado');
    const upperFiltered = mockVentas.filter(v => v.estado?.toUpperCase() === 'PAGADO');
    expect(filtered).toEqual(upperFiltered);
  });
});
