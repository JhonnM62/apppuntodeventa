#!/bin/bash
# Script para ejecutar en el VPS que compila el APK y auto-resuelve dependencias (Node 20+)
set -e

PROJECT_DIR="/opt/build-farm/apppuntodeventa"
PROFILE=${1:-preview}

echo "================================================="
echo "   INICIANDO GRANJA DE COMPILACIÓN EN VPS        "
echo "   Perfil: $PROFILE                              "
echo "================================================="

echo "[1/6] Verificando versión de Node.js..."
NODE_VER=$(node -v 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")
if [ "$NODE_VER" -lt 20 ]; then
    echo "⚠️ Versión de Node.js antigua o no instalada detectada (v$NODE_VER). Actualizando a Node 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo "✅ Node.js actualizado exitosamente."
else
    echo "✅ Node.js v$NODE_VER detectado. Todo bien."
fi

echo "[2/6] Verificando eas-cli global..."
if ! command -v eas &> /dev/null; then
    echo "⚠️ eas-cli no está instalado. Instalando globalmente..."
    npm install -g eas-cli
    echo "✅ eas-cli instalado."
fi

# Cargar variables de entorno del SDK (por si acaso)
export ANDROID_HOME="/opt/build-farm/android-sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "⚠️ El directorio $PROJECT_DIR no existe. Asegúrate de haber clonado el repositorio primero."
  exit 1
fi

cd $PROJECT_DIR

echo "[3/6] Verificando Java 17 y Memoria RAM (Swap)..."
# 1. Chequear Java 17
if ! command -v java &> /dev/null || ! java -version 2>&1 | grep -q '17\.'; then
    echo "⚠️ Java 17 no encontrado. Instalando OpenJDK 17..."
    apt-get update && apt-get install -y openjdk-17-jdk unzip wget
    echo "✅ Java 17 instalado."
fi

# 1.5 Chequear Android SDK
if [ ! -d "$ANDROID_HOME/cmdline-tools/latest/bin" ]; then
    echo "⚠️ Android SDK no encontrado en $ANDROID_HOME. Instalando herramientas..."
    mkdir -p "$ANDROID_HOME/cmdline-tools"
    cd "$ANDROID_HOME/cmdline-tools"
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O cmdline-tools.zip
    unzip -q cmdline-tools.zip
    mv cmdline-tools latest
    rm cmdline-tools.zip
    
    echo "Aceptando licencias e instalando paquetes de Android..."
    yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null
    "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platform-tools" "platforms;android-34" "build-tools;34.0.0" > /dev/null
    echo "✅ Android SDK instalado."
    cd "$PROJECT_DIR"
fi

# 2. Chequear y crear Swap de 4GB si no existe (Evita que Gradle explote por falta de RAM)
SWAP_TOTAL=$(free -m | awk '/^Swap:/ {print $2}')
if [ "$SWAP_TOTAL" -lt 3000 ]; then
    echo "⚠️ Memoria Swap insuficiente ($SWAP_TOTAL MB). Creando un archivo Swap temporal de 4GB para Gradle..."
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile || true
    swapon /swapfile || true
    echo "✅ Memoria virtual Swap expandida a 4GB."
fi

echo "[4/6] Actualizando código fuente (git pull)..."
git reset --hard
git pull

echo "[5/6] Instalando dependencias de NPM..."
# Intentar instalación normal. Si falla, limpiar caché y reinstalar forzado.
npm install || { 
  echo "⚠️ Falló la instalación de paquetes. Limpiando caché y reintentando..."
  npm cache clean --force
  rm -rf node_modules package-lock.json
  npm install
}

echo "[6/6] Construyendo APK (EAS Build Local)..."
# Borramos APKs viejos para evitar confusiones
rm -f *.apk
# Forzamos límite de RAM en Gradle para que no colapse el VPS
export GRADLE_OPTS="-Xmx2048m -Dorg.gradle.daemon=false -Dorg.gradle.jvmargs='-Xmx2048m -XX:MaxMetaspaceSize=512m'"
# Definir directorio temporal en disco (no en /tmp que puede ser tmpfs/RAM)
# Debe estar FUERA del directorio del proyecto para evitar error de recursión (EINVAL al copiar)
EAS_TMP_DIR="/opt/build-farm/eas-tmp"
rm -rf "$EAS_TMP_DIR"
mkdir -p "$EAS_TMP_DIR"
export TMPDIR="$EAS_TMP_DIR"
# Ajustar variable de entorno adicional para Node
export NODE_OPTIONS="--max-old-space-size=4096"
npx eas-cli build --platform android --profile "$PROFILE" --local --non-interactive

LATEST_APK=$(ls -t *.apk | head -n 1)

echo "[7/7] Limpiando procesos pesados de RAM..."
pkill -9 -f java || true

echo "================================================="
echo "✅ COMPILACIÓN FINALIZADA: $LATEST_APK"
echo "================================================="
