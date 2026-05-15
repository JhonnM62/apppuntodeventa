# Análisis Financiero y Corrección de Fecha - Caja

## Problema Identificado
1. **Fecha Desfasada:** Al abrir una caja el 05/05/2026, la fecha se mostraba y guardaba como 06/05/2026.
2. **Cálculo Erróneo:** Las ventas en efectivo mostraban 75.200, omitiendo ventas (como el pedido 008 con descuento del 15%).

## Análisis
- **Causa Raíz del Desfase de Fecha:** La base de datos almacena las fechas en UTC. Para Colombia (UTC-5), el 05/05/2026 a las 8:00 PM se guarda como `2026-05-06T01:00:00.000Z`. El frontend extraía la fecha usando `.substring(0, 10)`, lo cual tomaba el "06" de la cadena UTC en lugar de convertirla a la zona horaria local primero.
- **Causa Raíz del Error Matemático:** Al guardarse la caja con la fecha desfasada (06 en lugar de 05), el backend ajustaba la ventana de tiempo del análisis financiero para que comenzara el día 06. Esto excluía automáticamente todas las ventas reales realizadas el día 05, resultando en un total incompleto y erróneo. El descuento del 15% del pedido 008 se estaba aplicando correctamente en el `totalInput`, pero el pedido entero no se sumaba porque quedó fuera de la ventana de fecha.

## Solución Implementada
- Se creó una función `formatDateToLocalYYYYMMDD` en el frontend (`CajaFormScreen.tsx` y `CajaListScreen.tsx`) que convierte el string ISO UTC a un objeto `Date` local antes de extraer el año, mes y día.
- Esto garantiza que sin importar la hora UTC, la fecha visualizada y guardada corresponderá al día exacto en la zona horaria del usuario.
- Al guardar la caja con la fecha correcta (05), el backend buscará las ventas desde las 00:00:00 locales del día 05 hasta el cierre, abarcando correctamente el pedido 008 y sumando los totales correctos.

## Verificación
El cálculo de `totalInput` y los descuentos redondeados se mantienen estables, el problema era exclusivamente la ventana de tiempo.