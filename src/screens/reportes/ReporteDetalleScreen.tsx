import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform, Keyboard, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/ui/text';
import api from '../../services/api';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { generateAndShareDineroGuardadoPDF } from '../../utils/reportesPdf';
import Toast from 'react-native-toast-message';
import { usePermissions } from '../../hooks/usePermissions';

let Print: any = null;
let Sharing: any = null;
try { Print = require('expo-print'); } catch (e) { console.log('expo-print no disponible'); }
try { Sharing = require('expo-sharing'); } catch (e) { console.log('expo-sharing no disponible'); }

interface DineroRetirado {
  IDretiro: string;
  filterID: string;
  valor: number;
  retiro: number;
  sobrante: number;
  total: number;
  fechaYHora: string;
  observacion: string;
}

interface Reporte {
  FilterID: string;
  desde: string;
  hasta: string;
  tipoDeFiltro: string;
  totalDePlataGuardada: number;
}

interface DetalleData {
  reporte: Reporte;
  cajas: any[];
  plataGuardadaInicial: number;
  totalRetirado: number;
  sobranteActual: number;
  retiros: DineroRetirado[];
}

export default function ReporteDetalleScreen({ route, navigation }: any) {
  const { filterId } = route.params;
  const { canEdit, canDelete } = usePermissions('reportes');
  const [detalle, setDetalle] = useState<DetalleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRetiroId, setSelectedRetiroId] = useState<string | null>(null);
  const [montoRetiro, setMontoRetiro] = useState('');
  const [observacion, setObservacion] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [modalBaseVisible, setModalBaseVisible] = useState(false);
  const [montoBase, setMontoBase] = useState('');
  const [observacionBase, setObservacionBase] = useState('');

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    loadData();
  }, [filterId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await api.get(`/reportes/dinero-guardado/${filterId}`);
      let data: DetalleData | null = null;
      if (res && res.success && res.data) {
        data = res.data;
      } else if (res && res.reporte) {
        data = res;
      } else if (res && res.data && res.data.reporte) {
        data = res.data;
      }
      setDetalle(data);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar');
      setDetalle(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const fMoney = (amount: any) => {
    try {
      const val = Number(amount) || 0;
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val);
    } catch { return '$0'; }
  };

  const handleExportPDF = async () => {
    if (!detalle) {
      Toast.show({ type: 'info', text1: 'Aviso', text2: 'No hay datos para exportar.' });
      return;
    }

    try {
      await generateAndShareDineroGuardadoPDF(
        detalle.reporte,
        detalle.cajas
      );
    } catch (error) {
      console.error('Error exporting Reporte PDF:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo generar el PDF' });
    }
  };

  const handleCreateRetiro = async () => {
    if (!montoRetiro || !observacion.trim() || !selectedRetiroId) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Completa todos los campos' });
      return;
    }
    setSaving(true);
    try {
      await api.post(`/reportes/dinero-guardado/${filterId}/retiros`, {
        retiroId: selectedRetiroId,
        monto: Number(montoRetiro.replace(/[^0-9]/g, '')),
        observacion: observacion.trim()
      });
      setModalVisible(false);
      setMontoRetiro('');
      setObservacion('');
      setSelectedRetiroId(null);
      Toast.show({ type: 'success', text1: 'Éxito', text2: 'Retiro registrado' });
      loadData();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: err?.message || 'No se pudo guardar' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBaseManual = async () => {
    if (!montoBase) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Ingresa el monto de la base' });
      return;
    }
    setSaving(true);
    try {
      await api.post(`/reportes/dinero-guardado/${filterId}/base`, {
        valor: Number(montoBase.replace(/[^0-9]/g, '')),
        observacion: observacionBase.trim()
      });
      setModalBaseVisible(false);
      setMontoBase('');
      setObservacionBase('');
      Toast.show({ type: 'success', text1: 'Éxito', text2: 'Base manual agregada' });
      loadData();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: err?.message || 'No se pudo guardar' });
    } finally {
      setSaving(false);
    }
  };

  const handleEliminarRetiro = async (retiroId: string) => {
    try {
      await api.delete(`/reportes/dinero-guardado/retiros/${retiroId}`);
      Toast.show({ type: 'success', text1: 'Eliminado', text2: 'Retiro eliminado' });
      loadData();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: err?.message || 'No se pudo eliminar' });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb', justifyContent: 'center', alignItems: 'center' }}>
        <View className="bg-white p-8 rounded-3xl shadow-sm items-center w-3/4">
          <ActivityIndicator size="large" color="#16a34a" />
          <Text className="text-gray-800 font-bold text-lg mt-4">Analizando Reporte</Text>
          <Text className="text-gray-400 text-sm mt-1 text-center">Calculando saldos y retiros...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !detalle) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 justify-center items-center">
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
        <Text className="text-gray-600 mt-4 text-center px-8">{error || 'Reporte no disponible'}</Text>
        <TouchableOpacity className="mt-4 bg-gray-200 px-6 py-3 rounded-xl" onPress={loadData}>
          <Text className="font-bold text-gray-700">Reintentar</Text>
        </TouchableOpacity>
        <TouchableOpacity className="mt-3 bg-green-600 px-6 py-3 rounded-xl" onPress={() => navigation.goBack()}>
          <Text className="text-white font-bold">Volver</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!detalle.reporte) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 justify-center items-center">
        <Ionicons name="alert-circle-outline" size={48} color="#f59e0b" />
        <Text className="text-gray-600 mt-4 text-center px-8">Datos del reporte vacíos</Text>
        <Text className="text-gray-400 mt-2 text-sm">ID: {filterId}</Text>
        <TouchableOpacity className="mt-4 bg-gray-200 px-6 py-3 rounded-xl" onPress={loadData}>
          <Text className="font-bold text-gray-700">Reintentar</Text>
        </TouchableOpacity>
        <TouchableOpacity className="mt-3 bg-green-600 px-6 py-3 rounded-xl" onPress={() => navigation.goBack()}>
          <Text className="text-white font-bold">Volver</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const retirosOriginales: DineroRetirado[] = detalle.retiros || [];
  
  const computedTotalRetirado = retirosOriginales.reduce((sum, item) => sum + (Number(item.retiro) || 0), 0);
  const computedSobrante = (Number(detalle.plataGuardadaInicial) || 0) - computedTotalRetirado;

  const retiros = retirosOriginales.filter(item => 
    (item.observacion || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(item.valor || '').includes(searchQuery) ||
    String(item.retiro || '').includes(searchQuery)
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
      <View className="bg-green-600 px-4 py-3 flex-row items-center justify-between shadow-sm z-10 relative">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 p-1">
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        
        <View className="flex-1 bg-green-700/80 rounded-xl flex-row items-center px-3 py-2">
          <Ionicons name="search" size={18} color="#a7f3d0" />
          <TextInput
            className="flex-1 ml-2 text-white font-bold text-sm p-0 m-0"
            placeholder="Buscar gastos o valores..."
            placeholderTextColor="#a7f3d0"
            value={searchQuery}
            onChangeText={setSearchQuery}
            selectionColor="white"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#a7f3d0" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={handleExportPDF} className="ml-3 p-1">
          <Ionicons name="document-text" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: '#f9fafb' }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#16a34a']} />}
        showsVerticalScrollIndicator={false}
      >
        <View className="bg-white p-5 border-b border-gray-200">
          <Text className="text-4xl font-black text-gray-800 mb-1">{fMoney(detalle.plataGuardadaInicial)}</Text>
          <Text className="text-2xl font-bold text-green-600 mb-4">{fMoney(computedSobrante)}</Text>

          <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">TIPO DE FILTRO</Text>
          <Text className="text-base text-gray-800 font-bold mb-4">REPORTE DE DINERO GUARDADO</Text>

          <Text className="text-sm text-gray-500">Te has gastado:</Text>
          <Text className="text-base font-bold text-red-600">{fMoney(computedTotalRetirado)}</Text>

          <Text className="text-sm text-gray-500 mt-2">Desde</Text>
          <Text className="text-base font-bold text-gray-800">
            {detalle.reporte.desde ? format(new Date(detalle.reporte.desde), "d 'de' MMM. 'de' yyyy", { locale: es }) : '-'}
          </Text>

          <Text className="text-sm text-gray-500 mt-2">Hasta</Text>
          <Text className="text-base font-bold text-gray-800">
            {detalle.reporte.hasta ? format(new Date(detalle.reporte.hasta), "d 'de' MMM. 'de' yyyy", { locale: es }) : '-'}
          </Text>
        </View>

        <View className="bg-white mt-2 mb-6">
          <View className="flex-row justify-between items-center p-4 border-b border-gray-100">
            <Text className="text-lg font-bold text-gray-800">Retiros Registrados</Text>
            <View className="bg-gray-100 px-2 py-1 rounded-md">
              <Text className="font-bold text-gray-600">{retiros.length}</Text>
            </View>
          </View>

          <View className="flex-row px-4 py-2 border-b border-gray-100 bg-gray-50">
            <View className="w-10" />
            <Text className="flex-1 font-bold text-gray-700 text-center">Retiro</Text>
            <Text className="flex-1 font-bold text-gray-700 text-center">Sobrante</Text>
            <Text className="flex-1 font-bold text-gray-700 text-right">Base</Text>
          </View>

          {retiros.length === 0 ? (
            <View className="p-8 items-center">
              <Ionicons name="search-outline" size={48} color="#d1d5db" />
              <Text className="text-gray-400 mt-3">Sin resultados</Text>
            </View>
          ) : (
            retiros.map((item) => (
              <View key={item.IDretiro} className="border-b border-gray-100 bg-white">
                <View className="flex-row px-4 py-3 items-center">
                  <View className="w-10">
                    {canDelete && (
                      <TouchableOpacity onPress={() => handleEliminarRetiro(item.IDretiro)}>
                        <Ionicons name="trash-outline" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text className="flex-1 font-bold text-red-500 text-center text-base">
                    {Number(item.retiro) > 0 ? `-${fMoney(item.retiro)}` : '$0'}
                  </Text>
                  <Text className="flex-1 font-black text-green-600 text-center text-base">
                    {fMoney(item.sobrante)}
                  </Text>
                  <Text className="flex-1 font-bold text-gray-800 text-right text-base">
                    {fMoney(item.valor)}
                  </Text>
                </View>
                <View className="px-4 pb-3 flex-row justify-between items-center">
                  <View className="flex-1 mr-2">
                    {item.observacion ? (
                      <Text className="text-xs text-gray-500">{item.observacion}</Text>
                    ) : (
                      <Text className="text-xs text-gray-400 italic">Sin retiros registrados</Text>
                    )}
                  </View>
                  {canEdit && (
                    <TouchableOpacity
                      className="bg-green-600 px-3 py-1.5 rounded-lg flex-row items-center"
                      onPress={() => { setSelectedRetiroId(item.IDretiro); setModalVisible(true); }}
                    >
                      <Ionicons name="create-outline" size={16} color="white" />
                      <Text className="text-white font-bold text-xs ml-1">Agregar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}

          {canEdit && (
            <View className="px-4 py-4 border-t border-gray-100">
              <TouchableOpacity 
                className="bg-green-600 py-3 rounded-xl flex-row justify-center items-center"
                onPress={() => setModalBaseVisible(true)}
              >
                <Ionicons name="add-circle-outline" size={20} color="white" />
                <Text className="text-white font-bold ml-2">Agregar Base Manual</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', marginBottom: Platform.OS === 'android' ? keyboardHeight : 0 }}>
            <TouchableOpacity activeOpacity={1} style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }}>
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-xl font-bold text-gray-800">Registrar Retiro</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <Text className="text-sm font-bold text-gray-500 mb-1 ml-1">Monto de Retiro *</Text>
              <View className="flex-row items-center border border-gray-300 rounded-lg px-3 py-3 mb-4">
                <Text className="text-lg font-bold text-gray-500 mr-2">$</Text>
                <TextInput
                  className="flex-1 text-lg text-gray-800 font-bold"
                  placeholder="0"
                  keyboardType="numeric"
                  value={montoRetiro ? new Intl.NumberFormat('es-CO').format(Number(montoRetiro)) : ''}
                  onChangeText={(t) => setMontoRetiro(t.replace(/[^0-9]/g, ''))}
                />
              </View>

              <Text className="text-sm font-bold text-gray-500 mb-1 ml-1">Observación *</Text>
              <TextInput
                className="border border-gray-300 rounded-lg px-3 py-3 text-base text-gray-800 mb-6"
                placeholder="Ej. Pago a proveedor"
                value={observacion}
                onChangeText={setObservacion}
              />

              <View className="flex-row justify-end space-x-3">
                <TouchableOpacity className="px-5 py-3 rounded-lg border border-gray-300 mr-2" onPress={() => setModalVisible(false)}>
                  <Text className="text-gray-600 font-bold">Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity className="px-5 py-3 rounded-lg bg-green-600" onPress={handleCreateRetiro} disabled={saving}>
                  {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold">Guardar</Text>}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      <Modal visible={modalBaseVisible} transparent animationType="fade" onRequestClose={() => setModalBaseVisible(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setModalBaseVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', marginBottom: Platform.OS === 'android' ? keyboardHeight : 0 }}>
            <TouchableOpacity activeOpacity={1} style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }}>
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-xl font-bold text-gray-800">Registrar Base Manual</Text>
                <TouchableOpacity onPress={() => setModalBaseVisible(false)}>
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <Text className="text-sm font-bold text-gray-500 mb-1 ml-1">Monto Inicial (Base) *</Text>
              <View className="flex-row items-center border border-gray-300 rounded-lg px-3 py-3 mb-4">
                <Text className="text-lg font-bold text-gray-500 mr-2">$</Text>
                <TextInput
                  className="flex-1 text-lg text-gray-800 font-bold"
                  placeholder="0"
                  keyboardType="numeric"
                  value={montoBase ? new Intl.NumberFormat('es-CO').format(Number(montoBase)) : ''}
                  onChangeText={(t) => setMontoBase(t.replace(/[^0-9]/g, ''))}
                />
              </View>

              <Text className="text-sm font-bold text-gray-500 mb-1 ml-1">Observación (Opcional)</Text>
              <TextInput
                className="border border-gray-300 rounded-lg px-3 py-3 text-base text-gray-800 mb-6"
                placeholder="Ej. Saldo inicial mes"
                value={observacionBase}
                onChangeText={setObservacionBase}
              />

              <View className="flex-row justify-end space-x-3">
                <TouchableOpacity className="px-5 py-3 rounded-lg border border-gray-300 mr-2" onPress={() => setModalBaseVisible(false)}>
                  <Text className="text-gray-600 font-bold">Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity className="px-5 py-3 rounded-lg bg-green-600" onPress={handleCreateBaseManual} disabled={saving}>
                  {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold">Guardar</Text>}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}