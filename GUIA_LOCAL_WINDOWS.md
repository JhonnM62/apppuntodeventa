# Guía de Compilación Automática (Local Windows -> VPS)

Esta guía explica cómo ejecutar la compilación de la app utilizando el script `build_vps.sh` desde tu computadora Windows, dejando que el VPS haga todo el trabajo pesado.

## Requisito: Usar Git Bash
Para ejecutar estos comandos en Windows, debes abrir la terminal de **Git Bash** (no usar CMD ni PowerShell estándar, ya que el archivo es `.sh`).

---

## PASO 1: Configurar el Login Automático (Solo una vez)
Como ya tienes una clave SSH generada en tu Windows, solo debes "copiarla" al VPS para que no te vuelva a pedir contraseña nunca más al conectarse.

Abre **Git Bash** en la carpeta de tu proyecto y ejecuta:

```bash
ssh-copy-id root@100.42.185.2
```

> **Nota:** Te pedirá la contraseña del VPS por última vez. Una vez introducida, tu computadora quedará autorizada permanentemente.

---

## PASO 2: Antes de Compilar (Subir Código)
Dado que el VPS descarga tu código desde GitHub para compilarlo, siempre asegúrate de subir tus últimos cambios locales antes de correr el script:

```bash
git add .
git commit -m "preparando apk"
git push
```

---

## PASO 3: Iniciar Compilación Mágica
Una vez que el código esté en GitHub, simplemente ejecuta el script automatizado desde **Git Bash**:

```bash
bash build_vps.sh
```

### ¿Qué hará este script automáticamente?
1. Se conectará al VPS de forma transparente (sin pedir contraseña).
2. Descargará los cambios de GitHub al VPS.
3. Instalará dependencias y borrará procesos atascados.
4. Compilará tu APK usando la potencia del servidor.
5. Descargará el `.apk` terminado directamente a tu carpeta local de `Documentos\apk's`.
6. Limpiará la memoria del servidor para mantener tu VPS corriendo rápido.

¡Listo! Cuando el script termine, ve a `Documentos\apk's` y encontrarás tu aplicación lista.
