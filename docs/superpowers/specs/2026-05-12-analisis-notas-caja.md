# Sistema de Análisis de Notas y Comentarios en Caja

## 1. Contexto y Origen de Datos (Opción A)
- **Base de Datos:** No se requieren migraciones. Las notas se extraerán de la columna JSON `comentarios` dentro de la tabla `Orderventas` (ítems del pedido), que a su vez está relacionada con la tabla `Ventas`.
- **Definición de "Nota":** Cualquier objeto dentro del array `comentarios` que tenga un nombre de comentario. Se procesarán tanto comentarios con precio ($0 o mayor).

## 2. Nueva Pestaña "Análisis" (Cierre de Caja)
- **Enfoque Híbrido (1 y 2):**
  - **Vista Principal (Ranking / Tendencias):** Un resumen estadístico rápido (Ej: "Sin Cebolla: 15 veces", "Papas Fritas: 8 veces").
  - **Vista Detallada (Agrupado por Venta):** Una lista expandible/filtrable.
    - Se mostrará: `ID Pedido`, `Hora de Venta`, `Total de la Venta`.
    - Al expandir, se listarán los productos específicos de ese pedido que contenían notas y el texto exacto de dichos comentarios.
    - Botón de acción para "Ver Detalles Completos de la Venta" (navegando a la vista de detalle de esa venta).

## 3. Actualización de Historial y Vistas de Detalle
- **Historial de Ventas y Pedidos Activos (`PedidosScreen.tsx` / `OrdersScreen`):** 
  - Se añadirá un indicador visual (ej. un icono de etiqueta/nota amarilla `🏷️`) junto al nombre del pedido en la lista si alguno de sus productos contiene comentarios.
- **Detalles Expansibles y Vistas de Detalle (`PedidosScreen.tsx` / `OrderDetailScreen`):**
  - Modificación de la UI en la vista de detalle de los pedidos (especialmente en `PedidosScreen.tsx` donde se gestiona la preparación) para que debajo de cada producto se renderice de forma prominente la lista de comentarios asociados. Su jerarquía visual se mejorará para destacar como "Notas de preparación" para el equipo o cajero.

## 4. Modificación del Reporte PDF (Backend)
- **Servicio de Caja (`caja.service.ts`):** 
  - Al generar el PDF del cierre de caja (`generarPDFCierre`), se inyectará una nueva sección titulada **"Análisis de Notas y Modificadores"**.
  - Esta sección incluirá una tabla cronológica plana que muestre: `Hora`, `N° Pedido`, `Producto`, `Comentario(s)`, facilitando la lectura para el administrador.

## 5. Validaciones y Rendimiento
- **Optimizaciones Frontend:** Uso de `useMemo` para agrupar y calcular el ranking de notas localmente en el frontend a partir de la lista de ventas ya obtenida en el cierre de caja, evitando consultas pesadas adicionales a la base de datos.
- **Inmutabilidad:** Garantizar que al editar estados de ventas (Pendiente -> Completado) los arrays de JSON en Prisma no se sobrescriban con `null`.