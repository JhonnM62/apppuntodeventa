import React, { useEffect } from 'react';
import { ActivityIndicator, View, Platform } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import useAuthStore from '../store/useAuthStore';
import { useDockStore } from '../store/useDockStore';
import FloatingDock from '../components/ui/FloatingDock';
import { useSalesStore } from '../store/useSalesStore';
import { Text } from 'react-native';
import SessionExpiredModal from '../components/ui/SessionExpiredModal';
import { useGlobalSalesSync } from '../hooks/useGlobalSalesSync';

// Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import HomeScreen from '../screens/home/HomeScreen';
import NewSaleScreen from '../screens/sales/NewSaleScreen';
import PedidosScreen from '../screens/orders/PedidosScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import UsersScreen from '../screens/settings/UsersScreen';
import MesasScreen from '../screens/settings/MesasScreen';
import ComentariosScreen from '../screens/settings/ComentariosScreen';
import PrinterSettingsScreen from '../screens/settings/PrinterSettingsScreen';
import InsumosScreen from '../screens/inventario/InsumosScreen';
import AnalyticsScreen from '../screens/inventario/AnalyticsScreen';
import BulkImportScreen from '../screens/inventario/BulkImportScreen';
import CategoriasScreen from '../screens/inventario/CategoriasScreen';
import CategoriasInsumosScreen from '../screens/inventario/CategoriasInsumosScreen';
import CategoriasInsumosFormScreen from '../screens/inventario/CategoriasInsumosFormScreen';
import InventarioScreen from '../screens/inventario/InventarioScreen';
import InsumoDetailScreen from '../screens/inventario/InsumoDetailScreen';
import AuditoriaConteoScreen from '../screens/inventario/AuditoriaConteoScreen';
import AiUploadScreen from '../screens/inventario/AiUploadScreen';
import AiReviewScreen from '../screens/inventario/AiReviewScreen';
import CajaListScreen from '../screens/caja/CajaListScreen';
import CajaFormScreen from '../screens/caja/CajaFormScreen';

import HistorialVentasScreen from '../screens/orders/HistorialVentasScreen';

// Clientes
import ClientesListScreen from '../screens/clientes/ClientesListScreen';
import ClienteDetailScreen from '../screens/clientes/ClienteDetailScreen';
import ClienteFormScreen from '../screens/clientes/ClienteFormScreen';

import GastosScreen from '../screens/gastos/GastosScreen';
import EstadisticasScreen from '../screens/estadisticas/EstadisticasScreen';
import ReportesScreen from '../screens/reportes/ReportesScreen';
import ReporteDetalleScreen from '../screens/reportes/ReporteDetalleScreen';
import ProductosScreen from '../screens/inventario/ProductosScreen';
import ProductoDetailScreen from '../screens/inventario/ProductoDetailScreen';
import NotificationSettingsScreen from '../screens/settings/NotificationSettingsScreen';
import ConfiguracionNegocioScreen from '../screens/settings/ConfiguracionNegocioScreen';
import ConfiguracionAvanzadaScreen from '../screens/settings/ConfiguracionAvanzadaScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: { screen: string; params?: any } | undefined;
  Sales: { saleId?: string };
  NewSale: { saleId?: string };
  Settings: undefined;
  Users: undefined;
  Mesas: undefined;
  Comentarios: undefined;
  PrinterSettings: undefined;
  NotificationSettings: undefined;
  ConfiguracionNegocio: undefined;
  ConfiguracionAvanzada: undefined;
  Insumos: undefined;
  InsumoDetail: { id: string };
  AuditoriaConteo: { insumoId?: string; insumoNombre?: string };
  Analytics: undefined;
  BulkImport: undefined;
  Categorias: undefined;
  CategoriasInsumos: undefined;
  CategoriasInsumosForm: { id?: string };
  Inventario: undefined;
  AiUpload: { targetInventarioId?: string } | undefined;
  AiReview: { extractedData: any[]; rawSource?: string; type?: 'text' | 'image'; targetInventarioId?: string };
  Caja: undefined;
  CajaForm: { cajaId?: string };
  HistorialVentas: undefined;
  Gastos: undefined;
  Estadisticas: undefined;
  Reportes: undefined;
  ReporteDetalle: { cajaId: string };
  Productos: undefined;
  ProductoDetail: { id: string };
  Clientes: undefined;
  ClienteDetail: { id: string } | undefined;
  ClienteForm: { id?: string } | undefined;
};

export type BottomTabParamList = {
  Inicio: undefined;
  Pedidos: { ventaId?: string } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<BottomTabParamList>();

const HomeTabs = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  
  // To ensure re-renders when ventas change, we need to select from the state directly
  const pendingOrders = useSalesStore(state => {
    const ventas = state.ventas;
    if (!Array.isArray(ventas)) return 0;
    return ventas.filter(v => 
      v.estado && v.estado !== 'PAGADO' && v.estado !== 'ENTREGADO'
    ).length;
  });

  const bottomPadding = Math.max(insets.bottom, 10);
  const tabHeight = 60 + bottomPadding;

  const canSeePedidos = 
    user?.rol === 'Admin app' || 
    user?.rol === 'jefe' || 
    user?.rol === 'Admin negocio' || 
    user?.permisos?.pedidos?.read === true ||
    String(user?.permisos?.pedidos?.read) === 'true';

  return (
    <Tab.Navigator id="TabNav"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#4CAF50',
          borderTopWidth: 0,
          elevation: 10,
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabHeight,
        },
        tabBarLabelStyle: {
          fontWeight: 'bold',
          fontSize: 11,
          paddingBottom: 4,
        },
        tabBarActiveTintColor: '#FFF',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
        tabBarIcon: ({ color, size, focused }) => {
          let iconName: any = 'home';
          if (route.name === 'Inicio') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Pedidos') {
            iconName = focused ? 'receipt' : 'receipt-outline';
          }
          return (
            <View>
              <Ionicons name={iconName} size={24} color={color} style={{ marginBottom: -4 }} />
              {route.name === 'Pedidos' && pendingOrders > 0 && (
                <View style={{
                  position: 'absolute',
                  right: -8,
                  top: -2,
                  backgroundColor: 'red',
                  borderRadius: 10,
                  minWidth: 18,
                  height: 18,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingHorizontal: 4
                }}>
                  <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{pendingOrders}</Text>
                </View>
              )}
            </View>
          );
        },
      })}
    >
      <Tab.Screen 
        name="Inicio" 
        component={HomeScreen} 
        options={{ tabBarLabel: 'INICIO' }}
      />
      {canSeePedidos && (
        <Tab.Screen 
          name="Pedidos" 
          component={PedidosScreen} 
          options={{ tabBarLabel: 'PEDIDOS' }}
        />
      )}
    </Tab.Navigator>
  );
};

export const navigationRef = createNavigationContainerRef();

const RootNavigator = () => {
  const { isInitialized, token, init } = useAuthStore();
  const { setCurrentRoute, addToHistory, setVisible } = useDockStore();

  useGlobalSalesSync();

  useEffect(() => {
    init();
  }, [init]);

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          if (navigationRef.isReady()) {
            const currentRoute = navigationRef.getCurrentRoute();
            const route = currentRoute?.name || 'Inicio';
            const params = currentRoute?.params;
            setCurrentRoute(route);
            addToHistory(route, params);
            setVisible(true);
          }
        }}
        onStateChange={() => {
          if (navigationRef.isReady()) {
            const currentRoute = navigationRef.getCurrentRoute();
            const route = currentRoute?.name || 'Inicio';
            const params = currentRoute?.params;
            setCurrentRoute(route);
            addToHistory(route, params);
            setVisible(true);
          }
        }}
      >
      <Stack.Navigator id="StackNav" screenOptions={{ headerShown: false }}>
        {token == null ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen as any} />
            <Stack.Screen name="Register" component={RegisterScreen as any} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={HomeTabs} />
            <Stack.Screen name="Sales" component={NewSaleScreen as any} />
            <Stack.Screen name="Settings" component={SettingsScreen as any} />
            <Stack.Screen name="Users" component={UsersScreen as any} />
            <Stack.Screen name="Mesas" component={MesasScreen as any} />
            <Stack.Screen name="Comentarios" component={ComentariosScreen as any} />
            <Stack.Screen name="PrinterSettings" component={PrinterSettingsScreen as any} />
            <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen as any} />
            <Stack.Screen name="ConfiguracionNegocio" component={ConfiguracionNegocioScreen as any} />
            <Stack.Screen name="ConfiguracionAvanzada" component={ConfiguracionAvanzadaScreen as any} />
            <Stack.Screen name="Insumos" component={InsumosScreen as any} />
            <Stack.Screen name="Analytics" component={AnalyticsScreen as any} />
            <Stack.Screen name="BulkImport" component={BulkImportScreen as any} />
            <Stack.Screen name="Categorias" component={CategoriasScreen as any} />
            <Stack.Screen name="CategoriasInsumos" component={CategoriasInsumosScreen as any} />
            <Stack.Screen name="CategoriasInsumosForm" component={CategoriasInsumosFormScreen as any} />
            <Stack.Screen name="Inventario" component={InventarioScreen as any} />
            <Stack.Screen name="AiUpload" component={AiUploadScreen as any} />
            <Stack.Screen name="AiReview" component={AiReviewScreen as any} />
            <Stack.Screen name="InsumoDetail" component={InsumoDetailScreen as any} />
            <Stack.Screen name="AuditoriaConteo" component={AuditoriaConteoScreen as any} />
            <Stack.Screen name="Caja" component={CajaListScreen as any} />
            <Stack.Screen name="CajaForm" component={CajaFormScreen as any} />
            <Stack.Screen name="HistorialVentas" component={HistorialVentasScreen as any} />
            
            {/* Clientes */}
            <Stack.Screen name="Clientes" component={ClientesListScreen as any} />
            <Stack.Screen name="ClienteDetail" component={ClienteDetailScreen as any} />
            <Stack.Screen name="ClienteForm" component={ClienteFormScreen as any} />

            <Stack.Screen name="Gastos" component={GastosScreen as any} />
            <Stack.Screen name="Estadisticas" component={EstadisticasScreen as any} />
            <Stack.Screen name="Reportes" component={ReportesScreen as any} />
            <Stack.Screen name="ReporteDetalle" component={ReporteDetalleScreen as any} />
            <Stack.Screen name="Productos" component={ProductosScreen as any} />
            <Stack.Screen name="ProductoDetail" component={ProductoDetailScreen as any} />
          </>
        )}
      </Stack.Navigator>
      {token != null && <FloatingDock />}
      <SessionExpiredModal />
    </NavigationContainer>
  );
};

export default RootNavigator;