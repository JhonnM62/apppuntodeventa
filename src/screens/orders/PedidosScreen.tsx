import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, TouchableOpacity, ActivityIndicator, Text as RNText, StyleSheet, FlatList, RefreshControl, Modal, ScrollView, Pressable, Image, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { FlashList as OriginalFlashList } from '@shopify/flash-list';
const FlashList = OriginalFlashList as any;
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getSales, updateVentaEstado, updateVentaPago, deleteSale, deleteSalesBulk, getVentaById } from '../../services/sales';
import { useSocket, useSocketEvent, useSocketEmitter } from '../../hooks';
import { Room, SocketEvent } from '../../types/socket.types';
import Toast from 'react-native-toast-message';
import { useSalesStore } from '../../store/useSalesStore';
import PaymentModal from '../../components/ui/PaymentModal';
import { Text } from '../../components/ui/text';
import { RootStackParamList } from '../../navigation/RootNavigator';
import useCartStore from '../../store/useCartStore';
import useAuthStore from '../../store/useAuthStore';
import { useProductStore } from '../../store/useProductStore';
import { usePermissions } from '../../hooks/usePermissions';
import { useCustomAlert } from '../../context/CustomAlertContext';

const TABS = [
  { key: 'todos', label: 'TODOS', color: '#6366f1' },
  { key: 'PAGADO', label: 'PAGADO', color: '#22c55e' },
  { key: 'TOMADO', label: 'TOMADO', color: '#3b82f6' },
  { key: 'LISTO_PARA_ENTREGA', label: 'LISTO PARA ENTREGA', color: '#8b5cf6' },
  { key: 'ENTREGADO', label: 'ENTREGADO', color: '#10b981' },
  { key: 'DEUDOR', label: 'DEUDOR', color: '#ef4444' },
  { key: 'EN_EL_CARRITO', label: 'EN EL CARRITO', color: '#f59e0b' },
];

const METODOS_PAGO = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'Nequi', 'Daviplata', 'PENDIENTE'];
const ESTADOS_POSIBLES = ['EN_EL_CARRITO', 'TOMADO', 'LISTO_PARA_ENTREGA', 'PAGADO', 'ENTREGADO', 'DEUDOR'];

type VentaItem = {
  IDventas: string;
  mesa?: string;
  estado?: string;
  medioDePago?: string;
  efectivoRecibido?: number;
  devueltas?: number;
  banco?: string;
  totalInput?: number;
  pedido?: string;
  fecha?: string;
  hora?: string;
  fechaYHora?: string;
  direccion?: string;
  costoDelDomicilio?: number;
  descuento?: number;
  porcentajeDeDescuento?: string;
  numeroTelefono?: number;
  mensaje?: string;
  cliente?: string;
  ordenVentas?: OrderVenta[];
  usuarioRelacion?: { nombre?: string; email?: string };
  registroDeTiempo?: any[];
};

type OrderVenta = {
  IDorderventas?: string;
  nombre?: string;
  categoria?: string;
  cantidad?: number;
  precio?: number;
  precioTotal?: number;
  estado?: string;
  comentarios?: string;
  salsa?: string;
  helado?: string;
  topings?: string;
  imagen?: string;
  nombreProducto?: string;
  categoriaProducto?: string;
  imagenUrl?: string;
  producto?: {
    IDproductos?: string;
    nombre?: string;
    categoriaNombre?: string;
    categoria?: string;
    imagenUrl?: string;
    image?: string;
  };
};

interface FilterState {
  searchText: string;
  estados: string[];
  mediosDePago: string[];
  fechaDesde: string;
  fechaHasta: string;
  vendedor: string;
  minTotal: string;
  maxTotal: string;
  pedidoNumero: string;
  cliente: string;
  categoriaProducto: string;
}

type SectionData = {
  title: string;
  date: Date;
  data: VentaItem[];
};

const PedidosScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { showAlert } = useCustomAlert();
  const { canCreate: canCreatePedido } = usePermissions('pedidos');
  const { canCreate: canCreateVenta } = usePermissions('ventas');
  const [activeTab, setActiveTab] = useState('todos');
  const [loading, setLoading] = useState(useSalesStore.getState().ventas.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedToDelete, setSelectedToDelete] = useState<string[]>([]);
  const [showDatePicker, setShowDatePicker] = useState<{show: boolean, type: 'desde' | 'hasta'}>({show: false, type: 'desde'});
  const [selectedVenta, setSelectedVenta] = useState<VentaItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [cobrarVenta, setCobrarVenta] = useState<VentaItem | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);

  const [filters, setFilters] = useState<FilterState>({
    searchText: '',
    estados: [],
    mediosDePago: [],
    fechaDesde: '',
    fechaHasta: '',
    vendedor: '',
    minTotal: '',
    maxTotal: '',
    pedidoNumero: '',
    cliente: '',
    categoriaProducto: '',
  });

  const { joinRoom, isConnected } = useSocket();
  const { emitOrdenActualizada } = useSocketEmitter();
  const { user } = useAuthStore();
  const isAdminApp = user?.rol === 'Admin app';

  const productCategorias = useProductStore((state) => state.categorias);


  const route = useRoute<any>();

  const cachedVentas = useSalesStore((state) => state.ventas);
  const setCachedVentas = useSalesStore((state) => state.setVentas);
  const shouldRefetchVentas = useSalesStore((state) => state.shouldRefetch);
  const addVenta = useSalesStore((state) => state.addVenta);

  useFocusEffect(
    useCallback(() => {
      if (route.params?.ventaId) {
        // En lugar de buscarla localmente donde podría no estar, la fetcheamos
        const loadSale = async () => {
          try {
            const result = await getVentaById(route.params.ventaId);
            if (result?.data) {
              setSelectedVenta(result.data);
              setModalVisible(true);
              // Limpiar params para no re-abrir modal
              navigation.setParams({ ventaId: undefined });
            }
          } catch (e) {
            console.error('Error fetching deep linked venta:', e);
          }
        };
        loadSale();
      }
    }, [route.params?.ventaId, navigation])
  );
  const updateVenta = useSalesStore((state) => state.updateVenta);
  const removeVenta = useSalesStore((state) => state.removeVenta);
  const forceFetchRef = useRef<() => void>(() => {});

  const tabsWithCounts = useMemo(() => {
    const arraySeguro = Array.isArray(cachedVentas) ? cachedVentas : [];
    
    // Check if there are any non-PAGADO/ENTREGADO orders
    const pendingOrdersCount = arraySeguro.filter(v => 
      v.estado && v.estado !== 'PAGADO' && v.estado !== 'ENTREGADO'
    ).length;

    // Dispatch global event or update global store for floating dock badge?
    // The FloatingDock can be notified via useSalesStore or we can just keep the logic here for the Tabs
    
    return TABS.map(tab => {
      let count = 0;
      if (tab.key === 'todos') {
        count = arraySeguro.length;
      } else {
        const tabUpper = tab.key.toUpperCase().replace(/_/g, ' ');
        count = arraySeguro.filter(v => {
          const estadoUpper = (v.estado || '').toUpperCase().replace(/_/g, ' ');
          return estadoUpper === tabUpper;
        }).length;
      }
      return { ...tab, count };
    });
  }, [cachedVentas]);

  const fetchVentas = useCallback(async (force = false) => {
    if (!force && !shouldRefetchVentas() && cachedVentas && Array.isArray(cachedVentas) && cachedVentas.length > 0) {
      setLoading(false);
      return;
    }
    try {
      // Pedimos datos frescos de ventas
      const data = await getSales({ limit: 500 });
      // Extraemos array si viene envuelto en objeto { data: [...], meta: {...} }
      const ventasData = data?.data || data;
      if (Array.isArray(ventasData)) {
        setCachedVentas(ventasData);
      }
    } catch (error: any) {
      if (error?.message === 'Network Error') {
        console.log('[Pedidos] Fetch ignorado: Sin red o app en segundo plano');
      } else {
        console.error('Error fetching sales:', error?.message || error);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cachedVentas, shouldRefetchVentas, setCachedVentas]);

  useEffect(() => {
    forceFetchRef.current = () => fetchVentas(true);
  }, [fetchVentas]);

  useEffect(() => {
    fetchVentas();
  }, []);

  // ── Sockets: escuchar REFRESH_VENTAS del backend ──────────────────────────
  useSocketEvent<{ action: string; venta?: any; ventaId?: string; ventaIds?: string[] }>(
    SocketEvent.REFRESH_VENTAS,
    (data) => {
      if (!data) return;
      if (data.action === 'updateEstado' && data.venta) {
        // Actualización parcial en store (sin re-fetch completo)
        updateVenta(data.venta.IDventas, data.venta);
        // Si el modal está mostrando ese pedido, sincronizarlo también
        setSelectedVenta((prev) =>
          prev && prev.IDventas === data.venta.IDventas
            ? { ...prev, ...data.venta }
            : prev
        );
      } else if (data.action === 'create' && data.venta) {
        addVenta(data.venta);
      } else if (data.action === 'delete' && data.ventaId) {
        removeVenta(data.ventaId);
        if (selectedVenta?.IDventas === data.ventaId) closeModal();
      } else if (data.action === 'bulkDelete' && data.ventaIds) {
        data.ventaIds.forEach((id) => removeVenta(id));
      } else {
        // Fallback para acciones desconocidas: re-fetch completo
        fetchVentas(true);
      }
    }
  );

  const handleSocketUpdateFallback = useCallback(() => {
    // Legacy fallback. Only keep for explicit manual refreshes if needed.
    // fetchVentas(true);
  }, [fetchVentas]);

  // Se remueven los fallbacks masivos a estos eventos porque provocaban un render loop y crasheaban la app.
  // El evento SocketEvent.REFRESH_VENTAS (que se maneja arriba) ya actualiza el estado de forma granular en Zustand.
  

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.searchText) count++;
    if (filters.estados.length > 0) count++;
    if (filters.mediosDePago.length > 0) count++;
    if (filters.fechaDesde) count++;
    if (filters.fechaHasta) count++;
    if (filters.vendedor) count++;
    if (filters.minTotal || filters.maxTotal) count++;
    if (filters.pedidoNumero) count++;
    if (filters.cliente) count++;
    return count;
  }, [filters]);

  const applyFilters = useCallback((ventas: VentaItem[]) => {
    let filtered = Array.isArray(ventas) ? [...ventas] : [];

    if (activeTab !== 'todos') {
      const tabUpper = activeTab.toUpperCase().replace(/_/g, ' ');
      filtered = filtered.filter(v => {
        const estadoUpper = (v.estado || '').toUpperCase().replace(/_/g, ' ');
        return estadoUpper === tabUpper;
      });
    }

    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      const parsedNum = parseFloat(filters.searchText.replace(/[^\d]/g, ''));
      const isNum = !isNaN(parsedNum) && parsedNum > 0 && filters.searchText.replace(/[^\d.]/g, '').length > 0;

      filtered = filtered.filter(v => {
        const textMatch = 
          (v.pedido?.toLowerCase().includes(searchLower)) ||
          (v.cliente?.toLowerCase().includes(searchLower)) ||
          (v.mesa?.toLowerCase().includes(searchLower)) ||
          (v.medioDePago?.toLowerCase().includes(searchLower)) ||
          (v.usuarioRelacion?.nombre?.toLowerCase().includes(searchLower)) ||
          (v.direccion?.toLowerCase().includes(searchLower)) ||
          (v.ordenVentas?.some(prod => prod.nombre?.toLowerCase().includes(searchLower) || prod.nombreProducto?.toLowerCase().includes(searchLower)));

        if (isNum) {
          const numMatch = 
            (v.totalInput === parsedNum) ||
            (v.numeroTelefono === parsedNum) ||
            (v.ordenVentas?.some(prod => prod.precioTotal === parsedNum || prod.precio === parsedNum));
          return textMatch || numMatch;
        }
        return textMatch;
      });
    }

    if (filters.pedidoNumero) {
      const pedidoLower = filters.pedidoNumero.toLowerCase();
      filtered = filtered.filter(v => v.pedido?.toLowerCase().includes(pedidoLower));
    }

    if (filters.cliente) {
      const clienteLower = filters.cliente.toLowerCase();
      filtered = filtered.filter(v => v.cliente?.toLowerCase().includes(clienteLower));
    }

    if (filters.estados.length > 0) {
      filtered = filtered.filter(v => filters.estados.includes(v.estado || ''));
    }

    if (filters.mediosDePago.length > 0) {
      filtered = filtered.filter(v => filters.mediosDePago.includes(v.medioDePago || ''));
    }

    if (filters.fechaDesde) {
      const desde = new Date(filters.fechaDesde);
      filtered = filtered.filter(v => {
        if (!v.fechaYHora) return false;
        return new Date(v.fechaYHora) >= desde;
      });
    }

    if (filters.fechaHasta) {
      const hasta = new Date(filters.fechaHasta);
      hasta.setHours(23, 59, 59, 999);
      filtered = filtered.filter(v => {
        if (!v.fechaYHora) return false;
        return new Date(v.fechaYHora) <= hasta;
      });
    }

    if (filters.vendedor) {
      const vendedorLower = filters.vendedor.toLowerCase();
      filtered = filtered.filter(v => v.usuarioRelacion?.nombre?.toLowerCase().includes(vendedorLower));
    }

    if (filters.minTotal) {
      const min = parseFloat(filters.minTotal);
      if (!isNaN(min)) {
        filtered = filtered.filter(v => (v.totalInput || 0) >= min);
      }
    }

    if (filters.maxTotal) {
      const max = parseFloat(filters.maxTotal);
      if (!isNaN(max)) {
        filtered = filtered.filter(v => (v.totalInput || 0) <= max);
      }
    }

    if (filters.categoriaProducto) {
      filtered = filtered.filter(v => 
        v.ordenVentas?.some(prod => prod.categoriaProducto === filters.categoriaProducto || prod.categoria === filters.categoriaProducto)
      );
    }

    // Sort intelligently based on searchText exact matches
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      const parsedNum = parseFloat(filters.searchText.replace(/[^\d]/g, ''));
      const isNum = !isNaN(parsedNum) && parsedNum > 0 && filters.searchText.replace(/[^\d.]/g, '').length > 0;

      filtered.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;

        // Num matches give highest priority
        if (isNum) {
          if (a.totalInput === parsedNum) scoreA += 100;
          if (b.totalInput === parsedNum) scoreB += 100;
          if (a.ordenVentas?.some(p => p.precioTotal === parsedNum || p.precio === parsedNum)) scoreA += 50;
          if (b.ordenVentas?.some(p => p.precioTotal === parsedNum || p.precio === parsedNum)) scoreB += 50;
        }

        // Product name exact matches
        if (a.ordenVentas?.some(p => p.nombre?.toLowerCase() === searchLower || p.nombreProducto?.toLowerCase() === searchLower)) scoreA += 80;
        if (b.ordenVentas?.some(p => p.nombre?.toLowerCase() === searchLower || p.nombreProducto?.toLowerCase() === searchLower)) scoreB += 80;
        
        // Product name includes
        if (a.ordenVentas?.some(p => p.nombre?.toLowerCase().includes(searchLower) || p.nombreProducto?.toLowerCase().includes(searchLower))) scoreA += 40;
        if (b.ordenVentas?.some(p => p.nombre?.toLowerCase().includes(searchLower) || p.nombreProducto?.toLowerCase().includes(searchLower))) scoreB += 40;

        return scoreB - scoreA; // Highest score first
      });
    }

    return filtered;
  }, [activeTab, filters]);

  const groupByDate = useCallback((ventas: VentaItem[]): SectionData[] => {
    const grupos: { [key: string]: VentaItem[] } = {};

    if (!Array.isArray(ventas)) return [];

    ventas.forEach(venta => {
      let fechaStr = 'Sin Fecha';
      
      // PRIORITIZE `fecha` (Accounting date) to respect business day cutoff
      if (venta.fecha) {
        const datePart = venta.fecha.substring(0, 10);
        const [year, month, day] = datePart.split('-');
        if (year && month && day) {
          const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          fechaStr = localDate.toLocaleDateString('es-CO', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }
      } else if (venta.fechaYHora) {
        const fecha = new Date(venta.fechaYHora);
        if (!isNaN(fecha.getTime())) {
          fechaStr = fecha.toLocaleDateString('es-CO', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }
      }

      if (!grupos[fechaStr]) {
        grupos[fechaStr] = [];
      }
      grupos[fechaStr].push(venta);
    });

    return Object.keys(grupos).map(key => {
      const firstItem = grupos[key][0];
      let sortDate = new Date(firstItem.fechaYHora || firstItem.fecha || Date.now());
      if (firstItem.fecha) {
         const datePart = firstItem.fecha.substring(0, 10);
         const [year, month, day] = datePart.split('-');
         if (year && month && day) {
            sortDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
         }
      }

      return {
        title: key,
        date: sortDate,
        data: grupos[key],
      };
    }).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, []);

  const filteredVentas = useMemo(() => {
    // Si cachedVentas no es array por algun motivo, no rompas
    const arraySeguro = Array.isArray(cachedVentas) ? cachedVentas : [];
    const filtered = applyFilters(arraySeguro);
    return filtered;
  }, [cachedVentas, applyFilters]);

  const groupedVentas = useMemo(() => {
    return groupByDate(filteredVentas);
  }, [filteredVentas, groupByDate]);

  const onRefresh = () => {
    setRefreshing(true);
    // force=true garantiza que setRefreshing(false) siempre se llame
    // incluso si la caché todavía es válida
    fetchVentas(true);
  };

  const handleDeleteSingle = (venta: VentaItem) => {
    if (venta.estado === 'PAGADO' || venta.estado === 'ENTREGADO') {
      showAlert({
        type: 'confirm',
        title: 'Dependencias Activas',
        message: 'Este pedido ya ha sido pagado o entregado. ¿Estás seguro de que deseas eliminarlo? Esto afectará los registros financieros.',
        confirmText: 'Eliminar',
        onConfirm: () => executeDelete(venta.IDventas),
        onCancel: () => {},
      });
    } else {
      showAlert({
        type: 'confirm',
        title: 'Eliminar Pedido',
        message: `¿Estás seguro de que deseas eliminar el pedido ${venta.pedido}?`,
        confirmText: 'Eliminar',
        onConfirm: () => executeDelete(venta.IDventas),
        onCancel: () => {},
      });
    }
  };

  const executeDelete = async (id: string) => {
    setLoading(true);
    try {
      await deleteSale(id);
      Toast.show({ type: 'success', text1: 'Eliminado', text2: 'El pedido fue eliminado exitosamente' });
      fetchVentas(true);
      if (selectedVenta?.IDventas === id) {
        closeModal();
      }
    } catch (error) {
      console.error('Error deleting sale:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo eliminar el pedido' });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedToDelete.length === 0) return;
    
    const hasActiveDeps = filteredVentas.some(v => 
      selectedToDelete.includes(v.IDventas) && (v.estado === 'PAGADO' || v.estado === 'ENTREGADO')
    );

    const message = hasActiveDeps 
      ? 'Algunos de los pedidos seleccionados ya han sido pagados o entregados. ¿Deseas continuar con la eliminación masiva?'
      : `¿Estás seguro de que deseas eliminar los ${selectedToDelete.length} pedidos seleccionados?`;

showAlert({
      type: 'confirm',
      title: 'Eliminación Masiva',
      message: message,
      confirmText: 'Eliminar',
      onConfirm: async () => {
        setLoading(true);
        try {
          await deleteSalesBulk(selectedToDelete);
          Toast.show({ type: 'success', text1: 'Eliminados', text2: `${selectedToDelete.length} pedidos fueron eliminados` });
          setSelectedToDelete([]);
          setIsSelectionMode(false);
          fetchVentas(true);
        } catch (error) {
          console.error('Error en eliminación masiva:', error);
          Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudieron eliminar los pedidos' });
        } finally {
          setLoading(false);
        }
      },
      onCancel: () => {},
    });
  };

  const toggleSelection = (id: string) => {
    setSelectedToDelete(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const clearAllFilters = () => {
    setFilters({
      searchText: '',
      estados: [],
      mediosDePago: [],
      fechaDesde: '',
      fechaHasta: '',
      vendedor: '',
      minTotal: '',
      maxTotal: '',
      pedidoNumero: '',
      cliente: '',
      categoriaProducto: '',
    });
    setIsFiltering(false);
    setFilterModalVisible(false);
  };

  const toggleEstado = (estado: string) => {
    setFilters(prev => ({
      ...prev,
      estados: prev.estados.includes(estado)
        ? prev.estados.filter(e => e !== estado)
        : [...prev.estados, estado]
    }));
  };

  const toggleMedioDePago = (medio: string) => {
    setFilters(prev => ({
      ...prev,
      mediosDePago: prev.mediosDePago.includes(medio)
        ? prev.mediosDePago.filter(m => m !== medio)
        : [...prev.mediosDePago, medio]
    }));
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'N/A';
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const hoursStr = String(hours).padStart(2, '0');
      return `${day}/${month}/${year} ${hoursStr}:${minutes} ${ampm}`;
    } catch {
      return 'N/A';
    }
  };

  const formatMoney = (amount?: number) => {
    if (amount == null) return '$0';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
  };

  const getStatusColor = (status?: string) => {
    const s = (status || '').toUpperCase().replace(/_/g, ' ');
    const tab = TABS.find(t => t.key.toUpperCase().replace(/_/g, ' ') === s);
    return tab?.color || '#6b7280';
  };

  const hasNotes = (item: VentaItem) => {
    if (!item.ordenVentas) return false;
    return item.ordenVentas.some(prod => {
      if (!prod.comentarios) return false;
      try {
        const parsed = JSON.parse(prod.comentarios);
        if (Array.isArray(parsed) && parsed.length > 0) return true;
      } catch (e) {}
      // Fallback for plain text comments
      return typeof prod.comentarios === 'string' && prod.comentarios.trim().length > 0;
    });
  };

  const renderSectionHeader = (section: { title: string; count: number; date: Date; total?: number }) => {
    // Check if all items in this section are selected
    const itemsInSection = groupedVentas.find(g => g.title === section.title)?.data || [];
    const allSelected = itemsInSection.length > 0 && itemsInSection.every(item => selectedToDelete.includes(item.IDventas));
    const someSelected = itemsInSection.some(item => selectedToDelete.includes(item.IDventas));

    const toggleSectionSelection = () => {
      if (allSelected) {
        // Deselect all
        const idsToRemove = itemsInSection.map(i => i.IDventas);
        setSelectedToDelete(prev => prev.filter(id => !idsToRemove.includes(id)));
      } else {
        // Select all
        const idsToAdd = itemsInSection.map(i => i.IDventas);
        setSelectedToDelete(prev => {
          const newSelection = [...prev];
          idsToAdd.forEach(id => {
            if (!newSelection.includes(id)) newSelection.push(id);
          });
          return newSelection;
        });
      }
    };

    return (
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          {isSelectionMode && (
            <TouchableOpacity 
              style={{ marginRight: 10 }}
              onPress={toggleSectionSelection}
            >
              <View style={[styles.checkbox, allSelected && styles.checkboxSelected, !allSelected && someSelected && { borderColor: '#4CAF50', backgroundColor: '#e8f5e9' }]}>
                {allSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                {!allSelected && someSelected && <Ionicons name="remove" size={14} color="#4CAF50" />}
              </View>
            </TouchableOpacity>
          )}
          <Ionicons name="calendar-outline" size={16} color="#6366f1" />
          <RNText style={styles.sectionHeaderText}>{section.title}</RNText>
        </View>
        <View style={styles.sectionHeaderRight}>
          <RNText style={styles.sectionHeaderCount}>{section.count} pedido{section.count !== 1 ? 's' : ''}</RNText>
          {section.total !== undefined && (
            <RNText style={[styles.sectionHeaderCount, { marginLeft: 8, color: '#059669', fontWeight: 'bold' }]}>
              {formatMoney(section.total)}
            </RNText>
          )}
        </View>
      </View>
    );
  };

  const renderVentaItem = ({ item }: { item: VentaItem }) => {
    const productos = item.ordenVentas || [];
    const totalItems = productos.reduce((sum, p) => sum + (p.cantidad || 0), 0);
    const isSelected = selectedToDelete.includes(item.IDventas);

    return (
      <View style={styles.cardContainer}>
        {isSelectionMode && (
          <TouchableOpacity 
            style={styles.checkboxContainer} 
            onPress={() => toggleSelection(item.IDventas)}
          >
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.card, isSelectionMode && { flex: 1, marginBottom: 0 }]}
          onPress={() => {
            if (isSelectionMode) {
              toggleSelection(item.IDventas);
            } else {
              setSelectedVenta(item);
              setModalVisible(true);
            }
          }}
          onLongPress={() => {
            if (isAdminApp && !isSelectionMode) {
              setIsSelectionMode(true);
              toggleSelection(item.IDventas);
            }
          }}
          activeOpacity={0.7}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="receipt-outline" size={18} color="#374151" />
              <RNText style={styles.cardTitle}>{item.pedido || 'Sin pedido'}</RNText>
              {hasNotes(item) && (
                <View style={{ marginLeft: 8, backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }}>
                  <RNText style={{ fontSize: 12 }}>🏷️</RNText>
                  <RNText style={{ fontSize: 10, color: '#d97706', fontWeight: 'bold', marginLeft: 4 }}>NOTAS</RNText>
                </View>
              )}
              {item.mensaje?.includes('Auto-Cuadre IA') && (
                <View style={{ marginLeft: 8, backgroundColor: '#ede9fe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }}>
                  <RNText style={{ fontSize: 12 }}>🤖</RNText>
                  <RNText style={{ fontSize: 10, color: '#6d28d9', fontWeight: 'bold', marginLeft: 4 }}>IA</RNText>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.estado) + '20' }]}>
                <RNText style={[styles.statusText, { color: getStatusColor(item.estado) }]}>
                  {item.estado?.replace(/_/g, ' ') || 'SIN ESTADO'}
                </RNText>
              </View>
              {isAdminApp && !isSelectionMode && (
                <TouchableOpacity 
                  style={{ marginLeft: 12 }} 
                  onPress={(e) => {
                    e.stopPropagation();
                    handleDeleteSingle(item);
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          </View>

        <View style={styles.cardInfo}>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={14} color="#6b7280" />
            <RNText style={styles.infoText}>{formatDateTime(item.fechaYHora)}</RNText>
          </View>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="counter" size={14} color="#6b7280" />
            <RNText style={styles.infoText}>{totalItems} item{totalItems !== 1 ? 's' : ''}</RNText>
          </View>
          {item.cliente && (
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={14} color="#6b7280" />
              <RNText style={styles.infoText}>{item.cliente}</RNText>
            </View>
          )}
          {item.medioDePago && item.medioDePago !== 'PENDIENTE' && (
            <View style={styles.infoRow}>
              <Ionicons name="wallet-outline" size={14} color="#6b7280" />
              <RNText style={styles.infoText}>{item.medioDePago}</RNText>
            </View>
          )}
        </View>

        {productos.length > 0 && (
          <View style={styles.productsPreview}>
            {productos.slice(0, 3).map((prod, idx) => {
              const nombre = prod.nombreProducto || prod.nombre || '';
              const label = `${prod.cantidad}x ${nombre}`;
              return (
                <View key={prod.IDorderventas || prod.producto?.IDproductos || idx} style={styles.productChip}>
                  <RNText style={styles.productChipText}>
                    {label}
                  </RNText>
                </View>
              );
            })}
            {productos.length > 3 && (
              <View style={styles.moreProductsChip}>
                <RNText style={styles.moreProductsText}>+{productos.length - 3}</RNText>
              </View>
            )}
          </View>
        )}

        <View style={styles.cardFooter}>
          <RNText style={styles.totalLabel}>TOTAL</RNText>
          <RNText style={styles.totalAmount}>{formatMoney(item.totalInput)}</RNText>
        </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderListItem = ({ item }: { item: any }) => {
    if (item.isHeader) {
      return renderSectionHeader({ title: item.title, count: item.count, date: item.date, total: item.total });
    }
    return renderVentaItem({ item: item as VentaItem });
  };

  const flatListData = useMemo(() => {
    const result: (VentaItem | { isHeader: boolean; title: string; date: Date; count: number; total?: number })[] = [];
    groupedVentas.forEach(section => {
      const totalAmount = section.data.reduce((sum, item) => sum + (Number(item.totalInput) || 0), 0);
      result.push({ isHeader: true, title: section.title, date: section.date, count: section.data.length, total: totalAmount });
      result.push(...section.data);
    });
    return result;
  }, [groupedVentas]);

  const keyExtractor = (item: VentaItem | { isHeader: boolean; title: string; date: Date; count: number; total?: number }, index: number) => {
    if ('isHeader' in item) {
      return `header-${item.title}`;
    }
    return (item as VentaItem).IDventas || `venta-${index}`;
  };

  const renderTimeline = () => {
    if (!selectedVenta?.registroDeTiempo || !Array.isArray(selectedVenta.registroDeTiempo) || selectedVenta.registroDeTiempo.length === 0) {
      return null;
    }

    const log = selectedVenta.registroDeTiempo;
    return (
      <View style={styles.modalSection}>
        <RNText style={styles.modalSectionTitle}>TRAZA DE TIEMPO</RNText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timelineScroll}>
          {log.map((entry: any, index: number) => {
            const isLast = index === log.length - 1;
            const dateObj = new Date(entry.fecha_hora);
            const timeStr = dateObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const dateStr = dateObj.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
            
            let duracionStr = '';
            if (entry.duracion) {
              const parts = entry.duracion.split(':');
              if (parts.length === 4) {
                const d = parseInt(parts[0], 10);
                const h = parseInt(parts[1], 10);
                const m = parseInt(parts[2], 10);
                const s = parseInt(parts[3], 10);
                if (d > 0) duracionStr += `${d}d `;
                if (h > 0) duracionStr += `${h}h `;
                if (m > 0) duracionStr += `${m}m `;
                if (s > 0 || duracionStr === '') duracionStr += `${s}s`;
              } else {
                duracionStr = entry.duracion;
              }
            }

            const color = getStatusColor(entry.estado);

            return (
              <View key={index} style={styles.timelineNodeRow}>
                <View style={styles.timelineNodeBox}>
                  <View style={styles.timelineTimeContainer}>
                    <RNText style={styles.timelineDateText}>{dateStr}</RNText>
                    <RNText style={styles.timelineTimeText}>{timeStr}</RNText>
                  </View>
                  <RNText style={styles.timelineDurText}>
                    {index > 0 && duracionStr ? `+${duracionStr.trim()}` : ''}
                  </RNText>
                  
                  <View style={[styles.timelineDotHoriz, { backgroundColor: color }]} />
                  
                  <View style={[styles.timelineBadgeHoriz, { backgroundColor: color + '15' }]}>
                    <RNText style={[styles.timelineBadgeText, { color }]}>
                      {entry.estado?.replace(/_/g, ' ')}
                    </RNText>
                  </View>
                </View>

                {!isLast && (
                  <View style={[styles.timelineLineHoriz, { backgroundColor: color + '50' }]} />
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const [realtimeDuration, setRealtimeDuration] = useState<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (selectedVenta && selectedVenta.estado !== 'PAGADO' && selectedVenta.estado !== 'ENTREGADO') {
      const updateTimer = () => {
        if (!selectedVenta.registroDeTiempo || selectedVenta.registroDeTiempo.length === 0) return;
        const firstEntry = selectedVenta.registroDeTiempo[0];
        const start = new Date(firstEntry.fecha_hora).getTime();
        const now = Date.now();
        const diff = Math.max(0, now - start);

        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / 1000 / 60) % 60);
        const s = Math.floor((diff / 1000) % 60);

        let durStr = '';
        if (d > 0) durStr += `${d}d `;
        if (h > 0) durStr += `${h}h `;
        if (m > 0) durStr += `${m}m `;
        durStr += `${s}s`;
        setRealtimeDuration(durStr);
      };
      
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    } else if (selectedVenta && (selectedVenta.estado === 'PAGADO' || selectedVenta.estado === 'ENTREGADO')) {
      // Calculate total fixed duration if available
      if (selectedVenta.registroDeTiempo && selectedVenta.registroDeTiempo.length > 0) {
        const firstEntry = selectedVenta.registroDeTiempo[0];
        const lastEntry = selectedVenta.registroDeTiempo[selectedVenta.registroDeTiempo.length - 1];
        const start = new Date(firstEntry.fecha_hora).getTime();
        const end = new Date(lastEntry.fecha_hora).getTime();
        const diff = Math.max(0, end - start);

        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / 1000 / 60) % 60);
        const s = Math.floor((diff / 1000) % 60);

        let durStr = '';
        if (d > 0) durStr += `${d}d `;
        if (h > 0) durStr += `${h}h `;
        if (m > 0) durStr += `${m}m `;
        durStr += `${s}s`;
        setRealtimeDuration(durStr);
      } else {
        setRealtimeDuration(null);
      }
    } else {
      setRealtimeDuration(null);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedVenta]);

  const renderModal = () => {
    if (!selectedVenta) return null;
    const productos = selectedVenta.ordenVentas || [];

    return (
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={closeModal}
        presentationStyle="pageSheet"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <RNText style={styles.modalTitle}>{selectedVenta.pedido}</RNText>
                {realtimeDuration && (
                  <View style={[styles.timerBadge, { backgroundColor: (selectedVenta.estado === 'PAGADO' || selectedVenta.estado === 'ENTREGADO') ? '#d1fae5' : '#fee2e2' }]}>
                    <Ionicons name="time-outline" size={14} color={(selectedVenta.estado === 'PAGADO' || selectedVenta.estado === 'ENTREGADO') ? '#10b981' : '#ef4444'} />
                    <RNText style={[styles.timerText, { color: (selectedVenta.estado === 'PAGADO' || selectedVenta.estado === 'ENTREGADO') ? '#10b981' : '#ef4444' }]}>
                      {realtimeDuration}
                    </RNText>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={closeModal} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.modalSection}>
                <RNText style={styles.modalSectionTitle}>INFORMACIÓN</RNText>
                <View style={styles.detailRow}>
                  <RNText style={styles.detailLabel}>Estado:</RNText>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedVenta.estado) + '20' }]}>
                    <RNText style={[styles.statusText, { color: getStatusColor(selectedVenta.estado) }]}>
                      {selectedVenta.estado?.replace(/_/g, ' ')}
                    </RNText>
                  </View>
                </View>
                <View style={styles.detailRow}>
                  <RNText style={styles.detailLabel}>Fecha:</RNText>
                  <RNText style={styles.detailValue}>{formatDateTime(selectedVenta.fechaYHora)}</RNText>
                </View>
                {selectedVenta.cliente && (
                  <View style={styles.detailRow}>
                    <RNText style={styles.detailLabel}>Cliente:</RNText>
                    <RNText style={styles.detailValue}>{selectedVenta.cliente}</RNText>
                  </View>
                )}
                {selectedVenta.mesa && (
                  <View style={styles.detailRow}>
                    <RNText style={styles.detailLabel}>Mesa:</RNText>
                    <RNText style={styles.detailValue}>{selectedVenta.mesa}</RNText>
                  </View>
                )}
                {selectedVenta.medioDePago && (
                  <View style={styles.detailRow}>
                    <RNText style={styles.detailLabel}>Medio de Pago:</RNText>
                    <RNText style={styles.detailValue}>{selectedVenta.medioDePago}</RNText>
                  </View>
                )}
                {selectedVenta.medioDePago === 'EFECTIVO Y OTROS' && (
                  <>
                    <View style={styles.detailRow}>
                      <RNText style={styles.detailLabel}>Efectivo:</RNText>
                      <RNText style={styles.detailValue}>{formatMoney(selectedVenta.efectivoRecibido)}</RNText>
                    </View>
                    <View style={styles.detailRow}>
                      <RNText style={styles.detailLabel}>Transferencia ({selectedVenta.banco || 'Banco'}):</RNText>
                      <RNText style={styles.detailValue}>
                        {formatMoney((selectedVenta.totalInput || 0) - (selectedVenta.efectivoRecibido || 0))}
                      </RNText>
                    </View>
                  </>
                )}
                {selectedVenta.medioDePago === 'EFECTIVO' && (
                  <>
                    <View style={styles.detailRow}>
                      <RNText style={styles.detailLabel}>Recibido:</RNText>
                      <RNText style={styles.detailValue}>{formatMoney(selectedVenta.efectivoRecibido)}</RNText>
                    </View>
                    <View style={styles.detailRow}>
                      <RNText style={styles.detailLabel}>Devueltas:</RNText>
                      <RNText style={styles.detailValue}>{formatMoney(selectedVenta.devueltas)}</RNText>
                    </View>
                  </>
                )}
                {selectedVenta.usuarioRelacion?.nombre && (
                  <View style={styles.detailRow}>
                    <RNText style={styles.detailLabel}>Vendedor:</RNText>
                    <RNText style={styles.detailValue}>{selectedVenta.usuarioRelacion.nombre}</RNText>
                  </View>
                )}
              </View>

              {renderTimeline()}

              <View style={styles.modalSection}>
                <RNText style={styles.modalSectionTitle}>PRODUCTOS ({productos.length})</RNText>
                {productos.map((prod, idx) => {
                  let notas: any[] = [];
                  if (prod.comentarios) {
                    try {
                      const parsed = JSON.parse(prod.comentarios);
                      if (Array.isArray(parsed)) {
                        notas = parsed;
                      } else {
                        notas = [{ name: String(prod.comentarios), price: 0 }];
                      }
                    } catch (e) {
                      if (typeof prod.comentarios === 'string' && prod.comentarios.trim().length > 0) {
                        notas = [{ name: prod.comentarios.trim(), price: 0 }];
                      }
                    }
                  }

                  return (
                    <View key={prod.IDorderventas || prod.producto?.IDproductos || idx} style={{ marginBottom: 12 }}>
                      <View style={styles.productItem}>
                        <View style={styles.productImageContainer}>
                          {prod.imagenUrl || prod.producto?.imagenUrl ? (
                            <Image source={{ uri: prod.imagenUrl || prod.producto?.imagenUrl }} style={styles.productImage} />
                          ) : (
                            <View style={[styles.productImage, styles.productImagePlaceholder]}>
                              <MaterialCommunityIcons name="image-off" size={20} color="#d1d5db" />
                            </View>
                          )}
                        </View>
                        <View style={styles.productDetails}>
                          <RNText style={styles.productName} numberOfLines={1}>{prod.nombreProducto || prod.nombre}</RNText>
                          <RNText style={styles.productMeta}>{prod.cantidad}x {formatMoney(prod.precio)}</RNText>
                          
                          {/* Notas/Modificadores con cantidades y precios */}
                          {notas.length > 0 && (
                            <View style={{ marginTop: 2, marginBottom: 2 }}>
                              {notas.map((nota, nIdx) => {
                                const notaName = nota.name || nota.nombre || nota.Nombre || '';
                                const notaPrice = Number(nota.price ?? nota.precio ?? nota.Precio ?? 0);
                                const notaQty = Number(nota.quantity ?? nota.cantidad ?? 1);
                                const displayQty = notaQty > 1 ? `${notaQty}x ` : '';
                                
                                let priceLabel = '';
                                if (notaPrice !== 0) {
                                  const sign = notaPrice < 0 ? '-' : '+';
                                  priceLabel = ` (${sign}${formatMoney(Math.abs(notaPrice * notaQty))})`;
                                }

                                return (
                                  <View key={nIdx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' }}>
                                    <View style={{ 
                                      backgroundColor: notaPrice < 0 ? '#fce4ec' : '#fef3c7', 
                                      paddingHorizontal: 6, 
                                      paddingVertical: 2, 
                                      borderRadius: 6, 
                                      flexDirection: 'row', 
                                      alignItems: 'center',
                                      flexShrink: 1
                                    }}>
                                      <RNText style={{ fontSize: 10, color: notaPrice < 0 ? '#c62828' : '#b45309', fontWeight: '700', flexShrink: 1 }}>
                                        {displayQty}{notaName}{priceLabel}
                                      </RNText>
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                        <RNText style={styles.productTotal}>{formatMoney(prod.precioTotal)}</RNText>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={styles.modalSection}>
                <View style={styles.totalSection}>
                  <RNText style={styles.totalSectionLabel}>TOTAL</RNText>
                  <RNText style={styles.totalSectionAmount}>
                    {formatMoney(
                      // FIX: si totalInput es 0 o nulo, calcularlo desde los productos
                      (selectedVenta.totalInput && selectedVenta.totalInput > 0)
                        ? selectedVenta.totalInput
                        : productos.reduce((sum, p) => sum + (Number(p.precioTotal) || 0), 0)
                    )}
                  </RNText>
                </View>
              </View>

              {selectedVenta.mensaje && (
                <View style={styles.modalSection}>
                  <RNText style={styles.modalSectionTitle}>MENSAJE</RNText>
                  <View style={styles.messageBox}>
                    <Ionicons name="chatbox-ellipses-outline" size={18} color="#6b7280" />
                    <RNText style={styles.messageText}>{selectedVenta.mensaje}</RNText>
                  </View>
                </View>
              )}

              <View style={styles.modalActionsSection}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <RNText style={[styles.modalSectionTitle, { marginBottom: 0 }]}>ACCIONES</RNText>
                  {(isAdminApp || user?.permisos?.ventas?.delete) && (
                    <TouchableOpacity
                      onPress={() => handleDeleteSingle(selectedVenta)}
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}
                    >
                      <Ionicons name="trash-outline" size={14} color="#ef4444" />
                      <RNText style={{ fontSize: 12, color: '#ef4444', fontWeight: '600', marginLeft: 4 }}>Eliminar Pedido</RNText>
                    </TouchableOpacity>
                  )}
                </View>
                {(isAdminApp || user?.permisos?.ventas?.edit) ? (
                  <View style={styles.actionsGrid}>
                    {selectedVenta.estado === 'EN_EL_CARRITO' && (
                      <>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#3b82f6' }]}
                          onPress={() => handleChangeEstado('TOMADO')}
                        >
                          <Ionicons name="hand-left-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Marcar Tomado</RNText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
                          onPress={handleOpenCobrar}
                        >
                          <Ionicons name="cash-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Cobrar</RNText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                          onPress={() => handleChangeEstado('DEUDOR')}
                        >
                          <Ionicons name="alert-circle-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Marcar Deudor</RNText>
                        </TouchableOpacity>
                      </>
                    )}
                    {selectedVenta.estado === 'TOMADO' && (
                      <>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#8b5cf6' }]}
                          onPress={() => handleChangeEstado('LISTO_PARA_ENTREGA')}
                        >
                          <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Marcar Listo</RNText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#6b7280' }]}
                          onPress={handleVolverCarrito}
                        >
                          <Ionicons name="cart-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Volver a Carrito</RNText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
                          onPress={handleOpenCobrar}
                        >
                          <Ionicons name="cash-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Cobrar</RNText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                          onPress={() => handleChangeEstado('DEUDOR')}
                        >
                          <Ionicons name="alert-circle-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Marcar Deudor</RNText>
                        </TouchableOpacity>
                      </>
                    )}
                    {selectedVenta.estado === 'LISTO_PARA_ENTREGA' && (
                      <>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#10b981' }]}
                          onPress={() => handleChangeEstado('ENTREGADO')}
                        >
                          <Ionicons name="paper-plane-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Marcar Entregado</RNText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#f59e0b' }]}
                          onPress={() => handleChangeEstado('TOMADO')}
                        >
                          <Ionicons name="hand-left-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Volver a Tomado</RNText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
                          onPress={handleOpenCobrar}
                        >
                          <Ionicons name="cash-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Cobrar</RNText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                          onPress={() => handleChangeEstado('DEUDOR')}
                        >
                          <Ionicons name="alert-circle-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Marcar Deudor</RNText>
                        </TouchableOpacity>
                      </>
                    )}
                    {selectedVenta.estado === 'PAGADO' && (
                      <>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#10b981' }]}
                          onPress={() => handleChangeEstado('ENTREGADO')}
                        >
                          <Ionicons name="paper-plane-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Marcar Entregado</RNText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                          onPress={() => handleChangeEstado('DEUDOR')}
                        >
                          <Ionicons name="alert-circle-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Marcar Deudor</RNText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#6b7280' }]}
                          onPress={handleVolverCarrito}
                        >
                          <Ionicons name="cart-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Volver a Carrito</RNText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
                          onPress={handleOpenCobrar}
                        >
                          <Ionicons name="cash-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Cobrar / Pago</RNText>
                        </TouchableOpacity>
                      </>
                    )}
                    {selectedVenta.estado === 'ENTREGADO' && (
                      <>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                          onPress={() => handleChangeEstado('DEUDOR')}
                        >
                          <Ionicons name="alert-circle-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Marcar Deudor</RNText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#6b7280' }]}
                          onPress={handleVolverCarrito}
                        >
                          <Ionicons name="cart-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Volver a Carrito</RNText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
                          onPress={handleOpenCobrar}
                        >
                          <Ionicons name="cash-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Cobrar / Pago</RNText>
                        </TouchableOpacity>
                      </>
                    )}
                    {selectedVenta.estado === 'DEUDOR' && (
                      <>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
                          onPress={handleOpenCobrar}
                        >
                          <Ionicons name="cash-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Cobrar</RNText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#6b7280' }]}
                          onPress={handleVolverCarrito}
                        >
                          <Ionicons name="cart-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Volver a Carrito</RNText>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ) : (
                  <View style={{ padding: 12, backgroundColor: '#f3f4f6', borderRadius: 8 }}>
                    <RNText style={{ color: '#6b7280', textAlign: 'center', fontSize: 13 }}>
                      No tienes permisos para modificar el estado de este pedido.
                    </RNText>
                  </View>
                )}
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderFilterModal = () => (
    <Modal
      visible={filterModalVisible}
      animationType="slide"
      onRequestClose={() => setFilterModalVisible(false)}
      presentationStyle="pageSheet"
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.filterModalContainer}>
        <View style={styles.filterModalHeader}>
          <RNText style={styles.filterModalTitle}>Filtros</RNText>
          <TouchableOpacity onPress={() => setFilterModalVisible(false)} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#374151" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.filterModalScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>BÚSQUEDA</RNText>
            <View style={styles.filterInputContainer}>
              <Ionicons name="search" size={18} color="#6b7280" />
              <TextInput
                style={styles.filterInput}
                placeholder="Buscar por pedido, cliente, mesa..."
                placeholderTextColor="#9ca3af"
                value={filters.searchText}
                onChangeText={(text) => setFilters(prev => ({ ...prev, searchText: text }))}
              />
            </View>
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>NÚMERO DE PEDIDO</RNText>
            <View style={styles.filterInputContainer}>
              <Ionicons name="receipt-outline" size={18} color="#6b7280" />
              <TextInput
                style={styles.filterInput}
                placeholder="Ej: Mesa 1-P-001"
                placeholderTextColor="#9ca3af"
                value={filters.pedidoNumero}
                onChangeText={(text) => setFilters(prev => ({ ...prev, pedidoNumero: text }))}
              />
            </View>
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>CLIENTE</RNText>
            <View style={styles.filterInputContainer}>
              <Ionicons name="person-outline" size={18} color="#6b7280" />
              <TextInput
                style={styles.filterInput}
                placeholder="Nombre del cliente"
                placeholderTextColor="#9ca3af"
                value={filters.cliente}
                onChangeText={(text) => setFilters(prev => ({ ...prev, cliente: text }))}
              />
            </View>
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>ESTADO</RNText>
            <View style={styles.chipsContainer}>
              {ESTADOS_POSIBLES.map(estado => (
                <TouchableOpacity
                  key={estado}
                  style={[styles.chip, filters.estados.includes(estado) && styles.chipActive]}
                  onPress={() => toggleEstado(estado)}
                >
                  <RNText style={[styles.chipText, filters.estados.includes(estado) && styles.chipTextActive]}>
                    {estado.replace(/_/g, ' ')}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>MÉTODO DE PAGO</RNText>
            <View style={styles.chipsContainer}>
              {METODOS_PAGO.map(medio => (
                <TouchableOpacity
                  key={medio}
                  style={[styles.chip, filters.mediosDePago.includes(medio) && styles.chipActive]}
                  onPress={() => toggleMedioDePago(medio)}
                >
                  <RNText style={[styles.chipText, filters.mediosDePago.includes(medio) && styles.chipTextActive]}>
                    {medio}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>
          </View>



          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>CATEGORÍA DE PRODUCTO</RNText>
            <View style={styles.chipsContainer}>
              <TouchableOpacity
                style={[styles.chip, !filters.categoriaProducto && styles.chipActive]}
                onPress={() => setFilters(prev => ({ ...prev, categoriaProducto: '' }))}
              >
                <RNText style={[styles.chipText, !filters.categoriaProducto && styles.chipTextActive]}>
                  Todas
                </RNText>
              </TouchableOpacity>
              {productCategorias?.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, filters.categoriaProducto === cat && styles.chipActive]}
                  onPress={() => setFilters(prev => ({ ...prev, categoriaProducto: prev.categoriaProducto === cat ? '' : cat }))}
                >
                  <RNText style={[styles.chipText, filters.categoriaProducto === cat && styles.chipTextActive]}>
                    {cat}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>RANGO DE FECHAS</RNText>
            <View style={styles.dateRangeContainer}>
              <View style={styles.dateInputWrapper}>
                <RNText style={styles.dateLabel}>Desde</RNText>
                <TouchableOpacity 
                  style={[styles.filterInputContainer, { paddingVertical: 10 }]}
                  onPress={() => setShowDatePicker({ show: true, type: 'desde' })}
                >
                  <Ionicons name="calendar-outline" size={18} color="#6b7280" />
                  <RNText style={{ marginLeft: 8, fontSize: 13, color: filters.fechaDesde ? '#1f2937' : '#9ca3af' }}>
                    {filters.fechaDesde || 'YYYY-MM-DD'}
                  </RNText>
                </TouchableOpacity>
              </View>
              <View style={styles.dateInputWrapper}>
                <RNText style={styles.dateLabel}>Hasta</RNText>
                <TouchableOpacity 
                  style={[styles.filterInputContainer, { paddingVertical: 10 }]}
                  onPress={() => setShowDatePicker({ show: true, type: 'hasta' })}
                >
                  <Ionicons name="calendar-outline" size={18} color="#6b7280" />
                  <RNText style={{ marginLeft: 8, fontSize: 13, color: filters.fechaHasta ? '#1f2937' : '#9ca3af' }}>
                    {filters.fechaHasta || 'YYYY-MM-DD'}
                  </RNText>
                </TouchableOpacity>
              </View>
            </View>
            
            {showDatePicker.show && (
              <DateTimePicker
                value={
                  showDatePicker.type === 'desde' && filters.fechaDesde 
                    ? new Date(filters.fechaDesde + 'T12:00:00') 
                    : showDatePicker.type === 'hasta' && filters.fechaHasta 
                      ? new Date(filters.fechaHasta + 'T12:00:00') 
                      : new Date()
                }
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowDatePicker({ show: false, type: 'desde' });
                  if (event.type === 'set' && selectedDate) {
                    const dateString = selectedDate.toISOString().split('T')[0];
                    if (showDatePicker.type === 'desde') {
                      setFilters(prev => ({ ...prev, fechaDesde: dateString }));
                    } else {
                      setFilters(prev => ({ ...prev, fechaHasta: dateString }));
                    }
                  }
                }}
              />
            )}
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>VENDEDOR</RNText>
            <View style={styles.filterInputContainer}>
              <Ionicons name="person-outline" size={18} color="#6b7280" />
              <TextInput
                style={styles.filterInput}
                placeholder="Nombre del vendedor"
                placeholderTextColor="#9ca3af"
                value={filters.vendedor}
                onChangeText={(text) => setFilters(prev => ({ ...prev, vendedor: text }))}
              />
            </View>
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>RANGO DE TOTALES</RNText>
            <View style={styles.dateRangeContainer}>
              <View style={styles.dateInputWrapper}>
                <RNText style={styles.dateLabel}>Mínimo</RNText>
                <View style={styles.filterInputContainer}>
                  <Ionicons name="cash-outline" size={18} color="#6b7280" />
                  <TextInput
                    style={styles.filterInput}
                    placeholder="$0"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={filters.minTotal}
                    onChangeText={(text) => setFilters(prev => ({ ...prev, minTotal: text }))}
                  />
                </View>
              </View>
              <View style={styles.dateInputWrapper}>
                <RNText style={styles.dateLabel}>Máximo</RNText>
                <View style={styles.filterInputContainer}>
                  <Ionicons name="cash-outline" size={18} color="#6b7280" />
                  <TextInput
                    style={styles.filterInput}
                    placeholder="$999999"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={filters.maxTotal}
                    onChangeText={(text) => setFilters(prev => ({ ...prev, maxTotal: text }))}
                  />
                </View>
              </View>
            </View>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>

        <View style={styles.filterModalFooter}>
          <TouchableOpacity style={styles.clearFiltersBtn} onPress={clearAllFilters}>
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
            <RNText style={styles.clearFiltersBtnText}>Limpiar Todo</RNText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.applyFiltersBtn}
            onPress={() => {
              setIsFiltering(activeFiltersCount > 0);
              setFilterModalVisible(false);
            }}
          >
            <RNText style={styles.applyFiltersBtnText}>
              Aplicar ({filteredVentas.length} resultados)
            </RNText>
          </TouchableOpacity>
        </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const closeModal = () => {
    setModalVisible(false);
    setSelectedVenta(null);
  };

  const handleChangeEstado = async (newEstado: string) => {
    if (!selectedVenta) return;
    try {
      // Optimizacion: Actualizar UI y emitir en background
      setTimeout(() => {
        updateVentaEstado(selectedVenta.IDventas, newEstado).catch(e => console.error(e));
        const updatedVenta = { ...selectedVenta, estado: newEstado };
        updateVenta(selectedVenta.IDventas, { estado: newEstado });
        emitOrdenActualizada({
          ventaId: selectedVenta.IDventas,
          IDventas: selectedVenta.IDventas,
          venta: updatedVenta,
          estado: newEstado,
        });
      }, 0);
      
      closeModal();
      Toast.show({ type: 'success', text1: 'Estado Actualizado', text2: `El pedido pasó a ${newEstado.replace(/_/g, ' ')}`, position: 'top' });
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cambiar el estado del pedido', position: 'top' });
    }
  };

  const handleVolverCarrito = () => {
    if (!selectedVenta) return;
    showAlert({
      type: 'confirm',
      title: 'Editar Pedido',
      message: 'El pedido pasará a EN EL CARRITO y podrás agregar o quitar productos. ¿Deseas continuar?',
      confirmText: 'Sí, Editar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        await handleChangeEstado('EN_EL_CARRITO');
        if (selectedVenta.ordenVentas && selectedVenta.ordenVentas.length > 0) {
          useCartStore.getState().loadCartFromVenta(selectedVenta.ordenVentas);
        } else {
          useCartStore.getState().clearCart();
        }
        useCartStore.getState().setEditingSale(selectedVenta.IDventas, selectedVenta);
        closeModal();
        navigation.navigate('Sales', { screen: 'NewSale' } as any);
      },
      onCancel: () => {},
    });
  };

  const handleOpenCobrar = () => {
    if (!selectedVenta) return;
    
    // Cargar los productos de esta orden al store temporalmente para que el PaymentModal los muestre bien
    if (selectedVenta.ordenVentas && selectedVenta.ordenVentas.length > 0) {
      useCartStore.getState().loadCartFromVenta(selectedVenta.ordenVentas);
    } else {
      useCartStore.getState().clearCart();
    }
    
    closeModal();
    setCobrarVenta(selectedVenta);
    setPaymentModalVisible(true);
  };

  const handleCobrarConfirm = async (paymentData: {
    medioDePago: string;
    banco?: string;
    efectivoRecibido?: number;
    devueltas?: number;
    transferencia?: number;
    estado: string;
  }) => {
    if (!cobrarVenta) return;
    try {
      // Calcular el total real de la venta desde los productos si totalInput es 0 o null
      const totalReal = (cobrarVenta.totalInput && cobrarVenta.totalInput > 0)
        ? cobrarVenta.totalInput
        : (cobrarVenta.ordenVentas || []).reduce((sum: number, p: any) => sum + (Number(p.precioTotal) || 0), 0);

      // FIX: Esperamos a que termine la petición en vez de enviarla en background sin control
      // Eliminamos updateVentaEstado para evitar la condición de carrera con updateVentaPago
      await updateVentaPago(cobrarVenta.IDventas, {
        estado: 'PAGADO',
        medioDePago: paymentData.medioDePago,
        efectivoRecibido: paymentData.efectivoRecibido,
        devueltas: paymentData.devueltas,
        banco: paymentData.banco,
        transferencia: paymentData.transferencia,
        totalInput: totalReal,
      });

      // Actualizamos UI localmente de forma opcional (el socket confirmará después)
      const updatedVenta = {
        ...cobrarVenta,
        estado: 'PAGADO',
        medioDePago: paymentData.medioDePago,
        efectivoRecibido: paymentData.efectivoRecibido,
        devueltas: paymentData.devueltas,
        banco: paymentData.banco,
        transferencia: paymentData.transferencia,
        totalInput: totalReal,
      };

      emitOrdenActualizada({
        ventaId: cobrarVenta.IDventas,
        IDventas: cobrarVenta.IDventas,
        venta: updatedVenta,
        estado: 'PAGADO',
      });

      closeModal();
      setPaymentModalVisible(false);
      setCobrarVenta(null);
      useCartStore.getState().clearCart();
      Toast.show({ type: 'success', text1: 'Cobro Exitoso', text2: 'Pedido cobrado correctamente', position: 'top' });
      return { pedidoId: cobrarVenta.pedido || cobrarVenta.IDventas };
    } catch (error) {
      console.error('Error al cobrar:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cobrar el pedido', position: 'top' });
    }
  };

  const handleSaveCobrar = async (data: { estado: string }) => {
    if (!cobrarVenta) return;
    try {
      updateVentaEstado(cobrarVenta.IDventas, data.estado);
      closeModal();
      setPaymentModalVisible(false);
      setCobrarVenta(null);
      useCartStore.getState().clearCart();
      Toast.show({ type: 'success', text1: 'Actualizado', text2: 'El pedido fue actualizado', position: 'top' });
      return { pedidoId: cobrarVenta.pedido || cobrarVenta.IDventas };
    } catch (error) {
      console.error('Error al guardar:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo actualizar el pedido', position: 'top' });
    }
  };

  const getCobrarTotal = (venta: VentaItem | null): number => {
    if (!venta) return 0;
    if (typeof venta.totalInput === 'number') return venta.totalInput;
    if (typeof venta.totalInput === 'string') return parseFloat(venta.totalInput) || 0;
    return 0;
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="transparent" translucent />
      <SafeAreaView style={{ backgroundColor: '#fff' }} edges={['top']}>
        <View style={styles.header}>
          <View>
            <RNText style={styles.headerTitle}>Pedidos</RNText>
            <RNText style={styles.headerSubtitle}>{filteredVentas.length} registro{filteredVentas.length !== 1 ? 's' : ''}</RNText>
          </View>
          {canCreateVenta && (
            <TouchableOpacity
              style={styles.newSaleBtn}
              onPress={() => {
                useCartStore.getState().clearCart();
                navigation.navigate('Sales', { screen: 'NewSale' } as any);
              }}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <RNText style={styles.newSaleBtnText}>Nueva Venta</RNText>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
          {tabsWithCounts.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab, 
                activeTab === tab.key && { backgroundColor: tab.color },
                { flexDirection: 'row', alignItems: 'center' }
              ]}
              onPress={() => setActiveTab(tab.key)}
            >
              <RNText style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </RNText>
              
              {/* Badge Counter */}
              {tab.count > 0 && (
                <View 
                  style={{
                    backgroundColor: activeTab === tab.key ? 'rgba(255,255,255,0.3)' : `${tab.color}20`,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 10,
                    marginLeft: 6
                  }}
                >
                  <RNText
                    style={{
                      color: activeTab === tab.key ? '#fff' : tab.color,
                      fontWeight: 'bold',
                      fontSize: 10
                    }}
                  >
                    {tab.count}
                  </RNText>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.filterBar}>
        <View style={styles.searchBarContainer}>
          <Ionicons name="search" size={18} color="#6b7280" />
          <TextInput
            style={styles.searchBarInput}
            placeholder="Buscar pedido, cliente..."
            placeholderTextColor="#9ca3af"
            value={filters.searchText}
            onChangeText={(text) => setFilters(prev => ({ ...prev, searchText: text }))}
          />
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, activeFiltersCount > 0 && styles.filterBtnActive]}
          onPress={() => setFilterModalVisible(true)}
        >
          <Ionicons name="options-outline" size={20} color={activeFiltersCount > 0 ? '#fff' : '#6b7280'} />
          {activeFiltersCount > 0 && (
            <View style={styles.filterBadge}>
              <RNText style={styles.filterBadgeText}>{activeFiltersCount}</RNText>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {isSelectionMode && (
        <View style={styles.bulkActionContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => { setIsSelectionMode(false); setSelectedToDelete([]); }}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
            <RNText style={{ fontSize: 13, fontWeight: '700', marginLeft: 8, color: '#374151' }}>
              {selectedToDelete.length} sel.
            </RNText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity 
              style={{ marginRight: 12 }}
              onPress={() => {
                if (selectedToDelete.length === filteredVentas.length) {
                  setSelectedToDelete([]);
                } else {
                  setSelectedToDelete(filteredVentas.map(v => v.IDventas));
                }
              }}
            >
              <RNText style={{ color: '#6366f1', fontWeight: '700', fontSize: 13 }}>
                {selectedToDelete.length === filteredVentas.length ? 'Ninguno' : 'Todos'}
              </RNText>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.bulkDeleteBtn, selectedToDelete.length === 0 && { opacity: 0.5 }]}
              onPress={handleBulkDelete}
              disabled={selectedToDelete.length === 0}
            >
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <RNText style={{ color: '#fff', fontWeight: '700', marginLeft: 4, fontSize: 13 }}>Eliminar</RNText>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isFiltering && activeFiltersCount > 0 && (
        <View style={styles.activeFiltersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersContent}>
            {filters.searchText && (
              <View style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>"{filters.searchText}"</RNText>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, searchText: '' }))}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
            {filters.pedidoNumero && (
              <View style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>Pedido: {filters.pedidoNumero}</RNText>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, pedidoNumero: '' }))}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
            {filters.cliente && (
              <View style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>Cliente: {filters.cliente}</RNText>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, cliente: '' }))}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
            {filters.estados.map(estado => (
              <View key={estado} style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>{estado.replace(/_/g, ' ')}</RNText>
                <TouchableOpacity onPress={() => toggleEstado(estado)}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            ))}
            {filters.mediosDePago.map(medio => (
              <View key={medio} style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>{medio}</RNText>
                <TouchableOpacity onPress={() => toggleMedioDePago(medio)}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            ))}
            {filters.fechaDesde && (
              <View style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>Desde: {filters.fechaDesde}</RNText>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, fechaDesde: '' }))}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
            {filters.fechaHasta && (
              <View style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>Hasta: {filters.fechaHasta}</RNText>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, fechaHasta: '' }))}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
            {filters.vendedor && (
              <View style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>Vendedor: {filters.vendedor}</RNText>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, vendedor: '' }))}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
            {(filters.minTotal || filters.maxTotal) && (
              <View style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>
                  Total: {filters.minTotal || '0'} - {filters.maxTotal || '∞'}
                </RNText>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, minTotal: '', maxTotal: '' }))}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={styles.clearAllBtn} onPress={clearAllFilters}>
              <RNText style={styles.clearAllBtnText}>Limpiar Todo</RNText>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      ) : (
        <FlashList
          data={flatListData}
          renderItem={renderListItem}
          keyExtractor={keyExtractor}
          getItemType={(item) => 'isHeader' in item ? 'header' : 'item'}
          contentContainerStyle={styles.listContent}
          estimatedItemSize={200}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="clipboard-text-off-outline" size={64} color="#d1d5db" />
              <RNText style={styles.emptyText}>No hay pedidos</RNText>
              {isFiltering && (
                <TouchableOpacity style={styles.emptyBtn} onPress={clearAllFilters}>
                  <Ionicons name="close-circle" size={20} color="#fff" />
                  <RNText style={styles.emptyBtnText}>Limpiar filtros</RNText>
                </TouchableOpacity>
              )}
              {!isFiltering && canCreateVenta && (
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => navigation.navigate('Sales', { screen: 'NewSale' } as any)}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <RNText style={styles.emptyBtnText}>Crear nueva venta</RNText>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {renderModal()}
      {renderFilterModal()}

      <PaymentModal
        visible={paymentModalVisible}
        onClose={() => {
          setPaymentModalVisible(false);
          setCobrarVenta(null);
        }}
        onSave={handleSaveCobrar}
        onCobrar={handleCobrarConfirm}
        total={getCobrarTotal(cobrarVenta)}
        editingPedidoId={cobrarVenta?.pedido || cobrarVenta?.IDventas}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  headerSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  newSaleBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  newSaleBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, marginLeft: 6 },
  tabsContainer: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tabsContent: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row' },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#f3f4f6', marginRight: 8 },
  tabText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#fff' },
  filterBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchBarContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 12, marginRight: 12 },
  searchBarInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 14, color: '#111827' },
  filterBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  filterBtnActive: { backgroundColor: '#6366f1' },
  filterBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#ef4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  filterBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  activeFiltersContainer: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  activeFiltersContent: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  activeFilterChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366f120', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, marginRight: 8 },
  activeFilterChipText: { fontSize: 12, color: '#6366f1', marginRight: 4 },
  clearAllBtn: { paddingVertical: 6, paddingHorizontal: 12, marginLeft: 4 },
  clearAllBtnText: { fontSize: 12, color: '#ef4444', fontWeight: '600' },
  bulkActionContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#bbf7d0' },
  bulkDeleteBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ef4444', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  cardContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  checkboxContainer: { padding: 12, justifyContent: 'center', alignItems: 'center' },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', justifyContent: 'center', alignItems: 'center' },
  checkboxSelected: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb', paddingVertical: 10, paddingHorizontal: 16, marginBottom: 8, marginTop: 4, borderRadius: 8 },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  sectionHeaderText: { fontSize: 14, fontWeight: '700', color: '#374151', marginLeft: 8, textTransform: 'capitalize' },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center' },
  sectionHeaderCount: { fontSize: 12, color: '#6b7280' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, flex: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginLeft: 8 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardInfo: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  infoText: { fontSize: 13, color: '#6b7280', marginLeft: 4 },
  productsPreview: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  productChip: { backgroundColor: '#f3f4f6', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, marginRight: 6, marginBottom: 6 },
  productChipText: { fontSize: 12, color: '#374151' },
  moreProductsChip: { backgroundColor: '#e5e7eb', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, marginBottom: 6 },
  moreProductsText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  totalLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  totalAmount: { fontSize: 18, fontWeight: '800', color: '#111827' },
  timelineScroll: { paddingVertical: 10, paddingRight: 20 },
  timelineNodeRow: { flexDirection: 'row', alignItems: 'center' },
  timelineNodeBox: { alignItems: 'center', width: 80 },
  timelineTimeContainer: { alignItems: 'center', marginBottom: 4 },
  timelineDateText: { fontSize: 10, fontWeight: '600', color: '#6b7280' },
  timelineTimeText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  timelineDurText: { fontSize: 10, fontWeight: '800', color: '#f59e0b', marginBottom: 8, height: 14 },
  timelineDotHoriz: { width: 12, height: 12, borderRadius: 6, marginBottom: 8, borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1, elevation: 2 },
  timelineBadgeHoriz: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12 },
  timelineBadgeText: { fontSize: 9, fontWeight: '800', textAlign: 'center' },
  timelineLineHoriz: { width: 40, height: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginTop: -15 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyText: { fontSize: 16, color: '#9ca3af', marginTop: 16, marginBottom: 24 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginRight: 10 },
  timerBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  timerText: { fontSize: 12, fontWeight: '800', marginLeft: 4 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  modalScroll: { paddingHorizontal: 20 },
  modalSection: { marginTop: 24 },
  modalSectionTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5, marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  detailLabel: { fontSize: 14, color: '#6b7280' },
  detailValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  productItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  productImageContainer: { marginRight: 12 },
  productImage: { width: 48, height: 48, borderRadius: 10 },
  productImagePlaceholder: { backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  productDetails: { flex: 1 },
  productName: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 2 },
  productMeta: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  productTotal: { fontSize: 14, fontWeight: '700', color: '#111827' },
  totalSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb', padding: 16, borderRadius: 12 },
  totalSectionLabel: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  totalSectionAmount: { fontSize: 20, fontWeight: '800', color: '#111827' },
  messageBox: { flexDirection: 'row', backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, alignItems: 'flex-start' },
  messageText: { fontSize: 14, color: '#374151', flex: 1 },
  modalActionsSection: { marginTop: 24, marginBottom: 16 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, width: '48%', marginBottom: 10 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 8 },
  filterModalContainer: { flex: 1, backgroundColor: '#fff' },
  filterModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  filterModalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  filterModalScroll: { flex: 1, paddingHorizontal: 20 },
  filterSection: { marginTop: 24 },
  filterSectionTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5, marginBottom: 12 },
  filterInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 12 },
  filterInput: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontSize: 14, color: '#111827' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#f3f4f6', marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: '#6366f1' },
  chipText: { fontSize: 13, color: '#6b7280' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  dateRangeContainer: { flexDirection: 'row' },
  dateInputWrapper: { flex: 1, marginRight: 12 },
  dateLabel: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  filterModalFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  clearFiltersBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  clearFiltersBtnText: { color: '#ef4444', fontWeight: '600', fontSize: 14, marginLeft: 6 },
  applyFiltersBtn: { backgroundColor: '#4CAF50', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  applyFiltersBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

export default PedidosScreen;