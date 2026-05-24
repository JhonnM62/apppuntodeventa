import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, RADIUS, SPACING, FONT_SIZE } from '../../lib/theme';
import { eliminarConteo } from '../../services/caja';

import { insumosService } from '../../services/insumos';

interface ConteoItem {
  fecha: string;
  cajaId: string;
  disponibleEnSistema: number;
  cantContada: number;
  diferencia: number;
}

interface InsumoConteo {
  id: string;
  nombre: string;
  unidadDeMedida: string;
  conteos: ConteoItem[];
}

interface InsumoAuditItem {
  id: string;
  nombre: string;
  unidadDeMedida: string;
  totalConteos: number;
  conteos: ConteoItem[];
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
  const insumoIdParam = route?.params?.insumoId;
  const insumoNombreParam = route?.params?.insumoNombre;

  const [insumos, setInsumos] = useState<InsumoAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAuditoria = useCallback(async () => {
    try {
      const data = await insumosService.getAll({ limit: 2000 });
      
      if (data && Array.isArray(data)) {
        const insumosConConteos = data
          .filter((insumo: any) => {
            let conteos = insumo.ultimosConteos;
            if (typeof conteos === 'string') {
              try { conteos = JSON.parse(conteos); } catch(e) { conteos = []; }
            }
            return Array.isArray(conteos) && conteos.length > 0;
          })
          .map((insumo: any) => {
            let conteos = insumo.ultimosConteos;
            if (typeof conteos === 'string') {
              try { conteos = JSON.parse(conteos); } catch(e) { conteos = []; }
            }
            
            return {
              id: insumo.IDalimentos,
              nombre: insumo.nombre,
              unidadDeMedida: insumo.unidades || 'und',
              totalConteos: conteos.length,
              conteos: conteos.sort(
                (a: ConteoItem, b: ConteoItem) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
              ),
            };
          })
          .sort((a: InsumoAuditItem, b: InsumoAuditItem) => 
            new Date(b.conteos[0]?.fecha || 0).getTime() - new Date(a.conteos[0]?.fecha || 0).getTime()
          );
        
        setInsumos(insumosConConteos);
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

  const handleEliminarConteo = async (insumoId: string, insumoNombre: string, conteoIndex: number, cajaId: string) => {
    Alert.alert(
      'Eliminar Conteo',
      `¿Estás seguro de eliminar este conteo del insumo "${insumoNombre}" en la caja ${cajaId}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await eliminarConteo(cajaId, insumoId, conteoIndex);
              loadAuditoria();
            } catch (error: any) {
              Alert.alert('Error', error?.response?.data?.message || 'No se pudo eliminar el conteo');
            }
          },
        },
      ]
    );
  };

  const formatDate = (fecha: string) => {
    const date = new Date(fecha);
    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (fecha: string) => {
    const date = new Date(fecha);
    return date.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderConteo = (conteo: ConteoItem, index: number, insumoId: string, insumoNombre: string) => {
    const isPositive = conteo.diferencia > 0;
    const isNegative = conteo.diferencia < 0;
    
    return (
      <View
        key={`${conteo.cajaId}-${index}`}
        className="flex-row items-center justify-between p-3 mb-2 rounded-lg"
        style={{ backgroundColor: COLORS.surface }}
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
          <Text className="text-xs text-gray-400">diferencia</Text>
        </View>

        <TouchableOpacity
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: `${COLORS.error}15` }}
          onPress={() => handleEliminarConteo(insumoId, insumoNombre, index, conteo.cajaId)}
        >
          <Ionicons name="trash-outline" size={18} color={COLORS.error} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderInsumo = ({ item }: { item: InsumoAuditItem }) => {
    return (
      <View className="mb-4">
        <View className="flex-row items-center justify-between p-4 rounded-t-xl" style={{ backgroundColor: COLORS.primary }}>
          <View className="flex-1">
            <Text className="text-white font-bold text-base">{item.nombre}</Text>
            <Text className="text-white/70 text-xs mt-1">
              {item.totalConteos} conteo{item.totalConteos !== 1 ? 's' : ''} registrado{item.totalConteos !== 1 ? 's' : ''}
            </Text>
          </View>
          <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <Ionicons name="cube-outline" size={20} color="#fff" />
          </View>
        </View>
        
        <View className="p-3 rounded-b-xl" style={{ backgroundColor: COLORS.surface }}>
          {item.conteos.map((conteo, index) => renderConteo(conteo, index, item.id, item.nombre))}
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
        <View className="flex-row items-center justify-between p-4 border-b bg-white" style={{ borderColor: COLORS.border }}>
          <TouchableOpacity onPress={() => navigation.goBack()} className="w-10 h-10 rounded-full items-center justify-center">
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-gray-900">Auditoría de Conteos</Text>
          <View className="w-10" />
        </View>

        {insumos.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6" style={{ flex: 1 }}>
          <Ionicons name="document-text-outline" size={64} color={COLORS.textSecondary} />
          <Text className="text-gray-500 mt-4 text-center">No hay conteos registrados aún</Text>
          <Text className="text-gray-400 text-sm mt-2 text-center">
            Los conteos aparecerán cuando se realice la verificación de insumos en una caja
          </Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={insumos}
          renderItem={renderInsumo}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: SPACING.md }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}
    </SafeAreaView>
    </>
  );
}