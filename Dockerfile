# syntax=docker/dockerfile:1

# Etapa 1: Construcción (Build)
FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependencias usando caché persistente de npm y lockfile estricto
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --legacy-peer-deps --ignore-scripts --no-audit --no-fund --prefer-offline

# Copiar el código fuente
COPY . .

# Construir la aplicación para web reutilizando caché de Metro entre builds
RUN --mount=type=cache,target=/tmp/metro-cache \
    NODE_OPTIONS=--max-old-space-size=2560 npx expo export -p web

# Etapa 2: Servidor Web (Nginx)
FROM nginx:alpine

# Copiar la configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los archivos estáticos generados por Expo al directorio de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/assets/favicon-fogata.png /usr/share/nginx/html/favicon-fogata.png

# Script de arranque para inyectar variables de entorno por cliente (sin recompilar)
COPY docker-entrypoint-env.sh /docker-entrypoint.d/40-env-config.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/40-env-config.sh && chmod +x /docker-entrypoint.d/40-env-config.sh

# Inyectar carga de /env-config.js y agregar type="module" al script principal
RUN sed -i 's/<script src=/<script src="\/env-config.js"><\/script><script type="module" src=/g' /usr/share/nginx/html/index.html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
