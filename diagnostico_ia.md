# Reporte de Diagnóstico y Contexto para IA de Desarrollo

Hola, compañero(a) IA. Se te entrega este reporte porque tienes el contexto completo del código fuente (React Native / Backend) de la aplicación de ventas y necesitamos que soluciones un bug crítico de sincronización de base de datos que está causando descuadres de caja.

## 🐛 El Problema Identificado

Durante una auditoría de la base de datos PostgreSQL (`Dbreactnative`), se descubrió que los reportes de cierre de caja (o totales del día) presentaban un "sobrante" físico de efectivo en comparación con lo que el sistema esperaba. 

Concretamente, para el día **12 de junio de 2026**, había un sobrante de **$54,000 COP** repartido en 3 ventas exactas ($30,000, $16,000 y $8,000).

El análisis de la base de datos reveló que **los ítems de los pedidos se están quedando en estado `TOMADO` en la tabla `ORDERVENTAS`, a pesar de que la venta principal en la tabla `VENTAS` ya pasó a estado `PAGADO`.**

> [!WARNING]
> Esto no es un caso aislado. Al ejecutar el script de corrección en la base de datos, se actualizaron **35,196 filas** históricas en `ORDERVENTAS` que presentaban este mismo desfase (Venta `PAGADO` pero Ítems `TOMADO`).

## 🔍 Detalles Técnicos del Bug

* **Comportamiento Esperado:** Cuando una venta (`VENTAS`) se cierra/paga, tanto el campo `Estado` en `VENTAS` como el campo `Estado` en todos los registros hijos correspondientes en `ORDERVENTAS` (unidos por `IDventas`) deben pasar a `PAGADO`.
* **Comportamiento Actual:** La tabla `VENTAS` se actualiza correctamente a `PAGADO` (y se registra el `TOTAL INPUT`), pero los ítems hijos en `ORDERVENTAS` permanecen en `TOMADO`.
* **Impacto:** Si la lógica de reporte o cuadre de caja de la nueva aplicación calcula los ingresos sumando los ítems de `ORDERVENTAS` donde `Estado = 'PAGADO'`, entonces ignora por completo el dinero de estas ventas desincronizadas, causando un falso faltante en el sistema (lo que se traduce en un sobrante físico en caja).

## 🛠️ Lo que ya se hizo
Se ejecutó un script directo en PostgreSQL (`UPDATE public."ORDERVENTAS" SET "Estado" = 'PAGADO' FROM public."VENTAS" ...`) que niveló la base de datos y corrigió las 35,196 filas afectadas, incluyendo los $54,000 COP del 12 de junio. **La base de datos actual está cuadrada.**

## 🎯 Tu Tarea (Instrucciones para la IA desarrolladora)

Necesitamos que revises el código fuente de la aplicación (Front-end React Native / Backend / ORM / APIs) y apliques una solución definitiva:

1. **Rastrea el flujo de pago:** Busca la función o endpoint que se ejecuta al momento de cobrar/pagar una venta. (Busca palabras clave como `PAGADO`, actualizaciones a la tabla `VENTAS`).
2. **Revisa la persistencia:** Verifica por qué la actualización en cascada no está ocurriendo.
   - ¿Se está actualizando solo la entidad padre (`VENTAS`) y se omite el `UPDATE` a `ORDERVENTAS`?
   - Si se usan promesas (`Promise.all`), ¿hay un error silencioso (`try/catch` que ignora el fallo) al actualizar los hijos?
   - ¿Se cierra el componente en React Native o se corta la conexión antes de que termine de actualizar los ítems?
3. **Propón la solución:** 
   - **Opción A (Recomendada si usas ORM o Backend robusto):** Asegúrate de que el cierre de venta se ejecute dentro de una **Transacción de Base de Datos** (`BEGIN ... COMMIT`). O todo se actualiza a `PAGADO` (padre e hijos) o nada lo hace.
   - **Opción B (Base de Datos):** Recomendar la creación de un `TRIGGER` en PostgreSQL que automáticamente pase los hijos a `PAGADO` cuando el padre pase a `PAGADO`.
4. **Verifica la lógica de reporte:** Revisa cómo se está construyendo el reporte de cierre de caja en el código actual. Si el reporte suma desde `ORDERVENTAS` basándose en el estado, corrobora que la solución implementada garantice la consistencia total.

Por favor, revisa el directorio de código que tienes en tu contexto y proporciona al usuario los archivos a modificar o los comandos SQL/Prisma/TypeORM necesarios para blindar este proceso.
