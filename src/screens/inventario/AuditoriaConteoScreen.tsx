import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  FlatList,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, RADIUS, SPACING, FONT_SIZE } from '../../lib/theme';
import { eliminarConteo, editarConteo } from '../../services/caja';
import { insumosService } from '../../services/insumos';

interface ConteoItem {
  fecha: string;
  cajaId: string;
  disponibleEnSistema: number;
  cantContada: number;
  diferencia: number;
}

interface FlatConteoItem extends ConteoItem {
  insumoId: string;
  insumoNombre: string;
  unidadDeMedida: string;
  originalIndex: number;
}

interface AuditoriaConteoScreenProps {
  route?: {
    params?: {
      insumoId?: string;
      insumoNombre?: string;
    };
  };
  navigation?: any;
}

export default function AuditoriaConteoScreen({ route, navigation }: AuditoriaConteoScreenProps) {
  const [todosLosConteos, setTodosLosConteos] = useState<FlatConteoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<FlatConteoItem | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadAuditoria = useCallback(async () => {
    try {
      const data = await insumosService.getAll({ limit: 2000 });
      
      if (data && Array.isArray(data)) {
        const conteosPlanos: FlatConteoItem[] = [];
        
        data.forEach((insumo: any) => {
          let conteos = insumo.ultimosConteos;
          if (typeof conteos === 'string') {
            try { conteos = JSON.parse(conteos); } catch(e) { conteos = []; }
          }
          if (Array.isArray(conteos) && conteos.length > 0) {
            conteos.forEach((conteo: any, index: number) => {
              conteosPlanos.push({
                ...conteo,
                insumoId: insumo.IDalimentos,
                insumoNombre: insumo.nombre,
                unidadDeMedida: insumo.unidades || 'und',
                originalIndex: index,
              });
            });
          }
        });
        
        setTodosLosConteos(conteosPlanos);
      }
    } catch (error) {
      console.error('Error cargando auditoría:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAuditoria();
  }, [loadAuditoria]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAuditoria();
  }, [loadAuditoria]);

  const handleEliminarConteo = async (item: FlatConteoItem) => {
    Alert.alert(
      'Eliminar Conteo',
      `¿Estás seguro de eliminar este conteo del insumo "${item.insumoNombre}" en la caja ${item.cajaId.slice(0, 8)}...?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await eliminarConteo(item.cajaId, item.insumoId, item.originalIndex);
              loadAuditoria();
            } catch (error: any) {
              Alert.alert('Error', error?.response?.data?.message || 'No se pudo eliminar el conteo');
            }
          },
        },
      ]
    );
  };

  const handleEditSave = async () => {
    if (!editingItem) return;
    
    const numValue = Number(editValue);
    if (isNaN(numValue) || numValue < 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida mayor o igual a 0');
      return;
    }

    setSavingEdit(true);
    try {
      await editarConteo(editingItem.cajaId, editingItem.insumoId, editingItem.originalIndex, numValue);
      setEditingItem(null);
      loadAuditoria();
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || 'No se pudo actualizar el conteo');
    } finally {
      setSavingEdit(false);
    }
  };

  const formatDate = (fecha: string) => {
    if (!fecha) return 'Sin fecha';
    const date = new Date(fecha);
    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (fecha: string) => {
    if (!fecha) return '';
    const date = new Date(fecha);
    return date.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Filter and sort logic
  const filteredAndSortedConteos = useMemo(() => {
    let result = [...todosLosConteos];
    
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.insumoNombre.toLowerCase().includes(q) || 
        (c.cajaId && c.cajaId.toLowerCase().includes(q))
      );
    }
    
    // Sort by Date
    result.sort((a, b) => {
      const timeA = new Date(a.fecha || 0).getTime();
      const timeB = new Date(b.fecha || 0).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
    
    return result;
  }, [todosLosConteos, searchQuery, sortOrder]);

  const renderConteo = ({ item }: { item: FlatConteoItem }) => {
    const isPositive = item.diferencia > 0;
    const isNegative = item.diferencia < 0;
    
    return (
      <View
        className="p-4 mb-3 rounded-xl border border-gray-100"
        style={{ backgroundColor: COLORS.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}
      >
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-1">
            <Text className="text-base font-bold text-gray-800" numberOfLines={1}>
              {item.insumoNombre}
            </Text>
            <View className="flex-row items-center mt-1">
              <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
              <Text className="text-xs text-gray-500 ml-1 mr-3">
                {formatDate(item.fecha)} {formatTime(item.fecha)}
              </Text>
            </View>
          </View>
          <View className="flex-row items-center">
            <TouchableOpacity
              className="w-8 h-8 rounded-full items-center justify-center bg-gray-100 mr-2"
              onPress={() => {
                setEditValue(item.cantContada.toString());
                setEditingItem(item);
              }}
            >
              <Ionicons name="pencil-outline" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              className="w-8 h-8 rounded-full items-center justify-center bg-red-50"
              onPress={() => handleEliminarConteo(item)}
            >
              <Ionicons name="trash-outline" size={16} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        </View>

        <View className="flex-row bg-gray-50 rounded-lg p-3 mt-1">
          <View className="flex-1 border-r border-gray-200">
            <Text className="text-xs text-gray-500 text-center">Sistema</Text>
            <Text className="text-lg font-semibold text-gray-800 text-center mt-1">
              {item.disponibleEnSistema} <Text className="text-xs font-normal text-gray-500">{item.unidadDeMedida}</Text>
            </Text>
          </View>
          <View className="flex-1 border-r border-gray-200">
            <Text className="text-xs text-gray-500 text-center">Contado</Text>
            <Text className="text-lg font-semibold text-blue-600 text-center mt-1">
              {item.cantContada} <Text className="text-xs font-normal text-blue-400">{item.unidadDeMedida}</Text>
            </Text>
          </View>
          <View className="flex-1 items-center justify-center">
            <Text className="text-xs text-gray-500 text-center">Diferencia</Text>
            <Text
              className={`text-lg font-bold text-center mt-1 ${
                isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-gray-500'
              }`}
            >
              {isPositive ? '+' : ''}{item.diferencia}
            </Text>
          </View>
        </View>

        <View className="mt-3 flex-row items-center">
          <Text className="text-xs text-gray-400">Caja ID: </Text>
          <Text className="text-xs font-medium text-gray-600">{item.cajaId}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text className="text-gray-500 mt-3">Cargando auditoría...</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" backgroundColor="transparent" translucent />
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
        <View className="flex-row items-center justify-between p-4 bg-white shadow-sm z-10">
          <TouchableOpacity onPress={() => navigation.goBack()} className="w-10 h-10 rounded-full items-center justify-center">
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-gray-900">Auditoría de Conteos</Text>
          <View className="w-10" />
        </View>

        <View className="px-4 py-3 bg-white border-b border-gray-100">
          <View className="flex-row items-center">
            <View className="flex-1 flex-row items-center bg-gray-100 rounded-xl px-3 py-2 mr-2">
              <Ionicons name="search" size={20} color={COLORS.textSecondary} />
              <TextInput
                className="flex-1 ml-2 text-base text-gray-800"
                placeholder="Buscar por insumo o caja..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor={COLORS.textSecondary}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              className="w-10 h-10 rounded-xl bg-gray-100 items-center justify-center"
              onPress={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            >
              <Ionicons 
                name={sortOrder === 'desc' ? 'arrow-down-outline' : 'arrow-up-outline'} 
                size={20} 
                color={COLORS.primary} 
              />
            </TouchableOpacity>
          </View>
          <View className="flex-row items-center justify-between mt-2">
            <Text className="text-xs text-gray-500">
              {filteredAndSortedConteos.length} registro{filteredAndSortedConteos.length !== 1 ? 's' : ''}
            </Text>
            <Text className="text-xs text-gray-500">
              Orden: {sortOrder === 'desc' ? 'Más recientes' : 'Más antiguos'}
            </Text>
          </View>
        </View>

        {filteredAndSortedConteos.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <Ionicons name="document-text-outline" size={64} color={COLORS.textSecondary} />
            <Text className="text-gray-500 mt-4 text-center text-lg font-medium">No hay conteos</Text>
            <Text className="text-gray-400 text-sm mt-2 text-center">
              {todosLosConteos.length > 0 
                ? 'Ningún registro coincide con tu búsqueda.' 
                : 'Los conteos aparecerán cuando se realice la verificación en una caja.'}
            </Text>
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={filteredAndSortedConteos}
            renderItem={renderConteo}
            keyExtractor={(item, index) => `${item.cajaId}-${item.insumoId}-${item.fecha}-${index}`}
            contentContainerStyle={{ padding: SPACING.md, paddingBottom: 100 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.primary}
              />
            }
          />
        )}

        <Modal visible={!!editingItem} transparent animationType="fade">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
              <View style={{ width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>Editar Conteo</Text>
                <Text style={{ fontSize: 14, color: '#4b5563', marginBottom: 16 }}>
                  {editingItem?.insumoNombre}
                </Text>

                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Disponible en Sistema: {editingItem?.disponibleEnSistema}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 }}>Nueva Cantidad Contada:</Text>
                  <TextInput
                    style={{ backgroundColor: '#f3f4f6', borderRadius: 8, padding: 12, fontSize: 16, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb' }}
                    value={editValue}
                    onChangeText={setEditValue}
                    keyboardType="numeric"
                    autoFocus
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                  <TouchableOpacity
                    style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, marginRight: 8 }}
                    onPress={() => setEditingItem(null)}
                    disabled={savingEdit}
                  >
                    <Text style={{ color: '#6b7280', fontWeight: '600' }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ backgroundColor: COLORS.primary, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}
                    onPress={handleEditSave}
                    disabled={savingEdit}
                  >
                    {savingEdit ? (
                      <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                    ) : null}
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Guardar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

      </SafeAreaView>
    </>
  );
}