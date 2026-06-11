# Etapa 1: Construcción (Build)
FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copiar el código fuente y las variables de entorno
COPY . .

# === DIAGNÓSTICO: verificar qué tiene el .env ===
RUN echo "=== DEBUG: Contenido de .env ===" && cat .env && echo "=== FIN DEBUG ==="

# Construir la aplicación para web
RUN npx expo export -p web

# === DIAGNÓSTICO DEFINITIVO ===
# Test 1: ¿process.env.EXPO_PUBLIC sigue como texto literal en el JS? (Si >0, babel NO lo reemplazó)
RUN echo "=== TEST 1: process.env.EXPO_PUBLIC en bundle ===" && \
    grep -c 'process\.env\.EXPO_PUBLIC' /app/dist/_expo/static/js/web/*.js || echo "RESULTADO: 0 ocurrencias (babel SÍ lo reemplazó)"

# Test 2: ¿Cuántas veces aparece localhost:3000? 
RUN echo "=== TEST 2: localhost:3000 en bundle ===" && \
    grep -c 'localhost:3000' /app/dist/_expo/static/js/web/*.js || echo "RESULTADO: 0 ocurrencias"

# Test 3: ¿Aparece el dominio del backend? (parcial, no se enmascara)
RUN echo "=== TEST 3: backendnestpv en bundle ===" && \
    grep -c 'backendnestpv' /app/dist/_expo/static/js/web/*.js || echo "RESULTADO: 0 ocurrencias"

# Test 4: ¿Aparece autosystemprojects en bundle?
RUN echo "=== TEST 4: autosystemprojects en bundle ===" && \
    grep -c 'autosystemprojects' /app/dist/_expo/static/js/web/*.js || echo "RESULTADO: 0 ocurrencias"

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
