# Guía de Compilación en VPS (Build Farm Privada)

Este documento es una guía paso a paso (How-to Guide) sobre cómo utilizar tu VPS en producción como una "granja de compilación" privada para tu app de React Native (Expo). Esto es útil como "Plan B" cuando los servidores de Expo Cloud alcanzan su límite de concurrencia en la capa gratuita o cuando el entorno local (WSL/Windows) carece de recursos suficientes.

## 🎯 Objetivo
Configurar el VPS (Ubuntu/Linux) para soportar la pesada carga de compilar un `.apk` de Android sin que el servidor colapse por falta de memoria, protegiendo al mismo tiempo los servicios de producción (como NestJS y PostgreSQL) que ya corren en él.

---

## 🛠️ 1. Requisitos Previos (VPS)
Asegúrate de que tu VPS cuenta con las siguientes herramientas instaladas:
- **Node.js v20+** (Recomendado gestionarlo vía `nvm`).
- **EAS CLI** instalado globalmente: `npm install -g eas-cli`
- El repositorio del proyecto ya clonado (ej. `/opt/build-farm/apppuntodeventa`).

---

## 💻 2. Preparación del Repositorio (Local -> GitHub)
Antes de compilar, debes evitar saturar la red o el disco duro del VPS con archivos basura.
1. Configura tus archivos `.easignore` y `.gitignore` para excluir `node_modules/`, `.git/`, `.agents/`, y archivos pesados como `*.zip` o `*.apk`.
2. Sube tus últimos cambios desde tu entorno local a GitHub:
   ```bash
   git add .
   git commit -m "chore: preparacion para build vps"
   git push
   ```

---

## 🧠 3. Preparación de Memoria en el VPS (Crucial)
El proceso de compilación con Gradle (Android) requiere mucha memoria RAM. Para evitar un error `OutOfMemoryError` y que el VPS "asesine" procesos vitales, debes preparar el Swap y limitar a Java.

### 3.1 Crear Memoria Swap (4GB)
Si tu servidor aún no tiene Swap, o necesitas verificar que exista, ejecuta estos comandos en el VPS (se hace solo una vez en la vida del servidor):
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
# Hacerlo permanente tras reiniciar:
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 3.2 Limitar Memoria de Gradle y Desactivar el Daemon
Configura las reglas globales de Gradle para que respete un límite de 2GB de RAM/Swap y no deje procesos "zombies" permanentemente activos. Ejecuta en el VPS:
```bash
mkdir -p ~/.gradle
echo "org.gradle.daemon=false" > ~/.gradle/gradle.properties
echo "org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m" >> ~/.gradle/gradle.properties
echo "org.gradle.parallel=false" >> ~/.gradle/gradle.properties
```

---

## 🚀 4. Descargar y Compilar
Con el VPS blindado, procede a realizar la compilación.

```bash
# 1. Navegar a la carpeta del proyecto
cd /opt/build-farm/apppuntodeventa

# 2. Traer los últimos cambios de GitHub
git pull

# 3. Instalar dependencias limpias
npm install

# 4. Iniciar la compilación local dentro del VPS
npx eas-cli build --platform android --profile preview --local
```
*(Este proceso puede tomar entre 10 y 15 minutos. Al finalizar, mostrará `BUILD SUCCESSFUL` y la ruta del archivo `.apk` generado).*

---

## 📥 5. Transferir el APK a Windows Local
Para descargar el `.apk` recién creado desde el VPS hacia tu computadora, abre una **nueva terminal de PowerShell en tu Windows local** (no en el VPS) y utiliza el protocolo seguro de copiado (`scp`):

```powershell
# Reemplaza el nombre del archivo 'build-XXXXX.apk' por el que te arrojó EAS CLI
scp root@100.42.185.2:/opt/build-farm/apppuntodeventa/build-1778808330230.apk $env:USERPROFILE\Downloads\
```
*Esto descargará automáticamente el archivo en la carpeta "Descargas" de tu usuario de Windows.*

---

## 🧹 6. Limpieza Post-Compilación (Matar Zombies)
Aunque le dijimos a Gradle que no usara el "Daemon", en ocasiones los procesos de compilación de Java (`/usr/lib/jvm/java-17...`) se quedan congelados en segundo plano, consumiendo todo el archivo Swap y ralentizando el servidor.

Para limpiar completamente el servidor y dejar el backend de producción trabajando ligero, ejecuta esto en la terminal del VPS:

```bash
# 1. Matar a la fuerza todos los procesos huérfanos de Java/Gradle
pkill -9 -f java

# 2. Vaciar y reiniciar la memoria Swap a cero
sudo swapoff -a && sudo swapon -a
```
*(El segundo comando puede tardar de 10 a 20 segundos mientras el sistema operativo mueve la memoria hacia el disco. Al terminar, tu VPS estará completamente limpio).*
