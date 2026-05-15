# WebSockets Usage Guide - ERP Q'hubo Mor

## Tabla de Contenidos
1. [Visión General](#visión-general)
2. [Arquitectura](#arquitectura)
3. [Agregar un Nuevo Módulo](#agregar-un-nuevo-módulo)
4. [Ejemplo Práctico: Módulo de Insumos](#ejemplo-práctico-módulo-de-insumos)
5. [Referencia de APIs](#referencia-de-apis)

---

## Visión General

Este sistema de WebSockets permite comunicación en tiempo real entre el backend (NestJS) y el frontend (React Native/Expo) para mantener sincronizados todos los dispositivos del ERP.

### Características Principales
- **Reconexión automática** con backoff exponencial
- **Rooms dinámicos** para separar tráfico por módulo
- **Tipado estricto** con TypeScript
- **Cleanup automático** de eventos para evitar memory leaks

---

## Arquitectura

### Estructura de Archivos

```
packages/
└── socket-types/              # Tipos compartidos
    └── src/index.ts

puntodeventabackend/
└── src/
    └── websocket/
        ├── app.gateway.ts     # Gateway principal
        └── websocket.module.ts

puntodeventafront/
└── src/
    ├── context/
    │   └── SocketContext.tsx # Provider global
    ├── hooks/
    │   ├── useSocket.ts      # Hook principal
    │   ├── useSocketEvent.ts # Para escuchar eventos
    │   └── useSocketEmitter.ts # Para emitir eventos
    └── types/
        └── socket.types.ts    # Copia local de tipos
```

### Flujo de Datos

```
┌─────────────┐    nuevaOrden    ┌─────────────┐
│   Frontend  │ ──────────────► │   Backend   │
│  (Emitter)  │                 │  (Gateway)  │
└─────────────┘                 └──────┬──────┘
                                       │
                    to(kitchen)         │         to(caja)
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
              ┌───────────┐                         ┌───────────┐
              │  Kitchen  │                         │   Caja    │
              │  (Room)   │                         │  (Room)   │
              └───────────┘                         └───────────┘
```

---

## Agregar un Nuevo Módulo

### Pasos Generales

1. **Backend:**
   - Agregar el nuevo evento en `packages/socket-types/src/index.ts`
   - Agregar el nuevo Room en el enum `Room`
   - Implementar handler en `app.gateway.ts`
   - Agregar método helper para emitir al nuevo room

2. **Frontend:**
   - Agregar tipos en `src/types/socket.types.ts`
   - Crear hooks específicos del módulo (opcional)
   - Usar `useSocketEvent` y `useSocketEmitter` en las pantallas

---

## Ejemplo Práctico: Módulo de Insumos

A continuación, un ejemplo completo de cómo implementar actualizaciones en tiempo real para el módulo de **Insumos**.

### Paso 1: Agregar Tipos Compartidos

Edita `packages/socket-types/src/index.ts`:

```typescript
// Agregar nuevo evento al enum SocketEvent
export enum SocketEvent {
  // ... eventos existentes ...

  // ---- Eventos de Insumos (NUEVO) ----
  INSUMO_ACTUALIZADO = 'insumoActualizado',
  INSUMO_BAJO_STOCK = 'insumoBajoStock',
}

// Agregar nuevo room al enum Room
export enum Room {
  KITCHEN = 'kitchen',
  CAJA = 'caja',
  INSUMOS = 'insumos',  // NUEVO
}

// Agregar payload para insumos (NUEVO)
export interface InsumoActualizadoPayload extends BasePayload {
  insumoId: string;
  nombre: string;
  cantidadActual: number;
  cantidadMinima: number;
  unidade: string;
  costoUnitario: number;
  fechaActualizacion: string;
}
```

### Paso 2: Backend - Actualizar Gateway

Edita `puntodeventabackend/src/websocket/app.gateway.ts`:

```typescript
// 1. Agregar handler para el nuevo evento
@SubscribeMessage('insumoActualizado')
handleInsumoActualizado(@MessageBody() data: InsumoActualizadoPayload) {
  const enrichedData = { ...data, timestamp: Date.now(), module: 'INSUMOS' };
  this.server.to(Room.INSUMOS).emit(SocketEvent.INSUMO_ACTUALIZADO, enrichedData);
  return { success: true };
}

// 2. Agregar método helper para uso desde servicios
emitToInsumos(event: string, data: any) {
  this.emitToRoom(Room.INSUMOS, event, data);
}
```

### Paso 3: Backend - Emitir desde un Servicio

En un servicio de NestJS (ej: `insumos.service.ts`):

```typescript
import { AppGateway } from '../websocket/app.gateway';

@Injectable()
export class InsumosService {
  constructor(private readonly appGateway: AppGateway) {}

  async updateStock(insumoId: string, cantidad: number) {
    const insumo = await this.prisma.insumo.update({
      where: { id: insumoId },
      data: { cantidadActual: cantidad },
    });

    // Emitir evento a todos los clientes suscritos al room de insumos
    this.appGateway.emitToInsumos('insumoActualizado', {
      insumoId: insumo.id,
      nombre: insumo.nombre,
      cantidadActual: cantidad,
      cantidadMinima: insumo.cantidadMinima,
      unidade: insumo.unidade,
      costoUnitario: insumo.costoUnitario,
      fechaActualizacion: new Date().toISOString(),
    });

    return insumo;
  }
}
```

### Paso 4: Frontend - Agregar Tipos

Edita `puntodeventafront/src/types/socket.types.ts`:

```typescript
export enum SocketEvent {
  // ... eventos existentes ...
  INSUMO_ACTUALIZADO = 'insumoActualizado',
  INSUMO_BAJO_STOCK = 'insumoBajoStock',
}

export enum Room {
  KITCHEN = 'kitchen',
  CAJA = 'caja',
  INSUMOS = 'insumos',  // NUEVO
}

export interface InsumoActualizadoPayload extends BasePayload {
  insumoId: string;
  nombre: string;
  cantidadActual: number;
  cantidadMinima: number;
  unidade: string;
  costoUnitario: number;
  fechaActualizacion: string;
}
```

### Paso 5: Frontend - Crear Hook de Insumos

Crea `puntodeventafront/src/hooks/useSocketInsumos.ts`:

```typescript
import { useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import { SocketEvent, Room, InsumoActualizadoPayload } from '../types/socket.types';

export function useSocketInsumos() {
  const { emit, isConnected, joinRoom, leaveRoom } = useSocket();

  const emitInsumoActualizado = useCallback(
    (data: Partial<InsumoActualizadoPayload>): boolean => {
      if (!isConnected) return false;
      emit(SocketEvent.INSUMO_ACTUALIZADO, data);
      return true;
    },
    [emit, isConnected]
  );

  const subscribeToInsumos = useCallback(() => {
    joinRoom(Room.INSUMOS);
  }, [joinRoom]);

  const unsubscribeFromInsumos = useCallback(() => {
    leaveRoom(Room.INSUMOS);
  }, [leaveRoom]);

  return {
    emitInsumoActualizado,
    subscribeToInsumos,
    unsubscribeFromInsumos,
    isConnected,
  };
}
```

### Paso 6: Frontend - Usar en una Screen

En `src/screens/insumos/InsumosScreen.tsx`:

```typescript
import React, { useEffect } from 'react';
import { View, Text, FlatList } from 'react-native';
import { useSocket, useSocketEvent } from '../../hooks';
import { useSocketInsumos } from '../../hooks/useSocketInsumos';
import { InsumoActualizadoPayload } from '../../types/socket.types';

export default function InsumosScreen() {
  const [insumos, setInsumos] = useState<InsumoActualizadoPayload[]>([]);
  const { subscribeToInsumos, unsubscribeFromInsumos } = useSocketInsumos();

  // Suscribirse al room al entrar
  useEffect(() => {
    subscribeToInsumos();
    return () => {
      unsubscribeFromInsumos();
    };
  }, [subscribeToInsumos, unsubscribeFromInsumos]);

  // Escuchar eventos de insumos
  const handleInsumoActualizado = useCallback((data: InsumoActualizadoPayload) => {
    console.log('Insumo actualizado:', data);
    setInsumos((prev) => {
      const index = prev.findIndex((i) => i.insumoId === data.insumoId);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = data;
        return updated;
      }
      return [data, ...prev];
    });
  }, []);

  useSocketEvent(InsumoActualizadoPayload.name, handleInsumoActualizado, []);

  return (
    <View>
      <Text>Inventario de Insumos</Text>
      <FlatList
        data={insumos}
        keyExtractor={(item) => item.insumoId}
        renderItem={({ item }) => (
          <View>
            <Text>{item.nombre}</Text>
            <Text>Cantidad: {item.cantidadActual} {item.unidade}</Text>
            {item.cantidadActual < item.cantidadMinima && (
              <Text style={{ color: 'red' }}>⚠️ Bajo stock</Text>
            )}
          </View>
        )}
      />
    </View>
  );
}
```

---

## Referencia de APIs

### Backend - AppGateway

```typescript
// Unirse a un room
@SubscribeMessage('joinRoom')
handleJoinRoom(client: Socket, data: { room: string })

// Salir de un room
@SubscribeMessage('leaveRoom')
handleLeaveRoom(client: Socket, data: { room: string })

// Emitir a un room específico
emitToRoom(room: string, event: string, data: any)

// Emitir a kitchen
emitToKitchen(event: string, data: any)

// Emitir a caja
emitToCaja(event: string, data: any)

// Emitir a todos
emitToAll(event: string, data: any)
```

### Frontend - useSocket

```typescript
const {
  socket,           // Socket instance
  isConnected,      // boolean - si está conectado
  connectionState,   // ConnectionState enum
  error,            // Error si hay alguno
  joinRoom,         // (room: string) => Promise<boolean>
  leaveRoom,        // (room: string) => Promise<boolean>
  emit,             // (event: string, data: any) => boolean
} = useSocket();
```

### Frontend - useSocketEvent

```typescript
// Uso básico
useSocketEvent('miEvento', (data) => {
  console.log('Recibido:', data);
});

// Con dependencias
useSocketEvent('miEvento', (data) => {
  // Este handler se actualiza cuando 'someValue' cambia
  doSomething(data, someValue);
}, [someValue]);

// Tipado con TypeScript
useSocketEvent<MiPayload>('miEvento', (data) => {
  // data es de tipo MiPayload
  console.log(data.propiedad);
});
```

### Frontend - useSocketEmitter

```typescript
const {
  emitNuevaOrden,       // (data: OrdenPayload) => boolean
  emitOrdenActualizada,  // (data: OrdenActualizadaPayload) => boolean
  emitOrdenCompletada,  // (data: OrdenCompletadaPayload) => boolean
  emitEvent,            // (event: string, data: any) => boolean
  isConnected,          // boolean
} = useSocketEmitter();
```

---

## Rooms Disponibles

| Room | Descripción | Uso Típico |
|------|-------------|------------|
| `kitchen` | Pedidos de cocina | Pantallas de cocina |
| `caja` | Actualizaciones de caja | Pantallas de caja, reportes |
| `insumos` | (Futuro) Inventario de insumos | Módulo de insumos |
| `inventario` | (Futuro) Control de inventario | Módulo de inventario |
| `gastos` | (Futuro) Registro de gastos | Módulo de gastos |

---

## Eventos Disponibles

### Eventos POS (Actuales)

| Evento | Dirección | Descripción |
|--------|-----------|-------------|
| `nuevaOrden` | Client → Server | Crear nueva orden |
| `ordenRecibida` | Server → Client | Notificar a kitchen nueva orden |
| `ordenActualizada` | Server → Client | Notificar actualización |
| `ordenActualizadaKitchen` | Server → Kitchen | Actualización para cocina |
| `ordenActualizadaCaja` | Server → Caja | Actualización para caja |
| `ordenCompletada` | Client → Server | Orden completada |

### Eventos Genéricos

| Evento | Descripción |
|--------|-------------|
| `joinRoom` | Unirse a un room |
| `leaveRoom` | Salir de un room |
| `joined` | Confirmación de unión |
| `connect` | Conexión establecida |
| `disconnect` | Desconexión |
| `error` | Error de socket |

---

## Solución de Problemas

### El evento no llega
1. Verificar que el cliente está conectado: `console.log(isConnected)`
2. Verificar que está en el room correcto: `console.log(getRooms())`
3. Verificar que el backend está emitiendo: revisar logs del servidor

### Memory leaks
- Asegurarse de usar `useSocketEvent` en lugar de `socket.on()` directo
- El hook limpia automáticamente los listeners al desmontar

### No hay re-conexión
- Socket.io intenta reconectar automáticamente
- Si necesitas forzar reconexión: `socket.disconnect(); socket.connect();`

---

## Mantenimiento

### Sincronizar Tipos

Cuando modifiques los tipos en `packages/socket-types/src/index.ts`, recuerda:

1. Compilar el paquete: `cd packages/socket-types && npm run build`
2. Actualizar la copia local en frontend: `src/types/socket.types.ts`

### Monitoreo

Los logs incluyen:
- `[SocketContext] Connected:` - Conexión establecida
- `[SocketContext] Joined room:` - Unido a room
- `[useSocketEvent] Adding listener for event:` - Nuevo listener
- `[AppGateway] Client ${id} joined room:` - Cliente se unió

---

## Métricas de Uso

El gateway mantiene conteos útiles:

```typescript
// Número de clientes conectados
appGateway.getConnectedClientsCount()

// Clientes en un room específico
appGateway.getClientsInRoom('kitchen')

// Rooms activos
appGateway.getRooms()
```
