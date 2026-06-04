import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Platform, RefreshControl, Modal, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/ui/text';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import Toast from 'react-native-toast-message';
import { useEstadisticasStore } from '../../store/useEstadisticasStore';
import categoriasService, { CategoriaItem } from '../../services/categorias';
import api from '../../services/api';

// Carga dinámica de módulos nativos
let BarChart: any = null;
let LinearGradient: any = View;
let Print: any = null;
let Sharing: any = null;

try { BarChart = require('react-native-gifted-charts').BarChart; } catch (e) {}
try { LinearGradient = require('expo-linear-gradient').LinearGradient; } catch (e) {}
try { Print = require('expo-print'); } catch (e) {}
try { Sharing = require('expo-sharing'); } catch (e) {}

export default function EstadisticasScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const { data, isLoading, fetchData } = useEstadisticasStore();
  const [refreshing, setRefreshing] = useState(false);

  // Filtros
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState(endOfMonth(new Date()));
  const [selectedCategoria, setSelectedCategoria] = useState<string | undefined>(undefined);
  const [selectedVendedor, setSelectedVendedor] = useState<string | undefined>(undefined);
  
  // Pickers
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Datos para filtros
  const [categorias, setCategorias] = useState<CategoriaItem[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [showFiltrosAvanzados, setShowFiltrosAvanzados] = useState(false);

  // Estado del Gráfico
  const [chartType, setChartType] = useState<'diario' | 'semanal' | 'mensual'>('diario');
  const [isFullScreen, setIsFullScreen] = useState(false);

  const loadFilters = async () => {
    try {
      const cats = await categoriasService.getAll();
      setCategorias(cats);
      const res = await api.get('/usuarios'); // Asumiendo endpoint
      setVendedores(res.data.data || res.data);
    } catch (e) {
      console.log('Error loading filters', e);
    }
  };

  const refreshData = useCallback(async () => {
    await fetchData(
      format(startDate, 'yyyy-MM-dd'),
      format(endDate, 'yyyy-MM-dd'),
      selectedCategoria,
      selectedVendedor
    );
  }, [startDate, endDate, selectedCategoria, selectedVendedor, fetchData]);

  useEffect(() => {
    loadFilters();
  }, []);

  // Solo hacer fetch inicial al montar, no en cada cambio de filtros
  useEffect(() => {
    // Fetch inicial
    fetchData(
      format(startDate, 'yyyy-MM-dd'),
      format(endDate, 'yyyy-MM-dd'),
      selectedCategoria,
      selectedVendedor
    );
  }, []); // Empty deps = solo una vez al montar

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData(
      format(startDate, 'yyyy-MM-dd'),
      format(endDate, 'yyyy-MM-dd'),
      selectedCategoria,
      selectedVendedor
    );
    setRefreshing(false);
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
  };

  const setPredefinedRange = (range: 'HOY' | 'ESTE_MES' | 'MES_PASADO') => {
    const today = new Date();
    if (range === 'HOY') {
      setStartDate(today);
      setEndDate(today);
    } else if (range === 'ESTE_MES') {
      setStartDate(startOfMonth(today));
      setEndDate(endOfMonth(today));
    } else if (range === 'MES_PASADO') {
      const lastMonth = subMonths(today, 1);
      setStartDate(startOfMonth(lastMonth));
      setEndDate(endOfMonth(lastMonth));
    }
  };

  // Preparar datos para Gifted Charts
  const chartData = useMemo(() => {
    if (!data) return [];
    let source = data.graficos.diario;
    if (chartType === 'semanal') source = data.graficos.semanal;
    if (chartType === 'mensual') source = data.graficos.mensual;

    return source.map(item => ({
      value: item.value,
      label: chartType === 'diario' ? format(new Date(item.label + 'T12:00:00'), 'd MMM', { locale: es }) : item.label,
      frontColor: chartType === 'diario' ? '#3b82f6' : chartType === 'semanal' ? '#8b5cf6' : '#f59e0b',
      topLabelComponent: () => {
        const val = item.value;
        let display = '';
        if (val >= 1000000) display = (val / 1000000).toFixed(1).replace('.0', '') + 'M';
        else if (val >= 1000) display = Math.round(val / 1000) + 'k';
        else display = val.toString();
        return (
          <View style={{ width: 70, paddingHorizontal: 2 }}>
            <Text style={{color: '#374151', fontSize: 9, fontWeight: 'bold', textAlign: 'center'}} numberOfLines={1}>
              ${display}
            </Text>
          </View>
        );
      },
    }));
  }, [data, chartType, isFullScreen]);

  const renderCard = (title: string, amount: number, icon: string, colors: [string, string]) => (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      className="rounded-3xl p-4 flex-1 m-1 shadow-sm"
      style={{ minHeight: 110, justifyContent: 'space-between' }}
    >
      <View className="flex-row justify-between items-start mb-2">
        <View className="bg-white/20 p-2 rounded-xl">
          <Ionicons name={icon as any} size={22} color="white" />
        </View>
      </View>
      <View>
        <Text className="text-white/80 text-[10px] font-bold uppercase tracking-wider mb-1">{title}</Text>
        <Text className="text-white text-xl font-black" numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(amount)}
        </Text>
      </View>
    </LinearGradient>
  );

  const ChartComponent = ({ fullScreen = false }) => {
    if (!BarChart) {
      return (
        <View className="h-40 justify-center items-center">
          <Text className="text-gray-400">Gráfico no disponible. Recompila la app.</Text>
        </View>
      );
    }
    if (chartData.length === 0) {
      return (
        <View className="h-40 justify-center items-center">
          <Text className="text-gray-400 font-bold">No hay datos en este período</Text>
        </View>
      );
    }
    return (
      <View style={{ overflow: 'hidden', paddingBottom: 10 }}>
        <BarChart
            data={chartData}
            barWidth={24}
            spacing={chartData.length === 1 ? 0 : 25}
            roundedTop
            roundedBottom
            hideRules
            xAxisThickness={1}
            xAxisColor="#d1d5db"
            yAxisThickness={0}
            yAxisTextStyle={{color: '#6b7280', fontSize: 9, fontWeight: 'bold'}}
            xAxisLabelTextStyle={{color: '#6b7280', fontSize: 8, fontWeight: 'bold'}}
            yAxisLabelWidth={30}
            formatYLabel={(label: string) => {
              const val = Number(label.replace(/[^0-9.-]/g, ''));
              if (isNaN(val) || val === 0) return '$0';
              if (val >= 1000000) return '$' + (val / 1000000).toFixed(1).replace('.0', '') + 'M';
              if (val >= 1000) return '$' + Math.round(val / 1000) + 'k';
              return '$' + val;
            }}
            noOfSections={4}
            stepHeight={fullScreen ? 45 : 50}
            initialSpacing={chartData.length === 1 ? 25 : 15}
            endSpacing={chartData.length === 1 ? 0 : 25}
            isAnimated={!fullScreen}
            animationDuration={600}
            width={fullScreen ? width - 80 : width - 90}
            height={fullScreen ? 200 : 220}
            showLine={false}
            showScrollIndicator={chartData.length > 5}
            indicatorColor="#d1d5db"
            scrollToIndex={0}
          />
      </View>
    );
  };

  const exportToPDF = async () => {
    if (!data) return;
    if (!Print || !Sharing) {
      Toast.show({ type: 'error', text1: 'Módulo Faltante', text2: 'Debes recompilar la app para exportar PDFs' });
      return;
    }
    
    try {
      const html = `
        <html>
          <body style="font-family: Helvetica, sans-serif; padding: 20px;">
            <h1 style="color: #3b82f6;">Reporte de Estadísticas</h1>
            <p><strong>Desde:</strong> ${format(startDate, 'dd MMM yyyy', { locale: es })}</p>
            <p><strong>Hasta:</strong> ${format(endDate, 'dd MMM yyyy', { locale: es })}</p>
            
            <hr />
            
            <h2>Resumen Financiero</h2>
            <ul>
              <li><strong>Ventas Totales:</strong> ${formatMoney(data.totales.ventas)}</li>
              <li><strong>Gastos de Negocio:</strong> ${formatMoney(data.totales.gastosNegocio)}</li>
              <li><strong>Gastos Personales:</strong> ${formatMoney(data.totales.gastosPersonales)}</li>
              <li><strong>Total Gastos:</strong> ${formatMoney(data.totales.gastosNegocio + data.totales.gastosPersonales)}</li>
              <li><strong>Total Inventario:</strong> ${formatMoney(data.totales.inventarioTotal || 0)}</li>
              <li><strong>Utilidad del Negocio:</strong> ${formatMoney(data.totales.utilidadNegocio)}</li>
              <li><strong style="color: #10b981;">Utilidad Neta:</strong> ${formatMoney(data.totales.utilidadNeta)}</li>
            </ul>

            <hr />

            <h2>Top Productos Vendidos</h2>
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <tr>
                <th style="border-bottom: 1px solid #ddd; padding: 8px;">Producto</th>
                <th style="border-bottom: 1px solid #ddd; padding: 8px;">Categoría</th>
                <th style="border-bottom: 1px solid #ddd; padding: 8px;">Cantidad</th>
                <th style="border-bottom: 1px solid #ddd; padding: 8px;">Total</th>
              </tr>
              ${data.productos.slice(0, 20).map(p => `
                <tr>
                  <td style="border-bottom: 1px solid #eee; padding: 8px;">${p.nombre}</td>
                  <td style="border-bottom: 1px solid #eee; padding: 8px;">${p.categoria || 'Sin Categoría'}</td>
                  <td style="border-bottom: 1px solid #eee; padding: 8px;">${p.cantidad}</td>
                  <td style="border-bottom: 1px solid #eee; padding: 8px;">${formatMoney(p.total)}</td>
                </tr>
              `).join('')}
            </table>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      console.log('Error exporting PDF', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo generar el PDF' });
    }
  };

  const renderDateFilters = () => (
    <View className="flex-row items-center bg-white rounded-3xl p-4 mb-4 shadow-sm border border-gray-100">
      <TouchableOpacity className="flex-1 items-center border-r border-gray-100" onPress={() => setShowStartPicker(true)}>
        <View className="flex-row items-center mb-1">
          <Ionicons name="calendar-outline" size={14} color="#9ca3af" style={{marginRight: 4}} />
          <Text className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Desde</Text>
        </View>
        <Text className="text-sm font-black text-gray-800">{format(startDate, 'dd MMM yyyy', { locale: es })}</Text>
      </TouchableOpacity>
      
      <TouchableOpacity className="flex-1 items-center" onPress={() => setShowEndPicker(true)}>
        <View className="flex-row items-center mb-1">
          <Ionicons name="calendar-outline" size={14} color="#9ca3af" style={{marginRight: 4}} />
          <Text className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Hasta</Text>
        </View>
        <Text className="text-sm font-black text-gray-800">{format(endDate, 'dd MMM yyyy', { locale: es })}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* Header */}
      <View className="bg-white px-4 py-4 flex-row items-center justify-between shadow-sm border-b border-gray-100 z-10">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 p-1">
            <Ionicons name="arrow-back" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-800">Dashboard Interactivo</Text>
        </View>
        <View className="flex-row">
          <TouchableOpacity onPress={() => setShowFiltrosAvanzados(!showFiltrosAvanzados)} className={`p-2 rounded-full mr-2 ${showFiltrosAvanzados ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <Ionicons name="filter" size={20} color={showFiltrosAvanzados ? '#3b82f6' : '#6b7280'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={exportToPDF} className="p-2 bg-blue-100 rounded-full" disabled={isLoading || !data}>
            <Ionicons name="document-text" size={20} color="#3b82f6" />
          </TouchableOpacity>
        </View>
      </View>

      {/* FullScreen Modal */}
      <Modal visible={isFullScreen} animationType="slide" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => setIsFullScreen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }} edges={['top', 'bottom']}>
          {/* Header del Modal */}
          <View className="flex-row justify-between items-center px-5 py-4 bg-white border-b border-gray-100 shadow-sm">
            <View>
              <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Análisis Detallado</Text>
              <Text className="text-xl font-black text-gray-800 capitalize">{chartType}</Text>
            </View>
            <TouchableOpacity onPress={() => setIsFullScreen(false)} className="p-2 bg-gray-100 rounded-full">
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>
          
          {/* Contenido del Modal */}
          <View style={{ flex: 1 }}>
            {data && (
              <View className="px-5 py-4">
                <Text className="text-sm font-bold text-gray-500 mb-1">Total en este periodo</Text>
                <Text className="text-3xl font-black text-blue-600 mb-3">{formatMoney(data.totales.ventas)}</Text>
                {renderDateFilters()}
                <TouchableOpacity
                  onPress={onRefresh}
                  disabled={refreshing}
                  className={`rounded-2xl py-3 mt-3 shadow-sm flex-row justify-center items-center ${refreshing ? 'bg-blue-400' : 'bg-blue-600'}`}
                >
                  {refreshing ? (
                    <ActivityIndicator color="white" size="small" className="mr-2" />
                  ) : null}
                  <Text className="text-white text-center font-black text-sm">{refreshing ? 'Cargando...' : 'Aplicar Filtros'}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={{ flex: 1, alignItems: 'center' }}>
              {/* Contenedor tipo tarjeta para el gráfico en fullscreen */}
              <View className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100" style={{ width: width - 32 }}>
                <ChartComponent fullScreen={true} />
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3b82f6']} />}
      >
        {/* Filtros Rapidos */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
          <TouchableOpacity onPress={() => setPredefinedRange('HOY')} className="bg-white border border-gray-200 px-5 py-2 rounded-full mr-2 shadow-sm">
            <Text className="text-sm font-bold text-gray-700">Hoy</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPredefinedRange('ESTE_MES')} className="bg-white border border-gray-200 px-5 py-2 rounded-full mr-2 shadow-sm">
            <Text className="text-sm font-bold text-gray-700">Este Mes</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPredefinedRange('MES_PASADO')} className="bg-white border border-gray-200 px-5 py-2 rounded-full shadow-sm">
            <Text className="text-sm font-bold text-gray-700">Mes Pasado</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Filtros Fechas */}
        {renderDateFilters()}

        {/* Botón Aplicar Filtros */}
        <TouchableOpacity
          onPress={onRefresh}
          disabled={refreshing}
          className={`rounded-2xl py-3 mb-4 mx-1 shadow-sm flex-row justify-center items-center ${refreshing ? 'bg-blue-400' : 'bg-blue-600'}`}
        >
          {refreshing ? (
            <ActivityIndicator color="white" size="small" className="mr-2" />
          ) : null}
          <Text className="text-white text-center font-black text-sm">{refreshing ? 'Cargando...' : 'Aplicar Filtros'}</Text>
        </TouchableOpacity>

        {/* Filtros Avanzados */}
        {showFiltrosAvanzados && (
          <View className="bg-white rounded-3xl p-4 mb-6 shadow-sm border border-gray-100">
            <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Categoría de Producto</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              <TouchableOpacity 
                onPress={() => setSelectedCategoria(undefined)}
                className={`px-4 py-2 rounded-full mr-2 ${!selectedCategoria ? 'bg-blue-600' : 'bg-gray-100'}`}
              >
                <Text className={`text-sm font-bold ${!selectedCategoria ? 'text-white' : 'text-gray-600'}`}>Todas</Text>
              </TouchableOpacity>
              {categorias.map(c => (
                <TouchableOpacity 
                  key={c.IDcategoria} 
                  onPress={() => setSelectedCategoria(c.nombre)}
                  className={`px-4 py-2 rounded-full mr-2 ${selectedCategoria === c.nombre ? 'bg-blue-600' : 'bg-gray-100'}`}
                >
                  <Text className={`text-sm font-bold ${selectedCategoria === c.nombre ? 'text-white' : 'text-gray-600'}`}>{c.nombre}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Vendedor</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity 
                onPress={() => setSelectedVendedor(undefined)}
                className={`px-4 py-2 rounded-full mr-2 ${!selectedVendedor ? 'bg-purple-600' : 'bg-gray-100'}`}
              >
                <Text className={`text-sm font-bold ${!selectedVendedor ? 'text-white' : 'text-gray-600'}`}>Todos</Text>
              </TouchableOpacity>
              {vendedores.map(v => (
                <TouchableOpacity 
                  key={v.IDusuarios} 
                  onPress={() => setSelectedVendedor(v.IDusuarios)}
                  className={`px-4 py-2 rounded-full mr-2 ${selectedVendedor === v.IDusuarios ? 'bg-purple-600' : 'bg-gray-100'}`}
                >
                  <Text className={`text-sm font-bold ${selectedVendedor === v.IDusuarios ? 'text-white' : 'text-gray-600'}`}>{v.nombre}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {showStartPicker && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display="default"
            onChange={(e, date) => {
              setShowStartPicker(false);
              if (e.type === 'set' && date) setStartDate(date);
            }}
          />
        )}
        {showEndPicker && (
          <DateTimePicker
            value={endDate}
            mode="date"
            display="default"
            minimumDate={startDate}
            onChange={(e, date) => {
              setShowEndPicker(false);
              if (e.type === 'set' && date) setEndDate(date);
            }}
          />
        )}

        {isLoading && !data ? (
          <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 50 }} />
        ) : data ? (
          <>
            {/* Tarjetas de Resumen */}
            <View className="flex-row mb-2">
              {renderCard('Ventas Totales', data.totales.ventas, 'trending-up', ['#3b82f6', '#2563eb'])}
              {renderCard('Utilidad Neta', data.totales.utilidadNeta, 'cash', ['#10b981', '#059669'])}
            </View>
            <View className="flex-row mb-2">
              {renderCard('Gastos Negocio', data.totales.gastosNegocio, 'briefcase', ['#f59e0b', '#d97706'])}
              {renderCard('Gastos Personal', data.totales.gastosPersonales, 'person', ['#ef4444', '#dc2626'])}
            </View>
            <View className="flex-row mb-6">
              {renderCard('Total Gastos', (data.totales.gastosNegocio + data.totales.gastosPersonales), 'wallet', ['#8b5cf6', '#7c3aed'])}
              {renderCard('Total Inventario', data.totales.inventarioTotal || 0, 'cube', ['#64748b', '#4b5563'])}
            </View>

            {/* Gráfico Principal Interactivo */}
            <View className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 mb-6">
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-base font-black text-gray-800">Evolución de Ventas</Text>
                <TouchableOpacity onPress={() => setIsFullScreen(true)}>
                  <Ionicons name="expand" size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>

              {/* Selector de Tipo de Gráfico */}
              <View className="flex-row bg-gray-100 p-1 rounded-xl mb-6">
                {(['diario', 'semanal', 'mensual'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setChartType(type)}
                    className={`flex-1 py-2 items-center rounded-lg ${chartType === type ? 'bg-white shadow-sm' : ''}`}
                  >
                    <Text className={`text-xs font-bold uppercase ${chartType === type ? 'text-blue-600' : 'text-gray-500'}`}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity activeOpacity={0.9} onPress={() => setIsFullScreen(true)}>
                <ChartComponent />
              </TouchableOpacity>
            </View>

            {/* Top Productos (Barras Horizontales) */}
            <View className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
              <Text className="text-base font-black text-gray-800 mb-6">Productos más vendidos</Text>
              {data.productos.length > 0 ? (
                data.productos.slice(0, 10).map((prod, index) => {
                  const maxTotal = data.productos[0].total;
                  const percentage = (prod.total / maxTotal) * 100;
                  return (
                    <View key={index} className="mb-4">
                      <View className="flex-row justify-between items-end mb-1">
                        <Text className="text-sm font-bold text-gray-700 flex-1" numberOfLines={1}>{prod.nombre}</Text>
                        <Text className="text-sm font-black text-blue-600">{formatMoney(prod.total)}</Text>
                      </View>
                      <View className="flex-row justify-between items-center mb-2">
                        <Text className="text-[10px] text-gray-400 font-bold uppercase">{prod.categoria || 'Sin Categoría'}</Text>
                        <Text className="text-[10px] text-gray-500 font-bold">{prod.cantidad} unds</Text>
                      </View>
                      {/* Barra de progreso horizontal */}
                      <View className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <View 
                          className="h-full bg-blue-500 rounded-full" 
                          style={{ width: `${percentage}%` }}
                        />
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text className="text-gray-400 text-center py-4 font-bold">No hay productos vendidos</Text>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
