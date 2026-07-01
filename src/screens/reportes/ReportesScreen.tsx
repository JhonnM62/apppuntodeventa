import React, { useCallback, useState } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Platform,
  Alert,
  RefreshControl,
  StyleSheet,
  FlatList,
  Text as RNText,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/ui/text';
import { useReportesStore } from '../../store/useReportesStore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { ReporteFilter } from '../../services/reportes';
import Toast from 'react-native-toast-message';
import DateTimePicker from '@react-native-community/datetimepicker';
import { usePermissions } from '../../hooks/usePermissions';
import { useFocusEffect } from '@react-navigation/native';
import { useScrollDirection } from '../../hooks/useScrollDirection';

// ─── Estilos nativos (sin NativeWind para estructuras críticas) ───────────────
const S = StyleSheet.create({
  // Contenedores raíz
  root: { flex: 1, backgroundColor: '#f9fafb' },
  // ⚠️ REGLA 2: SafeAreaView siempre con style, nunca className
  safeArea: { flex: 1 },

  // Header verde
  header: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'nowrap',
    // ⚠️ REGLA 1: elevation (Android) en lugar de shadow-sm (NativeWind)
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    zIndex: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  backBtn: { marginRight: 10, padding: 4 },
  searchBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 99,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: 'white',
    paddingVertical: Platform.OS === 'web' ? 4 : 2,
    fontSize: 15,
    minWidth: 0,
  },
  addBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 8,
    borderRadius: 99,
    flexShrink: 0,
  },

  // Tabs
  tabsWrapper: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(229,231,235,0.6)',
    padding: 4,
    borderRadius: 16,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  // ⚠️ REGLA 1: Tab activo con elevation, sin shadow-sm NativeWind
  tabActive: {
    backgroundColor: 'white',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  tabText: { fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center', color: '#6b7280' },
  tabTextActive: { color: '#16a34a' },

  // Lista
  listContent: { padding: 16, flexGrow: 1 },

  // Tarjeta de reporte
  // ⚠️ REGLA 1: SIN overflow-hidden. Sombra vía elevation.
  card: {
    backgroundColor: 'white',
    padding: 16,
    marginBottom: 12,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#1f2937' },
  cardSub: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  cardAmount: { fontSize: 17, fontWeight: '900', color: '#1f2937', textAlign: 'right' },
  cardActions: { flexDirection: 'row', marginTop: 8, justifyContent: 'flex-end' },
  actionBtn: { padding: 6, backgroundColor: '#f3f4f6', borderRadius: 8, marginLeft: 8 },

  // Empty state
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: 60, flex: 1 },
  emptyText: { color: '#9ca3af', marginTop: 16, fontSize: 16, textAlign: 'center' },
  emptyBtn: {
    marginTop: 20,
    backgroundColor: '#16a34a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },

  // Loading
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: 'white', width: '90%', borderRadius: 24, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937', textAlign: 'center', marginBottom: 6 },
  modalSub: { fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 24 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  datePicker: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  datePickerText: { color: '#1f2937', marginLeft: 8 },
  dateLabel: { fontSize: 10, fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 },
  btnGreen: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  btnDark: {
    backgroundColor: '#1f2937',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: { color: 'white', fontWeight: 'bold', marginLeft: 8, fontSize: 15 },
});

// ─── Módulos PDF (carga dinámica) ─────────────────────────────────────────────
let Print: any = null;
let Sharing: any = null;
try { Print = require('expo-print'); } catch { /* no disponible */ }
try { Sharing = require('expo-sharing'); } catch { /* no disponible */ }

// ─── Componente ───────────────────────────────────────────────────────────────
export default function ReportesScreen({ navigation }: any) {
  const {
    reportesDineroGuardado,
    isLoading,
    fetchReportesDineroGuardado,
    crearReporte,
    eliminarReporte,
  } = useReportesStore();

  const { canCreate, canDelete } = usePermissions('reportes');

  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState(endOfMonth(new Date()));
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<'DINERO_GUARDADO' | 'VENTAS'>('DINERO_GUARDADO');
  const [modalVisible, setModalVisible] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(startOfMonth(new Date()));
  const [tempEndDate, setTempEndDate] = useState(endOfMonth(new Date()));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleScroll = useScrollDirection();

  // ⚠️ useFocusEffect en lugar de useEffect: recarga cada vez que la pantalla gana foco
  useFocusEffect(
    useCallback(() => {
      fetchReportesDineroGuardado();
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchReportesDineroGuardado();
    } finally {
      setRefreshing(false);
    }
  }, [fetchReportesDineroGuardado]);

  const fMoney = (amount: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(Number(amount) || 0);

  // ── Eliminar ────────────────────────────────────────────────────────────────
  const handleDeleteReporte = (item: ReporteFilter) => {
    const fechaDesde = item.desde
      ? format(new Date(item.desde), "d 'de' MMMM", { locale: es })
      : 'N/A';
    const fechaHasta = item.hasta
      ? format(new Date(item.hasta), "d 'de' MMMM", { locale: es })
      : 'N/A';

    Alert.alert(
      'Eliminar Reporte',
      `Reporte del ${fechaDesde} hasta el ${fechaHasta}.\n\n¿Está seguro que desea eliminarlo permanentemente?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => eliminarReporte(item.FilterID) },
      ]
    );
  };

  // ── PDF Consolidado (lista) ─────────────────────────────────────────────────
  const exportConsolidatedPDF = async () => {
    if (!filteredCajas.length) {
      Toast.show({ type: 'info', text1: 'Sin datos', text2: 'No hay reportes para exportar' });
      return;
    }
    if (!Print || !Sharing) {
      Toast.show({ type: 'error', text1: 'Módulo Faltante', text2: 'Debes recompilar la app para exportar PDFs' });
      return;
    }
    try {
      const totalGlobal = filteredCajas.reduce(
        (sum, item) => sum + Number(item.totalDePlataGuardada || 0),
        0
      );
      const rows = filteredCajas
        .map(
          (item) => `
          <tr>
            <td style="border-bottom:1px solid #eee;padding:8px">
              ${item.desde ? format(new Date(item.desde), 'dd/MM/yyyy', { locale: es }) : 'N/A'}
            </td>
            <td style="border-bottom:1px solid #eee;padding:8px;text-align:right;color:#16a34a;font-weight:bold">
              ${fMoney(Number(item.totalDePlataGuardada || 0))}
            </td>
          </tr>`
        )
        .join('');

      const html = `<html><body style="font-family:Helvetica,sans-serif;padding:20px">
        <h1 style="color:#16a34a;text-align:center">Reporte Consolidado de Dinero Guardado</h1>
        <p style="text-align:center;color:#666">
          Desde: ${format(startDate, "d 'de' MMMM 'de' yyyy", { locale: es })}<br>
          Hasta: ${format(endDate, "d 'de' MMMM 'de' yyyy", { locale: es })}
        </p>
        <hr/>
        <h2>Total: ${fMoney(totalGlobal)}</h2>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="border-bottom:2px solid #ddd;padding:10px;text-align:left">Fecha</th>
            <th style="border-bottom:2px solid #ddd;padding:10px;text-align:right">Dinero Guardado</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch {
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo generar el PDF consolidado' });
    }
  };

  // ── Filtro ──────────────────────────────────────────────────────────────────
  const filteredCajas = reportesDineroGuardado.filter((caja) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (caja.tipoDeFiltro && caja.tipoDeFiltro.toLowerCase().includes(q)) ||
      (caja.totalDePlataGuardada && caja.totalDePlataGuardada.toString().includes(q))
    );
  });

  // ── Render tarjeta ──────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: ReporteFilter }) => (
    <TouchableOpacity
      style={S.card}
      activeOpacity={0.75}
      onPress={() => {
        if (item.FilterID) navigation.navigate('ReporteDetalle', { filterId: item.FilterID });
      }}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={S.cardTitle}>
          {item.desde
            ? format(new Date(item.desde), "d 'de' MMM. 'de' yyyy", { locale: es })
            : 'N/A'}
        </Text>
        <Text style={S.cardSub}>
          Hasta:{' '}
          {item.hasta
            ? format(new Date(item.hasta), "d 'de' MMM. 'de' yyyy", { locale: es })
            : 'N/A'}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text style={S.cardAmount}>{fMoney(Number(item.totalDePlataGuardada || 0))}</Text>
        <View style={S.cardActions}>
          {canDelete && (
            <TouchableOpacity style={S.actionBtn} onPress={() => handleDeleteReporte(item)}>
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={S.actionBtn}
            onPress={() => {
              if (item.FilterID) navigation.navigate('ReporteDetalle', { filterId: item.FilterID });
            }}
          >
            <Ionicons name="document-text-outline" size={20} color="#4b5563" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  // ── Empty state ─────────────────────────────────────────────────────────────
  const renderEmpty = () => (
    <View style={S.empty}>
      <Ionicons name="document-outline" size={64} color="#d1d5db" />
      <Text style={S.emptyText}>No hay reportes creados aún</Text>
      {canCreate && (
        <TouchableOpacity style={S.emptyBtn} onPress={() => setModalVisible(true)}>
          <Text style={S.emptyBtnText}>+ Crear Reporte</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    // ⚠️ REGLA 2: root container con style puro, SafeAreaView con style puro
    <View style={S.root}>
      <StatusBar style="light" backgroundColor="#16a34a" translucent={false} />
      <SafeAreaView style={S.safeArea} edges={['top']}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={S.header}>
          <View style={S.headerLeft}>
            <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <View style={S.searchBox}>
              <Ionicons name="search" size={18} color="white" />
              <TextInput
                placeholder="Buscar reporte..."
                placeholderTextColor="rgba(255,255,255,0.7)"
                style={S.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <TouchableOpacity style={{ padding: 2 }} onPress={() => setModalVisible(true)}>
                <Ionicons name="options-outline" size={18} color="white" />
              </TouchableOpacity>
            </View>
          </View>
          {canCreate && (
            <TouchableOpacity style={S.addBtn} onPress={() => setModalVisible(true)}>
              <Ionicons name="add" size={24} color="white" />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <View style={S.tabsWrapper}>
          <View style={S.tabsContainer}>
            {(['DINERO_GUARDADO', 'VENTAS'] as const).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[S.tab, isActive && S.tabActive]}
                  onPress={() => setActiveTab(tab)}
                  activeOpacity={0.8}
                >
                  <Text style={[S.tabText, isActive && S.tabTextActive]}>
                    {tab === 'DINERO_GUARDADO' ? 'Dinero Guardado' : 'Ventas'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Contenido ──────────────────────────────────────────────────── */}
        {isLoading ? (
          <View style={S.loadingBox}>
            <ActivityIndicator size="large" color="#16a34a" />
          </View>
        ) : activeTab === 'DINERO_GUARDADO' ? (
          <FlatList
            data={filteredCajas}
            keyExtractor={(item: ReporteFilter) => item.FilterID}
            renderItem={renderItem}
            onScroll={handleScroll}
            // ⚠️ REGLA 3: flexGrow:1 para que el contenedor se expanda
            contentContainerStyle={S.listContent}
            style={{ flex: 1 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#16a34a']}
                tintColor="#16a34a"
              />
            }
            ListEmptyComponent={renderEmpty}
          />
        ) : (
          <View style={[S.loadingBox, { marginTop: 0 }]}>
            <Ionicons name="construct-outline" size={64} color="#d1d5db" />
            <Text style={S.emptyText}>Módulo en construcción</Text>
          </View>
        )}

        {/* ── Modal: Generar Reporte ──────────────────────────────────────── */}
        <Modal
          visible={modalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setModalVisible(false)}
        >
          <TouchableOpacity
            style={S.modalOverlay}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} style={S.modalCard}>
              <Text style={S.modalTitle}>Generar Reporte</Text>
              <Text style={S.modalSub}>
                Selecciona el rango de fechas para cargar los reportes de Dinero Guardado.
              </Text>

              <View style={S.dateRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <RNText style={S.dateLabel}>Fecha de Inicio</RNText>
                  <TouchableOpacity
                    style={S.datePicker}
                    onPress={() => setShowStartPicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={18} color="#16a34a" />
                    <RNText style={S.datePickerText}>{format(tempStartDate, 'dd/MM/yyyy')}</RNText>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <RNText style={S.dateLabel}>Fecha Fin</RNText>
                  <TouchableOpacity
                    style={S.datePicker}
                    onPress={() => setShowEndPicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={18} color="#16a34a" />
                    <RNText style={S.datePickerText}>{format(tempEndDate, 'dd/MM/yyyy')}</RNText>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[S.btnGreen, creating && { opacity: 0.7 }]}
                disabled={creating}
                onPress={async () => {
                  setCreating(true);
                  try {
                    await crearReporte(
                      format(tempStartDate, 'yyyy-MM-dd'),
                      format(tempEndDate, 'yyyy-MM-dd')
                    );
                    setModalVisible(false);
                    Toast.show({ type: 'success', text1: 'Éxito', text2: 'Reporte generado' });
                  } catch {
                    Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo crear el reporte' });
                  } finally {
                    setCreating(false);
                  }
                }}
              >
                {creating ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Ionicons name="search" size={20} color="white" />
                )}
                <Text style={S.btnText}>Generar Reporte</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={S.btnDark}
                onPress={() => {
                  setStartDate(tempStartDate);
                  setEndDate(tempEndDate);
                  setModalVisible(false);
                  setTimeout(() => exportConsolidatedPDF(), 500);
                }}
              >
                <Ionicons name="document-text-outline" size={20} color="white" />
                <Text style={S.btnText}>Generar PDF Consolidado</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* ── Date Pickers ────────────────────────────────────────────────── */}
        {showStartPicker && (
          <DateTimePicker
            value={tempStartDate}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowStartPicker(Platform.OS === 'ios');
              if (event.type === 'set' && selectedDate) setTempStartDate(selectedDate);
            }}
          />
        )}
        {showEndPicker && (
          <DateTimePicker
            value={tempEndDate}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowEndPicker(Platform.OS === 'ios');
              if (event.type === 'set' && selectedDate) setTempEndDate(selectedDate);
            }}
          />
        )}

      </SafeAreaView>
    </View>
  );
}
