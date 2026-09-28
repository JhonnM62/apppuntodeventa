#!/bin/bash
# Script FAST para ejecutar en el VPS que compila el APK reutilizando cache (Docker-style)
# v2: Soporta multiples perfiles sin conflicto mediante cache por perfil
# ANTI-COLAPSO: usa trap para garantizar limpieza incluso si el build falla/OOM

PROJECT_DIR="/opt/build-farm/apppuntodeventa"
PROFILE=${1:-preview}
CLEAN_MODE=${2:-false}
LAST_PROFILE_FILE="$PROJECT_DIR/.last_build_profile"

# ─────────────────────────────────────────────────────────────────────────────
# TRAP: Limpieza de RAM sin destruir la carpeta android/ para conservar cache
# ─────────────────────────────────────────────────────────────────────────────
limpiar_al_salir() {
  local EXIT_CODE=$?
  echo ""
  echo "[TRAP] Ejecutando limpieza garantizada (codigo de salida: $EXIT_CODE)..."
  pkill -9 -f gradle       2>/dev/null || true
  pkill -9 -f java         2>/dev/null || true
  pkill -9 -f "metro"      2>/dev/null || true
  sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
  if [ $EXIT_CODE -eq 0 ]; then
    echo "[TRAP] Limpieza post-compilacion exitosa."
  else
    echo "[TRAP] El build fallo (codigo $EXIT_CODE). Servidor limpio y listo para el proximo intento."
    echo "  Si el error parece ser corrupcion del cache, usa el parametro -Clean desde tu PC."
    echo "  El cache de OTROS perfiles NO fue afectado."
  fi
}
trap limpiar_al_salir EXIT

set -e

echo "================================================="
echo "   INICIANDO GRANJA DE COMPILACION (FAST MODE v2) "
echo "   Perfil: $PROFILE                               "
if [ "$CLEAN_MODE" = "true" ] || [ "$CLEAN_MODE" = "-Clean" ]; then
  echo "   MODO LIMPIEZA FORZADA ACTIVADO (-Clean)        "
  CLEAN_MODE="true"
fi
echo "================================================="

# 1. Matar procesos colgados
pkill -9 -f gradle    2>/dev/null || true
pkill -9 -f java      2>/dev/null || true
pkill -9 -f "expo"    2>/dev/null || true
pkill -9 -f "metro"   2>/dev/null || true

# 2. Liberar PageCache
sync; echo 3 > /proc/sys/vm/drop_caches || true

# 3. Verificar RAM libre
RAM_FREE=$(free -m | awk '/^Mem:/ {print $7}')
echo "   RAM disponible antes del build: ${RAM_FREE} MB"
if [ "$RAM_FREE" -lt 800 ]; then
  echo "ADVERTENCIA: Solo ${RAM_FREE} MB de RAM libre. El build puede ser inestable."
fi

echo "[1/6] Verificando entorno basico..."
NODE_VER=$(node -v 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")
if [ "$NODE_VER" -lt 20 ]; then
    echo "Node.js antigua (v$NODE_VER). Actualizando a Node 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

if ! command -v java &> /dev/null || ! java -version 2>&1 | grep -q '17\.'; then
    echo "Java 17 no encontrado. Instalando..."
    apt-get update && apt-get install -y openjdk-17-jdk unzip wget
fi

export ANDROID_HOME="/opt/build-farm/android-sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "ERROR: El directorio $PROJECT_DIR no existe."
  exit 1
fi

cd "$PROJECT_DIR"

echo "[2/6] Actualizando codigo fuente..."
git reset --hard
git pull
echo "Codigo actualizado."

echo "[3/6] Instalando dependencias NPM..."
npm install || {
  echo "npm install fallo. Limpiando y reintentando..."
  npm cache clean --force
  rm -rf node_modules package-lock.json
  npm install
}
echo "Dependencias instaladas."

echo "[4/6] Inyectando variables de entorno desde eas.json para $PROFILE..."
node -e "
const eas = require('./eas.json');
const envs = eas.build['$PROFILE']?.env || {};
for (const [key, value] of Object.entries(envs)) {
  console.log('export ' + key + '=\'' + value + '\'');
}
" > .eas_env.sh
source .eas_env.sh
rm -f .eas_env.sh

# Asegurar limites de memoria y workers si no fueron definidos en eas.json
export GRADLE_OPTS="${GRADLE_OPTS:-"-Xmx2560m -Dorg.gradle.daemon=false -Dorg.gradle.jvmargs='-Xmx2560m -XX:MaxMetaspaceSize=512m'"}"
export NODE_OPTIONS="--max-old-space-size=1024"

# ─────────────────────────────────────────────────────────────────────────────
# [5/6] GESTION DE CACHE POR PERFIL
#
# Cada perfil genera un paquete android diferente:
#   preview/development -> com.anonymous.qhubomorposapp
#   restaurante2        -> com.anonymous.restaurante
#   fogata              -> com.anonymous.fogata
#
# El android/ folder tiene el paquete quemado en la estructura nativa Java.
# Solucion: cache por perfil en .android_cache_PROFILE/ con swap via mv (instantaneo).
#
# Comportamiento:
#   - Mismo perfil         -> reutiliza android/ existente       -> ~2 min
#   - Cambio de perfil     -> swap de directorios android/       -> ~2 min (si ya fue compilado antes)
#   - Primera vez perfil   -> expo prebuild --clean (solo android/, ~/.gradle se conserva) -> ~5-8 min
#   - Flag -Clean          -> limpia android/ y cache del perfil actual (otros perfiles intactos)
# ─────────────────────────────────────────────────────────────────────────────
echo "[5/6] Gestionando cache de proyecto nativo para perfil '$PROFILE'..."

LAST_PROFILE=$(cat "$LAST_PROFILE_FILE" 2>/dev/null || echo "")
ANDROID_DIR="$PROJECT_DIR/android"
PROFILE_CACHE_DIR="$PROJECT_DIR/.android_cache_${PROFILE}"
PREBUILD_FLAG=""

echo "   Ultimo perfil compilado: ${LAST_PROFILE:-(ninguno)}"
echo "   Perfil solicitado: $PROFILE"

if [ "$CLEAN_MODE" = "true" ]; then
  # Modo -Clean: limpiar SOLO el cache del perfil actual, respetar los demas
  echo "Modo -Clean: eliminando android/ y cache de '$PROFILE'..."
  echo "   (Los caches de OTROS perfiles se conservan intactos)"
  rm -rf "$ANDROID_DIR"
  rm -rf "$PROFILE_CACHE_DIR"
  rm -rf ~/.gradle/daemon/* 2>/dev/null || true
  rm -rf ~/.gradle/caches/* 2>/dev/null || true
  PREBUILD_FLAG="--clean"
  echo "   -> Se ejecutara prebuild completo para '$PROFILE'."

elif [ -n "$LAST_PROFILE" ] && [ "$LAST_PROFILE" != "$PROFILE" ]; then
  # Cambio de perfil detectado: swap de directorios
  echo "CAMBIO DE PERFIL: '$LAST_PROFILE' -> '$PROFILE'"

  # Guardar android/ actual bajo el nombre del perfil anterior (mv = instantaneo)
  if [ -d "$ANDROID_DIR" ]; then
    echo "   Guardando cache de '$LAST_PROFILE' -> .android_cache_${LAST_PROFILE}/ ..."
    rm -rf "$PROJECT_DIR/.android_cache_${LAST_PROFILE}"
    mv "$ANDROID_DIR" "$PROJECT_DIR/.android_cache_${LAST_PROFILE}"
    echo "   Cache de '$LAST_PROFILE' guardado."
  fi

  # Restaurar android/ del perfil destino (si existe cache previo)
  if [ -d "$PROFILE_CACHE_DIR" ]; then
    echo "   Restaurando cache de '$PROFILE' desde .android_cache_${PROFILE}/ ..."
    mv "$PROFILE_CACHE_DIR" "$ANDROID_DIR"
    PREBUILD_FLAG=""
    echo "   Cache de '$PROFILE' restaurado. El build sera rapido (~2 min)."
  else
    echo "   Primera compilacion para '$PROFILE'. Generando proyecto nativo desde cero..."
    echo "   El cache de Gradle (~/.gradle) se CONSERVA -> ~5-8 min (no 15 min)."
    PREBUILD_FLAG="--clean"
  fi

else
  # Mismo perfil o primera ejecucion
  if [ -d "$ANDROID_DIR" ]; then
    echo "Mismo perfil '$PROFILE'. Reutilizando android/ existente -> build rapido (~2 min)."
    PREBUILD_FLAG=""
  elif [ -d "$PROFILE_CACHE_DIR" ]; then
    echo "Restaurando cache de '$PROFILE' desde .android_cache_${PROFILE}/ ..."
    mv "$PROFILE_CACHE_DIR" "$ANDROID_DIR"
    PREBUILD_FLAG=""
    echo "Cache restaurado. El build sera rapido (~2 min)."
  else
    echo "No existe android/. Generando proyecto nativo desde cero..."
    PREBUILD_FLAG="--clean"
  fi
fi

if [ -n "$PREBUILD_FLAG" ]; then
  echo "   Ejecutando: npx expo prebuild --platform android $PREBUILD_FLAG"
  npx expo prebuild --platform android $PREBUILD_FLAG
  echo "Proyecto nativo generado."

  # ─── RESTAURAR OPTIMIZACIONES DE TAMAÑO ─────────────────────────────────────
  # expo prebuild --clean regenera gradle.properties con valores por defecto de
  # Expo que incluyen las 4 arquitecturas nativas (armeabi-v7a, arm64-v8a, x86,
  # x86_64). Eso duplica el tamaño de los .so nativos: ~66 MB -> ~114 MB.
  # Forzamos aqui los valores correctos justo despues del prebuild.
  GRADLE_PROPS="$ANDROID_DIR/gradle.properties"
  echo "   Optimizando gradle.properties para reducir tamaño APK..."

  # Eliminar arquitecturas de emulador (x86/x86_64) — la linea mas impactante
  sed -i 's/^reactNativeArchitectures=.*/reactNativeArchitectures=armeabi-v7a,arm64-v8a/' "$GRADLE_PROPS"

  # Habilitar minify y shrink resources para release
  if ! grep -q 'android.enableMinifyInReleaseBuilds' "$GRADLE_PROPS"; then
    echo "android.enableMinifyInReleaseBuilds=true" >> "$GRADLE_PROPS"
  else
    sed -i 's/^android.enableMinifyInReleaseBuilds=.*/android.enableMinifyInReleaseBuilds=true/' "$GRADLE_PROPS"
  fi

  if ! grep -q 'android.enableShrinkResourcesInReleaseBuilds' "$GRADLE_PROPS"; then
    echo "android.enableShrinkResourcesInReleaseBuilds=true" >> "$GRADLE_PROPS"
  else
    sed -i 's/^android.enableShrinkResourcesInReleaseBuilds=.*/android.enableShrinkResourcesInReleaseBuilds=true/' "$GRADLE_PROPS"
  fi

  # Desactivar legacyPackaging (mejora compresion de .so)
  if ! grep -q 'expo.useLegacyPackaging' "$GRADLE_PROPS"; then
    echo "expo.useLegacyPackaging=false" >> "$GRADLE_PROPS"
  else
    sed -i 's/^expo.useLegacyPackaging=.*/expo.useLegacyPackaging=false/' "$GRADLE_PROPS"
  fi

  # Ajustar JVM para el VPS (Expo suele poner 4096m pero el VPS tiene menos RAM)
  sed -i 's/^org.gradle.jvmargs=.*/org.gradle.jvmargs=-Xmx2560m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8/' "$GRADLE_PROPS"

  echo "   ✔ gradle.properties optimizado: solo arm64+armeabi, minify ON, shrink ON"
  # ─────────────────────────────────────────────────────────────────────────────
else

  echo "   Saltando prebuild para no corromper la cache nativa."
  echo "   Inyectando version desde app.json directamente en build.gradle..."
  APP_VERSION=$(node -e "console.log(require('./app.json').expo.version)")
  APP_VERSION_CODE=$(node -e "console.log(require('./app.json').expo.android.versionCode || 1)")
  if [ -f "android/app/build.gradle" ]; then
    sed -i -E "s/versionCode [0-9]+/versionCode $APP_VERSION_CODE/" android/app/build.gradle
    sed -i -E "s/versionName \"[^\"]+\"/versionName \"$APP_VERSION\"/" android/app/build.gradle
    echo "   ✔ Version actualizada a: $APP_VERSION (Código: $APP_VERSION_CODE)"
  fi
fi

echo "[6/6] Construyendo APK (Gradle Assemble) con cache..."
rm -f *.apk
cd android

# Habilitar Build Cache global para acelerar cambios entre perfiles
if ! grep -q "org.gradle.caching=true" gradle.properties; then
  echo "org.gradle.caching=true" >> gradle.properties
fi

./gradlew assembleRelease --max-workers=2 --build-cache
cd ..

APK_DIR="android/app/build/outputs/apk/release"
if ls $APK_DIR/*universal*.apk 1> /dev/null 2>&1; then
  LATEST_APK=$(ls -t $APK_DIR/*universal*.apk | head -n 1)
elif ls $APK_DIR/app-release.apk 1> /dev/null 2>&1; then
  LATEST_APK="$APK_DIR/app-release.apk"
else
  LATEST_APK=$(ls -t $APK_DIR/*.apk 2>/dev/null | head -n 1 || echo "")
fi

echo "================================================="
if [ -n "$LATEST_APK" ]; then
  APP_NAME=$(node -e "console.log(require('./app.json').expo.name.replace(/\s+/g, ''))")
  APP_VERSION=$(node -e "console.log(require('./app.json').expo.version)")

  NEW_APK_NAME="${APP_NAME}_v${APP_VERSION}_${PROFILE}_fast.apk"
  cp "$LATEST_APK" "$NEW_APK_NAME"

  # Guardar perfil actual para la proxima compilacion
  echo "$PROFILE" > "$LAST_PROFILE_FILE"
  echo "Perfil '$PROFILE' guardado para la proxima compilacion."

  echo "COMPILACION FINALIZADA EXITOSAMENTE"
  echo "APK: $NEW_APK_NAME"
else
  echo "ADVERTENCIA: Build termino pero no se encontro APK generado."
  exit 1
fi
echo "================================================="