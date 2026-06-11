# Etapa 1: Construcción (Build)
FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copiar el código fuente y las variables de entorno
COPY . .

# === DIAGNÓSTICO: verificar qué tiene el .env antes del build ===
RUN echo "=== DEBUG: Contenido de .env ===" && cat .env && echo "=== FIN DEBUG ==="

# Construir la aplicación para web
RUN npx expo export -p web

# === DIAGNÓSTICO: verificar que la URL quedó embebida en el JS final ===
RUN echo "=== DEBUG: Buscando URL en JS compilado ===" && grep -o 'https://[^"]*' /app/dist/_expo/static/js/web/*.js | head -5 || echo "NO SE ENCONTRÓ NINGUNA URL HTTPS"
RUN echo "=== DEBUG: Buscando localhost en JS compilado ===" && grep -c 'localhost:3000' /app/dist/_expo/static/js/web/*.js && echo "ALERTA: localhost ENCONTRADO en el bundle" || echo "OK: localhost NO encontrado"

# Etapa 2: Servidor Web (Nginx)
FROM nginx:alpine

# Copiar la configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los archivos estáticos generados por Expo al directorio de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Solucionar error de import.meta agregando type="module" al script principal
RUN sed -i 's/<script src=/<script type="module" src=/g' /usr/share/nginx/html/index.html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
