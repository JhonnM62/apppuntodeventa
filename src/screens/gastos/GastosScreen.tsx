import React, { useEffect, useState } from 'react';
import { View, FlatList, SectionList, TouchableOpacity, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/ui/text';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useGastosStore } from '../../store/useGastosStore';
import { Gasto } from '../../services/gastos';
import GastosFormModal from './GastosFormModal';
import GastosBulkModal from './GastosBulkModal';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { usePermissions } from '../../hooks/usePermissions';
import { useSocketEvent } from '../../hooks/useSocketEvent';
import { SocketEvent } from '../../types/socket.types';
import { useCustomAlert } from '../../context/CustomAlertContext';

export default function GastosScreen({ navigation }: any) {
  const { showAlert } = useCustomAlert();
  const { gastos, isLoading, fetchGastos, removeGasto } = useGastosStore();
  const { canCreate, canEdit, canDelete } = usePermissions('gastos');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedGasto, setSelectedGasto] = useState<Gasto | null>(null);
  const [filterTipo, setFilterTipo] = useState<'TODOS' | 'NEGOCIO' | 'PERSONAL'>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');

  // Bulk IA state
  const [bulkModalVisible, setBulkModalVisible] = useState(false);

  // Filter state
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [filterFechaDesde, setFilterFechaDesde] = useState('');
  const [filterFechaHasta, setFilterFechaHasta] = useState('');
  const [filterMedioDePago, setFilterMedioDePago] = useState('Todos');
  const [showDatePicker, setShowDatePicker] = useState<{show: boolean, type: 'desde' | 'hasta'}>({show: false, type: 'desde'});

  const activeFiltersCount = (filterFechaDesde ? 1 : 0) + (filterFechaHasta ? 1 : 0) + (filterMedioDePago !== 'Todos' ? 1 : 0);

  useEffect(() => {
    fetchGastos({
      fechaDesde: filterFechaDesde || undefined,
      fechaHasta: filterFechaHasta || undefined,
      medioDePago: filterMedioDePago !== 'Todos' ? filterMedioDePago : undefined,
    });
  }, [fetchGastos, filterFechaDesde, filterFechaHasta, filterMedioDePago]);

  useSocketEvent<any>(SocketEvent.REFRESH_GASTOS, () => {
    fetchGastos();
  }, [fetchGastos]);

  const handleAdd = () => {
    setSelectedGasto(null);
    setModalVisible(true);
  };

  const handleEdit = (gasto: Gasto) => {
    setSelectedGasto(gasto);
    setModalVisible(true);
  };

  const handleDelete = (id: string) => {
    showAlert({
      type: 'confirm',
      title: 'Eliminar Gasto',
      message: '¿Estás seguro de eliminar este gasto?',
      confirmText: 'Eliminar',
      onConfirm: () => removeGasto(id),
      onCancel: () => {},
    });
  };

  const renderItem = ({ item }: { item: Gasto }) => (
    <TouchableOpacity
      className="bg-white p-4 mb-3 rounded-xl flex-row justify-between items-center shadow-sm border border-gray-100"
      onPress={() => canEdit ? handleEdit(item) : null}
      activeOpacity={canEdit ? 0.2 : 1}
    >
      <View className="flex-1">
        <View className="flex-row items-center mb-1">
          <View className={`px-2 py-1 rounded-md mr-2 ${item.tipo === 'NEGOCIO' ? 'bg-blue-100' : 'bg-purple-100'}`}>
            <Text className={`text-xs font-bold ${item.tipo === 'NEGOCIO' ? 'text-blue-700' : 'text-purple-700'}`}>
              {item.tipo}
            </Text>
          </View>
          <Text className="text-xs text-gray-500">
            {item.fechaYHora ? format(new Date(item.fechaYHora), "d MMM yyyy, h:mm a", { locale: es }) : ''}
          </Text>
        </View>
        <Text className="text-base font-bold text-gray-800 mb-1">{item.concepto}</Text>
        {item.medioDePago && (
          <Text className="text-xs text-gray-500">Medio: {item.medioDePago}</Text>
        )}
      </View>
      
      <View className="items-end ml-2">
        <Text className="text-lg font-bold text-red-500">
          - {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(item.valor || 0)}
        </Text>
        <View className="flex-row mt-2">
          {item.fotos && (
            <Ionicons name="document-attach-outline" size={18} color="#6b7280" style={{ marginRight: 10 }} />
          )}
          {canDelete && (
            <TouchableOpacity onPress={() => handleDelete(item.IDgastos)}>
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const counts = {
    TODOS: gastos.length,
    NEGOCIO: gastos.filter(g => g.tipo === 'NEGOCIO').length,
    PERSONAL: gastos.filter(g => g.tipo === 'PERSONAL').length
  };

  const filteredGastos = gastos.filter(g => {
    const matchesTipo = filterTipo === 'TODOS' ? true : g.tipo === filterTipo;
    const query = searchQuery.toLowerCase();
    const matchesSearch = query === '' || 
      (g.concepto && g.concepto.toLowerCase().includes(query)) ||
      (g.medioDePago && g.medioDePago.toLowerCase().includes(query)) ||
      (g.tipo && g.tipo.toLowerCase().includes(query)) ||
      (g.valor && g.valor.toString().includes(query));
      
    return matchesTipo && matchesSearch;
  });
  
  const sortedGastos = [...filteredGastos].sort((a, b) => {
    const dateA = a.fechaYHora ? new Date(a.fechaYHora).getTime() : 0;
    const dateB = b.fechaYHora ? new Date(b.fechaYHora).getTime() : 0;
    return dateB - dateA;
  });

  const groupedGastos = sortedGastos.reduce((acc: {title: string, data: Gasto[], total: number}[], gasto) => {
    const date = gasto.fechaYHora ? new Date(gasto.fechaYHora) : new Date();
    const monthYear = format(date, "MMMM yyyy", { locale: es });
    const title = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
    
    const valorGasto = Number(gasto.valor) || 0;
    
    const existingSection = acc.find(section => section.title === title);
    if (existingSection) {
      existingSection.data.push(gasto);
      existingSection.total += valorGasto;
    } else {
      acc.push({ title, data: [gasto], total: valorGasto });
    }
    return acc;
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top', 'bottom']}>
      <View className="bg-green-600 px-4 py-4 flex-row items-center justify-between shadow-sm z-10">
        <View className="flex-row items-center flex-1">
          <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 p-1">
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          
          <View className="flex-1 bg-white/20 rounded-full flex-row items-center px-3 py-1.5 mr-3">
            <Ionicons name="search" size={18} color="white" />
            <TextInput 
              placeholder="Buscar gasto..."
              placeholderTextColor="rgba(255,255,255,0.7)"
              className="flex-1 ml-2 text-white py-1"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity onPress={() => setShowFilterSheet(true)} className="relative">
              <Ionicons name="options-outline" size={22} color="white" />
              {activeFiltersCount > 0 && (
                <View className="absolute -top-1 -right-1 bg-red-500 w-3 h-3 rounded-full border-2 border-green-600" />
              )}
            </TouchableOpacity>
          </View>
        </View>
        {canCreate && (
          <View className="flex-row items-center">
            <TouchableOpacity 
              onPress={() => setBulkModalVisible(true)}
              className="bg-white/20 p-2 rounded-full mr-2"
            >
              <Ionicons name="layers-outline" size={24} color="white" />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={handleAdd}
              className="bg-white/20 p-2 rounded-full"
            >
              <Ionicons name="add" size={24} color="white" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tabs Modernos (Segmented Control) */}
      <View className="px-4 pt-4 pb-2 z-0">
        <View className="flex-row bg-gray-200/60 p-1 rounded-2xl">
          {(['TODOS', 'NEGOCIO', 'PERSONAL'] as const).map((tab) => {
            const isActive = filterTipo === tab;
            let activeTextColor = 'text-green-600';
            if (tab === 'NEGOCIO') activeTextColor = 'text-blue-600';
            if (tab === 'PERSONAL') activeTextColor = 'text-purple-600';
            
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setFilterTipo(tab)}
                className={`flex-1 py-3 items-center rounded-xl ${isActive ? 'bg-white shadow-sm' : ''}`}
              >
                <Text className={`text-[11px] font-bold uppercase text-center ${isActive ? activeTextColor : 'text-gray-500'}`}>
                  {tab === 'TODOS' ? 'Todos' : tab === 'NEGOCIO' ? 'Negocio' : 'Personal'} ({counts[tab]})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {isLoading && gastos.length === 0 ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      ) : (
        <SectionList
          sections={groupedGastos}
          keyExtractor={(item) => item.IDgastos}
          renderItem={renderItem}
          renderSectionHeader={({ section: { title, total } }) => (
            <View className="bg-gray-50/90 py-2 mb-3 mt-2 border-b border-gray-200 flex-row justify-between items-center">
              <Text className="text-sm font-black text-gray-500 uppercase tracking-wider">{title}</Text>
              <Text className="text-sm font-black text-red-500 tracking-wider">
                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(total)}
              </Text>
            </View>
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={
            <View className="items-center justify-center mt-10">
              <Ionicons name="wallet-outline" size={60} color="#d1d5db" />
              <Text className="text-gray-400 mt-4 text-base">No hay gastos registrados</Text>
            </View>
          }
          stickySectionHeadersEnabled={false}
        />
      )}

      <GastosFormModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        gastoToEdit={selectedGasto}
      />

      <GastosBulkModal
        visible={bulkModalVisible}
        onClose={() => setBulkModalVisible(false)}
      />

      <Modal visible={showFilterSheet} transparent animationType="slide" onRequestClose={() => setShowFilterSheet(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setShowFilterSheet(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}
          >
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-gray-800">Filtros</Text>
              <TouchableOpacity onPress={() => setShowFilterSheet(false)} className="bg-gray-100 p-2 rounded-full">
                <Ionicons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View className="mb-4">
              <Text className="text-sm font-bold text-gray-600 mb-2">Rango de fechas</Text>
              <View className="flex-row items-center justify-between">
                <TouchableOpacity
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mr-2 flex-row items-center"
                  onPress={() => setShowDatePicker({ show: true, type: 'desde' })}
                >
                  <Ionicons name="calendar-outline" size={16} color="#6b7280" style={{ marginRight: 6 }} />
                  <Text className={filterFechaDesde ? 'text-gray-800' : 'text-gray-400'}>
                    {filterFechaDesde || 'Desde (YYYY-MM-DD)'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 ml-2 flex-row items-center"
                  onPress={() => setShowDatePicker({ show: true, type: 'hasta' })}
                >
                  <Ionicons name="calendar-outline" size={16} color="#6b7280" style={{ marginRight: 6 }} />
                  <Text className={filterFechaHasta ? 'text-gray-800' : 'text-gray-400'}>
                    {filterFechaHasta || 'Hasta (YYYY-MM-DD)'}
                  </Text>
                </TouchableOpacity>
              </View>

              {showDatePicker.show && (
                <DateTimePicker
                  value={
                    showDatePicker.type === 'desde' && filterFechaDesde 
                      ? new Date(filterFechaDesde + 'T12:00:00') 
                      : showDatePicker.type === 'hasta' && filterFechaHasta 
                        ? new Date(filterFechaHasta + 'T12:00:00') 
                        : new Date()
                  }
                  mode="date"
                  display="default"
                  onChange={(event, selectedDate) => {
                    setShowDatePicker({ show: false, type: 'desde' });
                    if (event.type === 'set' && selectedDate) {
                      const dateString = selectedDate.toISOString().split('T')[0];
                      if (showDatePicker.type === 'desde') {
                        setFilterFechaDesde(dateString);
                      } else {
                        setFilterFechaHasta(dateString);
                      }
                    }
                  }}
                />
              )}
            </View>

            <View className="mb-6">
              <Text className="text-sm font-bold text-gray-600 mb-2">Medio de Pago</Text>
              <View className="flex-row flex-wrap">
                {['Todos', 'Efectivo', 'Transferencia', 'Nequi', 'Bancolombia'].map((medio) => (
                  <TouchableOpacity
                    key={medio}
                    onPress={() => setFilterMedioDePago(medio)}
                    className={`px-4 py-2 rounded-full mr-2 mb-2 border ${filterMedioDePago === medio ? 'bg-green-100 border-green-500' : 'bg-gray-50 border-gray-200'}`}
                  >
                    <Text className={`font-bold ${filterMedioDePago === medio ? 'text-green-700' : 'text-gray-500'}`}>{medio}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View className="flex-row justify-between mt-2">
              <TouchableOpacity
                className="flex-1 py-4 border border-gray-200 rounded-xl mr-2 items-center"
                onPress={() => {
                  setFilterFechaDesde('');
                  setFilterFechaHasta('');
                  setFilterMedioDePago('Todos');
                }}
              >
                <Text className="text-gray-600 font-bold">Limpiar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-4 bg-green-600 rounded-xl ml-2 items-center"
                onPress={() => setShowFilterSheet(false)}
              >
                <Text className="text-white font-bold">Aplicar Filtros</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}
