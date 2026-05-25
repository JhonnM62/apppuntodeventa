# Gastos: Filtros Funcionales + Carga Masiva por IA (Tickets)

**Fecha:** 2026-05-25  
**Estado:** Aprobado por usuario — listo para implementación  
**Módulo:** `gastos` (Frontend + Backend)

---

## Contexto y Problema

El módulo de Gastos tiene dos carencias concretas detectadas:

1. **El botón de filtro (ícono `options-outline`) en la barra de búsqueda no hace nada.** Está conectado a `onPress={() => {}}`. El usuario necesita filtrar por rango de fechas y medio de pago, campos que ya existen en el backend (`GastosQueryDto`) pero nunca se exponen en la UI.

2. **No existe una forma de cargar múltiples gastos de una sola vez.** El flujo actual obliga a crear cada gasto de forma individual. El usuario quiere tomar una foto (o seleccionar varias fotos) de tickets físicos y que la IA los analice en lote, creando un registro de gasto por cada ticket detectado automáticamente.

---

## Análisis del Estado Actual

### Frontend (`GastosScreen.tsx`)
- Los tabs `TODOS / NEGOCIO / PERSONAL` ya filtran localmente. OK
- La búsqueda de texto ya funciona localmente. OK
- El botón `options-outline` (línea 153) tiene `onPress={() => {}}` — VACÍO.
- `filterTipo`, `searchQuery` existen como estado pero no hay `fechaDesde`, `fechaHasta`, ni `medioDePago` en el estado.
- El store (`useGastosStore`) llama a `fetchGastos()` sin parámetros de query.

### Backend (`gastos.service.ts` / `GastosQueryDto`)
- `findAll()` ya acepta `fechaDesde`, `fechaHasta`, `medioDePago`, `tipo` como filtros. OK
- `extractDataFromImage()` en `ai.service.ts` ya soporta el contexto `gastos` y devuelve `{concepto, valor, tipo, medioDePago}`. OK
- No existe un endpoint de creación masiva (`bulk`). FALTA

---

## Feature 1: Filtros Funcionales

### Qué se construye

Un **bottom sheet de filtros** que se abre al tocar el ícono `options-outline`. Contiene:
- **Rango de fechas:** "Desde" y "Hasta" (pickers de fecha simples tipo texto `DD/MM/YYYY`).
- **Medio de Pago:** Chips para `Todos`, `Efectivo`, `Transferencia`, `Nequi`, `Bancolombia`.
- **Botón "Aplicar"** que cierra el sheet y recarga los gastos con los filtros.
- **Botón "Limpiar"** que resetea todo.
- Un punto rojo sobre el ícono del botón cuando hay filtros activos.

### Cambios Frontend

#### GastosScreen.tsx [MODIFY]
- Agregar estado: `filterFechaDesde`, `filterFechaHasta`, `filterMedioDePago`.
- Agregar estado: `showFilterSheet` (boolean).
- Conectar `onPress` del botón `options-outline` a `setShowFilterSheet(true)`.
- Mostrar punto rojo sobre el ícono si hay algún filtro activo.
- Implementar el `FilterBottomSheet` como Modal con las opciones descritas.
- Al aplicar filtros, pasar los valores al store: `fetchGastos({ fechaDesde, fechaHasta, medioDePago })`.

#### store/useGastosStore.ts [MODIFY]
- Modificar `fetchGastos` para aceptar parámetros opcionales de query.
- Pasar esos parámetros al `gastosService.getAll(query)`.

#### services/gastos.ts [MODIFY]
- Verificar que `getAll()` pase los query params correctamente a la API.

### Cambios Backend
**NINGUNO.** El backend ya soporta todos los filtros necesarios.

---

## Feature 2: Carga Masiva por IA (Tickets)

### Descripción del flujo

```
[Usuario toca botón "Carga masiva" en header]
    → Abre selector de imágenes (múltiples a la vez, galería o cámara)
    → Se muestran miniaturas de cada imagen seleccionada
    → El usuario toca "Analizar con IA"
    → Para cada imagen: se sube al backend → IA extrae {concepto, valor, tipo, medioDePago}
    → Se muestra lista editable de gastos detectados (uno por ticket)
    → El usuario revisa/edita si necesita
    → Toca "Guardar todos" → se crean N gastos en paralelo
    → Notificación de éxito: "X gastos creados por $Y total"
```

### Nuevo componente Frontend: GastosBulkModal.tsx [NEW]

Estado interno por ticket:
```typescript
type TicketItem = {
  uri: string;           // URI local de la imagen
  status: 'pending' | 'analyzing' | 'done' | 'error';
  error?: string;
  // Campos extraídos (editables por el usuario):
  concepto: string;
  valor: string;
  tipo: 'NEGOCIO' | 'PERSONAL';
  medioDePago: string;
  fotoUrl?: string;      // URL remota tras upload
};
```

UI por pasos:
- **Paso 1 (Selección):** Botones "Cámara" y "Galería (múltiple)". Máximo 10 imágenes.
- **Paso 2 (Revisión):** Lista scrollable de TicketCard por cada imagen. Cada card muestra:
  - Miniatura de la imagen (tocable para ver completa)
  - Spinner mientras analiza / checkmark cuando listo / error si falla
  - Campos editables: Concepto, Valor, Tipo (toggle), Medio de Pago
  - Botón de eliminar ese ticket de la lista
- **Barra inferior:** Total acumulado + botón "Guardar N gastos"
- Procesamiento en paralelo (Promise.all) para máxima velocidad.

### Nuevo endpoint Backend: POST /gastos/bulk [NEW]

```typescript
// Body:
{ gastos: CreateGastoDto[] }

// Response:
{ created: number; failed: number; gastos: Gasto[] }
```

Lógica:
- Usa `prisma.$transaction` para atomicidad.
- Emite `REFRESH_GASTOS` una sola vez al final.
- Envía una sola notificación push resumen: "X gastos creados por $Y total".

### Cambios Backend

#### gastos.controller.ts [MODIFY]
- Agregar endpoint `POST /gastos/bulk` con guard JWT.
- Acepta `{ gastos: CreateGastoDto[] }`.
- Llama a `gastosService.createBulk(dtos)`.

#### gastos.service.ts [MODIFY]
- Agregar método `createBulk(dtos: CreateGastoDto[])`.
- Usa `prisma.$transaction` para atomicidad.
- Notificación y WebSocket emit únicos al final.

#### gastos/dto/gasto.dto.ts [MODIFY]
- Agregar `CreateBulkGastoDto`:
```typescript
export class CreateBulkGastoDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGastoDto)
  gastos: CreateGastoDto[];
}
```

### Cambios Frontend

#### screens/gastos/GastosBulkModal.tsx [NEW]
- Componente modal completo con el flujo de 2 pasos descrito arriba.

#### GastosScreen.tsx [MODIFY]
- Agregar botón "Carga Masiva" (ícono `layers-outline`) junto al botón `+`.
- Solo visible si `canCreate === true`.
- Controla `showBulkModal` state.

#### services/gastos.ts [MODIFY]
- Agregar función `createBulkGastos(gastos: Partial<Gasto>[])`.

#### store/useGastosStore.ts [MODIFY]
- Agregar acción `addBulkGastos(gastos)` que llama al servicio y recarga.

---

## Principios UX

1. **Sin interrupciones:** El análisis de IA corre en segundo plano sin bloquear la navegación.
2. **Siempre editable:** El empleado corrige lo que la IA detectó antes de persistir.
3. **Feedback por ticket:** Estado de progreso individual visible por cada ticket (colores + íconos).
4. **Resistente a fallos:** Si la IA falla en 1 de 5 tickets, los 4 restantes se guardan igual. El usuario ve exactamente cuál falló y por qué.

---

## Plan de Verificación

### Backend
```bash
npx tsc --noEmit
# Test endpoint:
POST /api/v1/gastos/bulk
Authorization: Bearer <token>
Body: { "gastos": [{ "concepto": "Test", "valor": 10000, "tipo": "NEGOCIO", "medioDePago": "Efectivo" }] }
```

### Frontend
```bash
npx tsc --noEmit
```

### Manual
1. Abrir Gastos → tocar filtros → bottom sheet se abre.
2. Aplicar filtro por fecha → lista se actualiza desde API.
3. Carga masiva con 2 fotos → IA extrae → lista editable → guardar → 2 gastos en BD.
