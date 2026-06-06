#!/bin/bash
# Script para ejecutar en el VPS que compila el APK y limpia memoria
set -e

PROJECT_DIR="/opt/build-farm/apppuntodeventa"
cd $PROJECT_DIR

echo "1. Traer ultimos cambios..."
git pull

echo "2. Instalar dependencias..."
npm install

echo "3. Compilando APK..."
npx eas-cli build --platform android --profile preview --local --non-interactive

# El APK se genera en el directorio actual o en build-*.apk
# Encontrar el nombre del APK recien creado
LATEST_APK=$(ls -t *.apk | head -n 1)

echo "APK Generado: $LATEST_APK"

echo "4. Limpiando memoria..."
pkill -9 -f java || true
sudo swapoff -a && sudo swapon -a || true

echo "COMPILACION FINALIZADA: $LATEST_APK"
