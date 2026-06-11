import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { Text } from '../../components/ui/text';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { getResumenEmpleadoAdmin, liquidarEmpleado, getTurnos } from '../../services/nomina.service';
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

  // Modal states for Historial de Turnos
  const [historyEmpleado, setHistoryEmpleado] = useState<any>(null);
  const [historyTurnos, setHistoryTurnos] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // 1. Cargar usuarios activos y de roles operativos
      const resUsuarios = await api.get('/usuarios');
      const usuariosActivos = (resUsuarios.data?.data || []).filter((u: any) => u.isActive);
      setEmpleados(usuariosActivos);

      // 2. Cargar los turnos de hoy para monitoreo
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const finHoy = new Date();
      finHoy.setHours(23, 59, 59, 999);

      const resTurnos = await getTurnos({ 
        fechaDesde: hoy.toISOString(), 
        fechaHasta: finHoy.toISOString(),
        limit: 100
      });
      setTurnosHoy(resTurnos.data || []);

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

  const handleLiquidar = () => {
    if (!resumen || !resumen.turnosPendientes || resumen.turnosPendientes.length === 0) {
      return showAlert({ type: 'error', title: 'Aviso', message: 'No hay turnos pendientes por liquidar' });
    }

    showAlert({
      type: 'confirm',
      title: 'Liquidar Empleado',
      message: `¿Estás seguro de liquidar a ${selectedEmpleado.nombre} por un total de $${Number(resumen.totalNeto).toLocaleString('es-CO')}?`,
      confirmText: 'Liquidar',
      onConfirm: async () => {
        try {
          setLiquidando(true);
          const fechas = resumen.turnosPendientes.map((t: any) => new Date(t.fechaContable).getTime());
          const minDate = new Date(Math.min(...fechas)).toISOString();
          const maxDate = new Date(Math.max(...fechas)).toISOString();

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

  const getStatusTurnoHoy = (usuarioId: string) => {
    const turno = turnosHoy.find(t => t.usuarioId === usuarioId);
    if (!turno) return { text: 'No ha iniciado turno hoy', color: '#ef4444', icon: 'close-circle' };
    if (turno.estado === 'ACTIVO') return { 
      text: `En turno (Inició ${new Date(turno.horaEntrada).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'})})`, 
      color: '#10b981', 
      icon: 'checkmark-circle' 
    };
    return { text: 'Turno cerrado hoy', color: '#6b7280', icon: 'time' };
  };

  // Filtrado de empleados
  const empleadosFiltrados = empleados.filter(emp => {
    if (filterTab === 'Todos') return true;
    const turno = turnosHoy.find(t => t.usuarioId === emp.IDusuarios);
    return turno?.estado === 'ACTIVO';
  });

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
        <TouchableOpacity 
          style={[styles.tabBtn, filterTab === 'Todos' && styles.tabBtnActive]} 
          onPress={() => setFilterTab('Todos')}
        >
          <Text style={[styles.tabBtnText, filterTab === 'Todos' && styles.tabBtnTextActive]}>Todos</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabBtn, filterTab === 'Activos' && styles.tabBtnActive]} 
          onPress={() => setFilterTab('Activos')}
        >
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

      {/* Modal Resumen (Sin cambios lógicos) */}
      <Modal visible={!!selectedEmpleado} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {loadingResumen ? (
              <ActivityIndicator size="large" color="#4CAF50" style={{ margin: 40 }} />
            ) : (
              resumen && (
                <>
                  <Text style={styles.modalTitle}>Resumen de Pagos</Text>
                  <Text style={styles.modalSubtitle}>{selectedEmpleado?.nombre}</Text>
                  
                  <ScrollView style={{ maxHeight: 400, marginVertical: 16 }}>
                    <View style={styles.summaryBox}>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Total Turnos (Bruto):</Text>
                        <Text style={styles.summaryValue}>${Number(resumen.totalBruto).toLocaleString('es-CO')}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Total Descuentos:</Text>
                        <Text style={[styles.summaryValue, { color: '#ef4444' }]}>-${Number(resumen.totalDescuentos).toLocaleString('es-CO')}</Text>
                      </View>
                      <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8, marginTop: 8 }]}>
                        <Text style={[styles.summaryLabel, { fontWeight: '700' }]}>Total Neto a Pagar:</Text>
                        <Text style={[styles.summaryValue, { color: '#10b981', fontSize: 18 }]}>${Number(resumen.totalNeto).toLocaleString('es-CO')}</Text>
                      </View>
                    </View>

                    <Text style={{ fontWeight: '700', marginVertical: 8 }}>Desglose de Turnos ({resumen.turnosPendientes?.length || 0})</Text>
                    {resumen.turnosPendientes?.map((t: any) => (
                      <View key={t.IDturno} style={styles.itemRow}>
                        <Text style={{ flex: 1, fontSize: 13 }}>
                          {new Date(t.fechaContable).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                        </Text>
                        <Text style={{ fontSize: 13, color: '#10b981', fontWeight: '600' }}>
                          ${Number(t.valorTurno).toLocaleString('es-CO')}
                        </Text>
                      </View>
                    ))}

                    <Text style={{ fontWeight: '700', marginTop: 16, marginBottom: 8 }}>Descuentos No Vistos ({resumen.descuentosPendientes?.length || 0})</Text>
                    {resumen.descuentosPendientes?.map((d: any) => (
                      <View key={d.IDdescuento} style={styles.itemRow}>
                        <Text style={{ flex: 1, fontSize: 13 }}>{d.concepto}</Text>
                        <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '600' }}>
                          -${Number(d.valor).toLocaleString('es-CO')}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>

                  <View style={styles.modalActions}>
                    <Button style={{ flex: 1, marginRight: 8, backgroundColor: '#f3f4f6' }} onPress={() => setSelectedEmpleado(null)} disabled={liquidando}>
                      <Text style={{ color: '#111827' }}>Cerrar</Text>
                    </Button>
                    <Button style={{ flex: 1, backgroundColor: '#4CAF50' }} onPress={handleLiquidar} isLoading={liquidando}>
                      <Text style={{ color: '#fff' }}>Liquidar Ahora</Text>
                    </Button>
                  </View>
                </>
              )
            )}
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
                  historyTurnos.map(turno => (
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
                        <Text style={styles.historyFooterText}>
                          {turno.ceno ? '🍔 Cenó' : '❌ No cenó'}
                        </Text>
                        <Text style={styles.historyFooterValue}>
                          ${Number(turno.valorTurno || 0).toLocaleString('es-CO')}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

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

  // History Card Styles
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
  historyFooterValue: { fontSize: 14, fontWeight: '700', color: '#10b981' }
});
