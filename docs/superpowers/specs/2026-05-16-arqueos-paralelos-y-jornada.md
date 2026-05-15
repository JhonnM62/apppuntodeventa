# Especificación Técnica: Jornada Comercial y Arqueos Congelados (Snapshots)

**Fecha:** 2026-05-16
**Objetivo:** Resolver el problema de los turnos nocturnos (ventas de madrugada que pertenecen al día contable anterior) y permitir arqueos de caja en paralelo (contar insumos/dinero sin detener las ventas) mediante congelamiento temporal (snapshots).

---

## 1. Fase 1: Turnos Nocturnos y "Jornada Comercial"

### Problema
Las ventas realizadas después de medianoche (ej. 2:00 a.m.) se agrupan en el día calendario siguiente y reinician el consecutivo del ticket (`V.R-C-XXX`), confundiendo los arqueos del turno de la noche.

### Solución Lógica
Separar el "Día Calendario" del "Día Contable (Jornada)". 
- La columna `FECHA` (Date) en la tabla `VENTAS` regirá la agrupación y el consecutivo.
- La columna `Fecha y hora` (Timestamp) mantendrá la hora real para el historial.

### Implementación (Backend - `ventas.service.ts`):
1. **Definir Hora de Corte:** Por defecto, estableceremos una hora de corte (ej. `05:00 AM`).
2. **Lógica de Asignación en `createVenta`:**
   Al crear una venta, el servidor evaluará la hora actual:
   - Si la hora actual es **antes de las 05:00 AM** (ej. 2:00 AM del Domingo):
     - `Fecha y hora` = `Domingo 02:00 AM`
     - `FECHA` = `Sábado` (Día anterior).
   - Si la hora actual es **después de las 05:00 AM**:
     - `Fecha y hora` = `Domingo 08:00 AM`
     - `FECHA` = `Domingo` (Día actual).
3. **Consecutivos:** Como la consulta del último ticket (`V.R-C-XXX`) se hace filtrando por la columna `FECHA`, el ticket de las 2:00 AM seguirá el consecutivo del sábado sin reiniciarse.

---

## 2. Fase 2: Arqueos Congelados (Snapshots)

### Problema
Los empleados hacen "Arqueos Parciales" durante horas pico. Mientras el Empleado A cuenta insumos y dinero en la pantalla de Cuadre, el Empleado B sigue registrando ventas. Esto causa que el "Gasto del Sistema" y el "Total Esperado" cambien dinámicamente frente a los ojos del Empleado A, arruinando su cuadre.

### Solución Lógica
Implementar un botón de "Congelar Arqueo" (Tomar un Snapshot) al entrar a la pestaña de Cuadre. Esto fija una hora exacta (con milisegundos) y el backend solo retorna las ventas ocurridas hasta ese milisegundo exacto.

### Resolución al problema de los Segundos/Milisegundos:
Para evitar problemas donde una venta ocurra en el mismo segundo exacto del congelamiento, **el frontend enviará el Timestamp completo en formato ISO (con milisegundos)**. 
Ejemplo: `2026-05-16T20:15:30.450Z`. 
El backend usará Prisma para filtrar ventas donde `Fecha y hora` sea **menor o igual (`lte`)** a ese timestamp ISO. Es matemáticamente imposible que se filtre una venta errónea bajo esta precisión.

### Implementación:

#### Frontend (`CajaFormScreen.tsx`):
1. **Estado de Congelamiento:**
   Crear un estado `horaCongelada` (string ISO o null).
2. **Alerta de Intercepción (Tab Cuadre):**
   Al intentar cambiar a la pestaña `cuadre`, si `horaCongelada` es nulo, mostrar un Modal/Alert:
   *"¿Deseas congelar las ventas hasta este momento para realizar el arqueo? Las ventas nuevas no afectarán tus totales mientras cuentas."*
   - Si acepta: `setHoraCongelada(new Date().toISOString())`.
   - Si cancela: Entra en modo "Tiempo Real" (comportamiento actual).
3. **Banner Persistente:**
   Si `horaCongelada` tiene valor, mostrar un Banner azul fijo en las pestañas `cuadre` y `analysis`:
   *"❄️ Arqueo congelado a las HH:MM:SS. Ventas nuevas ignoradas."*
   Incluir un botón para "Actualizar al momento actual" (Descongelar o tomar nuevo snapshot).
4. **Modificación de la Petición:**
   Actualizar la llamada a `getResumenCaja(cajaId, horaCongelada)` para que acepte este parámetro opcional.

#### Backend (`caja.service.ts` -> `getResumenCaja`):
1. **Recibir Parámetro:** Aceptar `horaCorteSnapshot` (ISO string).
2. **Modificar el Filtro de Fecha (`fechaFin`):**
   ```typescript
   let fechaFin = new Date();
   if (horaCorteSnapshot) {
     fechaFin = new Date(horaCorteSnapshot); // Precisión de milisegundos
   } else if (caja.fechaDeCierre && caja.horaDeCierre) {
     // Lógica actual de cierre definitivo
   }
   ```
3. **Calcular Rango de Pedidos:**
   Después de filtrar las `validVentas`, extraer el primer y último ID de pedido:
   ```typescript
   const primerPedido = validVentas.length > 0 ? validVentas[validVentas.length - 1].pedido : 'N/A';
   const ultimoPedido = validVentas.length > 0 ? validVentas[0].pedido : 'N/A';
   const rangoPedidos = { primerPedido, ultimoPedido, totalVentas: validVentas.length };
   ```
   *Nota: Se asume que `validVentas` viene ordenado por fecha desc.*
4. Devolver `rangoPedidos` en la respuesta JSON.

---

## 3. Fase 3: Auto-Inyección en Observaciones y Cierre Final

### Problema
Los empleados deben escribir manualmente hasta qué pedido hicieron el arqueo para dejar constancia.

### Implementación (Frontend - `CajaFormScreen.tsx`):
1. **Visualizar Rango:**
   Mostrar en la UI del Banner el rango retornado por el backend: 
   *"Incluye desde el Pedido #001 hasta el #120"*.
2. **Botón Confirmar Arqueo:**
   Al hacer clic en "Confirmar Arqueo", inyectar automáticamente esta información en el campo `observaciones` junto con los montos contados:
   ```text
   --- ARQUEO PARCIAL (Corte: 08:15:30 PM) ---
   Rango: Pedido #001 al #120 (120 ventas procesadas)
   EFECTIVO FÍSICO: $ 500,000 (Dif: $ 0)
   TRANSFERENCIAS: $ 200,000 (Dif: $ 0)
   ESTADO: CUADRADA
   ----------------------
   ```
3. **Cierre Definitivo:**
   Si la caja se va a **cerrar definitivamente**, asegurar que la `Hora de Cierre` guardada en la base de datos coincida exactamente con la `horaCongelada` del último snapshot, garantizando que el PDF final cuadre a la perfección con lo que el empleado contó.


- Nueva Tabla de Configuración (Backend):
- Crearemos un nuevo modelo en schema.prisma llamado ConfiguracionNegocio .
- Tendrá un campo clave: horaCorteDia (por defecto 00:00 , pero configurable a 04:00 o 05:00 ).
- Lógica de Inclusión (Backend):
- En caja.service.ts , al ejecutar getResumenCaja() , el sistema leerá la horaCorteDia .
- Si la caja se abrió el Sábado y la hora de corte son las 4:00 a.m., el sistema buscará ventas desde la hora de apertura del Sábado hasta el Domingo a las 3:59 a.m.
- Módulo de Configuraciones (Frontend - Futuro):
- Se creará una pantalla de "Ajustes del Sistema" exclusiva para administradores donde podrán definir esta horaCorteDia y otras reglas de negocio.