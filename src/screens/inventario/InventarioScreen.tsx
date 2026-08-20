import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, TouchableOpacity, Text as RNText, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Modal, TextInput, FlatList, KeyboardAvoidingView, Platform, Keyboard, Animated, Dimensions, Image, PanResponder } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList as OriginalFlashList } from '@shopify/flash-list';
const FlashList = OriginalFlashList as any;
import Toast from 'react-native-toast-message';
import { useSocketEvent } from '../../hooks/useSocketEvent';
import { useCustomAlert } from '../../context/CustomAlertContext';
import { SocketEvent } from '../../types/socket.types';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { inventarioService, InventarioItem, OrderInventarioItem, CreateInventarioDto } from '../../services/inventario';
import { insumosService } from '../../services/insumos';
import categoriasService, { CategoriaItem } from '../../services/categorias';
import { usePermissions } from '../../hooks/usePermissions';
import useAuthStore from '../../store/useAuthStore';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

/** Tarjeta-sugerencia inteligente: aparece cuando precio parece ser del lote completo */
const LoteSuggestion = ({
  precio,
  cantidad,
  onApply,
}: {
  precio: number;
  cantidad: number;
  onApply: (precioUnitario: number) => void;
}) => {
  if (cantidad <= 1 || precio <= 0) return null;
  const unitario = Math.round(precio / cantidad);
  if (unitario < 10) return null;
  return (
    <TouchableOpacity
      onPress={() => onApply(unitario)}
      activeOpacity={0.8}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fef9c3',
        borderWidth: 1,
        borderColor: '#fde047',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 7,
        marginTop: 6,
      }}
    >
      <RNText style={{ fontSize: 14, marginRight: 4 }}>📦</RNText>
      <RNText style={{ flex: 1, fontSize: 11, color: '#713f12' }}>
        ¿Precio del lote? <RNText style={{ fontWeight: '700' }}>${precio.toLocaleString('es-CO')} ÷ {cantidad} = ${unitario.toLocaleString('es-CO')}/und</RNText>
      </RNText>
      <View style={{ backgroundColor: '#eab308', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 6 }}>
        <RNText style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓ Usar</RNText>
      </View>
    </TouchableOpacity>
  );
};

const renderDateInfo = (dateString?: string) => {
  if (!dateString) return 'Sin fecha';
  try {
    const d = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'America/Bogota',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    };
    const formatted = new Intl.DateTimeFormat('es-CO', options).format(d);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch (e) {
    const d = new Date(dateString);
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'p.m.' : 'a.m.';
    const h12 = h % 12 || 12;
    return `${dias[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}, ${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
  }
};

type TabType = 'entrada' | 'salida' | 'registros';

const InventarioScreen = ({ navigation }: any) => {
  const { showAlert } = useCustomAlert();
  const { user } = useAuthStore();
  const isAdmin = user?.rol === 'Admin app' || user?.rol === 'Admin negocio';
  
  const { width } = Dimensions.get('window');
  const { canRead: canReadEntradas, canCreate: canCreateEntradas, canEdit: canEditEntradas, canDelete: canDeleteEntradas } = usePermissions('entradas_inventario');
  const { canRead: canReadRegistros } = usePermissions('registros_inventario');
  const { canRead: canReadSalidas, canCreate: canCreateSalidas, canEdit: canEditSalidas, canDelete: canDeleteSalidas } = usePermissions('salidas_inventario');

  const [activeTab, setActiveTab] = useState<TabType>(() => {
    // Will be adjusted by effect once permissions load
    return 'entrada';
  });

  // Auto-redirect to 'salida' tab if user cannot see entradas
  useEffect(() => {
    if (!canReadEntradas && canReadSalidas) {
      setActiveTab('salida');
    }
  }, [canReadEntradas, canReadSalidas]);

  // Fallback consolidado para compatibilidad visual con botones generales de creación
  const canCreate = (activeTab === 'entrada' && canCreateEntradas) || (activeTab === 'salida' && canCreateSalidas) || (activeTab === 'registros' && canCreateEntradas);
  const [registroSubTab, setRegistroSubTab] = useState<'todos' | 'entrada' | 'salida'>('todos');
  const [registroCategoriaFilter, setRegistroCategoriaFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Handle default tab initialization based on permissions
  useEffect(() => {
    if (!canReadEntradas && activeTab === 'entrada') {
      if (canReadSalidas) setActiveTab('salida');
      else if (canReadRegistros) setActiveTab('registros');
    }
  }, [canReadEntradas, canReadSalidas, canReadRegistros]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [inventarios, setInventarios] = useState<InventarioItem[]>([]);
  const [todasLasOrdenes, setTodasLasOrdenes] = useState<OrderInventarioItem[]>([]);
  const [ordenesMeta, setOrdenesMeta] = useState<any>({});
  const [ordenesPage, setOrdenesPage] = useState(1);
  const [loadingMoreOrdenes, setLoadingMoreOrdenes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showOrdenDetailModal, setShowOrdenDetailModal] = useState(false);
  const [selectedOrdenItem, setSelectedOrdenItem] = useState<OrderInventarioItem | null>(null);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedInventario, setSelectedInventario] = useState<InventarioItem | null>(null);
  const [ordenes, setOrdenes] = useState<OrderInventarioItem[]>([]);
  const [categorias, setCategorias] = useState<CategoriaItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingOrdenes, setLoadingOrdenes] = useState(false);
  const [insumos, setInsumos] = useState<any[]>([]);
  const [selectedOrdenes, setSelectedOrdenes] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{id: string, isComprado: boolean, isParent?: boolean} | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
  const [inlineEditOrdenId, setInlineEditOrdenId] = useState<string | null>(null);
  const [inlineEditValues, setInlineEditValues] = useState<{ precioActual: string; cantidad: string; sumarCantidad?: string }>({ precioActual: '', cantidad: '' });
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [bulkEditValues, setBulkEditValues] = useState<Record<string, { precioActual: string; cantidad: string; sumarCantidad?: string }>>({});

  const [newInventario, setNewInventario] = useState<CreateInventarioDto>({ nombre: '', tipo: 'entrada' });
  const [addItemsList, setAddItemsList] = useState<any[]>([]);
  const [addItemSearchText, setAddItemSearchText] = useState('');
  const [selectedCategoriaFilter, setSelectedCategoriaFilter] = useState<string | null>(null);
  
  const [isChangingInsumo, setIsChangingInsumo] = useState(false);
  const [changeInsumoSearchText, setChangeInsumoSearchText] = useState('');
  const [changeInsumoCategoriaFilter, setChangeInsumoCategoriaFilter] = useState<string | null>(null);
  const [pendingNewInsumoId, setPendingNewInsumoId] = useState<string | null>(null);
  const [isEditingDescuento, setIsEditingDescuento] = useState(false);
  const [descuentoInputValue, setDescuentoInputValue] = useState('');

  const filteredChangeInsumos = useMemo(() => {
    return insumos
      .filter(i => {
        const matchText = (i.nombre || i.Nombre || '').toLowerCase().includes(changeInsumoSearchText.toLowerCase());
        const cat = i.nombreCategoria || i.NombreCategoria || i.categoriaNombre || i.Categoria;
        const matchCat = changeInsumoCategoriaFilter ? (cat || 'Sin categoría') === changeInsumoCategoriaFilter : true;
        return matchText && matchCat;
      })
      .slice(0, 20);
  }, [insumos, changeInsumoSearchText, changeInsumoCategoriaFilter]);


  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const createModalScrollRef = useRef<ScrollView>(null);
  const detailModalScrollRef = useRef<any>(null);
  const addItemModalScrollRef = useRef<any>(null);
  const [activeInputIndex, setActiveInputIndex] = useState<number | null>(null);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      if (showAddItemModal || showCreateModal) {
        if (activeInputIndex !== null) {
          setTimeout(() => {
            const scrollRef = showCreateModal ? createModalScrollRef : addItemModalScrollRef;
            // Calculamos una posición más abajo para los inputs dinámicos de los items
            // 350 es un offset base para saltar el buscador y los filtros
            scrollRef.current?.scrollTo({ y: 350 + (activeInputIndex * 150), animated: true });
          }, 300);
        }
      }
    });
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setKeyboardHeight(0);
      setActiveInputIndex(null);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, [showAddItemModal, addItemSearchText, activeInputIndex]);

  const filteredInventarios = inventarios.filter(inv => {
    let matchesTab = false;
    if (activeTab === 'entrada') {
      matchesTab = inv.tipo?.toUpperCase().includes('ENTRADA') ?? false;
    } else if (activeTab === 'salida') {
      matchesTab = inv.tipo?.toUpperCase().includes('SALIDA') ?? false;
    } else {
      matchesTab = true; // Not used for 'registros'
    }

    if (!matchesTab) return false;

    if (debouncedSearchQuery) {
      const q = debouncedSearchQuery.toLowerCase();
      const matchesName = (inv.nombre || '').toLowerCase().includes(q);
      const matchesDate = (inv.fechaYHora ? new Date(inv.fechaYHora).toLocaleDateString('es-CO') : '').includes(q);
      return matchesName || matchesDate;
    }

    return true;
  });

  // Animación para el Skeleton
  const skeletonAnim = useRef(new Animated.Value(0.3)).current;

  const handleSwipeNavigate = useCallback((direction: 'next' | 'prev') => {
    if (!selectedOrdenItem) return;
    
    // Identificar cuál lista estamos viendo actualmente (Saco individual o global)
    const currentList = selectedInventario ? ordenes : todasLasOrdenes;
    if (!currentList || currentList.length === 0) return;
    
    const currentIndex = currentList.findIndex(o => o.IDorderinventario === selectedOrdenItem.IDorderinventario);
    if (currentIndex === -1) return;
    
    if (direction === 'next' && currentIndex < currentList.length - 1) {
      setSelectedOrdenItem(currentList[currentIndex + 1]);
    } else if (direction === 'prev' && currentIndex > 0) {
      setSelectedOrdenItem(currentList[currentIndex - 1]);
    }
  }, [selectedOrdenItem, selectedInventario, ordenes, todasLasOrdenes]);

  const latestDetailSwipeNavRef = useRef(handleSwipeNavigate);
  useEffect(() => {
    latestDetailSwipeNavRef.current = handleSwipeNavigate;
  }, [handleSwipeNavigate]);

  const detailPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 30 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5;
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 50) {
          latestDetailSwipeNavRef.current('prev'); 
        } else if (gestureState.dx < -50) {
          latestDetailSwipeNavRef.current('next'); 
        }
      },
    })
  ).current;

  const handleSwipeInventarioNavigate = useCallback((direction: 'next' | 'prev') => {
    console.log('[DEBUG-SWIPE] handleSwipeInventarioNavigate called with direction:', direction);
    if (!selectedInventario) {
      console.log('[DEBUG-SWIPE] No selectedInventario');
      return;
    }
    const currentList = filteredInventarios;
    if (!currentList || currentList.length === 0) {
      console.log('[DEBUG-SWIPE] currentList is empty or null');
      return;
    }
    
    const currentIndex = currentList.findIndex(i => i.IDinventario === selectedInventario.IDinventario);
    console.log('[DEBUG-SWIPE] currentIndex:', currentIndex, 'list length:', currentList.length);
    if (currentIndex === -1) {
      console.log('[DEBUG-SWIPE] Current inventario not found in list');
      return;
    }
    
    if (direction === 'next' && currentIndex < currentList.length - 1) {
      console.log('[DEBUG-SWIPE] Navigating NEXT to index:', currentIndex + 1);
      handleOpenDetail(currentList[currentIndex + 1]);
    } else if (direction === 'prev' && currentIndex > 0) {
      console.log('[DEBUG-SWIPE] Navigating PREV to index:', currentIndex - 1);
      handleOpenDetail(currentList[currentIndex - 1]);
    } else {
      console.log('[DEBUG-SWIPE] At boundary, cannot navigate', direction);
    }
  }, [selectedInventario, filteredInventarios]);

  const latestInventarioSwipeNavRef = useRef(handleSwipeInventarioNavigate);
  useEffect(() => {
    latestInventarioSwipeNavRef.current = handleSwipeInventarioNavigate;
  }, [handleSwipeInventarioNavigate]);

  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [swipeStartY, setSwipeStartY] = useState<number | null>(null);

  const handleTouchStart = useCallback((e: any) => {
    setSwipeStartX(e.nativeEvent.pageX);
    setSwipeStartY(e.nativeEvent.pageY);
  }, []);

  const handleTouchEnd = useCallback((e: any) => {
    if (swipeStartX === null || swipeStartY === null) return;
    const dx = e.nativeEvent.pageX - swipeStartX;
    const dy = e.nativeEvent.pageY - swipeStartY;
    
    // Si es un deslizamiento predominantemente horizontal
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 50) {
        latestInventarioSwipeNavRef.current('prev'); 
      } else if (dx < -50) {
        latestInventarioSwipeNavRef.current('next'); 
      }
    }
    setSwipeStartX(null);
    setSwipeStartY(null);
  }, [swipeStartX, swipeStartY]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonAnim, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(skeletonAnim, { toValue: 0.3, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, []);

  const renderSkeletonInventario = () => (
    <Card className="mb-3 overflow-hidden">
      <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center' }}>
        <Animated.View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#e5e7eb', opacity: skeletonAnim, marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Animated.View style={{ height: 18, width: '60%', backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim, marginBottom: 8 }} />
          <Animated.View style={{ height: 14, width: '40%', backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim }} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Animated.View style={{ height: 20, width: 80, backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim, marginBottom: 8 }} />
          <Animated.View style={{ height: 16, width: 50, backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim }} />
        </View>
      </View>
    </Card>
  );

  const renderSkeletonOrden = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' }}>
      <View style={{ flex: 1 }}>
        <Animated.View style={{ height: 16, width: '70%', backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim, marginBottom: 8 }} />
        <Animated.View style={{ height: 14, width: '50%', backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim, marginBottom: 8 }} />
        <Animated.View style={{ height: 14, width: '80%', backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim }} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Animated.View style={{ height: 14, width: 60, backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim, marginBottom: 8 }} />
        <Animated.View style={{ height: 16, width: 80, backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim }} />
      </View>
    </View>
  );

  const [newItem, setNewItem] = useState({
    insumoId: '',
    nombreDelAlimento: '',
    categoria: '',
    cantidad: 0,
    precioAnterior: 0,
    precioActual: 0,
    provedor: '',
    telefonoProvedor: '',
    direccionProvedor: '',
    observacion: '',
  });

  useSocketEvent(SocketEvent.REFRESH_INVENTARIO, () => {
    fetchInventarios();
    if (selectedInventario) {
      fetchOrdenes(selectedInventario.IDinventario, true);
    }
    if (activeTab === 'registros') {
      fetchTodasLasOrdenes(1, false, true);
    }
  });

  useSocketEvent(SocketEvent.REFRESH_INSUMOS, () => {
    fetchInsumos();
  });

  useEffect(() => {
    if (selectedInventario && inventarios.length > 0) {
      const updated = inventarios.find(i => i.IDinventario === selectedInventario.IDinventario);
      if (updated && (updated.total !== selectedInventario.total || updated.nombre !== selectedInventario.nombre)) {
        setSelectedInventario(updated);
      }
    }
  }, [inventarios]);

  const fetchInventarios = useCallback(async () => {
    try {
      const data = await inventarioService.getAll();
      setInventarios(data);
    } catch (error) {
      console.error('Error fetching inventarios:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchTodasLasOrdenes = useCallback(async (page = 1, shouldAppend = false, silent = false) => {
    try {
      if (!silent) setLoadingMoreOrdenes(true);
      
      // Mostrar skeleton inmediatamente en nuevas búsquedas para dar feedback instantáneo al usuario
      if (page === 1 && !shouldAppend && !silent) {
        setTodasLasOrdenes([]);
      }
      
      const response = await inventarioService.getAllOrdenes({ 
        page, 
        limit: 20,
        buscar: debouncedSearchQuery,
        tipo: registroSubTab !== 'todos' ? registroSubTab : undefined,
        categoria: registroCategoriaFilter || undefined
      });
      
      setTodasLasOrdenes(prev => shouldAppend ? [...prev, ...response.data] : response.data);
      setOrdenesMeta(response.meta);
      setOrdenesPage(page);
    } catch (error) {
      console.error('Error fetching todas las ordenes:', error);
    } finally {
      setLoadingMoreOrdenes(false);
      setRefreshing(false);
    }
  }, [debouncedSearchQuery, registroSubTab, registroCategoriaFilter]);

  useEffect(() => {
    if (activeTab === 'registros') {
      fetchTodasLasOrdenes(1, false);
    }
  }, [activeTab, debouncedSearchQuery, registroSubTab, registroCategoriaFilter, fetchTodasLasOrdenes]);

  const handleLoadMoreOrdenes = () => {
    if (ordenesMeta?.hasNextPage && !loadingMoreOrdenes) {
      fetchTodasLasOrdenes(ordenesPage + 1, true);
    }
  };

  const fetchCategorias = async () => {
    try {
      const data = await categoriasService.getAll();
      setCategorias(data);
    } catch (error) {
      console.error('Error fetching categorias:', error);
    }
  };

  const fetchInsumos = async () => {
    try {
      const data = await insumosService.getAll({ limit: 10000 });
      console.log('[DEBUG] Insumos received:', data?.length);
      setInsumos(data || []);
    } catch (error) {
      console.error('[DEBUG] Error fetching insumos:', error);
    }
  };

  const fetchOrdenes = async (inventarioId: string, silent: boolean = false) => {
    if (!silent) {
      setLoadingOrdenes(true);
      setSelectedOrdenes(new Set());
      setSelectionMode(false);
    }
    try {
      console.log('[DEBUG] Fetching ordenes for inventario:', inventarioId);
      const data = await inventarioService.getById(inventarioId);
      setOrdenes(data?.ordenInventario || []);
    } catch (error: any) {
      if (error?.code === 'NOT_FOUND' || error?.response?.status === 404) {
        console.log('[DEBUG] Inventario no encontrado (probablemente eliminado), cerrando detalle.');
        setOrdenes([]);
        setSelectedInventario(null);
        setShowDetailModal(false);
      } else {
        console.error('[DEBUG] Error fetching ordenes:', error);
      }
    } finally {
      if (!silent) {
        setLoadingOrdenes(false);
      }
    }
  };

  useEffect(() => {
    fetchInventarios();
    fetchCategorias();
    fetchInsumos();
    fetchTodasLasOrdenes(1, false);
  }, [fetchInventarios, fetchTodasLasOrdenes]);

  useEffect(() => {
    if (showAddItemModal && insumos.length === 0) {
      console.log('[DEBUG] Modal opened but insumos empty, fetching...');
      fetchInsumos();
    }
  }, [showAddItemModal]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchInventarios();
      if (activeTab === 'entrada') {
        // Recargar insumos para ver el stock actualizado después de marcar entradas
        await fetchInsumos();
      } else if (activeTab === 'registros') {
        await fetchTodasLasOrdenes(1, false);
      }
    } catch (e) {
      console.log('Error refreshing:', e);
    } finally {
      setRefreshing(false);
    }
  };

  const getCategoriasInsumos = () => {
    const cats = new Set<string>();
    insumos.forEach(i => {
      const cat = i.nombreCategoria || i.NombreCategoria || i.categoriaNombre || i.Categoria;
      if (cat && typeof cat === 'string') {
        cats.add(cat);
      } else {
        cats.add('Sin categoría');
      }
    });
    return Array.from(cats).sort((a, b) => {
      if (a === 'Sin categoría') return 1;
      if (b === 'Sin categoría') return -1;
      return a.localeCompare(b);
    });
  };

  // filteredInventarios moved up
  const findInsumo = (idOrName: string) => {
    if (!idOrName) return undefined;
    return insumos.find(i => 
      i.IDalimentos === idOrName || 
      i.IDalimentos?.toString() === idOrName.toString() ||
      i.nombre === idOrName ||
      i.Nombre === idOrName
    );
  };

  const getInsumoId = (id: string) => {
    const insumo = findInsumo(id);
    return insumo ? insumo.IDalimentos : id;
  };

  const getInsumoName = (id: string) => {
    if (!id) return 'Sin nombre';
    const insumo = findInsumo(id);
    if (insumo?.nombre) return insumo.nombre;
    if (insumo?.Nombre) return insumo.Nombre;
    return id;
  };

  const groupByCategory = (items: OrderInventarioItem[]) => {
    return items.reduce((acc, item) => {
      const cat = getInsumoCategoria(item.nombreDelAlimento) || item.categoria || 'Sin categoría';
      if (!acc[cat]) {
        acc[cat] = {
          items: [],
          total: 0
        };
      }
      acc[cat].items.push(item);
      const itemSubtotal = item.subtotal || ((item.precioActual || item.precio || 0) * (item.cantidad || 0));
      acc[cat].total += itemSubtotal;
      return acc;
    }, {} as Record<string, { items: OrderInventarioItem[], total: number }>);
  };

  const renderGroupedList = (items: OrderInventarioItem[]) => {
    const grouped = groupByCategory(items);
    return Object.entries(grouped)
      .sort(([catA], [catB]) => catA.localeCompare(catB))
      .map(([categoria, { items: catItems, total }]) => (
        <View key={categoria} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginBottom: 8 }}>
            <RNText style={{ fontSize: 12, fontWeight: '700', color: '#4b5563', textTransform: 'uppercase' }}>
              {categoria}
            </RNText>
            {(selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada') && (
              <RNText style={{ fontSize: 12, fontWeight: '700', color: '#111827' }}>
                ${total.toLocaleString('es-CO')}
              </RNText>
            )}
          </View>
          {catItems.map((orden) => (
            <View key={orden.IDorderinventario}>{renderOrdenItem({ item: orden })}</View>
          ))}
        </View>
      ));
  };

  const getInsumoCategoria = (id: string) => {
    if (!id) return '';
    const insumo = findInsumo(id);
    if (insumo) {
      if (insumo.categoriaNombre) return insumo.categoriaNombre;
      if (insumo.nombreCategoria) return insumo.nombreCategoria;
      if (insumo.NombreCategoria) return insumo.NombreCategoria;
      if (insumo.categoria && typeof insumo.categoria === 'string' && !insumo.categoria.match(/^[a-z0-9]{10,}$/)) return insumo.categoria;
      if (insumo.Categoria && typeof insumo.Categoria === 'string' && !insumo.Categoria.match(/^[a-z0-9]{10,}$/)) return insumo.Categoria;
    }
    return '';
  };

  const getInsumoStock = (id: string) => {
    const insumo = findInsumo(id);
    if (insumo?.disponible !== undefined && insumo?.disponible !== null) return Number(insumo.disponible) || 0;
    if (insumo?.Disponible !== undefined && insumo?.Disponible !== null) return Number(insumo.Disponible) || 0;
    return 0;
  };

  const getImageUrl = (url?: string) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    
    // Check if the URL is from the old structure (INSUMOS_Images/)
    if (url.startsWith('INSUMOS_Images/')) {
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
      return `${baseUrl}/uploads/insumos/${url.split('/').pop()}`;
    }

    const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
    const finalUrl = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    return finalUrl;
  };

  const getInsumoImage = (id: string) => {
    if (!id) return null;
    const insumo = findInsumo(id);
    const rawUrl = insumo?.imagen;
    return getImageUrl(rawUrl);
  };

  const viewShotRef = useRef<ViewShot>(null);

  const handleExportImage = async () => {
    try {
      setSaving(true);
      
      // Si son pocos ítems, generar imagen (captura de pantalla) para una visualización rápida.
      if (ordenes.length <= 15) {
        if (viewShotRef.current && viewShotRef.current.capture) {
          setTimeout(async () => {
            try {
              const uri = await viewShotRef.current!.capture!();
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, {
                  mimeType: 'image/png',
                  dialogTitle: 'Compartir inventario',
                  UTI: 'image/png',
                });
              } else {
                Toast.show({ type: 'error', text1: 'Error', text2: 'No se puede compartir en este dispositivo' });
              }
            } catch (e) {
              Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo generar la imagen' });
            } finally {
              setSaving(false);
            }
          }, 500);
        } else {
          setSaving(false);
          Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo acceder a la vista para capturar la imagen' });
        }
        return;
      }

      // Si son muchos ítems, generar PDF para evitar compresión y pérdida de calidad
      let Print: any;
      try {
        Print = require('expo-print');
      } catch (e) {
        Toast.show({ type: 'error', text1: 'Actualización Requerida', text2: 'Módulo de PDF no disponible. Requiere compilar la app.' });
        setSaving(false);
        return;
      }

      if (!selectedInventario) {
        setSaving(false);
        return;
      }

      const grouped = groupByCategory(ordenes);
      const isEntrada = selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada';
      
      let html = `
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #1f2937; }
            h1 { text-align: center; color: #111827; margin-bottom: 5px; font-size: 24px; }
            p.subtitle { text-align: center; color: #6b7280; margin-top: 0; margin-bottom: 20px; font-size: 14px; }
            .category { background-color: #f3f4f6; padding: 10px; font-weight: bold; text-transform: uppercase; margin-top: 20px; border-radius: 5px; display: flex; justify-content: space-between; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
            th { color: #6b7280; text-transform: uppercase; }
            .comprado { color: #10b981; font-weight: bold; }
            .pendiente { color: #ef4444; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>${selectedInventario.nombre || 'Inventario'}</h1>
          <p class="subtitle">
            ${new Date(selectedInventario.fechaYHora || new Date()).toLocaleDateString('es-CO')} &nbsp;&bull;&nbsp; 
            Total: $${(selectedInventario.total || 0).toLocaleString('es-CO')} &nbsp;&bull;&nbsp; 
            ${selectedInventario.tipo || 'ENTRADAS'}
          </p>
      `;

      let totalGeneral = 0;

      Object.entries(grouped)
        .sort(([catA], [catB]) => catA.localeCompare(catB))
        .forEach(([categoria, { items: catItems, total }]) => {
          totalGeneral += total;
          
          html += `
            <div class="category">
              <span>${categoria}</span>
              ${isEntrada ? `<span>$${total.toLocaleString('es-CO')}</span>` : ''}
            </div>
            <table>
              <tr>
                <th>Item</th>
                <th>Estado</th>
                <th>Cant.</th>
                ${isEntrada ? '<th>Precio Und.</th><th>Subtotal</th>' : ''}
              </tr>
          `;

          catItems.forEach(item => {
            const isComprado = item.seCompro?.toLowerCase() === 'si';
            const estadoHtml = isComprado ? '<span class="comprado">Comprado</span>' : '<span class="pendiente">Sin comprar</span>';
            const subtotalItem = item.subtotal || ((item.precioActual || item.precio || 0) * (item.cantidad || 0));
            const precioUnd = item.precioActual || item.precio || 0;
            const name = getInsumoName(item.nombreDelAlimento);
            
            html += `
              <tr>
                <td>${name}</td>
                <td>${estadoHtml}</td>
                <td>${item.cantidad || 0}</td>
                ${isEntrada ? `<td>$${precioUnd.toLocaleString('es-CO')}</td><td>$${subtotalItem.toLocaleString('es-CO')}</td>` : ''}
              </tr>
            `;
          });
          
          html += `</table>`;
        });
        
      if (isEntrada) {
        html += `
          <div style="margin-top: 30px; text-align: right;">
            <h2 style="color: #111827;">Total General: $${totalGeneral.toLocaleString('es-CO')}</h2>
          </div>
        `;
      }

      html += `</body></html>`;

      const { uri } = await Print.printToFileAsync({ html, margins: { left: 20, top: 20, right: 20, bottom: 20 } });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Compartir inventario',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Toast.show({ type: 'error', text1: 'Error', text2: 'No se puede compartir en este dispositivo' });
      }
    } catch (error) {
      console.error('Error generando PDF:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo iniciar la exportación a PDF' });
    } finally {
      setSaving(false);
    }
  };

  const getErrorMessage = (error: any, defaultMsg: string) => {
    const msg = error?.response?.data?.message || error?.message || defaultMsg;
    if (Array.isArray(msg)) return msg.join('\n');
    if (typeof msg === 'object') return JSON.stringify(msg);
    return String(msg);
  };

  const handleCreateInventario = async () => {
    if (!newInventario.nombre?.trim()) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'El nombre es obligatorio' });
      return;
    }

    // ── Stock validation for salidas ──────────────────────────────────────
    const isEntrada = newInventario.tipo === 'entrada';
    if (!isEntrada && addItemsList.length > 0) {
      const itemsConStockInsuficiente = addItemsList.filter(item => {
        const stockActual = Number(getInsumoStock(item.insumoId)) || 0;
        return Number(item.cantidad) > stockActual;
      });

      if (itemsConStockInsuficiente.length > 0) {
        const nombres = itemsConStockInsuficiente
          .map(item => {
            const stockActual = Number(getInsumoStock(item.insumoId)) || 0;
            return `• ${item.nombre}: pides ${item.cantidad}, disponible ${stockActual}`;
          })
          .join('\n');
        Toast.show({
          type: 'error',
          text1: 'Stock insuficiente',
          text2: `Los siguientes insumos no tienen suficiente stock:\n${nombres}`,
          visibilityTime: 5000,
        });
        return;
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    setSaving(true);
    try {
      let totalCalculado = 0;

      if (addItemsList.length > 0 && isEntrada) {
        totalCalculado = addItemsList.reduce((sum, item) => sum + (Number(item.precioActual) * Number(item.cantidad)), 0);
      }

      const descuentoAplicado = Number(newInventario.descuento) || 0;
      const totalFinal = Math.max(0, totalCalculado - descuentoAplicado);

      const createdInv = await inventarioService.create({ 
        nombre: newInventario.nombre,
        tipo: isEntrada ? 'ENTRADAS' : 'SALIDAS',
        total: totalFinal,
        descuento: descuentoAplicado
      });
      
      if (addItemsList.length > 0) {
        for (const item of addItemsList) {
          await inventarioService.createOrdenInventario({
            IDinventario: createdInv.IDinventario,
            categoria: item.categoria || '',
            nombreDelAlimento: item.insumoId,
            cantidad: Number(item.cantidad) || 0,
            precio: isEntrada ? (item.precioAnterior * item.cantidad) : 0, // Subtotal anterior
            precioActual: isEntrada ? Number(item.precioActual) : 0,
            subtotal: isEntrada ? (Number(item.precioActual) * item.cantidad) : 0, // Subtotal actual
            precioAnterior: isEntrada ? item.precioAnterior : 0,
            observacion: item.observacion || '',
            disponible: 'Si',
            seCompro: 'No',
          });
        }
      }

      Toast.show({ type: 'success', text1: 'Éxito', text2: `Inventario de ${isEntrada ? 'entradas' : 'salidas'} creado${addItemsList.length > 0 ? ` con ${addItemsList.length} items` : ''}` });
      setShowCreateModal(false);
      setNewInventario({ nombre: '', tipo: 'entrada', descuento: 0 });
      setAddItemsList([]);
      setAddItemSearchText('');
      fetchInventarios();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: getErrorMessage(error, 'No se pudo crear') });
    } finally {
      setSaving(false);
    }
  };

  const handleCloseDetailModal = () => {
    if (isBulkEditing) {
      // Check if there are actual changes
      let hasChanges = false;
      for (const [id, values] of Object.entries(bulkEditValues)) {
        if (values.precioActual !== '' || values.cantidad !== '') {
          hasChanges = true;
          break;
        }
      }
      
      if (hasChanges) {
        setShowUnsavedChangesModal(true);
        return;
      }
    }
    
    // Default close logic
    setIsBulkEditing(false);
    setBulkEditValues({});
    setShowDetailModal(false);
    setSelectedInventario(null);
  };

  const handleOpenDetail = async (item: InventarioItem) => {
    setSelectedInventario(item);
    setShowDetailModal(true);
    await fetchOrdenes(item.IDinventario);
  };

  const handleAddItem = async () => {
    if (addItemsList.length === 0) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Debe agregar al menos un insumo' });
      return;
    }

    const isEntrada = selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada';

    // ── Stock validation for salidas ─────────────────────────────────────
    if (!isEntrada) {
      const itemsConStockInsuficiente = addItemsList.filter(item => {
        const stockActual = Number(getInsumoStock(item.insumoId)) || 0;
        return Number(item.cantidad) > stockActual;
      });

      if (itemsConStockInsuficiente.length > 0) {
        const nombres = itemsConStockInsuficiente
          .map(item => {
            const stockActual = Number(getInsumoStock(item.insumoId)) || 0;
            return `• ${item.nombre}: pides ${item.cantidad}, disponible ${stockActual}`;
          })
          .join('\n');
        Toast.show({
          type: 'error',
          text1: 'Stock insuficiente',
          text2: `Los siguientes insumos no tienen suficiente stock:\n${nombres}`,
          visibilityTime: 5000,
        });
        return;
      }
    }
    // ────────────────────────────────────────────────────────────────────

    setSaving(true);
    try {
      let nuevosItemsSubtotal = 0;

      for (const item of addItemsList) {
        if (isEntrada) {
          nuevosItemsSubtotal += Number(item.precioActual) * Number(item.cantidad);
        }
        await inventarioService.createOrdenInventario({
          IDinventario: selectedInventario!.IDinventario,
          categoria: item.categoria || '',
          nombreDelAlimento: item.insumoId,
          cantidad: Number(item.cantidad) || 0,
          precio: isEntrada ? (item.precioAnterior * item.cantidad) : 0,
          precioActual: isEntrada ? Number(item.precioActual) : 0,
          subtotal: isEntrada ? (Number(item.precioActual) * item.cantidad) : 0,
          precioAnterior: isEntrada ? item.precioAnterior : 0,
          observacion: item.observacion || '',
          disponible: 'Si',
          seCompro: 'No',
        });
      }
      
      if (isEntrada && nuevosItemsSubtotal > 0 && selectedInventario) {
        const currentTotal = selectedInventario.total || 0;
        await inventarioService.update(selectedInventario.IDinventario, {
          total: currentTotal + nuevosItemsSubtotal
        });
      }

      Toast.show({ type: 'success', text1: 'Éxito', text2: `${addItemsList.length} items agregados` });
      setShowAddItemModal(false);
      setAddItemsList([]);
      setAddItemSearchText('');
      
      if (selectedInventario) {
        await fetchOrdenes(selectedInventario.IDinventario);
        await fetchInventarios();
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: getErrorMessage(error, 'No se pudo agregar') });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleOrdenSelection = (ordenId: string) => {
    const newSelected = new Set(selectedOrdenes);
    if (newSelected.has(ordenId)) {
      newSelected.delete(ordenId);
    } else {
      newSelected.add(ordenId);
    }
    setSelectedOrdenes(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedInventario?.tipo?.toLowerCase() !== 'entradas' && selectedInventario?.tipo?.toLowerCase() !== 'entrada') return;
    if (selectedOrdenes.size === ordenes.length) {
      setSelectedOrdenes(new Set());
    } else {
      setSelectedOrdenes(new Set(ordenes.map(o => o.IDorderinventario)));
    }
  };

  const handleBulkMarkComprado = async () => {
    if (selectedOrdenes.size === 0) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Selecciona al menos un item' });
      return;
    }

    setSaving(true);
    try {
      const ids = Array.from(selectedOrdenes);
      await inventarioService.marcarVariosComprado(ids);
      Toast.show({ type: 'success', text1: 'Éxito', text2: `${ids.length} items ingresados al stock` });
      setSelectedOrdenes(new Set());
      setSelectionMode(false);
      if (selectedInventario) {
        await fetchOrdenes(selectedInventario.IDinventario);
        await fetchInventarios();
        await fetchInsumos(); // Refetch insumos to update prices and stock
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: getErrorMessage(error, 'No se pudo actualizar') });
    } finally {
      setSaving(false);
    }
  };

  const getCurrentInsumoValues = (orden: OrderInventarioItem) => {
    const insumoId = orden.nombreDelAlimento;
    const insumo = insumos.find(i => i.IDalimentos === insumoId || i.IDalimentos?.toString() === insumoId?.toString());
    return {
      precioActual: orden.precioActual?.toString() || insumo?.precio?.toString() || '',
      cantidad: orden.cantidad?.toString() || '', // Provide the current quantity
      sumarCantidad: '',
    };
  };

  const handleStartInlineEdit = (orden: OrderInventarioItem) => {
    const values = getCurrentInsumoValues(orden);
    setInlineEditValues(values);
    setInlineEditOrdenId(orden.IDorderinventario);
  };

  const handleCancelInlineEdit = () => {
    setInlineEditOrdenId(null);
    setInlineEditValues({ precioActual: '', cantidad: '', sumarCantidad: '' });
  };

  const handleToggleBulkEdit = () => {
    if (isBulkEditing) {
      setIsBulkEditing(false);
      setBulkEditValues({});
    } else {
      const initialValues: Record<string, { precioActual: string; cantidad: string; sumarCantidad: string }> = {};
      ordenes.forEach(o => {
        initialValues[o.IDorderinventario] = getCurrentInsumoValues(o);
      });
      setBulkEditValues(initialValues);
      setIsBulkEditing(true);
      setInlineEditOrdenId(null);
    }
  };

  const handleSaveBulkEdit = async () => {
    const promises: Promise<any>[] = [];
    const updatedOrdenes = [...ordenes];
    let hasUpdates = false;

    for (const [id, values] of Object.entries(bulkEditValues)) {
      const precioNum = Number(values.precioActual.replace(/[^0-9.]/g, ''));
      const cantidadIngresada = Number(values.cantidad.replace(/[^0-9]/g, ''));
      
      if (!isNaN(precioNum) || !isNaN(cantidadIngresada)) {
        const ordenIndex = updatedOrdenes.findIndex(o => o.IDorderinventario === id);
        if (ordenIndex === -1) continue;
        
        const orden = updatedOrdenes[ordenIndex];
        const payload: any = {};
        
        const currentPrecio = Number(orden.precioActual) || Number(orden.precio) || 0;
        if (!isNaN(precioNum) && precioNum >= 0 && values.precioActual !== '' && precioNum !== currentPrecio) {
          payload.precio = precioNum;
        }
        
        if (!isNaN(cantidadIngresada) && cantidadIngresada >= 0 && values.cantidad !== '') {
          payload.cantidad = cantidadIngresada;
        }
        
        if (Object.keys(payload).length > 0) {
          hasUpdates = true;
          promises.push(
            inventarioService.updateOrdenInventario(id, payload).then(() => {
              updatedOrdenes[ordenIndex] = {
                ...orden,
                precio: payload.precio !== undefined ? payload.precio : orden.precio,
                cantidad: payload.cantidad !== undefined ? payload.cantidad : orden.cantidad
              };
            })
          );
        }
      }
    }

    if (!hasUpdates) {
      setIsBulkEditing(false);
      return;
    }

    setSaving(true);
    try {
      await Promise.all(promises);
      
      // Optimistic Update
      setOrdenes(updatedOrdenes);
      
      // Background silent refresh
      fetchInventarios();
      fetchInsumos();
      if (selectedInventario) {
        fetchOrdenes(selectedInventario.IDinventario, true);
      }
      
      Toast.show({ type: 'success', text1: 'Actualización masiva', text2: 'Se actualizaron los items correctamente' });
      setIsBulkEditing(false);
    } catch (error: any) {
      console.error('[DEBUG] Error en actualización masiva:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Hubo un error al guardar algunos items' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInlineEdit = async (orden: OrderInventarioItem) => {
    const precioNum = Number(inlineEditValues.precioActual.replace(/[^0-9.]/g, ''));
    const cantidadIngresada = Number(inlineEditValues.cantidad.replace(/[^0-9]/g, ''));
    
    if (isNaN(precioNum) && isNaN(cantidadIngresada)) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Ingresa un precio o cantidad válido' });
      return;
    }
    
    const payload: any = {};
    if (!isNaN(precioNum) && precioNum >= 0) {
      payload.precio = precioNum;
    }
    
    if (!isNaN(cantidadIngresada) && cantidadIngresada >= 0) {
      payload.cantidad = cantidadIngresada;
    }
    
    setSaving(true);
      try {
        console.log(`[FRONTEND DEBUG] Intentando actualizar orden: ${orden.IDorderinventario} con payload:`, payload);
        await inventarioService.updateOrdenInventario(orden.IDorderinventario, payload);
        console.log(`[FRONTEND DEBUG] Actualizacion exitosa.`);
        
        // Optimistic UI Update: Actualizar la lista localmente al instante
        setOrdenes(prev => prev.map(o => {
          if (o.IDorderinventario === orden.IDorderinventario) {
            return {
              ...o,
              precio: payload.precio !== undefined ? payload.precio : o.precio,
              cantidad: payload.cantidad !== undefined ? payload.cantidad : o.cantidad
            };
          }
          return o;
        }));
        
        // Background silent refresh
        fetchInventarios();
        fetchInsumos();
        if (selectedInventario) {
          fetchOrdenes(selectedInventario.IDinventario, true);
        }
        
        Toast.show({ 
        type: 'success', 
        text1: '¡Actualizado con éxito!', 
        text2: payload.cantidad !== undefined ? `Nueva cantidad (Pide): ${payload.cantidad} und` : 'Precio actualizado correctamente' 
      });
      handleCancelInlineEdit();
    } catch (error: any) {
      console.error('[DEBUG] Error al actualizar:', error);
      const errorMsg = error?.response?.data?.message || error?.message || 'No se pudo actualizar';
      Toast.show({ 
        type: 'error', 
        text1: 'Error al guardar', 
        text2: Array.isArray(errorMsg) ? errorMsg.join(', ') : String(errorMsg) 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleOrdenComprado = async (orden: OrderInventarioItem) => {
    try {
      await inventarioService.toggleComprado(orden.IDorderinventario, orden.seCompro === 'Si' ? 'No' : 'Si');
      if (selectedInventario) {
        await fetchOrdenes(selectedInventario.IDinventario);
        await fetchInventarios();
        await fetchInsumos(); // Refetch insumos to update prices and stock
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: getErrorMessage(error, 'No se pudo actualizar') });
    }
  };

  const handleChangeInsumo = async (nuevoInsumoId: string) => {
    if (!selectedOrdenItem) return;
    
    setSaving(true);
    try {
      await inventarioService.updateOrdenInventario(selectedOrdenItem.IDorderinventario, {
        nombreDelAlimento: nuevoInsumoId
      });
      
      // Update local state
      const updatedItem = { ...selectedOrdenItem, nombreDelAlimento: nuevoInsumoId };
      setSelectedOrdenItem(updatedItem);
      
      setOrdenes(prev => prev.map(o => o.IDorderinventario === updatedItem.IDorderinventario ? updatedItem : o));
      setTodasLasOrdenes(prev => prev.map(o => o.IDorderinventario === updatedItem.IDorderinventario ? updatedItem : o));
      
      // Background silent refresh
      if (selectedInventario) {
        fetchOrdenes(selectedInventario.IDinventario);
      }
      fetchInventarios();
      fetchInsumos();
      
      Toast.show({ type: 'success', text1: 'Éxito', text2: 'Insumo actualizado correctamente' });
      setIsChangingInsumo(false);
      setChangeInsumoSearchText('');
    } catch (error: any) {
      console.error('[DEBUG] Error cambiando insumo:', error);
      const errorMsg = error?.response?.data?.message || error?.message || 'No se pudo actualizar el insumo';
      Toast.show({ type: 'error', text1: 'Error', text2: Array.isArray(errorMsg) ? errorMsg.join(', ') : String(errorMsg) });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateDescuento = async () => {
    console.log('[DEBUG] handleUpdateDescuento iniciado');
    if (!selectedInventario) {
      console.warn('[DEBUG] No hay selectedInventario');
      return;
    }
    const desc = Number(descuentoInputValue.replace(/[^0-9]/g, '')) || 0;
    console.log(`[DEBUG] Actualizando descuento a: ${desc} para Inventario ID: ${selectedInventario.IDinventario}`);
    
    setSaving(true);
    try {
      console.log('[DEBUG] Llamando inventarioService.update...');
      const response = await inventarioService.update(selectedInventario.IDinventario, { descuento: desc });
      console.log('[DEBUG] inventarioService.update completado', response);

      const updatedInventario = { ...selectedInventario, descuento: desc };
      setSelectedInventario(updatedInventario);
      setInventarios(prev => prev.map(inv => inv.IDinventario === selectedInventario.IDinventario ? updatedInventario : inv));
      fetchInventarios();
      Toast.show({ type: 'success', text1: 'Éxito', text2: 'Descuento actualizado correctamente' });
      setIsEditingDescuento(false);
    } catch (error: any) {
      console.error('[DEBUG] Error en handleUpdateDescuento:', error);
      console.error('[DEBUG] Detalle del error:', error?.response?.data || error?.message);
      Toast.show({ type: 'error', text1: 'Error', text2: getErrorMessage(error, 'No se pudo actualizar el descuento') });
    } finally {
      console.log('[DEBUG] handleUpdateDescuento finally block');
      setSaving(false);
    }
  };

  const handleDeleteOrden = async (orden: OrderInventarioItem) => {
    const isComprado = orden.seCompro?.toLowerCase() === 'si';
    
    if (isComprado) {
      setItemToDelete({ id: orden.IDorderinventario, isComprado: true });
      setShowDeleteModal(true);
    } else {
      showAlert({
        type: 'confirm',
        title: 'Confirmar',
        message: '¿Eliminar este item?',
        confirmText: 'Eliminar',
        onConfirm: async () => {
          try {
            await inventarioService.deleteOrdenInventario(orden.IDorderinventario);
            if (selectedInventario) {
              await fetchOrdenes(selectedInventario.IDinventario);
              await fetchInventarios();
              await fetchInsumos();
            }
            Toast.show({ type: 'success', text1: 'Eliminado', text2: 'El item ha sido eliminado' });
          } catch (error: any) {
            Toast.show({ type: 'error', text1: 'Error', text2: getErrorMessage(error, 'No se pudo eliminar') });
          }
        },
        onCancel: () => {},
      });
    }
  };

  const handleConfirmDelete = async (shouldRestoreStock: boolean) => {
    if (!itemToDelete) return;
    
    try {
      setShowDeleteModal(false);
      if (itemToDelete.isParent) {
        await inventarioService.delete(itemToDelete.id, shouldRestoreStock);
        setShowDetailModal(false);
        setSelectedInventario(null);
        await fetchInventarios();
        Toast.show({ type: 'success', text1: 'Eliminado', text2: 'El inventario ha sido eliminado' });
      } else {
        await inventarioService.deleteOrdenInventario(itemToDelete.id, shouldRestoreStock);
        if (selectedInventario) {
          await fetchOrdenes(selectedInventario.IDinventario);
          await fetchInventarios();
        }
        Toast.show({ type: 'success', text1: 'Eliminado', text2: 'El item ha sido eliminado' });
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: getErrorMessage(error, 'No se pudo eliminar') });
    } finally {
      setItemToDelete(null);
    }
  };

  const handleDeleteInventario = async () => {
    if (!selectedInventario) return;

    const hasCompletedItems = ordenes.some(o => o.seCompro?.toLowerCase() === 'si');

    if (hasCompletedItems) {
      setItemToDelete({ id: selectedInventario.IDinventario, isComprado: true, isParent: true });
      setShowDeleteModal(true);
      return;
    }

    showAlert({
      type: 'confirm',
      title: 'Confirmar',
      message: `¿Eliminar "${selectedInventario.nombre}"?`,
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          await inventarioService.delete(selectedInventario!.IDinventario);
          setShowDetailModal(false);
          setSelectedInventario(null);
          fetchInventarios();
          Toast.show({ type: 'success', text1: 'Eliminado', text2: 'El inventario ha sido eliminado' });
        } catch (error: any) {
          Toast.show({ type: 'error', text1: 'Error', text2: getErrorMessage(error, 'No se pudo eliminar') });
        }
      },
      onCancel: () => {},
    });
  };

  const getProveedores = () => {
    const provedoresSet = new Set<string>();
    ordenes.forEach(o => { if (o.provedor) provedoresSet.add(o.provedor); });
    return Array.from(provedoresSet);
  };

  const ordenesNoComprados = ordenes.filter(o => o.seCompro === 'No' || o.seCompro === 'no');
  const ordenesComprados = ordenes.filter(o => o.seCompro === 'Si' || o.seCompro === 'si');
  const totalNoComprados = ordenesNoComprados.reduce((sum, o) => sum + (o.subtotal || ((o.precioActual || o.precio || 0) * o.cantidad)), 0);
  const totalComprados = ordenesComprados.reduce((sum, o) => sum + (o.subtotal || ((o.precioActual || o.precio || 0) * o.cantidad)), 0);

  const renderInventarioItem = ({ item }: { item: InventarioItem }) => {
    const isEntrada = item.tipo?.toUpperCase().includes('ENTRADA');
    const canDelete = (activeTab === 'entrada' && canDeleteEntradas) || (activeTab === 'salida' && canDeleteSalidas);
    
    return (
      <Card className="mb-3 overflow-hidden">
        <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
          <TouchableOpacity 
            style={{ flex: 1, padding: 16 }} 
            onPress={() => handleOpenDetail(item)} 
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={{ width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: isEntrada ? '#dcfce7' : '#fee2e2' }}>
                  <MaterialCommunityIcons
                    name={isEntrada ? 'arrow-down-bold' : 'arrow-up-bold'}
                    size={24}
                    color={isEntrada ? '#22c55e' : '#ef4444'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <RNText style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>
                    {item.nombre}
                  </RNText>
                  <RNText style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    {renderDateInfo((item as any).createdAt || item.fechaYHora)}
                  </RNText>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {isEntrada && (
                  <>
                    <RNText style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginLeft: 12 }}>
                      ${(item.total !== undefined && item.total > 0 ? Math.max(0, item.total - (item.descuento || 0)) : Math.max(0, (item.ordenInventario?.reduce((sum, o) => sum + (o.subtotal || ((o.precioActual || o.precio || 0) * o.cantidad)), 0) || 0) - (item.descuento || 0))).toLocaleString('es-CO')}
                    </RNText>
                    {item.descuento ? (
                      <RNText style={{ fontSize: 11, color: '#ef4444', fontWeight: '600' }}>
                        Descuento: -${item.descuento.toLocaleString('es-CO')}
                      </RNText>
                    ) : null}
                  </>
                )}
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 4, backgroundColor: isEntrada ? '#dcfce7' : '#fee2e2' }}>
                  <RNText style={{ fontSize: 11, fontWeight: '600', color: isEntrada ? '#16a34a' : '#dc2626' }}>
                    {isEntrada ? 'Entrada' : 'Salida'}
                  </RNText>
                </View>
              </View>
            </View>
          </TouchableOpacity>

          {canDelete && (
            <View style={{ justifyContent: 'center', paddingRight: 16, paddingLeft: 4, borderLeftWidth: 1, borderLeftColor: '#f3f4f6' }}>
              <TouchableOpacity 
                style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' }}
                onPress={() => {
                  setSelectedInventario(item);
                  handleDeleteInventario();
                }}
              >
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Card>
    );
  };

  const renderOrdenItem = ({ item }: { item: OrderInventarioItem }) => {
    const isComprado = item.seCompro === 'Si' || item.seCompro === 'si';
    const isSelected = selectedOrdenes.has(item.IDorderinventario);
    
    const invContext = selectedInventario || item.inventario;
    const isEntrada = invContext?.tipo?.toUpperCase().includes('ENTRADA') ?? false;

    const isEditing = inlineEditOrdenId === item.IDorderinventario || (isBulkEditing && bulkEditValues[item.IDorderinventario] !== undefined);

    if (isEditing) {
      const editValues = isBulkEditing ? bulkEditValues[item.IDorderinventario] : inlineEditValues;
      const setEditValues = (field: 'precioActual' | 'cantidad' | 'sumarCantidad', value: string) => {
        if (isBulkEditing) {
          setBulkEditValues(prev => ({
            ...prev,
            [item.IDorderinventario]: { ...prev[item.IDorderinventario], [field]: value }
          }));
        } else {
          setInlineEditValues(prev => ({ ...prev, [field]: value }));
        }
      };

      const previewSubtotal = (() => {
        const p = Number(editValues.precioActual.replace(/[^0-9.]/g, '')) || 0;
        const c = Number(editValues.cantidad.replace(/[^0-9]/g, '')) || 0;
        return p * c;
      })();

      return (
        <View style={{ marginBottom: 8 }}>
          <View
            style={{
              padding: 12,
              borderRadius: 12,
              backgroundColor: '#fff',
              borderWidth: 2,
              borderColor: isBulkEditing ? '#8b5cf6' : '#3b82f6',
            }}
          >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            {!isBulkEditing && (
              <TouchableOpacity onPress={handleCancelInlineEdit} style={{ marginRight: 12 }}>
                <Ionicons name="close-circle" size={24} color="#6b7280" />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <RNText style={{ fontSize: 13, fontWeight: '700', color: '#111827' }} numberOfLines={2}>
                {getInsumoName(item.nombreDelAlimento)}
              </RNText>
              <RNText style={{ fontSize: 10, color: '#9ca3af', fontWeight: '500', marginTop: 1 }}>
                {renderDateInfo((item as any).createdAt || item.fechaYHora)}
              </RNText>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
            {isEntrada && (
              <View style={{ flex: 1, minWidth: 130, marginRight: 8, marginBottom: 8 }}>
                <RNText style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>Precio ($)</RNText>
                <TextInput
                  value={editValues.precioActual}
                  onChangeText={(v) => setEditValues('precioActual', v)}
                  keyboardType="numeric"
                  style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#111827' }}
                  placeholder="0" placeholderTextColor="#9ca3af"
                />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 200, marginBottom: 8 }}>
              <RNText style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>Cantidad (und)</RNText>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  value={editValues.cantidad}
                  onChangeText={(v) => setEditValues('cantidad', v)}
                  keyboardType="numeric"
                  style={{ flex: 1, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#111827' }}
                  placeholder="0" placeholderTextColor="#9ca3af"
                />
                <TextInput
                  value={editValues.sumarCantidad}
                  onChangeText={(v) => setEditValues('sumarCantidad', v)}
                  keyboardType="numeric"
                  placeholder="+ cant"
                  placeholderTextColor="#9ca3af"
                  style={{ width: 65, backgroundColor: '#eff6ff', borderWidth: 1, borderLeftWidth: 0, borderColor: '#bfdbfe', paddingHorizontal: 8, paddingVertical: 8, fontSize: 12, color: '#1d4ed8', textAlign: 'center' }}
                />
                <TouchableOpacity
                  style={{ backgroundColor: '#3b82f6', borderTopRightRadius: 8, borderBottomRightRadius: 8, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' }}
                  onPress={() => {
                    const toAdd = Number(editValues.sumarCantidad.replace(/[^0-9]/g, '')) || 0;
                    if (toAdd > 0) {
                      const current = Number(editValues.cantidad.replace(/[^0-9]/g, '')) || 0;
                      setEditValues('cantidad', String(current + toAdd));
                      setEditValues('sumarCantidad', '');
                    }
                  }}
                >
                  <Ionicons name="add" size={16} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {isEntrada && (
            <LoteSuggestion
              precio={Number(editValues.precioActual.replace(/[^0-9.]/g, '')) || 0}
              cantidad={Number(editValues.cantidad.replace(/[^0-9]/g, '')) || 0}
              onApply={(u) => setEditValues('precioActual', String(u))}
            />
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 }}>
            {isEntrada && (
              <View style={{ flex: 1 }}>
                <RNText style={{ fontSize: 12, color: '#6b7280' }}>
                  Nuevo Subtotal: <RNText style={{ fontWeight: '700', color: '#111827' }}>${previewSubtotal.toLocaleString('es-CO')}</RNText>
                </RNText>
              </View>
            )}
            {!isBulkEditing && (
              <TouchableOpacity
                onPress={() => handleSaveInlineEdit(item)}
                disabled={saving}
                style={{ backgroundColor: saving ? '#9ca3af' : '#3b82f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Guardar</RNText>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  }

    const showActionButtons = !selectionMode && ((isEntrada && canDeleteEntradas) || (!isEntrada && canDeleteSalidas));

    return (
      <View style={{ marginBottom: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 12,
            paddingRight: showActionButtons ? 70 : 12,
            borderRadius: 12,
            backgroundColor: isEntrada ? (isComprado ? '#f0fdf4' : isSelected ? '#eff6ff' : '#fff') : '#fff',
            borderWidth: isEntrada && isSelected ? 2 : 1,
            borderColor: isEntrada ? (isSelected ? '#3b82f6' : isComprado ? '#bbf7d0' : '#e5e7eb') : '#e5e7eb',
          }}
        >
        {isEntrada && selectionMode && canEditEntradas && (
          <TouchableOpacity 
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 8,
              backgroundColor: isSelected ? '#3b82f6' : 'transparent',
              borderWidth: 2,
              borderColor: isSelected ? '#3b82f6' : '#d1d5db',
            }}
            onPress={() => handleToggleOrdenSelection(item.IDorderinventario)}
          >
            {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
          </TouchableOpacity>
        )}

        {isEntrada && !selectionMode && (
          <TouchableOpacity
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 6,
              backgroundColor: isComprado ? '#22c55e' : 'transparent',
              borderWidth: 1.5,
              borderColor: isComprado ? '#22c55e' : '#d1d5db',
            }}
            onPress={() => handleToggleOrdenComprado(item)}
            onLongPress={() => {
              if (!selectionMode && selectedInventario) {
                setSelectionMode(true);
                setSelectedOrdenes(new Set([item.IDorderinventario]));
              }
            }}
          >
            {isComprado && <Ionicons name="checkmark" size={12} color="#fff" />}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
          onPress={() => {
            setSelectedOrdenItem(item);
            setShowOrdenDetailModal(true);
          }}
          onLongPress={() => {
            if (isEntrada && !selectionMode && selectedInventario) {
              setSelectionMode(true);
              setSelectedOrdenes(new Set([item.IDorderinventario]));
            }
          }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#f3f4f6', marginRight: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {getInsumoImage(item.nombreDelAlimento || '') ? (
              <Image
                source={{ uri: getInsumoImage(item.nombreDelAlimento || '') as string }}
                style={{ width: '100%', height: '100%', borderRadius: 8 }}
                resizeMode="cover"
              />
            ) : (
              <MaterialCommunityIcons name="package-variant-closed" size={22} color="#9ca3af" />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <RNText style={{ fontSize: 13, fontWeight: '700', color: (isEntrada && isComprado) ? '#9ca3af' : '#111827', textDecorationLine: (isEntrada && isComprado) ? 'line-through' : 'none', flex: 1 }} numberOfLines={2}>
                {getInsumoName(item.nombreDelAlimento)}
              </RNText>
              {!selectedInventario && (
                <View style={{ marginLeft: 6, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, backgroundColor: isEntrada ? '#dcfce7' : '#fee2e2' }}>
                  <RNText style={{ fontSize: 9, fontWeight: '700', color: isEntrada ? '#16a34a' : '#ef4444' }}>
                    {isEntrada ? 'ENT' : 'SAL'}
                  </RNText>
                </View>
              )}
            </View>
            <RNText style={{ fontSize: 10, color: '#9ca3af', fontWeight: '500', marginTop: 1, marginBottom: 2 }}>
              {renderDateInfo((item as any).createdAt || item.fechaYHora)}
            </RNText>

            <RNText style={{ fontSize: 11, color: '#6b7280', fontWeight: 'bold', marginTop: 2 }}>
                Stock previo: {item.cantInsumos !== undefined
                  ? (isEntrada
                    ? (item.seCompro?.toLowerCase() === 'si' ? item.cantInsumos - (Number(item.cantidad) || 0) : item.cantInsumos)
                    : item.cantInsumos + (Number(item.cantidad) || 0))
                  : getInsumoStock(item.nombreDelAlimento)}
            </RNText>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                <RNText style={{ fontSize: 12.5, color: isEntrada ? '#f59e0b' : '#ef4444', fontWeight: 'bold' }}>
                  {isEntrada ? 'Pide' : 'Retira'}: {item.cantidad}
                </RNText>
                <RNText style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>
                  • <RNText style={{ color: '#3b82f6', fontWeight: '600' }}>Stock {(!isEntrada || item.seCompro?.toLowerCase() === 'si') ? 'Final' : 'Proy'}: {
                    item.cantInsumos !== undefined 
                      ? (!isEntrada || item.seCompro?.toLowerCase() === 'si' 
                          ? item.cantInsumos 
                          : item.cantInsumos + (Number(item.cantidad) || 0)) 
                      : (getInsumoStock(item.nombreDelAlimento) + (isEntrada ? (Number(item.cantidad) || 0) : -(Number(item.cantidad) || 0)))
                  }</RNText>
                </RNText>
              </View>
          </View>
        </TouchableOpacity>

        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
          {isEntrada ? (
            <View style={{ alignItems: 'flex-end' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                <RNText style={{ fontSize: 10, color: '#9ca3af', textDecorationLine: 'line-through' }}>
                  ${(item.precioAnterior !== undefined ? item.precioAnterior : ((item.precio || 0) / (item.cantidad || 1))).toLocaleString('es-CO')}
                </RNText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <RNText style={{ fontSize: 10, color: '#9ca3af', textDecorationLine: 'line-through', marginRight: 4 }}>
                  S: ${(item.precioAnterior !== undefined ? (item.precioAnterior * item.cantidad) : (item.precio || 0)).toLocaleString('es-CO')}
                </RNText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
                <RNText style={{ fontSize: 12, fontWeight: '600', color: isComprado ? '#22c55e' : '#4b5563', marginRight: 4 }}>
                  ${(item.precioActual || (item.subtotal ? item.subtotal / (item.cantidad || 1) : 0)).toLocaleString('es-CO')}
                </RNText>
              </View>
              <RNText style={{ fontSize: 14, fontWeight: '700', color: isComprado ? '#22c55e' : '#111827' }}>
                ${(item.subtotal || ((item.precioActual || item.precio || 0) * item.cantidad)).toLocaleString('es-CO')}
              </RNText>
            </View>
          ) : null}
        </View>

        {showActionButtons && (
          <View style={{ position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 4 }}>
            {isEntrada && (
              <TouchableOpacity
                style={{ width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff' }}
                onPress={() => handleStartInlineEdit(item)}
              >
                <Ionicons name="pencil" size={14} color="#3b82f6" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={{ width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fee2e2' }}
              onPress={() => handleDeleteOrden(item)}
            >
              <Ionicons name="trash-outline" size={14} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}
      </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb', paddingBottom: Platform.OS === 'android' ? keyboardHeight : 0 }}>
      <StatusBar style="dark" backgroundColor="transparent" translucent />
      <SafeAreaView style={{ backgroundColor: '#fff' }} edges={['top']}>
        <View className="bg-white px-4 py-3 flex-row items-center justify-between border-b border-gray-200">
          <TouchableOpacity className="w-10 h-10 rounded-xl bg-gray-100 items-center justify-center" onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#374151" />
          </TouchableOpacity>
          <RNText className="text-lg font-bold text-gray-900">Inventario</RNText>
          <View className="flex-row items-center">
            {canCreate ? (
              <TouchableOpacity
                className="w-10 h-10 rounded-xl bg-primary items-center justify-center"
                onPress={() => {
                  setNewInventario(prev => ({ 
                    ...prev, 
                    tipo: activeTab === 'salida' ? 'salida' : 'entrada' 
                  }));
                  setShowCreateModal(true);
                }}
              >
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            ) : (
              <View className="w-10 h-10" />
            )}
          </View>
        </View>
        <View className="bg-white px-4 py-3 border-b border-gray-200">
          <Input 
            placeholder="Buscar por nombre, fecha, etc..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </SafeAreaView>

      <View className="bg-white border-b border-gray-200">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 12 }} keyboardShouldPersistTaps="handled">
          {canReadEntradas && (
            <TouchableOpacity
              className={`mr-3 px-4 py-2 rounded-full flex-row items-center border ${activeTab === 'entrada' ? 'bg-green-50 border-green-500' : 'bg-gray-50 border-gray-200'}`}
              onPress={() => setActiveTab('entrada')}
            >
              <MaterialCommunityIcons name="arrow-down-bold" size={16} color={activeTab === 'entrada' ? '#22c55e' : '#9ca3af'} />
              <RNText className={`ml-1.5 text-sm font-semibold ${activeTab === 'entrada' ? 'text-green-700' : 'text-gray-500'}`}>
                Entradas
              </RNText>
              <View className={`ml-2 px-2 py-0.5 rounded-full ${activeTab === 'entrada' ? 'bg-green-200' : 'bg-gray-200'}`}>
                <RNText className={`text-xs font-bold ${activeTab === 'entrada' ? 'text-green-800' : 'text-gray-600'}`}>
                  {inventarios.filter(i => i.tipo?.toUpperCase().includes('ENTRADA')).length}
                </RNText>
              </View>
            </TouchableOpacity>
          )}
          
          {canReadSalidas && (
            <TouchableOpacity
              className={`mr-3 px-4 py-2 rounded-full flex-row items-center border ${activeTab === 'salida' ? 'bg-red-50 border-red-500' : 'bg-gray-50 border-gray-200'}`}
              onPress={() => setActiveTab('salida')}
            >
              <MaterialCommunityIcons name="arrow-up-bold" size={16} color={activeTab === 'salida' ? '#ef4444' : '#9ca3af'} />
              <RNText className={`ml-1.5 text-sm font-semibold ${activeTab === 'salida' ? 'text-red-700' : 'text-gray-500'}`}>
                Salidas
              </RNText>
              <View className={`ml-2 px-2 py-0.5 rounded-full ${activeTab === 'salida' ? 'bg-red-200' : 'bg-gray-200'}`}>
                <RNText className={`text-xs font-bold ${activeTab === 'salida' ? 'text-red-800' : 'text-gray-600'}`}>
                  {inventarios.filter(i => i.tipo?.toUpperCase().includes('SALIDA')).length}
                </RNText>
              </View>
            </TouchableOpacity>
          )}
          
          {canReadRegistros && (
            <TouchableOpacity
              className={`mr-3 px-4 py-2 rounded-full flex-row items-center border ${activeTab === 'registros' ? 'bg-blue-50 border-blue-500' : 'bg-gray-50 border-gray-200'}`}
              onPress={() => setActiveTab('registros')}
            >
              <MaterialCommunityIcons name="format-list-bulleted" size={16} color={activeTab === 'registros' ? '#3b82f6' : '#9ca3af'} />
              <RNText className={`ml-1.5 text-sm font-semibold ${activeTab === 'registros' ? 'text-blue-700' : 'text-gray-500'}`}>
                Registros
              </RNText>
              <View className={`ml-2 px-2 py-0.5 rounded-full ${activeTab === 'registros' ? 'bg-blue-200' : 'bg-gray-200'}`}>
                <RNText className={`text-xs font-bold ${activeTab === 'registros' ? 'text-blue-800' : 'text-gray-600'}`}>
                  {ordenesMeta?.total || 0}
                </RNText>
              </View>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {activeTab === 'registros' ? (
        <View style={{ flex: 1 }}>
          <View style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
              <TouchableOpacity
                style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: registroSubTab === 'todos' ? '#3b82f6' : '#f3f4f6', marginRight: 8 }}
                onPress={() => setRegistroSubTab('todos')}
              >
                <RNText style={{ fontSize: 13, fontWeight: '600', color: registroSubTab === 'todos' ? '#fff' : '#4b5563' }}>Todos</RNText>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: registroSubTab === 'entrada' ? '#22c55e' : '#f3f4f6', marginRight: 8 }}
                onPress={() => setRegistroSubTab('entrada')}
              >
                <RNText style={{ fontSize: 13, fontWeight: '600', color: registroSubTab === 'entrada' ? '#fff' : '#4b5563' }}>Solo Entradas</RNText>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: registroSubTab === 'salida' ? '#ef4444' : '#f3f4f6', marginRight: 16 }}
                onPress={() => setRegistroSubTab('salida')}
              >
                <RNText style={{ fontSize: 13, fontWeight: '600', color: registroSubTab === 'salida' ? '#fff' : '#4b5563' }}>Solo Salidas</RNText>
              </TouchableOpacity>

              <View style={{ width: 1, backgroundColor: '#d1d5db', marginVertical: 4, marginRight: 16 }} />

              <TouchableOpacity
                style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: registroCategoriaFilter === null ? '#6366f1' : '#f3f4f6', marginRight: 8 }}
                onPress={() => setRegistroCategoriaFilter(null)}
              >
                <RNText style={{ fontSize: 13, fontWeight: '600', color: registroCategoriaFilter === null ? '#fff' : '#4b5563' }}>Cualquier Cat.</RNText>
              </TouchableOpacity>
              {getCategoriasInsumos().map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: registroCategoriaFilter === cat ? '#6366f1' : '#f3f4f6', marginRight: 8 }}
                  onPress={() => setRegistroCategoriaFilter(cat)}
                >
                  <RNText style={{ fontSize: 13, fontWeight: '600', color: registroCategoriaFilter === cat ? '#fff' : '#4b5563' }}>{cat}</RNText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <View style={{ flex: 1, minHeight: 2 }}>
            {loadingMoreOrdenes && todasLasOrdenes.length === 0 ? (
              <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3b82f6']} />}
              >
                {[...Array(6)].map((_, i) => <View key={i}>{renderSkeletonOrden()}</View>)}
              </ScrollView>
            ) : (
              <FlashList
                data={todasLasOrdenes}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <View style={{ paddingHorizontal: 16 }}>
                    {renderOrdenItem({ item: item as OrderInventarioItem })}
                  </View>
                )}
                keyExtractor={(item: any) => item.IDorderinventario}
                contentContainerStyle={{ paddingTop: 16, paddingBottom: 100, flexGrow: 1 }}
                estimatedItemSize={120}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3b82f6']} />}
                onEndReached={handleLoadMoreOrdenes}
                onEndReachedThreshold={0.5}
                ListFooterComponent={loadingMoreOrdenes ? <ActivityIndicator size="small" color="#3b82f6" style={{ marginVertical: 16 }} /> : null}
                ListEmptyComponent={
                  !loadingMoreOrdenes ? (
                    <View className="items-center justify-center py-16">
                      <MaterialCommunityIcons name="archive-outline" size={64} color="#d1d5db" />
                      <RNText className="mt-4 text-lg text-gray-500 font-medium">No hay registros</RNText>
                    </View>
                  ) : null
                }
              />
            )}
          </View>
        </View>
      ) : (
        <View style={{ flex: 1, minHeight: 2 }}>
          {loading && inventarios.length === 0 ? (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {[...Array(5)].map((_, i) => <View key={i}>{renderSkeletonInventario()}</View>)}
            </ScrollView>
          ) : (
            <FlashList
              data={filteredInventarios}
              renderItem={({ item }) => renderInventarioItem({ item: item as InventarioItem })}
              keyExtractor={(item: any) => item.IDinventario}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              estimatedItemSize={100}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3b82f6']} />}
              ListEmptyComponent={
                !loading ? (
                  <View className="items-center justify-center py-16">
                    <MaterialCommunityIcons name="archive-outline" size={64} color="#d1d5db" />
                    <RNText className="mt-4 text-lg text-gray-500 font-medium">No hay inventarios</RNText>
                    <RNText className="text-sm text-gray-400 mt-1">Crea uno para comenzar</RNText>
                    {canCreate && (
                      <Button className="mt-4 bg-primary" onPress={() => setShowCreateModal(true)}>
                        <RNText className="text-white font-semibold">Crear Inventario</RNText>
                      </Button>
                    )}
                  </View>
                ) : null
              }
            />
          )}
        </View>
      )}

      <Modal visible={showCreateModal} animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, marginBottom: Platform.OS === 'android' ? keyboardHeight : 0 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <RNText style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Nuevo Inventario</RNText>
            <TouchableOpacity onPress={() => setShowCreateModal(false)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView ref={createModalScrollRef} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Input
              label="Nombre del inventario *"
              placeholder="Ej: Compra mayo 2026"
              value={newInventario.nombre}
              onChangeText={(t) => setNewInventario(p => ({ ...p, nombre: t }))}
            />

            <View style={{ marginTop: 16 }}>
              <RNText style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Tipo</RNText>
              <View style={{ flexDirection: 'row' }}>
                {canCreateEntradas && (
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginRight: canCreateSalidas ? 8 : 0, alignItems: 'center', backgroundColor: newInventario.tipo === 'entrada' ? '#22c55e' : '#f3f4f6' }}
                    onPress={() => setNewInventario(p => ({ ...p, tipo: 'entrada' }))}
                  >
                    <MaterialCommunityIcons name="arrow-down-bold" size={20} color={newInventario.tipo === 'entrada' ? '#fff' : '#6b7280'} />
                    <RNText style={{ marginTop: 4, fontWeight: '600', fontSize: 13, color: newInventario.tipo === 'entrada' ? '#fff' : '#6b7280' }}>Entrada</RNText>
                  </TouchableOpacity>
                )}
                {canCreateSalidas && (
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', backgroundColor: newInventario.tipo === 'salida' ? '#ef4444' : '#f3f4f6' }}
                    onPress={() => setNewInventario(p => ({ ...p, tipo: 'salida' }))}
                  >
                    <MaterialCommunityIcons name="arrow-up-bold" size={20} color={newInventario.tipo === 'salida' ? '#fff' : '#6b7280'} />
                    <RNText style={{ marginTop: 4, fontWeight: '600', fontSize: 13, color: newInventario.tipo === 'salida' ? '#fff' : '#6b7280' }}>Salida</RNText>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {newInventario.tipo === 'entrada' && (
              <View style={{ marginTop: 16 }}>
                <RNText style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Descuento en toda la compra (Opcional)</RNText>
                <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, backgroundColor: '#fff' }}>
                  <RNText style={{ fontSize: 16, color: '#6b7280', marginRight: 4 }}>$</RNText>
                  <TextInput
                    style={{ flex: 1, paddingVertical: 12, fontSize: 16, color: '#111827' }}
                    placeholder="0"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={newInventario.descuento ? newInventario.descuento.toLocaleString('es-CO') : ''}
                    onChangeText={(t) => {
                      const numericValue = parseInt(t.replace(/[^0-9]/g, ''), 10);
                      setNewInventario(p => ({ ...p, descuento: isNaN(numericValue) ? 0 : numericValue }));
                    }}
                  />
                </View>
                <RNText style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Este valor se restará al Total de la compra.</RNText>
              </View>
            )}

            <View style={{ marginTop: 24, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 16 }}>
              <RNText style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 }}>Agregar Insumos (Opcional)</RNText>
              
              <View style={{ marginBottom: 12 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <TouchableOpacity
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: selectedCategoriaFilter === null ? '#3b82f6' : '#f3f4f6', marginRight: 8 }}
                    onPress={() => setSelectedCategoriaFilter(null)}
                  >
                    <RNText style={{ fontSize: 12, fontWeight: '600', color: selectedCategoriaFilter === null ? '#fff' : '#4b5563' }}>Todos</RNText>
                  </TouchableOpacity>
                  {getCategoriasInsumos().map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: selectedCategoriaFilter === cat ? '#3b82f6' : '#f3f4f6', marginRight: 8 }}
                      onPress={() => setSelectedCategoriaFilter(cat)}
                    >
                      <RNText style={{ fontSize: 12, fontWeight: '600', color: selectedCategoriaFilter === cat ? '#fff' : '#4b5563' }}>{cat}</RNText>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <Input
                placeholder="Buscar insumos..."
                value={addItemSearchText}
                onChangeText={setAddItemSearchText}
              />

              {(addItemSearchText.length > 0 || selectedCategoriaFilter) && (
                <View style={{ maxHeight: 200, backgroundColor: '#f9fafb', borderRadius: 8, marginTop: 8, padding: 8, borderWidth: 1, borderColor: '#e5e7eb' }}>
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {insumos
                    .filter(i => {
                      const matchText = (i.nombre || i.Nombre || '').toLowerCase().includes(addItemSearchText.toLowerCase());
                      const cat = i.nombreCategoria || i.NombreCategoria || i.categoriaNombre || i.Categoria;
                      const matchCat = selectedCategoriaFilter ? cat === selectedCategoriaFilter : true;
                      
                      let matchStock = true;
                      if (newInventario.tipo && !newInventario.tipo.toLowerCase().includes('entrada')) {
                        const stock = Number(getInsumoStock(i.IDalimentos)) || 0;
                        matchStock = stock > 0;
                      }

                      return matchText && matchCat && matchStock;
                    })
                    .sort((a, b) => {
                      const isSelectedA = addItemsList.some(i => i.insumoId === a.IDalimentos) ? 1 : 0;
                      const isSelectedB = addItemsList.some(i => i.insumoId === b.IDalimentos) ? 1 : 0;
                      if (isSelectedA !== isSelectedB) {
                        return isSelectedB - isSelectedA; // Seleccionados van primero
                      }
                      const stockA = Number(a.disponible || a.Disponible || a.cantidad || a.Cantidad || 0);
                      const stockB = Number(b.disponible || b.Disponible || b.cantidad || b.Cantidad || 0);
                      return stockB - stockA;
                    })
                    .slice(0, 20)
                    .map(insumo => (
                      <TouchableOpacity
                        key={insumo.IDalimentos}
                        style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center' }}
                        onPress={() => {
                          if (!addItemsList.find(i => i.insumoId === insumo.IDalimentos)) {
                            const precioBase = Number(insumo.precio || insumo.Precio) || 0;
                            setAddItemsList(prev => [{
                              insumoId: insumo.IDalimentos,
                              nombre: insumo.nombre || insumo.Nombre || '',
                              categoria: insumo.nombreCategoria || insumo.NombreCategoria || '',
                              cantidad: 1,
                              precioAnterior: precioBase,
                              precioActual: precioBase,
                              observacion: ''
                            }, ...prev]);
                          }
                          setAddItemSearchText('');
                        }}
                      >
                        <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#f3f4f6', marginRight: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                          {getInsumoImage(insumo.IDalimentos) ? (
                            <Image
                              source={{ uri: getInsumoImage(insumo.IDalimentos) as string }}
                              style={{ width: '100%', height: '100%', borderRadius: 8 }}
                              resizeMode="cover"
                            />
                          ) : (
                            <MaterialCommunityIcons name="package-variant-closed" size={20} color="#9ca3af" />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <RNText style={{ fontSize: 14, color: '#374151', fontWeight: '600' }}>{insumo.nombre || insumo.Nombre}</RNText>
                          <RNText style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                            {(!newInventario.tipo || newInventario.tipo.toLowerCase().includes('entrada')) && (
                                <RNText>Último precio: ${(Number(insumo.precio || insumo.Precio) || 0).toLocaleString('es-CO')} • </RNText>
                              )}
                              <RNText style={{ color: '#10b981', fontWeight: 'bold' }}>Stock act: {getInsumoStock(insumo.IDalimentos)}</RNText>
                            </RNText>
                        </View>
                      </TouchableOpacity>
                    ))}
                    {insumos.filter(i => {
                        const matchText = (i.nombre || i.Nombre || '').toLowerCase().includes(addItemSearchText.toLowerCase());
                        const cat = i.nombreCategoria || i.NombreCategoria || i.categoriaNombre || i.Categoria;
                        const matchCat = selectedCategoriaFilter ? cat === selectedCategoriaFilter : true;
                        
                        let matchStock = true;
                        if (newInventario.tipo && !newInventario.tipo.toLowerCase().includes('entrada')) {
                          const stock = Number(getInsumoStock(i.IDalimentos)) || 0;
                          matchStock = stock > 0;
                        }

                        return matchText && matchCat && matchStock;
                      }).length === 0 && (
                      <RNText style={{ padding: 8, color: '#6b7280', textAlign: 'center' }}>No se encontraron insumos</RNText>
                    )}
                  </ScrollView>
                </View>
              )}

              <View style={{ marginTop: 16 }}>
                {addItemsList.map((item, index) => (
                  <View key={item.insumoId} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <RNText style={{ fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 }}>{item.nombre} <RNText style={{ fontSize: 12, color: '#10b981', fontWeight: 'bold' }}>(Stock act: {getInsumoStock(item.insumoId)})</RNText></RNText>
                    <TouchableOpacity 
                      onPress={() => setAddItemsList(prev => prev.filter((_, i) => i !== index))}
                        style={{ padding: 4, backgroundColor: '#fee2e2', borderRadius: 6 }}
                      >
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                    
                    <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                      <View style={{ flex: 1, marginRight: newInventario.tipo === 'entrada' ? 8 : 0 }}>
                        <RNText style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4 }}>Cantidad</RNText>
                        <TextInput
                          style={{
                            borderWidth: 1,
                            borderColor: (newInventario.tipo !== 'entrada' && item.cantidad > 0 && item.cantidad > (Number(getInsumoStock(item.insumoId)) || 0))
                              ? '#ef4444' : '#d1d5db',
                            borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827'
                          }}
                          keyboardType="numeric"
                          value={item.cantidad > 0 ? String(item.cantidad) : ''}
                          placeholder="0" placeholderTextColor="#9ca3af"
                          onChangeText={(t) => {
                            const newItems = [...addItemsList];
                            newItems[index].cantidad = Number(t.replace(/[^0-9]/g, '')) || 0;
                            setAddItemsList(newItems);
                          }}
                        />
                        {newInventario.tipo !== 'entrada' && item.cantidad > 0 && item.cantidad > (Number(getInsumoStock(item.insumoId)) || 0) && (
                          <RNText style={{ fontSize: 11, color: '#ef4444', marginTop: 3, fontWeight: '600' }}>
                            ⚠ Stock disponible: {getInsumoStock(item.insumoId)}
                          </RNText>
                        )}
                      </View>
                      
                      {newInventario.tipo === 'entrada' && (
                        <View style={{ flex: 1 }}>
                          <RNText style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4 }}>Precio Actual</RNText>
                          <TextInput
                            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827' }}
                            keyboardType="numeric"
                            value={item.precioActual > 0 ? String(item.precioActual) : ''}
                            placeholder="0" placeholderTextColor="#9ca3af"
                            onChangeText={(t) => {
                              const newItems = [...addItemsList];
                              newItems[index].precioActual = Number(t.replace(/[^0-9]/g, '')) || 0;
                              setAddItemsList(newItems);
                            }}
                          />
                          <LoteSuggestion
                            precio={item.precioActual}
                            cantidad={item.cantidad}
                            onApply={(u) => {
                              const newItems = [...addItemsList];
                              newItems[index].precioActual = u;
                              setAddItemsList(newItems);
                            }}
                          />
                        </View>
                      )}
                    </View>

                    {newInventario.tipo === 'entrada' && (
                      <View style={{ backgroundColor: '#f3f4f6', padding: 8, borderRadius: 8, marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <RNText style={{ fontSize: 12, color: '#6b7280' }}>Precio Anterior:</RNText>
                          <RNText style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>${item.precioAnterior.toLocaleString('es-CO')}</RNText>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <RNText style={{ fontSize: 12, color: '#6b7280' }}>Subtotal Anterior:</RNText>
                          <RNText style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>${(item.precioAnterior * item.cantidad).toLocaleString('es-CO')}</RNText>
                        </View>
                        <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 4 }} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <RNText style={{ fontSize: 12, color: '#6b7280' }}>Subtotal Actual:</RNText>
                          <RNText style={{ fontSize: 13, fontWeight: '700', color: '#10b981' }}>${(item.precioActual * item.cantidad).toLocaleString('es-CO')}</RNText>
                        </View>
                      </View>
                    )}
                    
                    <View>
                      <RNText style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4 }}>Observación (Opcional)</RNText>
                      <TextInput
                        style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827' }}
                        placeholder="Ej: Marca específica..."
                        placeholderTextColor="#9ca3af"
                        value={item.observacion}
                        onChangeText={(t) => {
                          const newItems = [...addItemsList];
                          newItems[index].observacion = t;
                          setAddItemsList(newItems);
                        }}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
            <Button className="bg-primary" onPress={handleCreateInventario} loading={saving}>
              <RNText style={{ color: '#fff', fontWeight: '600' }}>Crear</RNText>
            </Button>
          </View>
        </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showDetailModal} animationType="slide" onRequestClose={handleCloseDetailModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, marginBottom: Platform.OS === 'android' ? keyboardHeight : 0 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
            <View style={{ flex: 1 }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <View className="bg-white px-4 py-4 border-b border-gray-200 flex-row items-center justify-between">
            {selectionMode ? (
              <>
                <TouchableOpacity onPress={() => { setSelectionMode(false); setSelectedOrdenes(new Set()); }} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={22} color="#374151" />
                </TouchableOpacity>
                <RNText style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#111827' }}>
                  {selectedOrdenes.size} seleccionados
                </RNText>
                <TouchableOpacity onPress={handleSelectAll} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', opacity: (selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada') ? 1 : 0 }} disabled={!(selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada')}>
                  <MaterialCommunityIcons name="checkbox-multiple-marked" size={22} color="#374151" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity onPress={handleCloseDetailModal} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="arrow-back" size={22} color="#374151" />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
                  <RNText style={{ fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'center' }}>{selectedInventario?.nombre}</RNText>
                  <RNText style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                    {selectedInventario?.fechaYHora ? new Date(selectedInventario.fechaYHora).toLocaleDateString('es-CO') : ''}
                    {(selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada') ? ` • Total: $${Math.max(0, (selectedInventario.total !== undefined && selectedInventario.total > 0 ? selectedInventario.total : (ordenes.reduce((sum, o) => sum + (o.subtotal || ((o.precioActual || o.precio || 0) * o.cantidad)), 0))) - (selectedInventario?.descuento || 0)).toLocaleString('es-CO')}` : ''}
                  </RNText>

                </View>
                <View style={{ flexDirection: 'row' }}>
                  <TouchableOpacity onPress={handleExportImage} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                    <Ionicons name="share-outline" size={20} color="#3b82f6" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleDeleteInventario} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="trash" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          {selectionMode && selectedOrdenes.size > 0 && (selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada') && (
            <View style={{ padding: 12, backgroundColor: '#3b82f6' }}>
              <Button className="bg-green-500" onPress={handleBulkMarkComprado} loading={saving}>
                <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
                <RNText style={{ color: '#fff', fontWeight: '600', marginLeft: 8 }}>Ingresar {selectedOrdenes.size} items al stock</RNText>
              </Button>
            </View>
          )}

          <View style={{ flex: 1, minHeight: 2 }}>
            {loadingOrdenes ? (
              <View style={{ padding: 16 }}>
                {[...Array(4)].map((_, i) => <View key={i}>{renderSkeletonOrden()}</View>)}
              </View>
            ) : (
              <ScrollView 
                ref={detailModalScrollRef}
                style={{ flex: 1, padding: 16 }}
                contentContainerStyle={{ flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
              >
                {(selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada') && (
                  <>
                    <View style={{ flexDirection: 'row', marginBottom: 16 }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <View className="bg-white rounded-xl p-3 items-center">
                          <RNText className="text-xs text-gray-500">Sin comprar</RNText>
                          <RNText className="text-lg font-bold text-red-600 mt-1">{ordenesNoComprados.length}</RNText>
                          <RNText className="text-xs text-gray-400">${totalNoComprados.toLocaleString('es-CO')}</RNText>
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View className="bg-white rounded-xl p-3 items-center">
                          <RNText className="text-xs text-gray-500">Comprados</RNText>
                          <RNText className="text-lg font-bold text-green-600 mt-1">{ordenesComprados.length}</RNText>
                          <RNText className="text-xs text-gray-400">${totalComprados.toLocaleString('es-CO')}</RNText>
                        </View>
                      </View>
                    </View>

                    <View style={{ marginBottom: 16, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e5e7eb' }}>
                      {isEditingDescuento ? (
                        <View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <RNText style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>Monto del descuento</RNText>
                            <TouchableOpacity onPress={() => setIsEditingDescuento(false)} style={{ padding: 4 }}>
                              <Ionicons name="close" size={20} color="#9ca3af" />
                            </TouchableOpacity>
                          </View>
                          
                          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 12, paddingHorizontal: 16, height: 64, borderWidth: 1, borderColor: '#d1d5db', marginBottom: 12 }}>
                            <RNText style={{ color: '#4b5563', fontSize: 24, fontWeight: '600', marginRight: 8 }}>$</RNText>
                            <TextInput
                              style={{ flex: 1, color: '#111827', fontSize: 28, fontWeight: 'bold', padding: 0 }}
                              value={descuentoInputValue}
                              onChangeText={(text) => {
                                const numericValue = text.replace(/[^0-9]/g, '');
                                setDescuentoInputValue(numericValue ? numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : '');
                              }}
                              keyboardType="numeric"
                              placeholder="0"
                              placeholderTextColor="#9ca3af"
                              autoFocus
                            />
                          </View>

                          <TouchableOpacity 
                            onPress={handleUpdateDescuento} 
                            disabled={saving} 
                            style={{ height: 48, borderRadius: 12, backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}
                          >
                            {saving ? <ActivityIndicator size="small" color="#fff" /> : (
                              <>
                                <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                                <RNText style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Guardar Descuento</RNText>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                            <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                              <Ionicons name="pricetag" size={18} color="#ef4444" />
                            </View>
                            <View style={{ flexShrink: 1 }}>
                              <RNText style={{ fontSize: 12, color: '#6b7280', fontWeight: '500' }}>Descuento aplicado</RNText>
                              <RNText style={{ fontSize: 16, fontWeight: '700', color: selectedInventario?.descuento > 0 ? '#ef4444' : '#111827' }} numberOfLines={1}>
                                {selectedInventario?.descuento > 0 ? `-$${selectedInventario.descuento.toLocaleString('es-CO')}` : '$0'}
                              </RNText>
                            </View>
                          </View>

                          <TouchableOpacity 
                            onPress={() => {
                              setDescuentoInputValue(selectedInventario?.descuento ? selectedInventario.descuento.toString() : '');
                              setIsEditingDescuento(true);
                            }}
                            style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#f3f4f6', borderRadius: 8, marginLeft: 12 }}
                          >
                            <RNText style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>
                              {selectedInventario?.descuento > 0 ? 'Editar' : 'Agregar'}
                            </RNText>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </>
                )}

              {getProveedores().length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <RNText style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Proveedores</RNText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {getProveedores().map((prov, i) => (
                      <View key={i} style={{ backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, marginBottom: 8 }}>
                        <RNText style={{ fontSize: 12, color: '#3b82f6', fontWeight: '500' }}>{prov}</RNText>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <RNText style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginRight: 8 }}>Items ({ordenes.length})</RNText>
                      {ordenes.length > 0 && !isBulkEditing && (
                        <TouchableOpacity 
                          onPress={handleToggleBulkEdit}
                          style={{ padding: 6, backgroundColor: '#f3f4f6', borderRadius: 6, marginRight: 8 }}
                        >
                          <Ionicons name="create-outline" size={16} color="#6b7280" />
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      {isBulkEditing ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <TouchableOpacity 
                            onPress={handleToggleBulkEdit}
                            disabled={saving}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fee2e2', borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}
                          >
                            <Ionicons name="close" size={16} color="#ef4444" style={{ marginRight: 4 }} />
                            <RNText style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>Cancelar</RNText>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            onPress={handleSaveBulkEdit}
                            disabled={saving}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: saving ? '#9ca3af' : '#22c55e', borderRadius: 6, flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1.41 }}
                          >
                            {saving ? <ActivityIndicator size="small" color="#fff" /> : <>
                              <Ionicons name="save-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
                              <RNText style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Guardar Masivo</RNText>
                            </>}
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          {(selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada') && ordenes.length > 0 && canEditEntradas && (
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: selectionMode ? '#ef4444' : '#f3f4f6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                              onPress={() => {
                                setSelectionMode(!selectionMode);
                                if (selectionMode) setSelectedOrdenes(new Set());
                              }}
                            >
                              <Ionicons name={selectionMode ? "close" : "checkbox-outline"} size={16} color={selectionMode ? '#fff' : '#4b5563'} />
                              <RNText style={{ color: selectionMode ? '#fff' : '#4b5563', fontSize: 12, fontWeight: '600', marginLeft: 4 }}>{selectionMode ? 'Cancelar ingreso' : 'Ingresar al stock'}</RNText>
                            </TouchableOpacity>
                          )}
                          {((selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada') ? canCreateEntradas : canCreateSalidas) && (
                            <>
                              {(selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada') && (
                                <TouchableOpacity
                                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b82f6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 }}
                                  onPress={() => {
                                    setShowDetailModal(false);
                                    navigation.navigate('AiUpload', { targetInventarioId: selectedInventario?.IDinventario });
                                  }}
                                >
                                  <Ionicons name="sparkles" size={16} color="#fff" />
                                  <RNText style={{ color: '#fff', fontSize: 12, fontWeight: '600', marginLeft: 4 }}>Carga IA</RNText>
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#22c55e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                                onPress={() => {
                                  console.log('[DEBUG] Opening add item modal, insumos count:', insumos.length);
                                  if (insumos.length === 0) {
                                    console.log('[DEBUG] Insumos empty, triggering fetch...');
                                    fetchInsumos();
                                  }
                                  setShowAddItemModal(true);
                                }}
                              >
                                <Ionicons name="add" size={16} color="#fff" />
                                <RNText style={{ color: '#fff', fontSize: 12, fontWeight: '600', marginLeft: 4 }}>Agregar</RNText>
                              </TouchableOpacity>
                            </>
                          )}
                        </>
                      )}
                    </View>
                  </View>

                {(selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada') && ordenesNoComprados.length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <RNText style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Pendientes</RNText>
                    {renderGroupedList(ordenesNoComprados)}
                  </View>
                )}

                {(selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada') && ordenesComprados.length > 0 && (
                  <View>
                    <RNText style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Completados</RNText>
                    {renderGroupedList(ordenesComprados)}
                  </View>
                )}

                {(!selectedInventario?.tipo?.toLowerCase().includes('entrada')) && ordenes.length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    {renderGroupedList(ordenes)}
                  </View>
                )}

                {ordenes.length === 0 && (
                  <View className="bg-white rounded-xl p-6 items-center">
                    <MaterialCommunityIcons name="package-variant" size={40} color="#d1d5db" />
                    <RNText className="mt-2 text-gray-500">Sin items agregados</RNText>
                  </View>
                )}
              </View>

              <View style={{ height: 20 }} />
            </ScrollView>
            )}
            </View>
          </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Hidden ViewShot container for full receipt export */}
      {selectedInventario && (
        <View style={{ position: 'absolute', left: -9999, top: -9999, opacity: 0 }}>
          <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
            <View style={{ backgroundColor: '#ffffff', width: width, padding: 24, paddingBottom: 40 }}>
              <View style={{ alignItems: 'center', marginBottom: 24, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 16 }}>
                <RNText style={{ fontSize: 24, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 4 }}>{selectedInventario.nombre}</RNText>
                <RNText style={{ fontSize: 14, color: '#6b7280' }}>
                  {selectedInventario.fechaYHora ? new Date(selectedInventario.fechaYHora).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </RNText>
                {(selectedInventario.tipo?.toLowerCase() === 'entradas' || selectedInventario.tipo?.toLowerCase() === 'entrada') && (
                  <RNText style={{ fontSize: 16, fontWeight: '700', color: '#16a34a', marginTop: 8 }}>
                    Total: ${(Math.max(0, (selectedInventario.total !== undefined && selectedInventario.total > 0 ? selectedInventario.total : (ordenes.reduce((sum, o) => sum + (o.subtotal || ((o.precioActual || o.precio || 0) * o.cantidad)), 0))) - (selectedInventario.descuento || 0))).toLocaleString('es-CO')}
                  </RNText>
                )}
              </View>

              {(selectedInventario.tipo?.toLowerCase() === 'entradas' || selectedInventario.tipo?.toLowerCase() === 'entrada') && (
                <View style={{ flexDirection: 'row', marginBottom: 24 }}>
                  <View style={{ flex: 1, backgroundColor: '#fef2f2', borderRadius: 12, padding: 12, marginRight: 8, alignItems: 'center' }}>
                    <RNText style={{ fontSize: 12, color: '#991b1b', fontWeight: '600' }}>Pendientes</RNText>
                    <RNText style={{ fontSize: 18, fontWeight: '800', color: '#dc2626' }}>{ordenesNoComprados.length}</RNText>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12, marginLeft: 8, alignItems: 'center' }}>
                    <RNText style={{ fontSize: 12, color: '#166534', fontWeight: '600' }}>Comprados</RNText>
                    <RNText style={{ fontSize: 18, fontWeight: '800', color: '#16a34a' }}>{ordenesComprados.length}</RNText>
                  </View>
                </View>
              )}

              <View>
                {Object.entries(groupByCategory(ordenes))
                  .sort(([catA], [catB]) => catA.localeCompare(catB))
                  .map(([categoria, { items: catItems, total }]) => (
                    <View key={categoria} style={{ marginBottom: 20 }}>
                      <View style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <RNText style={{ fontSize: 14, fontWeight: '700', color: '#374151', textTransform: 'uppercase' }}>{categoria}</RNText>
                        {(selectedInventario.tipo?.toLowerCase() === 'entradas' || selectedInventario.tipo?.toLowerCase() === 'entrada') && (
                          <RNText style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>${total.toLocaleString('es-CO')}</RNText>
                        )}
                      </View>
                      
                      {catItems.map((item, idx) => {
                        const isComprado = item.seCompro === 'Si' || item.seCompro === 'si';
                        const isEntrada = selectedInventario.tipo?.toLowerCase() === 'entradas' || selectedInventario.tipo?.toLowerCase() === 'entrada';
                        return (
                          <View key={item.IDorderinventario} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: idx === catItems.length - 1 ? 0 : 1, borderBottomColor: '#f3f4f6' }}>
                            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: isComprado ? '#dcfce7' : '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 2 }}>
                              {isComprado ? (
                                <Ionicons name="checkmark" size={14} color="#16a34a" />
                              ) : (
                                <RNText style={{ fontSize: 12, color: '#9ca3af', fontWeight: '600' }}>{idx + 1}</RNText>
                              )}
                            </View>
                            <View style={{ flex: 1 }}>
                                <RNText style={{ fontSize: 14, fontWeight: '600', color: '#111827', textDecorationLine: isComprado ? 'line-through' : 'none' }}>{getInsumoName(item.nombreDelAlimento)}</RNText>
                                <RNText style={{ fontSize: 12.5, color: isEntrada ? '#f59e0b' : '#ef4444', marginTop: 2, fontWeight: 'bold' }}>{isEntrada ? 'Pide' : 'Saca'}: {item.cantidad} und</RNText>
                              </View>
                            {isEntrada && (
                              <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
                                <RNText style={{ fontSize: 14, fontWeight: '700', color: isComprado ? '#16a34a' : '#111827' }}>
                                  ${(item.subtotal || ((item.precioActual || item.precio || 0) * item.cantidad)).toLocaleString('es-CO')}
                                </RNText>
                                <RNText style={{ fontSize: 11, color: '#9ca3af' }}>
                                  ${(item.precioActual || (item.subtotal ? item.subtotal / (item.cantidad || 1) : 0)).toLocaleString('es-CO')} c/u
                                </RNText>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                ))}
              </View>
            </View>
          </ViewShot>
        </View>
      )}

      <Modal visible={showAddItemModal} animationType="slide" onRequestClose={() => setShowAddItemModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, marginBottom: Platform.OS === 'android' ? keyboardHeight : 0 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }} edges={['top']}>
          <View className="px-4 py-4 border-b border-gray-200 flex-row items-center justify-between">
            <RNText style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Agregar Items</RNText>
            <TouchableOpacity onPress={() => setShowAddItemModal(false)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView 
            ref={addItemModalScrollRef}
            style={{ flex: 1, padding: 16 }}
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ marginBottom: 12 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <TouchableOpacity
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: selectedCategoriaFilter === null ? '#3b82f6' : '#f3f4f6', marginRight: 8 }}
                  onPress={() => setSelectedCategoriaFilter(null)}
                >
                  <RNText style={{ fontSize: 12, fontWeight: '600', color: selectedCategoriaFilter === null ? '#fff' : '#4b5563' }}>Todos</RNText>
                </TouchableOpacity>
                {getCategoriasInsumos().map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: selectedCategoriaFilter === cat ? '#3b82f6' : '#f3f4f6', marginRight: 8 }}
                    onPress={() => setSelectedCategoriaFilter(cat)}
                  >
                    <RNText style={{ fontSize: 12, fontWeight: '600', color: selectedCategoriaFilter === cat ? '#fff' : '#4b5563' }}>{cat}</RNText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <Input
              placeholder="Buscar insumos..."
              value={addItemSearchText}
              onChangeText={setAddItemSearchText}
            />

            {(addItemSearchText.length > 0 || selectedCategoriaFilter) && (
              <View style={{ maxHeight: 200, backgroundColor: '#f9fafb', borderRadius: 8, marginTop: 8, padding: 8, borderWidth: 1, borderColor: '#e5e7eb' }}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {insumos
                    .filter(i => {
                      const matchText = (i.nombre || i.Nombre || '').toLowerCase().includes(addItemSearchText.toLowerCase());
                      const cat = i.nombreCategoria || i.NombreCategoria || i.categoriaNombre || i.Categoria;
                      const matchCat = selectedCategoriaFilter ? cat === selectedCategoriaFilter : true;
                      
                      let matchStock = true;
                      if (selectedInventario?.tipo && !selectedInventario.tipo.toLowerCase().includes('entrada')) {
                        const stock = Number(getInsumoStock(i.IDalimentos)) || 0;
                        matchStock = stock > 0;
                      }

                      return matchText && matchCat && matchStock;
                    })
                    .sort((a, b) => {
                      const isSelectedA = addItemsList.some(i => i.insumoId === a.IDalimentos) ? 1 : 0;
                      const isSelectedB = addItemsList.some(i => i.insumoId === b.IDalimentos) ? 1 : 0;
                      if (isSelectedA !== isSelectedB) {
                        return isSelectedB - isSelectedA; // Seleccionados van primero
                      }
                      const stockA = Number(a.disponible || a.Disponible || a.cantidad || a.Cantidad || 0);
                      const stockB = Number(b.disponible || b.Disponible || b.cantidad || b.Cantidad || 0);
                      return stockB - stockA;
                    })
                    .slice(0, 20)
                    .map(insumo => (
                      <TouchableOpacity
                        key={insumo.IDalimentos}
                        style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center' }}
                        onPress={() => {
                          if (!addItemsList.find(i => i.insumoId === insumo.IDalimentos)) {
                            const precioBase = Number(insumo.precio || insumo.Precio) || 0;
                            setAddItemsList(prev => [{
                              insumoId: insumo.IDalimentos,
                              nombre: insumo.nombre || insumo.Nombre || '',
                              categoria: insumo.nombreCategoria || insumo.NombreCategoria || '',
                              cantidad: 1,
                              precioAnterior: precioBase,
                              precioActual: precioBase,
                              observacion: ''
                            }, ...prev]);
                          }
                          setAddItemSearchText('');
                        }}
                      >
                        <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#f3f4f6', marginRight: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                          {getInsumoImage(insumo.IDalimentos) ? (
                            <Image
                              source={{ uri: getInsumoImage(insumo.IDalimentos) as string }}
                              style={{ width: '100%', height: '100%', borderRadius: 8 }}
                              resizeMode="cover"
                            />
                          ) : (
                            <MaterialCommunityIcons name="package-variant-closed" size={20} color="#9ca3af" />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <RNText style={{ fontSize: 14, color: '#374151', fontWeight: '600' }}>{insumo.nombre || insumo.Nombre}</RNText>
                          <RNText style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                            {(!selectedInventario?.tipo || selectedInventario.tipo.toLowerCase().includes('entrada')) && (
                                <RNText>Último precio: ${(Number(insumo.precio || insumo.Precio) || 0).toLocaleString('es-CO')} • </RNText>
                              )}
                              <RNText style={{ color: '#10b981', fontWeight: 'bold' }}>Stock act: {getInsumoStock(insumo.IDalimentos)}</RNText>
                            </RNText>
                        </View>
                      </TouchableOpacity>
                    ))}
                  {insumos.filter(i => {
                      const matchText = (i.nombre || i.Nombre || '').toLowerCase().includes(addItemSearchText.toLowerCase());
                      const cat = i.nombreCategoria || i.NombreCategoria || i.categoriaNombre || i.Categoria;
                      const matchCat = selectedCategoriaFilter ? cat === selectedCategoriaFilter : true;
                      
                      let matchStock = true;
                      if (selectedInventario?.tipo && !selectedInventario.tipo.toLowerCase().includes('entrada')) {
                        const stock = Number(getInsumoStock(i.IDalimentos)) || 0;
                        matchStock = stock > 0;
                      }

                      return matchText && matchCat && matchStock;
                    }).length === 0 && (
                    <RNText style={{ padding: 8, color: '#6b7280', textAlign: 'center' }}>No se encontraron insumos</RNText>
                  )}
                </ScrollView>
              </View>
            )}

            <View style={{ marginTop: 16 }}>
              {addItemsList.map((item, index) => (
                <View key={item.insumoId} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <RNText style={{ fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 }}>{item.nombre} <RNText style={{ fontSize: 12, color: '#10b981', fontWeight: 'bold' }}>(Stock act: {getInsumoStock(item.insumoId)})</RNText></RNText>
                    <TouchableOpacity 
                      onPress={() => setAddItemsList(prev => prev.filter((_, i) => i !== index))}
                      style={{ padding: 4, backgroundColor: '#fee2e2', borderRadius: 6 }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                    <View style={{ flex: 1, marginRight: (selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada') ? 8 : 0 }}>
                      <RNText style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4 }}>Cantidad</RNText>
                      <TextInput
                        style={{
                          borderWidth: 1,
                          borderColor: (!(selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada') && item.cantidad > 0 && item.cantidad > (Number(getInsumoStock(item.insumoId)) || 0))
                            ? '#ef4444' : '#d1d5db',
                          borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827'
                        }}
                        keyboardType="numeric"
                        value={item.cantidad ? String(item.cantidad) : ''}
                        onFocus={() => setActiveInputIndex(index)}
                        onChangeText={(t) => {
                          const newItems = [...addItemsList];
                          newItems[index].cantidad = Number(t.replace(/[^0-9]/g, '')) || 0;
                          setAddItemsList(newItems);
                        }}
                      />
                      {!(selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada') && item.cantidad > 0 && item.cantidad > (Number(getInsumoStock(item.insumoId)) || 0) && (
                        <RNText style={{ fontSize: 11, color: '#ef4444', marginTop: 3, fontWeight: '600' }}>
                          ⚠ Stock disponible: {getInsumoStock(item.insumoId)}
                        </RNText>
                      )}
                    </View>
                    
                    {(selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada') && (
                      <View style={{ flex: 1 }}>
                        <RNText style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4 }}>Precio Actual</RNText>
                        <TextInput
                          style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827' }}
                          keyboardType="numeric"
                          value={item.precioActual ? String(item.precioActual) : ''}
                          onFocus={() => setActiveInputIndex(index)}
                          onChangeText={(t) => {
                            const newItems = [...addItemsList];
                            newItems[index].precioActual = Number(t.replace(/[^0-9]/g, '')) || 0;
                            setAddItemsList(newItems);
                          }}
                        />
                        <LoteSuggestion
                          precio={item.precioActual}
                          cantidad={item.cantidad}
                          onApply={(u) => {
                            const newItems = [...addItemsList];
                            newItems[index].precioActual = u;
                            setAddItemsList(newItems);
                          }}
                        />
                      </View>
                    )}
                  </View>

                  {(selectedInventario?.tipo?.toLowerCase() === 'entradas' || selectedInventario?.tipo?.toLowerCase() === 'entrada') && (
                    <View style={{ backgroundColor: '#f3f4f6', padding: 8, borderRadius: 8, marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <RNText style={{ fontSize: 12, color: '#6b7280' }}>Precio Anterior:</RNText>
                        <RNText style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>${item.precioAnterior.toLocaleString('es-CO')}</RNText>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <RNText style={{ fontSize: 12, color: '#6b7280' }}>Subtotal Anterior:</RNText>
                        <RNText style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>${(item.precioAnterior * item.cantidad).toLocaleString('es-CO')}</RNText>
                      </View>
                      <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 4 }} />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <RNText style={{ fontSize: 12, color: '#6b7280' }}>Subtotal Actual:</RNText>
                        <RNText style={{ fontSize: 13, fontWeight: '700', color: '#10b981' }}>${(item.precioActual * item.cantidad).toLocaleString('es-CO')}</RNText>
                      </View>
                    </View>
                  )}
                  
                  <View>
                    <RNText style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4 }}>Observación (Opcional)</RNText>
                    <TextInput
                      style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827' }}
                      placeholder="Ej: Marca específica..."
                      placeholderTextColor="#9ca3af"
                      value={item.observacion}
                      onChangeText={(t) => {
                        const newItems = [...addItemsList];
                        newItems[index].observacion = t;
                        setAddItemsList(newItems);
                      }}
                    />
                  </View>
                </View>
              ))}
              {addItemsList.length === 0 && (
                <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'dashed' }}>
                  <Ionicons name="list" size={32} color="#9ca3af" />
                  <RNText style={{ marginTop: 8, color: '#6b7280', textAlign: 'center' }}>Busca y selecciona insumos para agregarlos</RNText>
                </View>
              )}
            </View>
            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
            <Button className="bg-green-500" onPress={handleAddItem} loading={saving} disabled={addItemsList.length === 0}>
              <RNText style={{ color: '#fff', fontWeight: '600' }}>Guardar {addItemsList.length} Items</RNText>
            </Button>
          </View>
        </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
      {/* Modal para Confirmar Eliminación de Ítem ya Comprado */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', width: '85%', borderRadius: 16, overflow: 'hidden', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }}>
            <View style={{ padding: 20, alignItems: 'center' }}>
              <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Ionicons name="trash-outline" size={24} color="#ef4444" />
              </View>
              <RNText style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 8, textAlign: 'center' }}>
                Eliminar Registro
              </RNText>
              <RNText style={{ fontSize: 14, color: '#4b5563', textAlign: 'center', marginBottom: 20 }}>
                Este ítem ya afectó el stock. ¿Qué deseas hacer con las unidades en el inventario principal?
              </RNText>
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
              <TouchableOpacity
                style={{ paddingVertical: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
                onPress={() => handleConfirmDelete(false)}
              >
                <RNText style={{ fontSize: 16, color: '#3b82f6', fontWeight: '600' }}>Solo borrar registro (Limpieza)</RNText>
                <RNText style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>El stock actual no cambiará</RNText>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={{ paddingVertical: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
                onPress={() => handleConfirmDelete(true)}
              >
                <RNText style={{ fontSize: 16, color: '#ef4444', fontWeight: '600' }}>Borrar y deshacer stock</RNText>
                <RNText style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>El stock se revertirá matemáticamente</RNText>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ paddingVertical: 16, alignItems: 'center', backgroundColor: '#f9fafb' }}
                onPress={() => {
                  setShowDeleteModal(false);
                  setItemToDelete(null);
                }}
              >
                <RNText style={{ fontSize: 16, color: '#4b5563', fontWeight: '600' }}>Cancelar</RNText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de confirmación para cambios sin guardar */}
      <Modal visible={showUnsavedChangesModal} transparent animationType="fade" onRequestClose={() => setShowUnsavedChangesModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', width: '85%', borderRadius: 16, overflow: 'hidden', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }}>
            <View style={{ padding: 20, alignItems: 'center' }}>
              <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Ionicons name="warning-outline" size={24} color="#d97706" />
              </View>
              <RNText style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 8, textAlign: 'center' }}>
                Cambios sin guardar
              </RNText>
              <RNText style={{ fontSize: 14, color: '#4b5563', textAlign: 'center', marginBottom: 20 }}>
                Tienes ediciones masivas pendientes. ¿Estás seguro de que deseas salir sin guardar? Los cambios se perderán.
              </RNText>
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', flexDirection: 'row' }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 16, alignItems: 'center', borderRightWidth: 1, borderRightColor: '#f3f4f6', backgroundColor: '#f9fafb' }}
                onPress={() => setShowUnsavedChangesModal(false)}
              >
                <RNText style={{ fontSize: 16, color: '#4b5563', fontWeight: '600' }}>Cancelar</RNText>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 16, alignItems: 'center' }}
                onPress={() => {
                  setShowUnsavedChangesModal(false);
                  setIsBulkEditing(false);
                  setBulkEditValues({});
                  setShowDetailModal(false);
                  setSelectedInventario(null);
                }}
              >
                <RNText style={{ fontSize: 16, color: '#ef4444', fontWeight: '600' }}>Salir sin guardar</RNText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal para Detalles de OrdenInventarioItem Individual */}
      <Modal visible={showOrdenDetailModal} animationType="slide" onRequestClose={() => setShowOrdenDetailModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff' }}>
            <RNText style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Detalle del Registro</RNText>
            <TouchableOpacity onPress={() => setShowOrdenDetailModal(false)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          {selectedOrdenItem && (
            <View style={{ flex: 1 }} {...detailPanResponder.panHandlers}>
              <ScrollView style={{ flex: 1, padding: 16 }}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3b82f6']} />
                }
              >
              
              {isChangingInsumo ? (
                <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <RNText style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Seleccionar nuevo insumo</RNText>
                    <TouchableOpacity onPress={() => { setIsChangingInsumo(false); setPendingNewInsumoId(null); }}>
                      <RNText style={{ color: '#3b82f6', fontWeight: '600' }}>Cancelar</RNText>
                    </TouchableOpacity>
                  </View>
                  
                  <View style={{ marginBottom: 12 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                      <TouchableOpacity
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: changeInsumoCategoriaFilter === null ? '#3b82f6' : '#f3f4f6', marginRight: 8 }}
                        onPress={() => setChangeInsumoCategoriaFilter(null)}
                      >
                        <RNText style={{ fontSize: 12, fontWeight: '600', color: changeInsumoCategoriaFilter === null ? '#fff' : '#4b5563' }}>Todos</RNText>
                      </TouchableOpacity>
                      {getCategoriasInsumos().map(cat => (
                        <TouchableOpacity
                          key={cat}
                          style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: changeInsumoCategoriaFilter === cat ? '#3b82f6' : '#f3f4f6', marginRight: 8 }}
                          onPress={() => setChangeInsumoCategoriaFilter(cat)}
                        >
                          <RNText style={{ fontSize: 12, fontWeight: '600', color: changeInsumoCategoriaFilter === cat ? '#fff' : '#4b5563' }}>{cat}</RNText>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  <Input
                    placeholder="Buscar insumos..."
                    value={changeInsumoSearchText}
                    onChangeText={setChangeInsumoSearchText}
                  />

                  <View style={{ maxHeight: 300, marginTop: 8 }}>
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {filteredChangeInsumos.map(insumo => {
                        const catName = insumo.nombreCategoria || insumo.NombreCategoria || insumo.categoriaNombre || insumo.Categoria || 'Sin categoría';
                        const isSelected = pendingNewInsumoId === insumo.IDalimentos;
                        return (
                          <TouchableOpacity
                            key={insumo.IDalimentos}
                            style={{ 
                              paddingVertical: 10, 
                              borderBottomWidth: 1, 
                              borderBottomColor: '#e5e7eb', 
                              flexDirection: 'row', 
                              alignItems: 'center',
                              backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                              paddingHorizontal: isSelected ? 8 : 0,
                              borderRadius: isSelected ? 8 : 0
                            }}
                            onPress={() => setPendingNewInsumoId(insumo.IDalimentos)}
                          >
                            <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#f3f4f6', marginRight: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                              {getInsumoImage(insumo.IDalimentos) ? (
                                <Image
                                  source={{ uri: getInsumoImage(insumo.IDalimentos) as string }}
                                  style={{ width: '100%', height: '100%', borderRadius: 8 }}
                                  resizeMode="cover"
                                />
                              ) : (
                                <MaterialCommunityIcons name="package-variant-closed" size={24} color="#9ca3af" />
                              )}
                            </View>
                            <View style={{ flex: 1 }}>
                              <RNText style={{ fontSize: 15, fontWeight: '600', color: '#1f2937' }}>{insumo.nombre || insumo.Nombre}</RNText>
                              <RNText style={{ fontSize: 12, color: '#6b7280' }}>{catName}</RNText>
                            </View>
                            {isSelected && (
                              <Ionicons name="checkmark-circle" size={24} color="#3b82f6" />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                  {pendingNewInsumoId && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
                      <TouchableOpacity 
                        style={{ flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginRight: 8 }}
                        onPress={() => setPendingNewInsumoId(null)}
                      >
                        <RNText style={{ color: '#4b5563', fontWeight: '600', fontSize: 15 }}>Cancelar</RNText>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={{ flex: 1, backgroundColor: '#3b82f6', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginLeft: 8 }}
                        onPress={() => {
                          handleChangeInsumo(pendingNewInsumoId);
                          setPendingNewInsumoId(null);
                        }}
                      >
                        <RNText style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Guardar</RNText>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : (
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}>
                    <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: '#f3f4f6', marginRight: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                      {getInsumoImage(selectedOrdenItem.nombreDelAlimento || '') ? (
                        <Image
                          source={{ uri: getInsumoImage(selectedOrdenItem.nombreDelAlimento || '') }}
                          style={{ width: '100%', height: '100%', borderRadius: 12 }}
                          resizeMode="cover"
                        />
                      ) : (
                        <MaterialCommunityIcons name="package-variant-closed" size={28} color="#9ca3af" />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <RNText style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>{getInsumoName(selectedOrdenItem.nombreDelAlimento)}</RNText>
                      <RNText style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>{selectedOrdenItem.categoria || getInsumoCategoria(selectedOrdenItem.nombreDelAlimento)}</RNText>
                    </View>
                  </View>
                  <View style={{ backgroundColor: selectedInventario?.tipo?.toUpperCase().includes('ENTRADA') || selectedOrdenItem?.inventario?.tipo?.toUpperCase().includes('ENTRADA') ? '#dcfce7' : '#fee2e2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <RNText style={{ fontSize: 12, fontWeight: 'bold', color: selectedInventario?.tipo?.toUpperCase().includes('ENTRADA') || selectedOrdenItem?.inventario?.tipo?.toUpperCase().includes('ENTRADA') ? '#16a34a' : '#ef4444' }}>
                      {selectedInventario?.tipo?.toUpperCase().includes('ENTRADA') || selectedOrdenItem?.inventario?.tipo?.toUpperCase().includes('ENTRADA') ? 'ENTRADA' : 'SALIDA'}
                    </RNText>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                  <View style={{ width: '50%', marginBottom: 16 }}>
                    <RNText style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Cantidad Movida</RNText>
                    <RNText style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>{selectedOrdenItem.cantidad} und</RNText>
                  </View>
                  <View style={{ width: '50%', marginBottom: 16 }}>
                    <RNText style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Fecha y Hora</RNText>
                    <RNText style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>{selectedOrdenItem.fechaYHora ? new Date(selectedOrdenItem.fechaYHora).toLocaleString('es-CO') : 'N/A'}</RNText>
                  </View>
                  <View style={{ width: '50%', marginBottom: 16 }}>
                    <RNText style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Estado de Stock</RNText>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: selectedOrdenItem.seCompro?.toLowerCase() === 'si' ? '#22c55e' : '#f59e0b', marginRight: 6 }} />
                      <RNText style={{ fontSize: 14, fontWeight: '600', color: selectedOrdenItem.seCompro?.toLowerCase() === 'si' ? '#22c55e' : '#f59e0b' }}>
                        {selectedOrdenItem.seCompro?.toLowerCase() === 'si' ? 'Completado' : 'Pendiente'}
                      </RNText>
                    </View>
                  </View>
                  {selectedOrdenItem.provedor ? (
                    <View style={{ width: '50%', marginBottom: 16 }}>
                      <RNText style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Proveedor</RNText>
                      <RNText style={{ fontSize: 14, fontWeight: '600', color: '#3b82f6' }}>{selectedOrdenItem.provedor}</RNText>
                    </View>
                  ) : null}
                </View>

                <View style={{ height: 1, backgroundColor: '#f3f4f6', marginVertical: 12 }} />

                <RNText style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 12 }}>
                  {selectedInventario?.tipo?.toUpperCase().includes('ENTRADA') || selectedOrdenItem?.inventario?.tipo?.toUpperCase().includes('ENTRADA') ? 'Detalles Financieros' : 'Detalles de Salida'}
                </RNText>
                
                {selectedInventario?.tipo?.toUpperCase().includes('ENTRADA') || selectedOrdenItem?.inventario?.tipo?.toUpperCase().includes('ENTRADA') ? (
                  <View style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <RNText style={{ fontSize: 13, color: '#6b7280' }}>Precio Unitario Ant:</RNText>
                      <RNText style={{ fontSize: 13, fontWeight: '500', color: '#374151' }}>${(selectedOrdenItem.precioAnterior || 0).toLocaleString('es-CO')}</RNText>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <RNText style={{ fontSize: 13, color: '#6b7280' }}>Precio Unitario Act:</RNText>
                      <RNText style={{ fontSize: 13, fontWeight: '600', color: '#10b981' }}>${(selectedOrdenItem.precioActual || 0).toLocaleString('es-CO')}</RNText>
                    </View>
                    <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 8 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <RNText style={{ fontSize: 13, color: '#6b7280' }}>Subtotal Ant:</RNText>
                      <RNText style={{ fontSize: 13, fontWeight: '500', color: '#374151' }}>${((selectedOrdenItem.precioAnterior || 0) * selectedOrdenItem.cantidad).toLocaleString('es-CO')}</RNText>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <RNText style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Subtotal Actual:</RNText>
                      <RNText style={{ fontSize: 15, fontWeight: '700', color: '#10b981' }}>${(selectedOrdenItem.subtotal || ((selectedOrdenItem.precioActual || 0) * selectedOrdenItem.cantidad)).toLocaleString('es-CO')}</RNText>
                    </View>
                  </View>
                ) : (
                  <View style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <RNText style={{ fontSize: 13, color: '#6b7280' }}>Cantidad Retirada:</RNText>
                      <RNText style={{ fontSize: 14, fontWeight: '700', color: '#ef4444' }}>{selectedOrdenItem.cantidad} und</RNText>
                    </View>
                    <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 8 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <RNText style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Stock Actual del Insumo:</RNText>
                      <RNText style={{ fontSize: 15, fontWeight: '700', color: '#3b82f6' }}>{getInsumoStock(selectedOrdenItem.nombreDelAlimento)} und</RNText>
                    </View>
                  </View>
                )}

                {selectedOrdenItem.observacion ? (
                  <View style={{ marginTop: 16 }}>
                    <RNText style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Observaciones</RNText>
                    <View style={{ backgroundColor: '#fefce8', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fef08a' }}>
                      <RNText style={{ fontSize: 13, color: '#854d0e' }}>{selectedOrdenItem.observacion}</RNText>
                    </View>
                  </View>
                ) : null}
              </View>
              )}
              
              {!isChangingInsumo && (isAdmin || ((selectedInventario?.tipo?.toUpperCase().includes('ENTRADA') || selectedOrdenItem?.inventario?.tipo?.toUpperCase().includes('ENTRADA')) ? canEditEntradas : canEditSalidas)) && (
                <>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0fdf4', paddingVertical: 14, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#bbf7d0' }}
                    onPress={() => setIsChangingInsumo(true)}
                  >
                    <Ionicons name="swap-horizontal-outline" size={18} color="#16a34a" />
                    <RNText style={{ fontSize: 15, fontWeight: '600', color: '#16a34a', marginLeft: 8 }}>Cambiar Insumo</RNText>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff', paddingVertical: 14, borderRadius: 12, marginBottom: 12 }}
                    onPress={() => {
                      setShowOrdenDetailModal(false);
                      navigation.navigate('InsumoDetail', { id: getInsumoId(selectedOrdenItem.nombreDelAlimento) });
                    }}
                  >
                    <Ionicons name="open-outline" size={18} color="#3b82f6" />
                    <RNText style={{ fontSize: 15, fontWeight: '600', color: '#3b82f6', marginLeft: 8 }}>Ir al detalle del Insumo</RNText>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fee2e2', paddingVertical: 14, borderRadius: 12 }}
                onPress={() => {
                  setShowOrdenDetailModal(false);
                  handleDeleteOrden(selectedOrdenItem);
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <RNText style={{ fontSize: 15, fontWeight: '600', color: '#ef4444', marginLeft: 8 }}>Eliminar este registro</RNText>
              </TouchableOpacity>
              
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
          )}
        </SafeAreaView>
      </Modal>

    </View>
  );
};

export default InventarioScreen;