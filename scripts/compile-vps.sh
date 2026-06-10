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

echo "[3/6] Instalando dependencias de NPM..."
# Intentar instalación normal. Si falla, limpiar caché y reinstalar forzado.
npm install || { 
  echo "⚠️ Falló la instalación de paquetes. Limpiando caché y reintentando..."
  npm cache clean --force
  rm -rf node_modules package-lock.json
  npm install
}

echo "[4/6] Construyendo APK (EAS Build Local)..."
# Borramos APKs viejos para evitar confusiones
rm -f *.apk
npx eas-cli build --platform android --profile "$PROFILE" --local --non-interactive

LATEST_APK=$(ls -t *.apk | head -n 1)

echo "[5/6] Limpiando memoria RAM residual..."
pkill -9 -f java || true
swapoff -a && swapon -a || true

echo "================================================="
echo "✅ COMPILACIÓN FINALIZADA: $LATEST_APK"
echo "================================================="
