import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput } from 'react-native';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');

  useEffect(() => {
    loadTurnos();
  }, []);

  const loadTurnos = async () => {
    try {
      setLoading(true);
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

  const getQuincenaLabel = (fechaStr: string) => {
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) return 'Fecha Desconocida';
    const month = d.toLocaleString('es-CO', { month: 'short' }).replace('.', '');
    const year = d.getFullYear();
    const day = d.getDate();
    if (day <= 15) return `1 - 15 ${month.toUpperCase()} ${year}`;
    return `16 - Fin ${month.toUpperCase()} ${year}`;
  };

  const filteredAndGroupedTurnos = useMemo(() => {
    let filtered = turnos;

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
      const label = getQuincenaLabel(turno.fecha || turno.horaEntrada || new Date().toISOString());
      if (!groups[label]) groups[label] = [];
      groups[label].push(turno);
    });

    return Object.entries(groups).map(([label, items]) => ({ label, items }));
  }, [turnos, statusFilter, searchQuery]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Mis Turnos</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por observación o nombre..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

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

      {loading ? (
        <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.content}>
          {filteredAndGroupedTurnos.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyText}>No hay turnos para mostrar</Text>
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

                {group.items.map((turno: any) => (
                  <Card key={turno.IDturno} style={styles.card}>
                    <View style={styles.cardMain}>
                      <View style={styles.cardLeft}>
                        <View style={styles.dateBox}>
                          <Text style={styles.dateDay}>
                            {new Date(turno.fecha || turno.horaEntrada).getDate()}
                          </Text>
                          <Text style={styles.dateMonth}>
                            {new Date(turno.fecha || turno.horaEntrada).toLocaleString('es-CO', { weekday: 'short' }).toUpperCase()}
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
                        {turno.estado === 'COMPLETADO' && (
                          <Text style={styles.moneyText}>${Number(turno.valorTurno || 0).toLocaleString('es-CO')}</Text>
                        )}
                        {turno.estado === 'COMPLETADO' && (
                          <Text style={styles.cenoText}>Cenó: {turno.ceno ? 'SÍ' : 'NO'}</Text>
                        )}
                      </View>
                    </View>
                  </Card>
                ))}
              </View>
            ))
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  backBtn: { padding: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  
  filterScroll: { paddingVertical: 8, marginBottom: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', marginRight: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  pillActive: { backgroundColor: '#111827', borderColor: '#111827' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
  pillTextActive: { color: '#fff' },
  
  content: { paddingHorizontal: 16 },
  
  groupHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 12 },
  groupTitle: { fontSize: 15, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  groupBadge: { marginLeft: 8, backgroundColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  groupBadgeText: { fontSize: 12, fontWeight: '700', color: '#4b5563' },
  
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 12, fontSize: 16, color: '#6b7280' },
  
  card: { marginBottom: 12, borderRadius: 16, backgroundColor: '#fff', padding: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
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
  
  cardRight: { alignItems: 'flex-end', justifyContent: 'center' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 6 },
  statusText: { fontSize: 10, fontWeight: '800' },
  moneyText: { fontSize: 14, fontWeight: '800', color: '#10b981' },
  cenoText: { fontSize: 11, color: '#6b7280', marginTop: 2 }
});
