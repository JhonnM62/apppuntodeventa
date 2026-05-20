# Plan de Acción: Descuento Automático de Insumos por Receta en Ventas

## Objetivo
Vincular el módulo de **Ventas** con el de **Insumos**, de manera que al registrar, editar o anular una venta, el sistema automáticamente descuente o devuelva el stock de los insumos que componen la receta del producto vendido, actualizando la información en tiempo real vía WebSockets.

## 1. Análisis del Flujo Actual
- **Modelo de Datos:** 
  - `Productos` tiene una relación de 1 a muchos con `Recetainsumos`.
  - `Recetainsumos` vincula un producto con un `Insumos` específico y define una `cantidad` a usar.
  - `Insumos` tiene la bandera `descontarCantDeVentas` ("SI" o "NO") que indica si se debe afectar el inventario al vender.
- **Backend (`ventas.service.ts`):** Actualmente crea los registros en `Ventas` y `Orderventas`, pero ignora el impacto en inventarios.
- **Backend (`insumos.service.ts`):** Ya cuenta con un método robusto `movimientoStock` que ajusta cantidades, registra en `Orderinventario` (Salidas/Entradas) y emite los WebSockets (`REFRESH_INSUMOS`).

## 2. Modificaciones en el Backend (NestJS)

### A. Ajuste en `InsumosService` (Soporte para Stock Negativo)
Por defecto, `movimientoStock` lanza un `BadRequestException` si se intenta sacar más de lo que hay. En un entorno de ventas dinámico, es común que por desfases se venda un insumo que figura en 0. 
- **Acción:** Modificar la firma de `movimientoStock` para aceptar un parámetro `allowNegative = false`. Si viene desde Ventas (`true`), permitiremos que el stock quede en negativo (ej. -2) en lugar de bloquear toda la venta.

### B. Inyección de Dependencias
- Importar `InsumosModule` dentro de `VentasModule` para poder inyectar y utilizar el `InsumosService` directamente en `VentasService`.

### C. Lógica en Creación de Ventas (`createVentaCompleta`)
Al confirmar una venta:
1. Iterar sobre la lista de `productos` vendidos.
2. Para cada producto, consultar `this.prisma.recetainsumos.findMany` (incluyendo los datos del insumo relacionado).
3. Por cada ingrediente de la receta, verificar si `insumoRelacion.descontarCantDeVentas` es igual a `"SI"` (case-insensitive).
4. Calcular cantidad a descontar: `cantidad_del_producto_vendido * cantidad_en_receta`.
5. Llamar a `insumosService.movimientoStock(id, 'salida', cantidadCalculada, 'Descuento por venta: [Nombre del Producto]', true)`.

### D. Lógica en Edición de Ventas (`updateVentaCompleta`)
Al editar una venta (ej. desde el historial), los productos pueden cambiar:
1. **Fase de Reverso:** Antes de borrar las `Orderventas` viejas, iterar sobre ellas, buscar sus recetas, y devolver los insumos al inventario (`entrada` con motivo "Reverso por edición de venta").
2. **Fase de Aplicación:** Al insertar los nuevos `Orderventas`, aplicar la misma lógica de descuento del paso C.

### E. Lógica en Anulación/Eliminación (`remove` y `hardDelete`)
Al eliminar o anular una venta:
1. Obtener las `Orderventas` asociadas antes de marcarlas como eliminadas.
2. Iterar sobre sus recetas y hacer una `entrada` de stock con el motivo "Reverso por anulación de venta".

## 3. Impacto en el Frontend y WebSockets
- **No se requiere código nuevo en el frontend para el inventario:** El frontend de la vista de Insumos ya está suscrito al evento `REFRESH_INSUMOS` gracias al hook `useSocketInsumos()`.
- Al usar el `InsumosService` nativo del backend para hacer los descuentos, el evento se disparará automáticamente y todas las tablets/teléfonos verán bajar (o subir) el stock y aparecer los registros de "Salida" en el historial de cada insumo en **tiempo real**.

## 4. Consideraciones y Casos Límite a Cubrir
- *Performance:* Se deben agrupar las consultas a base de datos (usar `Promise.all` o extraer las recetas en bloque) para no hacer lenta la finalización de la venta.
- *Nulos:* Validar si la cantidad de la receta o del producto es `null` o `undefined` y tomarlo como `0` o ignorarlo.
- *Filtros de texto:* Asegurar que `"Si"`, `"SI"` y `"si"` se validen correctamente mediante un `toLowerCase()`.

---
*Este documento es un borrador técnico. Esperando aprobación para proceder con la escritura de código en el backend.*