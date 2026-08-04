import React, { useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, Animated, Modal, Pressable, Platform, FlatList, AppState, AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import useAuthStore from '../../store/useAuthStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { getNotificationHistory } from '../../services/notifications';
import { Text } from '../../components/ui/text';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import NotificationCenterModal from '../../components/ui/NotificationCenterModal';
import useCartStore from '../../store/useCartStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { FlashList as OriginalFlashList } from '@shopify/flash-list';
const FlashList = OriginalFlashList as any;

const CARD_MARGIN = 10;

type MenuItem = {
  id: string;
  title: string;
  label: string;
  icon: any;
  iconType: 'ionicons' | 'materialcommunity';
  route: string;
  color: string;
  adminOnly?: boolean;
  permissionKey?: string;
  permissionAction?: 'read' | 'create' | 'edit' | 'delete';
};

const MENU_ITEMS: MenuItem[] = [
  { id: '1', title: 'NUEVA VENTA', label: 'Agregar Producto', icon: 'cart', iconType: 'ionicons', route: 'NewSale', color: '#22C55E', permissionKey: 'ventas', permissionAction: 'create' },
  { id: '3', title: 'PRODUCTOS', label: 'Gestión Productos', icon: 'food', iconType: 'materialcommunity', route: 'Productos', color: '#06B6D4', permissionKey: 'productos', permissionAction: 'read' },
  { id: '2', title: 'INSUMOS', label: 'Insumos', icon: 'food-variant', iconType: 'materialcommunity', route: 'Insumos', color: '#F59E0B', permissionKey: 'insumos', permissionAction: 'read' },
  { id: '4', title: 'INVENTARIOS', label: 'Inventario', icon: 'archive', iconType: 'ionicons', route: 'Inventario', color: '#3B82F6', permissionKey: 'inventario', permissionAction: 'read' },
  { id: '5', title: 'APERTURA Y CIERRE DE CAJA', label: 'Caja', icon: 'cash-register', iconType: 'materialcommunity', route: 'Caja', color: '#8B5CF6', permissionKey: 'caja', permissionAction: 'read' },
  { id: '6', title: 'ESTADÍSTICAS', label: 'Gráficos', icon: 'bar-chart', iconType: 'ionicons', route: 'Estadisticas', color: '#EF4444', permissionKey: 'reportes', permissionAction: 'read' },
  { id: '7', title: 'HISTORIAL DE ORDENES', label: 'Historial Ordenes', icon: 'receipt', iconType: 'materialcommunity', route: 'Historial', color: '#64748B', permissionKey: 'historial_ventas', permissionAction: 'read' },
  { id: '9', title: 'GASTOS', label: 'Gastos', icon: 'wallet', iconType: 'ionicons', route: 'Gastos', color: '#F97316', permissionKey: 'gastos', permissionAction: 'read' },
  { id: '10', title: 'REPORTES', label: 'Dinero Guardado', icon: 'file-document', iconType: 'materialcommunity', route: 'Reportes', color: '#16A34A', permissionKey: 'reportes', permissionAction: 'read' },
  { id: '8', title: 'CONFIGURACIÓN', label: 'Configuración', icon: 'settings', iconType: 'ionicons', route: 'Settings', color: '#6366F1', permissionKey: 'configuracion', permissionAction: 'read' },
  { id: '11', title: 'CLIENTES', label: 'Clientes', icon: 'people', iconType: 'ionicons', route: 'Clientes', color: '#14B8A6', permissionKey: 'clientes', permissionAction: 'read' },
];

const MenuCard = ({ item, onPress }: { item: MenuItem; onPress: (item: MenuItem) => void }) => (
  <View style={{ width: '100%', padding: CARD_MARGIN }}>
    <TouchableOpacity
      className="bg-card rounded-[20px] p-[14px] justify-between border shadow-sm"
      style={{ height: 200, borderColor: '#e5e7eb', backgroundColor: '#ffffff' }}
      activeOpacity={0.85}
      onPress={() => onPress(item)}
      accessibilityLabel={item.label}
      accessibilityRole="button"
      accessibilityHint={`Navegar a ${item.title}`}
    >
      <View 
        className="py-2 px-3 rounded-xl self-center w-full items-center shadow-sm"
        style={{ backgroundColor: item.color, transform: [{ translateY: -18 }] }}
      >
        <Text className="text-white font-black text-[11px] text-center uppercase tracking-wider">
          {item.title}
        </Text>
      </View>

      <View className="flex-1 justify-center items-center -mt-1.5">
        {item.iconType === 'ionicons' ? (
          <Ionicons name={item.icon as any} size={52} color={item.color} />
        ) : (
          <MaterialCommunityIcons name={item.icon as any} size={52} color={item.color} />
        )}
      </View>

      <View className="border-t pt-2.5 items-center" style={{ borderTopColor: '#e5e7eb' }}>
        <Text className="text-[13px] font-bold uppercase tracking-wide text-center" style={{ color: '#1f2937' }}>
          {item.label}
        </Text>
        <View 
          className="w-10 h-1 rounded-full mt-2" 
          style={{ backgroundColor: item.color }} 
        />
      </View>
    </TouchableOpacity>
  </View>
);

const AvatarMenu = ({ user, onLogout, navigation }: { user: any; onLogout: () => void; navigation: any }) => {
  const [menuVisible, setMenuVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-10)).current;

  const toggleMenu = () => {
    if (menuVisible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -10, duration: 200, useNativeDriver: true }),
      ]).start(() => setMenuVisible(false));
    } else {
      setMenuVisible(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <>
      <TouchableOpacity
        className="p-1 min-w-[44px] min-h-[44px] justify-center items-center"
        onPress={toggleMenu}
        activeOpacity={0.8}
        accessibilityLabel="Menú de usuario"
        accessibilityRole="button"
      >
        <View className="w-9 h-9 rounded-full bg-white/25 border-2 border-white/50 justify-center items-center shadow-sm">
          <Text className="text-white text-sm font-bold">
            {getInitials(user?.name || user?.nombre || 'Usuario')}
          </Text>
        </View>
      </TouchableOpacity>

      <Modal visible={menuVisible} transparent animationType="none" onRequestClose={toggleMenu}>
        <Pressable className="flex-1 bg-transparent" onPress={toggleMenu}>
          <Animated.View
            className="absolute right-4 w-60 rounded-2xl overflow-hidden shadow-lg border"
            style={{ 
              top: Platform.OS === 'ios' ? 100 : 70, 
              opacity: fadeAnim, 
              transform: [{ translateY: slideAnim }],
              backgroundColor: '#ffffff',
              borderColor: '#e5e7eb'
            }}
          >
            <View className="p-4" style={{ backgroundColor: primaryColor }}>
              <Text className="text-white text-base font-bold">{user?.name || user?.nombre || 'Usuario'}</Text>
              <Text className="text-white/75 text-[13px] mt-0.5">{user?.email || 'usuario@ejemplo.com'}</Text>
            </View>

            <TouchableOpacity
              className="flex-row items-center py-3.5 px-4 min-h-[48px]"
              onPress={() => { toggleMenu(); navigation.navigate('Settings'); }}
              accessibilityLabel="Ver perfil"
              accessibilityRole="menuitem"
            >
              <Ionicons name="person-outline" size={20} color="#1f2937" />
              <Text className="text-[15px] font-medium ml-3" style={{ color: '#1f2937' }}>Ver perfil</Text>
            </TouchableOpacity>

            <View className="h-[1px] mx-4" style={{ backgroundColor: '#e5e7eb' }} />

            <TouchableOpacity
              className="flex-row items-center py-3.5 px-4 min-h-[48px]"
              onPress={() => { toggleMenu(); onLogout(); }}
              accessibilityLabel="Cerrar sesión"
              accessibilityRole="menuitem"
            >
              <Ionicons name="log-out-outline" size={20} color="#ef4444" />
              <Text className="text-[15px] font-medium ml-3" style={{ color: '#ef4444' }}>Cerrar sesión</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Main'>;
};

const HomeScreen = ({ navigation }: Props) => {
  const { user, logout } = useAuthStore();
  const { unreadCount, setUnreadCount } = useNotificationStore();
  const { primaryColor } = useSettingsStore();
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const fetchUnreadCount = () => {
      if (user && (user.rol === 'Admin app' || user.rol === 'Admin negocio')) {
        getNotificationHistory(user.id || user.IDusuarios)
          .then(data => setUnreadCount(data.filter(n => !n.read).length))
          .catch(err => console.log('Error fetching unread count', err.message));
      }
    };

    // Cargar al iniciar
    fetchUnreadCount();

    // Actualizar cuando la app vuelve de segundo plano a primer plano
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        fetchUnreadCount();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user]);

  const handleLogout = () => {
    logout();
    const parentNavigation = navigation.getParent();
    if (parentNavigation) {
      parentNavigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } else {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  };

  const checkPermission = (item: MenuItem) => {
    // Regla general para administradores
    if (user?.rol === 'Admin app' || user?.rol === 'Admin negocio') return true;
    if (item.adminOnly) return false;
    if (!item.permissionKey) return true;

    // 1. Caso especial: Módulo Inventario
    if (item.permissionKey === 'inventario') {
      const subPermsEntradas = user?.permisos?.['entradas_inventario'];
      const subPermsSalidas = user?.permisos?.['salidas_inventario'];
      const subPermsRegistros = user?.permisos?.['registros_inventario'];
      
      return (
        (subPermsEntradas && (subPermsEntradas.read === true || String(subPermsEntradas.read) === 'true')) ||
        (subPermsSalidas && (subPermsSalidas.read === true || String(subPermsSalidas.read) === 'true')) ||
        (subPermsRegistros && (subPermsRegistros.read === true || String(subPermsRegistros.read) === 'true'))
      );
    }

    // 2. Caso especial: Módulo Configuración
    if (item.permissionKey === 'configuracion') {
      const subPermsImpresora = user?.permisos?.['config_impresora'];
      const subPermsUsuarios = user?.permisos?.['config_usuarios'];
      const subPermsComentarios = user?.permisos?.['config_comentarios'];
      
      return (
        (subPermsImpresora && (subPermsImpresora.read === true || String(subPermsImpresora.read) === 'true')) ||
        (subPermsUsuarios && (subPermsUsuarios.read === true || String(subPermsUsuarios.read) === 'true')) ||
        (subPermsComentarios && (subPermsComentarios.read === true || String(subPermsComentarios.read) === 'true'))
      );
    }

    const perm = user?.permisos?.[item.permissionKey];
    if (!perm) return false;
    
    if (item.permissionAction === 'create') return perm.create === true || String(perm.create) === 'true';
    if (item.permissionAction === 'edit') return perm.edit === true || String(perm.edit) === 'true';
    if (item.permissionAction === 'delete') return perm.delete === true || String(perm.delete) === 'true';
    
    return perm.read === true || String(perm.read) === 'true';
  };

  const handlePress = (item: MenuItem) => {
    if (item.route === 'NewSale') {
      useCartStore.getState().clearCart();
      navigation.navigate('Sales');
    } else if (item.route === 'Historial') {
      navigation.navigate('HistorialVentas');
    } else {
      navigation.navigate(item.route as any);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <StatusBar style="light" backgroundColor="transparent" translucent />
      <View style={{ backgroundColor: primaryColor, paddingTop: insets.top }}>
        <View className="py-3.5 px-5 flex-row items-center justify-between shadow-md z-10" style={{ backgroundColor: primaryColor }}>
          <Text className="text-white text-[22px] font-bold tracking-widest">INICIO</Text>
          <View className="flex-row items-center">
            <TouchableOpacity 
              className="mr-3 p-1 relative"
              onPress={() => setNotificationModalVisible(true)}
            >
              <Ionicons name="notifications-outline" size={26} color="#fff" />
              {unreadCount > 0 && (
                <View className="absolute top-0.5 right-0.5 bg-red-500 rounded-full w-4 h-4 items-center justify-center border" style={{ borderColor: primaryColor }}>
                  <Text className="text-white text-[9px] font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <AvatarMenu user={user} onLogout={handleLogout} navigation={navigation} />
          </View>
        </View>
      </View>

      <NotificationCenterModal 
        visible={notificationModalVisible} 
        onClose={() => setNotificationModalVisible(false)} 
      />

      <View style={{ flex: 1, width: '100%', paddingTop: 12 }}>
        <FlashList
            data={MENU_ITEMS.filter(checkPermission)}
            renderItem={({ item }: { item: MenuItem }) => <MenuCard item={item} onPress={handlePress} />}
            keyExtractor={(item: MenuItem) => item.id}
          numColumns={2}
          estimatedItemSize={220}
          contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 100 : 80, paddingHorizontal: 10 }}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </View>
  );
};

export default HomeScreen;