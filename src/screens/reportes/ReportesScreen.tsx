import React, { useEffect, useState } from 'react';
import { View, FlatList, TouchableOpacity, ActivityIndicator, Dimensions, TextInput, Modal, Platform, Keyboard, Alert } from 'react-native';
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

// Carga dinámica de módulos nativos para exportar
let Print: any = null;
let Sharing: any = null;
try { Print = require('expo-print'); } catch (e) { console.log('expo-print no disponible'); }
try { Sharing = require('expo-sharing'); } catch (e) { console.log('expo-sharing no disponible'); }

import { useScrollDirection } from '../../hooks/useScrollDirection';
import { FlashList as OriginalFlashList } from '@shopify/flash-list';
const FlashList = OriginalFlashList as any;

export default function ReportesScreen({ navigation }: any) {
  const { reportesDineroGuardado, isLoading, fetchReportesDineroGuardado, crearReporte, eliminarReporte } = useReportesStore();
  const { canCreate, canDelete } = usePermissions('reportes');
  
  // Por defecto el mes actual
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

  const handleScroll = useScrollDirection();

  useEffect(() => {
    fetchReportesDineroGuardado();
  }, []);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
  };

  const exportToPDF = async (item: ReporteFilter) => {
    if (!Print || !Sharing) {
      Toast.show({ type: 'error', text1: 'Módulo Faltante', text2: 'Debes recompilar la app para exportar PDFs' });
      return;
    }
    try {
      const html = `
        <html>
          <body style="font-family: Helvetica, sans-serif; padding: 20px;">
            <h1 style="color: #16a34a;">Reporte de Dinero Guardado</h1>
            <p><strong>Fecha de Creación:</strong> ${item.desde ? format(new Date(item.desde), "d 'de' MMMM 'de' yyyy", { locale: es }) : 'Desconocida'}</p>
            <p><strong>Referencia:</strong> ${item.FilterID || 'General'}</p>
            <hr />
            <h2>Resumen</h2>
            <ul>
              <li><strong>Plata Guardada Acumulada:</strong> <span style="color: #16a34a;">${formatMoney(Number(item.totalDePlataGuardada || 0))}</span></li>
            </ul>
            <p><small>Generado desde la App de Punto de Venta</small></p>
          </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo generar el PDF' });
    }
  };

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
      const totalGlobal = filteredCajas.reduce((sum, item) => sum + Number(item.totalDePlataGuardada || 0), 0);
      
      const rows = filteredCajas.map(item => `
        <tr>
          <td style="border-bottom: 1px solid #eee; padding: 8px;">${item.desde ? format(new Date(item.desde), "dd/MM/yyyy", { locale: es }) : 'N/A'}</td>
          <td style="border-bottom: 1px solid #eee; padding: 8px;">${item.FilterID || 'General'}</td>
          <td style="border-bottom: 1px solid #eee; padding: 8px; text-align: right; color: #16a34a; font-weight: bold;">${formatMoney(Number(item.totalDePlataGuardada || 0))}</td>
        </tr>
      `).join('');

      const html = `
        <html>
          <body style="font-family: Helvetica, sans-serif; padding: 20px;">
            <h1 style="color: #16a34a; text-align: center;">Reporte Consolidado de Dinero Guardado</h1>
            <p style="text-align: center; color: #666;">
              Desde: ${format(startDate, "d 'de' MMMM 'de' yyyy", { locale: es })}<br>
              Hasta: ${format(endDate, "d 'de' MMMM 'de' yyyy", { locale: es })}
            </p>
            <hr />
            <h2 style="color: #333;">Total Acumulado: <span style="color: #16a34a;">${formatMoney(totalGlobal)}</span></h2>
            <br>
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
              <thead>
                <tr style="background-color: #f8fafc;">
                  <th style="border-bottom: 2px solid #ddd; padding: 10px;">Fecha Creación</th>
                  <th style="border-bottom: 2px solid #ddd; padding: 10px;">Referencia</th>
                  <th style="border-bottom: 2px solid #ddd; padding: 10px; text-align: right;">Dinero Guardado Acumulado</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
            <br>
            <p style="text-align: center; font-size: 12px; color: #999;">Generado desde la App de Punto de Venta</p>
          </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo generar el PDF consolidado' });
    }
  };

  const handleDeleteReporte = (item: ReporteFilter) => {
    const fechaDesde = item.desde ? format(new Date(item.desde), "d 'de' MMMM", { locale: es }) : 'N/A';
    const fechaHasta = item.hasta ? format(new Date(item.hasta), "d 'de' MMMM", { locale: es }) : 'N/A';
    
    Alert.alert(
      "Eliminar Reporte",
      `Reporte del ${fechaDesde} hasta el ${fechaHasta}.\n\n¿Está seguro que desea eliminar este reporte de manera permanente?`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Eliminar", 
          style: "destructive",
          onPress: () => eliminarReporte(item.FilterID) 
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: ReporteFilter }) => (
    <TouchableOpacity
      className="bg-white p-4 mb-3 rounded-xl shadow-sm border border-gray-100 flex-row justify-between items-center"
      onPress={() => {
        if (item.FilterID) {
          navigation.navigate('ReporteDetalle', { filterId: item.FilterID });
        }
      }}
    >
      <View>
        <Text className="text-base font-bold text-gray-800">
          {item.desde ? format(new Date(item.desde), "d 'de' MMM. 'de' yyyy", { locale: es }) : 'N/A'}
        </Text>
        <Text className="text-sm text-gray-500 mt-1">
          {item.hasta ? format(new Date(item.hasta), "d 'de' MMM. 'de' yyyy", { locale: es }) : 'N/A'}
        </Text>
      </View>
      <View className="items-end">
        <Text className="text-lg font-black text-gray-800">
          {formatMoney(Number(item.totalDePlataGuardada || 0))}
        </Text>
        <View className="flex-row mt-2">
          {canDelete && (
            <TouchableOpacity onPress={() => handleDeleteReporte(item)} className="p-1 mr-2 bg-gray-100 rounded">
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => {
            if (item.FilterID) {
              navigation.navigate('ReporteDetalle', { filterId: item.FilterID });
            }
          }} className="p-1 bg-gray-100 rounded">
            <Ionicons name="document-text-outline" size={20} color="#4b5563" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  const filteredCajas = reportesDineroGuardado.filter(caja => {
    const query = searchQuery.toLowerCase();
    return query === '' || 
      (caja.tipoDeFiltro && caja.tipoDeFiltro.toLowerCase().includes(query)) ||
      (caja.totalDePlataGuardada && caja.totalDePlataGuardada.toString().includes(query));
  });

  return (
    <View className="flex-1 bg-gray-50">
      <StatusBar style="dark" backgroundColor="transparent" translucent />
      <SafeAreaView className="flex-1" edges={['top']}>
      <View className="bg-green-600 px-4 py-4 flex-row items-center justify-between shadow-sm z-10">
        <View className="flex-row items-center flex-1">
          <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 p-1">
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          
          <View className="flex-1 bg-white/20 rounded-full flex-row items-center px-3 py-1.5 mr-3">
            <Ionicons name="search" size={18} color="white" />
            <TextInput 
              placeholder="Buscar reporte..."
              placeholderTextColor="rgba(255,255,255,0.7)"
              className="flex-1 ml-2 text-white py-1"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity onPress={() => {}}>
              <Ionicons name="options-outline" size={18} color="white" />
            </TouchableOpacity>
          </View>
        </View>
        {canCreate && (
          <TouchableOpacity 
            onPress={() => setModalVisible(true)}
            className="bg-white/20 p-2 rounded-full"
          >
            <Ionicons name="add" size={24} color="white" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs Modernos (Segmented Control) */}
      <View className="px-4 pt-4 pb-2 z-0">
        <View className="flex-row bg-gray-200/60 p-1 rounded-2xl">
          {(['DINERO_GUARDADO', 'VENTAS'] as const).map((tab) => {
            const isActive = activeTab === tab;
            
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                className={`flex-1 py-3 items-center rounded-xl ${isActive ? 'bg-white shadow-sm' : ''}`}
              >
                <Text className={`text-[11px] font-bold uppercase text-center ${isActive ? 'text-green-600' : 'text-gray-500'}`}>
                  {tab === 'DINERO_GUARDADO' ? 'Dinero Guardado' : 'Ventas'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      ) : activeTab === 'DINERO_GUARDADO' ? (
        <FlashList
          data={filteredCajas}
          keyExtractor={(item: ReporteFilter) => item.FilterID}
          onScroll={handleScroll}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View className="items-center justify-center mt-10">
              <Ionicons name="document-outline" size={60} color="#d1d5db" />
              <Text className="text-gray-400 mt-4 text-base">No hay reportes en este rango de fechas</Text>
            </View>
          }
        />
      ) : (
        <View className="flex-1 items-center justify-center mt-10">
          <Ionicons name="construct-outline" size={60} color="#d1d5db" />
          <Text className="text-gray-400 mt-4 text-base">Módulo en construcción</Text>
        </View>
      )}

      {/* Modal para Generar Reporte Consolidado */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: 'white', width: '90%', borderRadius: 24, padding: 24 }}>
            <Text className="text-xl font-bold text-gray-800 mb-2 text-center">Generar Reporte</Text>
            <Text className="text-sm text-gray-500 mb-6 text-center">Selecciona el rango de fechas para cargar los reportes de Dinero Guardado.</Text>

            <View className="flex-row justify-between mb-6">
              <View className="flex-1 mr-2">
                <Text className="text-xs font-bold text-gray-500 uppercase mb-2">Fecha de Inicio</Text>
                <TouchableOpacity onPress={() => setShowStartPicker(true)} className="bg-gray-50 border border-gray-300 rounded-xl p-3 flex-row items-center">
                  <Ionicons name="calendar-outline" size={18} color="#16a34a" className="mr-2" />
                  <Text className="text-gray-800 ml-2">{format(tempStartDate, 'dd/MM/yyyy')}</Text>
                </TouchableOpacity>
              </View>

              <View className="flex-1 ml-2">
                <Text className="text-xs font-bold text-gray-500 uppercase mb-2">Fecha Fin</Text>
                <TouchableOpacity onPress={() => setShowEndPicker(true)} className="bg-gray-50 border border-gray-300 rounded-xl p-3 flex-row items-center">
                  <Ionicons name="calendar-outline" size={18} color="#16a34a" className="mr-2" />
                  <Text className="text-gray-800 ml-2">{format(tempEndDate, 'dd/MM/yyyy')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity 
              className="bg-green-600 rounded-xl py-4 flex-row justify-center items-center mb-3"
              onPress={async () => {
                setCreating(true);
                try {
                  await crearReporte(format(tempStartDate, 'yyyy-MM-dd'), format(tempEndDate, 'yyyy-MM-dd'));
                  setModalVisible(false);
                  Toast.show({ type: 'success', text1: 'Éxito', text2: 'Reporte generado' });
                } catch (e) {
                  Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo crear el reporte' });
                } finally {
                  setCreating(false);
                }
              }}
              disabled={creating}
            >
              {creating ? <ActivityIndicator color="white" /> : <Ionicons name="search" size={20} color="white" className="mr-2" />}
              <Text className="text-white font-bold ml-2">Generar Reporte</Text>
            </TouchableOpacity>

            <TouchableOpacity 
                className="bg-gray-800 rounded-xl py-4 flex-row justify-center items-center"
                onPress={() => {
                  setStartDate(tempStartDate);
                  setEndDate(tempEndDate);
                  setModalVisible(false);
                  setTimeout(() => exportConsolidatedPDF(), 500); // Dar tiempo a que cierre el modal
                }}
              >
                <Ionicons name="document-text-outline" size={20} color="white" className="mr-2" />
                <Text className="text-white font-bold ml-2">Generar PDF Consolidado</Text>
              </TouchableOpacity>

          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Date Pickers de Android/iOS */}
      {showStartPicker && (
        <DateTimePicker
          value={tempStartDate}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowStartPicker(Platform.OS === 'ios');
            if (event.type === 'set' && selectedDate) {
              setTempStartDate(selectedDate);
            }
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
            if (event.type === 'set' && selectedDate) {
              setTempEndDate(selectedDate);
            }
          }}
        />
      )}
    </SafeAreaView>
    </View>
  );
}
