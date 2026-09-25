#!/bin/bash
# Script FAST para ejecutar en el VPS que compila el APK y reutiliza caché (Docker-style)
# ANTI-COLAPSO: usa trap para garantizar limpieza incluso si el build falla/OOM

PROJECT_DIR="/opt/build-farm/apppuntodeventa"
PROFILE=${1:-preview}
CLEAN_MODE=${2:-false}

# ─────────────────────────────────────────────────────────────────────────────
# TRAP: Limpieza de RAM sin destruir la carpeta android/ para conservar caché
# ─────────────────────────────────────────────────────────────────────────────
limpiar_al_salir() {
  local EXIT_CODE=$?
  echo ""
  echo "🧹 [TRAP] Ejecutando limpieza garantizada (código de salida: $EXIT_CODE)..."
  pkill -9 -f gradle       2>/dev/null || true
  pkill -9 -f java         2>/dev/null || true
  pkill -9 -f "metro"      2>/dev/null || true
  sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
  if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ [TRAP] Limpieza post-compilación exitosa."
  else
    echo "❌ [TRAP] El build falló (código $EXIT_CODE). Servidor limpio y listo para el próximo intento."
    echo "💡 Si el error parece ser corrupción del caché, usa el parámetro -Clean desde tu PC."
  fi
}
trap limpiar_al_salir EXIT

set -e

echo "================================================="
echo "   INICIANDO GRANJA DE COMPILACIÓN (FAST MODE)   "
echo "   Perfil: $PROFILE                              "
if [ "$CLEAN_MODE" = "true" ] || [ "$CLEAN_MODE" = "-Clean" ]; then
echo "   MODO LIMPIEZA FORZADA ACTIVADO (-Clean)       "
  CLEAN_MODE="true"
fi
echo "================================================="

# 1. Matar procesos colgados
pkill -9 -f gradle    2>/dev/null || true
pkill -9 -f java      2>/dev/null || true
pkill -9 -f "expo"    2>/dev/null || true
pkill -9 -f "metro"   2>/dev/null || true

# 2. Manejo de -Clean (Limpieza total)
if [ "$CLEAN_MODE" = "true" ]; then
  echo "🧹 Borrando cachés destructivos..."
  rm -rf ~/.gradle/daemon/* || true
  rm -rf ~/.gradle/caches/* || true
  rm -rf "$PROJECT_DIR/android" || true
fi

# 3. Liberar PageCache
sync; echo 3 > /proc/sys/vm/drop_caches || true

# 4. Verificar RAM libre
RAM_FREE=$(free -m | awk '/^Mem:/ {print $7}')
echo "   RAM disponible antes del build: ${RAM_FREE} MB"
if [ "$RAM_FREE" -lt 800 ]; then
  echo "⚠️  ADVERTENCIA: Solo ${RAM_FREE} MB de RAM libre. El build puede ser inestable."
fi

echo "[1/6] Verificando entorno básico..."
NODE_VER=$(node -v 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")
if [ "$NODE_VER" -lt 20 ]; then
    echo "⚠️ Node.js antigua (v$NODE_VER). Actualizando a Node 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

if ! command -v java &> /dev/null || ! java -version 2>&1 | grep -q '17\.'; then
    echo "⚠️ Java 17 no encontrado. Instalando..."
    apt-get update && apt-get install -y openjdk-17-jdk unzip wget
fi

export ANDROID_HOME="/opt/build-farm/android-sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "❌ El directorio $PROJECT_DIR no existe."
  exit 1
fi

cd "$PROJECT_DIR"

echo "[2/6] Actualizando código fuente..."
git reset --hard
git pull
echo "✅ Código actualizado."

echo "[3/6] Instalando dependencias NPM..."
npm install || {
  echo "⚠️ npm install falló. Limpiando y reintentando..."
  npm cache clean --force
  rm -rf node_modules package-lock.json
  npm install
}
echo "✅ Dependencias instaladas."

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

# Asegurar límites de memoria y workers si no fueron definidos en eas.json
export GRADLE_OPTS="${GRADLE_OPTS:-"-Xmx2048m -Dorg.gradle.daemon=false -Dorg.gradle.jvmargs='-Xmx2048m -XX:MaxMetaspaceSize=512m'"}"
export NODE_OPTIONS="--max-old-space-size=4096"
export EAS_BUILD_MAX_WORKERS="${EAS_BUILD_MAX_WORKERS:-2}"

echo "[5/6] Generando proyecto nativo (Expo Prebuild)..."
if [ "$CLEAN_MODE" = "true" ]; then
  npx expo prebuild --platform android --clean
else
  npx expo prebuild --platform android
fi

echo "[6/6] Construyendo APK (Gradle Assemble) con caché..."
rm -f *.apk
cd android
./gradlew assembleRelease
cd ..

LATEST_APK=$(ls -t android/app/build/outputs/apk/release/*.apk 2>/dev/null | head -n 1 || echo "")

echo "================================================="
if [ -n "$LATEST_APK" ]; then
  APP_NAME=$(node -e "console.log(require('./app.json').expo.name.replace(/\s+/g, ''))")
  APP_VERSION=$(node -e "console.log(require('./app.json').expo.version)")
  
  NEW_APK_NAME="${APP_NAME}_v${APP_VERSION}_${PROFILE}_fast.apk"
  cp "$LATEST_APK" "$NEW_APK_NAME"
  
  echo "✅ COMPILACIÓN FINALIZADA EXITOSAMENTE"
  echo "📦 APK: $NEW_APK_NAME"
else
  echo "⚠️  Build terminó pero no se encontró APK generado."
  exit 1
fi
echo "================================================="
