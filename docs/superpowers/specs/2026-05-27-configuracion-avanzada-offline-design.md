# Diseño y Plan de Implementación: Configuración Avanzada y Modo Offline
**Fecha:** 2026-05-27

## 1. Descripción General
El objetivo es dotar a la aplicación POS de capacidades avanzadas de configuración de interfaz (colores dinámicos y escalado de fuentes) y garantizar el funcionamiento continuo en entornos con conectividad a internet intermitente (Modo Offline).

## 2. Decisiones de Diseño (Aprobadas por el Usuario)
1. **Tematización Dinámica:** Se implementará un selector de color libre (hexadecimal) para que los administradores puedan elegir la paleta exacta de su negocio.
2. **Sincronización Offline:** Se utilizará un enfoque de **Sincronización Diferida Simple (Queue)** para minimizar riesgos en la arquitectura actual. Las lecturas usan caché local, y las escrituras offline se encolan y envían cuando vuelve la conexión.

## 3. Arquitectura Propuesta

### 3.1. Configuración Visual (Temas y Fuentes)
*   **Estado Global:** Crearemos un store en Zustand (`useSettingsStore.ts`) que guarde:
    *   `primaryColor` (hex, default verde actual).
    *   `fontScale` (number, default 1.0).
*   **Tematización:** Debido a que Tailwind (`uniwind`) pre-compila clases, inyectaremos el `primaryColor` a través de propiedades `style={{ backgroundColor: primaryColor }}` en los componentes base (botones, cabeceras) o usaremos un Provider global.
*   **Fuentes:** Crearemos o actualizaremos el componente base `<Text>` (ej. `src/components/ui/Text.tsx`) para que intercepte cualquier tamaño de fuente y lo multiplique por `fontScale`.

### 3.2. Modo Sin Conexión (Offline Mode)
*   **Detección de Red:** Integrar `@react-native-community/netinfo` para monitorear el estado de conexión en tiempo real.
*   **Caché de Lectura:** Modificar las llamadas a la API de productos, insumos y configuración para guardar la última respuesta exitosa en `AsyncStorage`. Si la petición falla por falta de red, se devuelve la caché.
*   **Cola de Escrituras (Write Queue):**
    *   Crear un `useSyncStore.ts` que almacene en un arreglo (cola) las operaciones pendientes (ej. `[{ type: 'CREATE_VENTA', payload: {...} }]`).
    *   Al recuperar la conexión, un "Sync Manager" procesa la cola secuencialmente.
*   **Feedback Visual:** Mostrar un banner sutil en la parte superior cuando la app esté sin conexión, y otro indicando "Sincronizando..." al volver el internet.

## 4. Plan de Ejecución
1.  **Fase 1: Settings Store & UI**
    *   Crear `useSettingsStore`.
    *   Crear la pantalla de configuración visual con el selector de color (`react-native-color-picker` o similar) y el control de tamaño de fuente.
    *   Adaptar componentes principales al nuevo color y escala.
2.  **Fase 2: Offline - Caché de Lecturas**
    *   Implementar interceptor o wrapper para peticiones GET clave (Productos, Insumos).
3.  **Fase 3: Offline - Cola de Escrituras**
    *   Crear el gestor de sincronización (`SyncManager`).
    *   Adaptar la creación de Ventas, Gastos y Apertura/Cierre de caja para usar la cola si no hay red.
4.  **Fase 4: Indicadores UX**
    *   Mostrar barras de estado de red.

## 5. Preguntas Abiertas / Para Revisión
> [!IMPORTANT]
> - ¿Existen secciones específicas de la app donde sea imperativo bloquear acciones si no hay internet (ej. cierre de caja)? 
> - ¿Se debe notificar al cajero mediante un aviso emergente cuando una venta fue guardada solo localmente, o prefieres que sea completamente transparente (silencioso)?
