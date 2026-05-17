# Actualizacion Masiva de Precios y Stock de Insumos

## 1. Resumen y Objetivo

Permitir la actualizacion de precios unitarios (`precioActual`) y cantidades disponibles (`cantidad`) de insumos directamente desde el modulo de Inventario, con un enfoque hibrido:

- **Vista de Entrada (InventarioScreen)**: Edicion inline rapida dentro de la tarjeta para flujo eficiente.
- **Vista detalle del Insumo (InsumoDetailScreen)**: Modal dedicado con confirmacion para cambios precisos.
- **Campos afectados**: `precioActual` (Decimal, valor unitario) y `cantidad` (Int, stock fisico).
- **Calculo automatico**: El subtotal se recalcula como `precioActual * cantidad` en tiempo real.
- **Permisos**: Cualquier usuario con acceso a crear/editar entradas de inventario puede realizar actualizaciones.

## 2. Ubicaciones de Implementacion

### 2.1. InventarioScreen.tsx (Vista de Entrada)
- Tarjeta de insumo en la lista de ordenes
- Modo de edicion inline
- Sin modal adicional

### 2.2. InsumoDetailScreen.tsx (Vista detalle del insumo)
- Modal de edicion dedicado
- Confirmacion antes de guardar

## 3. Diseño Detallado

### 3.1. InventarioScreen — Edicion Inline

#### Estructura de la Tarjeta (Modo Normal)
```
┌─────────────────────────────────────────────────────────────┐
│ [checkbox] [IMG]  Nombre del Insumo              [precio] │
│               Stock Inicial: 20 (verde)                    │
│               Pidiendo: 20 und • Stock Proyectado: 25      │
│               Ant: $1000  Sub ant: $20000                  │
│               Act: $1200  Sub act: $24000                  │
└─────────────────────────────────────────────────────────────┘
```

#### Estructura de la Tarjeta (Modo Inline Edit)
```
┌─────────────────────────────────────────────────────────────┐
│ [checkbox] [IMG]  Nombre del Insumo                       │
│   Precio: [$ 1200 ]  Cantidad: [ 20 ]  Sub: $ 24000    │
│   [Guardar] [Cancelar]                                   │
└─────────────────────────────────────────────────────────────┘
```

#### Logica de Calculo
- `subtotal = precioActualInput * cantidadInput`
- El subtotal se muestra en tiempo real mientras el usuario escribe
- Si el usuario no cambia nada, los valores se mantienen iguales

#### Campos Involucrados (Schema)
- `precioActual` -> `Decimal @map("Precio Actual")` en la tabla INSUMOS
- `cantidad` -> `Int @map("Cantidad")` en la tabla INSUMOS (stock fisico/disponible)
- En la vista se operan con: `precioActual` y `disponible` (nomenclatura del frontend)

#### Campos del Formulario de Edicion
1. **Precio Unitario Actual**: Input numerico con formato de moneda COP
2. **Cantidad (Stock Fisico)**: Input numerico entero
3. **Subtotal Proyectado**: Solo lectura, se calcula automaticamente

#### Desencadenantes del Modo Inline
- Usuario toca boton de lapiz/editar en la tarjeta
- Opcional: doble tap en la fila activa el modo inline

### 3.2. InsumoDetailScreen — Modal de Edicion

#### Diseño del Modal
```
┌─────────────────────────────────────────────────────────────┐
│              ✏️ Actualizar Insumo                         │
│  ──────────────────────────────────────────────────────   │
│  Nombre: Gaseosa Coca Cola 2L                            │
│  Categoria: Bebidas                                       │
│  Stock Actual: 20                                        │
│                                                           │
│  Precio Unitario Actual ($)                               │
│  [$ 1.200              ] ← input grande, formato COP      │
│                                                           │
│  Cantidad en Stock (und)                                  │
│  [ 20                  ] ← input grande                  │
│                                                           │
│  Subtotal proyectado: $ 24.000 ← solo lectura            │
│                                                           │
│  [Cancelar]                    [Confirmar Actualizacion] │
└─────────────────────────────────────────────────────────────┘
```

#### Campos del Modal
1. **Precio Unitario Actual**: Muestra el valor actual, input editable con formato COP
2. **Cantidad (Stock Fisico)**: Muestra el valor actual, input editable
3. **Subtotal Proyectado**: Calculado automatico `precio * cantidad`, solo lectura
4. **Nombre del Insumo**: Solo lectura (referencia)
5. **Categoria**: Solo lectura (referencia)
6. **Stock Actual**: Solo lectura (referencia)

## 4. Flujo de Datos

### 4.1. InventarioScreen (Inline)
```
Usuario toca boton editar
    → Se muestran inputs en la tarjeta
    → Usuario modifica precio/cantidad
    → Subtotal se recalcula en tiempo real
    → Usuario toca "Guardar"
        → POST /api/v1/insumos/:id (PATCH)
            body: { precioActual, cantidad }
        → Backend actualiza INSUMOS
        → WebSocket refreshInsumos
        → Se actualiza la tarjeta con nuevos valores
        → Se sale del modo inline
    → Usuario toca "Cancelar"
        → Se restauran valores originales
        → Se sale del modo inline
```

### 4.2. InsumoDetailScreen (Modal)
```
Usuario abre detalle del insumo
    → Ve informacion actual del insumo
    → Toca boton "Actualizar Precio/Stock"
        → Se abre modal
        → Muestra valores actuales en inputs
        → Usuario modifica
        → Subtotal se recalcula en tiempo real
        → Usuario toca "Confirmar"
            → POST /api/v1/insumos/:id (PATCH)
                body: { precioActual, cantidad }
            → Backend actualiza INSUMOS
            → Se cierra modal
            → Se recarga datos del insumo en pantalla
            → Toast: "Insumo actualizado correctamente"
        → Usuario toca "Cancelar"
            → Se cierra modal sin cambios
```

## 5. Backend

### 5.1. Endpoint Utilizado
- `PATCH /api/v1/insumos/:id` existente
- Body: `{ precioActual?: number, cantidad?: number }`
- Se reutiliza el endpoint de actualizacion existente
- Se validan los campos con class-validator

### 5.2. Campos a Enviar
```typescript
interface UpdateInsumoPreciosDto {
  precioActual?: number;  // Decimal -> number en API
  cantidad?: number;      // Stock fisico/disponible
}
```

### 5.3. Logica Adicional
- Cuando se actualiza `cantidad`, no se debe confundir con movimientos de stock (entradas/salidas)
- Este es un ajuste directo del stock fisico por conteo o actualizacion de precio
- Los movimientos de inventario (entradas/salidas) siguen usando su logica separada

## 6. Permisos y Seguridad

- Verificar que el usuario tenga `canEdit` para el recurso `insumos`
- Validacion en backend con guards existentes
- Log de cambios para auditoria (futuro)

## 7. Manejo de Errores

- Si el servidor responde 400: mostrar mensaje de error en el input correspondiente
- Si la red falla: Toast de error con mensaje amigable
- Validacion de numeros negativos (no permitir valores < 0)
- Validacion de precio = 0 (permitir? o bloquear? — se permite por ahora)

## 8. Estados de la UI

### 8.1. InventarioScreen — Tarjeta de Insumo

| Estado | Descripcion |
|--------|-------------|
| Normal | Ver solo, precios y stock mostrados |
| Inline Edit | Inputs visibles, botones Guardar/Cancelar |
| Guardando | Inputs deshabilitados, indicador de carga |
| Error | Inputs con borde rojo, mensaje de error |

### 8.2. InsumoDetailScreen — Modal

| Estado | Descripcion |
|--------|-------------|
| Cerrado | Modal no visible |
| Abriendo | Inputs con valores actuales cargados |
| Editando | Usuario modifica valores, subtotal en tiempo real |
| Guardando | Boton deshabilitado, indicador de carga |
| Error | Mensaje de error dentro del modal |

## 9. Archivos a Modificar

### Frontend
- `src/screens/inventario/InventarioScreen.tsx`
  - Agregar modo inline en tarjetas de ordenes
  - Inputs para precio/cantidad
  - Calculo de subtotal en tiempo real
  - Botones Guardar/Cancelar inline

- `src/screens/inventario/InsumoDetailScreen.tsx`
  - Agregar modal de edicion
  - Campos de precio/cantidad
  - Calculo de subtotal en tiempo real

- `src/services/insumos.ts`
  - Endpoint `update` ya existe, reutilizar

### Backend
- `src/insumos/insumos.service.ts`
  - Verificar que el metodo `update` maneje `precioActual` y `cantidad`

- `src/insumos/dto/insumo.dto.ts`
  - Verificar que `UpdateInsumoDto` acepte `precioActual` y `cantidad`

## 10. Criterios de Aceptacion

1. ✅ En InventarioScreen: usuario puede editar precio/cantidad inline en la tarjeta
2. ✅ Subtotal se calcula automaticamente al escribir
3. ✅ Al guardar, se actualiza el insumo en la base de datos
4. ✅ La tarjeta refleja los nuevos valores despues de guardar
5. ✅ En InsumoDetailScreen: modal permite editar precio/cantidad con confirmacion
6. ✅ Campos nuevos se recalculan en tiempo real
7. ✅ Permisos `canEdit` se verifican antes de mostrar opciones de edicion
8. ✅ Mensajes de error claros al usuario
9. ✅ Validacion de valores negativos y cero
10. ✅ Sin scroll automatico molesto (keyboardShouldPersistTaps)

## 11. Fuera del Alcance (v1)

- Historial de cambios de precio/cantidad
- Notificaciones cuando cambia un precio
- Exportacion de lista de precios actualizada
- Edicion masiva de multiples insumos a la vez (bulk update)
- Comparacion de precios antiguos vs nuevos
