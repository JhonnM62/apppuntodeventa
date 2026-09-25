# Diseño: Estrategia de Compilación APK "Fast" (Caché Nativo) en VPS

**Fecha:** 2026-09-24  
**Objetivo:** Reducir el tiempo de compilación de la APK en el VPS (de ~15 mins a ~2 mins) aprovechando el caché nativo de Gradle (similar a la reutilización de capas en Docker), manteniendo 100% la compatibilidad con los servicios existentes (Notificaciones Push, Firebase, configuraciones de app.json).

## 1. Motivación y Problema Actual
Actualmente, el script `compile-vps.sh` utiliza `eas build --local`. Esta herramienta está diseñada para generar un entorno limpio ("stateless") en cada ejecución. Crea una nueva carpeta en `/opt/build-farm/eas-tmp`, descarga todo el SDK, regenera el código C++ y Java desde cero, compila y luego se destruye la carpeta temporal para evitar cuelgues. 
Esto causa que cada build sea dolorosamente lento y sature el VPS al 100% de uso de CPU durante todo el proceso.

## 2. Estrategia Propuesta (Side-by-Side)
Para proteger el flujo de trabajo actual, se propone un enfoque conservador **"Side-by-Side"**.
No se alterarán los scripts originales que ya funcionan. Se crearán scripts paralelos para habilitar el "Fast Build". Si el Fast Build falla, el usuario siempre podrá ejecutar el script original.

### 2.1 Scripts a Crear
1. **`scripts/compile-vps-fast.sh`** (En el VPS): Orquestará el prebuild y la compilación de Gradle conservando el caché.
2. **`auto-deploy-windows-fast.ps1`** (En la PC del desarrollador): Servirá como el punto de entrada para lanzar el despliegue rápido.

### 2.2 Flujo del Script "Fast"
En lugar de invocar a `eas build`, el script `compile-vps-fast.sh` realizará lo siguiente:
1. Validaciones y limpieza de procesos colgados (similar al original, pero **SIN** borrar cachés persistentes como `~/.gradle` o el directorio `android/`).
2. Clonado y actualización del repositorio (`git pull`).
3. Instalación de dependencias `npm install`.
4. Ejecución de `npx expo prebuild --platform android --clean` (El flag `--clean` se usará estratégicamente solo cuando sea necesario forzar regeneración por cambios en plugins, o simplemente dejaremos que regenere los archivos esenciales respetando el entorno). *Decisión final: Usaremos `npx expo prebuild --platform android` para inyectar `app.json` (iconos, google-services.json) en la carpeta `android/`*.
5. Inyección de variables de memoria de Gradle (ej: `GRADLE_OPTS`).
6. Navegación a la carpeta `android/` y ejecución de `./gradlew assembleRelease` (o assembleDebug según el perfil).
7. Movimiento y renombrado del APK resultante al nivel raíz, exactamente igual a como lo hace el script original.

## 3. Manejo de Keys y Notificaciones Push
EAS Build por detrás usa `expo prebuild`. Al invocar manualmente `expo prebuild`, Expo lee el `app.json`, detecta la propiedad `googleServicesFile` y cualquier otra configuración nativa, y automáticamente copia los archivos y configura el `AndroidManifest.xml`.
Por lo tanto, no se requiere ningún paso adicional para mantener Firebase o Google Play Services funcionando.

## 4. Trade-offs y Fallbacks
- **Desventaja (Trade-off):** Ocasionalmente (ej: al actualizar librerías que tocan código nativo muy profundo en C++), el caché de Gradle puede corromperse causando un fallo de compilación con errores crípticos.
- **Fallback Robusto (Parámetro -Clean):** El script `auto-deploy-windows-fast.ps1` aceptará una bandera `-Clean`. Al usarse, indicará al VPS que debe eliminar por completo la carpeta `android/` y forzar un `npx expo prebuild --clean` reconstruyendo los cachés de Gradle. Esto permite al usuario resolver problemas de corrupción desde el mismo flujo rápido, penalizando el tiempo de espera (15 mins) únicamente cuando sea estrictamente necesario.

## 5. Criterios de Éxito
- La segunda compilación (y subsecuentes) sin cambiar librerías en `package.json` toma < 3 minutos.
- El script antiguo (`auto-deploy-windows.ps1`) sigue operativo.
- El APK resultante contiene correctamente las keys de Firebase y las variables de entorno de cada perfil (fogata, restaurante2, preview, development).
