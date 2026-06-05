import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, TouchableOpacity, ActivityIndicator, Modal, ScrollView, Image, TextInput, Platform, KeyboardAvoidingView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList as OriginalFlashList } from '@shopify/flash-list';
const FlashList = OriginalFlashList as any;
import { useFocusEffect } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import * as FileSystem from 'expo-file-system/legacy';

// Optional import for Sharing to avoid crashes on custom dev clients without the native module built in
let Sharing: any = null;
try {
  Sharing = require('expo-sharing');
} catch (e) {
  console.warn('expo-sharing no está disponible de forma nativa en este cliente');
}

// Optional import for Print to avoid crashes on custom dev clients without the native module built in
let Print: any = null;
try {
  Print = require('expo-print');
} catch (e) {
  console.warn('expo-print no está disponible de forma nativa en este cliente');
}

import { Text } from '../../components/ui/text';
import { getSales, getSalesHoy, deleteSale, restoreSale, hardDeleteSale, emptyTrashSales, deleteSalesBulk, hardDeleteSalesBulk } from '../../services/sales';
import { formatCurrency, formatTime12h, formatDateToDDMMAAAA } from '../../utils/formatters';
import { useSocket, useSocketEvent } from '../../hooks';
import { Room, SocketEvent } from '../../types/socket.types';

const TABS = [
  { id: 'activas', label: 'ACTIVAS' },
  { id: 'eliminadas', label: 'ELIMINADAS' }
];

import { useScrollDirection } from '../../hooks/useScrollDirection';
import { usePermissions } from '../../hooks/usePermissions';
import AdminSaleFormModal from './AdminSaleFormModal';
import { useProductStore } from '../../store/useProductStore';

export default function HistorialVentasScreen({ navigation }: any) {
  const { canCreate, canEdit, canDelete } = usePermissions('historial_ventas');
  // Tabs cache state for instantaneous switching
  const [cache, setCache] = useState<Record<string, { data: any[]; page: number; hasNextPage: boolean; total: number; initialized: boolean }>>({
    activas: { data: [], page: 1, hasNextPage: true, total: 0, initialized: false },
    eliminadas: { data: [], page: 1, hasNextPage: true, total: 0, initialized: false }
  });

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('activas');
  
  // Advanced Filters State
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{
    estado?: string;
    medioDePago?: string;
    fechaDesde?: string;
    fechaHasta?: string;
    totalMin?: string;
    totalMax?: string;
    categoriaProducto?: string;
  }>({});
  const [tempFilters, setTempFilters] = useState(activeFilters);
  const isFilterActive = Object.values(activeFilters).some(v => v !== undefined && v !== '');

  // Current tab derived state
  const currentCache = cache[activeTab];
  const ventas = currentCache.data;
  const page = currentCache.page;
  const hasNextPage = currentCache.hasNextPage;
  const totalRecords = currentCache.total;

  const handleScroll = useScrollDirection();
  
  // Modal state
  const [selectedVenta, setSelectedVenta] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Admin Form Modal State
  const [adminFormVisible, setAdminFormVisible] = useState(false);
  const [isEditingAdmin, setIsEditingAdmin] = useState(false);

  const hasNotes = (item: any) => {
    if (!item.ordenVentas) return false;
    return item.ordenVentas.some((prod: any) => {
      if (!prod.comentarios) return false;
      try {
        const parsed = JSON.parse(prod.comentarios);
        if (Array.isArray(parsed) && parsed.length > 0) return true;
      } catch (e) {}
      return typeof prod.comentarios === 'string' && prod.comentarios.trim().length > 0;
    });
  };

  // Bulk Selection State
  const [selectedToDelete, setSelectedToDelete] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Custom Actions Modal State
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionType, setActionType] = useState<'delete' | 'restore' | 'hard-delete' | 'empty-trash' | 'bulk-delete' | 'bulk-hard-delete' | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Search & Filters
  const [searchText, setSearchText] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stats Dashboard
  const [statsHoy, setStatsHoy] = useState<{ total: number; count: number; efectivo: number; transferencias: number }>({ total: 0, count: 0, efectivo: 0, transferencias: 0 });
  const [statsProducts, setStatsProducts] = useState<Record<string, Record<string, { cantidad: number, total: number }>>>({});
  const [productsModalVisible, setProductsModalVisible] = useState(false);

  const productCategorias = useProductStore((state) => state.categorias);

  // Sockets
  const { joinRoom, isConnected } = useSocket();
  const hasJoinedRoom = useRef(false);

  useEffect(() => {
    if (isConnected && !hasJoinedRoom.current) {
      hasJoinedRoom.current = true;
      joinRoom(Room.KITCHEN);
      joinRoom(Room.CAJA); // Ensure we receive caja/payment updates too
    }
  }, [isConnected, joinRoom]);

  const handleSocketUpdate = useCallback((data?: any) => {
    if (data?.action === 'updateEstado' && data?.venta) {
      // Optimizacion: parcheamos la venta en el estado local en vez de hacer refetch
      setVentas((prev: any[]) => prev.map(v => v.IDventas === data.venta.IDventas ? data.venta : v));
    } else if (data?.action === 'delete' && data?.ventaId) {
      setVentas((prev: any[]) => prev.filter(v => v.IDventas !== data.ventaId));
    } else if (data?.action === 'bulkDelete' && data?.ventaIds) {
      setVentas((prev: any[]) => prev.filter(v => !data.ventaIds.includes(v.IDventas)));
    } else if (data?.action === 'create') {
      // Background silent fetch solo para creaciones si estamos en la tab de activas
      if (activeTab === 'activas') {
        fetchVentas(1, 'activas', false, searchText, true, activeFilters);
        fetchStatsHoy();
      }
    }
  }, [activeTab, searchText, activeFilters]);

  // Se remueven los eventos de cocina/caja genéricos ya que REFRESH_VENTAS centraliza los cambios
  useSocketEvent<{ action: string; venta?: any; ventaId?: string; ventaIds?: string[] }>(SocketEvent.REFRESH_VENTAS, handleSocketUpdate, [handleSocketUpdate]);

  // Fallback background sync for stats every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'activas') fetchStatsHoy();
    }, 60000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const fetchStatsHoy = async () => {
    try {
      const data = await getSalesHoy();
      const ventasHoy = Array.isArray(data) ? data : (data?.data || []);
      let total = 0;
      let efectivo = 0;
      let transferencias = 0;
      
      const productsSummary: Record<string, Record<string, { cantidad: number, total: number }>> = {};

      ventasHoy.forEach((v: any) => {
        const vTotal = Number(v.totalInput) || 0;
        total += vTotal;
        if (v.medioDePago === 'EFECTIVO') {
          efectivo += vTotal;
        } else if (v.medioDePago === 'EFECTIVO Y OTROS') {
          const vEfectivo = Number(v.efectivoRecibido) || 0;
          efectivo += vEfectivo;
          transferencias += (vTotal - vEfectivo);
        } else if (v.medioDePago !== 'PENDIENTE') {
          transferencias += vTotal;
        }

        if (v.ordenVentas && Array.isArray(v.ordenVentas)) {
          v.ordenVentas.forEach((prod: any) => {
            let cat = prod.producto?.categoriaNombre || prod.producto?.categoria || prod.categoriaProducto || prod.categoria || 'LO MAS VENDIDO';
            if (cat === 'Sin Categoría') cat = 'LO MAS VENDIDO';
            const name = prod.producto?.nombre || prod.nombreProducto || prod.nombre || 'Producto Desconocido';
            const qty = Number(prod.cantidad) || 0;
            const pTotal = Number(prod.precioTotal) || 0;

            if (!productsSummary[cat]) productsSummary[cat] = {};
            if (!productsSummary[cat][name]) productsSummary[cat][name] = { cantidad: 0, total: 0 };

            productsSummary[cat][name].cantidad += qty;
            productsSummary[cat][name].total += pTotal;
          });
        }
      });
      
      setStatsHoy({
        total,
        count: ventasHoy.length,
        efectivo,
        transferencias
      });
      setStatsProducts(productsSummary);
    } catch (error) {
      console.error('Error fetching stats hoy:', error);
    }
  };

  const fetchVentas = async (pageNumber = 1, tab = activeTab, isLoadMore = false, search = searchText, silentRefresh = false, currentFilters = activeFilters) => {
    const isFirstLoad = !cache[tab].initialized && !isLoadMore && !silentRefresh;
    if (isFirstLoad) setLoading(true);
    else if (isLoadMore) setLoadingMore(true);

    try {
      const response = await getSales({
        page: pageNumber,
        limit: 20,
        includeDeleted: tab === 'eliminadas',
        search: search || undefined,
        ...currentFilters
      });

      let newData = response.data || [];
      const meta = response.meta || {};

      // Sort intelligently based on search matches
      if (search) {
        const searchLower = search.toLowerCase();
        const parsedNum = parseFloat(search.replace(/[^\d]/g, ''));
        const isNum = !isNaN(parsedNum) && parsedNum > 0 && search.replace(/[^\d.]/g, '').length > 0;

        newData.sort((a: any, b: any) => {
          let scoreA = 0;
          let scoreB = 0;

          if (isNum) {
            if (a.totalInput === parsedNum) scoreA += 100;
            if (b.totalInput === parsedNum) scoreB += 100;
            if (a.ordenVentas?.some((p: any) => p.precioTotal === parsedNum || p.precio === parsedNum)) scoreA += 50;
            if (b.ordenVentas?.some((p: any) => p.precioTotal === parsedNum || p.precio === parsedNum)) scoreB += 50;
          }

          if (a.ordenVentas?.some((p: any) => p.nombre?.toLowerCase() === searchLower || p.nombreProducto?.toLowerCase() === searchLower)) scoreA += 80;
          if (b.ordenVentas?.some((p: any) => p.nombre?.toLowerCase() === searchLower || p.nombreProducto?.toLowerCase() === searchLower)) scoreB += 80;

          if (a.ordenVentas?.some((p: any) => p.nombre?.toLowerCase().includes(searchLower) || p.nombreProducto?.toLowerCase().includes(searchLower))) scoreA += 40;
          if (b.ordenVentas?.some((p: any) => p.nombre?.toLowerCase().includes(searchLower) || p.nombreProducto?.toLowerCase().includes(searchLower))) scoreB += 40;

          // Check comments/comentarios
          if (a.ordenVentas?.some((p: any) => p.comentarios?.toLowerCase().includes(searchLower))) scoreA += 45;
          if (b.ordenVentas?.some((p: any) => p.comentarios?.toLowerCase().includes(searchLower))) scoreB += 45;

          // Check main sale message/notes
          if (a.mensaje?.toLowerCase().includes(searchLower)) scoreA += 35;
          if (b.mensaje?.toLowerCase().includes(searchLower)) scoreB += 35;

          return scoreB - scoreA;
        });
      }

      setCache(prev => ({
        ...prev,
        [tab]: {
          data: isLoadMore ? [...prev[tab].data, ...newData] : newData,
          page: pageNumber,
          hasNextPage: meta.hasNextPage ?? false,
          total: meta.total ?? 0,
          initialized: true
        }
      }));

    } catch (error: any) {
      if (error?.message === 'Network Error') {
        console.log('[Historial] Fetch ignorado: Sin red o app en segundo plano');
      } else {
        console.error('Error fetching sales history:', error?.message || error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'No se pudo cargar el historial de ventas'
        });
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchVentas(1, activeTab, false, searchText, true),
        activeTab === 'activas' ? fetchStatsHoy() : Promise.resolve()
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSearchChange = (text: string) => {
    setSearchText(text);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      fetchVentas(1, activeTab, false, text);
    }, 500);
  };

  const handleApplyFilters = () => {
    setActiveFilters(tempFilters);
    setFilterModalVisible(false);
    fetchVentas(1, activeTab, false, searchText, false, tempFilters);
  };

  const handleClearFilters = () => {
    const emptyFilters = {};
    setTempFilters(emptyFilters);
    setActiveFilters(emptyFilters);
    setFilterModalVisible(false);
    fetchVentas(1, activeTab, false, searchText, false, emptyFilters);
  };

  const toggleSelection = (id: string) => {
    setSelectedToDelete(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const groupByDate = useCallback((data: any[]) => {
    const grupos: { [key: string]: any[] } = {};

    data.forEach(venta => {
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

  const flatListData = React.useMemo(() => {
    const grouped = groupByDate(ventas);
    const result: any[] = [];
    grouped.forEach(section => {
      result.push({ isHeader: true, title: section.title, date: section.date, count: section.data.length, data: section.data });
      result.push(...section.data);
    });
    return result;
  }, [ventas, groupByDate]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    // When switching tabs, clear search text to avoid confusion
    setSearchText('');
  };

  useEffect(() => {
    // When tab changes, fetch its data silently if initialized, or with loader if first time
    fetchVentas(1, activeTab, false, '', cache[activeTab].initialized);
    if (activeTab === 'activas') {
      fetchStatsHoy();
    }
  }, [activeTab]);

  useFocusEffect(
    useCallback(() => {
      // When returning to this screen, silently refresh current tab
      fetchVentas(1, activeTab, false, searchText, true);
      if (activeTab === 'activas') {
        fetchStatsHoy();
      }
    }, [])
  );

  const handleLoadMore = () => {
    if (hasNextPage && !loadingMore && !loading) {
      fetchVentas(page + 1, activeTab, true, searchText);
    }
  };

  const handleExportCSV = async () => {
    try {
      // For export, we fetch all currently filtered items (we could fetch up to 1000 to avoid memory issues)
      const response = await getSales({
        page: 1,
        limit: 1000,
        includeDeleted: activeTab === 'eliminadas',
        search: searchText || undefined
      });
      
      const allData = response.data || [];
      if (allData.length === 0) {
        Toast.show({ type: 'info', text1: 'Sin datos', text2: 'No hay ventas para exportar' });
        return;
      }

      // Prepare CSV Headers
      let csvString = 'ID Venta,Pedido,Cliente,Estado,Fecha,Hora,Medio de Pago,Banco,Vendedor,Motivo Borrado,Total\n';
      
      allData.forEach((venta: any) => {
        const id = venta.IDventas;
        const pedido = venta.pedido || '';
        const cliente = venta.cliente || '';
        const estado = venta.estado || '';
        const fecha = venta.fecha ? formatDateToDDMMAAAA(venta.fecha.substring(0,10)) : '';
        const hora = venta.hora ? formatTime12h(venta.hora) : '';
        const medioDePago = venta.medioDePago || '';
        const banco = venta.banco || '';
        const vendedor = venta.usuarioRelacion?.nombre || '';
        const deleteReason = venta.deleteReason || '';
        const total = venta.totalInput || 0;

        // Escape fields to prevent CSV breaking
        const row = [
          `"${id}"`, `"${pedido}"`, `"${cliente}"`, `"${estado}"`, `"${fecha}"`, `"${hora}"`,
          `"${medioDePago}"`, `"${banco}"`, `"${vendedor}"`, `"${deleteReason}"`, total
        ].join(',');

        csvString += row + '\n';
      });

      const fileUri = `${FileSystem.documentDirectory}Historial_Ventas_${activeTab}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvString, { encoding: FileSystem.EncodingType.UTF8 });

      if (Sharing && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { UTI: 'text/csv', mimeType: 'text/csv', dialogTitle: 'Exportar Historial de Ventas' });
      } else {
        Toast.show({ type: 'info', text1: 'Exportado', text2: `Guardado en: ${fileUri}` });
      }
    } catch (error) {
      console.error('Error exporting CSV:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo exportar el archivo' });
    }
  };

  const handleExportPDF = async () => {
    try {
      const response = await getSales({
        page: 1,
        limit: 1000,
        includeDeleted: activeTab === 'eliminadas',
        search: searchText || undefined
      });
      
      const allData = response.data || [];
      if (allData.length === 0) {
        Toast.show({ type: 'info', text1: 'Sin datos', text2: 'No hay ventas para exportar' });
        return;
      }

      let totalSum = 0;
      const rowsHtml = allData.map((venta: any) => {
        totalSum += venta.totalInput || 0;
        return `
          <tr>
            <td>${venta.pedido || 'SIN TICKET'}</td>
            <td>${venta.fecha ? formatDateToDDMMAAAA(venta.fecha.substring(0,10)) : ''}</td>
            <td>${venta.cliente || 'Consumidor Final'}</td>
            <td>${venta.medioDePago || ''}</td>
            <td>${venta.estado || ''}</td>
            <td style="text-align: right; font-weight: bold;">${formatCurrency(venta.totalInput || 0)}</td>
          </tr>
        `;
      }).join('');

      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 20px; }
              h1 { color: #166534; text-align: center; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; font-size: 12px; }
              th { background-color: #f3f4f6; color: #374151; }
              .total { font-size: 18px; font-weight: bold; text-align: right; margin-top: 20px; color: #166534; }
            </style>
          </head>
          <body>
            <h1>Reporte de Ventas (${activeTab.toUpperCase()})</h1>
            <p><strong>Fecha de Generación:</strong> ${new Date().toLocaleString()}</p>
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Método Pago</th>
                  <th>Estado</th>
                  <th style="text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
            <div class="total">
              TOTAL GENERAL: ${formatCurrency(totalSum)}
            </div>
          </body>
        </html>
      `;

      if (Print) {
        const { uri } = await Print.printToFileAsync({ html });
        if (Sharing && await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: 'Exportar Reporte PDF' });
        } else {
          Toast.show({ type: 'info', text1: 'Exportado', text2: `PDF Generado en: ${uri}` });
        }
      } else {
        Toast.show({ type: 'info', text1: 'Requiere Actualización', text2: 'Recompila la app para habilitar la exportación a PDF' });
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo generar el PDF' });
    }
  };

  const handleDeleteSale = () => {
    if (!selectedVenta) return;
    setDeleteReason('');
    setActionType('delete');
    setActionModalVisible(true);
  };

  const handleRestoreSale = () => {
    if (!selectedVenta) return;
    setActionType('restore');
    setActionModalVisible(true);
  };

  const handleHardDeleteSale = () => {
    if (!selectedVenta) return;
    setActionType('hard-delete');
    setActionModalVisible(true);
  };

  const handleEmptyTrash = () => {
    if (ventas.length === 0) return;
    setActionType('empty-trash');
    setActionModalVisible(true);
  };

  const handleBulkDelete = () => {
    if (selectedToDelete.length === 0) return;
    setDeleteReason('');
    setActionType('bulk-delete');
    setActionModalVisible(true);
  };

  const handleBulkHardDelete = () => {
    if (selectedToDelete.length === 0) return;
    setActionType('bulk-hard-delete');
    setActionModalVisible(true);
  };

  const processAction = async (specificAction?: string) => {
    const currentAction = specificAction || actionType;
    if (currentAction !== 'empty-trash' && currentAction !== 'bulk-delete' && currentAction !== 'bulk-hard-delete' && !selectedVenta) return;

    if (currentAction === 'delete' || currentAction === 'bulk-delete') {
      if (!deleteReason || deleteReason.trim() === '') {
        Toast.show({ type: 'error', text1: 'Error', text2: 'El motivo es obligatorio para enviar a papelera' });
        return;
      }
      setIsProcessingAction(true);
      try {
        if (currentAction === 'bulk-delete') {
          await deleteSalesBulk(selectedToDelete, deleteReason);
          Toast.show({ type: 'success', text1: 'Eliminadas', text2: `${selectedToDelete.length} ventas han sido eliminadas` });
          setSelectedToDelete([]);
          setIsSelectionMode(false);
        } else {
          await deleteSale(selectedVenta.IDventas, deleteReason);
          Toast.show({ type: 'success', text1: 'Eliminada', text2: 'La venta ha sido enviada a papelera' });
          setModalVisible(false);
        }
        setActionModalVisible(false);
        fetchVentas(1, activeTab, false, searchText); // refresh
        if (activeTab === 'activas') fetchStatsHoy();
      } catch (error) {
        console.error('Error deleting sale(s):', error);
        Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo eliminar' });
      } finally {
        setIsProcessingAction(false);
      }
    } else if (currentAction === 'restore') {
      setIsProcessingAction(true);
      try {
        await restoreSale(selectedVenta.IDventas);
        Toast.show({ type: 'success', text1: 'Restaurada', text2: 'La venta ha vuelto a estar activa' });
        setActionModalVisible(false);
        setModalVisible(false);
        fetchVentas(1, activeTab, false, searchText); // refresh current tab
        if (activeTab === 'activas') fetchStatsHoy();
      } catch (error) {
        console.error('Error restoring sale:', error);
        Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo restaurar la venta' });
      } finally {
        setIsProcessingAction(false);
      }
    } else if (currentAction === 'hard-delete' || currentAction === 'bulk-hard-delete') {
      setIsProcessingAction(true);
      try {
        if (currentAction === 'bulk-hard-delete') {
          await hardDeleteSalesBulk(selectedToDelete);
          Toast.show({ type: 'success', text1: 'Eliminadas Definitivamente', text2: `${selectedToDelete.length} ventas eliminadas` });
          setSelectedToDelete([]);
          setIsSelectionMode(false);
        } else {
          await hardDeleteSale(selectedVenta.IDventas);
          Toast.show({ type: 'success', text1: 'Eliminada Definitivamente', text2: 'La venta ya no existe en la base de datos' });
          setModalVisible(false);
        }
        setActionModalVisible(false);
        fetchVentas(1, activeTab, false, searchText, true); // silent refresh current tab
        if (activeTab === 'activas') fetchStatsHoy();
      } catch (error) {
        console.error('Error hard deleting sale(s):', error);
        Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo eliminar definitivamente' });
      } finally {
        setIsProcessingAction(false);
      }
    } else if (currentAction === 'empty-trash') {
      setIsProcessingAction(true);
      try {
        await emptyTrashSales();
        Toast.show({ type: 'success', text1: 'Papelera Vaciada', text2: 'Todas las ventas eliminadas han sido borradas definitivamente' });
        setActionModalVisible(false);
        fetchVentas(1, activeTab, false, searchText); // refresh current tab
        if (activeTab === 'activas') fetchStatsHoy();
      } catch (error) {
        console.error('Error emptying trash:', error);
        Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo vaciar la papelera' });
      } finally {
        setIsProcessingAction(false);
      }
    }
  };

  const renderTimeline = () => {
    if (!selectedVenta?.registroDeTiempo || !Array.isArray(selectedVenta.registroDeTiempo) || selectedVenta.registroDeTiempo.length === 0) {
      return null;
    }

    const log = selectedVenta.registroDeTiempo;
    return (
      <View className="bg-white p-4 rounded-xl border border-gray-200 mb-4 shadow-sm">
        <Text className="text-gray-800 font-bold text-base mb-2">Traza de Tiempo</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 10 }}>
          {log.map((entry: any, index: number) => {
            const isLast = index === log.length - 1;
            const dateObj = new Date(entry.fecha_hora);
            const timeStr = dateObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
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

            const getTimelineColor = (status: string) => {
              const s = (status || '').toUpperCase();
              if (s === 'PAGADO' || s === 'ENTREGADO') return '#10b981';
              if (s === 'EN_EL_CARRITO' || s === 'INICIADO') return '#f59e0b';
              if (s === 'TOMADO') return '#3b82f6';
              if (s === 'LISTO_PARA_ENTREGA') return '#8b5cf6';
              if (s === 'DEUDOR') return '#ef4444';
              return '#6b7280';
            };

            const color = getTimelineColor(entry.estado);

            return (
              <View key={index} className="flex-row items-start">
                <View className="w-[85px] items-center">
                  <Text className="text-[11px] font-bold text-gray-700">{timeStr}</Text>
                  <Text className="text-[10px] font-semibold text-gray-500 min-h-[14px] mt-0.5">
                    {index > 0 && duracionStr ? `+${duracionStr.trim()}` : ''}
                  </Text>
                  <View className="w-3 h-3 rounded-full my-2 z-10" style={{ backgroundColor: color }} />
                  <View className="px-2 py-1 rounded-lg" style={{ backgroundColor: color + '15' }}>
                    <Text className="text-[9px] font-black text-center uppercase" style={{ color: color }}>
                      {entry.estado?.replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>
                {!isLast && (
                  <View className="w-[30px] h-[2px] -mx-[15px] mt-[39px] z-0" style={{ backgroundColor: color + '50' }} />
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    if (item.isHeader) {
      const itemsInSection = item.data || [];
      const allSelected = itemsInSection.length > 0 && itemsInSection.every((i: any) => selectedToDelete.includes(i.IDventas));
      const someSelected = itemsInSection.some((i: any) => selectedToDelete.includes(i.IDventas));

      const toggleSectionSelection = () => {
        if (allSelected) {
          const idsToRemove = itemsInSection.map((i: any) => i.IDventas);
          setSelectedToDelete(prev => prev.filter(id => !idsToRemove.includes(id)));
        } else {
          const idsToAdd = itemsInSection.map((i: any) => i.IDventas);
          setSelectedToDelete(prev => {
            const newSelection = [...prev];
            idsToAdd.forEach((id: string) => {
              if (!newSelection.includes(id)) newSelection.push(id);
            });
            return newSelection;
          });
        }
      };

      return (
        <View className="flex-row items-center justify-between bg-white px-3 py-3 border-b border-gray-100 shadow-sm rounded-xl mb-3 mt-1 mx-4">
          <View className="flex-row items-center flex-1 mr-2">
            {isSelectionMode && (
              <TouchableOpacity onPress={toggleSectionSelection} className="mr-3">
                <View className={`w-5 h-5 rounded-md border items-center justify-center ${allSelected ? 'bg-green-600 border-green-600' : someSelected ? 'bg-green-100 border-green-600' : 'border-gray-400 bg-white'}`}>
                  {allSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                  {!allSelected && someSelected && <Ionicons name="remove" size={14} color="#16a34a" />}
                </View>
              </TouchableOpacity>
            )}
            <Ionicons name="calendar-outline" size={18} color="#6366f1" />
            <Text className="font-bold text-gray-800 ml-2" numberOfLines={1}>{item.title}</Text>
          </View>
          <View className="bg-gray-100 px-2 py-1 rounded-lg">
            <Text className="text-gray-500 text-xs font-medium">
              {item.count} ped.
            </Text>
          </View>
        </View>
      );
    }

    const isDeleted = activeTab === 'eliminadas';
    const bgColor = isDeleted ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200';
    const isSelected = selectedToDelete.includes(item.IDventas);

    // Clean Pedido Name
    let cleanOrderId = item.pedido;
    if (cleanOrderId && cleanOrderId.toLowerCase().startsWith('pedido-')) {
      cleanOrderId = cleanOrderId.substring(7);
    }

    const itemCount = item.ordenVentas?.reduce((sum: number, p: any) => sum + (p.cantidad || 1), 0) || 0;

    return (
      <View className="px-4">
        <TouchableOpacity 
          onPress={() => {
            if (isSelectionMode) {
              toggleSelection(item.IDventas);
            } else {
              setSelectedVenta(item);
              setModalVisible(true);
            }
          }}
          onLongPress={() => {
            if (!isSelectionMode) {
              setIsSelectionMode(true);
              toggleSelection(item.IDventas);
            }
          }}
          className={`p-4 rounded-xl border ${bgColor} mb-3 shadow-sm flex-row`}
          activeOpacity={0.7}
        >
          {isSelectionMode && (
            <View className="mr-3 justify-center">
              <View className={`w-5 h-5 rounded-md border items-center justify-center ${isSelected ? 'bg-green-600 border-green-600' : 'border-gray-400 bg-white'}`}>
                {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
            </View>
          )}
          <View className="flex-1">
            <View className="flex-row justify-between items-start mb-2">
              <View className="flex-row items-center flex-1 mr-2">
                <Ionicons name="receipt-outline" size={18} color="#4b5563" />
                <Text className="font-bold text-gray-800 ml-2 text-base" numberOfLines={1}>
                  {cleanOrderId || 'SIN TICKET'}
                </Text>
                {hasNotes(item) && (
                  <View style={{ marginLeft: 8, backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12 }}>🏷️</Text>
                    <Text style={{ fontSize: 10, color: '#d97706', fontWeight: 'bold', marginLeft: 4 }}>NOTAS</Text>
                  </View>
                )}
                {item.mensaje?.includes('Auto-Cuadre IA') && (
                  <View style={{ marginLeft: 8, backgroundColor: '#ede9fe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12 }}>🤖</Text>
                    <Text style={{ fontSize: 10, color: '#6d28d9', fontWeight: 'bold', marginLeft: 4 }}>IA</Text>
                  </View>
                )}
              </View>
              <View className={`px-2 py-1 rounded-full flex-shrink-0 ${isDeleted ? 'bg-red-100' : 'bg-green-100'}`}>
                <Text className={`text-[10px] font-bold ${isDeleted ? 'text-red-700' : 'text-green-700'}`}>
                  {isDeleted ? 'ELIMINADA' : item.estado || 'PAGADO'}
                </Text>
              </View>
            </View>

            <View className="flex-row items-center mb-1">
              <Ionicons name="time-outline" size={14} color="#6b7280" />
              <Text className="text-gray-500 text-xs ml-1 mr-3">
                {formatDateToDDMMAAAA(item.fecha ? item.fecha.substring(0,10) : '')} {item.fechaYHora ? new Date(item.fechaYHora).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : formatTime12h(item.hora)}
              </Text>
              
              <Ionicons name="cube-outline" size={14} color="#6b7280" />
              <Text className="text-gray-500 text-xs ml-1">
                {itemCount} items
              </Text>
            </View>

            <View className="flex-row items-center mb-3">
              <Ionicons name="wallet-outline" size={14} color="#6b7280" />
              <Text className="text-gray-500 text-xs ml-1">
                {item.medioDePago || 'NO DEFINIDO'}
              </Text>
              {item.banco && (
                <Text className="text-gray-500 text-xs font-bold ml-1">({item.banco})</Text>
              )}
            </View>

            {isDeleted && item.deleteReason && (
              <View className="bg-red-100/50 p-2 rounded-lg mb-3">
                <Text className="text-red-800 text-xs italic">
                  Motivo: {item.deleteReason}
                </Text>
              </View>
            )}

            {item.ordenVentas && item.ordenVentas.length > 0 && (
              <View className="flex-row flex-wrap mt-2 mb-1">
                {item.ordenVentas.slice(0, 3).map((prod: any, idx: number) => (
                  <View key={prod.IDorderventas || prod.producto?.IDproductos || idx} className="bg-gray-100 px-2 py-1 rounded-md border border-gray-200 mr-1 mb-1">
                    <Text className="text-gray-700 text-xs" numberOfLines={1}>
                      {prod.cantidad}x {prod.nombreProducto || prod.nombre}
                    </Text>
                  </View>
                ))}
                {item.ordenVentas.length > 3 && (
                  <View className="bg-gray-200 px-2 py-1 rounded-md border border-gray-300 justify-center mb-1">
                    <Text className="text-gray-600 text-[10px] font-bold">+{item.ordenVentas.length - 3}</Text>
                  </View>
                )}
              </View>
            )}

            <View className="flex-row justify-between items-end mt-1 pt-3 border-t border-gray-100">
              <Text className="text-gray-400 text-[10px] font-bold uppercase">TOTAL</Text>
              <Text className="text-gray-900 text-lg font-black">{formatCurrency(item.totalInput || 0)}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <SafeAreaView style={{ backgroundColor: '#4CAF50' }} edges={['top']}>
        <View className="bg-primary flex-row items-center px-4 py-3 shadow-md" style={{ backgroundColor: '#4CAF50' }}>
          <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 mr-2">
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text className="text-white text-xl font-bold">Historial de Ventas</Text>
            <Text className="text-white/80 text-xs font-medium">{totalRecords} registros</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* TABS */}
      <View className="flex-row px-4 pt-3 pb-2 bg-white border-b border-gray-200">
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            onPress={() => handleTabChange(tab.id)}
            className={`flex-1 py-2 items-center border-b-2 ${activeTab === tab.id ? 'border-green-600' : 'border-transparent'}`}
          >
            <Text className={`text-xs font-bold ${activeTab === tab.id ? 'text-green-700' : 'text-gray-400'}`}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* SEARCH BAR & EXPORT */}
      <View className="flex-row items-center px-4 py-3 bg-white shadow-sm z-10 mb-2">
        <View className="flex-1 flex-row items-center bg-gray-100 rounded-lg px-3 py-2 border border-gray-200 mr-2">
          <Ionicons name="search" size={18} color="#6b7280" />
          <TextInput
            placeholder="Buscar por ticket o cliente..."
            value={searchText}
            onChangeText={handleSearchChange}
            className="flex-1 ml-2 text-gray-800 text-sm"
            placeholderTextColor="#9ca3af"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => handleSearchChange('')}>
              <Ionicons name="close-circle" size={18} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity 
          className={`p-2 rounded-lg border ml-2 ${isFilterActive ? 'bg-indigo-100 border-indigo-300' : 'bg-gray-100 border-gray-200'}`}
          onPress={() => {
            setTempFilters(activeFilters);
            setFilterModalVisible(true);
          }}
        >
          <Ionicons name="options" size={22} color={isFilterActive ? "#4f46e5" : "#6b7280"} />
          {isFilterActive && (
            <View className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-600 rounded-full border-2 border-white" />
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          className="bg-green-100 p-2 rounded-lg border border-green-200 ml-2"
          onPress={handleExportCSV}
        >
          <MaterialCommunityIcons name="microsoft-excel" size={22} color="#15803d" />
        </TouchableOpacity>

        <TouchableOpacity 
          className="bg-red-100 p-2 rounded-lg border border-red-200 ml-2 mr-2"
          onPress={handleExportPDF}
        >
          <MaterialCommunityIcons name="file-pdf-box" size={22} color="#b91c1c" />
        </TouchableOpacity>

        {canCreate && (
          <TouchableOpacity 
            className="bg-indigo-100 p-2 rounded-lg border border-indigo-200 mr-2"
            onPress={() => {
              setIsEditingAdmin(false);
              setSelectedVenta(null);
              setAdminFormVisible(true);
            }}
          >
            <Ionicons name="add" size={22} color="#4f46e5" />
          </TouchableOpacity>
        )}

        {activeTab === 'eliminadas' && canDelete && (
          <TouchableOpacity 
            className="bg-gray-100 p-2 rounded-lg border border-gray-300"
            onPress={handleEmptyTrash}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={22} color="#4b5563" />
          </TouchableOpacity>
        )}
      </View>

      {/* LIST */}
      <View className="flex-1 bg-[#F8FAFC]">
        {loading && !cache[activeTab].initialized ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#22c55e" />
          </View>
        ) : (
          <FlashList
            data={flatListData}
            renderItem={renderItem}
            estimatedItemSize={140}
            keyExtractor={(item: any, index: number) => item.isHeader ? `header-${item.title}` : (item.IDventas || `venta-${index}`)}
            contentContainerStyle={{ paddingBottom: 100 }}
            onScroll={handleScroll}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={['#22c55e']} />}
            ListHeaderComponent={
              activeTab === 'activas' && !searchText ? (
                <View className="bg-white mx-4 mt-3 mb-4 p-5 rounded-3xl shadow-sm border border-gray-100">
                  <View className="flex-row justify-between items-center mb-4">
                    <Text className="text-gray-500 font-bold text-xs uppercase tracking-wider">Resumen de Hoy</Text>
                    <View className="bg-blue-50 px-2 py-1.5 rounded-lg flex-row items-center">
                      <Ionicons name="receipt-outline" size={14} color="#2563eb" />
                      <Text className="text-blue-700 font-bold text-xs ml-1">{statsHoy.count} Tickets</Text>
                    </View>
                  </View>
                  
                  <View className="mb-5 flex-row justify-between items-end">
                    <View className="flex-1 mr-2">
                      <Text className="text-gray-400 text-xs font-medium mb-1">Total Ingresos</Text>
                      <Text className="text-4xl font-black text-green-600" numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(statsHoy.total)}</Text>
                    </View>
                    <TouchableOpacity 
                      className="bg-indigo-50 px-3 py-2.5 rounded-xl border border-indigo-100 flex-row items-center mb-1"
                      onPress={() => setProductsModalVisible(true)}
                    >
                      <Ionicons name="fast-food-outline" size={16} color="#4f46e5" />
                      <Text className="text-indigo-700 font-bold text-xs ml-1">Productos</Text>
                    </TouchableOpacity>
                  </View>

                  <View className="flex-row justify-between bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <View className="flex-1 mr-2">
                      <View className="flex-row items-center mb-1.5">
                        <Ionicons name="cash-outline" size={16} color="#16a34a" />
                        <Text className="text-gray-500 text-[10px] font-bold ml-1">EFECTIVO</Text>
                      </View>
                      <Text className="text-gray-800 font-bold text-base" numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(statsHoy.efectivo)}</Text>
                    </View>
                    
                    <View className="w-[1px] bg-gray-200" />
                    
                    <View className="flex-1 ml-4">
                      <View className="flex-row items-center mb-1.5">
                        <Ionicons name="card-outline" size={16} color="#9333ea" />
                        <Text className="text-gray-500 text-[10px] font-bold ml-1">TRANSFERENCIA</Text>
                      </View>
                      <Text className="text-gray-800 font-bold text-base" numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(statsHoy.transferencias)}</Text>
                    </View>
                  </View>
                </View>
              ) : null
            }
            ListFooterComponent={
              loadingMore ? <ActivityIndicator size="small" color="#22c55e" className="my-4" /> : null
            }
            ListEmptyComponent={
              <View className="items-center justify-center mt-20">
                <Ionicons name="receipt-outline" size={64} color="#d1d5db" />
                <Text className="text-gray-500 text-lg mt-4 font-medium">No hay ventas registradas</Text>
              </View>
            }
          />
        )}
      </View>

      {/* Floating Bulk Action Bar */}
      {isSelectionMode && selectedToDelete.length > 0 && (
        <View className="absolute bottom-6 left-2 right-2 bg-white rounded-2xl shadow-xl border border-gray-200 p-3 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 mr-2">
            <View className="bg-green-100 px-2 py-1.5 rounded-full mr-2">
              <Text className="text-green-700 font-bold text-xs">{selectedToDelete.length}</Text>
            </View>
            <Text className="text-gray-700 font-bold text-xs" numberOfLines={1}>Seleccionadas</Text>
          </View>
          <View className="flex-row items-center">
            <TouchableOpacity 
              className="bg-gray-100 px-3 py-2 rounded-xl mr-2"
              onPress={() => {
                setIsSelectionMode(false);
                setSelectedToDelete([]);
              }}
            >
              <Text className="text-gray-600 font-bold text-xs">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className="bg-red-600 px-3 py-2 rounded-xl flex-row items-center"
              onPress={activeTab === 'eliminadas' ? handleBulkHardDelete : handleBulkDelete}
            >
              <Ionicons name="trash-outline" size={14} color="#fff" />
              <Text className="text-white font-bold ml-1 text-xs">Eliminar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Detail Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-gray-50 rounded-t-3xl h-[85%]">
            <View className="flex-row justify-between items-center p-4 border-b border-gray-200 bg-white rounded-t-3xl">
              <Text className="text-lg font-bold text-gray-800">
                Detalle - {selectedVenta?.pedido?.replace('Pedido-', '') || 'Sin Ticket'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} className="p-2 bg-gray-100 rounded-full">
                <Ionicons name="close" size={24} color="#4b5563" />
              </TouchableOpacity>
            </View>

            {selectedVenta && (
              <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
                
                {/* Header info */}
                <View className="bg-white p-4 rounded-xl border border-gray-200 mb-4 shadow-sm">
                  <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest">Estado</Text>
                    <View className={`px-2 py-1 rounded-full ${activeTab === 'eliminadas' ? 'bg-red-100' : 'bg-green-100'}`}>
                      <Text className={`text-[10px] font-bold ${activeTab === 'eliminadas' ? 'text-red-700' : 'text-green-700'}`}>
                        {activeTab === 'eliminadas' ? 'ELIMINADA' : selectedVenta.estado}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row justify-between mb-2">
                    <Text className="text-gray-500 font-medium">Fecha:</Text>
                    <Text className="text-gray-800 font-bold">
                      {formatDateToDDMMAAAA(selectedVenta.fecha?.substring(0,10))} {selectedVenta.fechaYHora ? new Date(selectedVenta.fechaYHora).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : formatTime12h(selectedVenta.hora)}
                    </Text>
                  </View>

                  <View className="flex-row justify-between mb-2">
                    <Text className="text-gray-500 font-medium">Método de Pago:</Text>
                    <Text className="text-gray-800 font-bold">{selectedVenta.medioDePago}</Text>
                  </View>

                  {selectedVenta.medioDePago === 'EFECTIVO Y OTROS' && (
                    <>
                      <View className="flex-row justify-between mb-2 pl-4 border-l-2 border-green-500">
                        <Text className="text-gray-500 font-medium">Efectivo:</Text>
                        <Text className="text-gray-800 font-bold">
                          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(selectedVenta.efectivoRecibido || 0)}
                        </Text>
                      </View>
                      <View className="flex-row justify-between mb-2 pl-4 border-l-2 border-indigo-500">
                        <Text className="text-gray-500 font-medium">Transferencia ({selectedVenta.banco || 'Banco'}):</Text>
                        <Text className="text-gray-800 font-bold">
                          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format((selectedVenta.totalInput || 0) - (selectedVenta.efectivoRecibido || 0))}
                        </Text>
                      </View>
                    </>
                  )}

                  {selectedVenta.medioDePago === 'EFECTIVO' && (
                    <>
                      <View className="flex-row justify-between mb-2 pl-4 border-l-2 border-green-500">
                        <Text className="text-gray-500 font-medium">Recibido:</Text>
                        <Text className="text-gray-800 font-bold">
                          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(selectedVenta.efectivoRecibido || 0)}
                        </Text>
                      </View>
                      <View className="flex-row justify-between mb-2 pl-4 border-l-2 border-gray-300">
                        <Text className="text-gray-500 font-medium">Devueltas:</Text>
                        <Text className="text-gray-800 font-bold">
                          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(selectedVenta.devueltas || 0)}
                        </Text>
                      </View>
                    </>
                  )}

                  {selectedVenta.vendedor && (
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-gray-500 font-medium">Vendedor:</Text>
                      <Text className="text-gray-800 font-bold">{selectedVenta.vendedor}</Text>
                    </View>
                  )}
                  
                  {activeTab === 'eliminadas' && selectedVenta.deleteReason && (
                  <View className="mt-3 pt-3 border-t border-gray-100">
                    <Text className="text-red-800 text-xs italic font-medium">Motivo: {selectedVenta.deleteReason}</Text>
                  </View>
                )}
              </View>

              {renderTimeline()}

              {/* Products List */}
                <Text className="text-gray-800 font-bold text-base mb-3 ml-1">Productos</Text>
                <View className="bg-white rounded-xl border border-gray-200 mb-4 shadow-sm overflow-hidden">
                  {(selectedVenta.ordenVentas || []).map((prod: any, idx: number) => {
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
                      <View key={prod.IDorderventas || idx} className={`${idx > 0 ? 'border-t border-gray-100' : ''} pb-2`}>
                        <View className="flex-row p-3 items-center">
                          <View className="w-12 h-12 bg-gray-100 rounded-lg justify-center items-center mr-3 overflow-hidden border border-gray-200">
                            {prod.imagenUrl || prod.producto?.imagenUrl ? (
                              <Image source={{ uri: prod.imagenUrl || prod.producto?.imagenUrl }} className="w-full h-full" resizeMode="cover" />
                            ) : (
                              <MaterialCommunityIcons name="image-off" size={20} color="#9ca3af" />
                            )}
                          </View>
                          <View className="flex-1">
                            <Text className="text-gray-800 font-bold text-sm mb-0.5" numberOfLines={1}>
                              {prod.nombreProducto || prod.nombre}
                            </Text>
                            <Text className="text-gray-500 text-xs">
                              {prod.cantidad}x {formatCurrency(prod.precio)}
                            </Text>
                            
                            {/* Notas Compactas */}
                            {notas.length > 0 && (
                              <View className="flex-row flex-wrap mt-1">
                                {notas.map((nota, nIdx) => {
                                  const name = nota.name || nota.nombre || nota.Nombre || '';
                                  const price = nota.price || nota.precio || nota.Precio || 0;
                                  const qty = nota.quantity || 1;
                                  return (
                                    <View key={nIdx} className="bg-amber-100 px-1.5 py-0.5 rounded mr-1 mb-1 flex-row items-center">
                                      <Text className="text-[9px] text-amber-700 font-bold">
                                        {qty > 1 ? `${qty}x ` : ''}{name}
                                        {price < 0 ? ` (-${formatCurrency(Math.abs(price * qty))})` : (price > 0 ? ` (+${formatCurrency(price * qty)})` : '')}
                                      </Text>
                                    </View>
                                  );
                                })}
                              </View>
                            )}
                          </View>
                          <Text className="text-gray-800 font-bold ml-2">
                            {formatCurrency(prod.precioTotal)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Total */}
                <View className="bg-white p-4 rounded-xl border border-gray-200 mb-6 shadow-sm flex-row justify-between items-center">
                  <Text className="text-gray-500 font-bold text-base">TOTAL</Text>
                  <Text className="text-green-600 font-black text-2xl">{formatCurrency(selectedVenta.totalInput)}</Text>
                </View>

                {/* Actions */}
                <View className="flex-row justify-between items-center pb-10">
                  {activeTab === 'activas' ? (
                    <>
                      {canDelete && (
                        <TouchableOpacity 
                          className="bg-red-50 py-3 px-2 rounded-xl border border-red-200 flex-1 flex-row justify-center items-center mr-2"
                          onPress={handleDeleteSale}
                        >
                          <Ionicons name="trash-outline" size={18} color="#dc2626" />
                          <Text className="text-red-700 font-bold ml-1 text-sm" numberOfLines={1}>Eliminar</Text>
                        </TouchableOpacity>
                      )}
                      {canEdit && (
                        <TouchableOpacity 
                          className="bg-blue-50 py-3 px-2 rounded-xl border border-blue-200 flex-1 flex-row justify-center items-center ml-2"
                          onPress={() => {
                            setIsEditingAdmin(true);
                            setModalVisible(false);
                            setTimeout(() => {
                              setAdminFormVisible(true);
                            }, 300);
                          }}
                        >
                          <Ionicons name="create-outline" size={18} color="#2563eb" />
                          <Text className="text-blue-700 font-bold ml-1 text-sm" numberOfLines={1}>Editar</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  ) : (
                    <View className="flex-row flex-1">
                      {canDelete && (
                        <TouchableOpacity 
                          className="bg-red-50 py-3 px-2 rounded-xl border border-red-200 flex-1 flex-row justify-center items-center mr-2"
                          onPress={handleHardDeleteSale}
                        >
                          <Ionicons name="trash-outline" size={18} color="#dc2626" />
                          <Text className="text-red-700 font-bold ml-1 text-xs" numberOfLines={1}>Eliminar Físico</Text>
                        </TouchableOpacity>
                      )}
                      {canEdit && (
                        <TouchableOpacity 
                          className="bg-green-50 py-3 px-2 rounded-xl border border-green-200 flex-1 flex-row justify-center items-center ml-2"
                          onPress={handleRestoreSale}
                        >
                          <Ionicons name="refresh-outline" size={18} color="#16a34a" />
                          <Text className="text-green-700 font-bold ml-1 text-xs" numberOfLines={1}>Restaurar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>

              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Custom Action Modal (Delete / Restore) */}
      <Modal visible={actionModalVisible} transparent animationType="fade" onRequestClose={() => setActionModalVisible(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View className="flex-1 bg-black/50 justify-center items-center p-4">
            <View className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl">
              
              <View className="items-center mb-4">
                <View className={`w-16 h-16 rounded-full items-center justify-center mb-3 ${actionType === 'delete' || actionType === 'hard-delete' || actionType === 'empty-trash' || actionType === 'bulk-delete' || actionType === 'bulk-hard-delete' ? 'bg-red-100' : 'bg-green-100'}`}>
                  <Ionicons 
                    name={actionType === 'delete' || actionType === 'hard-delete' || actionType === 'empty-trash' || actionType === 'bulk-delete' || actionType === 'bulk-hard-delete' ? "trash" : "refresh"} 
                    size={32} 
                    color={actionType === 'delete' || actionType === 'hard-delete' || actionType === 'empty-trash' || actionType === 'bulk-delete' || actionType === 'bulk-hard-delete' ? "#dc2626" : "#16a34a"} 
                  />
                </View>
                <Text className="text-xl font-bold text-gray-900 text-center">
                  {actionType === 'delete' ? 'Eliminar Venta' 
                   : actionType === 'bulk-delete' ? 'Eliminar Múltiples Ventas'
                   : actionType === 'hard-delete' ? 'Eliminar Definitivamente'
                   : actionType === 'bulk-hard-delete' ? 'Eliminar Físicamente Múltiples'
                   : actionType === 'empty-trash' ? 'Vaciar Papelera'
                   : 'Restaurar Venta'}
                </Text>
                <Text className="text-gray-500 text-center mt-2 text-sm">
                  {actionType === 'delete' 
                    ? `¿Qué deseas hacer con el ticket ${selectedVenta?.pedido || 'SIN TICKET'}?` 
                    : actionType === 'bulk-delete'
                    ? `¿Qué deseas hacer con las ${selectedToDelete.length} ventas seleccionadas?`
                    : actionType === 'hard-delete'
                    ? `¿Estás seguro de eliminar físicamente el ticket ${selectedVenta?.pedido || 'SIN TICKET'}? Esta acción no se puede deshacer.`
                    : actionType === 'bulk-hard-delete'
                    ? `¿Estás seguro de eliminar físicamente ${selectedToDelete.length} ventas seleccionadas? Esta acción no se puede deshacer.`
                    : actionType === 'empty-trash'
                    ? `¿Estás seguro de eliminar permanentemente TODAS las ventas de la papelera? Esta acción no se puede deshacer.`
                    : `¿Deseas restaurar el ticket ${selectedVenta?.pedido || 'SIN TICKET'} y regresarlo a las ventas activas?`
                  }
                </Text>
              </View>

              {(actionType === 'delete' || actionType === 'bulk-delete') && (
                <View className="mb-5">
                  <Text className="text-gray-700 font-bold text-sm mb-2 ml-1">Motivo de eliminación <Text className="text-red-500">*</Text></Text>
                  <TextInput
                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800"
                    placeholder="Ej. Error al cobrar, Cliente canceló..."
                    placeholderTextColor="#9ca3af"
                    value={deleteReason}
                    onChangeText={setDeleteReason}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    autoFocus
                  />
                </View>
              )}

              <View className="flex-col mt-2 gap-y-2">
                {(actionType === 'delete' || actionType === 'bulk-delete') ? (
                  <>
                    <TouchableOpacity 
                      className={`w-full py-3.5 px-2 rounded-xl justify-center items-center flex-row bg-orange-500 ${isProcessingAction ? 'opacity-70' : ''}`}
                      onPress={() => processAction(actionType === 'delete' ? 'delete' : 'bulk-delete')}
                      disabled={isProcessingAction}
                    >
                      {isProcessingAction ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white font-bold text-center text-sm">Sí, Eliminar (Papelera)</Text>}
                    </TouchableOpacity>

                    <TouchableOpacity 
                      className={`w-full py-3.5 px-2 rounded-xl justify-center items-center flex-row bg-red-600 ${isProcessingAction ? 'opacity-70' : ''}`}
                      onPress={() => processAction(actionType === 'delete' ? 'hard-delete' : 'bulk-hard-delete')}
                      disabled={isProcessingAction}
                    >
                      {isProcessingAction ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white font-bold text-center text-sm">Eliminar Definitivamente</Text>}
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity 
                    className={`w-full py-3.5 px-2 rounded-xl justify-center items-center flex-row ${actionType === 'hard-delete' || actionType === 'empty-trash' || actionType === 'bulk-hard-delete' ? 'bg-red-600' : 'bg-green-600'} ${isProcessingAction ? 'opacity-70' : ''}`}
                    onPress={() => processAction()}
                    disabled={isProcessingAction}
                  >
                    {isProcessingAction ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text className="text-white font-bold text-center text-sm" numberOfLines={1}>
                        {actionType === 'hard-delete' || actionType === 'bulk-hard-delete' ? 'Sí, Borrar Definitivamente'
                         : actionType === 'empty-trash' ? 'Vaciar'
                         : 'Sí, Restaurar'}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity 
                  className="w-full py-3.5 rounded-xl border border-gray-200 bg-white"
                  onPress={() => setActionModalVisible(false)}
                  disabled={isProcessingAction}
                >
                  <Text className="text-gray-700 font-bold text-center text-sm" numberOfLines={1}>Cancelar</Text>
                </TouchableOpacity>
              </View>

            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Filter Modal */}
      <Modal visible={filterModalVisible} transparent animationType="slide" onRequestClose={() => setFilterModalVisible(false)}>
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-white rounded-t-3xl h-[85%]">
            <View className="flex-row justify-between items-center p-4 border-b border-gray-200 bg-white rounded-t-3xl">
              <View className="flex-row items-center">
                <Ionicons name="options-outline" size={24} color="#4f46e5" className="mr-2" />
                <Text className="text-lg font-bold text-gray-800 ml-2">Filtros Avanzados</Text>
              </View>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)} className="p-2 bg-gray-100 rounded-full">
                <Ionicons name="close" size={24} color="#4b5563" />
              </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
              
              {/* Estado */}
              <Text className="text-gray-800 font-bold mb-2">Estado del Pedido</Text>
              <View className="flex-row flex-wrap gap-2 mb-5">
                {['PAGADO', 'ENTREGADO', 'DEUDOR', 'EN_EL_CARRITO', 'INICIADO', 'TOMADO', 'LISTO_PARA_ENTREGA'].map(estado => (
                  <TouchableOpacity
                    key={estado}
                    onPress={() => setTempFilters(prev => ({ ...prev, estado: prev.estado === estado ? undefined : estado }))}
                    className={`px-3 py-2 rounded-lg border ${tempFilters.estado === estado ? 'bg-indigo-100 border-indigo-500' : 'bg-white border-gray-300'}`}
                  >
                    <Text className={`text-xs font-bold ${tempFilters.estado === estado ? 'text-indigo-700' : 'text-gray-600'}`}>
                      {estado.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Categoria */}
              <Text className="text-gray-800 font-bold mb-2">Categoría de Producto</Text>
              <View className="flex-row flex-wrap gap-2 mb-5">
                <TouchableOpacity
                  onPress={() => setTempFilters(prev => ({ ...prev, categoriaProducto: undefined }))}
                  className={`px-3 py-2 rounded-lg border ${!tempFilters.categoriaProducto ? 'bg-indigo-100 border-indigo-500' : 'bg-white border-gray-300'}`}
                >
                  <Text className={`text-xs font-bold ${!tempFilters.categoriaProducto ? 'text-indigo-700' : 'text-gray-600'}`}>
                    Todas
                  </Text>
                </TouchableOpacity>
                {productCategorias?.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setTempFilters(prev => ({ ...prev, categoriaProducto: prev.categoriaProducto === cat ? undefined : cat }))}
                    className={`px-3 py-2 rounded-lg border ${tempFilters.categoriaProducto === cat ? 'bg-indigo-100 border-indigo-500' : 'bg-white border-gray-300'}`}
                  >
                    <Text className={`text-xs font-bold ${tempFilters.categoriaProducto === cat ? 'text-indigo-700' : 'text-gray-600'}`}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Medio de Pago */}
              <Text className="text-gray-800 font-bold mb-2">Medio de Pago</Text>
              <View className="flex-row flex-wrap gap-2 mb-5">
                {['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BANCOLOMBIA', 'EFECTIVO Y OTROS', 'PENDIENTE'].map(medio => (
                  <TouchableOpacity
                    key={medio}
                    onPress={() => setTempFilters(prev => ({ ...prev, medioDePago: prev.medioDePago === medio ? undefined : medio }))}
                    className={`px-3 py-2 rounded-lg border ${tempFilters.medioDePago === medio ? 'bg-indigo-100 border-indigo-500' : 'bg-white border-gray-300'}`}
                  >
                    <Text className={`text-xs font-bold ${tempFilters.medioDePago === medio ? 'text-indigo-700' : 'text-gray-600'}`}>
                      {medio}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Rango de Fechas (Text inputs for simplicity, could be replaced with DatePicker) */}
              <Text className="text-gray-800 font-bold mb-2">Rango de Fechas (YYYY-MM-DD)</Text>
              <View className="flex-row gap-x-3 mb-5">
                <View className="flex-1">
                  <Text className="text-gray-500 text-xs mb-1">Desde</Text>
                  <TextInput
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 text-sm"
                    placeholder="Ej. 2024-01-01"
                    placeholderTextColor="#9ca3af"
                    value={tempFilters.fechaDesde || ''}
                    onChangeText={(t) => setTempFilters(prev => ({ ...prev, fechaDesde: t }))}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-gray-500 text-xs mb-1">Hasta</Text>
                  <TextInput
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 text-sm"
                    placeholder="Ej. 2024-12-31"
                    placeholderTextColor="#9ca3af"
                    value={tempFilters.fechaHasta || ''}
                    onChangeText={(t) => setTempFilters(prev => ({ ...prev, fechaHasta: t }))}
                  />
                </View>
              </View>

              {/* Rango de Montos */}
              <Text className="text-gray-800 font-bold mb-2">Rango de Total ($)</Text>
              <View className="flex-row gap-x-3 mb-8">
                <View className="flex-1">
                  <Text className="text-gray-500 text-xs mb-1">Mínimo</Text>
                  <TextInput
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 text-sm"
                    placeholder="0"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={tempFilters.totalMin?.toString() || ''}
                    onChangeText={(t) => setTempFilters(prev => ({ ...prev, totalMin: t }))}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-gray-500 text-xs mb-1">Máximo</Text>
                  <TextInput
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 text-sm"
                    placeholder="999999"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={tempFilters.totalMax?.toString() || ''}
                    onChangeText={(t) => setTempFilters(prev => ({ ...prev, totalMax: t }))}
                  />
                </View>
              </View>

              <View className="h-10" />
            </ScrollView>

            {/* Actions */}
            <View className="p-4 border-t border-gray-200 bg-white flex-row justify-between pb-8">
              <TouchableOpacity 
                className="flex-1 py-3.5 bg-gray-100 rounded-xl mr-2 items-center border border-gray-300"
                onPress={handleClearFilters}
              >
                <Text className="text-gray-700 font-bold">Limpiar Todo</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-1 py-3.5 bg-indigo-600 rounded-xl ml-2 items-center"
                onPress={handleApplyFilters}
              >
                <Text className="text-white font-bold">Aplicar Filtros</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* Products Summary Modal */}
      <Modal visible={productsModalVisible} transparent animationType="slide" onRequestClose={() => setProductsModalVisible(false)}>
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-gray-50 rounded-t-3xl h-[85%]">
            <View className="flex-row justify-between items-center p-4 border-b border-gray-200 bg-white rounded-t-3xl">
              <View className="flex-row items-center">
                <View className="bg-indigo-100 p-2 rounded-full mr-2">
                  <Ionicons name="fast-food" size={20} color="#4f46e5" />
                </View>
                <Text className="text-lg font-bold text-gray-800">Productos Vendidos Hoy</Text>
              </View>
              <TouchableOpacity onPress={() => setProductsModalVisible(false)} className="p-2 bg-gray-100 rounded-full">
                <Ionicons name="close" size={24} color="#4b5563" />
              </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
              {Object.keys(statsProducts).length === 0 ? (
                <View className="items-center justify-center mt-20">
                  <Ionicons name="fast-food-outline" size={64} color="#d1d5db" />
                  <Text className="text-gray-500 text-lg mt-4 font-medium">No hay productos vendidos hoy</Text>
                </View>
              ) : (
                Object.keys(statsProducts).sort().map((categoria) => {
                  const productos = statsProducts[categoria];
                  const totalCategoria = Object.values(productos).reduce((sum, p) => sum + p.total, 0);
                  const totalItemsCategoria = Object.values(productos).reduce((sum, p) => sum + p.cantidad, 0);

                  return (
                    <View key={categoria} className="bg-white rounded-2xl border border-gray-200 mb-4 shadow-sm overflow-hidden">
                      <View className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex-row justify-between items-center">
                        <Text className="font-bold text-gray-800 text-base uppercase tracking-wider">{categoria}</Text>
                        <View className="bg-indigo-100 px-2 py-1 rounded-md">
                          <Text className="text-indigo-700 font-bold text-[10px]">{totalItemsCategoria} items</Text>
                        </View>
                      </View>
                      
                      {Object.keys(productos).sort().map((nombreProd, idx) => {
                        const prod = productos[nombreProd];
                        return (
                          <View key={nombreProd} className={`px-4 py-3 flex-row justify-between items-center ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                            <View className="flex-1 mr-3">
                              <Text className="text-gray-800 font-bold text-sm mb-1" numberOfLines={2}>{nombreProd}</Text>
                              <Text className="text-gray-500 text-xs">{prod.cantidad} unidades vendidas</Text>
                            </View>
                            <Text className="text-green-600 font-black text-sm">{formatCurrency(prod.total)}</Text>
                          </View>
                        );
                      })}
                      
                      <View className="bg-gray-50/50 px-4 py-3 border-t border-gray-200 flex-row justify-between items-center">
                        <Text className="text-gray-500 font-bold text-xs">TOTAL CATEGORÍA</Text>
                        <Text className="text-gray-900 font-black text-base">{formatCurrency(totalCategoria)}</Text>
                      </View>
                    </View>
                  );
                })
              )}
              <View className="h-10" />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <AdminSaleFormModal 
        visible={adminFormVisible}
        onClose={() => setAdminFormVisible(false)}
        onSuccess={() => fetchVentas(1, activeTab, false, searchText)}
        saleData={isEditingAdmin ? selectedVenta : undefined}
      />

    </View>
  );
}
