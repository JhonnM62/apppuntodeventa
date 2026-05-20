# Diseño: Sistema de Verificación de Insumos en Arqueo de Caja

**Fecha:** 2026-05-19
**Proyecto:** Q'hubo Mor POS - Frontend + Backend
**Estado:** Listo para revisión

---

## 1. Objetivo

Agregar un sistema de verificación obligatoria de insumos de alto riesgo (`cuadrarInsumos=true`) cada vez que el usuario entre a las pestañas **Cuadre Caja** o **Análisis** de cualquier registro de caja del día. El objetivo es garantizar que antes de cerrar el turno, los insumos críticos hayan sido contados físicamente y contrastados con el sistema, sin revelar valores esperados para evitar manipulación.

---

## 2. Contexto Actual

- **Tablas existentes:** `AperturaCierreCaja`, `AperturaCierreInsumos`
- **Flujo actual:** Modal "Congelar Arqueo" al entrar a Cuadre/Análisis
- **Campos actuales en Insumos:** `disponible` (stock actual), `cantidad` (histórico)
- **Socket events:** `refreshCaja`, `refreshInsumos` ya existentes
- **El campo `cuadrarInsumos`** será agregado a `INSUMOS` en el schema de Prisma

---

## 3. Flujo Principal (Secuencial)

```
[Usuario entra a Cuadre Caja o Análisis]
                ↓
    ┌───────────────────────────────┐
    │ STEP 1: VERIFICACIÓN INSUMOS  │
    │ ¿Hay insumos cuadrarInsumos   │
    │ =true sin conteo en esta caja? │
    └───────────────────────────────┘
                ↓
    ┌─────────────────────────────────────────┐
    │ SI → Modal BLOQUEANTE                   │
    │     Must count before proceeding        │
    │     Muestra lista de insumos pendientes │
    │     No puede ver datos sin pasar        │
    └─────────────────────────────────────────┘
                ↓
    ┌─────────────────────────────────────────┐
    │ STEP 2: MODAL FREEZE                    │
    │     Aparece DESPUÉS de verificación     │
    │     "¿Congelar arqueo ahora?"           │
    └─────────────────────────────────────────┘
                ↓
    [Mostrar datos de Cuadre/Análisis]
```

---

## 4. Diseño de Datos

### 4.1 Cambios en Schema de Prisma

**Modelo `Insumos`** - agregar campo:
```prisma
model Insumos {
  // ... campos existentes ...
  cuadrarInsumos Boolean @default(false) @map("Cuadrar Insumos")
}
```

**Modelo `AperturaCierreInsumos`** - nuevos campos:
```prisma
model AperturaCierreInsumos {
  // ... campos existentes ...
  ultimoConteoAt      DateTime? @map("Ultimo Conteo At")
  conteoVerificadoHoy Boolean  @default(false) @map("Conteo Verificado Hoy")
  conteoPendiente     Boolean  @default(false) @map("Conteo Pendiente") // true si nunca fue contado en esta caja
}
```

### 4.2 Lógica de Verificación por Día (Fase 3)

- Un insumo `cuadrarInsumos=true` necesita conteo al menos UNA VEZ al día
- Si YA fue verificado HOY en CUALQUIER caja abierta ese día → el sistema permite acceso sin modal de bloqueo, pero muestra badge verde
- Si NO fue verificado HOY en NINGUNA caja → modal bloqueante obligatorio

---

## 5. Backend - Cambios Requeridos

### 5.1 Nuevo Endpoint

```
GET /api/v1/caja/:cajaId/verificacion-pendiente
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "pendientes": [
      {
        "id": "abc123",
        "nombre": "Vasos 12oz",
        "unidadDeMedida": "und",
        "disponibleEnSistema": 50,
        "ultimoConteoAt": null,
        "conteoVerificadoHoy": false,
        "diferenciaDetectada": false
      }
    ],
    "totalPendientes": 1,
    "yaVerificadoHoy": false,
    "todasVerificadas": false
  }
}
```

### 5.2 Nuevo Endpoint - Registrar Conteo

```
POST /api/v1/caja/:cajaId/registrar-conteo
Body: {
  "insumos": [
    {
      "idcierreyapertura": "abc123",
      "cantContada": 48,
      "diferenciaDetectada": true,
      "razonDiferencia": "2 rotos",
      "pinConfirmacion": "1234"
    }
  ]
}
```

**Validaciones:**
- Si `diferenciaDetectada=true` → requiere `pinConfirmacion` válido
- Registra timestamp en `ultimoConteoAt`
- Marca `conteoVerificadoHoy=true` para este insumo

### 5.3 Endpoint - Verificar si Insumo Ya fue Verificado Hoy

```
GET /api/v1/insumos/:insumoId/verificado-hoy
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "verificadoHoy": true,
    "ultimaVerificacionAt": "2026-05-19T14:30:00Z",
    "cajaDondeSeVerifico": "Caja 1"
  }
}
```

### 5.4 Lógica en Servicio de Caja

Al abrir caja (`abrirCaja`):
- Para cada insumo con `cuadrarInsumos=true` → marcar `conteoPendiente=true`

Al registrar venta:
- No cambia estado de verificación

Al cerrar caja:
- Validar que todos los insumos `cuadrarInsumos=true` tengan `conteoVerificadoHoy=true`
- Si no → retornar error con lista de pendientes

---

## 6. Frontend - Cambios Requeridos

### 6.1 Componente de Verificación (`VerifyInsumosModal.tsx`)

**Ubicación:** `src/components/caja/VerifyInsumosModal.tsx`

**Props:**
```typescript
interface VerifyInsumosModalProps {
  visible: boolean;
  cajaId: string;
  onVerified: () => void;
  onCancel: () => void;
}
```

**Estados:**
1. `CHECKING` - Verificando pendientes con el backend
2. `PENDING_VERIFICATION` - Hay insumos por contar (modal bloqueante)
3. `ALL_VERIFIED` - Todos verificados, badge verde
4. `DIFFERENCE_DETECTED` - Diferencia encontrada, requiere PIN

**UI:**
```
┌─────────────────────────────────────────┐
│  ⚠️ VERIFICACIÓN DE INSUMOS             │
│                                         │
│  Los siguientes insumos de alto riesgo  │
│  no han sido verificados hoy:           │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Vasos 12oz              50       │   │
│  │ Vasos 24oz              30       │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Ingresa la cantidad física contada:    │
│                                         │
│  Vasos 12oz: [-] [ 48 ] [+]            │
│  Vasos 24oz: [-] [ 31 ] [+]            │
│                                         │
│  PIN: [    ]                            │
│                                         │
│  ☐ Declaro que la cantidad física      │
│    es correcta según mi计数             │
│                                         │
│     [Cancelar]    [Confirmar]          │
└─────────────────────────────────────────┘
```

**Reglas:**
- Modal NO se puede cerrar sin confirmar todos los insumos pendientes
- Si diferencia detectada → debe ingresar PIN y marcar checkbox
- Al confirmar → emit socket `refreshCaja` y `refreshInsumos`

### 6.2 Integración en `CajaFormScreen.tsx`

En el hook `useFocusEffect` de las pestañas Cuadre/Análisis:

```typescript
const [verificationModalVisible, setVerificationModalVisible] = useState(false);

// En useFocusEffect al entrar a Cuadre o Análisis:
useFocusEffect(
  useCallback(() => {
    if (activeTab === 'CUADRE' || activeTab === 'ANALISIS') {
      const pendientes = await checkVerificacionPendiente(cajaId);
      if (pendientes.totalPendientes > 0 || !pendientes.todasVerificadas) {
        setVerificationModalVisible(true);
      }
    }
  }, [activeTab, cajaId])
);
```

**Flujo completo:**
```
[Entrar a pestaña CUADRE/ANALISIS]
    → useFocusEffect dispara verificación
    → GET /caja/:id/verificacion-pendiente
    → SI hay pendientes → mostrar VerifyInsumosModal (bloqueante)
    → UNA VEZ cerrado el modal → mostrar modal Freeze
    → UNA VEZ freeze manejado → mostrar datos reales
```

### 6.3 Badge Visual en Tab

```
┌──────────────────────────────────────┐
│  [Formulario] [Cuadre ✓] [Análisis]  │
└──────────────────────────────────────┘
```

- Badge verde `✓` = insumos verificados en esta sesión
- Badge rojo `⚠` = insumos pendientes de verificación
- Badge gris `-` = caja cerrada (no aplica)

### 6.4 Pantalla de Confirmación con Diferencia

Si el usuario ingresa un valor diferente al del sistema:

```
┌─────────────────────────────────────────┐
│  ⚠️ DIFERENCIA DETECTADA               │
│                                         │
│  Vasos 12oz:                           │
│    Sistema: 50                          │
│    Físico:  48                          │
│    Diferencia: -2                       │
│                                         │
│  ¿Por qué hay diferencia?               │
│  [2 rotos por manipulación]            │
│                                         │
│  PIN: [    ]                            │
│                                         │
│  ⚠️ Esta diferencia quedará registrada  │
│     para auditoría                      │
│                                         │
│     [Corregir]    [Confirmar]          │
└─────────────────────────────────────────┘
```

---

## 7. Eventos de Socket

| Evento | Dirección | Propósito |
|--------|-----------|----------|
| `insumoVerificado` | Client → Server | Broadcast cuando un insumo es verificado en tiempo real |
| `refreshVerificacion` | Server → Clients | Actualizar estado de verificación a todos los dispositivos |
| `refreshCaja` | Server → Clients | Ya existe - recalcular al verificar |
| `refreshInsumos` | Server → Clients | Ya existe - actualizar disponibles |

---

## 8. Reglas de Negocio Resumidas

### Fase 1 - Sin conteo en ninguna caja hoy
- Modal bloqueante obligatorio
- No puede ver datos de Cuadre/Análisis

### Fase 2 - Ya se contó en otra caja hoy
- Mensaje: "Ya fue verificado en otra caja. ¿Usar o contar de nuevo?"
- Puede elegir auto-rellenar del conteo anterior

### Fase 3 - Fue contado en esta caja
- Badge verde, acceso directo

### Fase 4 - Diferencia detectada
- Debe explicar razón + PIN
- Queda logged en `HistorialCajaInsumos`

### Fase 5 - Intento de cierre de caja sin verificación
- Validación backend bloquea el cierre
- Retorna error con lista de insumos pendientes

### Fase 6 - Override de emergencia
- Solo con PIN de gerente
- Logged: "Cierre forzado sin verificación completa"

---

## 9. Dependencias y Impacto

| Área | Cambio | Impacto |
|------|--------|---------|
| DB | Nuevo campo `cuadrarInsumos` en `INSUMOS` | Migración Prisma |
| DB | Nuevos campos en `AperturaCierreInsumos` | Migración Prisma |
| Backend | 3 nuevos endpoints | API nueva |
| Backend | Validación en cierre de caja | Lógica existente |
| Frontend | Nuevo componente `VerifyInsumosModal` | Componente nuevo |
| Frontend | Integración en `CajaFormScreen` | Cambio existente |
| Frontend | Badge en tabs | UI nueva |
| Socket | Nuevo evento `insumoVerificado` | Integración existente |

---

## 10. Orden de Implementación Sugerido

1. **Schema Prisma** - agregar campos nuevos
2. **Backend endpoints** - verificar-pendiente, registrar-conteo
3. **Backend validación** - no cerrar sin verificación
4. **Frontend modal** - VerifyInsumosModal
5. **Integración** - en CajaFormScreen tabs
6. **Socket** - transmitir verificación en tiempo real
7. **Badge UI** - indicadores en tabs
8. **Override emergencia** - PIN gerente

---

*Documento sujeto a revisión del usuario antes de pasar a implementación.*