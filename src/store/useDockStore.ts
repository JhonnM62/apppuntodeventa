import { create } from 'zustand';

export interface RouteHistoryItem {
  name: string;
  label: string;
  icon: string;
  params?: any;
}

interface DockState {
  isVisible: boolean;
  currentRoute: string;
  history: RouteHistoryItem[];
  setVisible: (visible: boolean) => void;
  setCurrentRoute: (route: string) => void;
  addToHistory: (route: string, params?: any) => void;
  clearHistory: () => void;
}

const getRouteDetails = (routeName: string): { label: string; icon: string } => {
  const routeMap: Record<string, { label: string; icon: string }> = {
    Inicio: { label: 'Inicio', icon: 'home' },
    Pedidos: { label: 'Pedidos', icon: 'restaurant' },
    Sales: { label: 'Punto de Venta', icon: 'cart' },
    NewSale: { label: 'Nueva Venta', icon: 'cart' },
    Insumos: { label: 'Insumos', icon: 'cube' },
    Categorias: { label: 'Cat. Productos', icon: 'pricetags' },
    CategoriasInsumos: { label: 'Cat. Insumos', icon: 'pricetags' },
    Inventario: { label: 'Inventario', icon: 'bar-chart' },
    Caja: { label: 'Cajas', icon: 'cash' },
    HistorialVentas: { label: 'Historial', icon: 'receipt' },
    Gastos: { label: 'Gastos', icon: 'wallet' },
    Estadisticas: { label: 'Estadísticas', icon: 'trending-up' },
    Reportes: { label: 'Reportes', icon: 'document-text' },
    Productos: { label: 'Productos', icon: 'fast-food' },
    Settings: { label: 'Ajustes', icon: 'settings' },
  };

  return routeMap[routeName] || { label: routeName, icon: 'folder-open' };
};

export const useDockStore = create<DockState>((set) => ({
  isVisible: true,
  currentRoute: 'Inicio',
  history: [],
  setVisible: (visible) => set({ isVisible: visible }),
  setCurrentRoute: (route) => set({ currentRoute: route }),
  addToHistory: (route, params) => set((state) => {
    // Ignore auth screens and Main
    if (route === 'Login' || route === 'Register' || route === 'Main') return state;

    // Don't add if it's the exact same route AND params as the last one
    if (state.history.length > 0 && state.history[0].name === route && JSON.stringify(state.history[0].params) === JSON.stringify(params)) {
      return state;
    }

    const routeDetails = getRouteDetails(route);
    const newItem: RouteHistoryItem = {
      name: route,
      label: routeDetails.label,
      icon: routeDetails.icon,
      params
    };

    // Remove duplicates of this exact route+params combination if it exists, then add to front, keep max 5
    const filteredHistory = state.history.filter(item => !(item.name === route && JSON.stringify(item.params) === JSON.stringify(params)));
    const newHistory = [newItem, ...filteredHistory].slice(0, 5);

    return { history: newHistory };
  }),
  clearHistory: () => set({ history: [] }),
}));
