import { generateTicketPayload, TicketData } from '../src/utils/printer';

describe('Printer Utility Tests', () => {
  const sampleData: TicketData = {
    orderId: 'ORD-12345',
    fecha: '05/05/2026, 12:00:00 p. m.',
    cliente: 'Juan Perez',
    estado: 'PAGADO',
    total: 15000,
    metodoPago: 'EFECTIVO',
    efectivoRecibido: 20000,
    devueltas: 5000,
    observaciones: 'Sin cebolla',
    productos: [
      {
        cantidad: 2,
        nombre: 'Hamburguesa Sencilla',
        precioUnitario: 5000,
        subtotal: 10000,
      },
      {
        cantidad: 1,
        nombre: 'Papas Fritas',
        precioUnitario: 5000,
        subtotal: 5000,
      },
    ],
  };

  it('generates a valid 58mm ticket payload', () => {
    const payload = generateTicketPayload(sampleData, 58);
    
    // Verifica que incluya los elementos clave
    expect(payload).toContain('<C>Q HUBO MOR</C>');
    expect(payload).toContain('<C>SISTEMA POS</C>');
    expect(payload).toContain('Orden #: ORD-12345');
    expect(payload).toContain('Juan Perez');
    expect(payload).toContain('PAGADO');
    expect(payload).toContain('Hamburguesa Sencil');
    expect(payload).toContain('Papas Fritas');
    expect(payload).toContain('TOTAL A PAGAR: $15.000');
    expect(payload).toContain('Medio de Pago: EFECTIVO');
    expect(payload).toContain('Recibido: $20.000');
    expect(payload).toContain('Cambio: $5.000');
    expect(payload).toContain('Notas: Sin cebolla');
    expect(payload).toContain('<C>¡Gracias por tu compra!</C>');
    
    // Verifica el ancho separador de 58mm (32 caracteres)
    expect(payload).toContain('-'.repeat(32));
    expect(payload).toContain('='.repeat(32));
  });

  it('generates a valid 80mm ticket payload', () => {
    const payload = generateTicketPayload(sampleData, 80);
    
    // Verifica el ancho separador de 80mm (48 caracteres)
    expect(payload).toContain('-'.repeat(48));
    expect(payload).toContain('='.repeat(48));
    expect(payload).toContain('TOTAL A PAGAR: $15.000');
  });

  it('handles optional fields gracefully', () => {
    const minimalData: TicketData = {
      fecha: '05/05/2026',
      total: 5000,
      productos: [
        {
          cantidad: 1,
          nombre: 'Agua',
          precioUnitario: 5000,
          subtotal: 5000,
        }
      ]
    };

    const payload = generateTicketPayload(minimalData, 58);
    
    expect(payload).toContain('Agua');
    expect(payload).toContain('TOTAL A PAGAR: $5.000');
    
    // Estos no deben estar
    expect(payload).not.toContain('Orden #');
    expect(payload).not.toContain('Cliente:');
    expect(payload).not.toContain('Medio de Pago:');
    expect(payload).not.toContain('Notas:');
  });
});
