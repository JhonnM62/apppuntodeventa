import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import api from '../../services/api';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { Picker } from '@react-native-picker/picker';

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
      // Insumos form part of the response, wait we need to get insumos, not inventario
      const insResponse = await api.get('/insumos');
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
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between p-4 bg-white shadow-sm border-b border-gray-200 z-10">
        <TouchableOpacity onPress={() => navigation.goBack()} className="flex-row items-center">
          <Ionicons name="arrow-back" size={24} color="#333" />
          <Text className="text-lg font-bold text-gray-800 ml-2">Revisión de IA</Text>
        </TouchableOpacity>
        <Text className="text-gray-500">{items.length} ítems</Text>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView className="flex-1 p-4" keyboardShouldPersistTaps="handled">
          
          {/* Chat / Reprompt Area */}
          <View className="bg-white p-4 rounded-2xl shadow-sm border border-green-200 mb-6 flex-row items-end">
            <View className="flex-1 mr-3">
              <Text className="text-xs font-bold text-green-600 mb-1">🪄 CORRECCIÓN MÁGICA CON IA</Text>
              <TextInput
                className="bg-gray-100 rounded-xl p-3 text-sm min-h-[50px] text-gray-800"
                placeholder="Ej: El lulo estaba a 3000, borra el limón..."
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
                  <Text className="font-bold text-gray-800 flex-1" numberOfLines={1}>
                    📝 Original: {item.nombreExtraido}
                  </Text>
                  <TouchableOpacity onPress={() => removeItem(index)} className="p-1">
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>

                {/* Dropdown de Insumo */}
                <View className={`border rounded-xl mb-3 overflow-hidden ${hasError ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-gray-50'}`}>
                  <Picker
                    selectedValue={item.insumoId}
                    onValueChange={(val) => updateItem(index, 'insumoId', val)}
                    style={{ height: 50 }}
                  >
                    <Picker.Item label="⚠️ Seleccionar insumo..." value={null} color="red" />
                    {insumosCatalog.map(ins => (
                      <Picker.Item key={ins.IDalimentos} label={ins.nombre} value={ins.IDalimentos} />
                    ))}
                  </Picker>
                </View>

                {/* Cantidad y Precio */}
                <View className="flex-row justify-between">
                  <View className="flex-1 mr-2">
                    <Text className="text-xs text-gray-500 font-bold mb-1 ml-1">CANTIDAD</Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-200 rounded-xl p-3 text-gray-800 text-center font-bold"
                      keyboardType="numeric"
                      value={item.cantidad.toString()}
                      onChangeText={(val) => updateItem(index, 'cantidad', parseFloat(val) || 0)}
                    />
                  </View>
                  <View className="flex-1 ml-2">
                    <Text className="text-xs text-gray-500 font-bold mb-1 ml-1">PRECIO UNID.</Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-200 rounded-xl p-3 text-gray-800 text-center font-bold"
                      keyboardType="numeric"
                      value={item.precioUnitario.toString()}
                      onChangeText={(val) => updateItem(index, 'precioUnitario', parseFloat(val) || 0)}
                    />
                  </View>
                </View>

                {item.observacion ? (
                  <Text className="text-xs text-gray-400 mt-2 italic">"{item.observacion}"</Text>
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
      <View className="bg-white p-4 border-t border-gray-200 shadow-lg">
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
