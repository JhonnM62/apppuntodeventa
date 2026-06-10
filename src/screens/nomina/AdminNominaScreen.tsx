import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { Text } from '../../components/ui/text';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { getResumenEmpleadoAdmin, liquidarEmpleado } from '../../services/nomina.service';
import { useCustomAlert } from '../../context/CustomAlertContext';

export default function AdminNominaScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { showAlert } = useCustomAlert();
  
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [selectedEmpleado, setSelectedEmpleado] = useState<any>(null);
  const [resumen, setResumen] = useState<any>(null);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [liquidando, setLiquidando] = useState(false);

  useEffect(() => {
    loadEmpleados();
  }, []);

  const loadEmpleados = async () => {
    try {
      setLoading(true);
      // Solo cargar usuarios activos y de roles operativos
      const res = await api.get('/usuarios');
      // Filtramos para ignorar algunos si es necesario, o mostramos todos los activos
      setEmpleados((res.data?.data || []).filter((u: any) => u.isActive));
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudieron cargar los empleados' });
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
          // Por defecto liquidamos todo el periodo disponible
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Nómina y Pagos</Text>
        <TouchableOpacity 
          onPress={() => navigation.navigate('RepartoDescuentos')} 
          style={styles.headerActionBtn}
        >
          <Ionicons name="cash-outline" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.content}>
          {empleados.map((empleado) => (
            <Card key={empleado.IDusuarios} style={styles.card}>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{empleado.nombre}</Text>
                <Text style={styles.cardSubtitle}>{empleado.rol} • {empleado.cargo?.nombre || 'Sin cargo asignado'}</Text>
              </View>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openResumen(empleado)}>
                <Text style={styles.actionBtnText}>Ver Resumen</Text>
                <Ionicons name="chevron-forward" size={16} color="#3b82f6" />
              </TouchableOpacity>
            </Card>
          ))}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn: { padding: 8 },
  headerActionBtn: { padding: 8, backgroundColor: '#eff6ff', borderRadius: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  content: { padding: 16 },
  
  card: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 12, elevation: 1 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: '#6b7280' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
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
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }
});
