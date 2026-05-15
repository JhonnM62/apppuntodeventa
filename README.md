# Q'hubo Mor POS - App Móvil

Aplicación móvil en React Native para el sistema de punto de venta Q'hubo Mor, diseñada para conectarse al backend documentado y replicar la interfaz web con una experiencia optimizada para dispositivos móviles.

## Stack Tecnológico

- **Framework**: React Native (con Expo)
- **Navegación**: React Navigation (Stack y Bottom Tabs)
- **Estado**: Zustand
- **Peticiones HTTP**: Axios
- **Formularios**: React Hook Form + Yup
- **Listas**: FlashList (Shopify) para alto rendimiento
- **Pruebas**: Jest + Testing Library React Native

## Requisitos Previos

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Emulador de Android / Simulador de iOS, o un dispositivo físico con Expo Go.
- El backend (`puntodeventabackend`) debe estar ejecutándose en `localhost:3000` (o accesible vía IP de la red).

## Instalación

1. Clona el repositorio y navega al directorio del frontend:
   ```bash
   cd C:\APIS_v2.3\puntodeventafront
   ```

2. Instala las dependencias:
   ```bash
   npm install --legacy-peer-deps
   ```
   *Nota: Usamos `--legacy-peer-deps` para evitar conflictos de versiones con dependencias secundarias en React 19 / Expo.*

## Configuración del API

La URL del backend se gestiona mediante variables de entorno. Crea o edita el archivo `.env` en la raíz del proyecto:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
```

Para un dispositivo físico en tu red local, usa la IP de tu computadora:
```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:3000/api/v1
```

> **Nota**: Si tu IP cambia frecuentemente, considera usar un dominio local (ej. `http://qhubomor.local:3000/api/v1`) o actualizar el archivo `.env` cada vez que reinicies el router.

## Scripts Disponibles

- **Iniciar en desarrollo**: `npm start`
- **Iniciar Android**: `npm run android`
- **Iniciar iOS**: `npm run ios`
- **Ejecutar Pruebas**: `npm test`

## Estructura del Proyecto

```
src/
├── components/   # Componentes UI reutilizables (Button, Input) y pruebas unitarias
├── navigation/   # Configuración de React Navigation
├── screens/      # Pantallas de la aplicación (Auth, Home, Sales)
├── services/     # Cliente Axios y servicios de API (auth, etc)
├── store/        # Estado global con Zustand
├── theme/        # Colores y variables de diseño compartidas
└── utils/        # Funciones utilitarias
```

## Características Implementadas

1. **Autenticación**: Login funcional que persiste la sesión usando `AsyncStorage`.
2. **Inicio (Menú Grid)**: Interfaz principal replicando el diseño 3D con colores primarios usando un grid de alto rendimiento (`FlashList`).
3. **Registro de Ventas**: Interfaz para buscar productos, ver catálogo con precios, agregar a un carrito temporal y proceder al cobro.
4. **Validación y Manejo de Errores**: Feedback visual en inputs y manejo de errores de red global mediante interceptores en Axios.

## Licencia

MIT
