import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Keyboard, Animated, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { FlashList as OriginalFlashList } from '@shopify/flash-list';
const FlashList = OriginalFlashList as any;
import { Input } from '../../components/ui/input';
import { getClientes, Cliente } from '../../services/clientes.service';
import { usePermissions } from '../../hooks/usePermissions';
import { useScrollDirection } from '../../hooks/useScrollDirection';

export default function ClientesListScreen({ navigation }: any) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | null>(null);
  const [showFilterOptions, setShowFilterOptions] = useState(false);
  
  const { canCreate, canEdit } = usePermissions('clientes');
  const flashListRef = useRef<any>(null);

  // Keyboard and search optimization
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Animación para el Skeleton
  const skeletonAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonAnim, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(skeletonAnim, { toValue: 0.3, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, []);

  const renderSkeletonCliente = () => (
    <View className="bg-white p-4 rounded-2xl mb-3 border border-gray-100 flex-row items-center justify-between" style={{ elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
      <View className="flex-1 mr-4">
        <View className="flex-row items-center mb-2">
          <Animated.View style={{ height: 14, width: 30, backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim, marginRight: 8 }} />
          <Animated.View style={{ height: 18, width: '60%', backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim }} />
        </View>
        <View className="flex-row items-center">
          <Animated.View style={{ height: 14, width: '40%', backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim, marginRight: 12 }} />
          <Animated.View style={{ height: 14, width: '30%', backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim }} />
        </View>
      </View>
      <View className="items-end justify-center">
        <Animated.View style={{ height: 20, width: 40, backgroundColor: '#e5e7eb', borderRadius: 6, opacity: skeletonAnim, marginBottom: 8 }} />
        <Animated.View style={{ height: 16, width: 16, backgroundColor: '#e5e7eb', borderRadius: 8, opacity: skeletonAnim }} />
      </View>
    </View>
  );

  const fetchClientes = async (pageNumber = 1, query = searchQuery, filterState = filterActive, shouldAppend = false) => {
    try {
      if (pageNumber === 1) setLoading(true);
      else setLoadingMore(true);

      const response: any = await getClientes(pageNumber, 20, query, filterState !== null ? filterState : undefined);
      
      console.log('[DEBUG Clientes] Respuesta cruda:', JSON.stringify(response).substring(0, 300));
      
      let parsedData: any[] = [];
      let meta: any = {};

      if (Array.isArray(response)) {
        parsedData = response;
      } else if (response?.data) {
        if (Array.isArray(response.data)) {
          parsedData = response.data;
          meta = response.meta || {};
        } else if (response.data.data && Array.isArray(response.data.data)) {
          parsedData = response.data.data;
          meta = response.data.meta || response.meta || {};
        }
      } else if (response?.success && response?.data) {
         parsedData = response.data;
      }

      console.log('[DEBUG Clientes] parsedData extraído (array):', Array.isArray(parsedData), 'Longitud:', parsedData.length);
      console.log('[DEBUG Clientes] meta extraído:', JSON.stringify(meta));

      if (shouldAppend) {
        setClientes(prev => [...prev, ...parsedData]);
      } else {
        setClientes(parsedData);
      }
      
      setHasNextPage(meta.hasNextPage ?? false);
      setPage(meta.page ?? pageNumber);
    } catch (error) {
      console.error('Error fetching clientes:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    // Fetch inicial al montar el componente (para solucionar el bug de pantalla vacía al iniciar sesión)
    fetchClientes(1, searchQuery, filterActive, false);
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchClientes(1, searchQuery, filterActive, false);
    });
    return unsubscribe;
  }, [navigation, searchQuery, filterActive]);

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    searchTimeoutRef.current = setTimeout(() => {
      fetchClientes(1, text, filterActive, false);
    }, 500);
  };

  const handleFilterChange = (isActive: boolean | null) => {
    setFilterActive(isActive);
    setShowFilterOptions(false);
    fetchClientes(1, searchQuery, isActive, false);
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasNextPage) {
      fetchClientes(page + 1, searchQuery, filterActive, true);
    }
  };

  const renderItem = ({ item }: { item: Cliente }) => (
    <TouchableOpacity
      className="bg-white p-4 rounded-2xl mb-3 border border-gray-100 flex-row items-center justify-between"
      style={{ elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}
      onPress={() => navigation.navigate('ClienteDetail', { id: item.IDcliente })}
    >
      <View className="flex-1 mr-4">
        <View className="flex-row items-center mb-1">
          <Text className="text-gray-500 text-xs font-bold w-12 mr-2" numberOfLines={1}>
            #{item.IDcliente}
          </Text>
          <Text className="text-gray-900 font-bold text-lg flex-1" numberOfLines={1}>
            {item.nombre || 'Sin nombre'}
          </Text>
        </View>
        <View className="flex-row items-center">
          {item.whatsapp && (
            <View className="flex-row items-center mr-3">
              <Ionicons name="logo-whatsapp" size={14} color="#16a34a" />
              <Text className="text-gray-600 ml-1 text-sm">{item.whatsapp}</Text>
            </View>
          )}
          {item.cedula && (
            <View className="flex-row items-center">
              <Ionicons name="card-outline" size={14} color="#6b7280" />
              <Text className="text-gray-600 ml-1 text-sm">{item.cedula}</Text>
            </View>
          )}
        </View>
      </View>
      
      <View className="items-end justify-center">
        <View className="bg-blue-50 px-2 py-1 rounded-lg flex-row items-center border border-blue-100">
          <Ionicons name="star" size={12} color="#3b82f6" />
          <Text className="text-blue-700 font-bold ml-1 text-xs">{item.contador != null ? item.contador : (item.compras || 0)}/10</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#9ca3af" style={{ marginTop: 8 }} />
      </View>
    </TouchableOpacity>
  );

  // Hide FloatingDock logic when scrolling down
  const handleScroll = useScrollDirection();
  
  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <StatusBar style="dark" backgroundColor="transparent" translucent />
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
      <View className="px-4 py-3 bg-white border-b border-gray-200 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3">
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-900">Clientes</Text>
        </View>
        {canCreate && (
          <TouchableOpacity 
            onPress={() => navigation.navigate('ClienteForm')}
            className="bg-green-600 px-3 py-1.5 rounded-lg flex-row items-center"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text className="text-white font-bold ml-1">Nuevo</Text>
          </TouchableOpacity>
        )}
      </View>

      <View className="px-4 py-3 flex-row items-center space-x-2">
        <View className="flex-1 flex-row items-center bg-white border border-gray-300 rounded-xl px-3 h-12" style={{ elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
          <Ionicons name="search" size={20} color="#9ca3af" />
          <TextInput
            style={{ flex: 1, marginLeft: 8, color: '#111827', fontSize: 16 }}
            placeholder="Buscar por ID, nombre, whatsapp..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={handleSearch}
            keyboardType="numeric"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={20} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
        
        <View className="relative">
          <TouchableOpacity 
            onPress={() => setShowFilterOptions(!showFilterOptions)}
            className={`h-12 w-12 rounded-xl flex items-center justify-center border ${filterActive !== null ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-300'}`}
            style={{ elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}
          >
            <Ionicons name="filter" size={20} color={filterActive !== null ? "#3b82f6" : "#6b7280"} />
          </TouchableOpacity>
          
          {showFilterOptions && (
            <View className="absolute top-14 right-0 bg-white rounded-xl border border-gray-200 w-40 z-50 overflow-hidden" style={{ elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 }}>
              <TouchableOpacity 
                className={`px-4 py-3 border-b border-gray-100 ${filterActive === null ? 'bg-blue-50' : ''}`}
                onPress={() => handleFilterChange(null)}
              >
                <Text className={`text-sm ${filterActive === null ? 'font-bold text-blue-600' : 'text-gray-700'}`}>Todos los clientes</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className={`px-4 py-3 border-b border-gray-100 ${filterActive === true ? 'bg-blue-50' : ''}`}
                onPress={() => handleFilterChange(true)}
              >
                <Text className={`text-sm ${filterActive === true ? 'font-bold text-blue-600' : 'text-gray-700'}`}>Solo Activos</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className={`px-4 py-3 ${filterActive === false ? 'bg-blue-50' : ''}`}
                onPress={() => handleFilterChange(false)}
              >
                <Text className={`text-sm ${filterActive === false ? 'font-bold text-blue-600' : 'text-gray-700'}`}>Inactivos</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {loading && clientes.length === 0 ? (
        <View className="flex-1 px-4 pt-3">
          {[...Array(6)].map((_, i) => <View key={i}>{renderSkeletonCliente()}</View>)}
        </View>
      ) : (
        <View className="flex-1 px-4">
          <FlashList
            ref={flashListRef}
            data={clientes}
            renderItem={renderItem}
            {...{ estimatedItemSize: 85 } as any}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom: 100 }}
            ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color="#3b82f6" style={{ marginVertical: 20 }} /> : null}
            ListEmptyComponent={
              <View className="flex-1 justify-center items-center py-10">
                <Ionicons name="people-outline" size={60} color="#d1d5db" />
                <Text className="text-gray-500 mt-4 text-center">No se encontraron clientes.</Text>
              </View>
            }
            keyboardShouldPersistTaps="handled"
          />
        </View>
      )}
      </SafeAreaView>
    </View>
  );
}
