import React, { useState, useEffect, useCallback } from 'react';
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from '@react-navigation/native';

import { Text } from '../../components/ui/text';
import { checkCajaActiva, getCajas } from '../../services/caja';
import { formatTime12h, formatDateToReadable } from '../../utils/formatters';
import useSocketEvent from '../../hooks/useSocketEvent';
import { useSocket } from '../../context/SocketContext';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import { usePermissions } from '../../hooks/usePermissions';

export default function CajaListScreen({ navigation }: any) {
  const { canCreate } = usePermissions('caja');

  const [cajas, setCajas] = useState<any[]>([]);
  const [cajaActiva, setCajaActiva] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const handleScroll = useScrollDirection();

  const fetchCajas = useCallback(async () => {
    setLoading(true);
    try {
      const [activa, allCajas] = await Promise.all([
        checkCajaActiva(),
        getCajas()
      ]);
      setCajaActiva(activa);
      setCajas(allCajas || []);
    } catch (error) {
      console.error('Error fetching cajas:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const { joinRoom } = useSocket();

  useEffect(() => {
    // Unirse al room de caja para recibir actualizaciones en tiempo real
    joinRoom('caja');
  }, [joinRoom]);

  useSocketEvent('refreshCaja', (data: any) => {
    console.log('Socket event refreshCaja received in List:', data);
    // Refrescar la lista de cajas si hay algún cambio
    fetchCajas();
  });

  useFocusEffect(
    useCallback(() => {
      fetchCajas();
    }, [fetchCajas])
  );

  const handlePressCaja = (caja: any) => {
    navigation.navigate('CajaForm', { cajaId: caja.IDcaja });
  };

  const formatDateToLocalYYYYMMDD = (isoString: string) => {
    if (!isoString) return '';
    return isoString.substring(0, 10);
  };

  const renderItem = ({ item }: { item: any }) => {
    const isActiva = item.cierre === 'abierta';
    const bgColor = isActiva ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200';
    const statusColor = isActiva ? 'text-green-600' : 'text-gray-500';

    return (
      <TouchableOpacity 
        onPress={() => handlePressCaja(item)}
        className={`p-4 rounded-xl border ${bgColor} mb-3 shadow-sm flex-row items-center justify-between`}
      >
        <View className="flex-1">
          <View className="flex-row items-center mb-1">
            <Ionicons name={isActiva ? "lock-open" : "lock-closed"} size={16} color={isActiva ? "#16a34a" : "#6b7280"} />
            <Text className={`font-bold ml-2 ${statusColor}`}>
              {isActiva ? 'CAJA ACTIVA' : 'CAJA CERRADA'}
            </Text>
          </View>
          <Text className="text-gray-800 font-semibold text-base capitalize">
            {formatDateToReadable(item.fechaDeApertura)}
          </Text>
          <Text className="text-gray-500 text-sm">
            Apertura: {formatTime12h(item.horaDeApertura)} {isActiva ? ' - En curso...' : item.horaDeCierre ? ` - Cierre: ${formatTime12h(item.horaDeCierre)}` : ''}
          </Text>
          <Text className="text-gray-600 text-sm mt-1">
            Responsable: {item.nombre || 'N/A'}
          </Text>
        </View>
        <View className="items-end">
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <SafeAreaView style={{ backgroundColor: '#4CAF50' }} edges={['top']}>
        <View className="bg-primary flex-row items-center justify-between px-4 py-3 shadow-md" style={{ backgroundColor: '#4CAF50' }}>
          <View className="flex-row items-center">
            <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 mr-2">
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text className="text-white text-xl font-bold">Registros de Caja</Text>
          </View>
          
          {/* Header Action Button */}
          {!loading && canCreate && (
            <TouchableOpacity
              className={`flex-row items-center px-3 py-2 rounded-full ${cajaActiva ? 'bg-red-500' : 'bg-white'}`}
              style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 }}
              onPress={() => {
                if (cajaActiva) {
                  const idToOpen = cajaActiva.IDcaja || cajas.find(c => c.cierre === 'abierta')?.IDcaja;
                  navigation.navigate('CajaForm', { cajaId: idToOpen });
                } else {
                  navigation.navigate('CajaForm');
                }
              }}
            >
              <Ionicons name={cajaActiva ? "lock-closed" : "add"} size={18} color={cajaActiva ? "#fff" : "#4CAF50"} />
              <Text className={`font-bold ml-1 ${cajaActiva ? 'text-white' : 'text-green-600'}`}>
                {cajaActiva ? 'Ir a caja' : 'Abrir'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      <View className="flex-1 px-4 pt-4">
        {loading ? (
          <ActivityIndicator size="large" color="#22c55e" className="mt-10" />
        ) : (
          <FlashList
            data={cajas}
            renderItem={renderItem}
            estimatedItemSize={100}
            onScroll={handleScroll}
            keyExtractor={(item) => item.IDcaja}
            contentContainerStyle={{ paddingBottom: 100 }}
            ListEmptyComponent={
              <View className="items-center justify-center mt-10">
                <Ionicons name="cash-outline" size={64} color="#d1d5db" />
                <Text className="text-gray-500 text-lg mt-4">No hay registros de caja</Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}
