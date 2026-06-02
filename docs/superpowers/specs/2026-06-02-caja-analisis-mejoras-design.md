# Spec: Mejoras Pestaña Cuadre y Análisis de Caja
**Fecha:** 2026-06-02

## Objetivo
Hacer más clara y accionable la pantalla de cierre de caja, especialmente en la reconciliación de diferencias entre el conteo físico y el sistema.

---

## 1. Cuadre Caja — Etiquetas explícitas de diferencia

**Archivo:** `CajaFormScreen.tsx` (tab `cuadre`)

En las líneas de diferencia de efectivo y transferencias, agregar una etiqueta de texto junto al valor:
- `diff > 0` → agregar `(Sobran)` en el mismo color que el valor
- `diff < 0` → agregar `(Faltan)` en el mismo color que el valor
- `diff = 0` → sin etiqueta adicional

---

## 2. Control de Insumos Físicos — colores unificados

**Archivo:** `CajaFormScreen.tsx` (tab `analysis`)

Cambiar la lógica de colores:
- `diferencia === 0` → fondo verde, texto verde ✅
- `diferencia !== 0` (positivo o negativo) → fondo rojo, texto rojo ⚠️

Actualmente: positivo = emerald (verde), negativo = rojo.

---

## 3. Ventas por Categoría — Productos expandibles con acceso rápido

**Archivo:** `CajaFormScreen.tsx` (tab `analysis`)

Cada producto en la lista de Ventas por Categoría tendrá un chevron expandible.
Al expandir, se cruza contra `resumenData.insumos` para calcular la diferencia del insumo asociado.

### Escenario A — Diferencia positiva (faltan registros)
- Muestra: "Faltan N unidades por registrar"
- Botón: "Ir a Nueva Venta" → navega a `NewSaleScreen` con el producto pre-seleccionado

### Escenario B — Diferencia negativa (ventas de más)
- Muestra: "Hay N ventas de más registradas"
- Abre un modal que lista todas las órdenes que contienen ese producto
- Las órdenes se agrupan por: 💳 TRANSFERENCIA / 💵 EFECTIVO / 💬 CON COMENTARIOS
- Un pedido puede aparecer en múltiples grupos si cumple varias condiciones
- Cada fila muestra: hora, número de pedido, cantidad del producto, total del pedido
- Acciones por fila: [−1] decrementar cantidad del producto, [Quitar] eliminar el producto del pedido
- Al aplicar acción: backend recalcula totales, pedido mantiene su estado original
- El `resumenData` se refresca al cerrar el modal

---

## 4. Backend — Endpoint de actualización parcial de producto en venta

**Archivo:** `ventas.controller.ts` / `ventas.service.ts`

Nuevo endpoint: `PATCH /api/v1/ventas/:ventaId/producto/:productoId`
- Body: `{ cantidad: number }` — si cantidad = 0, elimina el producto
- Recalcula `totalInput` de la venta
- Mantiene el estado actual de la venta (`estado` sin cambios)
- Emite evento WebSocket `ordenActualizada` con la venta actualizada
- Ajusta inventario: aplica reverso/deducción según la diferencia de cantidad

---

## Verificación
- TypeScript check sin errores en ambos proyectos
- El modal de cuadre se cierra correctamente y refresca los datos
- Las etiquetas Sobran/Faltan aparecen solo cuando el campo está ingresado
- Diferencia = 0 en insumos siempre es verde, diferencia ≠ 0 siempre es rojo
