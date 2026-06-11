# Etapa 1: Construcción (Build)
FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copiar el código fuente y las variables de entorno
COPY . .

# Construir la aplicación para web
RUN npx expo export -p web

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
