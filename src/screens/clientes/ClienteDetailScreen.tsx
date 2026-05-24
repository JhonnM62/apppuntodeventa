import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getClienteById, deleteCliente, Cliente } from '../../services/clientes.service';
import { usePermissions } from '../../hooks/usePermissions';
import Toast from 'react-native-toast-message';

import { useScrollDirection } from '../../hooks/useScrollDirection';
import { useCustomAlert } from '../../context/CustomAlertContext';

export default function ClienteDetailScreen({ route, navigation }: any) {
  const { showAlert } = useCustomAlert();
  const { id } = route.params;
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const { canEdit, canDelete } = usePermissions('clientes');

  // Move useScrollDirection BEFORE any early returns
  const handleScroll = useScrollDirection();

  const fetchCliente = async () => {
    try {
      const data = await getClienteById(id);
      setCliente(data);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cargar el cliente' });
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCliente();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', fetchCliente);
    return unsubscribe;
  }, [navigation, id]);

  const handleDelete = () => {
    showAlert({
      type: 'confirm',
      title: 'Eliminar Cliente',
      message: '¿Estás seguro de que deseas eliminar este cliente? Se mantendrá el historial de ventas pero el cliente ya no aparecerá en la lista.',
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          await deleteCliente(id);
          Toast.show({ type: 'success', text1: 'Cliente eliminado' });
          navigation.goBack();
        } catch (error) {
          Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo eliminar el cliente' });
        }
      },
    });
  };

  if (loading || !cliente) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      {/* Header */}
      <View className="px-4 py-3 bg-white border-b border-gray-200 flex-row items-center justify-between shadow-sm z-10">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3">
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-900">Detalle de Cliente</Text>
        </View>
        <View className="flex-row">
          {canDelete && (
            <TouchableOpacity onPress={handleDelete} className="bg-red-50 p-2 rounded-lg mr-2 border border-red-100">
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          )}
          {canEdit && (
            <TouchableOpacity 
              onPress={() => navigation.navigate('ClienteForm', { id: cliente.IDcliente })} 
              className="bg-blue-50 p-2 rounded-lg border border-blue-100"
            >
              <Ionicons name="pencil" size={20} color="#3b82f6" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }} 
        className="p-4"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Info Card */}
        <View className="bg-white rounded-2xl p-5 border border-gray-100 mb-4" style={{ elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
          <View className="items-center mb-6">
            <View className="w-20 h-20 bg-blue-100 rounded-full items-center justify-center mb-3">
              <Text className="text-blue-600 font-bold text-3xl">
                {cliente.nombre ? cliente.nombre.charAt(0).toUpperCase() : 'C'}
              </Text>
            </View>
            <Text className="text-2xl font-bold text-gray-900 text-center">{cliente.nombre}</Text>
            <Text className="text-gray-500 mt-1">ID: #{cliente.IDcliente}</Text>
          </View>

          <View className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-4">
            <View className="flex-row items-center mb-4">
              <Ionicons name="logo-whatsapp" size={20} color="#16a34a" />
              <View className="ml-3 flex-1">
                <Text className="text-xs text-gray-500 font-bold">WHATSAPP</Text>
                <Text className="text-gray-900 font-medium text-base">{cliente.whatsapp || 'No registrado'}</Text>
              </View>
            </View>
            
            <View className="flex-row items-center mb-4">
              <Ionicons name="card-outline" size={20} color="#6b7280" />
              <View className="ml-3 flex-1">
                <Text className="text-xs text-gray-500 font-bold">CÉDULA</Text>
                <Text className="text-gray-900 font-medium text-base">{cliente.cedula || 'No registrada'}</Text>
              </View>
            </View>

            <View className="flex-row items-center">
              <Ionicons name="calendar-outline" size={20} color="#6b7280" />
              <View className="ml-3 flex-1">
                <Text className="text-xs text-gray-500 font-bold">FECHA REGISTRO</Text>
                <Text className="text-gray-900 font-medium text-base">
                  {cliente.fecha_y_hora_creacion ? new Date(cliente.fecha_y_hora_creacion).toLocaleDateString('es-CO') : 'Desconocida'}
                </Text>
              </View>
            </View>
          </View>

          {/* Loyalty Stats */}
          <View className="bg-blue-50 rounded-xl p-4 border border-blue-100 mb-4 flex-row items-center justify-between">
            <View>
              <Text className="text-xs text-blue-600 font-bold mb-1">PROGRESO DE COMPRAS</Text>
              <Text className="text-blue-900 font-black text-2xl">{cliente.contador != null ? cliente.contador : (cliente.compras || 0)} / 10</Text>
            </View>
            <View className="items-end">
              <Ionicons name="star" size={40} color="#60a5fa" />
              <Text className="text-xs text-blue-500 font-medium mt-1">Total históricas: {cliente.compras || 0}</Text>
            </View>
          </View>

          {/* Observaciones */}
          <View className="mb-2">
            <Text className="text-xs text-gray-500 font-bold mb-2 uppercase">Observaciones</Text>
            <View className="bg-gray-50 rounded-xl p-4 border border-gray-200 min-h-[100px]">
              <Text className="text-gray-700 leading-relaxed">
                {cliente.observaciones || 'No hay observaciones registradas para este cliente.'}
              </Text>
            </View>
          </View>
        </View>

        {/* Historial Placeholder (Future iteration) */}
        <View className="bg-white rounded-2xl p-5 border border-gray-100 mb-8" style={{ elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-bold text-gray-900">Historial de Compras</Text>
            <Ionicons name="receipt-outline" size={20} color="#6b7280" />
          </View>
          <Text className="text-gray-500 text-sm italic">
            El historial detallado de ventas está asociado a las compras del cliente: {cliente.compras || 'Ninguna'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
