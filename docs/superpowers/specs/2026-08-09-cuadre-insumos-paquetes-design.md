# 2026-08-09: Diseño — Sistema de Cuadre de Insumos con Paquetes y Trazabilidad

## Problema

Existen dos tablas que rastrean el mismo stock de forma independiente:
- `Insumos` → Stock global (lo que más monitorea el admin)
- `AperturaCierreInsumos` → Control diario de la caja

Los cambios en una tabla **no se reflejan en la otra**, generando discrepancias permanentes:

1. **Paquetes inexactos**: Se compran 3 paquetes de tocineta teórico 34 = 102, pero al abrir uno salen 32. El stock global queda en 102 y el de apertura en 32 — ambos incorrectos respecto a la realidad.
2. **Descuentos manuales no sincronizados**: Un empleado descuenta 4 porciones de pollo en AperturaCierreInsumos para producción, pero `Insumos.cantidad` no baja.
3. **Precios afectados**: Si la cantidad real difiere del teórico, el precio por porción calculado es incorrecto.

## Solución: Opción A+C — Paquetes + Movimientos Atómicos con Trazabilidad

### Principio General

`Insumos.cantidad` es la **única fuente de verdad**. Cualquier evento que cambie el stock (compra, apertura de paquete, descuento de producción, venta) genera un `MovimientosInsumos` que actualiza atómicamente `Insumos.cantidad`.

---

## Cambios de Datos (Backend — Prisma)

### 1. Nuevos campos en modelo `Insumos`

```prisma
cantidadPorPaquete        Int?      @map("Cantidad por paquete")
paquetesEnBodega          Int?      @map("Paquetes en bodega")
ajusteRequiereAprobacion  Boolean   @default(false) @map("Ajuste requiere aprobacion")
ultimoAjustePendiente     Json?     @map("Ultimo ajuste pendiente")
```

- `cantidadPorPaquete`: Unidades teóricas por paquete (ej: 34 lonchas).
- `paquetesEnBodega`: Paquetes sellados sin abrir en bodega.
- `ajusteRequiereAprobacion`: Si `true`, el ajuste generado al abrir un paquete queda pendiente hasta aprobación del admin.
- `ultimoAjustePendiente`: JSON con los datos del ajuste que espera aprobación.

> **Nota**: La columna `unidades` que ya existe en `Insumos` se reutiliza como la unidad de medida para mostrar en los modales (ej: "lonchas", "porciones").

### 2. Nueva tabla `MovimientosInsumos`

| Campo | Tipo | Descripción |
|---|---|---|
| `IDmovimiento` | `String` (cuid) | ID único |
| `IDinsumo` | `String` | FK a Insumos |
| `tipo` | `String` | `"compra"` / `"apertura_paquete"` / `"descuento_produccion"` / `"ajuste_aprobado"` / `"ajuste_manual"` |
| `cantidadDelta` | `Int` | Positivo = entrada, Negativo = salida |
| `cantidadAntes` | `Int` | Stock antes del movimiento |
| `cantidadDespues` | `Int` | Stock después del movimiento |
| `usuario` | `String` | Quién generó el movimiento |
| `cajaId` | `String?` | FK opcional a AperturaCierreCaja |
| `insumoCajaId` | `String?` | FK opcional a AperturaCierreInsumos |
| `observacion` | `String?` | Nota libre |
| `fechaYHora` | `DateTime` | Timestamp automático |

---

## Lógica de Negocio (Backend — Services)

### Flujo 1: Compra / Entrada de Inventario
1. `Insumos.cantidad += (cantidadPorPaquete × paquetesComprados)`
2. `Insumos.paquetesEnBodega += paquetesComprados`
3. Generar `MovimientosInsumos` tipo `"compra"`

### Flujo 2: Apertura de Paquete (modal "+" enriquecido)
1. El empleado ingresa la cantidad **real** del paquete abierto.
2. Si `ajusteRequiereAprobacion = false`:
   - `paquetesEnBodega -= 1`
   - `Insumos.cantidad = (paquetesRestantes × cantidadPorPaquete) + cantReal`
   - Generar `MovimientosInsumos` tipo `"apertura_paquete"`
3. Si `ajusteRequiereAprobacion = true`:
   - Guardar en `ultimoAjustePendiente` (JSON)
   - No modificar `cantidad` hasta aprobación del admin

### Flujo 3: Descuento por Producción (botón "−")
1. `Insumos.cantidad -= delta` (inmediato)
2. Generar `MovimientosInsumos` tipo `"descuento_produccion"`
3. Registrar en `HistorialCajaInsumos` (ya existente)

### Flujo 4: Aprobación de Ajustes (solo Admin)
- `[Aprobar]` → Aplica recálculo de stock, genera `MovimientosInsumos` tipo `"ajuste_aprobado"`, limpia `ultimoAjustePendiente`
- `[Rechazar]` → Limpia `ultimoAjustePendiente` sin cambiar stock, genera `MovimientosInsumos` tipo `"ajuste_rechazado"` para auditoría

---

## Interfaz de Usuario (Frontend — React Native)

### 1. Modal "+" enriquecido (AperturaCierreInsumos)

**Si `paquetesEnBodega = 0` o no aplica paquete:** Modal igual que hoy. Sin cambios.

**Si `paquetesEnBodega > 0`:** El modal presenta dos opciones:
- **🎯 Abrir paquete** → Campo para cantidad real + diferencia vs teórico en tiempo real.
- **➕ Añadir cantidad libre** → Campo libre como hoy.

### 2. Pantalla Insumos — Badge de Ajustes Pendientes (Admin only)

Badge rojo sobre el ícono de Insumos si hay ajustes pendientes. Sección colapsable al tope de la lista:

```
⚠️ Ajustes pendientes de aprobación
🥓 Tocineta — Juan — Reportó: 32 / Teórico: 34 — Dif: -2
            [APROBAR ✓]  [RECHAZAR ✗]
```

### 3. Tab "Historial de Movimientos" en pantalla de Insumos

Nuevo tab con tabla `MovimientosInsumos`:
- Filtros: fecha, tipo de movimiento, insumo
- Columnas: Fecha | Insumo | Tipo | Delta (±) | Stock Antes | Stock Después | Usuario
- Exportar a PDF / CSV

---

## Permisos (RBAC)

| Acción | Roles permitidos (configurable) |
|--------|----------------------------------|
| Ver historial de movimientos | Admin + `ver_movimientos_insumos` |
| Reportar apertura de paquete | Admin + `abrir_paquete` |
| **Aprobar/Rechazar ajuste** | **Solo Admin** |
| Descuento de producción (−) | Admin + `descuento_produccion` |

---

## Verificación / Testing

1. Insumo con `paquetesEnBodega=3`, `cantidadPorPaquete=34` → `cantidad=102`
2. Abrir paquete reportando 32 → `paquetesEnBodega=2`, `cantidad=100`, movimiento generado
3. Descontar 4 producción → `cantidad=96`, movimiento generado
4. Flujo aprobación: pendiente → aprobar → cantidad actualizada
5. Roles sin permiso no ven modal extendido ni sección de ajustes pendientes
