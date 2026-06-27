#!/bin/bash
# Script para ejecutar en el VPS que compila el APK y auto-resuelve dependencias (Node 20+)
# ANTI-COLAPSO: usa trap para garantizar limpieza incluso si el build falla/OOM

PROJECT_DIR="/opt/build-farm/apppuntodeventa"
PROFILE=${1:-preview}

# ─────────────────────────────────────────────────────────────────────────────
# TRAP: Se ejecuta SIEMPRE al salir el script, sin importar si hubo error,
# OOM, Ctrl+C o cualquier otra causa. Esto es lo que evita los zombies.
# ─────────────────────────────────────────────────────────────────────────────
limpiar_al_salir() {
  local EXIT_CODE=$?
  echo ""
  echo "🧹 [TRAP] Ejecutando limpieza garantizada (código de salida: $EXIT_CODE)..."
  pkill -9 -f gradle       2>/dev/null || true
  pkill -9 -f java         2>/dev/null || true
  pkill -9 -f "eas-cli"   2>/dev/null || true
  pkill -9 -f "metro"      2>/dev/null || true
  rm -rf /opt/build-farm/eas-tmp 2>/dev/null || true
  sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
  if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ [TRAP] Limpieza post-compilación exitosa."
  else
    echo "❌ [TRAP] El build falló (código $EXIT_CODE). Servidor limpio y listo para el próximo intento."
  fi
}
trap limpiar_al_salir EXIT

# A partir de aquí, set -e: si algo falla, el trap se encarga de limpiar
set -e

echo "================================================="
echo "   INICIANDO GRANJA DE COMPILACIÓN EN VPS        "
echo "   Perfil: $PROFILE                              "
echo "================================================="

echo "[0/7] Limpiando servidor (procesos colgados, RAM, cachés)..."
# 1. Matar procesos huérfanos de compilaciones fallidas anteriores
pkill -9 -f gradle    2>/dev/null || true
pkill -9 -f java      2>/dev/null || true
pkill -9 -f "eas-cli" 2>/dev/null || true
pkill -9 -f "expo"    2>/dev/null || true
pkill -9 -f "metro"   2>/dev/null || true

# 2. Limpiar cachés pesados y temporales
rm -rf ~/.gradle/daemon/* || true
rm -rf /opt/build-farm/eas-tmp || true

# 3. Liberar PageCache, dentries e inodes
sync; echo 3 > /proc/sys/vm/drop_caches || true

# 4. Verificar RAM libre antes de empezar (advertencia si hay menos de 800 MB libres)
RAM_FREE=$(free -m | awk '/^Mem:/ {print $7}')
echo "   RAM disponible antes del build: ${RAM_FREE} MB"
if [ "$RAM_FREE" -lt 800 ]; then
  echo "⚠️  ADVERTENCIA: Solo ${RAM_FREE} MB de RAM libre. El build puede ser inestable."
fi

echo "✅ Limpieza inicial completada. Servidor listo y fresco."

echo "[1/7] Verificando versión de Node.js..."
NODE_VER=$(node -v 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")
if [ "$NODE_VER" -lt 20 ]; then
    echo "⚠️ Node.js antigua (v$NODE_VER). Actualizando a Node 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo "✅ Node.js actualizado."
else
    echo "✅ Node.js v$NODE_VER — OK."
fi

echo "[2/7] Verificando eas-cli global..."
if ! command -v eas &> /dev/null; then
    echo "⚠️ eas-cli no instalado. Instalando..."
    npm install -g eas-cli
    echo "✅ eas-cli instalado."
else
    echo "✅ eas-cli — OK."
fi

# Variables de entorno del Android SDK
export ANDROID_HOME="/opt/build-farm/android-sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "❌ El directorio $PROJECT_DIR no existe."
  exit 1
fi

cd "$PROJECT_DIR"

echo "[3/7] Verificando Java 17 y Swap..."
# Java 17
if ! command -v java &> /dev/null || ! java -version 2>&1 | grep -q '17\.'; then
    echo "⚠️ Java 17 no encontrado. Instalando..."
    apt-get update && apt-get install -y openjdk-17-jdk unzip wget
    echo "✅ Java 17 instalado."
else
    echo "✅ Java 17 — OK."
fi

# Android SDK
if [ ! -d "$ANDROID_HOME/cmdline-tools/latest/bin" ]; then
    echo "⚠️ Android SDK no encontrado. Instalando..."
    mkdir -p "$ANDROID_HOME/cmdline-tools"
    cd "$ANDROID_HOME/cmdline-tools"
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O cmdline-tools.zip
    unzip -q cmdline-tools.zip
    mv cmdline-tools latest
    rm cmdline-tools.zip
    yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null
    "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platform-tools" "platforms;android-34" "build-tools;34.0.0" > /dev/null
    echo "✅ Android SDK instalado."
    cd "$PROJECT_DIR"
fi

# Swap: solo crear si no hay suficiente Y si el archivo no existe aún
SWAP_TOTAL=$(free -m | awk '/^Swap:/ {print $2}')
if [ "$SWAP_TOTAL" -lt 3000 ]; then
    echo "⚠️ Swap insuficiente (${SWAP_TOTAL} MB). Creando Swap de 4 GB..."
    # Si ya existe un /swapfile activo, desactivarlo primero
    swapoff /swapfile 2>/dev/null || true
    rm -f /swapfile
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo "✅ Swap expandida a 4 GB."
else
    echo "✅ Swap ${SWAP_TOTAL} MB — OK."
fi

echo "[4/7] Actualizando código fuente..."
git reset --hard
git pull
echo "✅ Código actualizado."

echo "[5/7] Instalando dependencias NPM..."
npm install || {
  echo "⚠️ npm install falló. Limpiando y reintentando..."
  npm cache clean --force
  rm -rf node_modules package-lock.json
  npm install
}
echo "✅ Dependencias instaladas."

echo "[6/7] Construyendo APK (EAS Build Local)..."
rm -f *.apk

# Límites de memoria para Gradle y Node
export GRADLE_OPTS="-Xmx2048m -Dorg.gradle.daemon=false -Dorg.gradle.jvmargs='-Xmx2048m -XX:MaxMetaspaceSize=512m'"
export NODE_OPTIONS="--max-old-space-size=4096"

# Directorio temporal en disco (fuera del proyecto para evitar EINVAL)
export TMPDIR="/opt/build-farm/eas-tmp"
mkdir -p "$TMPDIR"

npx eas-cli build --platform android --profile "$PROFILE" --local --non-interactive

LATEST_APK=$(ls -t *.apk 2>/dev/null | head -n 1 || echo "")

echo "================================================="
if [ -n "$LATEST_APK" ]; then
  echo "✅ COMPILACIÓN FINALIZADA: $LATEST_APK"
else
  echo "⚠️  Build terminó pero no se encontró APK generado."
fi
echo "================================================="
# El trap limpiar_al_salir se ejecuta automáticamente aquí
