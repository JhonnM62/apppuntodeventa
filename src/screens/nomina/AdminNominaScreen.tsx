import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Switch, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Text } from '../../components/ui/text';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { getResumenEmpleadoAdmin, liquidarEmpleado, getTurnos, updateTurnoAdmin, deleteTurno } from '../../services/nomina.service';
import { useCustomAlert } from '../../context/CustomAlertContext';

export default function AdminNominaScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { showAlert } = useCustomAlert();
  
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [turnosHoy, setTurnosHoy] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'Todos' | 'Activos'>('Todos');
  
  // Modal states for Liquidación / Resumen
  const [selectedEmpleado, setSelectedEmpleado] = useState<any>(null);
  const [resumen, setResumen] = useState<any>(null);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [liquidando, setLiquidando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);

  // Modal states for Historial de Turnos
  const [historyEmpleado, setHistoryEmpleado] = useState<any>(null);
  const [historyTurnos, setHistoryTurnos] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Edit Turno State
  const [editingTurno, setEditingTurno] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [savingTurno, setSavingTurno] = useState(false);
  
  // Date Picker State
  const [pickerConfig, setPickerConfig] = useState<{show: boolean, mode: 'date'|'time', field: 'horaEntrada'|'horaSalida'}>({show: false, mode: 'date', field: 'horaEntrada'});

  // Llegadas Tarde State
  const [showLlegadasModal, setShowLlegadasModal] = useState(false);
  const [selectedLlegadas, setSelectedLlegadas] = useState<string[]>([]);
  const [aplicandoLlegadas, setAplicandoLlegadas] = useState(false);


  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const resUsuarios = await api.get('/usuarios');
      const usuariosActivos = (resUsuarios.data?.data || []).filter((u: any) => u.isActive);
      setEmpleados(usuariosActivos);

      // Usar lógica manual de UTC-5 (Colombia) para evitar problemas de Intl en Android/Hermes
      const now = new Date();
      // Hora actual en Colombia (restando 5 horas al UTC actual)
      const colombiaTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));
      
      const y = colombiaTime.getUTCFullYear();
      const m = colombiaTime.getUTCMonth();
      const d = colombiaTime.getUTCDate();

      // Convertir de vuelta a UTC para la query
      const offsetMs = 5 * 60 * 60 * 1000;
      const hoyUTC = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
      const finHoyUTC = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));

      const resTurnos = await getTurnos({ 
        fechaDesde: hoyUTC.toISOString(), 
        fechaHasta: finHoyUTC.toISOString(),
        limit: 100
      });
      
      // Obtener también todos los turnos activos sin importar la fecha
      // (por si un turno inició ayer pero sigue activo cruzando la medianoche)
      const resActivos = await getTurnos({
        estado: 'ACTIVO',
        limit: 100
      });

      const combined = [...(resTurnos.data || []), ...(resActivos.data || [])];
      // Eliminar duplicados por IDturno
      const uniqueTurnos = Array.from(new Map(combined.map(t => [t.IDturno, t])).values());

      setTurnosHoy(uniqueTurnos);

    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudieron cargar los datos' });
    } finally {
      setLoading(false);
    }
  };

  const openResumen = async (empleado: any) => {
    setSelectedEmpleado(empleado);
    try {
      setLoadingResumen(true);
      const res = await getResumenEmpleadoAdmin(empleado.IDusuarios);
      setResumen(res.data);
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudo cargar el resumen del empleado' });
      setSelectedEmpleado(null);
    } finally {
      setLoadingResumen(false);
    }
  };

  const openHistory = async (empleado: any) => {
    setHistoryEmpleado(empleado);
    try {
      setLoadingHistory(true);
      const res = await getTurnos({ usuarioId: empleado.IDusuarios, limit: 30 });
      setHistoryTurnos(res.data || []);
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudo cargar el historial de turnos' });
      setHistoryEmpleado(null);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleDeleteTurno = (turno: any) => {
    showAlert({
      type: 'confirm',
      title: 'Eliminar Turno',
      message: '¿Estás seguro de que quieres eliminar este turno permanentemente?',
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          await deleteTurno(turno.IDturno);
          showAlert({ type: 'success', title: 'Éxito', message: 'Turno eliminado' });
          if (historyEmpleado) openHistory(historyEmpleado);
          loadData(); // Reload main stats too
        } catch (error) {
          showAlert({ type: 'error', title: 'Error', message: 'No se pudo eliminar el turno' });
        }
      }
    });
  };

  const handleEditTurno = (turno: any) => {
    setEditingTurno(turno);
    setEditForm({
      estado: turno.estado,
      horaEntrada: new Date(turno.horaEntrada).toISOString(),
      horaSalida: turno.horaSalida ? new Date(turno.horaSalida).toISOString() : '',
      ceno: !!turno.ceno,
      valorTurno: turno.valorTurno?.toString() || '0'
    });
  };

  const handleSaveTurno = async () => {
    try {
      setSavingTurno(true);

      const payload: any = {
        estado: editForm.estado,
        ceno: editForm.ceno,
        valorTurno: Number(editForm.valorTurno),
        // El backend espera strings ISO, no objetos Date
        horaEntrada: editForm.horaEntrada
          ? new Date(editForm.horaEntrada).toISOString()
          : undefined,
        horaSalida: editForm.horaSalida
          ? new Date(editForm.horaSalida).toISOString()
          : undefined,
      };
      // Eliminar campos undefined para no enviar propiedades vacías
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      await updateTurnoAdmin(editingTurno.IDturno, payload);
      showAlert({ type: 'success', title: 'Éxito', message: 'Turno actualizado correctamente' });
      setEditingTurno(null);
      if (historyEmpleado) openHistory(historyEmpleado);
      loadData();
    } catch (error: any) {
      console.error(error);
      const msg = error?.response?.data?.message || 'No se pudo guardar el turno';
      showAlert({ type: 'error', title: 'Error', message: Array.isArray(msg) ? msg[0] : msg });
    } finally {
      setSavingTurno(false);
    }
  };

  
  const handleOpenLlegadas = () => {
    const pendientes = (resumen?.descuentos || []).filter((d: any) => d.concepto === 'LLEGADA_TARDE' && d.estado === 'PENDIENTE');
    setSelectedLlegadas(pendientes.map((d: any) => d.IDdescuento));
    setShowLlegadasModal(true);
  };

  const handleAplicarLlegadas = async () => {
    if (selectedLlegadas.length === 0) {
      return showAlert({ type: 'error', title: 'Aviso', message: 'Selecciona al menos una llegada tarde para aplicar' });
    }
    try {
      setAplicandoLlegadas(true);
      await api.post('/nomina/llegadas-tarde/aplicar', { descuentoIds: selectedLlegadas });
      showAlert({ type: 'success', title: 'Éxito', message: 'Descuentos aplicados correctamente' });
      setShowLlegadasModal(false);
      if (selectedEmpleado) openResumen(selectedEmpleado);
      loadData();
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudieron aplicar los descuentos' });
    } finally {
      setAplicandoLlegadas(false);
    }
  };

  const handleLiquidar = () => {
    const hasTurnos = resumen?.turnos && resumen.turnos.length > 0;
    const hasDescuentos = resumen?.descuentos && resumen.descuentos.length > 0;

    if (!hasTurnos && !hasDescuentos) {
      return showAlert({ type: 'error', title: 'Aviso', message: 'No hay turnos ni descuentos pendientes por liquidar' });
    }

    showAlert({
      type: 'confirm',
      title: 'Liquidar Empleado',
      message: `¿Estás seguro de liquidar a ${selectedEmpleado.nombre} por un total de $${Number(resumen.totalNeto).toLocaleString('es-CO')}?`,
      confirmText: 'Liquidar',
      onConfirm: async () => {
        try {
          setLiquidando(true);
          let minDate, maxDate;
          
          if (hasTurnos) {
            const fechas = resumen.turnos.map((t: any) => new Date(t.fecha).getTime());
            minDate = new Date(Math.min(...fechas)).toISOString();
            maxDate = new Date(Math.max(...fechas)).toISOString();
          } else {
            const fechas = resumen.descuentos.map((d: any) => new Date(d.fecha).getTime());
            minDate = new Date(Math.min(...fechas)).toISOString();
            maxDate = new Date(Math.max(...fechas)).toISOString();
          }

          await liquidarEmpleado({
            usuarioId: selectedEmpleado.IDusuarios,
            fechaDesde: minDate,
            fechaHasta: maxDate
          });
          
          showAlert({ type: 'success', title: 'Éxito', message: 'Liquidación generada correctamente' });
          setSelectedEmpleado(null);
        } catch (error) {
          console.error(error);
          showAlert({ type: 'error', title: 'Error', message: 'No se pudo generar la liquidación' });
        } finally {
          setLiquidando(false);
        }
      }
    });
  };

  const handleRecalcular = async () => {
    try {
      setRecalculando(true);
      const res = await api.post(`/nomina/recalcular/${selectedEmpleado.IDusuarios}`);
      showAlert({ type: 'success', title: 'Éxito', message: res.data?.mensaje || 'Turnos recalculados' });
      // Reload resumen automatically
      const resUpdated = await getResumenEmpleadoAdmin(selectedEmpleado.IDusuarios);
      setResumen(resUpdated.data);
    } catch (error: any) {
      console.error(error);
      const msg = error?.response?.data?.message || 'Error al recalcular turnos';
      showAlert({ type: 'error', title: 'Error', message: Array.isArray(msg) ? msg[0] : msg });
    } finally {
      setRecalculando(false);
    }
  };

  const getStatusTurnoHoy = (usuarioId: string) => {
    // Primero, si hay un turno activo, ese es el estado actual
    const turnoActivo = turnosHoy.find(t => t.usuarioId === usuarioId && t.estado === 'ACTIVO');
    if (turnoActivo) {
      return { 
        text: `En turno (Inició ${new Date(turnoActivo.horaEntrada).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'})})`, 
        color: '#10b981', 
        icon: 'checkmark-circle' 
      };
    }

    // Si no hay activo, buscamos un turno cerrado que realmente haya iniciado HOY (hora Colombia)
    const turnoCerradoHoy = turnosHoy.find(t => {
      if (t.usuarioId !== usuarioId || t.estado === 'ACTIVO') return false;
      const entrada = new Date(t.horaEntrada);
      // Hora de entrada en Colombia
      const colombiaTime = new Date(entrada.getTime() - (5 * 60 * 60 * 1000));
      const today = new Date();
      const todayColombia = new Date(today.getTime() - (5 * 60 * 60 * 1000));
      return colombiaTime.getUTCFullYear() === todayColombia.getUTCFullYear() &&
             colombiaTime.getUTCMonth() === todayColombia.getUTCMonth() &&
             colombiaTime.getUTCDate() === todayColombia.getUTCDate();
    });

    if (turnoCerradoHoy) {
      return { text: 'Turno cerrado hoy', color: '#6b7280', icon: 'time' };
    }

    return { text: 'No ha iniciado turno hoy', color: '#ef4444', icon: 'close-circle' };
  };

  const empleadosFiltrados = empleados.filter(emp => {
    if (filterTab === 'Todos') return true;
    return turnosHoy.some(t => t.usuarioId === emp.IDusuarios && t.estado === 'ACTIVO');
  });

  const handleValorChange = (text: string) => {
    const numeric = text.replace(/\D/g, '');
    setEditForm({ ...editForm, valorTurno: numeric });
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setPickerConfig({ ...pickerConfig, show: false });
      return;
    }
    if (selectedDate) {
      const field = pickerConfig.field;
      const currentVal = editForm[field] ? new Date(editForm[field]) : new Date();
      
      if (pickerConfig.mode === 'date') {
        currentVal.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        setEditForm({ ...editForm, [field]: currentVal.toISOString() });
        // Automatically open time picker for Android
        if (Platform.OS === 'android') {
          setPickerConfig({ show: true, mode: 'time', field });
        } else {
          setPickerConfig({ ...pickerConfig, show: false });
        }
      } else {
        currentVal.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
        setEditForm({ ...editForm, [field]: currentVal.toISOString() });
        setPickerConfig({ ...pickerConfig, show: false });
      }
    }
  };

  const openPicker = (field: 'horaEntrada'|'horaSalida') => {
    setPickerConfig({ show: true, mode: 'date', field });
  };

  const formatPrettyDate = (isoString?: string) => {
    if (!isoString) return 'No seleccionada';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Fecha inválida';
    return d.toLocaleString('es-CO', { 
      year: 'numeric', month: 'short', day: '2-digit', 
      hour: '2-digit', minute: '2-digit', hour12: true 
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Nómina y Asistencia</Text>
        <TouchableOpacity 
          onPress={() => navigation.navigate('RepartoDescuentos')} 
          style={styles.headerActionBtn}
        >
          <Ionicons name="cash-outline" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tabBtn, filterTab === 'Todos' && styles.tabBtnActive]} onPress={() => setFilterTab('Todos')}>
          <Text style={[styles.tabBtnText, filterTab === 'Todos' && styles.tabBtnTextActive]}>Todos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, filterTab === 'Activos' && styles.tabBtnActive]} onPress={() => setFilterTab('Activos')}>
          <Text style={[styles.tabBtnText, filterTab === 'Activos' && styles.tabBtnTextActive]}>Turnos Activos</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.content}>
          {empleadosFiltrados.length === 0 ? (
            <Text style={{ textAlign: 'center', marginTop: 40, color: '#6b7280' }}>No hay empleados en esta lista.</Text>
          ) : (
            empleadosFiltrados.map((empleado) => {
              const status = getStatusTurnoHoy(empleado.IDusuarios);
              return (
                <Card key={empleado.IDusuarios} style={styles.card}>
                  <TouchableOpacity style={styles.cardInfo} onPress={() => openHistory(empleado)} activeOpacity={0.7}>
                    <Text style={styles.cardTitle}>{empleado.nombre}</Text>
                    <Text style={styles.cardSubtitle}>{empleado.rol} • {empleado.cargo?.nombre || 'Sin cargo asignado'}</Text>
                    
                    <View style={styles.statusBadge}>
                      <Ionicons name={status.icon as any} size={14} color={status.color} />
                      <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
                    </View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openResumen(empleado)}>
                    <Text style={styles.actionBtnText}>Ver Resumen</Text>
                    <Ionicons name="chevron-forward" size={16} color="#3b82f6" />
                  </TouchableOpacity>
                </Card>
              );
            })
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* Modal Resumen */}
      <Modal visible={!!selectedEmpleado} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {loadingResumen ? (
              <ActivityIndicator size="large" color="#4CAF50" style={{ margin: 40 }} />
            ) : (
              resumen && (() => {
                const descuentosAgrupados = resumen?.descuentos?.reduce((acc: any, d: any) => {
                  const concepto = d.concepto || 'OTRO';
                  if (!acc[concepto]) acc[concepto] = { count: 0, total: 0 };
                  acc[concepto].count += 1;
                  acc[concepto].total += Number(d.valor);
                  return acc;
                }, {});

                return (
                  <>
                    <Text style={styles.modalTitle}>Resumen de Pagos</Text>
                  <Text style={styles.modalSubtitle}>{selectedEmpleado?.nombre}</Text>
                  
                  <ScrollView style={{ maxHeight: 400, marginVertical: 16 }}>
                    <View style={styles.summaryBox}>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Total Turnos (Bruto):</Text>
                        <Text style={styles.summaryValue}>${Number(resumen.totalBruto).toLocaleString('es-CO')}</Text>
                      </View>
                      
                      {Object.keys(descuentosAgrupados || {}).length > 0 && (
                        <View style={{ marginTop: 8, marginBottom: 4, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: '#fca5a5' }}>
                          {Object.entries(descuentosAgrupados).map(([concepto, data]: any) => {
                            const label = concepto === 'CENA' 
                              ? `${data.count} ${data.count === 1 ? 'CENA' : 'CENAS'}`
                              : `${data.count} ${data.count === 1 ? 'vez' : 'veces'} - ${concepto.replace(/_/g, ' ')}`;
                            return (
                              <View key={concepto} style={[styles.summaryRow, { marginBottom: 4 }]}>
                                <Text style={{ fontSize: 13, color: '#6b7280' }}>↳ {label}</Text>
                                <Text style={{ fontSize: 13, color: '#ef4444' }}>-${data.total.toLocaleString('es-CO')}</Text>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      <View style={[styles.summaryRow, { marginTop: 8 }]}>
                        <Text style={styles.summaryLabel}>Total Descuentos:</Text>
                        <Text style={[styles.summaryValue, { color: '#ef4444' }]}>-${Number(resumen.totalDescuentos).toLocaleString('es-CO')}</Text>
                      </View>
                      <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8, marginTop: 8 }]}>
                        <Text style={[styles.summaryLabel, { fontWeight: '700' }]}>Total Neto a Pagar:</Text>
                        <Text style={[styles.summaryValue, { color: '#10b981', fontSize: 18 }]}>${Number(resumen.totalNeto).toLocaleString('es-CO')}</Text>
                      </View>
                    </View>

                    <Text style={{ fontWeight: '700', marginVertical: 8 }}>Desglose de Turnos ({resumen.turnos?.length || 0})</Text>
                    {resumen.turnos?.map((t: any) => (
                      <View key={t.IDturno} style={styles.itemRow}>
                        <Text style={{ flex: 1, fontSize: 13 }}>
                          {new Date(t.fecha).toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' })}
                        </Text>
                        <Text style={{ flex: 1, fontSize: 13, textAlign: 'center' }}>
                          {t.horaEntrada ? new Date(t.horaEntrada).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </Text>
                        <Text style={{ flex: 1, fontSize: 13, textAlign: 'right', color: '#10b981', fontWeight: '600' }}>
                          ${Number(t.valorTurno).toLocaleString('es-CO')}
                        </Text>
                      </View>
                    ))}

                    <Text style={{ fontWeight: '700', marginTop: 16, marginBottom: 8 }}>Descuentos ({resumen.descuentos?.length || 0})</Text>
                    {resumen.descuentos?.map((d: any) => (
                      <View key={d.IDdescuento} style={styles.itemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13 }}>{d.concepto}</Text>
                          {d.fecha && (
                            <Text style={{ fontSize: 11, color: '#6b7280', textTransform: 'capitalize' }}>
                              {new Date(d.fecha).toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' })}
                            </Text>
                          )}
                        </View>
                        <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '600' }}>
                          -${Number(d.valor).toLocaleString('es-CO')}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>

                  
                    { (resumen.descuentos || []).some((d: any) => d.concepto === 'LLEGADA_TARDE' && d.estado === 'PENDIENTE') && (
                      <Button style={{ marginBottom: 12, backgroundColor: '#f97316' }} onPress={handleOpenLlegadas}>
                        <Text style={{ color: '#fff', fontSize: 14 }}>Evaluar Llegadas Tarde Pendientes</Text>
                      </Button>
                    )}
                  <View style={styles.modalActions}>
                    <Button style={{ flex: 1, marginRight: 8, backgroundColor: '#f3f4f6' }} onPress={() => setSelectedEmpleado(null)} disabled={liquidando || recalculando}>
                      <Text style={{ color: '#111827' }}>Cerrar</Text>
                    </Button>
                    <Button style={{ flex: 1, marginRight: 8, backgroundColor: '#eab308' }} onPress={handleRecalcular} loading={recalculando} disabled={liquidando}>
                      <Text style={{ color: '#fff', fontSize: 13 }}>Recalcular</Text>
                    </Button>
                    <Button style={{ flex: 1, backgroundColor: '#4CAF50' }} onPress={handleLiquidar} loading={liquidando} disabled={recalculando}>
                      <Text style={{ color: '#fff', fontSize: 13 }}>Liquidar</Text>
                    </Button>
                  </View>
                </>
              );
            })()
          )}
          </View>
        </View>
      </Modal>

      
      {/* Modal Llegadas Tarde */}
      <Modal visible={showLlegadasModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Llegadas Tarde Pendientes</Text>
            <Text style={styles.modalSubtitle}>Selecciona cuáles deseas cobrar en esta liquidación</Text>
            
            <ScrollView style={{ maxHeight: 300, marginBottom: 16 }}>
              {(resumen?.descuentos || []).filter((d: any) => d.concepto === 'LLEGADA_TARDE' && d.estado === 'PENDIENTE').map((d: any) => (
                <TouchableOpacity 
                  key={d.IDdescuento} 
                  style={[styles.itemRow, { alignItems: 'center', backgroundColor: selectedLlegadas.includes(d.IDdescuento) ? '#f3f4f6' : '#fff', paddingHorizontal: 8, borderRadius: 8 }]}
                  onPress={() => {
                    if (selectedLlegadas.includes(d.IDdescuento)) {
                      setSelectedLlegadas(selectedLlegadas.filter(id => id !== d.IDdescuento));
                    } else {
                      setSelectedLlegadas([...selectedLlegadas, d.IDdescuento]);
                    }
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '500' }}>{new Date(d.fecha).toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' })}</Text>
                    <Text style={{ fontSize: 11, color: '#6b7280' }}>{d.descripcion}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '600', marginRight: 12 }}>
                      -${Number(d.valor).toLocaleString('es-CO')}
                    </Text>
                    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: selectedLlegadas.includes(d.IDdescuento) ? '#10b981' : '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: selectedLlegadas.includes(d.IDdescuento) ? '#10b981' : 'transparent' }}>
                      {selectedLlegadas.includes(d.IDdescuento) && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button style={{ flex: 1, marginRight: 8, backgroundColor: '#f3f4f6' }} onPress={() => setShowLlegadasModal(false)} disabled={aplicandoLlegadas}>
                <Text style={{ color: '#111827' }}>Cancelar</Text>
              </Button>
              <Button style={{ flex: 1, backgroundColor: '#10b981' }} onPress={handleAplicarLlegadas} loading={aplicandoLlegadas}>
                <Text style={{ color: '#fff', fontSize: 13 }}>Aplicar ({selectedLlegadas.length})</Text>
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Historial de Turnos */}
      <Modal visible={!!historyEmpleado} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <Text style={styles.modalTitle}>Historial de Turnos</Text>
                <Text style={styles.modalSubtitle}>{historyEmpleado?.nombre}</Text>
              </View>
              <TouchableOpacity onPress={() => setHistoryEmpleado(null)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {loadingHistory ? (
              <ActivityIndicator size="large" color="#4CAF50" style={{ margin: 40 }} />
            ) : (
              <ScrollView style={{ flex: 1 }}>
                {historyTurnos.length === 0 ? (
                  <Text style={{ textAlign: 'center', marginTop: 20, color: '#6b7280' }}>No hay turnos registrados</Text>
                ) : (
                  historyTurnos.sort((a, b) => new Date(b.horaEntrada).getTime() - new Date(a.horaEntrada).getTime()).map(turno => (
                    <View key={turno.IDturno} style={styles.historyCard}>
                      <View style={styles.historyHeader}>
                        <Text style={styles.historyDate}>
                          {new Date(turno.horaEntrada).toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' })}
                        </Text>
                        <View style={[styles.statusTag, { backgroundColor: turno.estado === 'ACTIVO' ? '#dcfce7' : '#f3f4f6' }]}>
                          <Text style={[styles.statusTagText, { color: turno.estado === 'ACTIVO' ? '#16a34a' : '#6b7280' }]}>
                            {turno.estado}
                          </Text>
                        </View>
                      </View>
                      
                      <View style={styles.historyDetails}>
                        <View style={styles.timeBox}>
                          <Text style={styles.timeLabel}>Entrada</Text>
                          <Text style={styles.timeValue}>{new Date(turno.horaEntrada).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'})}</Text>
                        </View>
                        <Ionicons name="arrow-forward" size={16} color="#9ca3af" />
                        <View style={styles.timeBox}>
                          <Text style={styles.timeLabel}>Salida</Text>
                          <Text style={styles.timeValue}>{turno.horaSalida ? new Date(turno.horaSalida).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'}) : '--:--'}</Text>
                        </View>
                      </View>

                      <View style={styles.historyFooter}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.historyFooterText}>
                            {turno.ceno ? '🍔 Cenó' : '❌ No cenó'}
                          </Text>
                          <Text style={[styles.historyFooterValue, { marginLeft: 12 }]}>
                            ${Number(turno.valorTurno || 0).toLocaleString('es-CO')}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row' }}>
                          <TouchableOpacity style={styles.iconBtn} onPress={() => handleEditTurno(turno)}>
                            <Ionicons name="pencil" size={18} color="#3b82f6" />
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.iconBtn, { marginLeft: 8 }]} onPress={() => handleDeleteTurno(turno)}>
                            <Ionicons name="trash" size={18} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal Editar Turno */}
      <Modal visible={!!editingTurno} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={styles.modalTitle}>Editar Turno</Text>
              <TouchableOpacity onPress={() => setEditingTurno(null)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Estado del turno</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {['ACTIVO', 'COMPLETADO', 'LIQUIDADO', 'ANULADO'].map(est => (
                    <TouchableOpacity 
                      key={est}
                      style={[styles.statusChip, editForm.estado === est && styles.statusChipActive]}
                      onPress={() => setEditForm({...editForm, estado: est})}
                    >
                      <Text style={[styles.statusChipText, editForm.estado === est && styles.statusChipTextActive]}>{est}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Entrada</Text>
                {Platform.OS === 'web' ? (
                  React.createElement('input', {
                    type: 'datetime-local',
                    value: editForm.horaEntrada ? new Date(new Date(editForm.horaEntrada).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
                    onChange: (e: any) => {
                      if (e.target.value) {
                        setEditForm({...editForm, horaEntrada: new Date(e.target.value).toISOString()});
                      }
                    },
                    style: { padding: '12px', backgroundColor: '#f9fafb', borderWidth: '1px', borderColor: '#e5e7eb', borderRadius: '8px', fontSize: '16px', width: '100%', fontFamily: 'inherit' }
                  })
                ) : (
                  <TouchableOpacity style={styles.datePickerBtn} onPress={() => openPicker('horaEntrada')}>
                    <Ionicons name="calendar-outline" size={18} color="#4b5563" style={{ marginRight: 8 }} />
                    <Text style={styles.datePickerText}>{formatPrettyDate(editForm.horaEntrada)}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Salida</Text>
                {Platform.OS === 'web' ? (
                  React.createElement('input', {
                    type: 'datetime-local',
                    value: editForm.horaSalida ? new Date(new Date(editForm.horaSalida).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
                    onChange: (e: any) => {
                      if (e.target.value) {
                        setEditForm({...editForm, horaSalida: new Date(e.target.value).toISOString()});
                      }
                    },
                    style: { padding: '12px', backgroundColor: '#f9fafb', borderWidth: '1px', borderColor: '#e5e7eb', borderRadius: '8px', fontSize: '16px', width: '100%', fontFamily: 'inherit' }
                  })
                ) : (
                  <TouchableOpacity style={styles.datePickerBtn} onPress={() => openPicker('horaSalida')}>
                    <Ionicons name="calendar-outline" size={18} color="#4b5563" style={{ marginRight: 8 }} />
                    <Text style={styles.datePickerText}>{formatPrettyDate(editForm.horaSalida)}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Valor del Turno ($)</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.valorTurno ? Number(editForm.valorTurno).toLocaleString('es-CO') : ''}
                  onChangeText={handleValorChange}
                  keyboardType="numeric"
                  placeholder="Ej. 60.000"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>¿Cenó?</Text>
                <View style={{ flexDirection: 'row', marginTop: 4 }}>
                  <TouchableOpacity 
                    style={[styles.cenoBtn, editForm.ceno === true && styles.cenoBtnActive]}
                    onPress={() => setEditForm({...editForm, ceno: true})}
                  >
                    <Text style={[styles.cenoBtnText, editForm.ceno === true && styles.cenoBtnTextActive]}>Sí</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.cenoBtn, editForm.ceno === false && styles.cenoBtnActiveError]}
                    onPress={() => setEditForm({...editForm, ceno: false})}
                  >
                    <Text style={[styles.cenoBtnText, editForm.ceno === false && styles.cenoBtnTextActiveError]}>No</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Button style={{ flex: 1, marginRight: 8, backgroundColor: '#f3f4f6' }} onPress={() => setEditingTurno(null)} disabled={savingTurno}>
                <Text style={{ color: '#111827' }}>Cancelar</Text>
              </Button>
              <Button style={{ flex: 1, backgroundColor: '#3b82f6' }} onPress={handleSaveTurno} loading={savingTurno}>
                <Text style={{ color: '#fff' }}>Guardar</Text>
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {pickerConfig.show && (
        <DateTimePicker
          value={editForm[pickerConfig.field] ? new Date(editForm[pickerConfig.field]) : new Date()}
          mode={pickerConfig.mode}
          is24Hour={false}
          display="default"
          onChange={handleDateChange}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn: { padding: 8 },
  headerActionBtn: { padding: 8, backgroundColor: '#eff6ff', borderRadius: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  
  tabContainer: { flexDirection: 'row', padding: 16, paddingBottom: 0 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: '#3b82f6' },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  tabBtnTextActive: { color: '#3b82f6' },

  content: { padding: 16 },
  
  card: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 12, elevation: 1 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 },
  cardSubtitle: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  
  statusBadge: { flexDirection: 'row', alignItems: 'center' },
  statusText: { fontSize: 12, marginLeft: 4, fontWeight: '500' },

  actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginLeft: 8 },
  actionBtnText: { color: '#3b82f6', fontWeight: '600', marginRight: 4, fontSize: 13 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', backgroundColor: '#fff', borderRadius: 16, padding: 24, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  modalSubtitle: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  
  summaryBox: { backgroundColor: '#f9fafb', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  summaryLabel: { fontSize: 14, color: '#374151' },
  summaryValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },

  historyCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 12 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  historyDate: { fontSize: 14, fontWeight: '700', color: '#374151', textTransform: 'capitalize' },
  statusTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusTagText: { fontSize: 11, fontWeight: '700' },
  historyDetails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb', padding: 12, borderRadius: 8, marginBottom: 12 },
  timeBox: { alignItems: 'center' },
  timeLabel: { fontSize: 11, color: '#6b7280', marginBottom: 2 },
  timeValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  historyFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 8 },
  historyFooterText: { fontSize: 12, color: '#4b5563', fontWeight: '500' },
  historyFooterValue: { fontSize: 14, fontWeight: '700', color: '#10b981' },
  
  iconBtn: { padding: 6, backgroundColor: '#f3f4f6', borderRadius: 6 },
  
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 14, color: '#111827' },
  
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12 },
  datePickerText: { fontSize: 16, color: '#111827' },
  
  cenoBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 8, marginHorizontal: 4, borderWidth: 1, borderColor: '#e5e7eb' },
  cenoBtnActive: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  cenoBtnActiveError: { backgroundColor: '#fef2f2', borderColor: '#ef4444' },
  cenoBtnText: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  cenoBtnTextActive: { color: '#047857' },
  cenoBtnTextActiveError: { color: '#b91c1c' },
  
  statusChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f3f4f6', marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  statusChipActive: { backgroundColor: '#111827', borderColor: '#111827' },
  statusChipText: { fontSize: 12, fontWeight: '600', color: '#4b5563' },
  statusChipTextActive: { color: '#fff' }
});
