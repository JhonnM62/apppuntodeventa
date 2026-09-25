# Guia de Uso: Compilacion Rapida de APK (Fast Build)

**Fecha:** 2026-09-25 (v2 - Soporte multi-perfil)  
**Diseno base:** [2026-09-24-apk-caching-design.md](./2026-09-24-apk-caching-design.md)

---

## Que es el Fast Build?

El Fast Build compila la APK en el VPS **reutilizando el cache nativo de Gradle** (como capas de Docker),
sin invocar `eas build --local`. Reduce el tiempo de compilacion de **~15 minutos a ~2 minutos** en builds subsecuentes.

> [!IMPORTANT]
> El script original (`auto-deploy-windows.ps1`) sigue funcionando igual. El Fast Build es **paralelo y opcional**.
> Si falla, siempre puedes volver al original.

---

## Comandos Rapidos

### Build Normal (con cache) — El mas usado

```powershell
# Desde tu PC, en la carpeta del proyecto frontend:
.\scripts\auto-deploy-windows-fast.ps1
```

Usa el perfil **`preview`** por defecto. El APK se descarga automaticamente a:
```
C:\Users\Administrador\Documents\apk's\
```

---

### Especificar un perfil diferente

```powershell
.\scripts\auto-deploy-windows-fast.ps1 -Profile fogata
.\scripts\auto-deploy-windows-fast.ps1 -Profile restaurante2
.\scripts\auto-deploy-windows-fast.ps1 -Profile development
```

Los perfiles disponibles estan definidos en `eas.json`.

---

### Build Limpio (sin cache) — Solo cuando hay errores raros

```powershell
.\scripts\auto-deploy-windows-fast.ps1 -Clean
.\scripts\auto-deploy-windows-fast.ps1 -Profile fogata -Clean
```

> [!WARNING]
> `-Clean` borra SOLO el `android/` y cache del **perfil actual**. Los caches de otros perfiles se conservan.
> Este build tarda ~8-10 minutos (menos que el original porque ~/.gradle se mantiene).
> Usalo solo cuando el build falle con errores crípticos que no se resuelven con un build normal.

---

## Como funciona el soporte multi-perfil (v2)

Cada perfil genera un paquete Android diferente (quemado en la estructura nativa Java):

| Perfil | APP_VARIANT | Paquete Android |
|---|---|---|
| `preview` | (ninguno) | `com.anonymous.qhubomorposapp` |
| `development` | (ninguno) | `com.anonymous.qhubomorposapp` |
| `restaurante2` | `restaurante` | `com.anonymous.restaurante` |
| `fogata` | `fogata` | `com.anonymous.fogata` |

### El problema que existia
Al cambiar de perfil (ej: `preview` → `restaurante2`), el `android/` folder tenia el paquete del perfil anterior.
Los archivos de autolinking generados por `expo prebuild` referenciaban el nuevo paquete, pero la estructura
Java era del anterior → error de compilacion: `package com.anonymous.restaurante does not exist`.

### La solucion (cache por perfil)
El script mantiene un directorio de cache por perfil en el VPS:
```
/opt/build-farm/apppuntodeventa/
├── android/                    <- Directorio activo (perfil actual)
├── .android_cache_preview/     <- Cache del perfil preview
├── .android_cache_restaurante2/ <- Cache del perfil restaurante2
├── .android_cache_fogata/      <- Cache del perfil fogata
└── .last_build_profile         <- Archivo con el nombre del ultimo perfil compilado
```

El swap entre perfiles usa `mv` (instantaneo en el mismo filesystem, sin copiar archivos).

### Tiempo por escenario

| Escenario | Tiempo estimado |
|---|---|
| Segundo build del mismo perfil | ~2 min |
| Cambio a perfil previamente compilado | ~2-3 min |
| Primera vez del perfil (cualquiera) | ~5-8 min |
| Build con `-Clean` | ~8-10 min |
| Script original con EAS | ~15 min |

---

## Que hace el script paso a paso

| Paso | Accion |
|---|---|
| Matar procesos | Limpia gradle/java/metro colgados |
| `git pull` | Sincroniza el codigo del repo al VPS |
| `npm install` | Instala dependencias |
| Variables de entorno | Lee `eas.json` y exporta las variables del perfil elegido |
| Gestion de cache | Detecta cambio de perfil y hace swap de `android/` si es necesario |
| `expo prebuild` | Inyecta `app.json`, iconos y `google-services.json` en `android/` |
| `./gradlew assembleRelease` | Compila la APK aprovechando el cache de Gradle |
| `scp` | Descarga el APK `*_fast.apk` a tu PC automaticamente |
| Guarda perfil | Escribe el perfil actual en `.last_build_profile` para la proxima vez |

---

## El APK resultante

El archivo generado sigue el patron:
```
{AppName}_v{version}_{perfil}_fast.apk
```
Ejemplo: `QHuboMorPOS_v1.0.220_preview_fast.apk`

Destino en tu PC: `C:\Users\Administrador\Documents\apk's\`

---

## Cuando usar cada script

| Situacion | Script a usar |
|---|---|
| Build de rutina (code changes, bug fixes) | `auto-deploy-windows-fast.ps1` |
| Cambiar de perfil (ej: preview -> fogata) | `auto-deploy-windows-fast.ps1 -Profile fogata` |
| Cambiaste plugins en `app.json` o `eas.json` | `auto-deploy-windows-fast.ps1` (prebuild actualiza) |
| Actualizaste una libreria nativa (`package.json`) | Fast primero; si falla -> `-Clean` |
| Error críptico de Gradle o paquete | `auto-deploy-windows-fast.ps1 -Clean` |
| Build de produccion para Play Store | `auto-deploy-windows.ps1` (original, con EAS cloud) |

---

## Solucion de Problemas

### "package com.anonymous.X does not exist"
Esto ya no deberia ocurrir con v2. Si ocurre, ejecuta con `-Clean` para ese perfil.

### "La compilacion en el VPS fallo"
1. Revisa el output del error en la terminal.
2. Si ves `> Task :app:compileReleaseJavaWithJavac FAILED` o errores de Kotlin → usa `-Clean`.
3. Si ves `OutOfMemoryError` → el VPS se quedo sin RAM. Espera 2 minutos y reintenta.

### "No se pudo descargar el APK"
El script busca `*_fast.apk` en el directorio raiz del proyecto en el VPS.
Verifica que el build termino correctamente antes del paso de descarga.

### "No se pudo sincronizar el codigo"
Verifica acceso SSH al VPS (`ssh root@100.42.185.2`) y que el repo en el VPS este limpio.

---

## Archivos del Sistema Fast Build

```
scripts/
├── compile-vps-fast.sh          <- Se ejecuta EN EL VPS (no tocar desde Windows)
└── auto-deploy-windows-fast.ps1 <- Se ejecuta EN TU PC (punto de entrada)
```

> [!NOTE]
> `compile-vps-fast.sh` vive en el repo y se actualiza automaticamente con cada `git pull` en el VPS.
> Los directorios `.android_cache_*/` son locales al VPS (no estan en Git).