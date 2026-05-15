import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Text, Animated, StyleSheet, TouchableWithoutFeedback, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useDockStore, RouteHistoryItem } from '../../store/useDockStore';
import useAuthStore from '../../store/useAuthStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Mapa de permisos por rol
const ALLOWED_ROUTES_BY_ROLE: Record<string, string[]> = {
  'Admin app': ['*'], // Tiene acceso a todo
  'Admin negocio': ['*'], // Asumimos que tiene acceso a todo también
  'Inventarista': ['Inicio', 'Pedidos', 'Sales', 'NewSale', 'Inventario', 'Insumos', 'CategoriasInsumos', 'Productos', 'Categorias', 'InsumoDetail', 'ProductoDetail'],
  'Cajero': ['Inicio', 'Pedidos', 'Sales', 'NewSale', 'Caja', 'CajaForm', 'HistorialVentas'],
  'Mesero': ['Inicio', 'Pedidos', 'Sales', 'NewSale'],
  'Cocinero': ['Inicio', 'Pedidos'],
};

const hasRoutePermission = (user: any, routeName: string) => {
  if (!user || !user.rol) return false;
  
  if (user.rol === 'Admin app') return true;

  const routeToPermissionMap: Record<string, string> = {
    'Sales': 'ventas',
    'NewSale': 'ventas',
    'Pedidos': 'pedidos',
    'HistorialVentas': 'historial_ventas', // Changed permission key
    'Inventario': 'inventario', // The master fallback permission
    'Productos': 'productos',
    'Categorias': 'productos',
    'ProductoDetail': 'productos',
    'Insumos': 'insumos',
    'CategoriasInsumos': 'insumos',
    'InsumoDetail': 'insumos',
    'Caja': 'caja',
    'CajaList': 'caja',
    'CajaForm': 'caja',
    'Reportes': 'reportes',
    'ReporteDetalle': 'reportes',
    'Estadisticas': 'reportes',
    'Gastos': 'gastos',
    'Clientes': 'clientes',
    'ClienteDetail': 'clientes',
    'ClienteForm': 'clientes',
    'Settings': 'configuracion',
    'Users': 'config_usuarios',
    'Mesas': 'configuracion',
    'Comentarios': 'config_comentarios',
    'PrinterSettings': 'config_impresora',
    'NotificationSettings': 'configuracion',
    'ConfiguracionNegocio': 'configuracion',
    'Analytics': 'inventario',
    'BulkImport': 'inventario',
  };

  const requiredPerm = routeToPermissionMap[routeName];
  
  if (requiredPerm && user.permisos) {
    const perms = user.permisos[requiredPerm];
    
    // Fallback: If navigating to Settings, check if ANY of the sub-permissions exist
    if (routeName === 'Settings') {
      const subPermsImpresora = user.permisos['config_impresora'];
      const subPermsUsuarios = user.permisos['config_usuarios'];
      const subPermsComentarios = user.permisos['config_comentarios'];
      
      const hasAnyConfigPerm = 
        (subPermsImpresora && (subPermsImpresora.read === true || String(subPermsImpresora.read) === 'true')) ||
        (subPermsUsuarios && (subPermsUsuarios.read === true || String(subPermsUsuarios.read) === 'true')) ||
        (subPermsComentarios && (subPermsComentarios.read === true || String(subPermsComentarios.read) === 'true'));
        
      if (hasAnyConfigPerm) return true;
    }

    // Fallback: If navigating to Inventario, check if ANY of the sub-permissions exist
    if (routeName === 'Inventario') {
      const subPermsEntradas = user.permisos['entradas_inventario'];
      const subPermsSalidas = user.permisos['salidas_inventario'];
      const subPermsRegistros = user.permisos['registros_inventario'];
      
      const hasAnySubPerm = 
        (subPermsEntradas && (subPermsEntradas.read === true || String(subPermsEntradas.read) === 'true')) ||
        (subPermsSalidas && (subPermsSalidas.read === true || String(subPermsSalidas.read) === 'true')) ||
        (subPermsRegistros && (subPermsRegistros.read === true || String(subPermsRegistros.read) === 'true'));
        
      if (hasAnySubPerm) return true;
    }
    
    if (perms) {
      if (routeName === 'NewSale' || routeName === 'Sales') {
        return (perms.create === true || String(perms.create) === 'true') || 
               (perms.read === true || String(perms.read) === 'true');
      }
      return perms.read === true || String(perms.read) === 'true';
    }
  }

  // Rutas básicas sin permisos estrictos
  if (routeName === 'Inicio') return true;
  
  return false;
};

const FloatingDock = () => {
  const navigation = useNavigation<any>();
  const { isVisible, currentRoute, history } = useDockStore();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  
  const [showTooltip, setShowTooltip] = useState(false);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const sideMenuTranslateX = useRef(new Animated.Value(200)).current;
  
  // Animation value: 0 = visible, 1 = hidden (translated down)
  const translateY = useRef(new Animated.Value(0)).current;

  // We only want the bottom dock to exist if we are NOT in 'Inicio', 'Pedidos', NOT in 'Login'/'Register', and NOT in 'Sales'/'NewSale'
  const isMainScreen = currentRoute === 'Inicio' || currentRoute === 'Pedidos';
  const isAuthScreen = currentRoute === 'Login' || currentRoute === 'Register';
  const isNewSaleScreen = currentRoute === 'NewSale' || currentRoute === 'Sales';
  
  // Render dock only if it's not main, auth, or new sale
  const shouldRenderBottomDock = !isMainScreen && !isAuthScreen && !isNewSaleScreen;
  const shouldRenderSideTab = isNewSaleScreen;

  // Effect to forcefully redirect user to home if they lose permission to current route via Socket
  useEffect(() => {
    if (currentRoute && currentRoute !== 'Inicio' && currentRoute !== 'Login' && currentRoute !== 'Register') {
      const isAllowed = hasRoutePermission(user, currentRoute);
      if (!isAllowed) {
        console.log(`[FloatingDock] User lost permission for ${currentRoute}. Redirecting to Inicio.`);
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main', params: { screen: 'Inicio' } }],
        });
      }
    }
  }, [user?.permisos, currentRoute, navigation]);

  useEffect(() => {
    if (shouldRenderBottomDock) {
      // If not visible (user scrolled down) OR we are on main screen -> hide it
      const toValue = (!isVisible || isMainScreen) ? 100 : 0;
      
      if (toValue === 100 && showTooltip) {
        setShowTooltip(false);
      }
      
      Animated.spring(translateY, {
        toValue,
        useNativeDriver: true,
        bounciness: 12,
        speed: 14,
      }).start();
    }
  }, [isVisible, isMainScreen, shouldRenderBottomDock]);

  useEffect(() => {
    if (sideMenuOpen) {
      Animated.spring(sideMenuTranslateX, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
        speed: 20,
      }).start();
    } else {
      Animated.spring(sideMenuTranslateX, {
        toValue: 250,
        useNativeDriver: true,
        bounciness: 0,
        speed: 20,
      }).start();
    }
  }, [sideMenuOpen]);

  if (isAuthScreen || isMainScreen) {
    return null; // Don't render at all on home/auth to save memory
  }

  // Filter history based on current user role permissions
  // Also skip the first item because it's the current screen
  const filteredHistory = history.filter(item => hasRoutePermission(user, item.name));
  
  // Find the index of the current route in the filtered history
  const currentRouteIndex = filteredHistory.findIndex(item => item.name === currentRoute);
  
  // Create recentHistory excluding the current route
  let recentHistory: RouteHistoryItem[] = [];
  if (currentRouteIndex !== -1) {
    // Current route is in history, take elements after it
    recentHistory = filteredHistory.slice(currentRouteIndex + 1, currentRouteIndex + 5);
  } else {
    // Current route is not in history (maybe it's not allowed?), just take top 4
    recentHistory = filteredHistory.slice(0, 4);
  }

  return (
    <>
      {/* -------------------- MODO 1: PESTAÑA LATERAL (SOLO PARA NEW SALE) -------------------- */}
      {shouldRenderSideTab && (
        <>
          {!sideMenuOpen && (
            <TouchableOpacity 
              style={[styles.sideTab, { top: '40%' }]} 
              onPress={() => setSideMenuOpen(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={16} color="#16a34a" />
              <Ionicons name="menu" size={20} color="#16a34a" style={{ marginLeft: -4 }} />
            </TouchableOpacity>
          )}
          
          <Modal transparent visible={sideMenuOpen} animationType="fade" onRequestClose={() => setSideMenuOpen(false)}>
            <TouchableWithoutFeedback onPress={() => setSideMenuOpen(false)}>
              <View style={styles.sideMenuOverlay}>
                <TouchableWithoutFeedback>
                  <Animated.View style={[styles.sideMenuContainer, { transform: [{ translateX: sideMenuTranslateX }] }]}>
                    
                    <View style={styles.sideMenuHeader}>
                      <Text style={styles.sideMenuHeaderTitle}>Navegación</Text>
                      <TouchableOpacity onPress={() => setSideMenuOpen(false)} style={styles.sideMenuCloseBtn}>
                        <Ionicons name="close" size={20} color="#6b7280" />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={styles.sideMenuItem} onPress={() => { setSideMenuOpen(false); navigation.navigate('Main', { screen: 'Inicio' }); }}>
                      <View style={styles.sideMenuIconBox}>
                        <Ionicons name="home" size={20} color="#16a34a" />
                      </View>
                      <Text style={styles.sideMenuItemText}>Inicio</Text>
                    </TouchableOpacity>

                    {hasRoutePermission(user, 'Pedidos') && (
                      <TouchableOpacity style={styles.sideMenuItem} onPress={() => { setSideMenuOpen(false); navigation.navigate('Main', { screen: 'Pedidos' }); }}>
                        <View style={styles.sideMenuIconBox}>
                          <Ionicons name="receipt" size={20} color="#16a34a" />
                        </View>
                        <Text style={styles.sideMenuItemText}>Pedidos</Text>
                      </TouchableOpacity>
                    )}
                    
                    <View style={styles.sideMenuDivider} />
                    <Text style={styles.sideMenuSubtitle}>VISTAS RECIENTES</Text>
                    
                    {recentHistory.length === 0 ? (
                      <Text style={styles.sideMenuEmpty}>No hay historial aún</Text>
                    ) : (
                      recentHistory.map((item, index) => (
                        <TouchableOpacity 
                          key={`side-${item.name}-${index}`}
                          style={styles.sideMenuRecentItem}
                          onPress={() => {
                              setSideMenuOpen(false);
                              if (item.name === 'Inicio' || item.name === 'Pedidos') {
                                navigation.navigate('Main' as any, { screen: item.name, params: item.params });
                              } else {
                                navigation.navigate(item.name as any, item.params);
                              }
                            }}
                        >
                          <Ionicons name={item.icon as any} size={16} color="#6b7280" style={{ marginRight: 10 }} />
                          <Text style={styles.sideMenuRecentText} numberOfLines={1}>{item.label}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </Animated.View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </Modal>
        </>
      )}

      {/* -------------------- MODO 2: DOCK INFERIOR NORMAL (RESTO DE PANTALLAS) -------------------- */}
      {shouldRenderBottomDock && (
        <>
          {/* Tooltip Overlay */}
          {showTooltip && (
            <Modal transparent animationType="fade" visible={showTooltip} onRequestClose={() => setShowTooltip(false)}>
              <TouchableWithoutFeedback onPress={() => setShowTooltip(false)}>
                <View style={styles.tooltipOverlay}>
                  <TouchableWithoutFeedback>
                    <View style={[styles.tooltipContainer, { bottom: Math.max(insets.bottom + 15, 20) + 70 }]}>
                      <View style={styles.tooltipArrow} />
                      <Text style={styles.tooltipTitle}>Recientes</Text>
                      
                      {recentHistory.length === 0 ? (
                        <Text style={styles.tooltipEmpty}>No hay historial aún</Text>
                      ) : (
                        recentHistory.map((item, index) => (
                          <TouchableOpacity 
                            key={`${item.name}-${index}`}
                            style={styles.tooltipItem}
                            onPress={() => {
                                setShowTooltip(false);
                                if (item.name === 'Inicio' || item.name === 'Pedidos') {
                                  navigation.navigate('Main' as any, { screen: item.name, params: item.params });
                                } else {
                                  navigation.navigate(item.name as any, item.params);
                                }
                              }}
                          >
                            <View style={styles.tooltipIconBox}>
                              <Ionicons name={item.icon as any} size={16} color="#16a34a" />
                            </View>
                            <Text style={styles.tooltipItemText} numberOfLines={1}>{item.label}</Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  </TouchableWithoutFeedback>
                </View>
              </TouchableWithoutFeedback>
            </Modal>
          )}

          {/* Main Dock */}
          <Animated.View 
            style={[
              styles.container, 
              { 
                transform: [{ translateY }],
                bottom: Math.max(insets.bottom + 15, 20)
              }
            ]}
            pointerEvents={isVisible ? "box-none" : "none"}
          >
            <View style={styles.dock}>
              <TouchableOpacity 
                style={styles.button} 
                onPress={() => navigation.navigate('Main', { screen: 'Inicio' })}
              >
                <Ionicons name="home" size={24} color="#16a34a" />
                <Text style={styles.label}>Inicio</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              {hasRoutePermission(user, 'Pedidos') && (
                <>
                  <TouchableOpacity 
                    style={styles.button} 
                    onPress={() => navigation.navigate('Main', { screen: 'Pedidos' })}
                  >
                    <Ionicons name="receipt" size={24} color="#16a34a" />
                    <Text style={styles.label}>Pedidos</Text>
                  </TouchableOpacity>

                  <View style={styles.divider} />
                </>
              )}

              <TouchableOpacity 
                style={styles.button} 
                onPress={() => setShowTooltip(true)}
              >
                <View style={styles.recentIconContainer}>
                  <Ionicons name="time" size={24} color="#16a34a" />
                  {recentHistory.length > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{recentHistory.length}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.label}>Recientes</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 9999,
  },
  dock: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 1)',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 10,
    color: '#374151',
    fontWeight: '700',
    marginTop: 4,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: '#f3f4f6',
    marginHorizontal: 4,
  },
  recentIconContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: '#ef4444',
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: 'bold',
  },
  
  // Tooltip Styles
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  tooltipContainer: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    width: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  tooltipArrow: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    width: 12,
    height: 12,
    backgroundColor: '#fff',
    transform: [{ rotate: '45deg' }],
  },
  tooltipTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9ca3af',
    marginBottom: 8,
    paddingHorizontal: 4,
    textTransform: 'uppercase',
  },
  tooltipEmpty: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 10,
  },
  tooltipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    marginBottom: 6,
  },
  tooltipIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  tooltipItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  
  // Side Drawer Styles (Modo 1)
  sideTab: {
    position: 'absolute',
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 12,
    paddingLeft: 6,
    paddingRight: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: -2, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9998,
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: '#e5e7eb',
  },
  sideMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  sideMenuContainer: {
    backgroundColor: '#fff',
    width: 220,
    height: 'auto',
    maxHeight: '80%',
    marginRight: 12,
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 15,
  },
  sideMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  sideMenuHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  sideMenuCloseBtn: {
    padding: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
  },
  sideMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  sideMenuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sideMenuItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  sideMenuDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 16,
  },
  sideMenuSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    letterSpacing: 1,
    marginBottom: 12,
  },
  sideMenuEmpty: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 10,
  },
  sideMenuRecentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  sideMenuRecentText: {
    fontSize: 14,
    color: '#4b5563',
    fontWeight: '500',
  }
});

export default FloatingDock;
