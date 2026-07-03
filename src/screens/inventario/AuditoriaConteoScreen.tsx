import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
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
import { useSocketEvent } from '../../hooks/useSocketEvent';
import { SocketEvent } from '../../types/socket.types';
import { useCustomAlert } from '../../context/CustomAlertContext';
import { FlashList as OriginalFlashList } from '@shopify/flash-list';
const FlashList = OriginalFlashList as any;

interface ConteoEnCaja {
  insumoId: string;
  insumoNombre: string;
  unidadDeMedida: string;
  disponibleEnSistema: number;
  cantContada: number;
  diferencia: number;
  originalIndex: number;
}

interface CajaAuditItem {
  cajaId: string;
  fecha: string;
  totalInsumos: number;
  conteos: ConteoEnCaja[];
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
  const { showAlert } = useCustomAlert();
  const [todasLasCajas, setTodasLasCajas] = useState<CajaAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [showFilters, setShowFilters] = useState(false);

  // Advanced Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [diffSignFilter, setDiffSignFilter] = useState<'all' | 'positive' | 'negative' | 'zero'>('all');
  const [diffOperator, setDiffOperator] = useState<'gt' | 'lt' | 'eq' | 'gte' | 'lte'>('gt');
  const [diffValue, setDiffValue] = useState('');
  const [unidadFilter, setUnidadFilter] = useState('');
  const [sistemaOperator, setSistemaOperator] = useState<'gt' | 'lt' | 'eq' | 'gte' | 'lte'>('gt');
  const [sistemaValue, setSistemaValue] = useState('');
  const [contadaOperator, setContadaOperator] = useState<'gt' | 'lt' | 'eq' | 'gte' | 'lte'>('gt');
  const [contadaValue, setContadaValue] = useState('');

  const resetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setDiffSignFilter('all');
    setDiffOperator('gt');
    setDiffValue('');
    setUnidadFilter('');
    setSistemaOperator('gt');
    setSistemaValue('');
    setContadaOperator('gt');
    setContadaValue('');
  };

  const hasActiveFilters = dateFrom || dateTo || diffSignFilter !== 'all' || diffValue || unidadFilter || sistemaValue || contadaValue;

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<EditingItemInfo | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadAuditoria = useCallback(async () => {
    try {
      const data = await insumosService.getAll({ limit: 2000 });
      
      if (data && Array.isArray(data)) {
        const cajasMap = new Map<string, CajaAuditItem>();
        
        data.forEach((insumo: any) => {
          let conteos = insumo.ultimosConteos;
          if (typeof conteos === 'string') {
            try { conteos = JSON.parse(conteos); } catch(e) { conteos = []; }
          }
          if (Array.isArray(conteos) && conteos.length > 0) {
            conteos.forEach((c: any, i: number) => {
              if (!c.cajaId) return; // Omitir si no tiene cajaId
              
              if (!cajasMap.has(c.cajaId)) {
                cajasMap.set(c.cajaId, {
                  cajaId: c.cajaId,
                  fecha: c.fecha,
                  totalInsumos: 0,
                  conteos: [],
                });
              }
              
              const caja = cajasMap.get(c.cajaId)!;
              
              // Agregar este conteo a la caja
              caja.conteos.push({
                insumoId: insumo.IDalimentos,
                insumoNombre: insumo.nombre,
                unidadDeMedida: insumo.unidades || 'und',
                disponibleEnSistema: c.disponibleEnSistema,
                cantContada: c.cantContada,
                diferencia: c.diferencia,
                originalIndex: i,
              });
              
              // Mantener la fecha más reciente por si hay discrepancias menores
              if (c.fecha && new Date(c.fecha) > new Date(caja.fecha)) {
                caja.fecha = c.fecha;
              }
            });
          }
        });
        
        const cajasList = Array.from(cajasMap.values());
        cajasList.forEach(c => c.totalInsumos = c.conteos.length);
        
        setTodasLasCajas(cajasList);
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

  useSocketEvent<any>(SocketEvent.REFRESH_INSUMOS, () => {
    loadAuditoria();
  }, [loadAuditoria]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAuditoria();
  }, [loadAuditoria]);

  const handleEliminarConteo = async (insumoId: string, insumoNombre: string, originalIndex: number, cajaId: string) => {
    showAlert({
      type: 'confirm',
      title: 'Eliminar Conteo',
      message: `¿Estás seguro de eliminar este conteo de "${insumoNombre}" en la caja ${cajaId.slice(0,8)}...?`,
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          await eliminarConteo(cajaId, insumoId, originalIndex);
          loadAuditoria();
        } catch (error: any) {
          showAlert({ type: 'error', title: 'Error', message: error?.response?.data?.message || 'No se pudo eliminar el conteo' });
        }
      },
      onCancel: () => {},
    });
  };

  const handleEditSave = async () => {
    if (!editingItem) return;

    const numValue = Number(editValue);
    if (isNaN(numValue) || numValue < 0) {
      showAlert({ type: 'error', title: 'Error', message: 'Ingresa una cantidad válida mayor o igual a 0' });
      return;
    }

    setSavingEdit(true);
    try {
      await editarConteo(editingItem.cajaId, editingItem.insumoId, editingItem.originalIndex, numValue);
      setEditingItem(null);
      loadAuditoria();
    } catch (error: any) {
      showAlert({ type: 'error', title: 'Error', message: error?.response?.data?.message || 'No se pudo actualizar el conteo' });
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
  // Filter and sort logic
  const filteredAndSortedCajas = useMemo(() => {
    // Clonación profunda de arreglos para no mutar el estado original al ordenar
    let result = todasLasCajas.map(caja => ({ ...caja, conteos: [...caja.conteos] }));
    
    // 1. Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(caja => {
        const matchCaja = caja.cajaId.toLowerCase().includes(q);
        const matchingConteos = caja.conteos.filter(c => c.insumoNombre.toLowerCase().includes(q));

        if (matchCaja) {
          return true; // Keep all conteos if caja ID matches
        } else if (matchingConteos.length > 0) {
          caja.conteos = matchingConteos; // Only keep matching insumos
          return true;
        }
        return false;
      });
    }
    
    // Apply filters to conteos
    result.forEach(caja => {
      let keepCaja = true;
      // Filtro de Fechas a nivel de Caja
      if (dateFrom) {
        const from = new Date(dateFrom).setHours(0,0,0,0);
        if (new Date(caja.fecha).getTime() < from) keepCaja = false;
      }
      if (dateTo) {
        const to = new Date(dateTo).setHours(23,59,59,999);
        if (new Date(caja.fecha).getTime() > to) keepCaja = false;
      }

      if (!keepCaja) {
        caja.conteos = [];
        return;
      }

      caja.conteos = caja.conteos.filter(c => {
        // Filtro por signo de diferencia
        if (diffSignFilter === 'positive' && c.diferencia <= 0) return false;
        if (diffSignFilter === 'negative' && c.diferencia >= 0) return false;
        if (diffSignFilter === 'zero' && c.diferencia !== 0) return false;
        // Filtro por valor numérico de diferencia
        if (diffValue !== '' && !isNaN(Number(diffValue))) {
          const v = Number(diffValue);
          if (diffOperator === 'gt' && c.diferencia <= v) return false;
          if (diffOperator === 'lt' && c.diferencia >= v) return false;
          if (diffOperator === 'eq' && c.diferencia !== v) return false;
          if (diffOperator === 'gte' && c.diferencia < v) return false;
          if (diffOperator === 'lte' && c.diferencia > v) return false;
        }
        // Filtro por disponible en sistema
        if (sistemaValue !== '' && !isNaN(Number(sistemaValue))) {
          const v = Number(sistemaValue);
          if (sistemaOperator === 'gt' && c.disponibleEnSistema <= v) return false;
          if (sistemaOperator === 'lt' && c.disponibleEnSistema >= v) return false;
          if (sistemaOperator === 'eq' && c.disponibleEnSistema !== v) return false;
          if (sistemaOperator === 'gte' && c.disponibleEnSistema < v) return false;
          if (sistemaOperator === 'lte' && c.disponibleEnSistema > v) return false;
        }
        // Filtro por cantidad contada
        if (contadaValue !== '' && !isNaN(Number(contadaValue))) {
          const v = Number(contadaValue);
          if (contadaOperator === 'gt' && c.cantContada <= v) return false;
          if (contadaOperator === 'lt' && c.cantContada >= v) return false;
          if (contadaOperator === 'eq' && c.cantContada !== v) return false;
          if (contadaOperator === 'gte' && c.cantContada < v) return false;
          if (contadaOperator === 'lte' && c.cantContada > v) return false;
        }
        // Filter by unidad de medida
        if (unidadFilter.trim()) {
          const q = unidadFilter.toLowerCase();
          if (!c.unidadDeMedida.toLowerCase().includes(q)) return false;
        }
        return true;
      });
      caja.totalInsumos = caja.conteos.length;
    });

    result = result.filter(caja => caja.conteos.length > 0);

    // 2. Sort Conteos inside each Caja (Alfabéticamente por insumo)
    result.forEach(caja => {
      caja.conteos.sort((a, b) => a.insumoNombre.localeCompare(b.insumoNombre));
    });

    // 3. Sort Cajas based on their date
    result.sort((a, b) => {
      const timeA = new Date(a.fecha || 0).getTime();
      const timeB = new Date(b.fecha || 0).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
    
    return result;
  }, [todasLasCajas, searchQuery, sortOrder, dateFrom, dateTo, diffSignFilter, diffOperator, diffValue, unidadFilter, sistemaOperator, sistemaValue, contadaOperator, contadaValue]);

  const renderInsumoEnCaja = (conteo: ConteoEnCaja, cajaId: string) => {
    const isPositive = conteo.diferencia > 0;
    const isNegative = conteo.diferencia < 0;
    
    return (
      <View
        key={`${conteo.insumoId}-${conteo.originalIndex}`}
        className="flex-row items-center justify-between p-3 mb-2 rounded-lg bg-white border border-gray-100"
        style={{ borderLeftWidth: 3, borderLeftColor: isPositive ? '#22c55e' : isNegative ? '#ef4444' : '#d1d5db' }}
      >
        <View className="flex-1">
          <Text className="text-sm font-bold text-gray-800 mb-1">{conteo.insumoNombre}</Text>
          <View className="flex-row items-center mt-1">
            <Text className="text-xs text-gray-500 mr-2">Sistema: {conteo.disponibleEnSistema}</Text>
            <Text className="text-xs text-gray-500">| Físico: {conteo.cantContada}</Text>
          </View>
        </View>
        
        <View className="items-center mr-4 min-w-[30px]">
          <Text
            className={`text-base font-bold ${
              isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-gray-500'
            }`}
          >
            {isPositive ? '+' : ''}{conteo.diferencia}
          </Text>
          <Text className="text-[9px] text-gray-400">dif</Text>
        </View>

        <View className="flex-col justify-center space-y-1">
          <TouchableOpacity
            className="w-7 h-7 rounded items-center justify-center mb-1"
            style={{ backgroundColor: '#f3f4f6' }}
            onPress={() => {
              setEditValue(conteo.cantContada.toString());
              setEditingItem({
                insumoId: conteo.insumoId,
                insumoNombre: conteo.insumoNombre,
                cajaId: cajaId,
                disponibleEnSistema: conteo.disponibleEnSistema,
                cantContada: conteo.cantContada,
                originalIndex: conteo.originalIndex,
              });
            }}
          >
            <Ionicons name="pencil" size={12} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            className="w-7 h-7 rounded items-center justify-center"
            style={{ backgroundColor: `${COLORS.error}15` }}
            onPress={() => handleEliminarConteo(conteo.insumoId, conteo.insumoNombre, conteo.originalIndex, cajaId)}
          >
            <Ionicons name="trash" size={12} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderCaja = ({ item }: { item: CajaAuditItem }) => {
    return (
      <View className="mb-5 shadow-sm rounded-xl bg-white" style={{ elevation: 2 }}>
        <View className="flex-row items-center justify-between p-4 rounded-t-xl" style={{ backgroundColor: COLORS.primary }}>
          <View className="flex-1">
            <View className="flex-row items-center mb-1">
              <Ionicons name="calendar-outline" size={14} color="#ffffffcc" />
              <Text className="text-white font-bold text-sm ml-1 mr-3">
                {formatDate(item.fecha)}
              </Text>
              <Ionicons name="time-outline" size={14} color="#ffffffcc" />
              <Text className="text-white font-bold text-sm ml-1">
                {formatTime(item.fecha)}
              </Text>
            </View>
            <Text className="text-white/80 text-xs mt-1">
              Caja: <Text className="font-medium text-white">{item.cajaId.slice(0, 8)}...</Text>
            </Text>
            <Text className="text-white/80 text-xs mt-1">
              {item.conteos.length} insumo{item.conteos.length !== 1 ? 's' : ''} contabilizado{item.conteos.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <Ionicons name="cube-outline" size={20} color="#fff" />
          </View>
        </View>
        
        <View className="p-3 rounded-b-xl" style={{ backgroundColor: '#f9fafb' }}>
          {item.conteos.map((conteo) => renderInsumoEnCaja(conteo, item.cajaId))}
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
              style={{ backgroundColor: showFilters || hasActiveFilters ? '#eff6ff' : '#f3f4f6', borderColor: showFilters || hasActiveFilters ? '#bfdbfe' : '#e5e7eb' }}
              onPress={() => setShowFilters(prev => !prev)}
            >
              <Ionicons
                name={showFilters ? 'close-circle' : 'options-outline'}
                size={20}
                color={hasActiveFilters ? COLORS.primary : COLORS.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              className="w-11 h-11 rounded-xl items-center justify-center border ml-2"
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

          {/* Filtros Avanzados */}
          {showFilters && (
            <View className="mt-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-bold text-gray-700">Filtros Avanzados</Text>
                {hasActiveFilters && (
                  <TouchableOpacity onPress={resetFilters} className="flex-row items-center">
                    <Ionicons name="refresh" size={14} color={COLORS.error} />
                    <Text className="text-xs text-red-500 ml-1 font-medium">Limpiar</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Rango de Fechas */}
              <Text className="text-xs font-semibold text-gray-500 mb-1 mt-1">Rango de Fechas</Text>
              <View className="flex-row items-center mb-2">
                <View className="flex-1 flex-row items-center bg-white rounded-lg border border-gray-200 px-2 py-1.5 mr-1">
                  <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
                  <TextInput
                    className="flex-1 ml-1 text-xs text-gray-700"
                    placeholder="Desde (AAAA-MM-DD)"
                    value={dateFrom}
                    onChangeText={setDateFrom}
                    placeholderTextColor={COLORS.textSecondary}
                  />
                </View>
                <Text className="text-xs text-gray-400 mx-1">→</Text>
                <View className="flex-1 flex-row items-center bg-white rounded-lg border border-gray-200 px-2 py-1.5 ml-1">
                  <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
                  <TextInput
                    className="flex-1 ml-1 text-xs text-gray-700"
                    placeholder="Hasta (AAAA-MM-DD)"
                    value={dateTo}
                    onChangeText={setDateTo}
                    placeholderTextColor={COLORS.textSecondary}
                  />
                </View>
              </View>

              {/* Signo de Diferencia */}
              <Text className="text-xs font-semibold text-gray-500 mb-1 mt-1">Tipo de Diferencia</Text>
              <View className="flex-row items-center mb-2">
                {[
                  { key: 'all', label: 'Todos' },
                  { key: 'positive', label: 'Positivo (+)' },
                  { key: 'negative', label: 'Negativo (−)' },
                  { key: 'zero', label: 'Cero (=)' },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setDiffSignFilter(opt.key as any)}
                    className="flex-1 py-1.5 rounded-lg items-center mr-1 border"
                    style={{
                      backgroundColor: diffSignFilter === opt.key ? (opt.key === 'positive' ? '#dcfce7' : opt.key === 'negative' ? '#fee2e2' : opt.key === 'zero' ? '#f3f4f6' : '#eff6ff') : '#fff',
                      borderColor: diffSignFilter === opt.key ? (opt.key === 'positive' ? '#86efac' : opt.key === 'negative' ? '#fca5a5' : opt.key === 'zero' ? '#d1d5db' : '#93c5fd') : '#e5e7eb',
                    }}
                  >
                    <Text className={`text-[10px] font-semibold ${diffSignFilter === opt.key ? 'text-gray-800' : 'text-gray-500'}`}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Filtros Numéricos en 2 columnas */}
              <View className="flex-row mb-2">
                {/* Diferencia */}
                <View className="flex-1 mr-1">
                  <Text className="text-xs font-semibold text-gray-500 mb-1">Diferencia</Text>
                  <View className="flex-row items-center">
                    <View className="flex-1 flex-row items-center bg-white rounded-lg border border-gray-200 px-1.5 py-1 mr-1">
                      <TextInput
                        className="flex-1 text-xs text-gray-700 text-center"
                        placeholder="Valor"
                        value={diffValue}
                        onChangeText={setDiffValue}
                        keyboardType="numeric"
                        placeholderTextColor={COLORS.textSecondary}
                      />
                    </View>
                    {['gt','lt','eq','gte','lte'].map(op => (
                      <TouchableOpacity
                        key={op}
                        onPress={() => setDiffOperator(op as any)}
                        className="w-7 h-7 rounded items-center justify-center mr-0.5 border"
                        style={{ backgroundColor: diffOperator === op ? '#eff6ff' : '#fff', borderColor: diffOperator === op ? '#93c5fd' : '#e5e7eb' }}
                      >
                        <Text className={`text-[9px] font-bold ${diffOperator === op ? 'text-blue-600' : 'text-gray-400'}`}>{op === 'gt' ? '>' : op === 'lt' ? '<' : op === 'eq' ? '=' : op === 'gte' ? '≥' : '≤'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Unidad de Medida */}
                <View className="flex-1 ml-1">
                  <Text className="text-xs font-semibold text-gray-500 mb-1">Unidad Medida</Text>
                  <View className="flex-row items-center bg-white rounded-lg border border-gray-200 px-2 py-1.5">
                    <Ionicons name="scale-outline" size={12} color={COLORS.textSecondary} />
                    <TextInput
                      className="flex-1 ml-1 text-xs text-gray-700"
                      placeholder="ej: kg, und, lt"
                      value={unidadFilter}
                      onChangeText={setUnidadFilter}
                      placeholderTextColor={COLORS.textSecondary}
                    />
                  </View>
                </View>
              </View>

              <View className="flex-row mb-1">
                {/* Disponible en Sistema */}
                <View className="flex-1 mr-1">
                  <Text className="text-xs font-semibold text-gray-500 mb-1">Sistema</Text>
                  <View className="flex-row items-center">
                    <View className="flex-1 flex-row items-center bg-white rounded-lg border border-gray-200 px-1.5 py-1 mr-1">
                      <TextInput
                        className="flex-1 text-xs text-gray-700 text-center"
                        placeholder="Cant."
                        value={sistemaValue}
                        onChangeText={setSistemaValue}
                        keyboardType="numeric"
                        placeholderTextColor={COLORS.textSecondary}
                      />
                    </View>
                    {['gt','lt','eq','gte','lte'].map(op => (
                      <TouchableOpacity
                        key={op}
                        onPress={() => setSistemaOperator(op as any)}
                        className="w-7 h-7 rounded items-center justify-center mr-0.5 border"
                        style={{ backgroundColor: sistemaOperator === op ? '#eff6ff' : '#fff', borderColor: sistemaOperator === op ? '#93c5fd' : '#e5e7eb' }}
                      >
                        <Text className={`text-[9px] font-bold ${sistemaOperator === op ? 'text-blue-600' : 'text-gray-400'}`}>{op === 'gt' ? '>' : op === 'lt' ? '<' : op === 'eq' ? '=' : op === 'gte' ? '≥' : '≤'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Contado */}
                <View className="flex-1 ml-1">
                  <Text className="text-xs font-semibold text-gray-500 mb-1">Contado</Text>
                  <View className="flex-row items-center">
                    <View className="flex-1 flex-row items-center bg-white rounded-lg border border-gray-200 px-1.5 py-1 mr-1">
                      <TextInput
                        className="flex-1 text-xs text-gray-700 text-center"
                        placeholder="Cant."
                        value={contadaValue}
                        onChangeText={setContadaValue}
                        keyboardType="numeric"
                        placeholderTextColor={COLORS.textSecondary}
                      />
                    </View>
                    {['gt','lt','eq','gte','lte'].map(op => (
                      <TouchableOpacity
                        key={op}
                        onPress={() => setContadaOperator(op as any)}
                        className="w-7 h-7 rounded items-center justify-center mr-0.5 border"
                        style={{ backgroundColor: contadaOperator === op ? '#eff6ff' : '#fff', borderColor: contadaOperator === op ? '#93c5fd' : '#e5e7eb' }}
                      >
                        <Text className={`text-[9px] font-bold ${contadaOperator === op ? 'text-blue-600' : 'text-gray-400'}`}>{op === 'gt' ? '>' : op === 'lt' ? '<' : op === 'eq' ? '=' : op === 'gte' ? '≥' : '≤'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          )}
          <View className="flex-row items-center justify-between mt-2 px-1">
            <Text className="text-xs text-gray-500 font-medium">
              {filteredAndSortedCajas.length} Caja{filteredAndSortedCajas.length !== 1 ? 's' : ''}
              {hasActiveFilters || searchQuery ? ' encontrada' + (filteredAndSortedCajas.length !== 1 ? 's' : '') : ' agrupada' + (filteredAndSortedCajas.length !== 1 ? 's' : '')}
            </Text>
            <Text className="text-xs text-gray-500 font-medium">
              {sortOrder === 'desc' ? 'Más recientes' : 'Más antiguas'}
              {hasActiveFilters ? ' • Filtros activos' : ''}
            </Text>
          </View>
        </View>

        {/* Lista Principal */}
        {filteredAndSortedCajas.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <Ionicons name="document-text-outline" size={64} color={COLORS.textSecondary} />
            <Text className="text-gray-500 mt-4 text-center text-lg font-medium">No hay resultados</Text>
            <Text className="text-gray-400 text-sm mt-2 text-center">
              {todasLasCajas.length > 0 
                ? 'Ninguna caja o insumo coincide con tu búsqueda.' 
                : 'No se encontraron conteos guardados en el sistema.'}
            </Text>
          </View>
        ) : (
          <FlashList
            style={{ flex: 1 }}
            data={filteredAndSortedCajas}
            renderItem={renderCaja}
            keyExtractor={(item: CajaAuditItem) => item.cajaId}
            contentContainerStyle={{ padding: SPACING.md, paddingBottom: 80 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
            }
            estimatedItemSize={200}
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
