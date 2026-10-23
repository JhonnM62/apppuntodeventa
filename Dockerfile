# syntax=docker/dockerfile:1
# Etapa 1: Construcción (Build)
FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependencias reutilizando la caché persistente de npm en el host
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --legacy-peer-deps --ignore-scripts --no-audit --prefer-offline

# Copiar el código fuente y las variables de entorno
COPY . .

# Construir la aplicación para web con caché persistente de transformaciones de Metro y Babel
RUN --mount=type=cache,target=/app/node_modules/.cache \
    --mount=type=cache,target=/tmp/metro-cache \
    NODE_OPTIONS=--max-old-space-size=4096 npx expo export -p web

# Etapa 2: Servidor Web (Nginx)
FROM nginx:alpine

# Copiar la configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los archivos estáticos generados por Expo al directorio de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Agregar type="module" al script principal para soporte de import.meta
RUN sed -i 's/<script src=/<script type="module" src=/g' /usr/share/nginx/html/index.html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
