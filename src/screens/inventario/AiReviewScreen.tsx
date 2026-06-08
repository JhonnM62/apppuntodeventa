import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import api from '../../services/api';
import { RootStackParamList } from '../../navigation/RootNavigator';

const SearchableInsumoDropdown = ({ selectedValue, onValueChange, insumosCatalog, hasError }: any) => {
  const [visible, setVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const selectedItem = insumosCatalog.find((i: any) => i.IDalimentos === selectedValue);

  // Extraer categorías únicas
  const categories = Array.from(new Set(insumosCatalog.map((i: any) => i.categoriaNombre || i.nombreCategoria).filter(Boolean))) as string[];

  const filteredInsumos = insumosCatalog.filter((ins: any) => {
    const cat = ins.categoriaNombre || ins.nombreCategoria;
    const matchesSearch = ins.nombre?.toLowerCase().includes(searchText.toLowerCase());
    const matchesCategory = selectedCategory ? cat === selectedCategory : true;
    return matchesSearch && matchesCategory;
  }).sort((a: any, b: any) => {
    // El elemento seleccionado siempre aparece de primero
    if (a.IDalimentos === selectedValue) return -1;
    if (b.IDalimentos === selectedValue) return 1;
    // Luego ordenamos alfabéticamente
    return (a.nombre || '').localeCompare(b.nombre || '');
  });

  return (
    <>
      <TouchableOpacity 
        style={{ padding: 14, paddingRight: 8, backgroundColor: hasError ? '#fef2f2' : '#f9fafb', borderColor: hasError ? '#fca5a5' : '#d1d5db', borderWidth: 1, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} 
        onPress={() => setVisible(true)}
      >
        <Text style={{ color: selectedItem ? '#1f2937' : '#ef4444', flex: 1, paddingRight: 8 }} numberOfLines={1}>
          {selectedItem ? selectedItem.nombre : '⚠️ Seleccionar insumo...'}
        </Text>
        {selectedItem ? (
          <TouchableOpacity 
            onPress={(e) => { e.stopPropagation(); onValueChange(null); }} 
            style={{ padding: 6 }}
          >
            <Ionicons name="close-circle" size={22} color="#ef4444" />
          </TouchableOpacity>
        ) : (
          <Ionicons name="search" size={20} color="#6b7280" style={{ padding: 6 }} />
        )}
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '80%', padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1f2937' }}>Seleccionar Insumo</Text>
              <TouchableOpacity onPress={() => setVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {/* Search Bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 12, marginBottom: 12 }}>
              <Ionicons name="search" size={20} color="#9ca3af" />
              <TextInput
                style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 8, color: '#1f2937' }}
                placeholder="Buscar insumo por nombre..."
                placeholderTextColor="#9ca3af"
                value={searchText}
                onChangeText={setSearchText}
              />
              {searchText ? (
                <TouchableOpacity onPress={() => setSearchText('')}>
                  <Ionicons name="close-circle" size={20} color="#9ca3af" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Categories */}
            {categories.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
                  <TouchableOpacity
                    style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: selectedCategory === null ? '#22c55e' : '#f3f4f6', marginRight: 8 }}
                    onPress={() => setSelectedCategory(null)}
                  >
                    <Text style={{ color: selectedCategory === null ? '#fff' : '#4b5563', fontWeight: 'bold' }}>Todos</Text>
                  </TouchableOpacity>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: selectedCategory === cat ? '#22c55e' : '#f3f4f6', marginRight: 8 }}
                      onPress={() => setSelectedCategory(cat)}
                    >
                      <Text style={{ color: selectedCategory === cat ? '#fff' : '#4b5563', fontWeight: 'bold' }}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* List */}
            <ScrollView keyboardShouldPersistTaps="handled">
              <TouchableOpacity 
                style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
                onPress={() => { onValueChange(null); setVisible(false); }}
              >
                <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>⚠️ Desvincular (Ninguno)</Text>
              </TouchableOpacity>
              
              {filteredInsumos.map((ins: any) => {
                const cat = ins.categoriaNombre || ins.nombreCategoria;
                return (
                  <TouchableOpacity 
                    key={ins.IDalimentos} 
                    style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                    onPress={() => { onValueChange(ins.IDalimentos); setVisible(false); }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ color: '#1f2937', fontWeight: selectedValue === ins.IDalimentos ? 'bold' : 'normal' }}>
                        {ins.nombre}
                      </Text>
                      <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
                        Categoría: {cat || 'Sin categoría'} | Precio: {ins.precio || 0}
                      </Text>
                    </View>
                    {selectedValue === ins.IDalimentos && <Ionicons name="checkmark-circle" size={24} color="#22c55e" />}
                  </TouchableOpacity>
                );
              })}
              
              {filteredInsumos.length === 0 && (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: '#9ca3af' }}>No se encontraron insumos.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

type ReviewScreenRouteProp = RouteProp<RootStackParamList, 'AiReview'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'AiReview'>;

interface ExtractedItem {
  insumoId: string | null;
  nombreExtraido: string;
  cantidad: number;
  precioUnitario: number;
  observacion?: string;
  _idLocal?: string; // Para key de React
}

const AiReviewScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ReviewScreenRouteProp>();
  const { extractedData, rawSource, type, targetInventarioId } = route.params;

  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [insumosCatalog, setInsumosCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [correctionPrompt, setCorrectionPrompt] = useState('');

  useEffect(() => {
    // Inicializar IDs locales para evitar problemas al re-renderizar listas
    if (extractedData && Array.isArray(extractedData)) {
      setItems(extractedData.map(item => ({ ...item, _idLocal: Math.random().toString(36).substring(7) })));
    }
    fetchCatalog();
  }, [extractedData]);

  const fetchCatalog = async () => {
    try {
      const response = await api.get('/inventario');
      // Obtener TODOS los insumos para el catálogo local
      const insResponse = await api.get('/insumos?limit=1000');
      setInsumosCatalog(insResponse.data.data || insResponse.data || []);
    } catch (error) {
      console.error('Error cargando insumos:', error);
    }
  };

  const updateItem = (index: number, field: keyof ExtractedItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    Alert.alert('Eliminar', '¿Quitar este ítem de la lista?', [
      { text: 'Cancelar', style: 'cancel' },
      { 
        text: 'Eliminar', 
        style: 'destructive',
        onPress: () => {
          const newItems = [...items];
          newItems.splice(index, 1);
          setItems(newItems);
        }
      }
    ]);
  };

  const sendCorrectionToAi = async () => {
    if (!correctionPrompt.trim()) return;
    
    setLoading(true);
    try {
      const response = await api.post('/ai/refine-extraction', {
        previousData: items.map(({ _idLocal, ...rest }) => rest), // Removemos keys temporales
        correctionPrompt,
        context: 'inventario'
      });
      
      const refinedData = response.data;
      if (Array.isArray(refinedData)) {
        setItems(refinedData.map(item => ({ ...item, _idLocal: Math.random().toString(36).substring(7) })));
        setCorrectionPrompt('');
      } else {
        throw new Error('Formato inválido de la IA');
      }
    } catch (error: any) {
      console.error('Error refinando:', error);
      Alert.alert('Error IA', error.response?.data?.message || 'No se pudo aplicar la corrección.');
    } finally {
      setLoading(false);
    }
  };

  const saveAll = async () => {
    // Validación
    const invalidItems = items.filter(item => !item.insumoId || item.cantidad <= 0 || item.precioUnitario < 0);
    if (invalidItems.length > 0) {
      Alert.alert('Validación Fallida', 'Hay ítems sin insumo mapeado o con cantidades/precios inválidos. Revisa las filas rojas.');
      return;
    }

    if (items.length === 0) {
      Alert.alert('Vacío', 'No hay ítems para guardar.');
      return;
    }

    setSaving(true);
    try {
      let inventarioId = targetInventarioId;
      
      if (!inventarioId) {
        // 1. Crear el registro padre (Inventario - ENTRADA)
        const inventarioRes = await api.post('/inventario', {
          tipo: 'ENTRADA',
          observaciones: `Carga masiva vía IA (${type})`
        });
        inventarioId = inventarioRes.data.IDinventario;
      }

      // 2. Preparar el array para el bulk
      const bulkPayload = items.map(item => ({
        IDinventario: inventarioId,
        nombreDelAlimento: item.insumoId, // Backend usa el IDalimentos en este campo
        cantidad: Number(item.cantidad),
        precioActual: Number(item.precioUnitario),
        precio: Number(item.precioUnitario),
        subtotal: Number(item.cantidad) * Number(item.precioUnitario),
        observacion: item.observacion || ''
      }));

      // 3. Enviar todo al endpoint bulk
      await api.post('/inventario/items/bulk', bulkPayload);
      
      // 4. Marcar la factura completa para recalcular (opcional pero seguro)
      await api.post('/inventario/recalcular-stock');

      Alert.alert('¡Éxito!', 'Los insumos se han cargado correctamente.', [
        { text: 'OK', onPress: () => navigation.navigate('Inventario') }
      ]);
      
    } catch (error: any) {
      console.error('Error guardando:', error);
      Alert.alert('Error', error.response?.data?.message || 'Hubo un error guardando los insumos.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between p-4 bg-white shadow-sm border-b border-gray-200 z-10">
        <TouchableOpacity onPress={() => navigation.goBack()} className="flex-row items-center">
          <Ionicons name="arrow-back" size={24} color="#333" />
          <Text className="text-lg font-bold text-gray-800 ml-2" style={{ color: '#1f2937' }}>Revisión de IA</Text>
        </TouchableOpacity>
        <Text className="text-gray-500" style={{ color: '#6b7280' }}>{items.length} ítems</Text>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          
          {/* Chat / Reprompt Area */}
          <View className="bg-white p-4 rounded-2xl shadow-sm border border-green-200 mb-6 flex-row items-end">
            <View className="flex-1 mr-3">
              <Text className="text-xs font-bold text-green-600 mb-1">🪄 CORRECCIÓN MÁGICA CON IA</Text>
              <TextInput
                className="bg-gray-100 rounded-xl p-3 text-sm min-h-[50px] text-gray-800"
                style={{ color: '#1f2937' }}
                placeholder="Ej: El lulo estaba a 3000, borra el limón..."
                placeholderTextColor="#9ca3af"
                value={correctionPrompt}
                onChangeText={setCorrectionPrompt}
                multiline
              />
            </View>
            <TouchableOpacity 
              onPress={sendCorrectionToAi}
              disabled={loading || !correctionPrompt.trim()}
              className={`h-[50px] w-[50px] rounded-full justify-center items-center ${correctionPrompt.trim() ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Ionicons name="send" size={20} color="#FFF" style={{ marginLeft: 3 }} />
              )}
            </TouchableOpacity>
          </View>

          {/* Lista de Items */}
          {items.map((item, index) => {
            const hasError = !item.insumoId;
            return (
              <View key={item._idLocal} className={`bg-white p-4 rounded-2xl shadow-sm border mb-4 ${hasError ? 'border-red-400' : 'border-gray-200'}`}>
                
                {/* Header: Eliminar */}
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="font-bold text-gray-800 flex-1" style={{ color: '#1f2937' }} numberOfLines={1}>
                    📝 Original: {item.nombreExtraido}
                  </Text>
                  <TouchableOpacity onPress={() => removeItem(index)} className="p-1">
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>

                {/* Dropdown de Insumo Custom */}
                <View className="mb-3">
                  <SearchableInsumoDropdown
                    hasError={hasError}
                    selectedValue={item.insumoId}
                    onValueChange={(val: any) => updateItem(index, 'insumoId', val)}
                    insumosCatalog={insumosCatalog}
                  />
                </View>

                {/* Cantidad y Precio */}
                <View className="flex-row justify-between">
                  <View className="flex-1 mr-2">
                    <Text className="text-xs text-gray-500 font-bold mb-1 ml-1" style={{ color: '#6b7280' }}>CANTIDAD</Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-200 rounded-xl p-3 text-gray-800 text-center font-bold"
                      style={{ color: '#1f2937' }}
                      keyboardType="numeric"
                      value={item.cantidad.toString()}
                      onChangeText={(val) => updateItem(index, 'cantidad', parseFloat(val) || 0)}
                    />
                  </View>
                  <View className="flex-1 ml-2">
                    <Text className="text-xs text-gray-500 font-bold mb-1 ml-1" style={{ color: '#6b7280' }}>PRECIO UNID.</Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-200 rounded-xl p-3 text-gray-800 text-center font-bold"
                      style={{ color: '#1f2937' }}
                      keyboardType="numeric"
                      value={item.precioUnitario.toString()}
                      onChangeText={(val) => updateItem(index, 'precioUnitario', parseFloat(val) || 0)}
                    />
                  </View>
                </View>

                {item.observacion ? (
                  <Text className="text-xs text-gray-400 mt-2 italic" style={{ color: '#9ca3af' }}>"{item.observacion}"</Text>
                ) : null}

              </View>
            );
          })}

          {items.length === 0 && !loading && (
            <View className="items-center justify-center py-10">
              <Ionicons name="receipt-outline" size={60} color="#ccc" />
              <Text className="text-gray-400 mt-4 text-center">No se encontraron insumos. Intenta corregir con la IA o volver a subir.</Text>
            </View>
          )}

          <View className="h-20" />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky Bottom Bar */}
      <View className="bg-white p-4 pb-28 border-t border-gray-200 shadow-lg">
        <TouchableOpacity
          className={`rounded-xl py-4 items-center shadow-sm flex-row justify-center ${saving || items.length === 0 ? 'bg-gray-400' : 'bg-green-600'}`}
          onPress={saveAll}
          disabled={saving || items.length === 0}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={24} color="#FFF" />
              <Text className="text-white font-bold text-lg ml-2">Confirmar y Guardar Todo</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      
    </SafeAreaView>
  );
};

export default AiReviewScreen;
