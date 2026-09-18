# Guía para Crear la Tercera Aplicación (Fogata)

¡Hola! Tu sistema de despliegue ("Fábrica de Clientes") está excelentemente diseñado. Para crear la **tercera aplicación (Fogata)**, no tienes que crear repositorios nuevos ni hacer nada raro. Solo sigue estos 5 pasos exactos:

## Paso 1: Crear la Base de Datos (en tu VPS / Servidor)
Como ya tienes el `postgres-restaurante2` en el puerto `8004`, para este crearemos el `postgres-fogata` en el puerto **`8005`**. Ejecuta este comando en la terminal de tu servidor (donde tomaste la foto del fondo negro):

```bash
docker run -d --name postgres-fogata -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=jonnyca237 -e POSTGRES_DB=qhubomor_fogata -p 8005:5432 -v /root/postgres-fogata/data:/var/lib/postgresql/data --restart unless-stopped postgres:latest
```

---

## Paso 2: Configurar el Backend (En GitHub)

1. Ve al repositorio de tu **Backend** en GitHub (`backend-nest-js-qhubomor`) > Settings > Secrets and variables > Actions.
2. Haz clic en **"New repository secret"**.
3. **Name:** `ENV_BACKEND_FOGATA`
4. **Secret (Valor):** Copia el contenido del `.env` que normalmente usas para tu backend, **PERO asegúrate de cambiar la URL de la base de datos** para que apunte al puerto `8005` y a la nueva BD. Debe verse algo como esto:
   ```env
   PORT=3000
   DATABASE_URL="postgresql://postgres:jonnyca237@<IP_DE_TU_SERVIDOR>:8005/qhubomor_fogata?schema=public"
   JWT_SECRET="TU_SECRETO_SEGURO"
   # ... (el resto de tus variables como Cloudinary, etc.)
   ```
5. Ahora, en el código fuente de tu Backend, abre el archivo `.github/workflows/deploy.yml` y ve hasta la última línea. Copia y pega esto justo debajo de `restaurante2`:
   ```yaml
            deploy_new_client \
              "fogata" \
              "8081" \
              "api-fogata.autosystemprojects.site" \
              "${{ secrets.ENV_BACKEND_FOGATA }}"
   ```
6. Guarda (haz commit y push) en la rama `main`. ¡El backend se desplegará automáticamente!

---

## Paso 3: Configurar el Frontend Web (En GitHub)

1. Ve al repositorio de tu **Frontend** en GitHub (`apppuntodeventa`) > Settings > Secrets and variables > Actions.
2. Haz clic en **"New repository secret"**.
3. **Name:** `ENV_FRONTEND_FOGATA`
4. **Secret (Valor):** Aquí puedes pegar las variables extras que use tu frontend (como los tokens de Pusher, Cloudinary, etc., pero sin la API_URL porque esa se inyecta sola). *Si no usas variables extras, simplemente pon un espacio o algo genérico, o pega el mismo contenido de tu ENV_FILE_CONTENT normal (sin la API_URL)*.
5. En el código fuente del Frontend, abre `.github/workflows/deploy.yml` y ve hasta la última línea. Pega esto debajo de `restaurante2`:
   ```yaml
            deploy_new_client_web \
              "fogata" \
              "8082" \
              "app-fogata.autosystemprojects.site" \
              "https://api-fogata.autosystemprojects.site/api/v1" \
              "${{ secrets.ENV_FRONTEND_FOGATA }}"
   ```
6. Guarda (haz commit y push) en la rama `main`. ¡El frontend se desplegará automáticamente!

---

## Paso 4: DNS (Dominios)
Asegúrate de ir a tu proveedor de dominios (donde compraste `autosystemprojects.site`) y crear los dos registros tipo "A" apuntando a la IP de tu servidor:
* `api-fogata.autosystemprojects.site`
* `app-fogata.autosystemprojects.site`

---

## Paso 5: Configurar la APK (Android)

Para generar una APK independiente (para que no sobreescriba las otras apps en el mismo celular), debes editar dos archivos en tu código frontend:

**1. Archivo `app.config.js`:**
Debes agregar un bloque `if` para tu nueva app antes del `return config;` final. Por ejemplo:
```javascript
  if (process.env.APP_VARIANT === 'fogata') {
    return {
      ...config,
      name: "Fogata POS",
      android: {
        ...config.android,
        package: "com.anonymous.fogata"
      }
    };
  }
```
*(Nota: La primera aplicación "Granizados" no necesita bloque `if` porque utiliza los datos por defecto que vienen en el archivo `app.json`. Las apps adicionales sí necesitan su propio bloque).*

**2. Archivo `eas.json`:**
Agrega un nuevo perfil (ej. `"fogata"`) dentro del bloque `"build"`, copiándolo de uno existente y cambiando el `APP_VARIANT` y la URL:
```json
    "fogata": {
      "extends": "production",
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api-fogata.autosystemprojects.site/api/v1",
        "NODE_OPTIONS": "--max-old-space-size=4096",
        "EAS_BUILD_MAX_WORKERS": "2",
        "APP_VARIANT": "fogata"
      },
      "android": {
        "buildType": "apk"
      }
    }
```

## Paso 6: Generar la APK
Una vez guardados esos dos archivos, abres la consola en el frontend y ejecutas:
```bash
eas build -p android --profile fogata
```

¡Y eso es todo! Tu script automático que instaló `n8n` y `nginx` generará los SSL gratis de la web y tendrás tu nueva APK lista para instalar.
