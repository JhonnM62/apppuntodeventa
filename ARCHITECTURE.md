# Frontend Architecture - Q Hubo Mor POS

## Overview
This application is a React Native mobile Point of Sale (POS) and ERP system built with Expo. It replaces a legacy AppSheet application, offering real-time synchronization, offline capabilities, and a highly responsive UI.

## Tech Stack
- **Framework**: React Native + Expo (EAS Build)
- **UI & Styling**: Tailwind CSS via `uniwind`, custom UI components (`src/components/ui`)
- **State Management**: Zustand (Global stores mapped to domains)
- **Navigation**: React Navigation (Bottom Tabs + Native Stack)
- **Real-time**: `socket.io-client` connected to NestJS Gateway
- **Hardware Integration**: Bluetooth Thermal Printing (`react-native-thermal-receipt-printer-image-qr`)

## Directory Structure
```text
src/
├── components/
│   └── ui/               # Reusable Tailwind components (Text, Button, Input, Modals)
├── context/              # React Context providers (SocketContext)
├── hooks/                # Custom React hooks (useSocketEvent, useScrollDirection)
├── navigation/           # Route definitions and Floating Dock logic
├── screens/              # Feature-based views
│   ├── auth/             # Login and Registration
│   ├── caja/             # Cash register management (Apertura, Cierre, Arqueos)
│   ├── inventario/       # Insumos, Productos, and Bulk management
│   ├── orders/           # POS Sales, History, and Order tracking
│   └── settings/         # Configuration, Printers, Users, and Roles
├── services/             # Axios API wrappers (REST communication)
├── store/                # Zustand stores (useCartStore, useAuthStore, useProductStore)
└── utils/                # PDF generation, Currency formatters, Date parsers
```

## State Management Flow
The app strictly separates UI state from Global state:
1. **Local State**: Handled via `useState` for forms, modals, and input fields.
2. **Global State**: Handled via Zustand (`src/store`). Example: `useCartStore` manages the active POS cart across multiple screens without prop drilling.
3. **Server State**: Data fetched via `services/` is either kept in local state or synced to Zustand stores if needed globally.

## Real-time Sync Architecture
The app maintains data consistency across multiple devices using WebSockets:
1. **Connection**: `SocketContext` initializes the `socket.io-client`.
2. **Listeners**: Views use the custom hook `useSocketEvent('event_name', callback)` to listen for changes.
3. **Trigger**: When an event (e.g., `refreshInsumos`, `ordenActualizada`) is received, the view triggers a silent refetch of the data using the Axios services.
