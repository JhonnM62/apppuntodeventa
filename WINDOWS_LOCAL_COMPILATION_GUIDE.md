# Guía Automática de Compilación (Windows -> VPS)

Este archivo responde a tus preguntas sobre cómo compilar todo automáticamente desde tu PC con Windows y cómo evitar que pida contraseña utilizando llaves SSH.

## ¿Qué hacen estos scripts?
En lugar de entrar manualmente al VPS cada vez y escribir comandos, hemos creado dos scripts:
1. `scripts/compile-vps.sh`: Es el script de Linux. Se encarga de hacer el `git pull`, `npm install`, compilar usando `eas-cli`, y finalmente borrar la memoria residual para no afectar tu servidor.
2. `scripts/auto-deploy-windows.ps1`: Es el script de Windows (PowerShell). Se conecta automáticamente al VPS por SSH, ejecuta el script de Linux, busca cómo se llama el `.apk` generado y lo descarga usando SCP a tu carpeta `C:\Users\Administrador\Documents\apk's`.

---

## 🔑 PASO 1: Configurar Clave SSH (Para NO poner contraseñas)

Para que todo sea automático, Windows debe poder entrar a Ubuntu sin pedir contraseña. Para esto, abres **PowerShell** en Windows y ejecutas:

### 1.1 Generar la clave (Si no la tienes)
Ejecuta esto en PowerShell (Dale a "Enter" a todo, no escribas ninguna contraseña cuando pregunte por *passphrase*):
```powershell
ssh-keygen -t rsa -b 4096
```

### 1.2 Enviar tu clave al VPS
Ejecuta el siguiente comando en PowerShell (te pedirá la contraseña del VPS **por última vez**):
```powershell
$USER = "root"
$IP = "100.42.185.2"
cat ~/.ssh/id_rsa.pub | ssh ${USER}@${IP} "mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && chmod -R go= ~/.ssh && cat >> ~/.ssh/authorized_keys"
```
¡Listo! Ya puedes hacer `ssh root@100.42.185.2` y entrará directamente.

---

## 🚀 PASO 2: Subir el script al VPS por primera vez
Para que el script `compile-vps.sh` exista en el VPS, tienes que hacer un commit y subir estos cambios a GitHub, y luego hacer `git pull` en el VPS una vez. O puedes copiarlo usando SCP:

```powershell
scp -r C:\APIS_v2.3\puntodeventafront\scripts root@100.42.185.2:/opt/build-farm/apppuntodeventa/
```

Y darle permisos de ejecución dentro del VPS:
```powershell
ssh root@100.42.185.2 "chmod +x /opt/build-farm/apppuntodeventa/scripts/compile-vps.sh"
```

---

## ✨ PASO 3: Cómo Compilar y Descargar el APK (Con 1 solo clic)

Cada vez que quieras compilar la aplicación, simplemente abre **PowerShell** en tu Windows y ejecuta tu script:

```powershell
cd C:\APIS_v2.3\puntodeventafront\scripts
.\auto-deploy-windows.ps1
```

Si necesitas compilar un perfil específico (por ejemplo, el entorno de desarrollo), puedes pasar el parámetro `-Profile` así:

```powershell
cd C:\APIS_v2.3\puntodeventafront\scripts
.\auto-deploy-windows.ps1 -Profile development
```

*(Si PowerShell te dice "No se puede cargar el archivo porque la ejecución de scripts está deshabilitada", corre este comando una sola vez como Administrador: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`)*.

El script se conectará al VPS, compilará con el perfil especificado (o "preview" por defecto), limpiará la RAM, descargará el APK automáticamente a `C:\Users\Administrador\Documents\apk's` y terminará.

---

## 📥 PASO 4: Descargar el APK manualmente (En caso de fallo de conexión)

Si dejaste compilando la app por mucho tiempo y Windows cerró tu conexión por inactividad justo al final (error "Connection closed" o "No se pudo descargar el APK del servidor"), ¡no te preocupes! El APK sí se compiló y está a salvo en el VPS. 

Para descargarlo manualmente, solo abre PowerShell y ejecuta este comando de copia (asegúrate de incluir el `*.apk`):

```powershell
scp root@100.42.185.2:/opt/build-farm/apppuntodeventa/*.apk "C:\Users\Administrador\Documents\apk's\"
```

Esto se conectará al servidor, tomará el archivo `.apk` recién creado, y lo pegará en tu carpeta local de APKs.

---

## 📦 PASO 5: Compilar APK para Múltiples Clientes / Restaurantes

Cada cliente tiene su propio perfil definido en `eas.json`. Para compilar el APK de un cliente específico, solo debes pasar el nombre del perfil con `-Profile`:

### Cliente Principal (producción actual):
```powershell
cd C:\APIS_v2.3\puntodeventafront\scripts
.\auto-deploy-windows.ps1 -Profile preview
```

### Restaurante 2:
```powershell
cd C:\APIS_v2.3\puntodeventafront\scripts
.\auto-deploy-windows.ps1 -Profile restaurante2
```

### Agregar un nuevo cliente en el futuro:
1. Agrega el perfil en `eas.json`:
```json
"nombre_cliente": {
  "distribution": "internal",
  "env": {
    "EXPO_PUBLIC_API_URL": "https://api-nombre-cliente.autosystemprojects.site/api/v1",
    "GRADLE_OPTS": "-Dorg.gradle.jvmargs=\"-Xmx1536m -XX:MaxMetaspaceSize=512m\" -Dorg.gradle.daemon=false",
    "EAS_BUILD_MAX_WORKERS": "2"
  },
  "android": { "buildType": "apk" }
}
```
2. Compila con:
```powershell
.\auto-deploy-windows.ps1 -Profile nombre_cliente
```

Cada APK generado tendrá la URL del backend de su cliente "quemada" internamente.
