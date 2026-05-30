# Auto-Cuadre de Caja con IA (Gemini 1.5 Pro / Flash con Razonamiento Avanzado)

## Objetivo
Permitir a los administradores cuadrar automáticamente el inventario físico y los saldos monetarios de la caja mediante el uso de Inteligencia Artificial. La IA analizará los descuadres y modificará los pedidos existentes para que los conteos de sistema coincidan con los físicos, balanceando además el dinero en efectivo vs transferencias.

## Casos de Uso
1. **Descuadre de Inventario**: El cajero reporta 45 "Vasos de 12 oz" físicos, pero el sistema indica 52. Hay una diferencia de `-7`. La IA buscará pedidos en EFECTIVO que contengan "Vasos de 12 oz" y eliminará 7 unidades de esos pedidos.
2. **Descuadre Monetario**: Tras ajustar el inventario, el sistema recalcula los totales. Si hay un Faltante de Efectivo pero un Excedente de Transferencias, la IA buscará pedidos específicos pagados en Efectivo y los cambiará a Transferencia (o viceversa) para dejar el descuadre en $0.
3. **Registro de Auditoría (Logs)**: 
   - Las modificaciones de la IA se registrarán en el campo de `observaciones` de la caja (ej. *"IA: Eliminados 7 Vasos de 12oz del pedido #V.R-C-045"*).
   - Los Arqueos Parciales guardarán automáticamente en `observaciones` el detalle de los insumos descuadrados (ej. *"INSUMOS DESCUADRADOS: Vasos de 12 onz (-7), Tapas Domicilios (+2)"*).

## Arquitectura y Componentes

### 1. Frontend (App Móvil)
- **Botón "Cuadrar con IA ✨"**: Visible solo para roles Admin en las pantallas de Cuadre/Análisis.
- **Flujo de Seguridad**: Al presionar, un Modal confirmará si el conteo físico ingresado en la tabla de insumos es definitivo y correcto.
- **Vista Previa (Preview)**: Un Modal mostrará la lista de acciones propuestas por la IA. El usuario debe confirmar antes de afectar la base de datos.
- **Mejora en Arqueo Parcial**: Se modificará el generador de texto del Arqueo Parcial para incluir la lista de insumos que tengan `DIF != 0`.

### 2. Backend (NestJS API)
Nuevos endpoints en el módulo de caja:
- **`POST /api/v1/caja/:id/auto-cuadre/preview`**:
  - Extrae todos los pedidos de la caja pagados en EFECTIVO y sin comentarios.
  - Extrae el estado actual de los insumos (DIF) y de los totales monetarios (Faltante/Excedente).
  - Configura el cliente de Google GenAI con `thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }`.
  - Envía un prompt matemático estructurado pidiendo el plan de resolución.
  - Retorna el JSON validado al frontend.
- **`POST /api/v1/caja/:id/auto-cuadre/execute`**:
  - Recibe el plan aprobado por el usuario.
  - Ejecuta las modificaciones (eliminar items de `OrdenVentas`, actualizar `Ventas.totalInput`, cambiar `Ventas.medioDePago`) usando una **Transacción Prisma (`$transaction`)**.
  - Etiqueta los pedidos modificados guardando `"Modificado con IA"` en un campo de notas/comentarios del pedido o mediante un registro interno.
  - Anexa el resumen de acciones al campo `observaciones` de la caja.

### 3. Integración Google GenAI
Se utilizará `@google/genai` (Gemini) en el backend.
- El prompt exigirá que el output sea **exclusivamente JSON** utilizando un formato estricto (schema) para evitar errores de parseo.
- Se le instruirá a la IA mantener los cambios al mínimo necesario y no tocar pedidos con notas especiales.

## Verificación de Seguridad (Spec Self-Review)
- [x] **No hay ambigüedades**: La IA solo propone, el usuario confirma. La base de datos se modifica en bloque (Transacción).
- [x] **Consistencia interna**: Se utilizan pedidos en efectivo sin comentarios precisamente para no alterar lógicas complejas de descuentos o notas.
- [x] **Alcance adecuado**: Se centra únicamente en el cuadre de caja actual.

## Plan de Pruebas
1. Simular un descuadre de -3 insumos. Ejecutar "Cuadrar con IA" y verificar que la Vista Previa sugiera descontar 3 unidades de pedidos válidos.
2. Confirmar los cambios y verificar que el DIF pase a 0 y que el total de Efectivo se reduzca proporcionalmente.
3. Guardar un Arqueo Parcial y verificar que en las observaciones quede el registro de los insumos descuadrados.
