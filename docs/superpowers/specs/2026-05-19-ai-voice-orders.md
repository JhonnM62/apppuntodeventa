# Diseño: Comandos de Voz con IA para Toma de Pedidos (Voice-to-Order)

## Contexto y Objetivo
El usuario desea implementar una funcionalidad de **Toma de Pedidos por Voz** en la pantalla principal del POS (`NewSaleScreen`). 
El flujo ideal: El cajero o mesero presiona un botón de micrófono, dicta el pedido natural (ej. *"Una hamburguesa la berraca sin cebolla, adición de queso y 1 mora azul de 12.000"*), y la IA procesa el audio DIRECTAMENTE de forma multimodal, mapea lo dicho con los productos y comentarios existentes en la base de datos, y los agrega automáticamente al carrito de compras actual.

## Restricciones y Requisitos
1. **UI:** El botón de micrófono debe ir en el Header de `NewSaleScreen`, entre el texto "TOTAL (X)" y el botón de "Cliente".
2. **Modelo:** Utilizar exclusivamente el modelo configurado dinámicamente o forzar capacidades de razonamiento si se usa `gemini-3-flash-preview`.
3. **Parámetros Estrictos:** Obligatorio inyectar las configuraciones avanzadas del SDK oficial de Google GenAI para garantizar precisión:
   - `mediaResolution: 'MEDIA_RESOLUTION_HIGH'`
   - `thinkingConfig: { thinkingLevel: 'HIGH' }` (O usando los strings equivalentes del SDK para evitar errores de compilación TypeScript).
4. **Mapeo Real:** La IA debe devolver IDs reales de la base de datos para inyectar el producto en el carrito del frontend sin errores.
5. **Formato:** Salida estrictamente en JSON.

## Opciones de Arquitectura (Approaches)

### Enfoque 1: Procesamiento Multimodal Directo con Gemini (Elegido)
- *Flujo:* El frontend graba audio (`.m4a` o `.wav`) -> envía el audio al backend (`/api/v1/ai/voice-order`) -> el backend inyecta el catálogo (Productos y Comentarios) en el *System Prompt* y le pasa el archivo de audio **directamente a Gemini** (Multimodal) junto con las opciones de alta resolución y razonamiento. -> Gemini procesa el audio y devuelve el JSON estructurado.
- *Pros:* Una sola API, sin latencias de terceros, aprovecha al máximo el poder de razonamiento de Gemini 3.
- *Contras:* El envío de audio Base64/Buffer puede ser algo pesado, pero manejable para grabaciones cortas (5-10 segundos).

## Diseño Propuesto (Paso a Paso)

### 1. Grabación de Audio (Frontend)
- Se instalará/utilizará `expo-av` para capturar el micrófono.
- **Formato:** Grabación `.m4a` (AAC) a 44.1kHz.
- **UI:** En `NewSaleScreen.tsx`, botón de micrófono (`Ionicons name="mic"`) en el header, entre el total y el botón de cliente.

### 2. Nuevo Endpoint en Backend (`AiModule`)
- Endpoint: `POST /api/v1/ai/voice-order`
- **Contexto Dinámico:** El `AiService` hará una consulta a la BD (Prisma) para obtener un array optimizado de:
  - `productos: [{ id, nombre, precio }]`
  - `comentarios: [{ id, nombre, precio }]`
- Se enviará el audio a Gemini usando el SDK `@google/genai` enviando el `inlineData` con el MimeType del audio.

### 3. Configuración Avanzada del SDK (Backend)
Se inyectarán los parámetros solicitados explícitamente en el objeto `config` de `generateContent`:
```typescript
const config = {
  systemInstruction: "...",
  responseMimeType: "application/json",
  responseSchema: schema,
  mediaResolution: "MEDIA_RESOLUTION_HIGH",
  thinkingConfig: {
    thinkingLevel: "HIGH" // String para evitar el error TS2304 Cannot find name 'ThinkingLevel'
  }
}
```

### 4. Prompt Engineering y Schema
**Prompt:**
```text
Eres el sistema inteligente de un punto de venta.
Catálogo actual en JSON:
PRODUCTOS: [...]
COMENTARIOS: [...]

Escucha el audio del cliente y extrae el pedido.
REGLAS:
1. Mapea el audio con el 'nombre' más parecido del catálogo de PRODUCTOS.
2. Extrae los modificadores (ej. "sin cebolla") y mapealos a COMENTARIOS.
3. Devuelve estrictamente el JSON con las cantidades solicitadas.
```
**JSON Schema:**
```json
{
  "items": [
    {
      "productoId": "string",
      "cantidad": 1,
      "comentariosIds": ["string"]
    }
  ]
}
```

### 5. Integración Final (Frontend)
- Al recibir el JSON del backend, el frontend buscará los productos en su estado local (`useGastosStore` o estado de ventas).
- Construirá el objeto `OrderItem` con sus modificadores y llamará a la función `handleAddToCart` por cada ítem.
- Reproducirá un sonido sutil de "Bip" de éxito o mostrará un Toast "3 productos agregados".