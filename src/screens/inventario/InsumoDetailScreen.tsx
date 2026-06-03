import React, { useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, Text as RNText, StyleSheet, ScrollView, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, TextInput, Image as RNImage, Keyboard, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { useCustomAlert } from '../../context/CustomAlertContext';

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
import { insumosService, InsumoItem, MovimientoStock, CreateInsumoDto } from '../../services/insumos';
import { inventarioService } from '../../services/inventario';
import { usePermissions } from '../../hooks/usePermissions';
import { useScrollDirection } from '../../hooks/useScrollDirection';

/** Tarjeta-sugerencia inteligente precio por lote */
const LoteSuggestion = ({
  precio,
  cantidad,
  onApply,
}: {
  precio: number;
  cantidad: number;
  onApply: (precioUnitario: number) => void;
}) => {
  if (cantidad <= 1 || precio <= 0) return null;
  const unitario = Math.round(precio / cantidad);
  if (unitario < 10) return null;
  return (
    <TouchableOpacity
      onPress={() => onApply(unitario)}
      activeOpacity={0.8}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fef9c3',
        borderWidth: 1,
        borderColor: '#fde047',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 7,
        marginTop: 6,
      }}
    >
      <RNText style={{ fontSize: 14, marginRight: 4 }}>📦</RNText>
      <RNText style={{ flex: 1, fontSize: 11, color: '#713f12' }}>
        ¿Precio del lote? <RNText style={{ fontWeight: '700' }}>${precio.toLocaleString('es-CO')} ÷ {cantidad} = ${unitario.toLocaleString('es-CO')}/und</RNText>
      </RNText>
      <View style={{ backgroundColor: '#eab308', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 6 }}>
        <RNText style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓ Usar</RNText>
      </View>
    </TouchableOpacity>
  );
};

let ImagePicker: any = null;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {
  console.log('expo-image-picker no está disponible en este Dev Client');
}

type Props = {
  navigation: any;
  route: { params?: { id?: string } };
};

const InsumoDetailScreen = ({ navigation, route }: Props) => {
  const { canEdit, canDelete } = usePermissions('insumos');
  const { showAlert } = useCustomAlert();
  const handleScroll = useScrollDirection();

  const [insumo, setInsumo] = useState<InsumoItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [movimiento, setMovimiento] = useState<MovimientoStock>({ tipo: 'entrada', cantidad: 0, motivo: '' });
  const [showEditModal, setShowEditModal] = useState(false);
  const [showUpdatePriceStockModal, setShowUpdatePriceStockModal] = useState(false);
  const [updateValues, setUpdateValues] = useState({ precioActual: '', cantidad: '' });
  const updateModalScrollRef = useRef<any>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const mainScrollRef = useRef<ScrollView>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const [estadoActivo, setEstadoActivo] = useState(true);
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
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
    llevar_control_en_caja: 'NO',
    cuadrarInsumos: false
  });

  const insumoId = route.params?.id;

  useEffect(() => {
    if (insumoId) {
      loadInsumo();
    } else {
      navigation.goBack();
    }
  }, [insumoId]);

  const loadInsumo = async () => {
    try {
      const data = await insumosService.getById(insumoId!);
      setInsumo(data);
      setLocalImageUri(data.imagen || null);
    } catch (error: any) {
      showAlert({ type: 'error', title: 'Error', message: 'No se pudo cargar el insumo' });
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadInsumo();
    } catch (error) {
      await loadInsumo();
    } finally {
      setRefreshing(false);
    }
  };

  useSocketEvent(SocketEvent.REFRESH_INSUMOS, () => {
    loadInsumo();
  });

  const handleOpenUpdateModal = () => {
    if (!insumo) return;
    setUpdateValues({
      precioActual: insumo.precio?.toString() || '',
      cantidad: '', // Siempre vacío para que el usuario ingrese la nueva cantidad a sumar
    });
    setShowUpdatePriceStockModal(true);
  };

  const handleSaveUpdate = async () => {
    if (!insumo) return;
    try {
      setSaving(true);
      const payload: any = {};
      const precioNum = Number(updateValues.precioActual.replace(/[^0-9.]/g, ''));
      const cantidadIngresada = Number(updateValues.cantidad.replace(/[^0-9]/g, ''));
      const stockActual = Number(insumo.disponible) || 0;
      if (!isNaN(precioNum) && precioNum >= 0) {
        payload.precio = precioNum;
      }
      if (!isNaN(cantidadIngresada) && cantidadIngresada >= 0) {
        payload.disponible = stockActual + cantidadIngresada;
      }
      if (Object.keys(payload).length > 0) {
        await insumosService.update(insumo.IDalimentos!, payload);
        await loadInsumo();
        Toast.show({ 
          type: 'success', 
          text1: '¡Actualizado con éxito!', 
          text2: `Nuevo stock: ${stockActual + cantidadIngresada} und` 
        });
      }
      setShowUpdatePriceStockModal(false);
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error?.message || 'No se pudo actualizar';
      Toast.show({ 
        type: 'error', 
        text1: 'Error al guardar', 
        text2: Array.isArray(errorMsg) ? errorMsg.join(', ') : String(errorMsg) 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleMovimiento = async () => {
    if (!movimiento.cantidad || movimiento.cantidad <= 0) {
      showAlert({ type: 'error', title: 'Error', message: 'Ingresa una cantidad válida' });
      return;
    }

    setSaving(true);
    try {
      console.log('[DEBUG] Enviando handleMovimiento:', movimiento);
      await insumosService.movimientoStock(insumoId!, movimiento);
      showAlert({ type: 'success', title: 'Éxito', message: 'Movimiento registrado' });
      loadInsumo();
      setMovimiento({ tipo: 'entrada', cantidad: 0, motivo: '' });
    } catch (error: any) {
      console.log('[DEBUG] Error en handleMovimiento:', error?.response?.data || error);
      showAlert({ type: 'error', title: 'Error', message: error?.response?.data?.message || error?.message || 'No se pudo registrar el movimiento' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    showAlert({
      type: 'confirm',
      title: 'Eliminar Insumo',
      message: `¿Estás seguro de eliminar "${insumo?.nombre || insumo?.Nombre}"?`,
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          await insumosService.delete(insumoId!);
          showAlert({ type: 'success', title: 'Éxito', message: 'Insumo eliminado' });
          navigation.goBack();
        } catch (error) {
          showAlert({ type: 'error', title: 'Error', message: 'No se pudo eliminar' });
        }
      },
      onCancel: () => {},
    });
  };

  const openEditModal = () => {
    if (!insumo) return;
    setFormData({
      nombre: insumo.nombre || insumo.Nombre || '',
      categoria: insumo.categoria || insumo.Categoria || '',
      nombreCategoria: insumo.nombreCategoria || insumo.NombreCategoria || insumo.categoriaNombre || '',
      unidades: insumo.unidades || insumo.Unidades || '',
      cantidad: insumo.cantidad || insumo.Cantidad || 0,
      precio: insumo.precio || insumo.Precio || 0,
      imageUrl: insumo.imageUrl || insumo['Image Url'] || '',
      disponible: String(Number(insumo.disponible) || Number((insumo as any).Disponible) || 0),
      estado: insumo.estado || (insumo as any).Estado || 'ACTIVO',
      apartir_de_cantidad: insumo.apartirDeCantidad || insumo.apartir_de_cantidad || 0,
      agregar_cantidad: insumo.agregarCantidad || insumo.agregar_cantidad || 100,
      fecha_de_vencimiento: (insumo.fechaDeVencimiento || insumo.fecha_de_vencimiento) ? new Date(insumo.fechaDeVencimiento || insumo.fecha_de_vencimiento).toISOString().split('T')[0] : '',
      descontar_cant_de_ventas: insumo.descontarCantDeVentas || insumo.descontar_cant_de_ventas || 'NO',
      notificar_a_whatsapp: insumo.notificarAWhatsapp || insumo.notificar_a_whatsapp || 'NO',
      llevar_control_en_caja: insumo.llevarControlEnCaja || insumo.llevar_control_en_caja || 'NO',
      cuadrarInsumos: insumo.cuadrarInsumos || false
    });
    setEstadoActivo((insumo.estado || (insumo as any).Estado || 'ACTIVO').toUpperCase() === 'ACTIVO');
    setShowEditModal(true);
  };

  const getErrorMessage = (error: any, defaultMsg: string) => {
    const msg = error?.response?.data?.message || error?.message || defaultMsg;
    if (Array.isArray(msg)) return msg.join('\n');
    if (typeof msg === 'object') return JSON.stringify(msg);
    return String(msg);
  };

  const handleSaveEdit = async () => {
    if (!formData.nombre?.trim()) {
      showAlert({ type: 'error', title: 'Error', message: 'El nombre es obligatorio' });
      return;
    }

    setSaving(true);
    try {
      let finalImageUrl = formData.imageUrl;
      if (localImageUri && (localImageUri.startsWith('file://') || localImageUri.startsWith('content://'))) {
        try {
          const uploadedUrl = await insumosService.uploadImage(localImageUri);
          if (uploadedUrl) {
            finalImageUrl = uploadedUrl;
          }
        } catch (uploadError) {
          console.error('[InsumoDetailScreen] Error subiendo imagen:', uploadError);
          showAlert({ type: 'warning', title: 'Aviso', message: 'Se guardará el insumo, pero falló la subida de la imagen.' });
        }
      }

      const dataToSave = {
        nombre: formData.nombre,
        categoria: formData.categoria,
        nombreCategoria: formData.nombreCategoria,
        unidades: formData.unidades,
        cantidad: Math.max(0, formData.cantidad || 0),
        precio: Math.max(0, formData.precio || 0),
        apartir_de_cantidad: Math.max(0, formData.apartir_de_cantidad || 0),
        agregar_cantidad: Math.max(0, formData.agregar_cantidad || 0),
        fecha_de_vencimiento: formData.fecha_de_vencimiento || undefined,
        descontar_cant_de_ventas: formData.descontar_cant_de_ventas,
        notificar_a_whatsapp: formData.notificar_a_whatsapp,
        llevar_control_en_caja: formData.llevar_control_en_caja,
        cuadrarInsumos: formData.cuadrarInsumos,
        disponible: formData.disponible,
        estado: estadoActivo ? 'ACTIVO' : 'INACTIVO',
        imageUrl: finalImageUrl,
        imagen: finalImageUrl,
      };
      console.log('[DEBUG] Enviando actualización Insumo:', dataToSave);
      await insumosService.update(insumo.IDalimentos, dataToSave);
      showAlert({ type: 'success', title: 'Éxito', message: 'Insumo actualizado correctamente' });
      setShowEditModal(false);
      loadInsumo();
    } catch (error: any) {
      console.log('[DEBUG] Error actualizando insumo:', error?.response?.data || error);
      showAlert({ type: 'error', title: 'Error', message: getErrorMessage(error, 'No se pudo actualizar el insumo') });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  if (!insumo) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <RNText>No se encontró el insumo</RNText>
        </View>
      </SafeAreaView>
    );
  }

  const estadoStock = insumo.estadoStock || 'normal';
  const estadoColors: Record<string, string> = { critico: '#ef4444', normal: '#22c55e', sobrante: '#3b82f6' };

  const getImageUrl = () => {
    const url = insumo.imagen;
    if (!url) return null;
    if (url.startsWith('http')) return url;
    
    // Check if the URL is from the old structure (INSUMOS_Images/)
    if (url.startsWith('INSUMOS_Images/')) {
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
      return `${baseUrl}/uploads/insumos/${url.split('/').pop()}`;
    }

    const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
    const finalUrl = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    // console.log('[DEBUG InsumoDetailScreen] URL Generada:', finalUrl);
    return finalUrl;
  };

  const finalImageUrl = getImageUrl();

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
      style={{ flex: 1, paddingBottom: Platform.OS === 'android' ? keyboardHeight : 0 }}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <RNText style={styles.headerTitle}>Detalle del Insumo</RNText>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity style={[styles.backBtn, { marginRight: 8, backgroundColor: '#eff6ff' }]} onPress={openEditModal}>
            <Ionicons name="pencil" size={20} color="#3b82f6" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: '#fef2f2' }]} onPress={handleDelete}>
            <Ionicons name="trash" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

        <ScrollView 
          ref={mainScrollRef}
          style={styles.content} 
          contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }} 
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#3b82f6"
              colors={['#3b82f6']}
            />
          }
        >
          <View style={[styles.card, { padding: 0 }]}>
          {finalImageUrl && (
            <TouchableOpacity 
              activeOpacity={0.9}
              onPress={() => setIsFullScreen(true)}
              style={{ width: '100%', height: 280, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', paddingTop: 20, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
            >
              <ImageComponent 
                source={{ uri: finalImageUrl }} 
                style={{ width: '90%', height: '100%', borderTopLeftRadius: 16, borderTopRightRadius: 16 }} 
                contentFit="contain"
                resizeMode="contain" 
                transition={200}
              />
              <View style={{ position: 'absolute', bottom: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8 }}>
                <Ionicons name="expand" size={18} color="white" />
              </View>
            </TouchableOpacity>
          )}
          <View style={{ padding: 20 }}>
            <View style={[styles.cardHeader, { marginTop: finalImageUrl ? 0 : 0 }]}>
              <View style={[styles.statusBadge, { backgroundColor: estadoColors[estadoStock] + '20' }]}>
                <RNText style={[styles.statusBadgeText, { color: estadoColors[estadoStock] }]}>
                  {estadoStock.toUpperCase()}
                </RNText>
              </View>
            </View>

            <RNText style={styles.insumoNombre}>{insumo.nombre || insumo.Nombre}</RNText>
            <RNText style={styles.insumoCategoria}>
              {insumo.nombreCategoria || insumo.NombreCategoria || insumo.categoriaNombre || insumo.Categoria || 'Sin categoría'}
            </RNText>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <RNText style={styles.statLabel}>Stock Actual</RNText>
                <RNText style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{Number(insumo.disponible ?? insumo.Disponible ?? 0).toLocaleString('es-CO')}</RNText>
              </View>
              <View style={styles.statItem}>
                <RNText style={styles.statLabel}>Precio</RNText>
                <RNText style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                  ${Number(insumo.precio || insumo.Precio || 0).toLocaleString('es-CO')}
                </RNText>
              </View>
              <View style={styles.statItem}>
                <RNText style={styles.statLabel}>Total</RNText>
                <RNText style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                  ${(Number(insumo.disponible ?? insumo.Disponible ?? 0) * Number(insumo.precio || insumo.Precio || 0)).toLocaleString('es-CO')}
                </RNText>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <RNText style={styles.cardTitle}>Información Adicional</RNText>
            {canEdit && (
              <TouchableOpacity onPress={() => { setFormData(insumo as any); setLocalImageUri(insumo?.imagen || null); setShowEditModal(true); }}>
                <Ionicons name="pencil" size={20} color="#3b82f6" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.infoRow}>
            <RNText style={styles.infoLabel}>Unidades</RNText>
            <RNText style={styles.infoValue}>{insumo.unidades || insumo.Unidades || 'N/A'}</RNText>
          </View>
          <View style={styles.infoRow}>
            <RNText style={styles.infoLabel}>Stock Mínimo</RNText>
            <RNText style={styles.infoValue}>{insumo.apartirDeCantidad || insumo.apartir_de_cantidad || 0}</RNText>
          </View>
          <View style={styles.infoRow}>
            <RNText style={styles.infoLabel}>Stock Máximo</RNText>
            <RNText style={styles.infoValue}>{insumo.agregarCantidad || insumo.agregar_cantidad || 0}</RNText>
          </View>
          <View style={styles.infoRow}>
            <RNText style={styles.infoLabel}>Fecha de Vencimiento</RNText>
            <RNText style={styles.infoValue}>{(insumo.fechaDeVencimiento || insumo.fecha_de_vencimiento) ? new Date(insumo.fechaDeVencimiento || insumo.fecha_de_vencimiento).toISOString().split('T')[0] : 'No definida'}</RNText>
          </View>
          <View style={styles.infoRow}>
            <RNText style={styles.infoLabel}>Descontar de Ventas</RNText>
            <RNText style={styles.infoValue}>{insumo.descontarCantDeVentas || insumo.descontar_cant_de_ventas || 'NO'}</RNText>
          </View>
          <View style={styles.infoRow}>
            <RNText style={styles.infoLabel}>Notificar WhatsApp</RNText>
            <RNText style={styles.infoValue}>{insumo.notificarAWhatsapp || insumo.notificar_a_whatsapp || 'NO'}</RNText>
          </View>
          <View style={styles.infoRow}>
            <RNText style={styles.infoLabel}>Control en Caja</RNText>
            <RNText style={styles.infoValue}>{insumo.llevarControlEnCaja || insumo.llevar_control_en_caja || 'NO'}</RNText>
          </View>
          <View style={styles.infoRow}>
            <RNText style={styles.infoLabel}>Verificar en Cierre</RNText>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons 
                name={insumo.cuadrarInsumos ? 'checkbox' : 'square-outline'} 
                size={18} 
                color={insumo.cuadrarInsumos ? '#22c55e' : '#9ca3af'} 
              />
              <RNText style={[styles.infoValue, { marginLeft: 4, color: insumo.cuadrarInsumos ? '#22c55e' : '#6b7280' }]}>
                {insumo.cuadrarInsumos ? 'SI' : 'NO'}
              </RNText>
            </View>
          </View>
          <View style={styles.infoRow}>
            <RNText style={styles.infoLabel}>Stock Histórico (Total Entradas)</RNText>
            <RNText style={styles.infoValue}>{Number(insumo.cantidad ?? insumo.Cantidad ?? 0)}</RNText>
          </View>
        </View>

        {canEdit && (
          <View style={styles.card}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff', paddingVertical: 14, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#bfdbfe' }}
              onPress={handleOpenUpdateModal}
            >
              <Ionicons name="cash-outline" size={20} color="#3b82f6" />
              <RNText style={{ color: '#3b82f6', fontWeight: '700', fontSize: 15, marginLeft: 8 }}>Actualizar Precio y Stock</RNText>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <RNText style={[styles.cardTitle, { marginBottom: 0 }]}>Registrar Movimiento</RNText>
            </View>
            <View style={styles.movimientoTipo}>
              <TouchableOpacity
                style={[styles.tipoBtn, movimiento.tipo === 'entrada' && styles.tipoBtnActive]}
                onPress={() => setMovimiento({ ...movimiento, tipo: 'entrada' })}
              >
                <Ionicons name="add-circle" size={20} color={movimiento.tipo === 'entrada' ? '#22c55e' : '#6b7280'} />
                <RNText style={[styles.tipoBtnText, movimiento.tipo === 'entrada' && { color: '#22c55e' }]}>
                  Entrada
                </RNText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tipoBtn, movimiento.tipo === 'salida' && styles.tipoBtnActive]}
                onPress={() => setMovimiento({ ...movimiento, tipo: 'salida' })}
              >
                <Ionicons name="remove-circle" size={20} color={movimiento.tipo === 'salida' ? '#ef4444' : '#6b7280'} />
                <RNText style={[styles.tipoBtnText, movimiento.tipo === 'salida' && { color: '#ef4444' }]}>
                  Salida
                </RNText>
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 20 }}>
              <RNText style={styles.inputLabel}>Cantidad</RNText>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, padding: 8 }}>
                <TouchableOpacity
                  style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}
                  onPress={() => setMovimiento({ ...movimiento, cantidad: Math.max(0, movimiento.cantidad - 1) })}
                >
                  <Ionicons name="remove" size={24} color="#4b5563" />
                </TouchableOpacity>
                <TextInput
                  style={{ flex: 1, fontSize: 24, fontWeight: '800', color: '#111827', textAlign: 'center', padding: 0, margin: 0 }}
                  keyboardType="numeric"
                  value={movimiento.cantidad ? String(movimiento.cantidad) : ''}
                  onChangeText={(t) => {
                    const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                    setMovimiento({ ...movimiento, cantidad: isNaN(n) ? 0 : n });
                  }}
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                  onFocus={() => {
                    setTimeout(() => {
                      mainScrollRef.current?.scrollToEnd({ animated: true });
                    }, 150);
                  }}
                />
                <TouchableOpacity
                  style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}
                  onPress={() => setMovimiento({ ...movimiento, cantidad: movimiento.cantidad + 1 })}
                >
                  <Ionicons name="add" size={24} color="#4b5563" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>Observación</RNText>
              <Input
                style={{ backgroundColor: '#f3f4f6', borderRadius: 10, padding: 12, borderWidth: 0 }}
                placeholder={movimiento.motivo || 'Ej: Compra de insumos'}
                placeholderTextColor="#9ca3af"
                value={movimiento.motivo}
                onChangeText={(t) => setMovimiento({ ...movimiento, motivo: t })}
                onFocus={() => {
                  setTimeout(() => {
                    mainScrollRef.current?.scrollToEnd({ animated: true });
                  }, 150);
                }}
              />
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleMovimiento}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="save" size={20} color="#fff" />
                  <RNText style={styles.saveBtnText}>Guardar Movimiento</RNText>
                </>
              )}
            </TouchableOpacity>
          </View>
          )}

          <View style={{ height: 16 }} />
        </ScrollView>
      <Modal visible={showEditModal} animationType="slide" onRequestClose={() => setShowEditModal(false)} presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }} edges={['top']}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <RNText style={{ fontSize: 18, fontWeight: 'bold', color: '#111827' }}>
              Editar Insumo
            </RNText>
            <TouchableOpacity onPress={() => setShowEditModal(false)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingVertical: 16 }}>
              <Input
                label="Nombre *"
                placeholder="Nombre del insumo"
                value={formData.nombre}
                onChangeText={(t) => setFormData(p => ({ ...p, nombre: t }))}
              />

              <View style={{ marginTop: 16 }}>
                <RNText style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Categoría</RNText>
                <Input
                  placeholder="O escribe una nueva categoría..."
                  value={formData.nombreCategoria}
                  onChangeText={(t) => setFormData(p => ({ ...p, nombreCategoria: t, categoria: '' }))}
                />
              </View>

              <View style={{ flexDirection: 'row', marginTop: 16 }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Input
                    label="Stock Actual"
                    placeholder="0" placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={formData.disponible ? String(formData.disponible) : ''}
                    onChangeText={(t) => setFormData(p => ({ ...p, disponible: t.replace(/[^0-9-]/g, '') }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Stock Histórico"
                    placeholder="0" placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={formData.cantidad ? String(formData.cantidad) : ''}
                    onChangeText={(t) => {
                      const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                      setFormData(p => ({ ...p, cantidad: isNaN(n) ? 0 : n }));
                    }}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', marginTop: 16 }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Input
                    label="Precio"
                    placeholder="$0"
                    keyboardType="numeric"
                    value={formData.precio ? String(formData.precio) : ''}
                    onChangeText={(t) => {
                      const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                      setFormData(p => ({ ...p, precio: isNaN(n) ? 0 : n }));
                    }}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', marginTop: 16 }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Input
                    label="Stock Mínimo"
                    placeholder="10"
                    keyboardType="numeric"
                    value={formData.apartir_de_cantidad ? String(formData.apartir_de_cantidad) : ''}
                    onChangeText={(t) => {
                      const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                      setFormData(p => ({ ...p, apartir_de_cantidad: isNaN(n) ? 0 : n }));
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Stock Máximo"
                    placeholder="100"
                    keyboardType="numeric"
                    value={formData.agregar_cantidad ? String(formData.agregar_cantidad) : ''}
                    onChangeText={(t) => {
                      const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                      setFormData(p => ({ ...p, agregar_cantidad: isNaN(n) ? 0 : n }));
                    }}
                  />
                </View>
              </View>

              <View style={{ marginTop: 16 }}>
                <RNText style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 8 }}>Foto del Insumo</RNText>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#f9fafb',
                    borderWidth: 1,
                    borderColor: '#d1d5db',
                    borderStyle: localImageUri ? 'solid' : 'dashed',
                    borderRadius: 12,
                    height: 200,
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'hidden'
                  }}
                  onPress={() => setShowImagePicker(true)}
                >
                  {localImageUri ? (
                    <View style={{ width: '100%', height: '100%', backgroundColor: '#ffffff' }}>
                      <ImageComponent 
                        source={{ 
                          uri: localImageUri.startsWith('http') 
                            ? localImageUri 
                            : (localImageUri.startsWith('/uploads') 
                                ? `${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1'}${localImageUri}` 
                                : localImageUri) 
                        }} 
                        style={{ width: '100%', height: '100%' }} 
                        contentFit="contain"
                        resizeMode="contain" 
                        transition={200}
                      />
                      <View style={{ position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity 
                          style={{ backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 20 }}
                          onPress={() => {
                            setLocalImageUri(null);
                            setFormData(p => ({ ...p, imageUrl: null as any, imagen: null as any }));
                          }}
                        >
                          <Ionicons name="trash" size={20} color="#ef4444" />
                        </TouchableOpacity>
                        <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 20 }}>
                          <Ionicons name="camera" size={20} color="#fff" />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center' }}>
                      <Ionicons name="camera-outline" size={32} color="#9ca3af" />
                      <RNText style={{ color: '#6b7280', marginTop: 8, fontSize: 14 }}>Toca para subir foto</RNText>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <View style={{ marginTop: 16 }}>
                <Input
                  label="Unidades (ej: kg, Lt, unidades)"
                  placeholder="kg"
                  value={formData.unidades}
                  onChangeText={(t) => setFormData(p => ({ ...p, unidades: t }))}
                />
              </View>

              <View style={{ marginTop: 16 }}>
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

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                  <View style={{ flex: 1 }}>
                    <RNText style={{ fontSize: 14, color: '#4b5563' }}>Verificar en cierre caja</RNText>
                    <RNText style={{ fontSize: 11, color: '#9ca3af' }}>Requiere conteo físico diario</RNText>
                  </View>
                  <TouchableOpacity
                    style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: formData.cuadrarInsumos ? '#22c55e' : '#d1d5db', padding: 2 }}
                    onPress={() => setFormData(p => ({ ...p, cuadrarInsumos: !p.cuadrarInsumos }))}
                  >
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', transform: [{ translateX: formData.cuadrarInsumos ? 20 : 0 }] }} />
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={{ height: 40 }} />
            </ScrollView>

            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
              <Button
                style={{ backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <RNText style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                    Guardar Cambios
                  </RNText>
                )}
              </Button>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* MODAL PARA ACTUALIZAR PRECIO Y STOCK */}
      <Modal visible={showUpdatePriceStockModal} animationType="slide" onRequestClose={() => setShowUpdatePriceStockModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, marginBottom: Platform.OS === 'android' ? keyboardHeight : 0 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }} edges={['top']}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <RNText style={{ fontSize: 18, fontWeight: 'bold', color: '#111827' }}>
              Actualizar Precio y Stock
            </RNText>
            <TouchableOpacity onPress={() => setShowUpdatePriceStockModal(false)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={updateModalScrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ backgroundColor: '#f3f4f6', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <RNText style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 12 }}>Información del Insumo</RNText>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#e5e7eb', marginRight: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                  {finalImageUrl ? (
                    <ImageComponent source={{ uri: finalImageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <MaterialCommunityIcons name="package-variant-closed" size={24} color="#9ca3af" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <RNText style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>{insumo.nombre || insumo.Nombre}</RNText>
                  <RNText style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {insumo.nombreCategoria || insumo.NombreCategoria || insumo.categoriaNombre || 'Sin categoría'}
                  </RNText>
                </View>
              </View>
            </View>

            <View style={{ marginBottom: 20 }}>
              <View style={{ marginBottom: 16 }}>
                <RNText style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Precio Unitario ($)</RNText>
                <TextInput
                  style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, fontWeight: '600', color: '#111827' }}
                  keyboardType="numeric"
                  value={updateValues.precioActual}
                  onChangeText={(v) => setUpdateValues(prev => ({ ...prev, precioActual: v }))}
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                />
                <LoteSuggestion
                  precio={Number(updateValues.precioActual.replace(/[^0-9.]/g, '')) || 0}
                  cantidad={Number(updateValues.cantidad.replace(/[^0-9]/g, '')) || 0}
                  onApply={(u) => setUpdateValues(prev => ({ ...prev, precioActual: String(u) }))}
                />
              </View>

              <View style={{ marginBottom: 20 }}>
                <RNText style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Cantidad Disponible (und)</RNText>
                <TextInput
                  style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, fontWeight: '600', color: '#111827' }}
                  keyboardType="numeric"
                  value={updateValues.cantidad}
                  onChangeText={(v) => setUpdateValues(prev => ({ ...prev, cantidad: v }))}
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <View style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#bfdbfe' }}>
                <RNText style={{ fontSize: 12, fontWeight: '600', color: '#1e40af', marginBottom: 8, textTransform: 'uppercase' }}>Vista Previa</RNText>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <RNText style={{ fontSize: 14, color: '#374151' }}>Precio Unitario:</RNText>
                  <RNText style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>
                    ${(Number(updateValues.precioActual.replace(/[^0-9.]/g, '')) || 0).toLocaleString('es-CO')}
                  </RNText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <RNText style={{ fontSize: 14, color: '#374151' }}>Cantidad:</RNText>
                  <RNText style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>
                    {Number(updateValues.cantidad.replace(/[^0-9]/g, '')) || 0} und
                  </RNText>
                </View>
                <View style={{ height: 1, backgroundColor: '#bfdbfe', marginVertical: 8 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <RNText style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Subtotal:</RNText>
                  <RNText style={{ fontSize: 18, fontWeight: '800', color: '#3b82f6' }}>
                    ${((Number(updateValues.precioActual.replace(/[^0-9.]/g, '')) || 0) * (Number(updateValues.cantidad.replace(/[^0-9]/g, '')) || 0)).toLocaleString('es-CO')}
                  </RNText>
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb', flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#f3f4f6' }}
              onPress={() => setShowUpdatePriceStockModal(false)}
              disabled={saving}
            >
              <RNText style={{ fontSize: 15, fontWeight: '600', color: '#4b5563' }}>Cancelar</RNText>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: saving ? '#9ca3af' : '#3b82f6' }}
              onPress={handleSaveUpdate}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <RNText style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Confirmar Actualización</RNText>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL PARA SELECCIONAR IMAGEN */}
      <Modal visible={showImagePicker} transparent animationType="fade">
        <TouchableOpacity 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} 
          activeOpacity={1} 
          onPress={() => setShowImagePicker(false)}
        >
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <RNText style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 }}>Subir Imagen</RNText>
            <RNText style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>Elige una opción</RNText>
            
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#f3f4f6', padding: 16, borderRadius: 16, alignItems: 'center' }}
                onPress={async () => {
                  setShowImagePicker(false);
                  if (!ImagePicker) return;
                  const permission = await ImagePicker.requestCameraPermissionsAsync();
                  if (!permission.granted) return;
                  const result = await ImagePicker.launchCameraAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.5,
                  });
                  if (!result.canceled) setLocalImageUri(result.assets[0].uri);
                }}
              >
                <Ionicons name="camera" size={28} color="#10b981" />
                <RNText style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 8 }}>CÁMARA</RNText>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#f3f4f6', padding: 16, borderRadius: 16, alignItems: 'center' }}
                onPress={async () => {
                  setShowImagePicker(false);
                  if (!ImagePicker) return;
                  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
                  if (!permission.granted) return;
                  const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.5,
                  });
                  if (!result.canceled) setLocalImageUri(result.assets[0].uri);
                }}
              >
                <Ionicons name="image" size={28} color="#10b981" />
                <RNText style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 8 }}>GALERÍA</RNText>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={{ marginTop: 16, padding: 16, alignItems: 'center' }}
              onPress={() => setShowImagePicker(false)}
            >
              <RNText style={{ fontSize: 14, fontWeight: '600', color: '#6b7280' }}>CANCELAR</RNText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal Pantalla Completa y Zoom para Insumos */}
      <Modal visible={isFullScreen} transparent animationType="fade" onRequestClose={() => setIsFullScreen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
              <RNText style={{ color: 'white', fontWeight: 'bold', fontSize: 18 }}>{insumo.nombre || insumo.Nombre}</RNText>
              <TouchableOpacity 
                onPress={() => setIsFullScreen(false)}
                style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 20 }}
              >
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>
            <ScrollView 
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}
              maximumZoomScale={5}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              {finalImageUrl && (
                <ImageComponent 
                  source={{ uri: finalImageUrl }} 
                  style={{ width: '100%', height: '100%' }} 
                  contentFit="contain"
                  resizeMode="contain" 
                  transition={200}
                />
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  content: { flex: 1, padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 12 },
  insumoNombre: { fontSize: 24, fontWeight: '800', color: '#111827' },
  insumoCategoria: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  statsRow: { flexDirection: 'row', marginTop: 20 },
  statItem: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statLabel: { fontSize: 12, color: '#6b7280' },
  statValue: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 4, textAlign: 'center' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  infoLabel: { fontSize: 14, color: '#6b7280' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  movimientoTipo: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  tipoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 2, borderColor: '#e5e7eb' },
  tipoBtnActive: { borderColor: '#3b82f6', backgroundColor: '#3b82f610' },
  tipoBtnText: { marginLeft: 8, fontSize: 14, fontWeight: '600', color: '#6b7280' },
  inputGroup: { marginTop: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  cantidadInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRadius: 10, padding: 8 },
  cantidadBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  cantidadValue: { flex: 1, fontSize: 24, fontWeight: '700', color: '#111827', textAlign: 'center' },
  observacionInput: { backgroundColor: '#f3f4f6', borderRadius: 10, padding: 12 },
  observacionPlaceholder: { fontSize: 14, color: '#9ca3af' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, marginTop: 20 },
  saveBtnDisabled: { backgroundColor: '#9ca3af' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15, marginLeft: 8 },
});

export default InsumoDetailScreen;