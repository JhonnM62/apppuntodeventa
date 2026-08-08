import React from 'react';
import { View, TouchableOpacity, Text as RNText, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import useAuthStore from '../../store/useAuthStore';
import { usePermissions } from '../../hooks/usePermissions';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { useCustomAlert } from '../../context/CustomAlertContext';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

const MODULES = [
  {
    id: 'categorias',
    title: 'Categorías Productos',
    description: 'Gestionar categorías del menú',
    icon: 'food-fork-drink',
    color: '#f59e0b',
    route: 'Categorias',
  },
  {
    id: 'categorias_insumos',
    title: 'Categorías Insumos',
    description: 'Gestionar categorías de inventario',
    icon: 'package-variant',
    color: '#3b82f6',
    route: 'CategoriasInsumos',
  },
  {
    id: 'usuarios',
    title: 'Usuarios App',
    description: 'Gestionar accesos y roles',
    icon: 'account-group',
    color: '#8b5cf6',
    route: 'Users',
    adminOnly: true,
  },
  {
    id: 'mesas',
    title: 'Mesas',
    description: 'Gestionar distribución de mesas',
    icon: 'table-chair',
    color: '#14b8a6',
    route: 'Mesas',
  },
  {
    id: 'impresora',
    title: 'Impresora POS',
    description: 'Configurar impresora 58mm o 80mm',
    icon: 'printer-pos',
    color: '#0ea5e9',
    route: 'PrinterSettings',
  },
  {
    id: 'config_negocio',
    title: 'Negocio (Corte)',
    description: 'Ajustar horarios de corte y operación',
    icon: 'store-clock',
    color: '#4f46e5',
    route: 'ConfiguracionNegocio',
    adminOnly: true,
  },
  {
    id: 'config_avanzada',
    title: 'Visual y Offline',
    description: 'Colores, tipografía y Modo Offline',
    icon: 'palette-swatch',
    color: '#f43f5e',
    route: 'ConfiguracionAvanzada',
  },
  {
    id: 'notificaciones',
    title: 'Notificaciones Push',
    description: 'Configurar alertas y eventos',
    icon: 'bell-ring',
    color: '#ef4444',
    route: 'NotificationSettings',
    adminOnly: true,
  },
  {
    id: 'comentarios',
    title: 'Comentarios',
    description: 'Comentarios predefinidos para pedidos',
    icon: 'comment-text-multiple',
    color: '#ec4899',
    route: 'Comentarios',
  },
  {
    id: 'nomina_admin',
    title: 'Nómina Admin',
    description: 'Gestión de turnos y liquidaciones',
    icon: 'cash-multiple',
    color: '#10b981',
    route: 'AdminNomina',
    adminOnly: true,
  },
  {
    id: 'cargos_admin',
    title: 'Cargos y Salarios',
    description: 'Definir cargos de empleados',
    icon: 'badge-account-horizontal-outline',
    color: '#f59e0b',
    route: 'CargosList',
    adminOnly: true,
  },
  {
    id: 'reparto_descuentos',
    title: 'Reparto Descuentos',
    description: 'Gestionar bolsa y reparto',
    icon: 'percent-circle-outline',
    color: '#ec4899',
    route: 'RepartoDescuentos',
    adminOnly: true,
  },
  {
    id: 'mis_turnos',
    title: 'Mis Turnos',
    description: 'Historial de turnos y asistencias',
    icon: 'calendar-clock',
    color: '#3b82f6',
    route: 'MisTurnos',
  },
  {
    id: 'check_in',
    title: 'Check-In / Salida',
    description: 'Registrar entrada y salida',
    icon: 'clock-check-outline',
    color: '#8b5cf6',
    route: 'CheckIn',
  },
];

const SettingsScreen = ({ navigation }: Props) => {
  const { showAlert } = useCustomAlert();
  const { user, logout } = useAuthStore();
  const { canRead: canReadUsuarios } = usePermissions('config_usuarios');
  const { canRead: canReadComentarios } = usePermissions('config_comentarios');
  const { canRead: canReadImpresora } = usePermissions('config_impresora');
  const isAdminApp = user?.rol === 'Admin app' || user?.rol === 'Admin negocio';
  const insets = useSafeAreaInsets();

  const handleLogout = () => {
    showAlert({
      type: 'confirm',
      title: 'Cerrar Sesión',
      message: '¿Estás seguro de que deseas cerrar sesión?',
      confirmText: 'Cerrar Sesión',
      onConfirm: logout,
      onCancel: () => {},
    });
  };

  const getRoleColor = (rol: string) => {
    const colors: Record<string, string> = {
      'Admin app': '#8b5cf6',
      'Cajero': '#22c55e',
      'Mesero': '#3b82f6',
      'Cocina': '#f59e0b',
      'Proveedor': '#6366f1',
      'Domiciliario': '#ec4899',
      'Jefe': '#ef4444',
      'Admin negocio': '#14b8a6',
      'Inventarista': '#84cc16',
    };
    return colors[rol] || '#6b7280';
  };

  const openCurrentUserEdit = () => {
    showAlert({ type: 'info', title: 'Perfil', message: 'La edición de perfil está disponible en el módulo Usuarios App.' });
  };

  return (
    <View style={styles.container}>
      <View style={{ backgroundColor: '#fff', paddingTop: insets.top }}>
        <View style={styles.header}>
          <RNText style={styles.headerTitle}>Configuración</RNText>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={22} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.profileSection} onPress={openCurrentUserEdit} activeOpacity={0.8}>
          <View style={styles.profileAvatar}>
            <RNText style={styles.profileAvatarText}>
              {user?.nombre?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U'}
            </RNText>
          </View>
          <RNText style={styles.profileName}>{user?.nombre || 'Usuario'}</RNText>
          <RNText style={styles.profileEmail}>{user?.email || ''}</RNText>
          <View style={[styles.profileRoleBadge, { backgroundColor: getRoleColor(user?.rol || '') + '20' }]}>
            <RNText style={[styles.profileRoleBadgeText, { color: getRoleColor(user?.rol || '') }]}>
              {user?.rol || 'Sin rol'}
            </RNText>
          </View>
        </TouchableOpacity>

        <View style={styles.modulesGrid}>
          <RNText style={styles.sectionTitle}>MÓDULOS DE CONFIGURACIÓN</RNText>
          
          <View style={styles.gridContainer}>
            {MODULES.map((modulo) => {
              if (modulo.id === 'usuarios' && !canReadUsuarios) return null;
              if (modulo.id === 'impresora' && !canReadImpresora) return null;
              if (modulo.id === 'comentarios' && !canReadComentarios) return null;

              if (modulo.adminOnly && !isAdminApp && !['usuarios', 'impresora', 'comentarios'].includes(modulo.id)) return null;

              // Check read permissions for configuration modules
              const permissionMapping: Record<string, string> = {
                'categorias': 'inventario',
                'categorias_insumos': 'insumos',
                'mesas': 'configuracion',
                'notificaciones': 'configuracion',
                'config_negocio': 'configuracion',
              };

              const key = permissionMapping[modulo.id];
              if (key && user?.permisos && !isAdminApp) {
                if (!user.permisos[key]?.read) return null;
              }
              
              return (
                <TouchableOpacity
                  key={modulo.id}
                  style={styles.moduleCard}
                  onPress={() => navigation.navigate(modulo.route as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconContainer, { backgroundColor: modulo.color + '15' }]}>
                    <MaterialCommunityIcons name={modulo.icon as any} size={28} color={modulo.color} />
                  </View>
                  <RNText style={styles.moduleTitle}>{modulo.title}</RNText>
                  <RNText style={styles.moduleDesc} numberOfLines={2}>{modulo.description}</RNText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  logoutBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fef2f2', justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1 },
  profileSection: { alignItems: 'center', paddingVertical: 32, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  profileAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  profileAvatarText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  profileName: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 4 },
  profileEmail: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  profileRoleBadge: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16 },
  profileRoleBadgeText: { fontSize: 12, fontWeight: '700' },
  modulesGrid: { padding: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5, marginBottom: 16 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  moduleCard: { width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  iconContainer: { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  moduleTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 6 },
  moduleDesc: { fontSize: 12, color: '#6b7280', lineHeight: 16 },
});

export default SettingsScreen;
