import React, { useState, useEffect, useCallback } from 'react';
import { View, TouchableOpacity, Text as RNText, StyleSheet, ScrollView, Modal, TextInput, Alert, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { insumosService, InsumoItem, Estadisticas, Alerta } from '../../services/insumos';
import { Text } from '../../components/ui/text';

type DashboardData = {
  estadisticas: Estadisticas | null;
  alertas: Alerta[];
  recientes: any[];
  porCategoria: { categoria: string; total: number; cantidad: number }[];
};

const AnalyticsScreen = () => {
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DashboardData>({
    estadisticas: null,
    alertas: [],
    recientes: [],
    porCategoria: [],
  });

  const fetchData = useCallback(async () => {
    try {
      const [estadisticas, alertas] = await Promise.all([
        insumosService.getEstadisticas(),
        insumosService.getAlertas(),
      ]);

      const insumos = await insumosService.getAll({ limit: 100 });

      const categoriaMap = new Map<string, { total: number; cantidad: number }>();
      insumos.forEach((insumo: InsumoItem) => {
        const cat = insumo.NombreCategoria || insumo.Categoria || 'Sin categoría';
        const existente = categoriaMap.get(cat) || { total: 0, cantidad: 0 };
        categoriaMap.set(cat, {
          total: existente.total + (insumo.Total || 0),
          cantidad: existente.cantidad + 1,
        });
      });

      const porCategoria = Array.from(categoriaMap.entries())
        .map(([categoria, valores]) => ({ categoria, ...valores }))
        .sort((a, b) => b.total - a.total);

      setData({
        estadisticas,
        alertas,
        recientes: insumos.slice(0, 10),
        porCategoria,
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatMoney = (amount: number = 0) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <RNText style={styles.headerTitle}>Analytics</RNText>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: '#22c55e20', width: (width - 48) / 2 }]}>
            <MaterialCommunityIcons name="package-variant" size={28} color="#22c55e" />
            <RNText style={styles.statValue}>{data.estadisticas?.totalInsumos || 0}</RNText>
            <RNText style={styles.statLabel}>Total Insumos</RNText>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#3b82f620', width: (width - 48) / 2 }]}>
            <MaterialCommunityIcons name="cash-multiple" size={28} color="#3b82f6" />
            <RNText style={styles.statValue}>{formatMoney(data.estadisticas?.totalValor)}</RNText>
            <RNText style={styles.statLabel}>Valor Total</RNText>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#f59e0b20', width: (width - 48) / 2 }]}>
            <MaterialCommunityIcons name="alert-circle" size={28} color="#f59e0b" />
            <RNText style={styles.statValue}>{data.alertas.length}</RNText>
            <RNText style={styles.statLabel}>Alertas</RNText>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#ef444420', width: (width - 48) / 2 }]}>
            <MaterialCommunityIcons name="alert" size={28} color="#ef4444" />
            <RNText style={styles.statValue}>{data.estadisticas?.porEstado.criticos || 0}</RNText>
            <RNText style={styles.statLabel}>Stock Crítico</RNText>
          </View>
        </View>

        <View style={styles.section}>
          <RNText style={styles.sectionTitle}>Estado del Inventario</RNText>
          <View style={styles.statusBars}>
            <View style={styles.statusBarItem}>
              <View style={styles.statusBarHeader}>
                <View style={[styles.statusDot, { backgroundColor: '#ef4444' }]} />
                <RNText style={styles.statusBarLabel}>Crítico</RNText>
              </View>
              <View style={styles.statusBarBg}>
                <View
                  style={[
                    styles.statusBarFill,
                    {
                      backgroundColor: '#ef4444',
                      width: `${Math.round(((data.estadisticas?.porEstado.criticos || 0) / (data.estadisticas?.totalInsumos || 1)) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <RNText style={styles.statusBarValue}>{data.estadisticas?.porEstado.criticos || 0}</RNText>
            </View>

            <View style={styles.statusBarItem}>
              <View style={styles.statusBarHeader}>
                <View style={[styles.statusDot, { backgroundColor: '#22c55e' }]} />
                <RNText style={styles.statusBarLabel}>Normal</RNText>
              </View>
              <View style={styles.statusBarBg}>
                <View
                  style={[
                    styles.statusBarFill,
                    {
                      backgroundColor: '#22c55e',
                      width: `${Math.round(((data.estadisticas?.porEstado.normales || 0) / (data.estadisticas?.totalInsumos || 1)) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <RNText style={styles.statusBarValue}>{data.estadisticas?.porEstado.normales || 0}</RNText>
            </View>

            <View style={styles.statusBarItem}>
              <View style={styles.statusBarHeader}>
                <View style={[styles.statusDot, { backgroundColor: '#3b82f6' }]} />
                <RNText style={styles.statusBarLabel}>Sobrante</RNText>
              </View>
              <View style={styles.statusBarBg}>
                <View
                  style={[
                    styles.statusBarFill,
                    {
                      backgroundColor: '#3b82f6',
                      width: `${Math.round(((data.estadisticas?.porEstado.sobrantes || 0) / (data.estadisticas?.totalInsumos || 1)) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <RNText style={styles.statusBarValue}>{data.estadisticas?.porEstado.sobrantes || 0}</RNText>
            </View>
          </View>
        </View>

        {data.alertas.length > 0 && (
          <View style={styles.section}>
            <RNText style={styles.sectionTitle}>Alertas de Stock</RNText>
            {data.alertas.slice(0, 5).map((alerta, index) => (
              <View key={index} style={styles.alertItem}>
                <View style={[styles.alertIcon, { backgroundColor: '#ef444420' }]}>
                  <MaterialCommunityIcons name="alert-circle" size={20} color="#ef4444" />
                </View>
                <View style={styles.alertInfo}>
                  <RNText style={styles.alertTitle} numberOfLines={1}>{alerta.insumo}</RNText>
                  <RNText style={styles.alertMessage}>{alerta.mensaje}</RNText>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <RNText style={styles.sectionTitle}>Por Categoría</RNText>
          {data.porCategoria.slice(0, 8).map((cat, index) => (
            <View key={index} style={styles.categoriaItem}>
              <View style={styles.categoriaInfo}>
                <RNText style={styles.categoriaNombre} numberOfLines={1}>{cat.categoria}</RNText>
                <RNText style={styles.categoriaCount}>{cat.cantidad} insumos</RNText>
              </View>
              <RNText style={styles.categoriaValor}>{formatMoney(cat.total)}</RNText>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <RNText style={styles.sectionTitle}>Resumen</RNText>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <RNText style={styles.summaryLabel}>Total Unidades</RNText>
              <RNText style={styles.summaryValue}>{data.estadisticas?.totalUnidades || 0}</RNText>
            </View>
            <View style={styles.summaryRow}>
              <RNText style={styles.summaryLabel}>Valor Promedio por Insumo</RNText>
              <RNText style={styles.summaryValue}>
                {formatMoney((data.estadisticas?.totalValor || 0) / (data.estadisticas?.totalInsumos || 1))}
              </RNText>
            </View>
            <View style={styles.summaryRow}>
              <RNText style={styles.summaryLabel}>Unidades Promedio por Insumo</RNText>
              <RNText style={styles.summaryValue}>
                {Math.round((data.estadisticas?.totalUnidades || 0) / (data.estadisticas?.totalInsumos || 1))}
              </RNText>
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  refreshBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, padding: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statCard: { borderRadius: 16, padding: 16, marginBottom: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 8 },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 4, textAlign: 'center' },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 16 },
  statusBars: {},
  statusBarItem: { marginBottom: 16 },
  statusBarHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusBarLabel: { fontSize: 13, color: '#374151', flex: 1 },
  statusBarBg: { height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
  statusBarFill: { height: '100%', borderRadius: 4 },
  statusBarValue: { fontSize: 12, color: '#6b7280', marginTop: 4, textAlign: 'right' },
  alertItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  alertIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  alertInfo: { flex: 1, marginLeft: 12 },
  alertTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  alertMessage: { fontSize: 12, color: '#ef4444', marginTop: 2 },
  categoriaItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  categoriaInfo: { flex: 1 },
  categoriaNombre: { fontSize: 14, fontWeight: '600', color: '#111827' },
  categoriaCount: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  categoriaValor: { fontSize: 14, fontWeight: '700', color: '#111827' },
  summaryCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  summaryLabel: { fontSize: 14, color: '#6b7280' },
  summaryValue: { fontSize: 14, fontWeight: '700', color: '#111827' },
});

export default AnalyticsScreen;