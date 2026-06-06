#!/bin/bash

# ==========================================
# Script Automático de Compilación en VPS
# ==========================================

# Variables de configuración
VPS_USER="root"
VPS_IP="100.42.185.2"
VPS_DIR="/opt/build-farm/apppuntodeventa"
LOCAL_DIR="/c/Users/Administrador/Documents/apk's"

echo "=========================================="
echo "🚀 INICIANDO COMPILACIÓN EN VPS..."
echo "=========================================="

# 1. Ejecutar comandos en el VPS a través de SSH
ssh $VPS_USER@$VPS_IP << 'EOF'
  echo "--> 📦 Preparando el repositorio..."
  cd /opt/build-farm/apppuntodeventa || exit 1
  
  echo "--> ⬇️ Descargando últimos cambios (git pull)..."
  git pull

  echo "--> 🧹 Instalando dependencias limpias..."
  npm install

  echo "--> 💀 Matando procesos Java/Gradle huérfanos antes de compilar..."
  pkill -9 -f java || true

  echo "--> ⚙️ Limpiando compilaciones anteriores (.apk)..."
  rm -f *.apk

  echo "--> 🚀 Ejecutando la compilación local (EAS Build Local)..."
  # Ejecutar de forma no interactiva para evitar que se quede esperando input
  npx eas-cli build --platform android --profile preview --local --non-interactive
EOF

echo "=========================================="
echo "📥 DESCARGANDO APK AL EQUIPO LOCAL..."
echo "=========================================="

# 2. Crear el directorio local si no existe
mkdir -p "$LOCAL_DIR"

# 3. Descargar el archivo APK usando SCP
scp $VPS_USER@$VPS_IP:$VPS_DIR/*.apk "$LOCAL_DIR/"

echo "=========================================="
echo "🧹 LIMPIANDO MEMORIA RAM Y SWAP DEL VPS..."
echo "=========================================="

# 4. Limpieza final en el VPS
ssh $VPS_USER@$VPS_IP << 'EOF'
  echo "--> 💀 Matando procesos Java/Gradle huérfanos post-compilación..."
  pkill -9 -f java || true
  
  echo "--> ♻️ Vaciando y reiniciando memoria Swap (esto toma unos segundos)..."
  sudo swapoff -a && sudo swapon -a
  
  echo "--> 🗑️ Eliminando APK del VPS para ahorrar espacio..."
  rm -f /opt/build-farm/apppuntodeventa/*.apk
EOF

echo "=========================================="
echo "✅ ¡COMPILACIÓN EXITOSA!"
echo "📂 Tu archivo APK se encuentra en: C:\Users\Administrador\Documents\apk's"
echo "=========================================="
