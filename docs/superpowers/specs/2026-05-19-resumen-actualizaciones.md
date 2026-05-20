# Resumen de Actualizaciones y Correcciones (19 de Mayo de 2026)

Este documento detalla todas las implementaciones, correcciones de errores y refactorizaciones realizadas durante la última sesión de desarrollo, abarcando el Frontend, Backend y DevOps.

---

## 📱 1. Frontend (`puntodeventafront`)

### Correcciones de Errores Críticos (Crashes)
* **Error `useRef doesn't exist` y `Keyboard doesn't exist`:** Se corrigieron las importaciones faltantes de React (`useRef`) y React Native (`Keyboard`) en `InsumoDetailScreen`, `ReportesScreen` y `CajaListScreen`. Esto ocurría al intentar montar los listeners para el teclado.

### Mejoras de Interfaz de Usuario (UI) y Experiencia (UX)
* **Directiva de Layout Keyboard-Aware:** Se refactorizó la vista `InsumoDetailScreen` para envolver la estructura principal en un `KeyboardAvoidingView` nativo, ajustando el `flexGrow: 1` y el padding dinámico en Android. Esto elimina los espacios en blanco al final del scroll.
* **Auto-scroll Dinámico:** Se agregó la funcionalidad de *scroll automático* (`scrollToEnd`) al hacer foco en los inputs de "Cantidad" y "Observación" en el registro de movimientos de insumos, evitando que el teclado oculte los botones de acción.
* **Rediseño del Input de Cantidad:** Se reemplazó el input de texto genérico por el componente moderno de botones `[ - ] [ + ]` en la vista de detalle de Insumos para facilitar su uso táctil.
* **Clarificación de Conceptos de Stock:** Se separaron visualmente los conceptos en la UI de Insumos para evitar confusiones operativas:
  * **Stock Actual (`disponible`):** Es el stock real, afectado por ventas y movimientos.
  * **Stock Histórico (`cantidad`):** Total histórico de entradas.

### Manejo de Imágenes de Insumos
* **Restauración de Imágenes:** Se corrigió el fallo donde las imágenes no se mostraban. Se unificó la lectura hacia la columna `imagen` (soportando el legacy `Image` de AppSheet).
* **Eliminación de Fotos:** Se agregó un botón rojo de "papelera" en el formulario de insumos que permite eliminar explícitamente la imagen tanto localmente como en la base de datos (enviando `null`).
* **Limpieza de Código:** Se eliminaron todas las referencias y variables obsoletas como `imageUrl` e `imagencard` para mantener un esquema estricto.
* **Optimización de Consola:** Se eliminaron los `console.log` excesivos en la generación de URLs de imágenes que saturaban la terminal durante el scroll.

### Manejo de Errores de Red
* **Atrape de Error 404:** Se implementó una captura silenciosa (`catch`) en `InventarioScreen`. Al eliminar un registro de entrada/salida, el evento WebSocket refresca la vista; si el registro ya no existe, el modal simplemente se cierra sin arrojar errores rojos en la consola.

---

## ⚙️ 2. Backend (`puntodeventabackend`)

### IA y Voice-to-Order
* **Reparación de JSON Truncado:** Se implementó una función heurística avanzada en `ai.service.ts` para capturar respuestas JSON cortadas por el modelo Gemini (especialmente en modo *Thinking* por límite de tokens). La función escapa saltos de línea literales, limpia etiquetas Markdown y auto-completa llaves y corchetes de cierre (`}`, `]`, `"`) antes de invocar `JSON.parse()`.

### Motor de Inventario y Ventas
* **Descuento Automático por Recetas:** Se integró la lógica en `ventas.service.ts` para que, al completar una venta, el sistema consulte los insumos que componen los productos vendidos (`Recetainsumos`) y descuente automáticamente las cantidades del stock (`disponible`) en tiempo real, siempre y cuando tengan el switch `descontarCantDeVentas` en "SI".
* **Reversos Automáticos:** Al editar, remover un producto de una venta, o anular una venta completa, el sistema ahora reabastece los insumos correspondientes al inventario.
* **Soporte de Stock Negativo:** Se eliminó la validación que impedía descontar si el stock era 0, permitiendo valores negativos para no bloquear el flujo de ventas del restaurante por errores de conteo (generando la alerta crítica correspondiente).
* **Fix TypeScript TS2339:** Se corrigió un error de tipado estricto al acceder a `producto.IDproductos` vs `producto.productoId` en el DTO de creación de ventas.

### Gestión de Base de Datos y Modelos
* **Eliminación en Cascada (Cascade Delete):** Se modificó el archivo `schema.prisma`. Se agregó `@relation(..., onDelete: Cascade)` al modelo `Orderinventario`. Ahora, al eliminar un registro padre en la tabla `INVENTARIO`, sus registros hijos se eliminan automáticamente, previniendo datos huérfanos.
* **Eliminación Real de Imágenes:** Se actualizó `insumos.service.ts` para que acepte explícitamente valores `null` o strings vacíos (`""`). Al recibirlos, el backend establece la columna `imagen` como `null` en la base de datos, logrando el borrado real de la foto.
* **Limpieza de Columnas Legacy:** Al igual que en el front, el backend ya no procesa ni intenta guardar datos en las columnas `imageUrl` o `imagencard`.

---

## 🚀 3. DevOps y Despliegue Automatizado

### GitHub Actions (`deploy.yml`)
* **Preservación de Archivos Estáticos (Imágenes):** Se corrigió el bug crítico donde el comando `git clean -fd` ejecutado por el runner de GitHub borraba todas las imágenes subidas por los usuarios.
  * *Solución:* Las carpetas de subidas ahora viven fuera del entorno de git (`/root/backend-data/uploads`).
  * Se modificó el comando `docker run` para montar un volumen persistente: `-v /root/backend-data/uploads:/app/public/uploads`.
* **Sincronización Automática de Base de Datos:** Se inyectó el paso `docker run --rm ... npx prisma db push --accept-data-loss` en el workflow de despliegue. Esto asegura que cualquier cambio en la estructura de la base de datos (como la nueva regla de eliminación en cascada) se aplique remotamente a la base de datos de PostgreSQL en Contabo sin intervención manual.