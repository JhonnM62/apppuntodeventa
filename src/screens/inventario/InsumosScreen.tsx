import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, TouchableOpacity, Text as RNText, StyleSheet, ScrollView, Modal, TextInput, Alert, ActivityIndicator, FlatList, RefreshControl, Image as RNImage, Platform, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

// Fallback seguro para expo-image
let ImageComponent: any = RNImage;
try {
  const ExpoImageModule = require('expo-image');
  if (ExpoImageModule && ExpoImageModule.Image) {
    ImageComponent = ExpoImageModule.Image;
  }
} catch (error) {
  console.log('expo-image native module no encontrado, usando Image de react-native como fallback');
}
import { useSocketEvent } from '../../hooks/useSocketEvent';
import { SocketEvent } from '../../types/socket.types';
import { Text } from '../../components/ui/text';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { insumosService, InsumoItem, CreateInsumoDto } from '../../services/insumos';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import { usePermissions } from '../../hooks/usePermissions';

const ESTADOS_STOCK = {
  critico: { color: '#ef4444', bg: '#fef2f2', border: '#fecaca', label: 'Crítico' },
  normal: { color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0', label: 'Normal' },
  sobrante: { color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', label: 'Sobrante' },
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Insumos'>;
};

const InsumosScreen = ({ navigation }: Props) => {
  const { canCreate, canEdit, canDelete } = usePermissions('insumos');

  const [insumos, setInsumos] = useState<InsumoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedInsumo, setSelectedInsumo] = useState<InsumoItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);

  const handleScroll = useScrollDirection();
  const [stockModal, setStockModal] = useState<{ tipo: 'entrada' | 'salida'; cantidad: number; observacion: string }>({
    tipo: 'entrada',
    cantidad: 0,
    observacion: '',
  });
  const [showStockModal, setShowStockModal] = useState(false);
  const [filterStock, setFilterStock] = useState<'all' | 'critico' | 'normal' | 'sobrante'>('all');
  const [selectedCategoriaFilter, setSelectedCategoriaFilter] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);

  const [estadoActivo, setEstadoActivo] = useState(true);
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [showImageOptions, setShowImageOptions] = useState(false);

  const [formData, setFormData] = useState<CreateInsumoDto>({
    nombre: '',
    categoria: '',
    nombreCategoria: '',
    unidades: '',
    cantidad: 0,
    precio: 0,
    imageUrl: '',
    disponible: 'Si',
    apartir_de_cantidad: 0,
    agregar_cantidad: 100,
    fecha_de_vencimiento: '',
    descontar_cant_de_ventas: 'NO',
    notificar_a_whatsapp: 'NO',
    llevar_control_en_caja: 'NO'
  });

  const fetchInsumos = useCallback(async () => {
    try {
      const data = await insumosService.getAll({ limit: 10000 });
      setInsumos(data);
    } catch (error) {
      console.error('Error fetching insumos:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchAlertas = async () => {
    try {
      const data = await insumosService.getAlertas();
      setAlertas(data);
    } catch (error) {
      console.error('Error fetching alertas:', error);
    }
  };

  useEffect(() => {
    fetchInsumos();
    fetchAlertas();
  }, [fetchInsumos]);

  useSocketEvent(SocketEvent.REFRESH_INSUMOS, () => {
    fetchInsumos();
    fetchAlertas();
  });

  const onRefresh = () => {
    setRefreshing(true);
    fetchInsumos();
    fetchAlertas();
  };

  const categoriasConStock = useMemo(() => {
    const catsMap = new Map<string, number>();
    insumos.forEach(i => {
      const cat = i.nombreCategoria || i.NombreCategoria || i.categoriaNombre || i.Categoria;
      if (cat && typeof cat === 'string') {
        const stock = Number(i.cantidad || i.Cantidad) || 0;
        catsMap.set(cat, (catsMap.get(cat) || 0) + stock);
      }
    });
    return Array.from(catsMap.entries())
      .map(([nombre, stock]) => ({ nombre, stock }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [insumos]);

  const getCategoriasInsumos = () => {
    return categoriasConStock.map(c => c.nombre);
  };

  const filteredInsumos = useMemo(() => {
    let result = insumos;

    if (searchText) {
      const search = searchText.toLowerCase();
      result = result.filter(insumo =>
        (insumo.nombre || insumo.Nombre || '').toLowerCase().includes(search) ||
        (insumo.Categoria || insumo.nombreCategoria || insumo.NombreCategoria || insumo.categoriaNombre || '').toLowerCase().includes(search)
      );
    }

    if (selectedCategoriaFilter) {
      result = result.filter(insumo => {
        const cat = insumo.nombreCategoria || insumo.NombreCategoria || insumo.categoriaNombre || insumo.Categoria;
        return cat === selectedCategoriaFilter;
      });
    }

    if (filterStock !== 'all') {
      result = result.filter(insumo => insumo.estadoStock === filterStock);
    }

    return result.sort((a, b) => {
      // First, sort by Stock State (Critico -> Normal -> Sobrante)
      const estadoOrden = { critico: 0, normal: 1, sobrante: 2 };
      const orderA = estadoOrden[a.estadoStock || 'normal'] || 1;
      const orderB = estadoOrden[b.estadoStock || 'normal'] || 1;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      // Second, within the same state, sort by Stock Quantity DESCENDING (highest first)
      const qtyA = Number(a.cantidad || a.Cantidad || 0);
      const qtyB = Number(b.cantidad || b.Cantidad || 0);
      return qtyB - qtyA;
    });
  }, [insumos, searchText, filterStock, selectedCategoriaFilter]);

  const getCategoriaDisplay = (insumo: InsumoItem) => {
    return insumo.categoriaNombre || insumo.NombreCategoria || insumo.Categoria || null;
  };

  const getEstadoStock = (insumo: InsumoItem) => {
    const estado = insumo.estadoStock || 'normal';
    return ESTADOS_STOCK[estado] || ESTADOS_STOCK.normal;
  };

  const getStockPercentage = (insumo: InsumoItem) => {
    const min = insumo.apartir_de_cantidad || 10;
    const max = insumo.agregar_cantidad || 100;
    const current = insumo.cantidad || insumo.Cantidad || 0;
    const range = max - min;
    if (range <= 0) return 50;
    return Math.min(100, Math.max(0, ((current - min) / range) * 100));
  };

  const resetForm = () => {
    setFormData({
      nombre: '',
      categoria: '',
      nombreCategoria: '',
      unidades: '',
      cantidad: 0,
      precio: 0,
      imageUrl: '',
      disponible: 'Si',
      apartir_de_cantidad: 0,
      agregar_cantidad: 100,
      fecha_de_vencimiento: '',
      descontar_cant_de_ventas: 'NO',
      notificar_a_whatsapp: 'NO',
      llevar_control_en_caja: 'NO'
    });
    setLocalImageUri(null);
    setIsEditing(false);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (insumo: InsumoItem) => {
    setSelectedInsumo(insumo);
    setFormData({
      nombre: insumo.nombre || insumo.Nombre || '',
      categoria: insumo.categoria || insumo.Categoria || '',
      nombreCategoria: insumo.nombreCategoria || insumo.NombreCategoria || insumo.categoriaNombre || '',
      unidades: insumo.unidades || insumo.Unidades || '',
      cantidad: insumo.cantidad || insumo.Cantidad || 0,
      precio: insumo.precio || insumo.Precio || 0,
      imageUrl: insumo.imageUrl || insumo['Image Url'] || '',
      disponible: Number(insumo.disponible) || Number(insumo.Disponible) || 0,
      estado: insumo.estado || insumo.Estado || 'ACTIVO',
      apartir_de_cantidad: insumo.apartirDeCantidad || insumo.apartir_de_cantidad || 0,
      agregar_cantidad: insumo.agregarCantidad || insumo.agregar_cantidad || 100,
      fecha_de_vencimiento: insumo.fechaDeVencimiento || insumo.fecha_de_vencimiento || '',
      descontar_cant_de_ventas: insumo.descontarCantDeVentas || insumo.descontar_cant_de_ventas || 'NO',
      notificar_a_whatsapp: insumo.notificarAWhatsapp || insumo.notificar_a_whatsapp || 'NO',
      llevar_control_en_caja: insumo.llevarControlEnCaja || insumo.llevar_control_en_caja || 'NO'
    });
    setLocalImageUri(null); // Reset local image when opening edit, rely on imageUrl if exists
    setIsEditing(true);
    setEstadoActivo((insumo.estado || insumo.Estado || 'ACTIVO').toUpperCase() === 'ACTIVO');
    setShowModal(true);
  };

  const openStockModal = (insumo: InsumoItem, tipo: 'entrada' | 'salida' = 'entrada') => {
    setSelectedInsumo(insumo);
    setStockModal({ tipo, cantidad: 0, observacion: '' });
    setShowStockModal(true);
  };

  const getErrorMessage = (error: any, defaultMsg: string) => {
    const msg = error?.response?.data?.message || error?.message || defaultMsg;
    if (Array.isArray(msg)) return msg.join('\n');
    if (typeof msg === 'object') return JSON.stringify(msg);
    return String(msg);
  };

  const handleSelectImage = () => {
    setShowImageOptions(true);
  };

  const handleCamera = async () => {
    setShowImageOptions(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara para tomar fotos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled) {
      setLocalImageUri(result.assets[0].uri);
    }
  };

  const handleGallery = async () => {
    setShowImageOptions(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tus fotos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled) {
      setLocalImageUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!formData.nombre?.trim()) {
      Alert.alert('Error', 'El nombre es obligatorio');
      return;
    }

    setSaving(true);
    try {
      let finalImageUrl = formData.imageUrl;
      if (localImageUri) {
        try {
          const uploadedUrl = await insumosService.uploadImage(localImageUri);
          if (uploadedUrl) {
            finalImageUrl = uploadedUrl;
          }
        } catch (uploadError) {
          console.error('[DEBUG] Error subiendo imagen:', uploadError);
          Alert.alert('Aviso', 'Se guardará el insumo, pero falló la subida de la imagen.');
        }
      }

      const dataToSave = {
        ...formData,
        imageUrl: finalImageUrl,
        imagen: finalImageUrl,
        estado: estadoActivo ? 'ACTIVO' : 'INACTIVO',
        cantidad: Math.max(0, formData.cantidad || 0),
        precio: Math.max(0, formData.precio || 0),
        apartir_de_cantidad: Math.max(0, formData.apartir_de_cantidad || 0),
        agregar_cantidad: Math.max(0, formData.agregar_cantidad || 0),
        fecha_de_vencimiento: formData.fecha_de_vencimiento || undefined,
      };

      console.log('[DEBUG] Guardando Insumo (InsumosScreen):', dataToSave);

      if (isEditing && selectedInsumo) {
        await insumosService.update(selectedInsumo.IDalimentos, dataToSave);
        Alert.alert('Éxito', 'Insumo actualizado correctamente');
      } else {
        await insumosService.create(dataToSave);
        Alert.alert('Éxito', 'Insumo creado correctamente');
      }
      setShowModal(false);
      resetForm();
      fetchInsumos();
    } catch (error: any) {
      console.log('[DEBUG] Error guardando insumo (InsumosScreen):', error?.response?.data || error);
      Alert.alert('Error', getErrorMessage(error, 'No se pudo guardar el insumo'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (insumo: InsumoItem) => {
    Alert.alert(
      'Eliminar Insumo',
      `¿Estás seguro de eliminar "${insumo.nombre || insumo.Nombre}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await insumosService.delete(insumo.IDalimentos);
              Alert.alert('Éxito', 'Insumo eliminado');
              fetchInsumos();
            } catch (error) {
              Alert.alert('Error', 'No se pudo eliminar');
            }
          },
        },
      ]
    );
  };

  const handleStockAction = async () => {
    if (!selectedInsumo || stockModal.cantidad <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida');
      return;
    }

    setStockLoading(true);
    try {
      console.log('[DEBUG] StockAction enviando:', stockModal.cantidad, stockModal.observacion);
      if (stockModal.tipo === 'entrada') {
        await insumosService.agregarStock(selectedInsumo.IDalimentos, stockModal.cantidad, stockModal.observacion);
      } else {
        if (stockModal.cantidad > (selectedInsumo.cantidad || selectedInsumo.Cantidad || 0)) {
          Alert.alert('Error', 'No hay suficiente stock disponible');
          setStockLoading(false);
          return;
        }
        await insumosService.descontarStock(selectedInsumo.IDalimentos, stockModal.cantidad, stockModal.observacion);
      }
      Alert.alert('Éxito', `Stock ${stockModal.tipo === 'entrada' ? 'agregado' : 'descontado'} correctamente`);
      setShowStockModal(false);
      setSelectedInsumo(null);
      fetchInsumos();
      fetchAlertas();
    } catch (error: any) {
      console.log('[DEBUG] Error en StockAction:', error?.response?.data || error);
      Alert.alert('Error', error?.response?.data?.message || `No se pudo ${stockModal.tipo === 'entrada' ? 'agregar' : 'descontar'} stock`);
    } finally {
      setStockLoading(false);
    }
  };

  const formatMoney = (amount?: number) => {
    if (amount == null) return '$0';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
  };

  const statsSummary = useMemo(() => ({
    total: insumos.length,
    criticos: insumos.filter(i => i.estadoStock === 'critico').length,
    normales: insumos.filter(i => i.estadoStock === 'normal').length,
    sobrantes: insumos.filter(i => i.estadoStock === 'sobrante').length,
  }), [insumos]);

  const getImageUrl = (item: InsumoItem) => {
    const url = item.imagen || item.imageUrl || item.imagencard || item.Image;
    if (!url) return null;
    if (url.startsWith('http')) return url;
    
    // Check if the URL is from the old structure (INSUMOS_Images/)
    if (url.startsWith('INSUMOS_Images/')) {
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
      return `${baseUrl}/uploads/insumos/${url.split('/').pop()}`;
    }

    const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
    const finalUrl = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    // console.log('[DEBUG InsumosScreen] URL Generada:', finalUrl);
    return finalUrl;
  };

  // Animación para el Skeleton
  const skeletonAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonAnim, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(skeletonAnim, { toValue: 0.3, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, []);

  const renderSkeletonInsumo = () => (
    <Card className="mb-3">
      <View className="p-4">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-1 flex-row items-center">
            <Animated.View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#e5e7eb', opacity: skeletonAnim, marginRight: 12 }} />
            <View className="flex-1 pr-2">
              <Animated.View style={{ height: 18, width: '80%', backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim, marginBottom: 8 }} />
              <Animated.View style={{ height: 14, width: '50%', backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim }} />
            </View>
          </View>
          <View className="items-end">
            <Animated.View style={{ height: 22, width: 60, backgroundColor: '#e5e7eb', borderRadius: 8, opacity: skeletonAnim, marginBottom: 4 }} />
          </View>
        </View>

        <View className="bg-gray-50 rounded-xl p-3">
          <View className="flex-row justify-between items-center mb-2">
            <Animated.View style={{ height: 14, width: 80, backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim }} />
            <Animated.View style={{ height: 24, width: 40, backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim }} />
          </View>
          <Animated.View style={{ height: 8, width: '100%', backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim, marginBottom: 8 }} />
          <View className="flex-row justify-between">
            <Animated.View style={{ height: 12, width: 40, backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim }} />
            <Animated.View style={{ height: 12, width: 40, backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim }} />
          </View>
        </View>

        <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <Animated.View style={{ height: 18, width: 70, backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim }} />
          <View className="flex-row">
            <Animated.View style={{ height: 30, width: 30, backgroundColor: '#e5e7eb', borderRadius: 8, opacity: skeletonAnim, marginRight: 8 }} />
            <Animated.View style={{ height: 30, width: 30, backgroundColor: '#e5e7eb', borderRadius: 8, opacity: skeletonAnim, marginRight: 8 }} />
            <Animated.View style={{ height: 30, width: 30, backgroundColor: '#e5e7eb', borderRadius: 8, opacity: skeletonAnim }} />
          </View>
        </View>
      </View>
    </Card>
  );

  const renderInsumoItem = ({ item }: { item: InsumoItem }) => {
    const estado = getEstadoStock(item);
    const categoria = getCategoriaDisplay(item);
    const stockPct = getStockPercentage(item);
    const imageUrl = getImageUrl(item);

    return (
      <Card className="mb-3">
        <TouchableOpacity
          onPress={() => navigation.navigate('InsumoDetail', { id: item.IDalimentos })}
          activeOpacity={0.8}
        >
          <View className="p-4">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1 flex-row items-center">
                <View className="w-16 h-16 rounded-2xl bg-white items-center justify-center mr-3 border border-gray-200" style={{ elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
                  {imageUrl ? (
                    <ImageComponent 
                      source={{ uri: imageUrl }} 
                      style={{ width: 56, height: 56, borderRadius: 12 }} 
                      contentFit="contain"
                      resizeMode="contain" 
                      transition={200}
                    />
                  ) : (
                    <MaterialCommunityIcons name="food-variant" size={28} color="#9ca3af" />
                  )}
                </View>
                <View className="flex-1 pr-2">
                  <RNText className="text-base font-bold text-gray-900 leading-5">
                    {item.nombre || item.Nombre || 'Sin nombre'}
                  </RNText>
                  {categoria ? (
                    <View className="flex-row items-center mt-1.5">
                      <MaterialCommunityIcons name="folder-outline" size={14} color="#6b7280" />
                      <RNText className="text-xs text-gray-500 ml-1 font-medium">{categoria}</RNText>
                    </View>
                  ) : (
                    <RNText className="text-xs text-gray-400 italic mt-1.5">Sin categoría</RNText>
                  )}
                </View>
              </View>
              <View className="items-end">
                <View className={`px-2 py-1 rounded-lg mb-1`} style={{ backgroundColor: estado.bg }}>
                  <RNText className="text-xs font-semibold" style={{ color: estado.color }}>
                    {estado.label}
                  </RNText>
                </View>
                {item.unidades || item.Unidades ? (
                  <RNText className="text-xs text-gray-400">{item.unidades || item.Unidades}</RNText>
                ) : null}
              </View>
            </View>

            <View className="bg-gray-50 rounded-xl p-3">
              <View className="flex-row justify-between items-center mb-2">
                <RNText className="text-sm font-medium text-gray-600">Stock Actual</RNText>
                <RNText className="text-2xl font-extrabold" style={{ color: estado.color }}>
                  {Number(item.disponible ?? item.Disponible ?? 0)}
                </RNText>
              </View>

              <View className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${stockPct}%`,
                    backgroundColor: estado.color,
                  }}
                />
              </View>

              <View className="flex-row justify-between">
                <RNText className="text-xs text-gray-400">Min: {item.apartir_de_cantidad || item.apartirDeCantidad || item.apartir_de_cantidad === 0 || item.apartirDeCantidad === 0 ? (item.apartir_de_cantidad ?? item.apartirDeCantidad) : 0}</RNText>
                <RNText className="text-xs text-gray-400">Max: {item.agregar_cantidad || item.agregarCantidad || item.agregar_cantidad === 0 || item.agregarCantidad === 0 ? (item.agregar_cantidad ?? item.agregarCantidad) : 100}</RNText>
              </View>
            </View>

            <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <View className="flex-row items-center">
                <RNText className="text-sm font-semibold text-gray-700">
                  {formatMoney(item.precio || item.Precio)}
                </RNText>
                {(item.estado?.toUpperCase() !== 'ACTIVO' && item.Estado?.toUpperCase() !== 'ACTIVO') && (
                  <View className="ml-2 px-2 py-0.5 bg-red-100 rounded">
                    <RNText className="text-xs text-red-600 font-medium">Inactivo</RNText>
                  </View>
                )}
              </View>
              
              <View className="flex-row items-center">
                {canEdit && (
                  <TouchableOpacity
                    style={{ padding: 6, backgroundColor: '#e0e7ff', borderRadius: 8, marginRight: 8 }}
                    onPress={() => openStockModal(item)}
                  >
                    <Ionicons name="swap-vertical" size={18} color="#4f46e5" />
                  </TouchableOpacity>
                )}
                {canEdit && (
                  <TouchableOpacity
                    style={{ padding: 6, backgroundColor: '#f3f4f6', borderRadius: 8, marginRight: 8 }}
                    onPress={() => openEditModal(item)}
                  >
                    <Ionicons name="pencil-outline" size={18} color="#4b5563" />
                  </TouchableOpacity>
                )}
                {canDelete && (
                  <TouchableOpacity
                    style={{ padding: 6, backgroundColor: '#fee2e2', borderRadius: 8 }}
                    onPress={() => handleDelete(item)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Card>
    );
  };

  const renderHeader = () => (
    <View style={{ paddingTop: 16 }}>
      <View style={{ marginBottom: 16 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 12,
              marginRight: 8,
              backgroundColor: filterStock === 'all' ? '#10b981' : '#f3f4f6',
              borderWidth: 1,
              borderColor: filterStock === 'all' ? '#10b981' : '#e5e7eb',
            }}
            onPress={() => setFilterStock('all')}
          >
            <Ionicons name="layers-outline" size={16} color={filterStock === 'all' ? '#fff' : '#6b7280'} style={{ marginRight: 6 }} />
            <RNText style={{ fontSize: 13, fontWeight: '700', color: filterStock === 'all' ? '#fff' : '#4b5563' }}>
              Todos
            </RNText>
            <View style={{ backgroundColor: filterStock === 'all' ? 'rgba(255,255,255,0.2)' : '#e5e7eb', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 }}>
              <RNText style={{ fontSize: 11, fontWeight: '700', color: filterStock === 'all' ? '#fff' : '#6b7280' }}>
                {statsSummary.total}
              </RNText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 12,
              marginRight: 8,
              backgroundColor: filterStock === 'critico' ? '#ef4444' : '#f3f4f6',
              borderWidth: 1,
              borderColor: filterStock === 'critico' ? '#ef4444' : '#e5e7eb',
            }}
            onPress={() => setFilterStock('critico')}
          >
            <Ionicons name="warning-outline" size={16} color={filterStock === 'critico' ? '#fff' : '#6b7280'} style={{ marginRight: 6 }} />
            <RNText style={{ fontSize: 13, fontWeight: '700', color: filterStock === 'critico' ? '#fff' : '#4b5563' }}>
              Críticos
            </RNText>
            <View style={{ backgroundColor: filterStock === 'critico' ? 'rgba(255,255,255,0.2)' : '#e5e7eb', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 }}>
              <RNText style={{ fontSize: 11, fontWeight: '700', color: filterStock === 'critico' ? '#fff' : '#6b7280' }}>
                {statsSummary.criticos}
              </RNText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 12,
              marginRight: 8,
              backgroundColor: filterStock === 'normal' ? '#22c55e' : '#f3f4f6',
              borderWidth: 1,
              borderColor: filterStock === 'normal' ? '#22c55e' : '#e5e7eb',
            }}
            onPress={() => setFilterStock('normal')}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={filterStock === 'normal' ? '#fff' : '#6b7280'} style={{ marginRight: 6 }} />
            <RNText style={{ fontSize: 13, fontWeight: '700', color: filterStock === 'normal' ? '#fff' : '#4b5563' }}>
              Normales
            </RNText>
            <View style={{ backgroundColor: filterStock === 'normal' ? 'rgba(255,255,255,0.2)' : '#e5e7eb', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 }}>
              <RNText style={{ fontSize: 11, fontWeight: '700', color: filterStock === 'normal' ? '#fff' : '#6b7280' }}>
                {statsSummary.normales}
              </RNText>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 12,
              backgroundColor: filterStock === 'sobrante' ? '#3b82f6' : '#f3f4f6',
              borderWidth: 1,
              borderColor: filterStock === 'sobrante' ? '#3b82f6' : '#e5e7eb',
            }}
            onPress={() => setFilterStock('sobrante')}
          >
            <Ionicons name="trending-up-outline" size={16} color={filterStock === 'sobrante' ? '#fff' : '#6b7280'} style={{ marginRight: 6 }} />
            <RNText style={{ fontSize: 13, fontWeight: '700', color: filterStock === 'sobrante' ? '#fff' : '#4b5563' }}>
              Sobrantes
            </RNText>
            <View style={{ backgroundColor: filterStock === 'sobrante' ? 'rgba(255,255,255,0.2)' : '#e5e7eb', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 }}>
              <RNText style={{ fontSize: 11, fontWeight: '700', color: filterStock === 'sobrante' ? '#fff' : '#6b7280' }}>
                {statsSummary.sobrantes}
              </RNText>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <View className="bg-white rounded-xl shadow-sm mb-4">
        <View className="flex-row items-center px-4 py-3 border-b border-gray-100">
          <Ionicons name="search" size={20} color="#9ca3af" />
          <TextInput
            className="flex-1 ml-3 text-base text-gray-900"
            placeholder="Buscar insumo por nombre o categoría..."
            placeholderTextColor="#9ca3af"
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Ionicons name="close-circle" size={20} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
        <View className="px-4 py-3">
          <RNText className="text-xs font-semibold text-gray-500 mb-2 uppercase">Filtrar por categoría</RNText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TouchableOpacity
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: selectedCategoriaFilter === null ? '#3b82f6' : '#f3f4f6', marginRight: 8 }}
              onPress={() => setSelectedCategoriaFilter(null)}
            >
              <RNText style={{ fontSize: 12, fontWeight: '600', color: selectedCategoriaFilter === null ? '#fff' : '#4b5563' }}>Todas</RNText>
            </TouchableOpacity>
            {categoriasConStock.map(cat => (
              <TouchableOpacity
                key={cat.nombre}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: selectedCategoriaFilter === cat.nombre ? '#3b82f6' : '#f3f4f6', marginRight: 8 }}
                onPress={() => setSelectedCategoriaFilter(cat.nombre)}
              >
                <RNText style={{ fontSize: 12, fontWeight: '600', color: selectedCategoriaFilter === cat.nombre ? '#fff' : '#4b5563' }}>
                  {cat.nombre} ({cat.stock})
                </RNText>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
        <StatusBar style="dark" backgroundColor="transparent" translucent />
        <SafeAreaView style={{ backgroundColor: '#ffffff' }} edges={['top']}>
          <View className="bg-white px-4 py-3 flex-row items-center justify-between border-b border-gray-200">
            <View className="flex-row items-center">
              <TouchableOpacity className="mr-3" onPress={() => navigation.goBack()}>
                <Ionicons name="arrow-back" size={24} color="#111827" />
              </TouchableOpacity>
              <View>
                <RNText className="text-xl font-bold text-gray-900">Insumos</RNText>
                <Animated.View style={{ height: 14, width: 100, backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim, marginTop: 4 }} />
              </View>
            </View>
            <View className="flex-row items-center">
              <Animated.View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#e5e7eb', opacity: skeletonAnim, marginRight: 8 }} />
              <Animated.View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#e5e7eb', opacity: skeletonAnim }} />
            </View>
          </View>
        </SafeAreaView>
        
        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingTop: 16 }}>
          {/* Falso Header Skeleton */}
          <View style={{ marginBottom: 16, flexDirection: 'row' }}>
            <Animated.View style={{ height: 36, width: 100, backgroundColor: '#e5e7eb', borderRadius: 12, opacity: skeletonAnim, marginRight: 8 }} />
            <Animated.View style={{ height: 36, width: 100, backgroundColor: '#e5e7eb', borderRadius: 12, opacity: skeletonAnim, marginRight: 8 }} />
            <Animated.View style={{ height: 36, width: 100, backgroundColor: '#e5e7eb', borderRadius: 12, opacity: skeletonAnim }} />
          </View>
          <View className="bg-white rounded-xl shadow-sm mb-4">
            <View className="px-4 py-3 border-b border-gray-100">
              <Animated.View style={{ height: 20, width: '100%', backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim }} />
            </View>
            <View className="px-4 py-3">
              <Animated.View style={{ height: 14, width: 120, backgroundColor: '#e5e7eb', borderRadius: 4, opacity: skeletonAnim, marginBottom: 8 }} />
              <View style={{ flexDirection: 'row' }}>
                <Animated.View style={{ height: 28, width: 80, backgroundColor: '#e5e7eb', borderRadius: 16, opacity: skeletonAnim, marginRight: 8 }} />
                <Animated.View style={{ height: 28, width: 80, backgroundColor: '#e5e7eb', borderRadius: 16, opacity: skeletonAnim, marginRight: 8 }} />
                <Animated.View style={{ height: 28, width: 80, backgroundColor: '#e5e7eb', borderRadius: 16, opacity: skeletonAnim }} />
              </View>
            </View>
          </View>
          
          {[...Array(5)].map((_, i) => <View key={i}>{renderSkeletonInsumo()}</View>)}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <StatusBar style="dark" backgroundColor="transparent" translucent />
      <SafeAreaView style={{ backgroundColor: '#ffffff' }} edges={['top']}>
        <View className="bg-white px-4 py-3 flex-row items-center justify-between border-b border-gray-200">
          <View className="flex-row items-center">
            <TouchableOpacity className="mr-3" onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color="#111827" />
            </TouchableOpacity>
            <View>
              <RNText className="text-xl font-bold text-gray-900">Insumos</RNText>
              <RNText className="text-sm text-gray-500">{filteredInsumos.length} de {insumos.length} registros</RNText>
            </View>
          </View>
          <View className="flex-row items-center">
            {alertas.length > 0 && (
              <TouchableOpacity
                className="w-11 h-11 rounded-xl bg-red-50 items-center justify-center mr-2"
                onPress={() => setShowAlerts(true)}
              >
                <Ionicons name="alert-circle" size={24} color="#ef4444" />
                <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                  <RNText className="text-white text-xs font-bold">{alertas.length}</RNText>
                </View>
              </TouchableOpacity>
            )}
            {canCreate && (
              <>
                <TouchableOpacity
                  className="w-11 h-11 rounded-xl bg-primary items-center justify-center mr-2"
                  onPress={() => navigation.navigate('BulkImport')}
                >
                  <Ionicons name="cloud-upload" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  className="w-11 h-11 rounded-xl bg-green-500 items-center justify-center"
                  onPress={openCreateModal}
                >
                  <Ionicons name="add" size={24} color="#fff" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </SafeAreaView>

      <FlatList
        data={filteredInsumos}
        renderItem={renderInsumoItem}
        keyExtractor={(item) => item.IDalimentos}
        onScroll={handleScroll}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={renderHeader()}
        contentContainerStyle={{ paddingBottom: 100 }}
        style={{ flex: 1, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3b82f6']} />}
        ListEmptyComponent={
          <View className="items-center justify-center py-16">
            <MaterialCommunityIcons name="package-variant" size={64} color="#d1d5db" />
            <RNText className="mt-4 text-lg text-gray-500 font-medium">No hay insumos</RNText>
            <RNText className="text-sm text-gray-400 mt-1">
              {searchText || filterStock !== 'all' ? 'Intenta con otros filtros' : 'Agrega tu primer insumo'}
            </RNText>
            {!searchText && filterStock === 'all' && canCreate && (
              <Button className="mt-4" onPress={openCreateModal}>
                <RNText className="text-white font-semibold">Agregar insumo</RNText>
              </Button>
            )}
          </View>
        }
      />

      <Modal visible={showModal} animationType="slide" onRequestClose={() => setShowModal(false)} presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }} edges={['top']}>
          <View className="px-4 py-4 border-b border-gray-200 flex-row items-center justify-between">
            <RNText className="text-lg font-bold text-gray-900">
              {isEditing ? 'Editar Insumo' : 'Nuevo Insumo'}
            </RNText>
            <TouchableOpacity onPress={() => setShowModal(false)} className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingVertical: 16 }}>
            <View className="items-center mb-6">
              <TouchableOpacity onPress={handleSelectImage} activeOpacity={0.8}>
                <View className="w-24 h-24 rounded-full bg-white items-center justify-center border-2 border-dashed border-gray-300 overflow-hidden">
                  {(localImageUri || formData.imageUrl || formData.imagen) ? (
                    <ImageComponent 
                      source={{ uri: localImageUri || getImageUrl(formData as any) }} 
                      style={{ width: '100%', height: '100%' }} 
                      contentFit="contain"
                      resizeMode="contain" 
                      transition={200}
                    />
                  ) : (
                    <Ionicons name="camera-outline" size={32} color="#9ca3af" />
                  )}
                </View>
                <View className="absolute bottom-0 right-0 bg-blue-500 w-8 h-8 rounded-full items-center justify-center border-2 border-white">
                  <Ionicons name="pencil" size={14} color="white" />
                </View>
              </TouchableOpacity>
              
              {(localImageUri || formData.imageUrl || formData.imagen) && (
                <TouchableOpacity 
                  onPress={() => {
                    setLocalImageUri(null);
                    setFormData(p => ({ ...p, imageUrl: null, imagen: null }));
                  }} 
                  className="mt-3 flex-row items-center bg-red-50 px-3 py-1.5 rounded-full"
                >
                  <Ionicons name="trash" size={16} color="#ef4444" />
                  <RNText className="text-xs text-red-500 font-medium ml-1">Eliminar foto</RNText>
                </TouchableOpacity>
              )}
            </View>

            <Input
              label="Nombre *"
              placeholder="Nombre del insumo"
              value={formData.nombre}
              onChangeText={(t) => setFormData(p => ({ ...p, nombre: t }))}
            />

            <View className="mt-4">
              <RNText style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Categoría</RNText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {getCategoriasInsumos().map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginRight: 8, marginBottom: 8, backgroundColor: formData.categoria === cat ? '#3b82f6' : '#f3f4f6' }}
                    onPress={() => setFormData(p => ({ ...p, categoria: cat, nombreCategoria: cat }))}
                  >
                    <RNText style={{ fontSize: 12, fontWeight: '500', color: formData.categoria === cat ? '#fff' : '#6b7280' }}>{cat}</RNText>
                  </TouchableOpacity>
                ))}
              </View>
              <Input
                placeholder="O escribe una nueva categoría..."
                value={formData.nombreCategoria}
                onChangeText={(t) => setFormData(p => ({ ...p, nombreCategoria: t, categoria: t }))}
              />
            </View>

            <View className="flex-row mt-4">
              <View className="flex-1 mr-2">
                <Input
                  label="Stock Actual"
                  placeholder="0"
                  keyboardType="numeric"
                  value={String(formData.disponible ?? 0)}
                  onChangeText={(t) => setFormData(p => ({ ...p, disponible: t.replace(/[^0-9-]/g, '') }))}
                />
              </View>
              <View className="flex-1">
                <Input
                  label="Stock Histórico"
                  placeholder="0"
                  keyboardType="numeric"
                  value={String(formData.cantidad || 0)}
                  onChangeText={(t) => setFormData(p => ({ ...p, cantidad: Number(t.replace(/[^0-9]/g, '')) || 0 }))}
                />
              </View>
            </View>

            <View className="flex-row mt-4">
              <View className="flex-1 mr-2">
                <Input
                  label="Precio"
                  placeholder="$0"
                  keyboardType="numeric"
                  value={String(formData.precio || 0)}
                  onChangeText={(t) => setFormData(p => ({ ...p, precio: Number(t.replace(/[^0-9]/g, '')) || 0 }))}
                />
              </View>
            </View>

            <View className="flex-row mt-4">
              <View className="flex-1 mr-2">
                <Input
                label="Stock Mínimo (A partir de)"
                placeholder="10"
                keyboardType="numeric"
                value={String(formData.apartir_de_cantidad || 0)}
                onChangeText={(t) => setFormData(p => ({ ...p, apartir_de_cantidad: Math.max(0, Number(t.replace(/[^0-9]/g, '')) || 0) }))}
              />
              </View>
              <View className="flex-1">
                <Input
                label="Stock Máximo (Agregar)"
                placeholder="100"
                keyboardType="numeric"
                value={String(formData.agregar_cantidad || 0)}
                onChangeText={(t) => setFormData(p => ({ ...p, agregar_cantidad: Math.max(0, Number(t.replace(/[^0-9]/g, '')) || 0) }))}
              />
              </View>
            </View>

            <View className="mt-4">
              <Input
                label="Unidades (ej: kg, Lt, unidades)"
                placeholder="kg"
                value={formData.unidades}
                onChangeText={(t) => setFormData(p => ({ ...p, unidades: t }))}
              />
            </View>

            <View className="mt-4">
              <Input
                label="Fecha de Vencimiento"
                placeholder="DD/MM/YYYY"
                value={formData.fecha_de_vencimiento}
                onChangeText={(t) => setFormData(p => ({ ...p, fecha_de_vencimiento: t }))}
              />
            </View>

            <View style={{ marginTop: 16, backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e5e7eb' }}>
              <RNText style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 12 }}>Configuraciones</RNText>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <RNText style={{ fontSize: 14, color: '#4b5563' }}>Estado Activo</RNText>
                <TouchableOpacity
                  style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: estadoActivo ? '#22c55e' : '#d1d5db', padding: 2 }}
                  onPress={() => setEstadoActivo(!estadoActivo)}
                >
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', transform: [{ translateX: estadoActivo ? 20 : 0 }] }} />
                </TouchableOpacity>
              </View>



              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <RNText style={{ fontSize: 14, color: '#4b5563' }}>Descontar cant de ventas</RNText>
                <TouchableOpacity
                  style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: formData.descontar_cant_de_ventas === 'SI' ? '#22c55e' : '#d1d5db', padding: 2 }}
                  onPress={() => setFormData(p => ({ ...p, descontar_cant_de_ventas: p.descontar_cant_de_ventas === 'SI' ? 'NO' : 'SI' }))}
                >
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', transform: [{ translateX: formData.descontar_cant_de_ventas === 'SI' ? 20 : 0 }] }} />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <RNText style={{ fontSize: 14, color: '#4b5563' }}>Notificar a WhatsApp</RNText>
                <TouchableOpacity
                  style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: formData.notificar_a_whatsapp === 'SI' ? '#22c55e' : '#d1d5db', padding: 2 }}
                  onPress={() => setFormData(p => ({ ...p, notificar_a_whatsapp: p.notificar_a_whatsapp === 'SI' ? 'NO' : 'SI' }))}
                >
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', transform: [{ translateX: formData.notificar_a_whatsapp === 'SI' ? 20 : 0 }] }} />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <RNText style={{ fontSize: 14, color: '#4b5563' }}>Llevar control en caja</RNText>
                <TouchableOpacity
                  style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: formData.llevar_control_en_caja === 'SI' ? '#22c55e' : '#d1d5db', padding: 2 }}
                  onPress={() => setFormData(p => ({ ...p, llevar_control_en_caja: p.llevar_control_en_caja === 'SI' ? 'NO' : 'SI' }))}
                >
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', transform: [{ translateX: formData.llevar_control_en_caja === 'SI' ? 20 : 0 }] }} />
                </TouchableOpacity>
              </View>
            </View>

            {isEditing && (
              <View className="mt-4">
                <TouchableOpacity
                  className="py-3 px-4 bg-red-50 rounded-xl items-center"
                  onPress={() => {
                    setShowModal(false);
                    if (selectedInsumo) handleDelete(selectedInsumo);
                  }}
                >
                  <RNText className="text-red-600 font-semibold">Eliminar Insumo</RNText>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          <View className="p-4 border-t border-gray-200">
            <Button
              className="bg-primary"
              onPress={handleSave}
              loading={saving}
              disabled={saving}
            >
              <RNText className="text-white font-semibold">
                {isEditing ? 'Actualizar' : 'Crear Insumo'}
              </RNText>
            </Button>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={showAlerts} animationType="slide" onRequestClose={() => setShowAlerts(false)} presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white">
          <View className="px-4 py-4 border-b border-gray-200 flex-row items-center justify-between">
            <RNText className="text-lg font-bold text-gray-900">Alertas de Stock</RNText>
            <TouchableOpacity onPress={() => setShowAlerts(false)} className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={alertas}
            keyExtractor={(item: any) => item.id}
            contentContainerClassName="p-4"
            renderItem={({ item }: any) => (
              <Card className="mb-2 p-4 bg-red-50 border border-red-100">
                <View className="flex-row items-center">
                  <MaterialCommunityIcons name="alert-circle" size={24} color="#ef4444" />
                  <View className="ml-3 flex-1">
                    <RNText className="font-semibold text-gray-900">{item.insumo}</RNText>
                    <RNText className="text-sm text-red-600 mt-1">{item.mensaje}</RNText>
                  </View>
                </View>
              </Card>
            )}
            ListEmptyComponent={
              <View className="items-center py-8">
                <MaterialCommunityIcons name="check-circle" size={48} color="#22c55e" />
                <RNText className="mt-2 text-gray-600 font-medium">No hay alertas</RNText>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      <Modal visible={showImageOptions} animationType="fade" transparent onRequestClose={() => setShowImageOptions(false)}>
        <TouchableOpacity 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} 
          activeOpacity={1} 
          onPress={() => setShowImageOptions(false)}
        >
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <RNText style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 16, textAlign: 'center' }}>Seleccionar Imagen</RNText>
            
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
              onPress={handleCamera}
            >
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                <Ionicons name="camera" size={24} color="#3b82f6" />
              </View>
              <View>
                <RNText style={{ fontSize: 16, fontWeight: '600', color: '#1f2937' }}>Tomar Foto</RNText>
                <RNText style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>Usar la cámara del dispositivo</RNText>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16 }}
              onPress={handleGallery}
            >
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                <Ionicons name="images" size={24} color="#22c55e" />
              </View>
              <View>
                <RNText style={{ fontSize: 16, fontWeight: '600', color: '#1f2937' }}>Elegir de Galería</RNText>
                <RNText style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>Seleccionar foto existente</RNText>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* MODAL DE MOVIMIENTO DE STOCK (ACCESO RÁPIDO) */}
      <Modal visible={showStockModal} animationType="slide" transparent onRequestClose={() => setShowStockModal(false)}>
        <TouchableOpacity 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} 
          activeOpacity={1} 
          onPress={() => setShowStockModal(false)}
        >
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <RNText style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>Registrar Movimiento</RNText>
              <TouchableOpacity onPress={() => setShowStockModal(false)} style={{ backgroundColor: '#f3f4f6', padding: 6, borderRadius: 20 }}>
                <Ionicons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {selectedInsumo && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, backgroundColor: '#f9fafb', padding: 12, borderRadius: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
                  {getImageUrl(selectedInsumo) ? (
                    <ImageComponent 
                      source={{ uri: getImageUrl(selectedInsumo) as string }} 
                      style={{ width: 32, height: 32 }} 
                      contentFit="contain"
                      resizeMode="contain" 
                    />
                  ) : (
                    <MaterialCommunityIcons name="food-variant" size={20} color="#9ca3af" />
                  )}
                </View>
                <View>
                  <RNText style={{ fontSize: 14, fontWeight: '700', color: '#1f2937' }}>{selectedInsumo.nombre || selectedInsumo.Nombre}</RNText>
                  <RNText style={{ fontSize: 12, color: '#6b7280' }}>Stock Actual: {selectedInsumo.cantidad || selectedInsumo.Cantidad || 0}</RNText>
                </View>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: stockModal.tipo === 'entrada' ? '#3b82f6' : '#e5e7eb', backgroundColor: stockModal.tipo === 'entrada' ? '#eff6ff' : '#fff' }}
                onPress={() => setStockModal({ ...stockModal, tipo: 'entrada' })}
              >
                <Ionicons name="add-circle" size={20} color={stockModal.tipo === 'entrada' ? '#22c55e' : '#9ca3af'} />
                <RNText style={{ marginLeft: 8, fontSize: 14, fontWeight: '700', color: stockModal.tipo === 'entrada' ? '#22c55e' : '#6b7280' }}>Entrada</RNText>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: stockModal.tipo === 'salida' ? '#ef4444' : '#e5e7eb', backgroundColor: stockModal.tipo === 'salida' ? '#fef2f2' : '#fff' }}
                onPress={() => setStockModal({ ...stockModal, tipo: 'salida' })}
              >
                <Ionicons name="remove-circle" size={20} color={stockModal.tipo === 'salida' ? '#ef4444' : '#9ca3af'} />
                <RNText style={{ marginLeft: 8, fontSize: 14, fontWeight: '700', color: stockModal.tipo === 'salida' ? '#ef4444' : '#6b7280' }}>Salida</RNText>
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 16 }}>
              <RNText style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Cantidad</RNText>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, padding: 8 }}>
                <TouchableOpacity
                  style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}
                  onPress={() => setStockModal({ ...stockModal, cantidad: Math.max(0, stockModal.cantidad - 1) })}
                >
                  <Ionicons name="remove" size={24} color="#4b5563" />
                </TouchableOpacity>
                <TextInput
                  style={{ flex: 1, fontSize: 24, fontWeight: '800', color: '#111827', textAlign: 'center', padding: 0, margin: 0 }}
                  keyboardType="numeric"
                  value={String(stockModal.cantidad)}
                  onChangeText={(t) => setStockModal({ ...stockModal, cantidad: Number(t.replace(/[^0-9]/g, '')) || 0 })}
                />
                <TouchableOpacity
                  style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}
                  onPress={() => setStockModal({ ...stockModal, cantidad: stockModal.cantidad + 1 })}
                >
                  <Ionicons name="add" size={24} color="#4b5563" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ marginBottom: 24 }}>
              <RNText style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Observación (Opcional)</RNText>
              <TextInput
                style={{ backgroundColor: '#f3f4f6', borderRadius: 12, padding: 14, fontSize: 14, color: '#1f2937' }}
                placeholder={stockModal.tipo === 'entrada' ? "Ej: Compra a proveedor" : "Ej: Producto dañado / Vencido"}
                placeholderTextColor="#9ca3af"
                value={stockModal.observacion}
                onChangeText={(t) => setStockModal({ ...stockModal, observacion: t })}
              />
            </View>

            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 16, opacity: stockLoading ? 0.7 : 1 }}
              onPress={handleStockAction}
              disabled={stockLoading}
            >
              {stockLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="save" size={20} color="#fff" />
                  <RNText style={{ color: '#fff', fontWeight: '800', fontSize: 16, marginLeft: 8 }}>Guardar Movimiento</RNText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </View>
  );
};

export default InsumosScreen;