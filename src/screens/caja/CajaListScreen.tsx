import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, TouchableOpacity, ActivityIndicator, Keyboard, TextInput, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FlashList as OriginalFlashList } from '@shopify/flash-list';
const FlashList = OriginalFlashList as any;
import { useFocusEffect } from '@react-navigation/native';

import { Text } from '../../components/ui/text';
import { checkCajaActiva, getCajas } from '../../services/caja';
import { formatTime12h, formatDateToReadable, formatCurrency } from '../../utils/formatters';
import useSocketEvent from '../../hooks/useSocketEvent';
import { useSocket } from '../../context/SocketContext';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import { usePermissions } from '../../hooks/usePermissions';
import useAuthStore from '../../store/useAuthStore';
import { useCustomAlert } from '../../context/CustomAlertContext';
import Toast from 'react-native-toast-message';
import { reabrirCaja } from '../../services/caja';
import { useSettingsStore } from '../../store/useSettingsStore';

import { useCajaCacheStore } from '../../store/useCajaCacheStore';

export default function CajaListScreen({ navigation }: any) {
  const { canCreate } = usePermissions('caja');
  const { user } = useAuthStore();
  const { showAlert } = useCustomAlert();
  const { primaryColor } = useSettingsStore();

  // Use global cache store for SWR (Stale-While-Revalidate) pattern
  const { cajas, cajaActiva, lastFetch } = useCajaCacheStore();
  
  // Only show loader if we have absolutely no cache
  const [loading, setLoading] = useState(lastFetch === 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'activos' | 'cerrados'>('activos');

  const handleScroll = useScrollDirection();

  const fetchCajas = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [activa, allCajas] = await Promise.all([
        checkCajaActiva(),
        getCajas()
      ]);
      // Update global cache (this triggers re-renders automatically because we consume the store)
      useCajaCacheStore.getState().setCajas(allCajas || [], activa);
    } catch (error) {
      console.error('Error fetching cajas:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const { joinRoom } = useSocket();

  useEffect(() => {
    joinRoom('caja');
  }, [joinRoom]);

  useSocketEvent('refreshCaja', (data: any) => {
    fetchCajas(true); // Silent refresh on background updates
  });

  useFocusEffect(
    useCallback(() => {
      // If we already have cache, we fetch silently in background
      const hasCache = useCajaCacheStore.getState().lastFetch > 0;
      fetchCajas(hasCache);
    }, [fetchCajas])
  );

  const handlePressCaja = (caja: any) => {
    navigation.navigate('CajaForm', { cajaId: caja.IDcaja });
  };

  const processedData = useMemo(() => {
    if (!cajas.length) return [];

    // Filter
    let filtered = cajas;
    
    if (activeTab === 'activos') {
      filtered = filtered.filter(c => c.cierre === 'abierta' || (!c.cierre && !c.fechaDeCierre && !c.horaDeCierre));
    } else {
      filtered = filtered.filter(c => c.cierre && c.cierre !== 'abierta');
    }

    if (searchQuery.trim().length > 0) {
      const lowerQ = searchQuery.toLowerCase();
      filtered = cajas.filter(c => 
        c.nombre?.toLowerCase().includes(lowerQ) ||
        (c.cierre === 'abierta' ? 'activa abierta curso' : 'cerrada').includes(lowerQ) ||
        (c.cuadroCaja?.toLowerCase() === 'no cuadro caja' && 'descuadrada'.includes(lowerQ)) ||
        (c.cuadroCaja?.toLowerCase() === 'no se ha revisado' && 'pendiente revisado'.includes(lowerQ))
      );
    }

    // Group
    const groups: Record<string, any[]> = {};
    filtered.forEach(c => {
      let d = new Date(c.fechaDeApertura);
      if (typeof c.fechaDeApertura === 'string' && c.fechaDeApertura.includes('-')) {
        const datePart = c.fechaDeApertura.split('T')[0];
        const [year, month, day] = datePart.split('-');
        d = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
      }
      
      let monthYear = 'Sin fecha';
      if (!isNaN(d.getTime())) {
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        monthYear = `${months[d.getMonth()]} ${d.getFullYear()}`;
      }
      
      if (!groups[monthYear]) {
         groups[monthYear] = [];
      }
      groups[monthYear].push(c);
    });

    // Flatten for FlashList
    const result: any[] = [];
    Object.keys(groups).forEach(key => {
      result.push({ isHeader: true, title: key, count: groups[key].length, IDcaja: `header-${key}` });
      groups[key].forEach(c => {
        result.push({ isHeader: false, ...c });
      });
    });

    return result;
  }, [cajas, searchQuery, activeTab]);

  const renderItem = ({ item }: { item: any }) => {
    if (item.isHeader) {
      return (
        <View className="bg-gray-200/80 px-4 py-2 mt-4 mb-2 rounded-lg flex-row justify-between items-center mx-1">
          <Text className="font-black text-gray-800 uppercase tracking-wider text-sm">{item.title}</Text>
          <View className={`rounded-full px-2.5 py-0.5 shadow-sm ${activeTab === 'activos' ? '' : 'bg-gray-500'}`} style={activeTab === 'activos' ? { backgroundColor: primaryColor || '#16a34a' } : {}}>
            <Text className="text-xs text-white font-black">{item.count} {item.count === 1 ? 'caja' : 'cajas'}</Text>
          </View>
        </View>
      );
    }

    const isActiva = item.cierre === 'abierta';
    const isDescuadrada = item.cuadroCaja?.toUpperCase() === 'NO CUADRO CAJA';
    const isSinRevisar = item.cuadroCaja?.toUpperCase() === 'NO SE HA REVISADO';
    const isExcedente = item.valorExcedente > 0;
    const isFaltante = item.valorFaltante > 0;

    const containerClass = `p-4 rounded-2xl mb-3 shadow-md border ${
      isActiva 
        ? 'bg-green-50 border-green-300 shadow-green-100' 
        : isDescuadrada
        ? 'bg-red-50 border-red-300 shadow-red-100'
        : isSinRevisar
        ? 'bg-amber-50 border-amber-300 shadow-amber-100'
        : 'bg-white border-gray-200 shadow-gray-100'
    }`;

    return (
      <TouchableOpacity 
        onPress={() => handlePressCaja(item)}
        onLongPress={() => {
          if (!isActiva && user?.rol === 'Admin app') {
            showAlert({
              type: 'confirm',
              title: 'Reabrir Caja',
              message: '¿Estás seguro de reabrir esta caja cerrada? Volverá al estado "En curso".',
              confirmText: 'Sí, Reabrir',
              onConfirm: async () => {
                try {
                  await reabrirCaja(item.IDcaja);
                  Toast.show({ type: 'success', text1: 'Éxito', text2: 'Caja reabierta' });
                  fetchCajas();
                } catch (err: any) {
                  Toast.show({ type: 'error', text1: 'Error', text2: err?.response?.data?.message || 'No se pudo reabrir' });
                }
              },
              onCancel: () => {},
            });
          }
        }}
        delayLongPress={600}
        className={containerClass}
      >
        {/* Top Row: Date & Status */}
        <View className="flex-row justify-between items-start mb-3">
          <View className="flex-row items-center flex-1 mr-2">
            <View className={`p-2 rounded-full ${isActiva ? 'bg-green-200' : isDescuadrada ? 'bg-red-200' : 'bg-gray-100'}`}>
              <Ionicons name={isActiva ? "lock-open" : isDescuadrada ? "warning" : "lock-closed"} size={16} color={isActiva ? "#15803d" : isDescuadrada ? "#b91c1c" : "#4b5563"} />
            </View>
            <View className="ml-2 flex-1">
              <Text className="text-gray-900 font-bold text-base capitalize" numberOfLines={1}>{formatDateToReadable(item.fechaDeApertura)}</Text>
              <Text className="text-gray-500 text-xs mt-0.5">
                Apertura: {formatTime12h(item.horaDeApertura)} {item.horaDeCierre ? `• Cierre: ${formatTime12h(item.horaDeCierre)}` : ''}
              </Text>
            </View>
          </View>
          <View className={`px-2 py-1 rounded-md border ${isActiva ? 'bg-green-100 border-green-200' : isDescuadrada ? 'bg-red-100 border-red-200' : 'bg-gray-100 border-gray-200'}`}>
            <Text className={`font-black text-[10px] ${isActiva ? 'text-green-700' : isDescuadrada ? 'text-red-700' : 'text-gray-600'}`}>
              {isActiva ? 'EN CURSO' : 'CERRADA'}
            </Text>
          </View>
        </View>

        {/* User & Apertura Row */}
        <View className="flex-row justify-between items-center bg-white/60 p-2.5 rounded-lg mb-2">
          <View>
            <Text className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Responsable</Text>
            <Text className="text-gray-800 font-semibold text-sm">{item.nombre || 'N/A'}</Text>
          </View>
          <View className="items-end">
            <Text className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Efectivo Apertura</Text>
            <Text className="text-emerald-700 font-black text-sm">{formatCurrency(item.efectivoDeApertura)}</Text>
          </View>
        </View>

        {/* Cuadre Tags Row */}
        {(!isActiva && (item.cuadroCaja || isExcedente || isFaltante)) && (
          <View className="flex-row flex-wrap mt-1">
            {item.cuadroCaja === 'NO CUADRO CAJA' ? (
              <View className="bg-red-600 px-2.5 py-1 rounded-md flex-row items-center mr-2 shadow-sm mb-1">
                <Ionicons name="alert-circle" size={12} color="#fff" style={{marginRight: 4}} />
                <Text className="text-white text-[10px] font-black uppercase tracking-wider">NO CUADRÓ</Text>
              </View>
            ) : item.cuadroCaja === 'SI CUADRO CAJA' ? (
              <View className="px-2.5 py-1 rounded-md flex-row items-center mr-2 shadow-sm mb-1" style={{ backgroundColor: primaryColor || '#16a34a' }}>
                <Ionicons name="checkmark-done" size={12} color="#fff" style={{marginRight: 4}} />
                <Text className="text-white text-[10px] font-black uppercase tracking-wider">CUADRÓ SÍ</Text>
              </View>
            ) : item.cuadroCaja === 'NO SE HA REVISADO' ? (
              <View className="bg-amber-500 px-2.5 py-1 rounded-md flex-row items-center mr-2 shadow-sm mb-1">
                <Ionicons name="time" size={12} color="#fff" style={{marginRight: 4}} />
                <Text className="text-white text-[10px] font-black uppercase tracking-wider">PENDIENTE</Text>
              </View>
            ) : null}

            {isFaltante && (
               <View className="bg-red-50 border border-red-300 px-2.5 py-1 rounded-md mr-2 mb-1">
                 <Text className="text-red-700 text-[10px] font-black tracking-wider">FALTANTE: -{formatCurrency(item.valorFaltante)}</Text>
               </View>
            )}
            {isExcedente && (
               <View className="bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-md mb-1">
                 <Text className="text-emerald-800 text-[10px] font-black tracking-wider">EXCEDENTE: +{formatCurrency(item.valorExcedente)}</Text>
               </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <SafeAreaView style={{ backgroundColor: primaryColor || '#10b981' }} edges={['top']}>
        <StatusBar backgroundColor={primaryColor || '#10b981'} barStyle="light-content" />
        <View style={{ backgroundColor: primaryColor || '#10b981' }} className="flex-row items-center justify-between px-4 py-3 shadow-md">
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
              <Ionicons name={cajaActiva ? "lock-closed" : "add"} size={18} color={cajaActiva ? "#fff" : "#0ea5e9"} />
              <Text className={`font-bold ml-1 ${cajaActiva ? 'text-white' : 'text-primary'}`}>
                {cajaActiva ? 'Ir a caja' : 'Abrir'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      <View className="bg-white px-4 py-2 border-b border-gray-100 z-10 shadow-sm">
        <View className="flex-row items-center bg-gray-100 rounded-lg px-3 py-1.5 border border-gray-200 mb-2">
          <Ionicons name="search" size={18} color="#9ca3af" />
          <TextInput
            className="flex-1 ml-2 text-gray-800 text-sm"
            placeholder="Buscar por responsable o estado..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>

        <View className="flex-row items-center bg-gray-100 rounded-md p-1">
          <TouchableOpacity
            onPress={() => setActiveTab('activos')}
            className={`flex-1 py-1.5 items-center rounded-md ${activeTab === 'activos' ? 'bg-white shadow-sm' : ''}`}
          >
            <Text className={`font-bold text-xs ${activeTab === 'activos' ? '' : 'text-gray-500'}`} style={activeTab === 'activos' ? { color: primaryColor || '#15803d' } : {}}>Activos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('cerrados')}
            className={`flex-1 py-1.5 items-center rounded-md ${activeTab === 'cerrados' ? 'bg-white shadow-sm' : ''}`}
          >
            <Text className={`font-bold text-xs ${activeTab === 'cerrados' ? 'text-gray-800' : 'text-gray-500'}`}>Cerrados</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="flex-1 px-4 pt-2">
        {loading ? (
          <ActivityIndicator size="large" color={primaryColor || "#22c55e"} className="mt-10" />
        ) : (
          <FlashList
            data={processedData}
            renderItem={renderItem}
            getItemType={(item) => typeof item === 'string' ? 'string' : item.isHeader ? 'sectionHeader' : 'row'}
            estimatedItemSize={160}
            onScroll={handleScroll}
            keyExtractor={(item, index) => item.IDcaja ? item.IDcaja : `key-${index}`}
            ListFooterComponent={<View style={{ height: 100 }} />}
            ListEmptyComponent={
              <View className="items-center justify-center mt-10">
                <Ionicons name="cash-outline" size={64} color="#d1d5db" />
                <Text className="text-gray-500 text-lg mt-4 font-semibold text-center px-4">
                  {searchQuery ? 'No hay registros que coincidan con tu búsqueda' : 'No hay registros de caja'}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}
