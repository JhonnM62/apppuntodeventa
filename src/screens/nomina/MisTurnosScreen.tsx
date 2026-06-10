import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Text } from '../../components/ui/text';
import { Card } from '../../components/ui/card';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMisTurnos, Turno } from '../../services/nomina.service';
import { useCustomAlert } from '../../context/CustomAlertContext';

export default function MisTurnosScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { showAlert } = useCustomAlert();
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTurnos();
  }, []);

  const loadTurnos = async () => {
    try {
      setLoading(true);
      const res = await getMisTurnos({ limit: 50 }); // Fetch latest 50
      setTurnos(res.data?.turnos || []);
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudieron cargar los turnos' });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case 'ACTIVO': return '#10b981'; // Green
      case 'CERRADO': return '#6b7280'; // Gray
      case 'LIQUIDADO': return '#3b82f6'; // Blue
      default: return '#f59e0b';
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Mis Turnos</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.content}>
          {turnos.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyText}>No tienes turnos registrados</Text>
            </View>
          ) : (
            turnos.map((turno) => (
              <Card key={turno.IDturno} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.dateText}>
                    {new Date(turno.fechaContable).toLocaleDateString('es-CO', { 
                      weekday: 'short', day: '2-digit', month: 'short' 
                    }).toUpperCase()}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(turno.estado) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(turno.estado) }]}>
                      {turno.estado}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.timeRow}>
                    <Ionicons name="log-in-outline" size={16} color="#4CAF50" />
                    <Text style={styles.timeLabel}> Entrada:</Text>
                    <Text style={styles.timeValue}>{turno.horaEntrada || '--:--'}</Text>
                  </View>
                  <View style={styles.timeRow}>
                    <Ionicons name="log-out-outline" size={16} color="#ef4444" />
                    <Text style={styles.timeLabel}> Salida:</Text>
                    <Text style={styles.timeValue}>{turno.horaSalida || '--:--'}</Text>
                  </View>
                </View>

                {turno.estado === 'CERRADO' && (
                  <View style={styles.cardFooter}>
                    <Text style={styles.infoText}>
                      ¿Cenó?: <Text style={{ fontWeight: 'bold' }}>{turno.ceno ? 'SÍ' : 'NO'}</Text>
                    </Text>
                    <Text style={styles.moneyText}>
                      Turno: ${Number(turno.valorTurno || 0).toLocaleString('es-CO')}
                    </Text>
                  </View>
                )}
              </Card>
            ))
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn: { padding: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  content: { padding: 16 },
  
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 12, fontSize: 16, color: '#6b7280' },
  
  card: { marginBottom: 12, borderRadius: 12, backgroundColor: '#fff', elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 12, marginBottom: 12 },
  dateText: { fontSize: 16, fontWeight: '700', color: '#111827' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700' },
  
  cardBody: { marginBottom: 8 },
  timeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  timeLabel: { fontSize: 14, color: '#6b7280', flex: 1 },
  timeValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  infoText: { fontSize: 13, color: '#4b5563' },
  moneyText: { fontSize: 14, fontWeight: '700', color: '#10b981' }
});
