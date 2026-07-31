# Plan de Implementacion Seguro - Multi-Cliente

## Regla de Oro
El despliegue actual del Cliente 1 (produccion) se mantiene **intacto**. La nueva automatizacion aplica unicamente para el Cliente 2 en adelante.

---

## Paso a Paso: Como agregar un cliente nuevo

### 1. Crear la base de datos en el VPS
`ash
docker exec -it <nombre_contenedor_postgres> psql -U postgres -c "CREATE DATABASE qhubomor_restaurante2;"
`

### 2. Crear secretos en GitHub

**Repositorio Backend** -> Settings > Secrets and variables > Actions:
- Nombre: `ENV_BACKEND_RESTAURANTE2`
- Valor:
`.env
DATABASE_URL="postgresql://usuario:contrasena@IP_VPS:5432/qhubomor_restaurante2?schema=public"
JWT_SECRET="clave_secreta_unica_restaurante2"
PORT=3000
`

**Repositorio Frontend** -> Settings > Secrets and variables > Actions:
- Nombre: `ENV_FRONTEND_RESTAURANTE2`
- Valor: Variables adicionales del frontend (puede quedar vacio si no hay mas)

### 3. Agregar 1 linea al deploy.yml del Backend
`ash
deploy_new_client "restaurante2" 8071 "api-restaurante2.autosystemprojects.site" "${{ secrets.ENV_BACKEND_RESTAURANTE2 }}"
`

### 4. Agregar 1 linea al deploy.yml del Frontend Web
`ash
deploy_new_client_web "restaurante2" 8072 "app-restaurante2.autosystemprojects.site" "https://api-restaurante2.autosystemprojects.site/api/v1" "${{ secrets.ENV_FRONTEND_RESTAURANTE2 }}"
`

### 5. Agregar perfil en eas.json (APK Android)
`json
"restaurante2": {
  "distribution": "internal",
  "env": {
    "EXPO_PUBLIC_API_URL": "https://api-restaurante2.autosystemprojects.site/api/v1",
    "GRADLE_OPTS": "-Dorg.gradle.jvmargs=\"-Xmx1536m -XX:MaxMetaspaceSize=512m\" -Dorg.gradle.daemon=false",
    "EAS_BUILD_MAX_WORKERS": "2"
  },
  "android": { "buildType": "apk" }
}
`
Comando para compilar el APK:
`ash
eas build -p android --profile restaurante2
`

### 6. Git Push -> Despliegue Automatico
Al hacer push, GitHub Actions:
1. Reconstruye la imagen Docker con el nuevo codigo.
2. Reinicia el contenedor del cliente existente (produccion).
3. Levanta los contenedores del nuevo cliente (backend + frontend).
4. Ejecuta `prisma db push` para crear la estructura en la nueva BD.
5. Llama al script `setup-nginx.sh` para crear el subdominio + SSL automaticamente.

### 7. (Opcional) Copiar datos de produccion a la nueva BD
`ash
node scripts/copiar_datos.js
`

---

## Correo Certbot
jonnymejia62@gmail.com

## Puertos actuales en uso
- Backend produccion: 8061
- Frontend web produccion: 8062
- Backend restaurante2: 8071
- Frontend web restaurante2: 8072
