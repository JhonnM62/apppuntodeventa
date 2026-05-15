import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Switch, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import useAuthStore from '../../store/useAuthStore';
import { getNotificationSettings, updateNotificationSettings, NotificationSettings } from '../../services/notifications';
import Toast from 'react-native-toast-message';

export default function NotificationSettingsScreen() {
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    try {
      const data = await getNotificationSettings(user?.id || user?.IDusuarios);
      setSettings(data);
    } catch (error) {
      console.error('Error loading notification settings:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudieron cargar las configuraciones.' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key: keyof NotificationSettings, value: boolean) => {
    // Si settings es null, creamos un objeto vacío por defecto para actualizar
    const currentSettings = settings || {} as NotificationSettings;
    
    // Optimistic UI update
    setSettings({ ...currentSettings, [key]: value });
    
    try {
      await updateNotificationSettings(user?.id || user?.IDusuarios, { [key]: value });
    } catch (error) {
      // Revert on error
      setSettings({ ...currentSettings, [key]: !value });
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo guardar la configuración.' });
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  const renderSwitch = (label: string, key: keyof NotificationSettings, isCritical: boolean = false) => (
    <View key={key as string} className="flex-row justify-between items-center py-3 border-b border-gray-100">
      <View className="flex-1 pr-4">
        <Text className="text-gray-800 text-base font-medium">{label}</Text>
        {isCritical && (
          <Text className="text-red-500 text-xs font-bold mt-0.5">ALERTA CRÍTICA</Text>
        )}
      </View>
      <Switch
        trackColor={{ false: '#d1d5db', true: '#86efac' }}
        thumbColor={settings?.[key] ? '#16a34a' : '#f3f4f6'}
        onValueChange={(val) => handleToggle(key, val)}
        value={Boolean(settings?.[key])}
      />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
      <View className="flex-row items-center px-4 py-3 bg-white shadow-sm z-10">
        <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 -ml-2 rounded-full active:bg-gray-100">
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-800 ml-2">Notificaciones Push</Text>
      </View>

      <ScrollView 
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-gray-500 mb-4">
          Configura de qué eventos deseas recibir notificaciones Push en tu dispositivo. Los cambios se guardan automáticamente.
        </Text>

        {/* Sección Ventas */}
        <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
          <View className="flex-row items-center mb-2">
            <MaterialCommunityIcons name="receipt" size={22} color="#16a34a" />
            <Text className="text-lg font-bold text-gray-800 ml-2">Ventas / Pedidos</Text>
          </View>
          {renderSwitch('Nueva Venta Creada', 'notifyVentaCreated')}
          {renderSwitch('Venta Modificada', 'notifyVentaUpdated')}
          {renderSwitch('Venta Eliminada / Anulada', 'notifyVentaDeleted', true)}
          {renderSwitch('Papelera de Ventas Vaciada', 'notifyVentaTrashEmpty')}
        </View>

        {/* Sección Caja */}
        <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
          <View className="flex-row items-center mb-2">
            <MaterialCommunityIcons name="cash-register" size={22} color="#16a34a" />
            <Text className="text-lg font-bold text-gray-800 ml-2">Caja y Flujo de Efectivo</Text>
          </View>
          {renderSwitch('Apertura de Caja', 'notifyCajaOpened')}
          {renderSwitch('Cierre de Caja (Cuadre Perfecto)', 'notifyCajaClosedPerfect')}
          {renderSwitch('Cierre de Caja con Descuadre', 'notifyCajaClosedMismatch', true)}
          {renderSwitch('Caja Eliminada', 'notifyCajaDeleted')}
          {renderSwitch('Modificación en Insumos', 'notifyOrderInventarioUpdated', true)}
        </View>

        {/* Sección Productos */}
        <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
          <View className="flex-row items-center mb-2">
            <MaterialCommunityIcons name="hamburger" size={22} color="#16a34a" />
            <Text className="text-lg font-bold text-gray-800 ml-2">Productos (Menú)</Text>
          </View>
          {renderSwitch('Nuevo Producto Creado', 'notifyProductoCreated')}
          {renderSwitch('Cambio de Precio', 'notifyProductoPriceChanged', true)}
          {renderSwitch('Modificación de Receta', 'notifyProductoRecipeChanged', true)}
          {renderSwitch('Producto Eliminado', 'notifyProductoDeleted')}
        </View>

        {/* Sección Dinero Guardado */}
        <View className="bg-white rounded-2xl p-4 mb-8 shadow-sm border border-gray-100">
          <View className="flex-row items-center mb-2">
            <MaterialCommunityIcons name="safe" size={22} color="#16a34a" />
            <Text className="text-lg font-bold text-gray-800 ml-2">Dinero / Gastos</Text>
          </View>
          {renderSwitch('Retiro de Dinero Guardado', 'notifyDineroRetirado', true)}
          {renderSwitch('Nuevo Gasto Registrado', 'notifyGastoCreated')}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}