import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '../../components/ui/text';
import { Card } from '../../components/ui/card';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMisTurnos, Turno, firmarLiquidacion, getLiquidacionById } from '../../services/nomina.service';
import { useCustomAlert } from '../../context/CustomAlertContext';
import { useSocket } from '../../hooks/useSocket';
import useSocketEvent from '../../hooks/useSocketEvent';
import useAuthStore from '../../store/useAuthStore';
import SignatureModal from '../../components/ui/SignatureModal';
import LiquidacionViewerModal from '../../components/ui/LiquidacionViewerModal';
import { generarLiquidacionHTML } from '../../utils/nominaPdf';
import DescansoCard from './DescansoCard';

export default function MisTurnosScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { showAlert } = useCustomAlert();
  const { user } = useAuthStore();
  const { joinRoom, isConnected } = useSocket();
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [selectedQuincenaKey, setSelectedQuincenaKey] = useState<string>('');
  const [showAllQuincenas, setShowAllQuincenas] = useState(false);

  const [pendingLiquidacion, setPendingLiquidacion] = useState<any>(null);
  const [visorHtml, setVisorHtml] = useState<string | null>(null);
  const [visorModoFirma, setVisorModoFirma] = useState(false);
  const [showSignatureEmpleado, setShowSignatureEmpleado] = useState(false);
  const [liquidando, setLiquidando] = useState(false);

  useEffect(() => {
    if (isConnected && user?.IDusuarios) {
      joinRoom(`user_${user.IDusuarios}`);
    }
  }, [isConnected, user, joinRoom]);

  useSocketEvent('nueva_liquidacion', async (data: any) => {
    try {
      const liquidacion = await getLiquidacionById(data.liquidacionId);
      setPendingLiquidacion(liquidacion);
      showAlert({
        type: 'confirm',
        title: '¡Tienes una nueva liquidación!',
        message: 'Por favor revisa el comprobante y firma para aceptar la liquidación.',
        confirmText: 'Revisar y Firmar',
        onConfirm: () => handleReviewLiquidacion(liquidacion)
      });
    } catch (e) {
      console.error('Error al obtener la liquidación pendiente:', e);
    }
  });

  // ── Paso 1: abrir el visor con botón Firmar ──
  const handleReviewLiquidacion = (liquidacion: any) => {
    const html = generarLiquidacionHTML({
      empleadoNombre: user?.nombre || '',
      empleadoCargo: user?.cargo?.nombre || 'Empleado',
      fechaInicio: liquidacion.fechaInicio,
      fechaFin: liquidacion.fechaFin,
      turnos: liquidacion.turnosDetalle || [],
      descuentos: liquidacion.descuentosDetalle || [],
      totalBruto: liquidacion.totalBruto,
      totalDescuentos: liquidacion.totalDescuentos,
      totalNeto: liquidacion.totalNeto,
      firmaAdmin: liquidacion.firmaAdmin,
    });
    setVisorHtml(html);
    setVisorModoFirma(true);
  };

  // ── Paso 2: al presionar Firmar dentro del visor ──
  const handleAbrirFirma = () => {
    setVisorHtml(null);
    setVisorModoFirma(false);
    setShowSignatureEmpleado(true);
  };

  // ── Paso 3: guardar firma y mostrar PDF final ──
  const handleSaveSignature = async (firma: string) => {
    if (!pendingLiquidacion) return;
    try {
      setLiquidando(true);
      await firmarLiquidacion(pendingLiquidacion.IDliquidacion, { firmaEmpleado: firma });
      setShowSignatureEmpleado(false);
      showAlert({ type: 'success', title: 'Éxito', message: 'Liquidación firmada correctamente' });
      const htmlFinal = generarLiquidacionHTML({
        empleadoNombre: user?.nombre || '',
        empleadoCargo: user?.cargo?.nombre || 'Empleado',
        fechaInicio: pendingLiquidacion.fechaInicio,
        fechaFin: pendingLiquidacion.fechaFin,
        turnos: pendingLiquidacion.turnosDetalle || [],
        descuentos: pendingLiquidacion.descuentosDetalle || [],
        totalBruto: pendingLiquidacion.totalBruto,
        totalDescuentos: pendingLiquidacion.totalDescuentos,
        totalNeto: pendingLiquidacion.totalNeto,
        firmaAdmin: pendingLiquidacion.firmaAdmin,
        firmaEmpleado: firma,
      });
      setPendingLiquidacion(null);
      setVisorModoFirma(false);
      setVisorHtml(htmlFinal);
    } catch (e) {
      showAlert({ type: 'error', title: 'Error', message: 'No se pudo guardar la firma' });
    } finally {
      setLiquidando(false);
    }
  };

  useEffect(() => {
    loadTurnos();
  }, []);

  const loadTurnos = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const res = await getMisTurnos({ limit: 100 }); 
      // Ensure we sort descending by Date
      const sortedTurnos = (res.data?.turnos || res.data || []).sort((a: any, b: any) => {
        const dateA = new Date(a.fecha || a.horaEntrada).getTime();
        const dateB = new Date(b.fecha || b.horaEntrada).getTime();
        return dateB - dateA; // Descending
      });
      setTurnos(sortedTurnos);
    } catch (error) {
      console.error('[MisTurnosScreen] Fetch Error:', error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudieron cargar los turnos' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case 'ACTIVO': return '#10b981'; // Green
      case 'COMPLETADO': return '#6b7280'; // Gray
      case 'LIQUIDADO': return '#3b82f6'; // Blue
      default: return '#f59e0b'; // Yellow for others like ANULADO
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // Quincenas calculation and sorting
  const todayISO = useMemo(() => new Date().toISOString(), []);
  const todayKey = useMemo(() => getQuincenaKey(todayISO), [todayISO]);

  const quincenasList = useMemo(() => {
    const map = new Map<string, string>();
    // Siempre incluir la quincena actual
    map.set(todayKey, getQuincenaLabel(todayISO));

    turnos.forEach(t => {
      const f = t.horaEntrada || (t as any).fecha;
      if (f) {
        map.set(getQuincenaKey(f), getQuincenaLabel(f));
      }
    });

    // Ordenar de más reciente a más antigua
    return Array.from(map.entries())
      .sort(([keyA], [keyB]) => keyB.localeCompare(keyA))
      .map(([key, label]) => ({ key, label }));
  }, [turnos, todayKey, todayISO]);

  const activeQuincenaIndex = useMemo(() => {
    if (!selectedQuincenaKey) return 0;
    const idx = quincenasList.findIndex(q => q.key === selectedQuincenaKey);
    return idx >= 0 ? idx : 0;
  }, [quincenasList, selectedQuincenaKey]);

  const activeQuincena = quincenasList[activeQuincenaIndex] || {
    key: todayKey,
    label: getQuincenaLabel(todayISO),
  };

  const isCurrentQuincena = activeQuincena.key === todayKey;

  const handlePrevQuincena = () => {
    // Ir a quincena anterior (más antigua en array descendente)
    if (activeQuincenaIndex < quincenasList.length - 1) {
      setSelectedQuincenaKey(quincenasList[activeQuincenaIndex + 1].key);
      setShowAllQuincenas(false);
    }
  };

  const handleNextQuincena = () => {
    // Ir a quincena siguiente (más reciente en array descendente)
    if (activeQuincenaIndex > 0) {
      setSelectedQuincenaKey(quincenasList[activeQuincenaIndex - 1].key);
      setShowAllQuincenas(false);
    }
  };

  // Balance financiero consolidado de la quincena activa
  const quincenaFinancials = useMemo(() => {
    const quincenaTurnos = turnos.filter(t => {
      const f = t.horaEntrada || (t as any).fecha;
      return f && getQuincenaKey(f) === activeQuincena.key;
    });

    const validTurnos = quincenaTurnos.filter(t => t.estado !== 'ANULADO');

    let bruto = 0;
    let totalDescuentos = 0;
    let bonos = 0;
    let neto = 0;
    let completados = 0;
    let activos = 0;

    validTurnos.forEach(t => {
      const fin = calculateTurnoFinancials(t);
      bruto += fin.bruto;
      totalDescuentos += fin.totalDescuentos;
      bonos += fin.bonosCaja;
      neto += fin.neto;
      if (t.estado === 'ACTIVO') activos++;
      if (t.estado === 'COMPLETADO' || t.estado === 'LIQUIDADO') completados++;
    });

    return {
      turnosCount: validTurnos.length,
      completados,
      activos,
      bruto,
      totalDescuentos,
      bonos,
      neto,
    };
  }, [turnos, activeQuincena.key]);

  // Filtrado y agrupamiento de turnos para el listado
  const filteredAndGroupedTurnos = useMemo(() => {
    let filtered = turnos;

    // Si no está en modo "ver todas" y no hay búsqueda de texto, restringir a la quincena activa
    if (!showAllQuincenas && searchQuery.trim() === '') {
      filtered = filtered.filter(t => {
        const f = t.horaEntrada || (t as any).fecha;
        return f && getQuincenaKey(f) === activeQuincena.key;
      });
    }

    if (statusFilter !== 'Todos') {
      filtered = filtered.filter(t => t.estado === statusFilter);
    }

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        (t.observacion && t.observacion.toLowerCase().includes(query)) ||
        (t.usuario?.nombre && t.usuario.nombre.toLowerCase().includes(query))
      );
    }

    const groups: { [key: string]: Turno[] } = {};
    filtered.forEach(turno => {
      const label = getQuincenaLabel(turno.horaEntrada || (turno as any).fecha || new Date().toISOString());
      if (!groups[label]) groups[label] = [];
      groups[label].push(turno);
    });

    return Object.entries(groups).map(([label, items]) => ({ label, items }));
  }, [turnos, statusFilter, searchQuery, showAllQuincenas, activeQuincena.key]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Mis Turnos</Text>
        <TouchableOpacity onPress={() => loadTurnos(true)} style={styles.reloadBtn}>
          <Ionicons name="refresh" size={20} color="#4b5563" />
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#10b981" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView 
          style={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={() => loadTurnos(true)} 
              colors={['#10b981', '#3b82f6']} 
            />
          }
        >
          {/* ── HERO BALANCE CARD ── */}
          <LinearGradient
            colors={['#064e3b', '#0f172a', '#1e293b']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            {/* Fila superior: Navegador de Quincena + Pill de Estado */}
            <View style={styles.heroNavRow}>
              <View style={styles.heroNavLeft}>
                <TouchableOpacity
                  onPress={handlePrevQuincena}
                  disabled={activeQuincenaIndex >= quincenasList.length - 1}
                  style={[
                    styles.heroNavBtn,
                    activeQuincenaIndex >= quincenasList.length - 1 && styles.heroNavBtnDisabled,
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name="chevron-back" 
                    size={18} 
                    color={activeQuincenaIndex >= quincenasList.length - 1 ? '#475569' : '#ffffff'} 
                  />
                </TouchableOpacity>

                <View style={styles.heroQuincenaBadge}>
                  <Ionicons name="calendar-outline" size={13} color="#6ee7b7" style={{ marginRight: 6 }} />
                  <Text style={styles.heroQuincenaText}>{activeQuincena.label}</Text>
                </View>

                <TouchableOpacity
                  onPress={handleNextQuincena}
                  disabled={activeQuincenaIndex <= 0}
                  style={[
                    styles.heroNavBtn,
                    activeQuincenaIndex <= 0 && styles.heroNavBtnDisabled,
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name="chevron-forward" 
                    size={18} 
                    color={activeQuincenaIndex <= 0 ? '#475569' : '#ffffff'} 
                  />
                </TouchableOpacity>
              </View>

              <View style={[styles.heroStatusPill, isCurrentQuincena ? styles.heroStatusPillActive : styles.heroStatusPillHistory]}>
                <Text style={[styles.heroStatusPillText, isCurrentQuincena ? styles.heroStatusTextActive : styles.heroStatusTextHistory]}>
                  {isCurrentQuincena ? '● EN CURSO' : 'HISTÓRICO'}
                </Text>
              </View>
            </View>

            {/* Centro: Balance Neto Principal */}
            <View style={styles.heroCenter}>
              <Text style={styles.heroSubheader}>BALANCE ESTIMADO A COBRAR</Text>
              <View style={styles.heroAmountRow}>
                <Text style={styles.heroCurrencySymbol}>$</Text>
                <Text style={styles.heroAmount}>{quincenaFinancials.neto.toLocaleString('es-CO')}</Text>
                <Text style={styles.heroCurrencyCode}>COP</Text>
              </View>
              <Text style={styles.heroSubtitle}>
                {isCurrentQuincena 
                  ? 'Total neto acumulado de lo trabajado en esta quincena'
                  : 'Total neto liquidado / finalizado de este período'}
              </Text>
            </View>

            {/* Fila inferior: Chips de resumen Bruto, Descuentos y Bonos */}
            <View style={styles.heroChipsRow}>
              <View style={styles.heroChip}>
                <Ionicons name="wallet-outline" size={12} color="#94a3b8" />
                <Text style={styles.heroChipLabel}>Bruto: </Text>
                <Text style={styles.heroChipVal}>${quincenaFinancials.bruto.toLocaleString('es-CO')}</Text>
              </View>

              <View style={[styles.heroChip, styles.heroChipDiscount]}>
                <Ionicons name="arrow-down-outline" size={12} color="#f87171" />
                <Text style={[styles.heroChipLabel, { color: '#fca5a5' }]}>Dtos: </Text>
                <Text style={[styles.heroChipVal, { color: '#fca5a5' }]}>
                  -${quincenaFinancials.totalDescuentos.toLocaleString('es-CO')}
                </Text>
              </View>

              <View style={[styles.heroChip, styles.heroChipBonus]}>
                <Ionicons name="arrow-up-outline" size={12} color="#34d399" />
                <Text style={[styles.heroChipLabel, { color: '#86efac' }]}>Bonos: </Text>
                <Text style={[styles.heroChipVal, { color: '#86efac' }]}>
                  +${quincenaFinancials.bonos.toLocaleString('es-CO')}
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* ── TRÍO DE MINI-CARDS KPI ── */}
          <View style={styles.miniCardsRow}>
            {/* Mini Card 1: Turnos */}
            <View style={styles.miniCard}>
              <View style={styles.miniCardTop}>
                <View style={[styles.miniIconBox, { backgroundColor: '#eff6ff' }]}>
                  <Ionicons name="calendar" size={14} color="#3b82f6" />
                </View>
                <Text style={styles.miniCardLabel}>Turnos</Text>
              </View>
              <Text style={styles.miniCardValue}>{quincenaFinancials.turnosCount}</Text>
              <Text style={styles.miniCardSub}>
                {quincenaFinancials.completados} comp. · {quincenaFinancials.activos} act.
              </Text>
            </View>

            {/* Mini Card 2: Descuentos */}
            <View style={[styles.miniCard, { borderColor: '#fee2e2' }]}>
              <View style={styles.miniCardTop}>
                <View style={[styles.miniIconBox, { backgroundColor: '#fef2f2' }]}>
                  <Ionicons name="trending-down" size={14} color="#ef4444" />
                </View>
                <Text style={styles.miniCardLabel}>Descuentos</Text>
              </View>
              <Text style={[styles.miniCardValue, { color: '#dc2626' }]}>
                -${quincenaFinancials.totalDescuentos.toLocaleString('es-CO')}
              </Text>
              <Text style={styles.miniCardSub}>Cena, retardos, otros</Text>
            </View>

            {/* Mini Card 3: Bonos / Extras */}
            <View style={[styles.miniCard, { borderColor: '#dcfce7' }]}>
              <View style={styles.miniCardTop}>
                <View style={[styles.miniIconBox, { backgroundColor: '#f0fdf4' }]}>
                  <Ionicons name="gift" size={14} color="#10b981" />
                </View>
                <Text style={styles.miniCardLabel}>Bonos / Ext.</Text>
              </View>
              <Text style={[styles.miniCardValue, { color: '#16a34a' }]}>
                +${quincenaFinancials.bonos.toLocaleString('es-CO')}
              </Text>
              <Text style={styles.miniCardSub}>Premios y extras</Text>
            </View>
          </View>

          {/* ── BANNER INFORMATIVO DE QUINCENA & TOGGLE ── */}
          <View style={styles.quincenaBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
              <Ionicons 
                name={showAllQuincenas ? "infinite-outline" : "filter-outline"} 
                size={16} 
                color="#64748b" 
                style={{ marginRight: 6 }}
              />
              <Text style={styles.quincenaBannerText} numberOfLines={1}>
                {showAllQuincenas 
                  ? 'Mostrando todo el historial de turnos' 
                  : `Filtrado: ${activeQuincena.label}`}
              </Text>
            </View>
            <TouchableOpacity 
              onPress={() => setShowAllQuincenas(!showAllQuincenas)} 
              style={styles.quincenaBannerBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.quincenaBannerBtnText}>
                {showAllQuincenas ? 'Ver período' : 'Ver todo'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── BUSCADOR ── */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por observación o nombre..."
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>

          {/* ── FILTROS POR ESTADO ── */}
          <View style={{ paddingHorizontal: 16 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              {['Todos', 'ACTIVO', 'COMPLETADO', 'LIQUIDADO', 'ANULADO'].map(status => (
                <TouchableOpacity 
                  key={status} 
                  style={[styles.pill, statusFilter === status && styles.pillActive]}
                  onPress={() => setStatusFilter(status)}
                >
                  <Text style={[styles.pillText, statusFilter === status && styles.pillTextActive]}>
                    {status}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* ── LISTADO DE TURNOS AGRUPADOS ── */}
          <View style={styles.turnsContainer}>
            {filteredAndGroupedTurnos.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="calendar-outline" size={48} color="#9ca3af" />
                <Text style={styles.emptyText}>No hay turnos para este período</Text>
              </View>
            ) : (
              filteredAndGroupedTurnos.map(group => (
                <View key={group.label}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupTitle}>{group.label}</Text>
                    <View style={styles.groupBadge}>
                      <Text style={styles.groupBadgeText}>{group.items.length}</Text>
                    </View>
                  </View>

                  {group.items.map((turno: any) => {
                    const fin = calculateTurnoFinancials(turno);

                    return (
                      <Card key={turno.IDturno} style={styles.card}>
                        <View style={styles.cardMain}>
                          <View style={styles.cardLeft}>
                            <View style={styles.dateBox}>
                              <Text style={styles.dateDay}>
                                {new Date(turno.horaEntrada || (turno as any).fecha).getDate()}
                              </Text>
                              <Text style={styles.dateMonth}>
                                {new Date(turno.horaEntrada || (turno as any).fecha).toLocaleString('es-CO', { weekday: 'short' }).toUpperCase()}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.cardCenter}>
                            {turno.usuario?.nombre && (
                              <Text style={styles.userName} numberOfLines={1}>
                                👤 {turno.usuario.nombre}
                              </Text>
                            )}
                            <View style={styles.timeRow}>
                              <Ionicons name="log-in-outline" size={14} color="#4CAF50" />
                              <Text style={styles.timeText}>{formatTime(turno.horaEntrada)}</Text>
                              <Text style={{ color: '#d1d5db', marginHorizontal: 4 }}>|</Text>
                              <Ionicons name="log-out-outline" size={14} color="#ef4444" />
                              <Text style={styles.timeText}>{formatTime(turno.horaSalida)}</Text>
                            </View>
                            {turno.observacion ? (
                              <Text style={styles.obsText} numberOfLines={1}>{turno.observacion}</Text>
                            ) : null}
                          </View>

                          <View style={styles.cardRight}>
                            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(turno.estado) + '15' }]}>
                              <Text style={[styles.statusText, { color: getStatusColor(turno.estado) }]}>
                                {turno.estado}
                              </Text>
                            </View>
                            {(turno.estado === 'COMPLETADO' || turno.estado === 'LIQUIDADO') && (
                              <Text style={styles.cenoText}>Cenó: {turno.ceno ? 'SÍ' : 'NO'}</Text>
                            )}
                          </View>
                        </View>
                        
                        {turno.estado === 'ACTIVO' && (
                          <View style={{ marginTop: 12 }}>
                            <DescansoCard
                              turnoId={turno.IDturno}
                              horaEntrada={turno.horaEntrada || turno.fecha}
                              duracionMinutos={turno.usuario?.cargo?.duracionDescanso || 0}
                              cargo={turno.usuario?.cargo}
                              inicioDescanso={turno.inicioDescanso}
                              finDescanso={turno.finDescanso}
                              onDescansoChange={(updated) => {
                                setTurnos(prev => prev.map(t => t.IDturno === turno.IDturno ? { ...t, ...updated } : t));
                              }}
                            />
                          </View>
                        )}
                        
                        {(turno.estado === 'COMPLETADO' || turno.estado === 'LIQUIDADO') && (
                          <View style={styles.financialContainer}>
                            <View style={styles.financialRow}>
                              <Text style={styles.moneyLabel}>Bruto:</Text>
                              <Text style={styles.moneyValue}>${fin.bruto.toLocaleString('es-CO')}</Text>
                            </View>
                            {fin.descuentosCaja > 0 && (
                              <View style={styles.financialRow}>
                                <Text style={styles.discountLabel}>Dtos Caja:</Text>
                                <Text style={styles.discountValue}>-${fin.descuentosCaja.toLocaleString('es-CO')}</Text>
                              </View>
                            )}
                            {fin.bonosCaja > 0 && (
                              <View style={styles.financialRow}>
                                <Text style={[styles.discountLabel, { color: '#10b981' }]}>Bono / Extra:</Text>
                                <Text style={[styles.discountValue, { color: '#10b981' }]}>+${fin.bonosCaja.toLocaleString('es-CO')}</Text>
                              </View>
                            )}
                            {turno.ceno && fin.costoCena > 0 && (
                              <View style={styles.financialRow}>
                                <Text style={styles.discountLabel}>Cena:</Text>
                                <Text style={styles.discountValue}>-${fin.costoCena.toLocaleString('es-CO')}</Text>
                              </View>
                            )}
                            {fin.descuentosLlegadaTarde > 0 && (
                              <View style={styles.financialRow}>
                                <Text style={styles.discountLabel}>Llegada Tarde:</Text>
                                <Text style={styles.discountValue}>-${fin.descuentosLlegadaTarde.toLocaleString('es-CO')}</Text>
                              </View>
                            )}
                            {fin.descuentosLlegadaTardePendiente > 0 && (
                              <View style={styles.financialRow}>
                                <Text style={[styles.discountLabel, { color: '#f59e0b' }]}>Retraso (P):</Text>
                                <Text style={[styles.discountValue, { color: '#f59e0b' }]}>-${fin.descuentosLlegadaTardePendiente.toLocaleString('es-CO')}</Text>
                              </View>
                            )}
                            <View style={[styles.financialRow, { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8, marginTop: 4 }]}>
                              <Text style={styles.netMoneyLabel}>Neto:</Text>
                              <Text style={styles.netMoneyValue}>${fin.neto.toLocaleString('es-CO')}</Text>
                            </View>
                          </View>
                        )}
                      </Card>
                    );
                  })}
                </View>
              ))
            )}
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      <LiquidacionViewerModal
        visible={!!visorHtml}
        html={visorHtml || ''}
        title="Comprobante de Liquidación"
        showSignButton={visorModoFirma}
        onSign={handleAbrirFirma}
        onClose={() => setVisorHtml(null)}
      />

      <SignatureModal
        visible={showSignatureEmpleado}
        onClose={() => setShowSignatureEmpleado(false)}
        onSave={handleSaveSignature}
        title="Firma del Empleado"
        loading={liquidando}
      />
    </View>
  );
}

const CONCEPTOS_BONO = ['BONO', 'PREMIO', 'HORAS_EXTRAS'];

export function calculateTurnoFinancials(turno: any) {
  const bruto = Number(turno.valorTurno || 0);

  const descuentosCaja = turno.descuentos 
    ? turno.descuentos
        .filter((d: any) => d.concepto !== 'CENA' && d.concepto !== 'LLEGADA_TARDE' && !CONCEPTOS_BONO.includes(d.concepto))
        .reduce((sum: number, d: any) => sum + Number(d.valor || 0), 0) 
    : 0;
    
  const bonosCaja = turno.descuentos
    ? turno.descuentos
        .filter((d: any) => CONCEPTOS_BONO.includes(d.concepto))
        .reduce((sum: number, d: any) => sum + Number(d.valor || 0), 0)
    : 0;
  
  const descuentosCenaBD = turno.descuentos
    ? turno.descuentos
        .filter((d: any) => d.concepto === 'CENA')
        .reduce((sum: number, d: any) => sum + Number(d.valor || 0), 0)
    : 0;

  const descuentosLlegadaTarde = turno.descuentos
    ? turno.descuentos
        .filter((d: any) => d.concepto === 'LLEGADA_TARDE' && d.estado === 'APROBADO')
        .reduce((sum: number, d: any) => sum + Number(d.valor || 0), 0)
    : 0;
  
  const descuentosLlegadaTardePendiente = turno.descuentos
    ? turno.descuentos
        .filter((d: any) => d.concepto === 'LLEGADA_TARDE' && d.estado === 'PENDIENTE')
        .reduce((sum: number, d: any) => sum + Number(d.valor || 0), 0)
    : 0;

  const costoCena = descuentosCenaBD > 0 ? descuentosCenaBD : (turno.ceno ? Number(turno.usuario?.cargo?.descuentoCena || 0) : 0);
  const totalDescuentos = descuentosCaja + costoCena + descuentosLlegadaTarde;
  const neto = bruto - totalDescuentos + bonosCaja;

  return {
    bruto,
    descuentosCaja,
    bonosCaja,
    costoCena,
    descuentosLlegadaTarde,
    descuentosLlegadaTardePendiente,
    totalDescuentos,
    neto,
  };
}

export function getQuincenaKey(fechaStr: string) {
  const d = new Date(fechaStr);
  if (isNaN(d.getTime())) return '0000-00-0';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const q = d.getDate() <= 15 ? '1' : '2';
  return `${year}-${month}-${q}`;
}

export function getQuincenaLabel(fechaStr: string) {
  const d = new Date(fechaStr);
  if (isNaN(d.getTime())) return 'Fecha Desconocida';
  const month = d.toLocaleString('es-CO', { month: 'short' }).replace('.', '');
  const year = d.getFullYear();
  const day = d.getDate();
  const lastDay = new Date(year, d.getMonth() + 1, 0).getDate();
  if (day <= 15) return `1 - 15 ${month.toUpperCase()} ${year}`;
  return `16 - ${lastDay} ${month.toUpperCase()} ${year}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderBottomColor: '#f3f4f6' 
  },
  backBtn: { padding: 8 },
  reloadBtn: { padding: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  
  content: { flex: 1 },

  // Hero Card Styles
  heroCard: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 12,
    borderRadius: 20,
    padding: 16,
    elevation: 4,
    shadowColor: '#064e3b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  heroNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  heroNavLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroNavBtnDisabled: {
    opacity: 0.3,
  },
  heroQuincenaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginHorizontal: 6,
  },
  heroQuincenaText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  heroStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  heroStatusPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  heroStatusPillHistory: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  heroStatusPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroStatusTextActive: {
    color: '#34d399',
  },
  heroStatusTextHistory: {
    color: '#94a3b8',
  },
  heroCenter: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  heroSubheader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  heroCurrencySymbol: {
    fontSize: 22,
    fontWeight: '700',
    color: '#6ee7b7',
    marginRight: 4,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  heroCurrencyCode: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6ee7b7',
    marginLeft: 6,
  },
  heroSubtitle: {
    fontSize: 12,
    color: '#cbd5e1',
    marginTop: 4,
    textAlign: 'center',
  },
  heroChipsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  heroChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  heroChipDiscount: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  heroChipBonus: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  heroChipLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#cbd5e1',
    marginLeft: 3,
  },
  heroChipVal: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },

  // Mini Cards KPI Styles
  miniCardsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  miniCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  miniCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  miniIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  miniCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  miniCardValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 2,
  },
  miniCardSub: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '500',
  },

  // Quincena Banner
  quincenaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quincenaBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  quincenaBannerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  quincenaBannerBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },

  // Search and Filter
  searchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#fff', 
    marginHorizontal: 16, 
    marginBottom: 8, 
    paddingHorizontal: 12, 
    paddingVertical: 10, 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: '#e5e7eb' 
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#000' },
  
  filterScroll: { paddingVertical: 4, marginBottom: 8 },
  pill: { 
    paddingHorizontal: 16, 
    paddingVertical: 8, 
    borderRadius: 20, 
    backgroundColor: '#f3f4f6', 
    marginRight: 8, 
    borderWidth: 1, 
    borderColor: '#e5e7eb' 
  },
  pillActive: { backgroundColor: '#111827', borderColor: '#111827' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
  pillTextActive: { color: '#fff' },
  
  turnsContainer: { paddingHorizontal: 16 },
  
  groupHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 10 },
  groupTitle: { fontSize: 14, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  groupBadge: { marginLeft: 8, backgroundColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  groupBadgeText: { fontSize: 12, fontWeight: '700', color: '#4b5563' },
  
  emptyContainer: { alignItems: 'center', marginTop: 40, paddingVertical: 20 },
  emptyText: { marginTop: 12, fontSize: 15, color: '#6b7280' },
  
  card: { 
    marginBottom: 12, 
    borderRadius: 16, 
    backgroundColor: '#fff', 
    padding: 12, 
    elevation: 2, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.05, 
    shadowRadius: 3 
  },
  cardMain: { flexDirection: 'row', alignItems: 'center' },
  
  cardLeft: { width: 50, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  dateBox: { backgroundColor: '#f3f4f6', borderRadius: 10, padding: 6, alignItems: 'center', width: 46 },
  dateDay: { fontSize: 18, fontWeight: '800', color: '#111827' },
  dateMonth: { fontSize: 10, fontWeight: '700', color: '#6b7280', marginTop: -2 },
  
  cardCenter: { flex: 1, justifyContent: 'center' },
  userName: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeText: { fontSize: 13, fontWeight: '500', color: '#4b5563', marginLeft: 4 },
  obsText: { fontSize: 12, color: '#9ca3af', marginTop: 4, fontStyle: 'italic' },
  
  cardRight: { alignItems: 'flex-end', justifyContent: 'flex-start' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 6 },
  statusText: { fontSize: 10, fontWeight: '800' },
  financialContainer: { marginTop: 12, padding: 12, backgroundColor: '#f9fafb', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  financialRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  moneyLabel: { fontSize: 13, color: '#4b5563' },
  moneyValue: { fontSize: 13, fontWeight: '600', color: '#111827' },
  discountLabel: { fontSize: 13, color: '#ef4444' },
  discountValue: { fontSize: 13, fontWeight: '600', color: '#ef4444' },
  netMoneyLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  netMoneyValue: { fontSize: 15, fontWeight: '800', color: '#10b981' },
  cenoText: { fontSize: 11, color: '#6b7280', marginTop: 8, textAlign: 'right' }
});
