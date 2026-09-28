import React, { useState, useCallback, useMemo, useRef, memo } from 'react';
import { View, TouchableOpacity, ActivityIndicator, TextInput, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FlashList as OriginalFlashList } from '@shopify/flash-list';
const FlashList = OriginalFlashList as any;
import { useFocusEffect } from '@react-navigation/native';

import { Text } from '../../components/ui/text';
import { checkCajaActiva, getCajasPaginated, reabrirCaja } from '../../services/caja';
import { formatTime12h, formatDateToReadable, formatCurrency } from '../../utils/formatters';
import useSocketEvent from '../../hooks/useSocketEvent';
import { useSocket } from '../../context/SocketContext';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import { usePermissions } from '../../hooks/usePermissions';
import useAuthStore from '../../store/useAuthStore';
import { useCustomAlert } from '../../context/CustomAlertContext';
import Toast from 'react-native-toast-message';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useCajaCacheStore } from '../../store/useCajaCacheStore';
import { FloatingScrollButtons } from '../../components/ui/FloatingScrollButtons';

const PAGE_SIZE = 25;

// ─── Alturas fijas por tipo (evitan que FlashList re-mida = sin blancos al scrollear) ─
const HEADER_HEIGHT = 52;
const CARD_HEIGHT_BASE = 164;  // tarjeta sin tags
const CARD_HEIGHT_TAGS = 204;  // tarjeta con tags (faltante/excedente/cuadre)

// ─── Subcomponente de sección/mes ─────────────────────────────────────────────
// memo() = solo re-renderiza si sus props cambian
const SectionHeader = memo(({ title, count, isActivos, primaryColor }: {
  title: string;
  count: number;
  isActivos: boolean;
  primaryColor: string;
}) => (
  <View className="bg-gray-200/80 px-4 py-2 mt-4 mb-2 rounded-lg flex-row justify-between items-center mx-1">
    <Text className="font-black text-gray-800 uppercase tracking-wider text-sm">{title}</Text>
    <View
      className={`rounded-full px-2.5 py-0.5 shadow-sm ${!isActivos ? 'bg-gray-500' : ''}`}
      style={isActivos ? { backgroundColor: primaryColor || '#16a34a' } : {}}
    >
      <Text className="text-xs text-white font-black">
        {count} {count === 1 ? 'caja' : 'cajas'}
      </Text>
    </View>
  </View>
));

// ─── Subcomponente de tarjeta de caja ─────────────────────────────────────────
const CajaCard = memo(({ item, onPress, onLongPress, primaryColor }: {
  item: any;
  onPress: () => void;
  onLongPress: () => void;
  primaryColor: string;
}) => {
  const isActiva = item.cierre === 'abierta';
  const isDescuadrada = item.cuadroCaja?.toUpperCase() === 'NO CUADRO CAJA';
  const isSinRevisar = item.cuadroCaja?.toUpperCase() === 'NO SE HA REVISADO';
  const isExcedente = Number(item.valorExcedente) > 0;
  const isFaltante = Number(item.valorFaltante) > 0;

  const containerStyle = isActiva
    ? 'bg-green-50 border-green-300'
    : isDescuadrada
    ? 'bg-red-50 border-red-300'
    : isSinRevisar
    ? 'bg-amber-50 border-amber-300'
    : 'bg-white border-gray-200';

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={600}
      className={`p-4 rounded-2xl mb-3 border ${containerStyle}`}
      style={{ elevation: 2 }}
    >
      {/* Top Row: Fecha & Estado */}
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-row items-center flex-1 mr-2">
          <View className={`p-2 rounded-full ${isActiva ? 'bg-green-200' : isDescuadrada ? 'bg-red-200' : 'bg-gray-100'}`}>
            <Ionicons
              name={isActiva ? 'lock-open' : isDescuadrada ? 'warning' : 'lock-closed'}
              size={16}
              color={isActiva ? '#15803d' : isDescuadrada ? '#b91c1c' : '#4b5563'}
            />
          </View>
          <View className="ml-2 flex-1">
            <Text className="text-gray-900 font-bold text-base capitalize" numberOfLines={1}>
              {formatDateToReadable(item.fechaDeApertura)}
            </Text>
            <Text className="text-gray-500 text-xs mt-0.5">
              Apertura: {formatTime12h(item.horaDeApertura)}
              {item.horaDeCierre ? ` • Cierre: ${formatTime12h(item.horaDeCierre)}` : ''}
            </Text>
          </View>
        </View>
        <View className={`px-2 py-1 rounded-md border ${isActiva ? 'bg-green-100 border-green-200' : isDescuadrada ? 'bg-red-100 border-red-200' : 'bg-gray-100 border-gray-200'}`}>
          <Text className={`font-black text-[10px] ${isActiva ? 'text-green-700' : isDescuadrada ? 'text-red-700' : 'text-gray-600'}`}>
            {isActiva ? 'EN CURSO' : 'CERRADA'}
          </Text>
        </View>
      </View>

      {/* Responsable & Apertura */}
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

      {/* Tags de cuadre */}
      {(!isActiva && (item.cuadroCaja || isExcedente || isFaltante)) && (
        <View className="flex-row flex-wrap mt-1">
          {item.cuadroCaja === 'NO CUADRO CAJA' ? (
            <View className="bg-red-600 px-2.5 py-1 rounded-md flex-row items-center mr-2 shadow-sm mb-1">
              <Ionicons name="alert-circle" size={12} color="#fff" style={{ marginRight: 4 }} />
              <Text className="text-white text-[10px] font-black uppercase tracking-wider">NO CUADRÓ</Text>
            </View>
          ) : item.cuadroCaja === 'SI CUADRO CAJA' ? (
            <View className="px-2.5 py-1 rounded-md flex-row items-center mr-2 shadow-sm mb-1"
              style={{ backgroundColor: primaryColor || '#16a34a' }}>
              <Ionicons name="checkmark-done" size={12} color="#fff" style={{ marginRight: 4 }} />
              <Text className="text-white text-[10px] font-black uppercase tracking-wider">CUADRÓ SÍ</Text>
            </View>
          ) : item.cuadroCaja === 'NO SE HA REVISADO' ? (
            <View className="bg-amber-500 px-2.5 py-1 rounded-md flex-row items-center mr-2 shadow-sm mb-1">
              <Ionicons name="time" size={12} color="#fff" style={{ marginRight: 4 }} />
              <Text className="text-white text-[10px] font-black uppercase tracking-wider">PENDIENTE</Text>
            </View>
          ) : null}

          {isFaltante && (
            <View className="bg-red-50 border border-red-300 px-2.5 py-1 rounded-md mr-2 mb-1">
              <Text className="text-red-700 text-[10px] font-black tracking-wider">
                FALTANTE: -{formatCurrency(item.valorFaltante)}
              </Text>
            </View>
          )}
          {isExcedente && (
            <View className="bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-md mb-1">
              <Text className="text-emerald-800 text-[10px] font-black tracking-wider">
                EXCEDENTE: +{formatCurrency(item.valorExcedente)}
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
});

// ─── Footer del listado ────────────────────────────────────────────────────────
const ListFooter = memo(({ isFetchingMore, primaryColor }: {
  isFetchingMore: boolean;
  primaryColor: string;
}) => (
  <View style={{ paddingVertical: 16, alignItems: 'center' }}>
    {isFetchingMore && (
      <ActivityIndicator size="small" color={primaryColor || '#22c55e'} />
    )}
    <View style={{ height: 80 }} />
  </View>
));

// ─── Pantalla principal ────────────────────────────────────────────────────────
export default function CajaListScreen({ navigation }: any) {
  const { canCreate } = usePermissions('caja');
  const { user } = useAuthStore();
  const { showAlert } = useCustomAlert();
  const { primaryColor } = useSettingsStore();

  const {
    cajas,
    cajaActiva,
    lastFetch,
    currentPage,
    hasMore,
    isFetchingMore,
    setCajas,
    appendCajas,
    setIsFetchingMore,
  } = useCajaCacheStore();

  const [loading, setLoading] = useState(lastFetch === 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'activos' | 'cerrados'>('activos');

  const isFetchingRef = useRef(false);
  const listRef = useRef<any>(null);
  
  // ─── Control de Scroll y Botones Flotantes ───────────────────────────────────
  const [showScrollUp, setShowScrollUp] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const handleScrollBase = useScrollDirection();
  
  const handleScroll = useCallback((event: any) => {
    handleScrollBase(event);
    const offsetY = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const layoutHeight = event.nativeEvent.layoutMeasurement.height;
    
    setShowScrollUp(offsetY > 400);
    
    const isScrollable = contentHeight > layoutHeight;
    const distanceToBottom = contentHeight - layoutHeight - offsetY;
    setShowScrollDown(isScrollable && distanceToBottom > 400);
  }, [handleScrollBase]);

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
  }, []);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd?.({ animated: true });
  }, []);

  // ─── Carga inicial / refresh (página 0) ──────────────────────────────────────
  const fetchCajas = useCallback(async (silent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!silent) setLoading(true);
    try {
      const [activa, result] = await Promise.all([
        checkCajaActiva(),
        getCajasPaginated(0, PAGE_SIZE),
      ]);
      setCajas(result.data || [], activa, result.total, result.hasMore);
    } catch (error) {
      console.error('Error fetching cajas:', error);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [setCajas]);

  // ─── Cargar siguiente página ──────────────────────────────────────────────────
  const fetchNextPage = useCallback(async () => {
    if (isFetchingRef.current || !hasMore || isFetchingMore) return;
    isFetchingRef.current = true;
    setIsFetchingMore(true);
    try {
      const nextPage = currentPage + 1;
      const result = await getCajasPaginated(nextPage, PAGE_SIZE);
      appendCajas(result.data || [], nextPage, result.total, result.hasMore);
    } catch (error) {
      console.error('Error fetching more cajas:', error);
      setIsFetchingMore(false);
    } finally {
      isFetchingRef.current = false;
    }
  }, [hasMore, isFetchingMore, currentPage, appendCajas, setIsFetchingMore]);

  const { joinRoom } = useSocket();

  React.useEffect(() => {
    joinRoom('caja');
  }, [joinRoom]);

  useSocketEvent('refreshCaja', (_data: any) => {
    fetchCajas(true);
  });

  useFocusEffect(
    useCallback(() => {
      const hasCache = useCajaCacheStore.getState().lastFetch > 0;
      fetchCajas(hasCache);
    }, [fetchCajas])
  );

  const handlePressCaja = useCallback((caja: any) => {
    navigation.navigate('CajaForm', { cajaId: caja.IDcaja });
  }, [navigation]);

  // ─── Datos procesados y agrupados por mes ─────────────────────────────────────
  const processedData = useMemo(() => {
    if (!cajas.length) return [];

    let filtered = cajas;
    if (searchQuery.trim().length > 0) {
      const lowerQ = searchQuery.toLowerCase();
      filtered = cajas.filter(c =>
        c.nombre?.toLowerCase().includes(lowerQ) ||
        (c.cierre === 'abierta' ? 'activa abierta curso' : 'cerrada').includes(lowerQ) ||
        (c.cuadroCaja?.toLowerCase() === 'no cuadro caja' && 'descuadrada'.includes(lowerQ)) ||
        (c.cuadroCaja?.toLowerCase() === 'no se ha revisado' && 'pendiente revisado'.includes(lowerQ))
      );
    } else if (activeTab === 'activos') {
      filtered = filtered.filter(c => c.cierre === 'abierta' || (!c.cierre && !c.fechaDeCierre && !c.horaDeCierre));
    } else {
      filtered = filtered.filter(c => c.cierre && c.cierre !== 'abierta');
    }

    const groups: Record<string, any[]> = {};
    const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    filtered.forEach(c => {
      let monthYear = 'Sin fecha';
      if (c.fechaDeApertura) {
        try {
          const datePart = String(c.fechaDeApertura).split('T')[0];
          const [year, month] = datePart.split('-');
          monthYear = `${MONTHS[Number(month) - 1]} ${year}`;
        } catch { /* sin fecha */ }
      }
      if (!groups[monthYear]) groups[monthYear] = [];
      groups[monthYear].push(c);
    });

    const result: any[] = [];
    Object.keys(groups).forEach(key => {
      result.push({ isHeader: true, title: key, count: groups[key].length, IDcaja: `header-${key}` });
      groups[key].forEach(c => result.push({ isHeader: false, ...c }));
    });

    return result;
  }, [cajas, searchQuery, activeTab]);

  // ─── overrideItemLayout: altura exacta sin re-mediciones ──────────────────────
  const overrideItemLayout = useCallback(
    (layout: { span?: number; size?: number }, item: any) => {
      if (item.isHeader) { layout.size = HEADER_HEIGHT; return; }
      const isActiva = item.cierre === 'abierta';
      const hasTags = !isActiva && (
        item.cuadroCaja ||
        Number(item.valorExcedente) > 0 ||
        Number(item.valorFaltante) > 0
      );
      layout.size = hasTags ? CARD_HEIGHT_TAGS : CARD_HEIGHT_BASE;
    },
    []
  );

  // ─── renderItem con callbacks estables (no recrea funciones por item) ─────────
  const renderItem = useCallback(({ item }: { item: any }) => {
    if (item.isHeader) {
      return (
        <SectionHeader
          title={item.title}
          count={item.count}
          isActivos={activeTab === 'activos'}
          primaryColor={primaryColor}
        />
      );
    }
    return (
      <CajaCard
        item={item}
        primaryColor={primaryColor}
        onPress={() => handlePressCaja(item)}
        onLongPress={() => {
          const isActiva = item.cierre === 'abierta';
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
      />
    );
  }, [activeTab, primaryColor, handlePressCaja, user, showAlert, fetchCajas]);

  const keyExtractor = useCallback(
    (item: any, index: number) => item.IDcaja ?? `key-${index}`,
    []
  );

  const listFooter = useMemo(
    () => <ListFooter isFetchingMore={isFetchingMore} primaryColor={primaryColor} />,
    [isFetchingMore, primaryColor]
  );

  const listEmpty = useMemo(() => (
    <View className="items-center justify-center mt-10">
      <Ionicons name="cash-outline" size={64} color="#d1d5db" />
      <Text className="text-gray-500 text-lg mt-4 font-semibold text-center px-4">
        {searchQuery ? 'No hay registros que coincidan con tu búsqueda' : 'No hay registros de caja'}
      </Text>
    </View>
  ), [searchQuery]);

  const totalCount = useCajaCacheStore(s => s.total);

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <SafeAreaView style={{ backgroundColor: primaryColor || '#10b981' }} edges={['top']}>
        <StatusBar backgroundColor={primaryColor || '#10b981'} barStyle="light-content" />
        <View
          style={{ backgroundColor: primaryColor || '#10b981' }}
          className="flex-row items-center justify-between px-4 py-3 shadow-md"
        >
          <View className="flex-row items-center">
            <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 mr-2">
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text className="text-white text-xl font-bold">Registros de Caja</Text>
            {!loading && totalCount > 0 && (
              <View className="ml-2 bg-white/20 px-2 py-0.5 rounded-full">
                <Text className="text-white text-xs font-bold">{totalCount}</Text>
              </View>
            )}
          </View>

          {!loading && canCreate && (
            <TouchableOpacity
              className={`flex-row items-center px-3 py-2 rounded-full ${cajaActiva ? 'bg-red-500' : 'bg-white'}`}
              style={{ elevation: 2 }}
              onPress={() => {
                if (cajaActiva) {
                  const idToOpen = cajaActiva.IDcaja || cajas.find(c => c.cierre === 'abierta')?.IDcaja;
                  navigation.navigate('CajaForm', { cajaId: idToOpen });
                } else {
                  navigation.navigate('CajaForm');
                }
              }}
            >
              <Ionicons name={cajaActiva ? 'lock-closed' : 'add'} size={18} color={cajaActiva ? '#fff' : '#0ea5e9'} />
              <Text className={`font-bold ml-1 ${cajaActiva ? 'text-white' : 'text-primary'}`}>
                {cajaActiva ? 'Ir a caja' : 'Abrir'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      {/* Barra de búsqueda + tabs */}
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
            <Text
              className={`font-bold text-xs ${activeTab === 'activos' ? '' : 'text-gray-500'}`}
              style={activeTab === 'activos' ? { color: primaryColor || '#15803d' } : {}}
            >Activos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('cerrados')}
            className={`flex-1 py-1.5 items-center rounded-md ${activeTab === 'cerrados' ? 'bg-white shadow-sm' : ''}`}
          >
            <Text className={`font-bold text-xs ${activeTab === 'cerrados' ? 'text-gray-800' : 'text-gray-500'}`}>
              Cerrados
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Lista */}
      <View className="flex-1 px-4 pt-2">
        {loading ? (
          <ActivityIndicator size="large" color={primaryColor || '#22c55e'} className="mt-10" />
        ) : (
          <FlashList
            ref={listRef}
            data={processedData}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemType={(item: any) => item.isHeader ? 'sectionHeader' : 'row'}
            // ─── Anti-blank-frames ────────────────────────────────────────
            estimatedItemSize={CARD_HEIGHT_BASE}
            overrideItemLayout={overrideItemLayout}
            drawDistance={700}
            // ─────────────────────────────────────────────────────────────
            onScroll={handleScroll}
            scrollEventThrottle={16}
            // ─── Infinite scroll ──────────────────────────────────────────
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (activeTab === 'cerrados' && !searchQuery && hasMore) {
                fetchNextPage();
              }
            }}
            ListFooterComponent={listFooter}
            ListEmptyComponent={listEmpty}
          />
        )}
      </View>

      {/* Botones Flotantes Elegantes */}
      <FloatingScrollButtons
        showUp={showScrollUp}
        showDown={showScrollDown}
        onUp={scrollToTop}
        onDown={scrollToBottom}
        bottomOffset={160}
      />
    </View>
  );
}
