# Diseño: Extracción de Datos con IA (OCR) para Gastos + Configuración Dinámica

## Contexto y Objetivo
El usuario desea integrar el SDK oficial de Google (`@google/genai`) para aplicar OCR e inteligencia artificial a los recibos o comprobantes. Inicialmente se usará en el módulo de "Gastos" para autocompletar campos (concepto, valor, tipo, medioDePago), pero la lógica debe ser **altamente reutilizable** para otros módulos.
Además, en lugar de usar variables de entorno rígidas, se requiere un **Submódulo de Configuración de IA** en la interfaz (y en la base de datos) para que los administradores puedan ingresar la API Key, seleccionar modelos, y ajustar parámetros (temperatura, topP, etc.) dinámicamente.

## Opciones de Arquitectura (Approaches)

### Enfoque 1: Configuración en DB + Servicio Centralizado de IA (Recomendado)
- **Base de Datos (Prisma):** Crear un nuevo modelo `ConfiguracionIA` (singleton, similar a `ConfiguracionNegocio`) que guarde: `apiKey`, `modeloPorDefecto`, `temperatura`, `topP`, `maxTokens`, y `isActive`.
- **Backend (`AiModule` & `ConfiguracionModule`):** 
  - Actualizar `ConfiguracionController` para exponer endpoints GET/PATCH de la configuración de IA.
  - Crear `AiService` que, antes de llamar al SDK de Gemini, consulte la base de datos para obtener la `apiKey` y los parámetros actuales. Si no hay llave o está inactivo, lanza un error amigable.
  - Exponer un endpoint genérico `POST /api/v1/ai/extract-receipt` que reciba una imagen y un prompt o contexto, devolviendo el JSON extraído.
- **Frontend (`GastosFormModal.tsx` & `ConfiguracionScreen`):**
  - **Configuraciones:** Añadir una nueva pestaña o sección "IA" en el submódulo de configuraciones donde se muestre un formulario para actualizar estos valores.
  - **Gastos:** Un botón "Escanear con IA" que toma la foto, llama al endpoint del backend, y autocompleta los campos.
- *Pros:* Dinámico, seguro (API Key en backend y DB, no en `.env` rígido), altamente reutilizable para el futuro.
- *Contras:* Requiere migración de base de datos.

### Enfoque 2: Configuración en `.env` + Inyección de Dependencias
- *Pros:* Más rápido de implementar.
- *Contras:* Va en contra de la solicitud del usuario (quiere UI en la app para cambiar de modelos y ajustar temperatura sin reiniciar el servidor). Descartado.

## Diseño Propuesto (Enfoque 1)

### 1. Cambios en Base de Datos (`schema.prisma`)
Se añadirá un nuevo modelo:
```prisma
model ConfiguracionIA {
  id             Int      @id @default(1)
  apiKey         String?
  modeloDefecto  String   @default("gemini-1.5-flash")
  temperatura    Float    @default(0.4)
  topP           Float    @default(0.95)
  maxTokens      Int      @default(2048)
  isActive       Boolean  @default(true)
  updatedAt      DateTime @updatedAt

  @@map("CONFIGURACION_IA")
}
```

### 2. Submódulo de Configuraciones (Backend & Frontend)
- **Backend:** Añadir lógica en `configuracion.service.ts` para hacer CRUD sobre `ConfiguracionIA`.
- **Frontend:** En `ConfiguracionScreen.tsx` (o un nuevo componente anidado), renderizar el formulario. La API Key se mostrará enmascarada (tipo password) por seguridad. El modelo será un Picker (`gemini-1.5-flash`, `gemini-2.0-flash`, `gemini-3-flash-preview`).

### 3. Módulo Central de IA (Backend)
- Crear `src/ai/ai.module.ts`.
- `AiService` tendrá un método `extractDataFromImage(imageBuffer, mimeType, systemPrompt)`.
- El servicio instanciará dinámicamente `new GoogleGenAI({ apiKey: config.apiKey })` en cada llamada o cacheará la instancia si la config no ha cambiado, usando los parámetros (temperatura, topP) de la base de datos.

### 4. Integración en Gastos (Frontend)
- `GastosFormModal.tsx`:
  - Botón "✨ Autocompletar con IA" junto al botón de tomar foto.
  - Al presionar, abre cámara. Al confirmar, envía a `POST /api/v1/ai/extract-data` (endpoint genérico que en el futuro servirá para insumos, etc.).
  - Muestra un Skeleton o Loading.
  - Al recibir respuesta, parsea y hace `setConcepto`, `setValor`, etc.

## Estructura JSON Esperada (Ejemplo Gastos)
El `AiService` inyectará un `systemInstruction` que obligará a Gemini a devolver:
```json
{
  "concepto": "Descripción limpia del gasto",
  "valor": 45000,
  "tipo": "NEGOCIO",
  "medioDePago": "Efectivo"
}
```

## Reutilización
Al hacer que el endpoint sea genérico (ej. `/api/v1/ai/extract-data`), el frontend podrá enviar un parámetro extra `context="gastos"` o `context="factura_proveedor"`. El backend tendrá un diccionario de *prompts* según el contexto.
