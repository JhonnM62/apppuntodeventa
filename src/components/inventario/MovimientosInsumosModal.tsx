import React, { useEffect, useState } from 'react';
import { View, Modal, TouchableOpacity, Text, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/button';
import api from '../../services/api';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface MovimientosInsumosModalProps {
  visible: boolean;
  onClose: () => void;
}

export const MovimientosInsumosModal: React.FC<MovimientosInsumosModalProps> = ({ visible, onClose }) => {
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchMovimientos();
    }
  }, [visible]);

  const fetchMovimientos = async () => {
    setLoading(true);
    try {
      const response = await api.get('/movimientos-insumos?limit=100');
      setMovimientos(response.data);
    } catch (error) {
      console.error('Error fetching movimientos:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTipoLabel = (tipo: string) => {
    switch(tipo) {
      case 'apertura_paquete': return 'Apertura de Paquete';
      case 'descuento_produccion': return 'Descuento Producción';
      case 'entrada': return 'Entrada';
      case 'salida': return 'Salida';
      case 'ajuste': return 'Ajuste Manual';
      default: return tipo;
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View className="bg-white p-3 rounded-lg border border-gray-200 mb-2 shadow-sm">
      <View className="flex-row justify-between items-center mb-1">
        <Text className="font-bold text-gray-800">{item.insumo?.nombre || 'Insumo'}</Text>
        <Text className="text-xs text-gray-500">
          {format(new Date(item.fechaYHora), "dd MMM yy, h:mm a", { locale: es })}
        </Text>
      </View>
      <View className="flex-row justify-between items-center">
        <View className="flex-row items-center">
          <Ionicons 
            name={item.cantidadDelta > 0 ? "arrow-up-circle" : "arrow-down-circle"} 
            size={16} 
            color={item.cantidadDelta > 0 ? "#10b981" : "#ef4444"} 
          />
          <Text className="ml-1 text-sm font-medium text-gray-600">{getTipoLabel(item.tipo)}</Text>
        </View>
        <Text className={`font-bold ${item.cantidadDelta > 0 ? "text-green-600" : "text-red-600"}`}>
          {item.cantidadDelta > 0 ? '+' : ''}{item.cantidadDelta}
        </Text>
      </View>
      <View className="mt-1 flex-row justify-between">
        <Text className="text-xs text-gray-500 line-clamp-1 flex-1 mr-2">{item.observacion}</Text>
        <Text className="text-xs text-gray-400">Por: {item.usuario}</Text>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-gray-100 h-[80%] rounded-t-3xl p-4">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-xl font-bold text-gray-800">Historial de Movimientos</Text>
            <TouchableOpacity onPress={onClose} className="p-2 bg-gray-200 rounded-full">
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>
          
          {loading ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator size="large" color="#4f46e5" />
            </View>
          ) : (
            <FlatList
              data={movimientos}
              keyExtractor={(item) => item.IDmovimiento}
              renderItem={renderItem}
              contentContainerStyle={{ paddingBottom: 40 }}
              ListEmptyComponent={
                <View className="py-8 items-center">
                  <Ionicons name="receipt-outline" size={48} color="#9ca3af" />
                  <Text className="text-gray-500 mt-2">No hay movimientos recientes</Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
};
