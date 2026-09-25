# Guía de Uso: Compilación Rápida de APK (Fast Build)

**Fecha:** 2026-09-25  
**Diseño base:** [2026-09-24-apk-caching-design.md](./2026-09-24-apk-caching-design.md)

---

## ¿Qué es el Fast Build?

El Fast Build compila la APK en el VPS **reutilizando el caché nativo de Gradle** (como capas de Docker), sin invocar `eas build --local`. Esto reduce el tiempo de compilación de **~15 minutos a ~2 minutos** en builds subsecuentes.

> [!IMPORTANT]  
> El script original (`auto-deploy-windows.ps1`) sigue funcionando igual. El Fast Build es **paralelo y opcional**. Si falla, siempre puedes volver al original.

---

## Comandos Rápidos

### ✅ Build Normal (con caché) — El más usado

```powershell
# Desde tu PC, en la carpeta del proyecto frontend:
.\scripts\auto-deploy-windows-fast.ps1
```

Usa el perfil **`preview`** por defecto. El APK se descarga automáticamente a:
```
C:\Users\Administrador\Documents\apk's\
```

---

### 🎯 Especificar un perfil diferente

```powershell
.\scripts\auto-deploy-windows-fast.ps1 -Profile fogata
.\scripts\auto-deploy-windows-fast.ps1 -Profile restaurante2
.\scripts\auto-deploy-windows-fast.ps1 -Profile development
```

Los perfiles disponibles están definidos en `eas.json`.

---

### 🧹 Build Limpio (sin caché) — Solo cuando hay errores raros

```powershell
.\scripts\auto-deploy-windows-fast.ps1 -Clean
.\scripts\auto-deploy-windows-fast.ps1 -Profile fogata -Clean
```

> [!WARNING]  
> `-Clean` borra `~/.gradle/caches/`, `~/.gradle/daemon/` y la carpeta `android/` del VPS. Esto hace que este build tarde ~15 minutos (igual que el original). Úsalo **solo** cuando el build falle con errores de compilación crípticos que no se resuelven con un build normal.

---

## Qué hace el script paso a paso

| Paso | Acción |
|---|---|
| `git pull` | Sincroniza el código del repo al VPS |
| `npm install` | Instala dependencias (reutiliza `node_modules` si no hay cambios) |
| Variables de entorno | Lee `eas.json` y exporta las variables del perfil elegido |
| `expo prebuild` | Inyecta `app.json`, iconos y `google-services.json` en `android/` |
| `./gradlew assembleRelease` | Compila la APK **aprovechando el caché de Gradle** |
| `scp` | Descarga el APK `*_fast.apk` a tu PC automáticamente |

---

## El APK resultante

El archivo generado sigue el patrón:
```
{AppName}_v{version}_{perfil}_fast.apk
```
Ejemplo: `QhuboMor_v2.3.1_preview_fast.apk`

---

## Cuándo usar cada script

| Situación | Script a usar |
|---|---|
| Build de rutina (code changes, bug fixes) | `auto-deploy-windows-fast.ps1` ✅ |
| Cambiaste plugins en `app.json` o `eas.json` | `auto-deploy-windows-fast.ps1` ✅ (prebuild regenera) |
| Actualizaste una librería nativa (`package.json`) | `auto-deploy-windows-fast.ps1` primero; si falla → `-Clean` |
| Error de compilación críptico de Gradle | `auto-deploy-windows-fast.ps1 -Clean` 🧹 |
| Build de producción para Play Store | `auto-deploy-windows.ps1` (original, con EAS cloud) |

---

## Solución de Problemas

### ❌ "La compilación en el VPS falló"
1. Revisa el output del error en la terminal.
2. Si ves `> Task :app:compileReleaseJavaWithJavac FAILED` o errores de Kotlin → usa `-Clean`.
3. Si ves `OutOfMemoryError` → el VPS se quedó sin RAM. Espera 2 minutos y reintenta.

### ❌ "No se pudo descargar el APK"
El script busca `*_fast.apk` en el directorio raíz del proyecto en el VPS. Verifica que el build terminó correctamente antes del paso de descarga.

### ❌ "No se pudo sincronizar el código"
Verifica que tu PC tenga acceso SSH al VPS (`ssh root@100.42.185.2`) y que el repo en el VPS esté limpio.

---

## Archivos del Sistema Fast Build

```
scripts/
├── compile-vps-fast.sh          # Se ejecuta EN EL VPS (no tocar desde Windows)
└── auto-deploy-windows-fast.ps1 # Se ejecuta EN TU PC (punto de entrada)
```

> [!NOTE]  
> `compile-vps-fast.sh` vive en el repo pero **solo** lo ejecuta el script de Windows vía SSH. No lo ejecutes manualmente desde el VPS, ya que requiere los parámetros `$PROFILE` y `$CLEAN_MODE` bien seteados.
