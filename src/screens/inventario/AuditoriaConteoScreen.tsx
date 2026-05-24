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
  originalIndex: number; // Necesario para saber qué índice editar/eliminar en la BD
}

interface InsumoAuditItem {
  id: string;
  nombre: string;
  unidadDeMedida: string;
  totalConteos: number;
  conteos: ConteoItem[];
}

type EditingItemInfo = {
  insumoId: string;
  insumoNombre: string;
  cajaId: string;
  disponibleEnSistema: number;
  cantContada: number;
  originalIndex: number;
};

interface AuditoriaConteoScreenProps {
  route?: { params?: { insumoId?: string; insumoNombre?: string; } };
  navigation?: any;
}

export default function AuditoriaConteoScreen({ route, navigation }: AuditoriaConteoScreenProps) {
  const [todosLosInsumos, setTodosLosInsumos] = useState<InsumoAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<EditingItemInfo | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadAuditoria = useCallback(async () => {
    try {
      const data = await insumosService.getAll({ limit: 2000 });
      
      if (data && Array.isArray(data)) {
        const insumosList: InsumoAuditItem[] = [];
        
        data.forEach((insumo: any) => {
          let conteos = insumo.ultimosConteos;
          if (typeof conteos === 'string') {
            try { conteos = JSON.parse(conteos); } catch(e) { conteos = []; }
          }
          if (Array.isArray(conteos) && conteos.length > 0) {
            // Mapear agregando el índice original
            const conteosConIndex = conteos.map((c: any, i: number) => ({ ...c, originalIndex: i }));
            
            insumosList.push({
              id: insumo.IDalimentos,
              nombre: insumo.nombre,
              unidadDeMedida: insumo.unidades || 'und',
              totalConteos: conteosConIndex.length,
              conteos: conteosConIndex,
            });
          }
        });
        
        setTodosLosInsumos(insumosList);
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

  const handleEliminarConteo = async (insumoId: string, insumoNombre: string, originalIndex: number, cajaId: string) => {
    Alert.alert(
      'Eliminar Conteo',
      `¿Estás seguro de eliminar este conteo de "${insumoNombre}" en la caja ${cajaId.slice(0,8)}...?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await eliminarConteo(cajaId, insumoId, originalIndex);
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
    return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatTime = (fecha: string) => {
    if (!fecha) return '';
    const date = new Date(fecha);
    return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  };

  // Filter and sort logic
  const filteredAndSortedInsumos = useMemo(() => {
    // Clonación profunda de arreglos para no mutar el estado original al ordenar
    let result = todosLosInsumos.map(insumo => ({ ...insumo, conteos: [...insumo.conteos] }));
    
    // 1. Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(insumo => {
        const matchName = insumo.nombre.toLowerCase().includes(q);
        const matchingConteos = insumo.conteos.filter(c => c.cajaId && c.cajaId.toLowerCase().includes(q));

        if (matchName) {
          return true; // Keep all conteos if insumo name matches
        } else if (matchingConteos.length > 0) {
          insumo.conteos = matchingConteos; // Only keep matching conteos if caja matches
          return true;
        }
        return false;
      });
    }
    
    // 2. Sort Conteos inside each Insumo
    result.forEach(insumo => {
      insumo.conteos.sort((a, b) => {
        const timeA = new Date(a.fecha || 0).getTime();
        const timeB = new Date(b.fecha || 0).getTime();
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
    });

    // 3. Sort Insumos based on their most relevant (first) conteo
    result.sort((a, b) => {
      if (!a.conteos[0] || !b.conteos[0]) return 0;
      const timeA = new Date(a.conteos[0].fecha || 0).getTime();
      const timeB = new Date(b.conteos[0].fecha || 0).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
    
    return result;
  }, [todosLosInsumos, searchQuery, sortOrder]);

  const renderConteo = (conteo: ConteoItem, insumoId: string, insumoNombre: string) => {
    const isPositive = conteo.diferencia > 0;
    const isNegative = conteo.diferencia < 0;
    
    return (
      <View
        key={`${conteo.cajaId}-${conteo.originalIndex}`}
        className="flex-row items-center justify-between p-3 mb-2 rounded-lg"
        style={{ backgroundColor: COLORS.surface, borderLeftWidth: 3, borderLeftColor: isPositive ? '#22c55e' : isNegative ? '#ef4444' : '#d1d5db' }}
      >
        <View className="flex-1">
          <View className="flex-row items-center mb-1">
            <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
            <Text className="text-xs text-gray-500 ml-1 mr-3">
              {formatDate(conteo.fecha)}
            </Text>
            <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} />
            <Text className="text-xs text-gray-500 ml-1">
              {formatTime(conteo.fecha)}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Text className="text-xs text-gray-400 mr-2">Caja:</Text>
            <Text className="text-xs font-medium text-gray-700">{conteo.cajaId.slice(0, 8)}...</Text>
          </View>
          <View className="flex-row items-center mt-1">
            <Text className="text-xs text-gray-400 mr-2">Sistema: {conteo.disponibleEnSistema}</Text>
            <Text className="text-xs text-gray-400">| Contado: {conteo.cantContada}</Text>
          </View>
        </View>
        
        <View className="items-center mr-3">
          <Text
            className={`text-lg font-bold ${
              isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-gray-500'
            }`}
          >
            {isPositive ? '+' : ''}{conteo.diferencia}
          </Text>
          <Text className="text-[10px] text-gray-400">diferencia</Text>
        </View>

        <View className="flex-col justify-center space-y-1">
          <TouchableOpacity
            className="w-8 h-8 rounded-full items-center justify-center mb-1"
            style={{ backgroundColor: '#f3f4f6' }}
            onPress={() => {
              setEditValue(conteo.cantContada.toString());
              setEditingItem({
                insumoId,
                insumoNombre,
                cajaId: conteo.cajaId,
                disponibleEnSistema: conteo.disponibleEnSistema,
                cantContada: conteo.cantContada,
                originalIndex: conteo.originalIndex,
              });
            }}
          >
            <Ionicons name="pencil-outline" size={14} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            className="w-8 h-8 rounded-full items-center justify-center"
            style={{ backgroundColor: `${COLORS.error}15` }}
            onPress={() => handleEliminarConteo(insumoId, insumoNombre, conteo.originalIndex, conteo.cajaId)}
          >
            <Ionicons name="trash-outline" size={14} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderInsumo = ({ item }: { item: InsumoAuditItem }) => {
    return (
      <View className="mb-5 shadow-sm rounded-xl bg-white" style={{ elevation: 2 }}>
        <View className="flex-row items-center justify-between p-4 rounded-t-xl" style={{ backgroundColor: COLORS.primary }}>
          <View className="flex-1">
            <Text className="text-white font-bold text-base">{item.nombre}</Text>
            <Text className="text-white/80 text-xs mt-1">
              {item.conteos.length} conteo{item.conteos.length !== 1 ? 's' : ''} registrado{item.conteos.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <Ionicons name="cube-outline" size={20} color="#fff" />
          </View>
        </View>
        
        <View className="p-3 rounded-b-xl" style={{ backgroundColor: '#f9fafb' }}>
          {item.conteos.map((conteo) => renderConteo(conteo, item.id, item.nombre))}
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
        {/* Header */}
        <View className="flex-row items-center justify-between p-4 bg-white z-10 border-b border-gray-100">
          <TouchableOpacity onPress={() => navigation.goBack()} className="w-10 h-10 rounded-full items-center justify-center bg-gray-50">
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-gray-900">Auditoría de Conteos</Text>
          <View className="w-10" />
        </View>

        {/* Filtros */}
        <View className="px-4 py-3 bg-white border-b border-gray-200">
          <View className="flex-row items-center">
            <View className="flex-1 flex-row items-center bg-gray-100 rounded-xl px-3 py-2 mr-2">
              <Ionicons name="search" size={18} color={COLORS.textSecondary} />
              <TextInput
                className="flex-1 ml-2 text-[15px] text-gray-800"
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
              className="w-11 h-11 rounded-xl items-center justify-center border"
              style={{ backgroundColor: sortOrder === 'desc' ? '#eff6ff' : '#f3f4f6', borderColor: sortOrder === 'desc' ? '#bfdbfe' : '#e5e7eb' }}
              onPress={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            >
              <Ionicons 
                name={sortOrder === 'desc' ? 'arrow-down-outline' : 'arrow-up-outline'} 
                size={20} 
                color={COLORS.primary} 
              />
            </TouchableOpacity>
          </View>
          <View className="flex-row items-center justify-between mt-2 px-1">
            <Text className="text-xs text-gray-500 font-medium">
              {filteredAndSortedInsumos.length} Insumo{filteredAndSortedInsumos.length !== 1 ? 's' : ''} agrupado{filteredAndSortedInsumos.length !== 1 ? 's' : ''}
            </Text>
            <Text className="text-xs text-gray-500 font-medium">
              Orden: {sortOrder === 'desc' ? 'Más recientes' : 'Más antiguos'}
            </Text>
          </View>
        </View>

        {/* Lista Principal */}
        {filteredAndSortedInsumos.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <Ionicons name="document-text-outline" size={64} color={COLORS.textSecondary} />
            <Text className="text-gray-500 mt-4 text-center text-lg font-medium">No hay resultados</Text>
            <Text className="text-gray-400 text-sm mt-2 text-center">
              {todosLosInsumos.length > 0 
                ? 'Ningún insumo o caja coincide con tu búsqueda.' 
                : 'No se encontraron conteos guardados en el sistema.'}
            </Text>
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={filteredAndSortedInsumos}
            renderItem={renderInsumo}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: SPACING.md, paddingBottom: 80 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
            }
          />
        )}

        {/* Modal de Edición */}
        <Modal visible={!!editingItem} transparent animationType="fade">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
              <View style={{ width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 4 }}>Editar Conteo</Text>
                <Text style={{ fontSize: 15, color: COLORS.primary, fontWeight: '600', marginBottom: 16 }}>
                  {editingItem?.insumoNombre}
                </Text>

                <View style={{ marginBottom: 20 }}>
                  <View style={{ backgroundColor: '#f3f4f6', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <Text style={{ fontSize: 13, color: '#6b7280', textAlign: 'center' }}>Disponible en Sistema</Text>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#374151', textAlign: 'center', marginTop: 4 }}>{editingItem?.disponibleEnSistema}</Text>
                  </View>
                  
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Nueva Cantidad Física Contada:</Text>
                  <TextInput
                    style={{ backgroundColor: '#fff', borderRadius: 8, padding: 12, fontSize: 18, color: '#111827', borderWidth: 1, borderColor: '#d1d5db', textAlign: 'center' }}
                    value={editValue}
                    onChangeText={setEditValue}
                    keyboardType="numeric"
                    autoFocus
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                  <TouchableOpacity
                    style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, marginRight: 8, backgroundColor: '#f3f4f6' }}
                    onPress={() => setEditingItem(null)}
                    disabled={savingEdit}
                  >
                    <Text style={{ color: '#4b5563', fontWeight: '600' }}>Cancelar</Text>
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
