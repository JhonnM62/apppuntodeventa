import { SeccionCocina } from '../services/seccion-cocina';
import { ProductoPayload } from '../types/socket.types';

export interface GrupoSeccion {
  seccion: SeccionCocina;
  productos: ProductoPayload[];
}

/** Sección por defecto para productos sin sección asignada */
const SECCION_GENERAL: SeccionCocina = {
  IDseccion: '__general__',
  nombre: 'GENERAL',
  color: '#6B7280',
  icono: 'list-outline',
  orden: 9999,
  activa: true,
};

/**
 * Divide los productos de un pedido en grupos por sección de cocina.
 *
 * Reglas:
 * - Un producto con `seccionCocinaId` va a su sección correspondiente.
 * - Un producto sin sección va al grupo GENERAL (al final).
 * - Si no hay ningún producto sin sección, el grupo GENERAL no se incluye.
 * - Las secciones se ordenan según su campo `orden`.
 * - Solo se incluyen secciones que tengan al menos 1 producto en el pedido.
 *
 * @param productos Lista de productos del pedido
 * @param secciones Secciones configuradas (activas, ordenadas)
 * @param incluirGeneral Si false, los productos sin sección se omiten
 * @returns Array de grupos [{seccion, productos}] listos para imprimir
 */
export function splitComandaPorSeccion(
  productos: ProductoPayload[],
  secciones: SeccionCocina[],
  incluirGeneral = true,
): GrupoSeccion[] {
  console.log('[DEBUG-PRINTER] splitComanda - IN - productos recibidos:', JSON.stringify(productos.map(p => ({ n: p.nombre, secId: p.seccionCocinaId }))));
  console.log('[DEBUG-PRINTER] splitComanda - IN - secciones configuradas:', JSON.stringify(secciones.map(s => s.IDseccion)));

  const grupos = new Map<string, GrupoSeccion>();

  // Inicializar mapa con secciones en orden
  for (const seccion of secciones) {
    grupos.set(String(seccion.IDseccion), { seccion, productos: [] });
  }

  // Clasificar productos
  const sinSeccion: ProductoPayload[] = [];

  for (const producto of productos) {
    const sectionId = producto.seccionCocinaId != null ? String(producto.seccionCocinaId) : null;
    if (sectionId && grupos.has(sectionId)) {
      grupos.get(sectionId)!.productos.push(producto);
    } else {
      console.log(`[DEBUG-PRINTER] splitComanda - Producto sin sección (o sección no encontrada): ${producto.nombre}, ID: ${sectionId}, Existe en mapa: ${sectionId ? grupos.has(sectionId) : false}`);
      sinSeccion.push(producto);
    }
  }

  // Filtrar secciones sin productos
  const resultado = [...grupos.values()].filter((g) => g.productos.length > 0);


  // Agregar grupo GENERAL al final si hay productos sin sección
  if (incluirGeneral && sinSeccion.length > 0) {
    resultado.push({ seccion: SECCION_GENERAL, productos: sinSeccion });
  }

  return resultado;
}

/**
 * Retorna true si hay secciones configuradas con productos en el pedido.
 * Útil para decidir si imprimir un solo ticket o varios.
 */
export function haySeccionesEnPedido(
  productos: ProductoPayload[],
  secciones: SeccionCocina[],
): boolean {
  if (secciones.length === 0) return false;
  return productos.some((p) => p.seccionCocinaId != null);
}
