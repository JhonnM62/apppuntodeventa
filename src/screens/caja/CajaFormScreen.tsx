import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, ScrollView, ActivityIndicator, TouchableOpacity, Image, Modal, TextInput, KeyboardAvoidingView, Platform, Keyboard, Dimensions, Alert, RefreshControl, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import Toast from 'react-native-toast-message';
import { FlashList as OriginalFlashList } from '@shopify/flash-list';
const FlashList = OriginalFlashList as any;
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { getConfiguracion } from '../../services/configuracion';

import { Text } from '../../components/ui/text';
import { Input } from '../../components/ui/input';
import useAuthStore from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { insumosService, InsumoItem } from '../../services/insumos';
import { getProducts } from '../../services/products';
import { abrirCaja, getResumenCaja, deleteCaja, getCajas, cerrarCaja, updateCaja, reabrirCaja, getVerificacionPendiente } from '../../services/caja';
import api from '../../services/api';
import { formatCurrency, parseCurrency, formatTime12h, formatDateToDDMMAAAA } from '../../utils/formatters';
import { generateAndShareCajaPDF } from '../../utils/cajaPdf';
import useSocketEvent from '../../hooks/useSocketEvent';
import { useSocket } from '../../context/SocketContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useCustomAlert } from '../../context/CustomAlertContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import VerifyInsumosModal from '../../components/caja/VerifyInsumosModal';
import AutoCuadrePreviewModal from '../../components/caja/AutoCuadrePreviewModal';
import { cn } from '../../lib/utils';
import AdminSaleFormModal from '../orders/AdminSaleFormModal';

const { width } = Dimensions.get('window');

let DateTimePicker: any;
try {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch (e) {
  DateTimePicker = null;
}

const schema = yup.object().shape({
  nombre: yup.string().required('Responsable es requerido'),
  fechaDeApertura: yup.string().optional(),
  horaDeApertura: yup.string().optional(),
  efectivoDeApertura: yup.number()
    .transform((value, originalValue) => (String(originalValue).trim() === '' || originalValue === null || originalValue === undefined ? NaN : value))
    .required('El efectivo inicial es obligatorio')
    .typeError('El efectivo inicial es obligatorio')
    .min(0, 'No negativo'),
  fechaDeCierre: yup.string().optional(),
  horaDeCierre: yup.string().optional(),
  efectivoDeCierre: yup.number().transform((value) => (isNaN(value) ? 0 : value)).typeError('Número inválido').min(0, 'No negativo'),
  plataGuardada: yup.number().transform((value) => (isNaN(value) ? undefined : value)).optional(),
  cuadroCaja: yup.string().optional(),
  valorFaltante: yup.number().transform((value) => (isNaN(value) ? undefined : value)).optional(),
  valorExcedente: yup.number().transform((value) => (isNaN(value) ? undefined : value)).optional(),
  observaciones: yup.string().optional(),
  insumos: yup.array().of(
    yup.object().shape({
      Idcierreyapertura: yup.string().optional(),
      nombreInsumo: yup.string().required(),
      paraQueProducto: yup.mixed().optional(),
      nombreProductoReal: yup.string().optional(),
      categoria: yup.string().optional(),
      unidadDeMedida: yup.string().optional(),
      cantApertura: yup.number().transform((value) => (isNaN(value) ? undefined : value)).required('Requerido').min(0),
      cantDeCierre: yup.number().transform((value) => (isNaN(value) ? undefined : value)).notRequired().default(0),
      observacion: yup.string().optional(),
      imageUrl: yup.string().optional(),
      nombreInsumoReal: yup.string().optional()
    })
  ).default([]),
});

const formatDateToLocalYYYYMMDD = (isoString: string) => {
  if (!isoString) return '';
  const d = new Date(isoString.replace(/Z$/i, ''));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const CurrencyInputWrapper = ({ value, onChange, onFocus, editable, className, placeholder }: any) => {
  const [localValue, setLocalValue] = useState(() => {
    return value !== undefined && value !== '' && value !== null && Number(value) !== 0 ? formatCurrency(Number(value)) : '';
  });

  const lastSentNumeric = useRef<string>('');

  useEffect(() => {
    const newNumeric = value !== undefined && value !== '' && value !== null ? String(Number(value)) : '';
    // Prevent formatting empty input back to "$ 0" if schema transformed it to 0
    if (newNumeric !== lastSentNumeric.current && !(lastSentNumeric.current === '' && newNumeric === '0')) {
      setLocalValue(value !== undefined && value !== '' && value !== null && Number(value) !== 0 ? formatCurrency(Number(value)) : '');
      lastSentNumeric.current = newNumeric;
    }
  }, [value]);

  const handleChangeText = (text: string) => {
    const numeric = parseCurrency(text);
    const formatted = numeric ? formatCurrency(Number(numeric)) : '';
    setLocalValue(formatted);
    lastSentNumeric.current = numeric;
    onChange(numeric);
  };

  return (
    <Input 
      editable={editable}
      keyboardType="numeric" 
      value={localValue} 
      onChangeText={handleChangeText} 
      onFocus={(e) => {
        if (Number(parseCurrency(localValue)) === 0) {
          handleChangeText('');
        }
        if (onFocus) onFocus(e);
      }}
      className={className} 
      placeholder={placeholder}
    />
  );
};

export default function CajaFormScreen({ route, navigation }: any) {
  const { cajaId } = route.params || {};
  const isNew = !cajaId;
  const { user } = useAuthStore();
  const { primaryColor } = useSettingsStore();
  const { canCreate, canEdit, canDelete } = usePermissions('caja');
  const { showAlert } = useCustomAlert();
  const isAdmin = user?.rol === 'Admin app' || user?.rol === 'Admin negocio';
  const canCloseCaja = isAdmin || user?.rol === 'Jefe';
  
  const isReadOnly = isNew ? !canCreate : !canEdit;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allInsumos, setAllInsumos] = useState<InsumoItem[]>([]);
  const [allProductos, setAllProductos] = useState<any[]>([]);
  const [modoOperacion, setModoOperacion] = useState<'GENERAL' | 'RESTAURANTE'>('GENERAL');
  const [modalInsumosVisible, setModalInsumosVisible] = useState(false);
  const [modalProductosVisible, setModalProductosVisible] = useState(false);
  const [searchInsumo, setSearchInsumo] = useState('');
  const [searchProducto, setSearchProducto] = useState('');
  const [selectedIndexForProduct, setSelectedIndexForProduct] = useState<number | null>(null);
  const [insumosAEliminar, setInsumosAEliminar] = useState<string[]>([]);
  const [modifiedInsumoIndexes, setModifiedInsumoIndexes] = useState<Set<number>>(new Set());

  const [resumenData, setResumenData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'form' | 'analysis' | 'cuadre'>('form');
  const [horaCongelada, _setHoraCongelada] = useState<string | null>(null);
  const [isAutoCuadreModalVisible, setIsAutoCuadreModalVisible] = useState(false);

  const setHoraCongelada = async (hora: string | null) => {
    _setHoraCongelada(hora);
    if (!isNew && cajaId) {
      try {
        await updateCaja(cajaId, { horaCongelada: hora || '' } as any);
      } catch (e) {
        console.log('Error syncing freeze state', e);
      }
    }
  };

  useEffect(() => {
    if (!isNew && cajaId) {
      AsyncStorage.removeItem(`@caja_congelada_${cajaId}`).catch(() => {});
    }
  }, [cajaId, isNew]);
  
  const [isFreezeModalVisible, setIsFreezeModalVisible] = useState(false);
  const [pendingTab, setPendingTab] = useState<'form' | 'analysis' | 'cuadre' | null>(null);
  const [pendingTabChange, setPendingTabChange] = useState<'form' | 'analysis' | 'cuadre' | null>(null);
  const pendingSaveRef = useRef<{ data: any, isFinalClose: boolean } | null>(null);

  const handleTabChange = (tab: 'form' | 'analysis' | 'cuadre') => {
    // Check if there are unsaved changes in the form
    const hasUnsavedChanges = Object.keys(dirtyFields || {}).length > 0;
    
    // Also check if any insumo is pending to be removed but not yet saved
    const hasInsumosAEliminar = insumosAEliminar.length > 0;

    const isCerrada = resumenData?.caja?.cierre?.toLowerCase() === 'cerrada' || verificacionCompletada;

    if ((hasUnsavedChanges || hasInsumosAEliminar) && !isReadOnly && !saving && !isCerrada) {
      setPendingTabChange(tab);
      setGuardarModalVisible(true);
      return;
    }

    if ((tab === 'cuadre' || tab === 'analysis') && !isNew && !verificacionCompletada && !isCerrada) {
      setPendingTab(tab);
      setVerifyModalVisible(true);
    } else {
      setActiveTab(tab);
    }
  };

  const handleVerificationPassed = () => {
    setVerifyModalVisible(false);
    setVerificacionCompletada(true);
    if (pendingTab) {
      if (!horaCongelada) {
        setIsFreezeModalVisible(true);
      } else {
        setActiveTab(pendingTab);
        setPendingTab(null);
      }
    } else if (pendingSaveRef.current) {
      const { data, isFinalClose } = pendingSaveRef.current;
      pendingSaveRef.current = null;
      onSave(data, isFinalClose);
    } else {
      Toast.show({ type: 'success', text1: 'Verificación Completa', text2: 'Ahora puedes continuar con el cierre de caja.' });
    }
  };

  const handleVerificationCancelled = () => {
    setVerifyModalVisible(false);
    setPendingTab(null);
    pendingSaveRef.current = null;
  };
  const [isEditingObservaciones, setIsEditingObservaciones] = useState(false);
  const [transferenciasContadas, setTransferenciasContadas] = useState<string>('');
  const [isTransferenciasDirty, setIsTransferenciasDirty] = useState(false);
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [guardarModalVisible, setGuardarModalVisible] = useState(false);
  const [verificacionCompletada, setVerificacionCompletada] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [cuadreModalVisible, setCuadreModalVisible] = useState(false);
  const [cuadreOrders, setCuadreOrders] = useState<any[]>([]);
  const [isSearchingCuadre, setIsSearchingCuadre] = useState(false);
  const [cuadreProduct, setCuadreProduct] = useState<any>(null);
  const [cuadreDiff, setCuadreDiff] = useState<number>(0);
  const [selectedVenta, setSelectedVenta] = useState<any>(null);
  const [adminFormVisible, setAdminFormVisible] = useState(false);
  const [fetchingSaleId, setFetchingSaleId] = useState<string | null>(null);
  const [insumosSearchQuery, setInsumosSearchQuery] = useState('');

  const scrollViewRef = useRef<KeyboardAwareScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const [showDatePickerApertura, setShowDatePickerApertura] = useState(false);
  const [showTimePickerApertura, setShowTimePickerApertura] = useState(false);
  const [showDatePickerCierre, setShowDatePickerCierre] = useState(false);
  const [showTimePickerCierre, setShowTimePickerCierre] = useState(false);
  
  const [addQtyModalVisible, setAddQtyModalVisible] = useState(false);
  const [subQtyModalVisible, setSubQtyModalVisible] = useState(false);
  const [addQtyIndex, setAddQtyIndex] = useState<number | null>(null);
  const [addQtyMode, setAddQtyMode] = useState<'libre' | 'paquete'>('libre');
  const [addQtyAmount, setAddQtyAmount] = useState('');
  const [syncGlobalStock, setSyncGlobalStock] = useState(false);
  const [subQtyAmount, setSubQtyAmount] = useState('');
  const [subQtyReason, setSubQtyReason] = useState('');
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState(false);

  const { control, handleSubmit, reset, watch, formState: { errors, dirtyFields }, setValue, getValues } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      nombre: '',
      efectivoDeApertura: '' as any,
      efectivoDeCierre: '' as any,
      insumos: []
    }
  });

  const { fields, append, remove, update, replace } = useFieldArray({
    control,
    name: 'insumos',
  });

  const allowNavigation = useRef(false);
  const [pendingNavigationAction, setPendingNavigationAction] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      // In react-hook-form v7, use formState.dirtyFields from useForm destructured object
      // wait, we destructured it above but we can also use control._formState.dirtyFields as a fallback
      // but it's safer to watch the dirty fields state directly.
      const dirtyFields = control._formState.dirtyFields || {};
      const hasUnsavedChanges = Object.keys(dirtyFields).length > 0;
      const isCerrada = resumenData?.caja?.cierre?.toLowerCase() === 'cerrada' || verificacionCompletada;
      
      if (!hasUnsavedChanges || isReadOnly || saving || isCerrada || allowNavigation.current) {
        return;
      }

      e.preventDefault();
      setPendingNavigationAction(e.data.action);
      setGuardarModalVisible(true);
    });
    return unsubscribe;
  }, [navigation, control, isReadOnly, saving, resumenData, verificacionCompletada]);

  const { joinRoom } = useSocket();

  useEffect(() => {
    joinRoom('caja');
  }, [joinRoom]);

  useSocketEvent('refreshCaja', (data: any) => {
    if (data && data.action !== 'delete' && data.cajaId === cajaId) {
      if (data.updaterName && data.updaterName !== (user?.nombre || user?.Nombre || user?.usuario)) {
        Toast.show({
          type: 'info',
          text1: 'Caja Actualizada',
          text2: `${data.updaterName} ha guardado cambios en esta caja.`,
          position: 'top',
          topOffset: 50,
        });
      }
      fetchResumenSilenciosamente();
      fetchInitialData(false, true);
    } else if (data && data.action === 'delete' && data.cajaId === cajaId) {
      Toast.show({ type: 'error', text1: 'Caja Eliminada', text2: 'Esta caja ha sido eliminada por otro usuario' });
      navigation.goBack();
    }
  });

  const fetchResumenSilenciosamente = useCallback(async () => {
    if (isNew || !cajaId) return;
    try {
      const resumen = await getResumenCaja(cajaId, horaCongelada || undefined);
      setResumenData(resumen);
      if (resumen.caja && resumen.caja.horaCongelada !== undefined) {
        _setHoraCongelada(resumen.caja.horaCongelada);
      }
    } catch (error) {
      console.log("Error al refrescar el resumen de caja silenciosamente", error);
    }
  }, [cajaId, isNew, horaCongelada]);

  useSocketEvent('ordenActualizadaCaja', () => {
    fetchResumenSilenciosamente();
  });

  useSocketEvent('ordenCompletada', () => {
    fetchResumenSilenciosamente();
  });

  const handleOpenCuadreModal = async (prod: any, diff: number) => {
    setCuadreProduct(prod);
    setCuadreDiff(diff);
    setCuadreModalVisible(true);
    setCuadreOrders([]); // clear previous
    setIsSearchingCuadre(true);
    try {
      const res = await api.get('/ventas', { params: { search: prod.nombre, limit: 100 } });
      let orders = res.data?.data || [];
      
      orders = orders.filter((v: any) => v.ordenVentas?.some((ov: any) => ov.nombre === prod.nombre || ov.nombreProducto === prod.nombre));

      if (resumenData?.caja?.fechaDeApertura) {
        const aperturaDate = new Date(`${resumenData.caja.fechaDeApertura}T${resumenData.caja.horaDeApertura || '00:00:00'}`);
        orders = orders.filter((v: any) => new Date(v.fechaYHora) >= aperturaDate);
      }
      
      if (horaCongelada) {
        const congeladaDate = new Date(horaCongelada);
        orders = orders.filter((v: any) => new Date(v.fechaYHora) <= congeladaDate);
      }

      setCuadreOrders(orders);
    } catch (e) {
      console.error(e);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudieron cargar los pedidos' });
    } finally {
      setIsSearchingCuadre(false);
    }
  };

  const handleEditSale = async (ventaId: string) => {
    if (!ventaId) return;
    setFetchingSaleId(ventaId);
    try {
      const res = await api.get(`/ventas/${ventaId}`);
      const sale = res.data?.data || res.data;
      if (sale) {
        setSelectedVenta(sale);
        setAdminFormVisible(true);
      }
    } catch (e) {
      console.error(e);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cargar la información del pedido' });
    } finally {
      setFetchingSaleId(null);
    }
  };

  const handleUpdateProductInVenta = async (ventaId: string, orderVentaId: string, newCantidad: number) => {
    try {
      await api.patch(`/ventas/${ventaId}/producto/${orderVentaId}`, { cantidad: newCantidad });
      Toast.show({ type: 'success', text1: 'Ajustado', text2: 'Pedido ajustado correctamente' });
      handleOpenCuadreModal(cuadreProduct, cuadreDiff);
      fetchResumenSilenciosamente();
    } catch (e: any) {
      console.error(e);
      Toast.show({ type: 'error', text1: 'Error', text2: e.response?.data?.message || 'No se pudo ajustar el pedido' });
    }
  };

  const fetchInitialData = useCallback(async (showLoader = true, isSocketRefresh = false) => {
    if (showLoader) setLoading(true);
    try {
      const [insumosRes, prodRes, configRes] = await Promise.all([
        insumosService.getAll({ limit: 1000 }),
        getProducts({ limit: 1000 }),
        getConfiguracion()
      ]);

      const insumosData = insumosRes || [];
      const productosData = prodRes?.data || prodRes?.productos || prodRes || [];
      const configData = configRes?.data || configRes;
      
      if (configData?.modoOperacion) {
        setModoOperacion(configData.modoOperacion);
      }

      setAllInsumos(insumosData);
      setAllProductos(productosData);

      if (isNew) {
        const defaultInsumos = insumosData
          .filter(i => i.llevar_control_en_caja === 'SI' || i.llevarControlEnCaja === 'SI')
          .map(i => ({
            nombreInsumo: i.IDalimentos,
            nombreInsumoReal: i.Nombre || i.nombre,
            paraQueProducto: [] as unknown as string[],
            nombreProductoReal: '',
            categoria: i.Categoria || i.categoria || '',
            unidadDeMedida: i.Unidades || i.unidades || 'Und',
            cantApertura: '' as any,
            cantDeCierre: '' as any,
            observacion: '',
            imageUrl: i.imageUrl || i.imagen || ''
          }));
        
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const localToday = `${year}-${month}-${day}`;
        
        reset({
          nombre: user?.name || user?.nombre || '',
          fechaDeApertura: localToday,
          horaDeApertura: now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' }),
          efectivoDeApertura: '' as any,
          efectivoDeCierre: '' as any,
          observaciones: 'Préstamos 0\nSacamos 0\n\n0 vasos dañado con licor\n0 vasos dañados sin licor\n\n\nDINERO FALTANTE:\nDINERO EXEDENTE:',
          insumos: []
        });
      } else {
          const resumen = await getResumenCaja(cajaId);
          setResumenData(resumen);

          if (resumen.caja && resumen.caja.horaCongelada) {
            _setHoraCongelada(resumen.caja.horaCongelada);
          }

          if (resumen.caja && resumen.caja.cierre?.toLowerCase() === 'cerrada') {
            setVerificacionCompletada(true);
          }

          const { caja, insumos } = resumen;
        
        const mappedInsumos = insumos.map((i: any) => {
          const insId = i.nombreInsumo || i.insumos || '';
          const insObj = insumosData.find((ins: any) => ins.IDalimentos === insId || ins.Nombre === insId || ins.nombre === insId);

          // paraQueProducto may be an array (new) or string (legacy)
          const rawPQP = i.paraQueProducto;
          const productosIds: string[] = Array.isArray(rawPQP)
            ? rawPQP
            : (typeof rawPQP === 'string' && rawPQP.trim() ? [rawPQP.trim()] : []);
          const productosNombres = productosIds.map((pid: string) => {
            const p = productosData.find((x: any) => x.IDproductos === pid || x.nombre === pid);
            return p ? (p.nombre || p.Nombre) : pid;
          });

          return {
            Idcierreyapertura: i.Idcierreyapertura,
            nombreInsumo: insId,
            nombreInsumoReal: insObj ? (insObj.Nombre || insObj.nombre) : (i.insumo?.Nombre || i.insumo?.nombre || insId),
            paraQueProducto: productosIds,
            nombreProductoReal: productosNombres.join(', '),
            categoria: i.categoria || i.insumo?.Categoria || insObj?.Categoria || insObj?.categoria || '',
            unidadDeMedida: i.unidadDeMedida || i.insumo?.Unidades || insObj?.Unidades || insObj?.unidades || 'Und',
            cantApertura: i.cantApertura || 0,
            cantDeCierre: i.cantDeCierre ?? ('' as any),
            observacion: i.observacion || '',
            imageUrl: i.insumo?.imageUrl || i.insumo?.imagen || insObj?.imageUrl || insObj?.imagen || '',
            historial: i.historial || []
          };
        });

        reset({
          nombre: caja.nombre || '',
          fechaDeApertura: caja.fechaDeApertura ? formatDateToLocalYYYYMMDD(caja.fechaDeApertura) : '',
          horaDeApertura: formatTime12h(caja.horaDeApertura || ''),
          efectivoDeApertura: caja.efectivoDeApertura != null ? String(caja.efectivoDeApertura) : ('' as any),
          fechaDeCierre: caja.fechaDeCierre ? formatDateToLocalYYYYMMDD(caja.fechaDeCierre) : '',
          horaDeCierre: formatTime12h(caja.horaDeCierre || ''),
          efectivoDeCierre: caja.efectivoDeCierre != null ? String(caja.efectivoDeCierre) : ('' as any),
          plataGuardada: caja.plataGuardada != null ? String(caja.plataGuardada) : ('' as any),
          cuadroCaja: caja.cuadroCaja || '',
          valorFaltante: caja.valorFaltante != null ? String(caja.valorFaltante) : ('' as any),
          valorExcedente: caja.valorExcedente != null ? String(caja.valorExcedente) : ('' as any),
          observaciones: caja.observaciones || '',
          insumos: mappedInsumos
        }, { keepDirtyValues: isSocketRefresh });
        
        // Recuperar el valor guardado de transferencias contadas si existe y no ha sido editado
        if (caja.transferenciasContadas != null && !isTransferenciasDirty) {
          setTransferenciasContadas(String(caja.transferenciasContadas));
        }
      }
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cargar la información' });
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [cajaId, isNew, reset, user]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchInitialData(false);
    setRefreshing(false);
  }, [fetchInitialData]);

  const handleAutoCuadreClick = async () => {
    setSaving(true);
    try {
      const data = getValues();
      const cleanData = { ...data } as any;
      if (!cleanData.fechaDeCierre) delete cleanData.fechaDeCierre;
      if (!cleanData.horaDeCierre) delete cleanData.horaDeCierre;
      if (cleanData.efectivoDeCierre === '' || isNaN(cleanData.efectivoDeCierre)) delete cleanData.efectivoDeCierre;

      // Sanitize optional decimal fields — getValues() returns raw strings, Prisma rejects empty strings
      const optionalDecimalFields = ['plataGuardada', 'valorFaltante', 'valorExcedente', 'cantAAgregar'];
      for (const field of optionalDecimalFields) {
        const raw = cleanData[field];
        if (raw === '' || raw === null || raw === undefined || isNaN(Number(raw))) {
          delete cleanData[field];
        } else {
          cleanData[field] = Number(raw);
        }
      }

      if (transferenciasContadas !== '' && !isNaN(Number(transferenciasContadas))) {
        cleanData.transferenciasContadas = Number(transferenciasContadas);
      }

      if (cleanData.insumos) {
        cleanData.insumos = cleanData.insumos.map((i: any) => ({
          ...i,
          cantDeCierre: i.cantDeCierre === '' || isNaN(Number(i.cantDeCierre)) ? undefined : Number(i.cantDeCierre)
        }));
      }

      const isInsumosDirty = !!control._formState.dirtyFields.insumos || insumosAEliminar.length > 0;
      const dirtyFields = control._formState.dirtyFields || {} as any;
      
      const updateData = { ...cleanData, insumosAEliminar, usuario: user?.name || user?.nombre, updaterName: user?.nombre || user?.Nombre || user?.usuario || 'Un usuario' } as any;
      if (!isInsumosDirty) delete updateData.insumos;
      if (!dirtyFields.observaciones) delete updateData.observaciones;
      if (!dirtyFields.efectivoDeCierre) delete updateData.efectivoDeCierre;
      if (!dirtyFields.plataGuardada) delete updateData.plataGuardada;
      if (transferenciasContadas === String(resumenData?.caja?.transferenciasContadas)) delete updateData.transferenciasContadas;

      // Calculate and sync physical differences in the DB so that preview endpoint gets correct metrics
      const efContado = parseFloat(watch('efectivoDeCierre') as unknown as string) || 0;
      const trContadas = parseFloat(transferenciasContadas) || 0;
      const efAper = Number(resumenData?.resumen?.efectivoApertura || 0);
      const efTot = Number(resumenData?.resumen?.totalEfectivo || 0);
      const trTot = Number(resumenData?.resumen?.totalTransferencia || 0) + Number(resumenData?.resumen?.totalNequi || 0);

      const diffEf = efContado - (efAper + efTot);
      const diffTr = trContadas - trTot;
      const totalD = diffEf + diffTr;

      updateData.valorFaltante = totalD < 0 ? Math.abs(totalD) : 0;
      updateData.valorExcedente = totalD > 0 ? totalD : 0;
      updateData.cuadroCaja = totalD === 0 && diffEf === 0 && diffTr === 0 ? 'SI CUADRO CAJA' : 'NO CUADRO CAJA';
      updateData.updaterName = user?.nombre || user?.Nombre || user?.usuario || 'Un usuario';

      await updateCaja(cajaId, updateData);
      await fetchInitialData();
      
      setIsAutoCuadreModalVisible(true);
    } catch (error: any) {
      console.error('Error guardando antes de Auto-Cuadre:', error);
      let errorMsg = error?.response?.data?.message || error?.message || 'No se pudo guardar';
      if (Array.isArray(errorMsg)) errorMsg = errorMsg.join(', ');
      Toast.show({ type: 'error', text1: 'Error', text2: `No se pudieron guardar los montos actuales: ${errorMsg}` });
    } finally {
      setSaving(false);
    }
  };

  const onSave = async (data: any, isFinalClose: boolean = false) => {
    setSaving(true);
    try {
      const cleanData = { ...data };
      if (!cleanData.fechaDeCierre) delete cleanData.fechaDeCierre;
      if (!cleanData.horaDeCierre) delete cleanData.horaDeCierre;
      if (cleanData.efectivoDeCierre === '' || isNaN(cleanData.efectivoDeCierre)) delete cleanData.efectivoDeCierre;

      // Asegurar que transferenciasContadas viaje en el objeto de datos para guardar
      if (transferenciasContadas !== '' && !isNaN(Number(transferenciasContadas))) {
        cleanData.transferenciasContadas = Number(transferenciasContadas);
      }

      if (cleanData.insumos) {
        cleanData.insumos = cleanData.insumos.map((i: any) => {
          const processed: any = {
            ...i,
            cantDeCierre: i.cantDeCierre === '' || isNaN(Number(i.cantDeCierre)) ? undefined : Number(i.cantDeCierre)
          };
          // Prevenir que meseros o no-admins sobreescriban la apertura por accidente al guardar
          if (!isAdmin) {
            delete processed.cantApertura;
          }
          return processed;
        });

        if (!isNew && isFinalClose) {
          const faltanInsumos = cleanData.insumos.some((i: any) => i.cantDeCierre === undefined);
          if (faltanInsumos) {
            Toast.show({ type: 'error', text1: 'Conteos incompletos', text2: 'Debes ingresar la cantidad final para todos los insumos listados antes de cerrar la caja.' });
            setSaving(false);
            return;
          }
        }
      }

      if (isNew) {
        await abrirCaja({ ...cleanData, usuario: user?.name || user?.nombre });
        Toast.show({ type: 'success', text1: 'Éxito', text2: 'Caja creada correctamente' });
        navigation.goBack();
      } else {
        if (isFinalClose) {
          // CHECK PENDING VERIFICATIONS FIRST
          try {
            const verificacion = await getVerificacionPendiente(cajaId);
            if (!verificacion.todasVerificadas) {
              pendingSaveRef.current = { data, isFinalClose };
              setVerifyModalVisible(true);
              setSaving(false);
              return; // Stop execution before saving partial data
            }
          } catch (e) {
            console.warn("No se pudo verificar el estado de insumos, se continuará con el guardado...", e);
          }

          // ERROR HANDLING PATTERN: "Double-Step Save" (Systematic Debugging)
          // Dado que el endpoint de cerrarCaja tiene un ValidationPipe extremadamente estricto en producción que rechaza la trazabilidad compleja,
          // PRIMERO: Guardamos toda la trazabilidad y datos extras usando el endpoint genérico (updateCaja) que es flexible.
          const isInsumosDirty = !!control._formState.dirtyFields.insumos || insumosAEliminar.length > 0;
          const dirtyFields = control._formState.dirtyFields || {} as any;
          
          const updateData = { ...cleanData, insumosAEliminar, usuario: user?.name || user?.nombre, updaterName: user?.nombre || user?.Nombre || user?.usuario || 'Un usuario' };
          if (!isInsumosDirty) delete updateData.insumos;
          if (!dirtyFields.observaciones) delete updateData.observaciones;
          if (!dirtyFields.efectivoDeCierre) delete updateData.efectivoDeCierre;
          if (!dirtyFields.plataGuardada) delete updateData.plataGuardada;
          if (transferenciasContadas === String(resumenData?.caja?.transferenciasContadas)) delete updateData.transferenciasContadas;
          await updateCaja(cajaId, updateData);

          // SEGUNDO: Enviamos el cierre definitivo SOLO con los campos financieros básicos que el DTO viejo y estricto espera.
          const closeData: any = { updaterName: user?.nombre || user?.Nombre || user?.usuario || 'Un usuario' };

          if (dirtyFields.efectivoDeCierre && cleanData.efectivoDeCierre !== undefined) closeData.efectivoDeCierre = cleanData.efectivoDeCierre;
          if (cleanData.resumen !== undefined) closeData.resumen = cleanData.resumen;
          if (dirtyFields.plataGuardada && cleanData.plataGuardada !== undefined) closeData.plataGuardada = cleanData.plataGuardada;
          if (cleanData.valorFaltante !== undefined) closeData.valorFaltante = cleanData.valorFaltante;
          if (cleanData.valorExcedente !== undefined) closeData.valorExcedente = cleanData.valorExcedente;
          if (dirtyFields.observaciones && cleanData.observaciones !== undefined) closeData.observaciones = cleanData.observaciones;
          if (transferenciasContadas !== String(resumenData?.caja?.transferenciasContadas) && cleanData.transferenciasContadas !== undefined) closeData.transferenciasContadas = cleanData.transferenciasContadas;
          
          if (cleanData.insumos && isInsumosDirty) {
            closeData.insumos = cleanData.insumos.map((i: any) => ({
              Idcierreyapertura: i.Idcierreyapertura,
              nombreInsumo: i.nombreInsumo,
              cantApertura: i.cantApertura,
              cantDeCierre: i.cantDeCierre,
              observacion: i.observacion,
              paraQueProducto: i.paraQueProducto
            }));
          }

          await cerrarCaja(cajaId, closeData);
          await AsyncStorage.removeItem(`@caja_congelada_${cajaId}`); // Clear freeze state
          Toast.show({ type: 'success', text1: 'Caja Cerrada', text2: 'La caja se ha cerrado definitivamente' });
        } else {
          // Guardado Parcial: El endpoint genérico updateCaja sí espera Idcierreyapertura, cantApertura, etc.
          const isInsumosDirty = !!control._formState.dirtyFields.insumos || insumosAEliminar.length > 0;
          const dirtyFields = control._formState.dirtyFields || {} as any;
          
          const updateData = { ...cleanData, insumosAEliminar, usuario: user?.name || user?.nombre, updaterName: user?.nombre || user?.Nombre || user?.usuario || 'Un usuario' };
          if (!isInsumosDirty) delete updateData.insumos;
          if (!dirtyFields.observaciones) delete updateData.observaciones;
          if (!dirtyFields.efectivoDeCierre) delete updateData.efectivoDeCierre;
          if (!dirtyFields.plataGuardada) delete updateData.plataGuardada;
          if (transferenciasContadas === String(resumenData?.caja?.transferenciasContadas)) delete updateData.transferenciasContadas;
          
          await updateCaja(cajaId, updateData);
          Toast.show({ type: 'success', text1: 'Arqueo Guardado', text2: 'El arqueo parcial se ha guardado' });
        }
        
        await fetchInitialData();
        setModifiedInsumoIndexes(new Set());
        setIsTransferenciasDirty(false);
      }
    } catch (error: any) {
      console.error(error);
      let errorMsg = error?.response?.data?.message || error?.message || 'No se pudo guardar';
      if (Array.isArray(errorMsg)) errorMsg = errorMsg.join(', ');

      if (errorMsg.includes('insumos sin verificar') || errorMsg.includes('Debes hacer la verificación') || errorMsg.includes('Debes verificar')) {
        Toast.show({ type: 'error', text1: 'Verificación Pendiente', text2: 'Debes verificar los insumos antes de cerrar.' });
        setVerifyModalVisible(true);
      } else {
        Toast.show({ type: 'error', text1: 'Error', text2: errorMsg });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAddInsumo = (insumo: InsumoItem) => {
    const currentInsumos = getValues('insumos') || [];
    const existingCount = currentInsumos.filter((i: any) => i.nombreInsumo === insumo.IDalimentos).length;

    append({
      nombreInsumo: insumo.IDalimentos,
      nombreInsumoReal: insumo.Nombre || insumo.nombre,
      paraQueProducto: [] as unknown as string[],
      nombreProductoReal: '',
      categoria: insumo.Categoria || insumo.categoria || '',
      unidadDeMedida: insumo.Unidades || insumo.unidades || 'Und',
      cantApertura: 0,
      cantDeCierre: 0,
      observacion: '',
      imageUrl: insumo.imageUrl || insumo.imagen || ''
    });

    if (existingCount > 0) {
      // El mismo insumo puede usarse para distintos productos — se permite la entrada duplicada
      Toast.show({
        type: 'success',
        text1: 'Agregado (duplicado)',
        text2: `${insumo.Nombre || insumo.nombre} añadido de nuevo. Asigna el producto correspondiente.`
      });
    } else {
      Toast.show({ type: 'success', text1: 'Agregado', text2: 'Insumo añadido a la lista' });
    }
  };

  const handleRemoveInsumo = (index: number) => {
    const item = fields[index] as any;
    if (item.Idcierreyapertura) {
      setInsumosAEliminar(prev => [...prev, item.Idcierreyapertura]);
    }
    remove(index);
  };

  const filteredInsumos = useMemo(() => {
    if (!searchInsumo) return allInsumos;
    const lower = searchInsumo.toLowerCase();
    return allInsumos.filter(i => 
      (i.Nombre || i.nombre || '').toLowerCase().includes(lower) || 
      (i.Categoria || i.categoria || '').toLowerCase().includes(lower)
    );
  }, [allInsumos, searchInsumo]);

  const filteredProductos = useMemo(() => {
    if (!searchProducto) return allProductos;
    const lower = searchProducto.toLowerCase();
    return allProductos.filter(p => 
      (p.nombre || p.Nombre || '').toLowerCase().includes(lower) || 
      (p.categoria || p.Categoria || '').toLowerCase().includes(lower)
    );
  }, [allProductos, searchProducto]);

  const handleSelectProducto = (producto: any) => {
    if (selectedIndexForProduct !== null) {
      const current = (fields[selectedIndexForProduct] as any);
      const currentIds: string[] = Array.isArray(current.paraQueProducto)
        ? current.paraQueProducto
        : (current.paraQueProducto ? [current.paraQueProducto] : []);
      const prodId = producto.IDproductos;
      const prodNombre = producto.nombre || producto.Nombre || '';

      const isSelected = currentIds.includes(prodId);
      const newIds = isSelected
        ? currentIds.filter(id => id !== prodId)  // deselect
        : [...currentIds, prodId];                  // select

      const newNombres = newIds.map(id => {
        const p = allProductos.find((x: any) => x.IDproductos === id);
        return p ? (p.nombre || p.Nombre) : id;
      }).join(', ');

      update(selectedIndexForProduct, {
        ...current,
        paraQueProducto: newIds,
        nombreProductoReal: newNombres
      });
      // Don't close modal — let user select multiple, they close manually
    }
  };

  const handlePrintPDF = async () => {
    if (!resumenData) {
      Toast.show({ type: 'info', text1: 'Aviso', text2: 'No hay datos para generar el reporte.' });
      return;
    }

    try {
      // Combinar el estado actual del formulario para que el PDF refleje los cambios no guardados
      const currentValues = getValues();
      const efectivoContado = Number(currentValues.efectivoDeCierre) || 0;
      const transContadasVal = Number(transferenciasContadas) || 0;
      const diffEfectivo = efectivoContado - (Number(resumenData.resumen?.efectivoApertura || 0) + Number(resumenData.resumen?.totalEfectivo || 0));
      const diffTrans = transContadasVal - ((resumenData.resumen?.totalTransferencia || 0) + (resumenData.resumen?.totalNequi || 0));
      const totalDiff = diffEfectivo + diffTrans;

      const updatedResumenData = {
        ...resumenData,
        caja: {
          ...resumenData.caja,
          observaciones: currentValues.observaciones,
        },
        resumen: {
          ...resumenData.resumen,
          efectivoCierre: efectivoContado,
          transferenciasContadas: transContadasVal,
          plataGuardada: Number(currentValues.plataGuardada) || 0,
          valorFaltante: totalDiff < 0 ? Math.abs(totalDiff) : 0,
          valorExcedente: totalDiff > 0 ? totalDiff : 0,
        },
        insumos: resumenData.insumos?.map((backendInsumo: any) => {
          // Encontrar el insumo correspondiente en el formulario actual
          let formInsumo = currentValues.insumos?.find(
            (fi: any) => fi.Idcierreyapertura && fi.Idcierreyapertura === backendInsumo.Idcierreyapertura
          );
          if (!formInsumo) {
            formInsumo = currentValues.insumos?.find(
              (fi: any) => !fi.Idcierreyapertura && fi.nombreInsumo === backendInsumo.nombreInsumo
            );
          }

          let cantApertura = 0;
          let cantDeCierre = 0;
          let nombreReal = backendInsumo.nombreReal;
          let nombreProductoReal = backendInsumo.nombreProductoReal;

          if (formInsumo) {
            cantApertura = Number(formInsumo.cantApertura) || 0;
            cantDeCierre = Number(formInsumo.cantDeCierre) || 0;
            nombreReal = formInsumo.nombreInsumoReal || backendInsumo.nombreReal;
            nombreProductoReal = formInsumo.nombreProductoReal || backendInsumo.nombreProductoReal;
          } else {
            cantApertura = Number(backendInsumo.cantApertura) || 0;
            cantDeCierre = Number(backendInsumo.cantDeCierre) || 0;
          }

          const gastadoFisico = cantApertura - cantDeCierre;
          const diferencia = gastadoFisico - (backendInsumo.ventasEnSistema || 0);

          return {
            ...backendInsumo,
            nombreReal,
            nombreProductoReal,
            cantApertura,
            cantDeCierre,
            seUtilizaron: gastadoFisico,
            diferencia: diferencia
          };
        }) || []
      };

      await generateAndShareCajaPDF(updatedResumenData, modoOperacion);
    } catch (error) {
      console.error("Error al generar PDF:", error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Hubo un problema al generar el reporte PDF.' });
    }
  };

  const handleDeleteCaja = () => {
    if (!cajaId) return;
    showAlert({
      type: 'confirm',
      title: 'Eliminar Registro',
      message: '¿Estás seguro de que deseas eliminar este registro de caja? Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        setSaving(true);
        try {
          await deleteCaja(cajaId);
          Toast.show({ type: 'success', text1: 'Eliminado', text2: 'Caja eliminada exitosamente' });
          navigation.goBack();
        } catch (error) {
          console.error('Error deleting caja:', error);
          Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo eliminar la caja' });
        } finally {
          setSaving(false);
        }
      },
      onCancel: () => {}
    });
  };

  const handleArquearInsumos = async () => {
    Alert.alert(
      'Confirmar Arqueo',
      '¿Estás seguro de que deseas arquear los insumos físicos de esta caja contra el inventario global? Esto ajustará las diferencias de cierre.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Arquear', 
          style: 'destructive',
          onPress: async () => {
            if (!cajaId) {
              showAlert({ title: 'Error', message: 'Debes guardar la caja primero antes de arquear.', type: 'error' });
              return;
            }
            try {
              setSaving(true);
              const response = await api.post(`/caja/${cajaId}/arquear-insumos`);
              showAlert({ title: 'Arqueo Exitoso', message: response.data?.message || 'Se han ajustado las diferencias.', type: 'success' });
            } catch (error: any) {
              showAlert({ title: 'Error', message: error.response?.data?.message || 'Hubo un error al arquear.', type: 'error' });
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };

  const copyPreviousCajaInsumos = async () => {
    try {
      setSaving(true);
      const allCajas = await getCajas();
      
      // Ordenar por fecha y hora (más reciente primero) y tomar la última caja que no sea la actual (si la hay)
      // Como allCajas suele venir ordenada por fecha desc desde el backend, tomamos la primera si es nueva, 
      // o la primera que no sea la actual si estamos editando.
      const lastCaja = allCajas.find((c: any) => c.IDcaja !== cajaId);
      
      if (!lastCaja) {
        Toast.show({ type: 'info', text1: 'Aviso', text2: 'No hay registros de cajas previas en el sistema.' });
        return;
      }

      const resumen = await getResumenCaja(lastCaja.IDcaja);
      console.log('DEBUG_COPIAR_RESUMEN:', JSON.stringify(resumen?.insumos?.[0] || 'NO_INSUMOS', null, 2));
      
      if (resumen && resumen.insumos && resumen.insumos.length > 0) {
        const newInsumos = resumen.insumos.map((i: any) => {
          const prodId = i.paraQueProducto || '';
          const prodObj = allProductos.find((p: any) => p.IDproductos === prodId || p.nombre === prodId);
          
          const insId = i.nombreInsumo || i.insumos || '';
          const insObj = allInsumos.find((ins: any) => ins.IDalimentos === insId || ins.Nombre === insId || ins.nombre === insId);

          return {
            nombreInsumo: insId,
            nombreInsumoReal: insObj ? (insObj.Nombre || insObj.nombre) : (i.insumo?.Nombre || i.insumo?.nombre || insId),
            paraQueProducto: (() => {
              if (i.productosAsociados && Array.isArray(i.productosAsociados) && i.productosAsociados.length > 0) {
                return i.productosAsociados.map((p: any) => p.id);
              }
              const rawPQP = i.paraQueProducto || i.nombreDelProducto;
              let rawIds: string[] = [];
              if (Array.isArray(rawPQP)) {
                rawIds = rawPQP;
              } else if (typeof rawPQP === 'string' && rawPQP.trim()) {
                try {
                  const parsed = JSON.parse(rawPQP);
                  rawIds = Array.isArray(parsed) ? parsed : [rawPQP.trim()];
                } catch(e) {
                  rawIds = [rawPQP.trim()];
                }
              }
              // Resolve IDs: if the value is a name, find the product ID
              return rawIds.map(val => {
                const p = allProductos.find((x: any) => x.IDproductos === val || x.nombre === val);
                return p ? p.IDproductos : val;
              }).filter(Boolean);
            })() as unknown as string[],
            nombreProductoReal: (() => {
              if (i.productosAsociados && Array.isArray(i.productosAsociados) && i.productosAsociados.length > 0) {
                return i.productosAsociados.map((p: any) => p.nombre).join(', ');
              }
              const rawPQP = i.paraQueProducto || i.nombreDelProducto;
              let ids: string[] = [];
              if (Array.isArray(rawPQP)) {
                ids = rawPQP;
              } else if (typeof rawPQP === 'string' && rawPQP.trim()) {
                try {
                  const parsed = JSON.parse(rawPQP);
                  ids = Array.isArray(parsed) ? parsed : [rawPQP.trim()];
                } catch(e) {
                  ids = [rawPQP.trim()];
                }
              }
              return ids.map((pid: string) => {
                const p = allProductos.find((x: any) => x.IDproductos === pid || x.nombre === pid);
                return p ? (p.nombre || p.Nombre) : pid;
              }).join(', ');
            })(),
            categoria: i.categoria || i.insumo?.Categoria || insObj?.Categoria || insObj?.categoria || '',
            unidadDeMedida: i.unidadDeMedida || i.insumo?.Unidades || insObj?.Unidades || insObj?.unidades || 'Und',
            cantApertura: Number(i.cantDeCierre) || 0,
            cantDeCierre: '' as any,
            observacion: '',
            imageUrl: i.insumo?.imageUrl || i.insumo?.imagen || insObj?.imageUrl || insObj?.imagen || ''
          };
        });
        
        replace(newInsumos as any);
        Toast.show({ type: 'success', text1: 'Copiado', text2: `Se copiaron ${newInsumos.length} insumos de la caja anterior.` });
      } else {
        Toast.show({ type: 'info', text1: 'Aviso', text2: 'La caja anterior no tiene insumos registrados.' });
      }
    } catch (error) {
      console.error('Error copying insumos:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo copiar los insumos.' });
    } finally {
      setSaving(false);
    }
  };

  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC', paddingTop: insets.top }}>
        <ActivityIndicator size="large" color="#22c55e" className="mt-20" />
      </View>
    );
  }

  const onError = (errors: any) => {
    if (errors.insumos) {
      Toast.show({ type: 'error', text1: 'Conteo Incompleto', text2: 'Faltan cantidades en algunos insumos' });
    } else {
      Toast.show({ type: 'error', text1: 'Formulario Inválido', text2: 'Revisa los campos marcados en rojo' });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {saving && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 999, justifyContent: 'center', alignItems: 'center' }}>
          <View className="bg-white p-6 rounded-2xl shadow-lg items-center" style={{ elevation: 5 }}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text className="mt-4 font-bold text-gray-800">Procesando guardado...</Text>
          </View>
        </View>
      )}
      <View style={{ backgroundColor: primaryColor, paddingTop: insets.top }}>
        <View className="bg-primary flex-row items-center justify-between px-4 py-3 shadow-md" style={{ backgroundColor: primaryColor }}>
          <View className="flex-row items-center flex-1">
            <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 mr-2">
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View className="flex-1 mr-2">
              <Text className="text-white text-lg font-bold" numberOfLines={1}>{isNew ? 'Abrir Caja' : 'Detalle de Caja'}</Text>
              {!isNew && <Text className="text-white/80 text-xs">Apertura: {formatDateToDDMMAAAA(watch('fechaDeApertura') || '')}</Text>}
            </View>
          </View>
          <View className="flex-row items-center">
            {!isNew && canDelete && (
              <TouchableOpacity onPress={handleDeleteCaja} className="bg-red-500/90 p-2 rounded-lg mr-2" style={{ minWidth: 36, alignItems: 'center' }}>
                <Ionicons name="trash" size={18} color="#fff" />
              </TouchableOpacity>
            )}
            {!isNew && (
              <TouchableOpacity onPress={handlePrintPDF} className="bg-white/20 p-2 rounded-lg mr-2" style={{ minWidth: 36, alignItems: 'center' }}>
                <Ionicons name="document-text" size={18} color="#fff" />
              </TouchableOpacity>
            )}
            {!isReadOnly && (
              <TouchableOpacity onPress={() => {
                if (isNew) {
                  (handleSubmit as any)((data: any) => onSave(data, false), onError)();
                } else {
                  setGuardarModalVisible(true);
                }
              }} disabled={saving} className="bg-white/20 px-3 py-2 rounded-lg flex-row items-center">
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-white font-bold text-sm">Guardar</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {!isNew && (
        <View className="bg-white px-4 py-3 border-b border-gray-200">
          <View className="flex-row bg-gray-100 rounded-xl p-1 shadow-inner">
              <TouchableOpacity
                className={`flex-1 py-2 items-center rounded-lg ${activeTab === 'form' ? 'bg-white shadow-sm' : ''}`}
                onPress={() => handleTabChange('form')}
              >
                <Text className={`font-bold text-[11px] uppercase tracking-wide ${activeTab === 'form' ? 'text-green-600' : 'text-gray-500'}`}>Formulario</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 py-2 items-center rounded-lg ${activeTab === 'cuadre' ? 'bg-white shadow-sm' : ''}`}
                onPress={() => handleTabChange('cuadre')}
              >
                <View className="flex-row items-center gap-1">
                  <Text className={`font-bold text-[11px] uppercase tracking-wide ${activeTab === 'cuadre' ? 'text-green-600' : 'text-gray-500'}`}>Cuadre Caja</Text>
                  {!verificacionCompletada && !isNew && (
                    <View className="w-2 h-2 rounded-full bg-orange-500" />
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 py-2 items-center rounded-lg ${activeTab === 'analysis' ? 'bg-white shadow-sm' : ''}`}
                onPress={() => handleTabChange('analysis')}
              >
                <View className="flex-row items-center gap-1">
                  <Text className={`font-bold text-[11px] uppercase tracking-wide ${activeTab === 'analysis' ? 'text-green-600' : 'text-gray-500'}`}>Análisis</Text>
                  {!verificacionCompletada && !isNew && (
                    <View className="w-2 h-2 rounded-full bg-orange-500" />
                  )}
                </View>
              </TouchableOpacity>
            </View>
        </View>
      )}

      <VerifyInsumosModal
        visible={verifyModalVisible}
        cajaId={cajaId}
        onVerified={handleVerificationPassed}
        onCancel={handleVerificationCancelled}
      />

      {cajaId && isAutoCuadreModalVisible && (
        <AutoCuadrePreviewModal
          visible={isAutoCuadreModalVisible}
          cajaId={cajaId}
          onSuccess={() => {
            setIsAutoCuadreModalVisible(false);
            fetchInitialData();
          }}
          onCancel={() => setIsAutoCuadreModalVisible(false)}
        />
      )}

      <Modal
          visible={isFreezeModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsFreezeModalVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl items-center">
              <View className={`${horaCongelada ? 'bg-orange-100' : 'bg-blue-100'} w-16 h-16 rounded-full items-center justify-center mb-4`}>
                <Text className="text-3xl">{horaCongelada ? '🔓' : '❄️'}</Text>
              </View>
              <Text className="text-xl font-black text-gray-800 text-center mb-2">
                {horaCongelada ? '¿Caja ya Congelada!' : '¿Congelar Arqueo?'}
              </Text>
              <Text className="text-sm text-gray-500 text-center mb-6 leading-relaxed">
                {horaCongelada 
                  ? `La caja actualmente está congelada desde las ${formatTime12h(horaCongelada)}.\n¿Deseas descongelarla para incluir las nuevas ventas, o prefieres seguir contando con la caja congelada?`
                  : '¿Deseas congelar las ventas hasta este momento exacto? Las ventas nuevas no alterarán tus totales mientras haces el conteo.'}
              </Text>
              
              <View className="flex-col w-full space-y-3">
                {horaCongelada ? (
                  <>
                    <TouchableOpacity 
                      className="w-full bg-blue-600 py-3.5 rounded-xl items-center justify-center shadow-sm shadow-blue-300 mb-3"
                      onPress={() => {
                        // User wants to keep it frozen
                        setIsFreezeModalVisible(false);
                        if (pendingTab) setActiveTab(pendingTab);
                      }}
                    >
                      <Text className="text-white font-bold text-xs uppercase tracking-wider">Continuar Arqueo (Misma Hora)</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      className="w-full bg-orange-500 py-3.5 rounded-xl items-center justify-center shadow-sm shadow-orange-300 mb-3"
                      onPress={() => {
                        // Unfreeze and update to current time
                        setHoraCongelada(new Date().toISOString());
                        setIsFreezeModalVisible(false);
                        if (pendingTab) setActiveTab(pendingTab);
                      }}
                    >
                      <Text className="text-white font-bold text-[10px] uppercase tracking-wider">Actualizar Congelamiento (Hora Actual)</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      className="w-full bg-gray-100 py-3.5 rounded-xl items-center justify-center"
                      onPress={() => {
                        // Completely unfreeze
                        setHoraCongelada(null);
                        setIsFreezeModalVisible(false);
                        if (pendingTab) setActiveTab(pendingTab);
                      }}
                    >
                      <Text className="text-gray-600 font-bold text-xs uppercase tracking-wider">Descongelar (Tiempo Real)</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View className="flex-row w-full space-x-3">
                    <TouchableOpacity
                      className="flex-1 bg-gray-100 py-3 rounded-xl items-center justify-center"
                      onPress={() => {
                        setHoraCongelada(null); // Explicitly ensure it's not frozen
                        setIsFreezeModalVisible(false);
                        if (pendingTab) setActiveTab(pendingTab);
                      }}
                    >
                      <Text className="text-gray-600 font-bold text-xs uppercase tracking-wider">No, Tiempo Real</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      className="flex-1 bg-blue-600 py-3 rounded-xl items-center justify-center shadow-sm shadow-blue-300 ml-3"
                      onPress={() => {
                        setHoraCongelada(new Date().toISOString());
                        setIsFreezeModalVisible(false);
                        if (pendingTab) setActiveTab(pendingTab);
                      }}
                    >
                      <Text className="text-white font-bold text-xs uppercase tracking-wider">Sí, Congelar</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Modal>

      <KeyboardAwareScrollView 
        ref={scrollViewRef}
        style={{ flex: 1 }}
        className="p-4" 
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />}
        enableOnAndroid={true}
        extraScrollHeight={100}
        extraHeight={100}
        enableAutomaticScroll={true}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 150 }}
      >
          
          {activeTab === 'form' && (
            <>
              {/* CAMPOS PRINCIPALES */}
              <View className="bg-white p-4 rounded-xl shadow-sm mb-4 border border-gray-200">
                <View className="flex-row items-center justify-between mb-4 border-b border-gray-100 pb-2">
                  <Text className="text-lg font-bold text-gray-800">Información General</Text>
                  {!isNew && resumenData?.caja && (
                    <View className={`px-2 py-1 rounded-md ${resumenData.caja.cierre?.toLowerCase() === 'cerrada' || resumenData.caja.apertura?.toLowerCase() === 'cerrada' ? 'bg-red-100' : 'bg-green-100'}`}>
                      <Text className={`text-xs font-bold ${resumenData.caja.cierre?.toLowerCase() === 'cerrada' || resumenData.caja.apertura?.toLowerCase() === 'cerrada' ? 'text-red-700' : 'text-green-700'}`}>
                        {resumenData.caja.cierre?.toLowerCase() === 'cerrada' || resumenData.caja.apertura?.toLowerCase() === 'cerrada' ? 'CERRADA' : 'ABIERTA'}
                      </Text>
                    </View>
                  )}
                </View>
            
            <View className="mb-3">
              <Text className="text-gray-600 text-xs font-semibold mb-1 uppercase">Responsable *</Text>
              <Controller control={control} name="nombre" render={({ field: { onChange, value } }) => (
                <Input editable={!isReadOnly} value={value} onChangeText={onChange} className="bg-gray-50 border-gray-300 text-gray-900" placeholder="Nombre del cajero" />
              )} />
              {errors.nombre && <Text className="text-red-500 text-xs mt-1">{errors.nombre.message}</Text>}
            </View>

          {!isNew && (
            <View className="mb-3">
              <Text className="text-gray-600 text-xs font-semibold mb-1 uppercase">ID Caja</Text>
              <Input value={cajaId} editable={false} className="bg-gray-100 border-gray-200 text-gray-500" />
            </View>
          )}

          <View className="flex-row justify-between mb-3">
            <View className="flex-1 mr-2">
              <Text className="text-gray-600 text-xs font-semibold mb-1 uppercase">Fecha Apertura</Text>
              <Controller control={control} name="fechaDeApertura" render={({ field: { value } }) => (
                <TouchableOpacity disabled={isReadOnly} onPress={() => setShowDatePickerApertura(true)} className="bg-gray-50 border border-gray-300 rounded-lg p-3">
                  <Text className="text-gray-900">{formatDateToDDMMAAAA(value) || 'Seleccionar...'}</Text>
                </TouchableOpacity>
              )} />
              {showDatePickerApertura && DateTimePicker && (
                <DateTimePicker
                  value={watch('fechaDeApertura') ? new Date(watch('fechaDeApertura') + 'T12:00:00') : new Date()}
                  mode="date"
                  display="default"
                  onChange={(event: any, selectedDate: any) => {
                    setShowDatePickerApertura(Platform.OS === 'ios');
                    if (selectedDate) {
                      const year = selectedDate.getFullYear();
                      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                      const day = String(selectedDate.getDate()).padStart(2, '0');
                      setValue('fechaDeApertura', `${year}-${month}-${day}`, { shouldValidate: true });
                    }
                  }}
                />
              )}
            </View>
            <View className="flex-1 ml-2">
              <Text className="text-gray-600 text-xs font-semibold mb-1 uppercase">Hora Apertura</Text>
              <Controller control={control} name="horaDeApertura" render={({ field: { value } }) => (
                <TouchableOpacity disabled={isReadOnly} onPress={() => setShowTimePickerApertura(true)} className="bg-gray-50 border border-gray-300 rounded-lg p-3">
                  <Text className="text-gray-900">{value || 'Seleccionar...'}</Text>
                </TouchableOpacity>
              )} />
              {showTimePickerApertura && DateTimePicker && (
                <DateTimePicker
                  value={new Date()}
                  mode="time"
                  display="default"
                  onChange={(event: any, selectedDate: any) => {
                    setShowTimePickerApertura(Platform.OS === 'ios');
                    if (selectedDate) {
                      const timeStr = selectedDate.toTimeString().split(' ')[0];
                      setValue('horaDeApertura', formatTime12h(timeStr), { shouldValidate: true });
                    }
                  }}
                />
              )}
            </View>
          </View>

          <View className="flex-row justify-between mb-3">
            <View className="flex-1 mr-2">
              <Text className="text-gray-600 text-xs font-semibold mb-1 uppercase">Fecha Cierre</Text>
              <Controller control={control} name="fechaDeCierre" render={({ field: { value } }) => (
                <TouchableOpacity disabled={isReadOnly} onPress={() => setShowDatePickerCierre(true)} className="bg-gray-50 border border-gray-300 rounded-lg p-3">
                  <Text className="text-gray-900">{formatDateToDDMMAAAA(value) || 'Seleccionar...'}</Text>
                </TouchableOpacity>
              )} />
              {showDatePickerCierre && DateTimePicker && (
                <DateTimePicker
                  value={watch('fechaDeCierre') ? new Date(watch('fechaDeCierre') + 'T12:00:00') : new Date()}
                  mode="date"
                  display="default"
                  onChange={(event: any, selectedDate: any) => {
                    setShowDatePickerCierre(Platform.OS === 'ios');
                    if (selectedDate) {
                      const year = selectedDate.getFullYear();
                      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                      const day = String(selectedDate.getDate()).padStart(2, '0');
                      setValue('fechaDeCierre', `${year}-${month}-${day}`, { shouldValidate: true });
                    }
                  }}
                />
              )}
            </View>
            <View className="flex-1 ml-2">
              <Text className="text-gray-600 text-xs font-semibold mb-1 uppercase">Hora Cierre</Text>
              <Controller control={control} name="horaDeCierre" render={({ field: { value } }) => (
                <TouchableOpacity disabled={isReadOnly} onPress={() => setShowTimePickerCierre(true)} className="bg-gray-50 border border-gray-300 rounded-lg p-3">
                  <Text className="text-gray-900">{value || 'Seleccionar...'}</Text>
                </TouchableOpacity>
              )} />
              {showTimePickerCierre && DateTimePicker && (
                <DateTimePicker
                  value={new Date()}
                  mode="time"
                  display="default"
                  onChange={(event: any, selectedDate: any) => {
                    setShowTimePickerCierre(Platform.OS === 'ios');
                    if (selectedDate) {
                      const timeStr = selectedDate.toTimeString().split(' ')[0];
                      setValue('horaDeCierre', formatTime12h(timeStr), { shouldValidate: true });
                    }
                  }}
                />
              )}
            </View>
          </View>

          <View className="mb-3">
            <Text className="text-gray-600 text-xs font-semibold mb-1 uppercase">Efectivo Inicial <Text className="text-red-500">*</Text></Text>
            <Controller control={control} name="efectivoDeApertura" render={({ field: { onChange, value } }) => (
              <CurrencyInputWrapper editable={!isReadOnly} value={value} onChange={onChange} className={cn("font-bold bg-gray-50 border-gray-300 text-gray-900", errors.efectivoDeApertura && "border-red-500")} style={{ fontSize: 15 }} />
            )} />
            {errors.efectivoDeApertura && (
              <Text className="text-red-500 text-xs mt-1 font-medium">{errors.efectivoDeApertura.message as unknown as string}</Text>
            )}
          </View>

          <View className="mb-2 relative">
            <Text className="text-gray-600 text-xs font-semibold mb-1 uppercase">Observaciones</Text>
            <Controller control={control} name="observaciones" render={({ field: { onChange, value } }) => (
              <View className="relative">
                <Input 
                  editable={!isReadOnly && isEditingObservaciones}
                  multiline 
                  numberOfLines={8} 
                  value={value} 
                  onChangeText={onChange} 
                  onBlur={() => setIsEditingObservaciones(false)}
                  className={`bg-gray-50 border-gray-300 ${!isReadOnly && isEditingObservaciones ? 'text-gray-900 bg-white border-blue-400' : 'text-gray-700'}`} 
                  style={{ minHeight: 180, textAlignVertical: 'top' }}
                />
                {!isReadOnly && !isEditingObservaciones && (
                  <TouchableOpacity 
                    className="absolute inset-0 z-10" 
                    activeOpacity={0.8}
                    onPress={() => setIsEditingObservaciones(true)}
                  >
                    {!value && (
                      <View className="absolute inset-0 justify-center items-center">
                        <Ionicons name="pencil-outline" size={24} color="#9ca3af" />
                        <Text className="text-gray-400 text-xs mt-2">Tocar para escribir observaciones</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )} />
          </View>

          {/* Cálculo Automático de Resumen */}
          {(() => {
            const efApertura = Number(watch('efectivoDeApertura')) || 0;
            const efCierre = Number(watch('efectivoDeCierre')) || 0;
            if (efCierre > 0 || (watch('efectivoDeCierre') !== undefined && watch('efectivoDeCierre') !== ('' as any))) {
              const resumen = efCierre - efApertura;
              return (
                <View className="bg-indigo-50 p-4 rounded-xl shadow-sm border border-indigo-200 mt-2">
                  <Text className="text-indigo-800 font-bold text-xs mb-1 uppercase text-center">Resumen Generado (Cierre - Apertura)</Text>
                  <Text className="text-indigo-900 font-black text-xl text-center">{formatCurrency(resumen)}</Text>
                  <Text className="text-indigo-600 text-xs text-center mt-1">Efectivo Cierre ({formatCurrency(efCierre)}) - Efectivo Apertura ({formatCurrency(efApertura)})</Text>
                </View>
              );
            }
            return null;
          })()}

        </View>

        {isAdmin && !isNew && (
          <View className="bg-red-50 p-4 rounded-xl shadow-sm mb-4 border border-red-200">
            <Text className="text-sm font-bold text-red-800 mb-3 border-b border-red-200 pb-2">Administración de Cuadre (Admin)</Text>
            
            <View className="flex-row justify-between mb-3">
              <View className="flex-1 mr-2">
                <Text className="text-gray-600 text-xs font-semibold mb-1 uppercase">Plata Guardada</Text>
                <Controller control={control} name="plataGuardada" render={({ field: { onChange, value } }) => (
                  <CurrencyInputWrapper value={value} onChange={onChange} className="bg-white border-red-300 text-gray-900" />
                )} />
              </View>
              <View className="flex-1 ml-2">
                <Text className="text-gray-600 text-xs font-semibold mb-1 uppercase">¿Cuadró Caja?</Text>
                <Controller control={control} name="cuadroCaja" render={({ field: { onChange, value } }) => (
                  <View className="flex-row rounded-lg overflow-hidden border border-gray-300 h-[50px]">
                    <TouchableOpacity 
                      onPress={() => onChange('SI CUADRO CAJA')} 
                      className={`flex-1 justify-center items-center ${value === 'SI CUADRO CAJA' ? 'bg-green-500' : 'bg-gray-100'}`}
                    >
                      <Text className={`font-bold text-[10px] ${value === 'SI CUADRO CAJA' ? 'text-white' : 'text-gray-500'}`}>SÍ</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => onChange('NO CUADRO CAJA')} 
                      className={`flex-1 justify-center items-center ${value === 'NO CUADRO CAJA' ? 'bg-red-500' : 'bg-gray-100 border-l border-gray-300'}`}
                    >
                      <Text className={`font-bold text-[10px] ${value === 'NO CUADRO CAJA' ? 'text-white' : 'text-gray-500'}`}>NO</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => onChange('NO SE HA REVISADO')} 
                      className={`flex-1 justify-center items-center ${value === 'NO SE HA REVISADO' ? 'bg-amber-500' : 'bg-gray-100 border-l border-gray-300'}`}
                    >
                      <Text className={`font-bold text-[10px] text-center ${value === 'NO SE HA REVISADO' ? 'text-white' : 'text-gray-500'}`}>PENDIENTE</Text>
                    </TouchableOpacity>
                  </View>
                )} />
              </View>
            </View>

            <View className="flex-row justify-between">
              <View className="flex-1 mr-2">
                <Text className="text-gray-600 text-xs font-semibold mb-1 uppercase">Valor Faltante</Text>
                <Controller control={control} name="valorFaltante" render={({ field: { onChange, value } }) => (
                  <Input keyboardType="numeric" value={formatCurrency(value)} onChangeText={(val) => onChange(parseCurrency(val))} className="bg-white border-red-300 text-gray-900" />
                )} />
              </View>
              <View className="flex-1 ml-2">
                <Text className="text-gray-600 text-xs font-semibold mb-1 uppercase">Valor Excedente</Text>
                <Controller control={control} name="valorExcedente" render={({ field: { onChange, value } }) => (
                  <Input keyboardType="numeric" value={formatCurrency(value)} onChangeText={(val) => onChange(parseCurrency(val))} className="bg-white border-red-300 text-gray-900" />
                )} />
              </View>
            </View>

            <TouchableOpacity
              className="bg-blue-600 py-3 rounded-xl items-center mt-2 shadow-sm shadow-blue-200 flex-row justify-center"
              onPress={() => {
                const efContado = parseFloat(watch('efectivoDeCierre') as unknown as string) || 0;
                const trContadas = parseFloat(transferenciasContadas) || 0;
                const efAper = Number(resumenData?.resumen?.efectivoApertura || 0);
                const efTot = Number(resumenData?.resumen?.totalEfectivo || 0);
                const trTot = Number(resumenData?.resumen?.totalTransferencia || 0) + Number(resumenData?.resumen?.totalNequi || 0);

                const diffEf = efContado - (efAper + efTot);
                const diffTr = trContadas - trTot;
                const totalD = diffEf + diffTr;

                setValue('cuadroCaja', totalD === 0 && diffEf === 0 && diffTr === 0 ? 'SI CUADRO CAJA' : 'NO CUADRO CAJA', { shouldValidate: true, shouldDirty: true });
                setValue('valorFaltante', totalD < 0 ? Math.abs(totalD) : 0, { shouldValidate: true, shouldDirty: true });
                setValue('valorExcedente', totalD > 0 ? totalD : 0, { shouldValidate: true, shouldDirty: true });
                Toast.show({ type: 'success', text1: 'Sugerido', text2: 'Se han calculado los valores desde el Arqueo' });
              }}
            >
              <Ionicons name="calculator-outline" size={18} color="#fff" />
              <Text className="text-white font-bold ml-2">Sugerir Valores desde Arqueo</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* INSUMOS (APP SHEET STYLE) */}
        <View className="bg-white rounded-xl shadow-sm mb-10 border border-gray-200">
          <View className="flex-row items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
            <Text className="text-base font-bold text-gray-800 flex-1 mr-2" numberOfLines={1}>Apertura y cierre de insumos</Text>
            <View className="flex-row items-center">
              {isNew && !isReadOnly && (
                <TouchableOpacity onPress={copyPreviousCajaInsumos} className="bg-blue-500/10 px-2 py-1.5 rounded flex-row items-center mr-2 border border-blue-500/20">
                  <Ionicons name="copy-outline" size={14} color="#3b82f6" />
                  <Text className="text-blue-600 font-semibold ml-1 text-xs">Copiar</Text>
                </TouchableOpacity>
              )}
              {!isReadOnly && (
                <>
                  <TouchableOpacity onPress={handleArquearInsumos} className="px-2 py-1.5 rounded flex-row items-center mr-2 bg-orange-500">
                    <Ionicons name="sync" size={14} color="#fff" />
                    <Text className="text-white font-semibold ml-1 text-xs">Arquear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setModalInsumosVisible(true)} className="px-2 py-1.5 rounded flex-row items-center" style={{ backgroundColor: primaryColor || '#16a34a' }}>
                    <Ionicons name="add" size={14} color="#fff" />
                    <Text className="text-white font-semibold ml-1 text-xs">Agregar</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {fields.length === 0 ? (
            <View className="p-6 items-center">
              <Ionicons name="cube-outline" size={40} color="#d1d5db" />
              <Text className="text-gray-400 mt-2">No hay insumos registrados</Text>
            </View>
          ) : (
            <View className="w-full">
              <View className="px-3 py-2 border-b border-gray-100">
                <View className="flex-row items-center bg-gray-100 rounded-lg px-3 py-1.5 border border-gray-200">
                  <Ionicons name="search" size={16} color="#9ca3af" />
                  <TextInput
                    className="flex-1 ml-2 text-sm text-gray-800"
                    placeholder="Buscar insumo por nombre o categoría..."
                    value={insumosSearchQuery}
                    onChangeText={setInsumosSearchQuery}
                    placeholderTextColor="#9ca3af"
                  />
                  {insumosSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setInsumosSearchQuery('')}>
                      <Ionicons name="close-circle" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="w-full">
                <View className="flex-col min-w-[600px] sm:min-w-full">
                  {/* Header Row */}
                  <View className="flex-row items-center bg-gray-100 border-b border-gray-200 p-2">
                    <View className="w-10 shrink-0 items-center" />
                    <Text className="w-40 shrink-0 font-bold text-xs text-gray-600">Para qué producto</Text>
                    <Text className="w-48 shrink-0 font-bold text-xs text-gray-600">Insumos</Text>
                    <Text className="w-24 shrink-0 font-bold text-xs text-gray-600 text-center">Cant. Apertura</Text>
                    <Text className="w-24 shrink-0 font-bold text-xs text-gray-600 text-center">Cant. Cierre</Text>
                  </View>

                  {/* Items */}
                  {(() => {
                    const getStock = (item: any) => {
                      const cierre = Number(item.cantDeCierre);
                      if (!isNaN(cierre) && item.cantDeCierre !== '' && item.cantDeCierre !== null && item.cantDeCierre !== undefined) return cierre;
                      const apertura = Number(item.cantApertura);
                      if (!isNaN(apertura) && item.cantApertura !== '' && item.cantApertura !== null && item.cantApertura !== undefined) return apertura;
                      return 999999;
                    };
                    return fields
                      .map((item, originalIndex) => ({ item, originalIndex }))
                      .filter(({ item }) => {
                        if (!insumosSearchQuery) return true;
                        const searchLower = insumosSearchQuery.toLowerCase();
                        const nombre = (item.nombreInsumoReal || item.nombreInsumo || '').toLowerCase();
                        const cat = (item.categoria || '').toLowerCase();
                        return nombre.includes(searchLower) || cat.includes(searchLower);
                      })
                      .sort((a, b) => {
                        const stockA = getStock(a.item);
                        const stockB = getStock(b.item);
                        if (stockA !== stockB) return stockA - stockB;
                        
                        const catA = (a.item.categoria || '').toLowerCase();
                        const catB = (b.item.categoria || '').toLowerCase();
                        if (catA !== catB) return catA.localeCompare(catB);
                        
                        const nameA = (a.item.nombreInsumoReal || a.item.nombreInsumo || '').toLowerCase();
                        const nameB = (b.item.nombreInsumoReal || b.item.nombreInsumo || '').toLowerCase();
                        return nameA.localeCompare(nameB);
                      })
                      .map(({ item, originalIndex: index }) => (
                        <View key={item.id} className={`border-b border-gray-100 p-2 ${modifiedInsumoIndexes.has(index) ? 'bg-amber-50' : 'bg-white'}`}>
                          <View className="flex-row items-center">
                      {canDelete && !isReadOnly ? (
                        <TouchableOpacity onPress={() => handleRemoveInsumo(index)} className="w-10 items-center justify-center p-2">
                          <Ionicons name="trash-outline" size={20} color="#ef4444" />
                        </TouchableOpacity>
                      ) : (
                        <View className="w-10" />
                      )}
                      
                      <View className="w-40 pr-2">
                        <TouchableOpacity 
                          disabled={isReadOnly}
                          onPress={() => {
                            setSelectedIndexForProduct(index);
                            setModalProductosVisible(true);
                          }}
                          className="bg-transparent border-b border-gray-200 py-1 min-h-[30px]"
                        >
                          {(() => {
                            const pqp = (item as any).paraQueProducto;
                            const ids: string[] = Array.isArray(pqp) ? pqp : (pqp ? [pqp] : []);
                            const nombres = (item as any).nombreProductoReal;
                            if (ids.length === 0) {
                              return <Text className="text-sm text-gray-400" numberOfLines={2}>Seleccionar...</Text>;
                            }
                            return (
                              <View className="flex-row flex-wrap gap-1">
                                {nombres?.split(', ').map((nombre: string, i: number) => (
                                  <View key={i} className="bg-blue-100 rounded px-1 py-0.5">
                                    <Text className="text-[9px] text-blue-700 font-semibold" numberOfLines={1}>{nombre}</Text>
                                  </View>
                                ))}
                              </View>
                            );
                          })()}
                        </TouchableOpacity>
                      </View>

                      <View className="w-48 pr-2 flex-row items-center">
                        {item.imageUrl ? (
                          <Image source={{ uri: item.imageUrl }} className="w-8 h-8 rounded bg-gray-200 mr-2" />
                        ) : (
                          <View className="w-8 h-8 rounded bg-gray-200 mr-2 items-center justify-center">
                            <Ionicons name="cube" size={16} color="#9ca3af" />
                          </View>
                        )}
                        <View className="flex-1">
                          <Text className="text-sm font-medium text-gray-800" numberOfLines={1}>{item.nombreInsumoReal || item.nombreInsumo}</Text>
                          <Text className="text-[10px] text-gray-400">{item.categoria}</Text>
                        </View>
                      </View>

                      <View className="w-24 shrink-0 px-1">
                        <Controller
                          control={control}
                          name={`insumos.${index}.cantApertura`}
                          render={({ field: { onChange, value } }) => (
                            <View className="flex-row items-center">
                              <TextInput
                                editable={!isReadOnly && isAdmin}
                                keyboardType="numeric"
                                value={value !== undefined && value !== null ? String(value) : ''}
                                onChangeText={(val) => {
                                  onChange(val);
                                  setModifiedInsumoIndexes(prev => new Set(prev).add(index));
                                }}
                                className={`flex-1 min-w-[40px] text-center font-bold bg-gray-50 border ${errors.insumos?.[index]?.cantApertura ? 'border-red-500' : 'border-gray-200'} rounded py-1 text-gray-900`}
                                placeholder="0"
                              />
                              <View className="flex-row mt-1 justify-center space-x-1">
                                {!isReadOnly && isAdmin && (
                                  <TouchableOpacity 
                                    className="bg-green-500 rounded w-6 h-6 items-center justify-center mr-1"
                                    onPress={() => {
                                      const insumoId = getValues(`insumos.${index}.nombreInsumo`);
                                      const insumoData = allInsumos.find((i: any) => i.IDalimentos === insumoId);
                                      const hasPaquetes = insumoData && Number(insumoData.paquetesEnBodega) > 0;
                                      setAddQtyIndex(index);
                                      setAddQtyAmount('');
                                      setAddQtyMode(hasPaquetes ? 'paquete' : 'libre');
                                      setAddQtyModalVisible(true);
                                    }}
                                  >
                                    <Ionicons name="add" size={16} color="white" />
                                  </TouchableOpacity>
                                )}
                                {!isReadOnly && isAdmin && modoOperacion === 'RESTAURANTE' && (
                                  <TouchableOpacity 
                                    className="bg-red-500 rounded w-6 h-6 items-center justify-center"
                                    onPress={() => {
                                      setAddQtyIndex(index);
                                      setSubQtyAmount('');
                                      setSubQtyReason('');
                                      setSubQtyModalVisible(true);
                                    }}
                                  >
                                    <Ionicons name="remove" size={16} color="white" />
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                          )}
                        />
                      </View>

                      <View className="w-24 shrink-0 px-1">
                        <Controller
                          control={control}
                          name={`insumos.${index}.cantDeCierre`}
                          render={({ field: { onChange, value } }) => (
                            <View>
                              <TextInput
                                editable={!isReadOnly}
                                keyboardType="numeric"
                                value={value !== undefined ? String(value) : ''}
                                onChangeText={(val) => {
                                  onChange(val);
                                  setModifiedInsumoIndexes(prev => new Set(prev).add(index));
                                }}
                                className={`text-center font-bold bg-gray-50 border ${errors.insumos?.[index]?.cantDeCierre ? 'border-red-500' : 'border-gray-200'} rounded py-1 text-gray-900`}
                                placeholder="-"
                              />
                            </View>
                          )}
                        />
                      </View>
                    </View>
                    
                    {/* Historial Toggle / View */}
                    {(item as any).historial && (item as any).historial.length > 0 && (
                      <View className="mt-2 pl-10">
                        <Text className="text-xs text-gray-500 font-semibold mb-1">Historial de Cambios:</Text>
                        {(item as any).historial.map((h: any) => (
                          <Text key={h.IDhistorial} className="text-[10px] text-gray-400">
                            • {new Date(h.fechaYHora).toLocaleString('es-CO')} - {h.usuario}: Modificó {h.campoModificado} de {h.valorAnterior} a {h.valorNuevo}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                ))})()}
              </View>
            </ScrollView>
          </View>
        )}
        </View>
        </>
      )}

      {/* CUADRE DE CAJA TAB */}
        {activeTab === 'cuadre' && resumenData && (
          <View className="mb-10">
            {horaCongelada && (
              <View className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-4 shadow-sm">
                <Text className="text-blue-800 font-bold text-sm mb-1">
                  ❄️ Arqueo Congelado a las {formatTime12h(horaCongelada)}
                </Text>
                <Text className="text-blue-600 text-xs mb-3">
                  {resumenData.rangoPedidos 
                    ? `Incluye desde el Pedido #${resumenData.rangoPedidos.primerPedido} hasta el #${resumenData.rangoPedidos.ultimoPedido} (${resumenData.rangoPedidos.totalVentas} ventas procesadas).`
                    : 'Las ventas nuevas no se sumarán a este arqueo.'}
                </Text>
                <TouchableOpacity
                    className="bg-blue-600 py-2 rounded-lg items-center"
                    onPress={() => {
                      setIsFreezeModalVisible(true);
                    }}
                  >
                    <Text className="text-white font-bold text-xs uppercase tracking-wide">Gestionar Congelamiento</Text>
                  </TouchableOpacity>
                </View>
              )}

            <View className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-4">
            <Text className="text-lg font-black text-gray-800 mb-1">Conciliación de Caja</Text>
            <Text className="text-xs text-gray-500 mb-4">Ingresa los montos físicos contados para verificar el cuadre.</Text>

            {/* Efectivo */}
            <View className="mb-5 border-b border-gray-100 pb-5">
              <View className="flex-row items-center mb-3">
                <View className="bg-green-100 p-2 rounded-full mr-2">
                  <Ionicons name="cash" size={18} color="#15803d" />
                </View>
                <Text className="text-gray-800 font-bold uppercase tracking-wider text-sm">Efectivo</Text>
              </View>
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-gray-500 text-xs">Total Esperado (Apertura + Ventas)</Text>
                <Text className="text-gray-900 font-black text-sm">{formatCurrency(Number(resumenData.resumen.efectivoApertura || 0) + Number(resumenData.resumen.totalEfectivo || 0))}</Text>
              </View>
              <View className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <Text className="text-gray-600 text-xs font-bold mb-2 uppercase">Monto Físico Contado *</Text>
                <Controller control={control} name="efectivoDeCierre" render={({ field: { onChange, value } }) => (
                  <CurrencyInputWrapper 
                    editable={!isReadOnly}
                    value={value} 
                    onChange={onChange} 
                    className="font-black text-lg bg-white border-green-300 text-green-700 text-center" 
                    placeholder="$ 0"
                  />
                )} />
              </View>
              {(() => {
                const esperado = Number(resumenData.resumen.efectivoApertura || 0) + Number(resumenData.resumen.totalEfectivo || 0);
                const contado = Number(watch('efectivoDeCierre')) || 0;
                const diff = contado - esperado;
                if (!watch('efectivoDeCierre')) return null;
                return (
                  <View className={`mt-3 p-3 rounded-lg flex-row justify-between items-center ${diff === 0 ? 'bg-green-50' : diff < 0 ? 'bg-red-50' : 'bg-orange-50'}`}>
                    <Text className={`font-bold text-xs ${diff === 0 ? 'text-green-800' : diff < 0 ? 'text-red-800' : 'text-orange-800'}`}>Diferencia Efectivo:</Text>
                    <Text className={`font-black text-sm ${diff === 0 ? 'text-green-700' : diff < 0 ? 'text-red-700' : 'text-orange-700'}`}>
                      {diff > 0 ? '+' : ''}{formatCurrency(diff)} {diff !== 0 && <Text>{diff > 0 ? '(Sobran)' : '(Faltan)'}</Text>}
                    </Text>
                  </View>
                );
              })()}
            </View>

            {/* Transferencias */}
            <View className="mb-5 border-b border-gray-100 pb-5">
              <View className="flex-row items-center mb-3">
                <View className="bg-blue-100 p-2 rounded-full mr-2">
                  <Ionicons name="card" size={18} color="#1d4ed8" />
                </View>
                <Text className="text-gray-800 font-bold uppercase tracking-wider text-sm">Transferencias (Bancos)</Text>
              </View>
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-gray-500 text-xs">Total Esperado</Text>
                <Text className="text-gray-900 font-black text-sm">{formatCurrency((resumenData.resumen.totalTransferencia || 0) + (resumenData.resumen.totalNequi || 0))}</Text>
              </View>
              <View className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <Text className="text-gray-600 text-xs font-bold mb-2 uppercase">Monto Contado en la App de BANCO *</Text>
                <CurrencyInputWrapper 
                  editable={!isReadOnly}
                  value={transferenciasContadas} 
                  onChange={(val: any) => {
                    setTransferenciasContadas(val);
                    setIsTransferenciasDirty(true);
                  }} 
                  className="font-black text-lg bg-white border-blue-300 text-blue-700 text-center" 
                  placeholder="$ 0"
                />
              </View>
              {(() => {
                const esperado = (resumenData.resumen.totalTransferencia || 0) + (resumenData.resumen.totalNequi || 0);
                const contado = Number(transferenciasContadas) || 0;
                const diff = contado - esperado;
                if (!transferenciasContadas) return null;
                return (
                  <View className={`mt-3 p-3 rounded-lg flex-row justify-between items-center ${diff === 0 ? 'bg-green-50' : diff < 0 ? 'bg-red-50' : 'bg-orange-50'}`}>
                    <Text className={`font-bold text-xs ${diff === 0 ? 'text-green-800' : diff < 0 ? 'text-red-800' : 'text-orange-800'}`}>Diferencia Transf.:</Text>
                    <Text className={`font-black text-sm ${diff === 0 ? 'text-green-700' : diff < 0 ? 'text-red-700' : 'text-orange-700'}`}>
                      {diff > 0 ? '+' : ''}{formatCurrency(diff)} {diff !== 0 && <Text>{diff > 0 ? '(Sobran)' : '(Faltan)'}</Text>}
                    </Text>
                  </View>
                );
              })()}
            </View>
          </View>

          {/* RESULTADO FINAL */}
          {(() => {
            const efectivoContado = Number(watch('efectivoDeCierre'));
            const transContadas = Number(transferenciasContadas);
            
            const hasAllInputs = watch('efectivoDeCierre') !== ('' as any) && watch('efectivoDeCierre') !== undefined && transferenciasContadas !== '';

            if (!hasAllInputs) {
              return (
                <View className="bg-gray-100 p-5 rounded-xl border border-gray-300 mb-4 items-center">
                  <Ionicons name="information-circle" size={32} color="#9ca3af" />
                  <Text className="text-gray-500 font-bold text-center mt-2">Completa todos los montos contados para ver el resultado del cuadre.</Text>
                </View>
              );
            }

            const diffEfectivo = efectivoContado - (Number(resumenData.resumen.efectivoApertura || 0) + Number(resumenData.resumen.totalEfectivo || 0));
            const diffTrans = transContadas - ((resumenData.resumen.totalTransferencia || 0) + (resumenData.resumen.totalNequi || 0));
            const totalDiff = diffEfectivo + diffTrans;

            const isCuadrada = totalDiff === 0 && diffEfectivo === 0 && diffTrans === 0;

            return (
              <View className={`p-5 rounded-xl border shadow-sm mb-4 ${isCuadrada ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'}`}>
                <View className="items-center mb-3">
                  <Ionicons name={isCuadrada ? 'checkmark-circle' : 'warning'} size={48} color={isCuadrada ? '#16a34a' : '#dc2626'} />
                  <Text className={`text-2xl font-black mt-2 tracking-tight uppercase ${isCuadrada ? 'text-green-700' : 'text-red-700'}`}>
                    {isCuadrada ? 'CAJA CUADRADA' : 'CAJA NO CUADRADA'}
                  </Text>
                </View>

                {!isCuadrada && (
                  <View className="bg-white/60 p-3 rounded-lg mt-2 mb-3">
                    <Text className="text-red-800 font-bold text-xs mb-2 uppercase text-center">Detalle de Diferencias</Text>
                    {diffEfectivo !== 0 && <Text className="text-red-700 text-xs text-center font-semibold">Efectivo: {diffEfectivo > 0 ? '+ ' : '- '}{formatCurrency(diffEfectivo)} {diffEfectivo > 0 ? '(SOBRA)' : '(FALTA)'}</Text>}
                    {diffTrans !== 0 && <Text className="text-red-700 text-xs text-center mt-1 font-semibold">Transferencias: {diffTrans > 0 ? '+ ' : '- '}{formatCurrency(diffTrans)} {diffTrans > 0 ? '(SOBRA)' : '(FALTA)'}</Text>}
                    
                    <View className="border-t border-red-200 mt-2 pt-2">
                      <Text className="text-red-900 font-black text-center text-sm">DIFERENCIA TOTAL: {totalDiff > 0 ? '+ ' : '- '}{formatCurrency(totalDiff)} {totalDiff > 0 ? '(SOBRANTE)' : '(FALTANTE)'}</Text>
                    </View>
                  </View>
                )}

                {!isCuadrada && isAdmin && !isReadOnly && (
                  <TouchableOpacity
                    className="bg-purple-600 py-3 rounded-xl items-center flex-row justify-center mb-4 shadow-sm shadow-purple-200"
                    onPress={handleAutoCuadreClick}
                  >
                    <Ionicons name="sparkles" size={18} color="#fff" />
                    <Text className="text-white font-bold ml-2 text-xs uppercase tracking-wide">Auto-Cuadre con IA</Text>
                  </TouchableOpacity>
                )}

                <View className="flex-row justify-between w-full">
                    <TouchableOpacity
                      className="flex-1 bg-white border border-gray-300 py-3 rounded-xl mr-2 items-center justify-center"
                      onPress={() => {
                        setValue('efectivoDeCierre', '' as any);
                        setTransferenciasContadas('');
                        Toast.show({ type: 'info', text1: 'Reiniciado', text2: 'Vuelve a ingresar los montos contados.' });
                      }}
                    >
                      <Text className="text-gray-700 font-bold text-xs uppercase text-center">Volver a contar</Text>
                    </TouchableOpacity>

                    {!isReadOnly && (
                      <TouchableOpacity
                          className={`flex-1 py-3 rounded-xl ml-2 items-center justify-center ${isCuadrada ? '' : 'bg-red-600'}`}
                          style={isCuadrada ? { backgroundColor: primaryColor || '#16a34a' } : {}}
                          onPress={() => {
                            const currentObs = watch('observaciones') || '';
                            const timestampArqueo = horaCongelada 
                              ? `Corte: ${new Date(horaCongelada).toLocaleString('es-CO')}`
                              : `${new Date().toLocaleString('es-CO')}`;
                              
                            const cuadreText = `\n\n--- ARQUEO PARCIAL [${timestampArqueo}] ---\n` +
                              `Reportado: ${formatCurrency(efectivoContado)} Efectivo | ${formatCurrency(transContadas)} Transferencias\n` +
                              `Diferencias: ${formatCurrency(diffEfectivo)} Efectivo | ${formatCurrency(diffTrans)} Transferencias\n`;
                              
                            setValue('observaciones', currentObs + cuadreText, { shouldDirty: true });

                            handleSubmit((data) => {
                              // Asegurarse de que onSave reciba las observaciones actualizadas
                              data.observaciones = currentObs + cuadreText;
                              onSave(data, false);
                            }, onError)();
                          }}
                      >
                        <Text className="text-white font-bold text-[10px] uppercase text-center leading-tight">Confirmar Arqueo Parcial</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  {!isReadOnly && !isNew && canCloseCaja && !(resumenData?.caja?.cierre?.toLowerCase() === 'cerrada' || resumenData?.caja?.apertura?.toLowerCase() === 'cerrada') && (
                    <TouchableOpacity 
                      className="bg-red-600 py-4 rounded-xl mt-4 items-center shadow-sm shadow-red-200"
                      onPress={() => {
                        showAlert({
                          type: 'confirm',
                          title: 'Cierre Definitivo de Caja',
                          message: '¿Estás seguro de cerrar la caja definitivamente? Ya no podrás agregar más arqueos parciales ni editarla.',
                          confirmText: 'Sí, Cerrar Caja',
                          onConfirm: () => {
                            const currentObs = watch('observaciones') || '';
                            
                            let insumosInfoCierre = '';
                            if (resumenData?.insumos && resumenData.insumos.length > 0) {
                              const insumosDescuadrados = resumenData.insumos.filter((ins: any) => ins.diferencia !== 0);
                              if (insumosDescuadrados.length > 0) {
                                insumosInfoCierre = '\nINSUMOS DESCUADRADOS:\n' + insumosDescuadrados.map((ins: any) => 
                                  `- ${ins.nombreReal || ins.nombreInsumo}: ${ins.diferencia > 0 ? '+' : ''}${ins.diferencia} ${ins.diferencia < 0 ? '(Faltan)' : '(Sobran)'}`
                                ).join('\n');
                              } else {
                                insumosInfoCierre = '\nINSUMOS: Todos cuadrados perfectamente.';
                              }
                            }

                            const timestampArqueo = horaCongelada 
                              ? `Corte: ${new Date(horaCongelada).toLocaleString('es-CO')}`
                              : `${new Date().toLocaleString('es-CO')}`;
                            
                            let rangoInfo = '';
                            if (resumenData?.rangoPedidos) {
                              rangoInfo = `\nRango: Pedido #${resumenData.rangoPedidos.primerPedido} al #${resumenData.rangoPedidos.ultimoPedido} (${resumenData.rangoPedidos.totalVentas} ventas procesadas)`;
                            }

                            const cuadreText = `\n\n--- CIERRE DEFINITIVO [${timestampArqueo}] ---\n` +
                              `Reportado: ${formatCurrency(efectivoContado)} Efectivo | ${formatCurrency(transContadas)} Transferencias\n` +
                              `Sistema: ${formatCurrency(Number(resumenData?.resumen?.efectivoApertura || 0) + Number(resumenData?.resumen?.totalEfectivo || 0))} Efectivo | ${formatCurrency((resumenData?.resumen?.totalTransferencia || 0) + (resumenData?.resumen?.totalNequi || 0))} Transferencias\n` +
                              `Diferencia: ${totalDiff > 0 ? '+' : ''}${formatCurrency(totalDiff)}\n` +
                              `Estado: ${isCuadrada ? 'CUADRADA' : 'DESCUADRADA'}${rangoInfo}${insumosInfoCierre}\n------------------------\n`;

                            const newObs = currentObs + cuadreText;
                            setValue('observaciones', newObs, { shouldDirty: true });
                            handleSubmit((data) => {
                               data.observaciones = newObs;
                               onSave(data, true);
                            }, onError)();
                          },
                          onCancel: () => {},
                        });
                      }}
                    >
                      <Text className="text-white font-black text-sm uppercase tracking-widest">🔒 CIERRE DEFINITIVO DE CAJA</Text>
                    </TouchableOpacity>
                  )}



                </View>
            );
          })()}
        </View>
      )}

      {activeTab === 'analysis' && resumenData && (
          <View className="bg-white p-4 rounded-xl shadow-sm mb-10 border border-gray-200">
            {horaCongelada && (
              <View className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-4 shadow-sm">
                <Text className="text-blue-800 font-bold text-sm mb-1">
                  ❄️ Arqueo Congelado a las {formatTime12h(horaCongelada)}
                </Text>
                <Text className="text-blue-600 text-xs mb-3">
                  {resumenData.rangoPedidos 
                    ? `Incluye desde el Pedido #${resumenData.rangoPedidos.primerPedido} hasta el #${resumenData.rangoPedidos.ultimoPedido} (${resumenData.rangoPedidos.totalVentas} ventas procesadas).`
                    : 'Las ventas nuevas no se sumarán a este arqueo.'}
                </Text>
                <TouchableOpacity
                    className="bg-blue-600 py-2 rounded-lg items-center"
                    onPress={() => {
                      setIsFreezeModalVisible(true);
                    }}
                  >
                    <Text className="text-white font-bold text-xs uppercase tracking-wide">Gestionar Congelamiento</Text>
                  </TouchableOpacity>
                </View>
              )}

            {/* Prominent Date Display */}
          <View className="items-center mb-6 bg-gray-50 py-4 rounded-xl border border-gray-200 shadow-sm">
            <Text className="text-gray-500 text-xs font-bold uppercase mb-1 tracking-widest">Fecha del Análisis</Text>
            <View className="flex-row items-center">
              <Ionicons name="calendar-outline" size={24} color="#111827" style={{ marginRight: 8 }} />
              <Text className="text-gray-900 text-2xl font-black tracking-tight">
                {formatDateToDDMMAAAA(formatDateToLocalYYYYMMDD(resumenData.caja.fechaDeApertura || ''))}
              </Text>
            </View>
            <Text className="text-gray-400 text-[10px] mt-1">
              Apertura: {formatTime12h(resumenData.caja.horaDeApertura)} {resumenData.caja.horaDeCierre ? ` - Cierre: ${formatTime12h(resumenData.caja.horaDeCierre)}` : ' - En curso'}
            </Text>
          </View>

          <Text className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Resumen Financiero</Text>
          
          <View className="flex-row justify-between mb-4">
            <View className="flex-1 bg-green-50 p-4 rounded-xl mr-2 border border-green-200 shadow-sm">
              <Text className="text-green-800 text-[10px] font-bold uppercase mb-1">Efectivo Físico Cierre</Text>
              <Text className="text-green-700 text-xl font-black tracking-tight">{formatCurrency(resumenData.resumen.efectivoCierre || 0)}</Text>
            </View>
            <View className="flex-1 bg-blue-50 p-4 rounded-xl ml-2 border border-blue-200 shadow-sm">
              <Text className="text-blue-800 text-[10px] font-bold uppercase mb-1">Transferencias / Tarjetas</Text>
              <Text className="text-blue-700 text-xl font-black tracking-tight">{formatCurrency(resumenData.resumen.totalTransferencia || 0)}</Text>
            </View>
          </View>

          <View className="flex-row justify-between mb-4">
            <View className="flex-1 bg-gray-50 p-4 rounded-xl mr-2 border border-gray-200 shadow-sm">
              <Text className="text-gray-600 text-[10px] font-bold uppercase mb-1">Plante Inicial</Text>
              <Text className="text-gray-900 text-lg font-bold tracking-tight">{formatCurrency(resumenData.resumen.efectivoApertura || 0)}</Text>
            </View>
            <View className="flex-1 bg-gray-50 p-4 rounded-xl ml-2 border border-gray-200 shadow-sm">
              <Text className="text-gray-600 text-[10px] font-bold uppercase mb-1">Ventas en Efectivo</Text>
              <Text className="text-gray-900 text-lg font-bold tracking-tight">{formatCurrency(resumenData.resumen.totalEfectivo || 0)}</Text>
            </View>
          </View>

          {/* Tarjeta y Efectivo Repartido (Adicionales) */}
          <View className="flex-row justify-between mb-4">
            <View className="flex-1 bg-indigo-50 p-4 rounded-xl mr-2 border border-indigo-200 shadow-sm">
              <Text className="text-indigo-800 text-[10px] font-bold uppercase mb-1">Ventas con Tarjeta</Text>
              <Text className="text-indigo-700 text-xl font-black tracking-tight">{formatCurrency(resumenData.resumen.totalTarjeta || 0)}</Text>
            </View>
            <View className="flex-1 bg-orange-50 p-4 rounded-xl ml-2 border border-orange-200 shadow-sm">
              <Text className="text-orange-800 text-[10px] font-bold uppercase mb-1">Efectivo Repartido</Text>
              <Text className="text-orange-700 text-xl font-black tracking-tight">{formatCurrency(resumenData.resumen.efectivoRepartido || 0)}</Text>
            </View>
          </View>

          {/* Transferencias Repartidas y Ordenes */}
          <View className="flex-row justify-between mb-4">
            <View className="flex-1 bg-amber-50 p-4 rounded-xl mr-2 border border-amber-200 shadow-sm">
              <Text className="text-amber-800 text-[10px] font-bold uppercase mb-1">Transf. Repartidas</Text>
              <Text className="text-amber-700 text-xl font-black tracking-tight">{formatCurrency(resumenData.resumen.transferenciasRepartidas || 0)}</Text>
            </View>
            <View className="flex-1 bg-teal-50 p-4 rounded-xl ml-2 border border-teal-200 shadow-sm">
              <Text className="text-teal-800 text-[10px] font-bold uppercase mb-1">Órdenes Repartidas</Text>
              <Text className="text-teal-700 text-xl font-black tracking-tight">{resumenData.resumen.numeroOrdenesRepartidas || 0}</Text>
            </View>
          </View>

          <View className="bg-purple-50 p-5 rounded-xl mb-2 border border-purple-200 shadow-sm flex-row justify-between items-center">
            <Text className="text-purple-900 font-black uppercase tracking-wider text-xs">Total Ventas Sistema</Text>
            <Text className="text-purple-700 text-2xl font-black tracking-tight">{formatCurrency(resumenData.resumen.totalVentas || 0)}</Text>
          </View>

          <View className="bg-emerald-50 p-5 rounded-xl mb-4 border border-emerald-200 shadow-sm flex-row justify-between items-center">
            <Text className="text-emerald-900 font-black uppercase tracking-wider text-xs">Total Efectivo Sistema</Text>
            <Text className="text-emerald-700 text-2xl font-black tracking-tight">{formatCurrency((resumenData.resumen.totalVentas || 0) - ((resumenData.resumen.totalTransferencia || 0) + (resumenData.resumen.totalNequi || 0)))}</Text>
          </View>

          {/* INSUMOS FÍSICOS - TABLA */}
          {resumenData.insumos && resumenData.insumos.length > 0 && (
            <View className="mt-4 mb-4">
              <Text className="text-lg font-bold text-gray-800 mb-3 border-b border-gray-100 pb-2">Control de Insumos Físicos</Text>
              <View className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <View className="flex-row bg-gray-100 border-b border-gray-200 p-3">
                  <Text className="flex-[2] text-[10px] font-bold text-gray-600 uppercase">Insumo / Productos</Text>
                  <Text className="flex-1 text-[10px] font-bold text-gray-600 uppercase text-center">Físico</Text>
                  <Text className="flex-1 text-[10px] font-bold text-gray-600 uppercase text-center">Sist.</Text>
                  <Text className="flex-1 text-[10px] font-bold text-gray-600 uppercase text-right">Dif.</Text>
                </View>
                {resumenData.insumos.map((ins: any, index: number) => {
                  // productosAsociados from backend (new) or fallback to nombreProductoReal
                  const productosAsociados: { id: string; nombre: string }[] = ins.productosAsociados || [];
                  const displayProductos = productosAsociados.length > 0
                    ? productosAsociados.map((p: any) => p.nombre).join(', ')
                    : (ins.nombreProductoReal || 'Sin productos');

                  return (
                    <View key={index} className={`border-b border-gray-100 ${ins.diferencia === 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                      <View className="flex-row p-3">
                        <View className="flex-[2]">
                          <Text className="text-xs font-bold text-gray-800">{ins.nombreReal || ins.nombreInsumo}</Text>
                          {/* Show each product as a small chip */}
                          <View className="flex-row flex-wrap gap-1 mt-1">
                            {productosAsociados.length > 0 ? productosAsociados.map((p: any, pi: number) => (
                              <View key={pi} className="bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                                <Text className="text-[9px] text-blue-700 font-semibold">{p.nombre}</Text>
                              </View>
                            )) : (
                              <Text className="text-[10px] text-gray-400">{ins.nombreProductoReal || 'Sin filtro'}</Text>
                            )}
                          </View>
                        </View>
                        <Text className="flex-1 text-xs font-bold text-gray-700 text-center self-center">{ins.seUtilizaron || 0}</Text>
                        <Text className="flex-1 text-xs font-bold text-gray-700 text-center self-center">{ins.ventasEnSistema || 0}</Text>
                        <Text className={`flex-1 text-xs font-bold text-right self-center ${ins.diferencia === 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {ins.diferencia > 0 ? '+' : ''}{ins.diferencia}
                        </Text>
                      </View>
                      {/* Detail: ventas by product */}
                      {ins.ventasPorProducto && Object.keys(ins.ventasPorProducto).length > 0 && (
                        <View className="px-3 pb-2 border-t border-gray-100 bg-gray-50">
                          <Text className="text-[9px] text-gray-500 font-semibold mb-1 mt-1">DETALLE POR PLATO:</Text>
                          {Object.entries(ins.ventasPorProducto).map(([prod, cant]: [string, any], vi: number) => (
                            <Text key={vi} className="text-[9px] text-gray-600">  • {prod}: <Text className="font-bold">{cant}</Text> uds.</Text>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* VENTAS POR CATEGORÍA */}
          {resumenData.ventasPorCategoria && resumenData.ventasPorCategoria.length > 0 && (
            <View className="mt-2 mb-4">
              <Text className="text-lg font-bold text-gray-800 mb-3 border-b border-gray-100 pb-2">Ventas por Categoría</Text>
              {resumenData.ventasPorCategoria.map((cat: any, ci: number) => (
                <View key={ci} className="bg-white rounded-xl border border-gray-200 shadow-sm mb-3 overflow-hidden">
                  <View className="flex-row items-center justify-between bg-indigo-50 border-b border-indigo-100 px-3 py-2">
                    <Text className="text-sm font-bold text-indigo-800">{cat.categoria}</Text>
                    <View className="flex-row gap-3">
                      <Text className="text-[10px] text-indigo-600 font-bold">{cat.totalUnidades} uds.</Text>
                      <Text className="text-[10px] text-indigo-600 font-bold">{formatCurrency(cat.totalIngresos)}</Text>
                    </View>
                  </View>
                  {cat.productos.map((prod: any, pi: number) => {
                    const insumo = resumenData.insumos?.find((ins: any) => 
                      (ins.productosAsociados && ins.productosAsociados.includes(prod.productoId)) ||
                      (ins.nombreProductoReal && ins.nombreProductoReal.includes(prod.nombre)) ||
                      (ins.nombreInsumoReal && ins.nombreInsumoReal.includes(prod.nombre))
                    );
                    const diff = insumo?.diferencia || 0;
                    const isExpanded = expandedProduct === prod.nombre;

                    return (
                      <View key={pi} className="border-b border-gray-50">
                        <TouchableOpacity 
                          onPress={() => setExpandedProduct(isExpanded ? null : prod.nombre)}
                          className="flex-row items-center justify-between px-4 py-1.5"
                        >
                          <Text className="text-xs text-gray-700 flex-1" numberOfLines={1}>
                            {prod.nombre}
                          </Text>
                          <View className="flex-row items-center gap-2">
                            {diff !== 0 && (
                              <View className={`px-2 py-0.5 rounded-md ${diff > 0 ? 'bg-orange-100' : 'bg-red-100'}`}>
                                <Text className={`text-[10px] font-bold ${diff > 0 ? 'text-orange-700' : 'text-red-700'}`}>
                                  {diff > 0 ? `Faltan ${diff}` : `Exceso ${Math.abs(diff)}`}
                                </Text>
                              </View>
                            )}
                            <View className="bg-indigo-100 rounded-full px-2 py-0.5">
                              <Text className="text-[10px] font-bold text-indigo-700">{prod.cantidad}</Text>
                            </View>
                            <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color="#6b7280" />
                          </View>
                        </TouchableOpacity>

                        {isExpanded && (
                          <View className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex-row justify-end">
                            {diff > 0 ? (
                              <TouchableOpacity 
                                className="bg-blue-600 px-3 py-1.5 rounded-lg flex-row items-center"
                                onPress={() => {
                                  navigation.navigate('Sales' as never, { 
                                    prefillProduct: prod.nombre,
                                    prefillQuantity: diff 
                                  } as never);
                                }}
                              >
                                <Ionicons name="add-circle" size={16} color="white" className="mr-1" />
                                <Text className="text-white text-xs font-bold ml-1">Agregar Venta (+{diff})</Text>
                              </TouchableOpacity>
                            ) : diff < 0 ? (
                              <TouchableOpacity 
                                className="bg-red-500 px-3 py-1.5 rounded-lg flex-row items-center"
                                onPress={() => handleOpenCuadreModal(prod, diff)}
                              >
                                <Ionicons name="search" size={16} color="white" className="mr-1" />
                                <Text className="text-white text-xs font-bold ml-1">Ver Ventas para Quitar</Text>
                              </TouchableOpacity>
                            ) : (
                              <Text className="text-xs text-green-600 font-bold">Cuadre exacto (No hay acciones)</Text>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          {/* NUEVA SECCIÓN: ANÁLISIS DE NOTAS Y MODIFICADORES */}
          {resumenData?.notasAnalysis && resumenData.notasAnalysis.length > 0 && (
            <View className="bg-white rounded-2xl p-5 mb-4 shadow-sm border border-gray-100 mt-2">
              <Text className="text-lg font-bold text-gray-800 mb-3 border-b border-gray-100 pb-2">Análisis de Notas y Modificadores</Text>
              
              {/* SUMMARY */}
              {(() => {
                const summaryMap: Record<string, number> = {};
                resumenData.notasAnalysis.forEach((nota: any) => {
                  nota.productosConNotas?.forEach((prod: any) => {
                    prod.notas?.forEach((n: any) => {
                      const name = n.name || n.nombre || n.Nombre;
                      const qty = Number(n.cantidad) || 1;
                      const price = Number(n.price || n.precio || n.Precio) || 0;
                      const key = `${name}${price > 0 ? ` (+$${price})` : ''}`;
                      summaryMap[key] = (summaryMap[key] || 0) + qty;
                    });
                  });
                });
                const summaryItems = Object.entries(summaryMap).sort((a, b) => b[1] - a[1]);
                if (summaryItems.length > 0) {
                  return (
                    <View className="bg-orange-50 p-3 rounded-xl mb-4 border border-orange-100">
                      <Text className="text-orange-800 font-bold text-sm mb-2">Resumen Total de Modificadores</Text>
                      {summaryItems.map(([key, count], idx) => (
                        <Text key={idx} className="text-orange-700 text-xs font-medium">
                          • {count}x {key}
                        </Text>
                      ))}
                    </View>
                  );
                }
                return null;
              })()}

              <View className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                <View className="flex-row p-3 bg-[#fcfcfc] border-b border-gray-200">
                  <Text className="w-16 text-[10px] font-bold text-orange-800 uppercase tracking-wider">Hora</Text>
                  <Text className="flex-1 text-[10px] font-bold text-orange-800 uppercase tracking-wider ml-1">Pedido / Notas</Text>
                </View>
                {resumenData.notasAnalysis.map((nota: any, index: number) => (
                  <View key={index} className={`flex-row p-3 border-b border-gray-100 bg-white justify-between items-center`}>
                    <View className="flex-row flex-1 mr-2">
                      <Text className="w-16 text-xs font-bold text-gray-700">{formatTime12h(nota.hora) || '-'}</Text>
                      <View className="flex-1">
                        <View className="flex-row items-center mb-1">
                          <Ionicons name="receipt-outline" size={14} color="#6b7280" />
                          <Text className="text-xs font-bold text-gray-800 ml-1">{nota.pedido}</Text>
                        </View>
                        {nota.productosConNotas?.map((prod: any, pIdx: number) => (
                          <View key={pIdx} className="mb-2 ml-1">
                            <Text className="text-xs font-bold text-gray-700">{prod.cantidad}x {prod.producto}</Text>
                            {prod.notas?.map((n: any, nIdx: number) => (
                              <Text key={nIdx} className="text-[11px] text-gray-600 ml-2 mt-0.5">
                                • {n.cantidad || 1}x {n.name || n.nombre || n.Nombre}
                                {(n.price || n.precio || n.Precio) > 0 && (
                                  <Text className="text-[10px] text-amber-600 font-bold">
                                    {` (+${formatCurrency(n.price || n.precio || n.Precio)})`}
                                  </Text>
                                )}
                              </Text>
                            ))}
                          </View>
                        ))}
                        {nota.cliente && (
                          <View className="flex-row items-center ml-1 mb-1 mt-1 bg-indigo-50 px-2 py-1 rounded-md self-start border border-indigo-100">
                            <Ionicons name="person" size={12} color="#4f46e5" />
                            <Text className="text-[11px] font-bold text-indigo-700 ml-1">
                              {nota.cliente.nombre}
                            </Text>
                          </View>
                        )}
                        {nota.descuento > 0 && (
                          <View className="flex-row items-center ml-1 mb-1 bg-orange-50 px-2 py-1 rounded-md self-start border border-orange-200">
                            <Ionicons name="pricetag" size={12} color="#ea580c" />
                            <Text className="text-[11px] font-bold text-orange-700 ml-1">
                              Descuento: -{formatCurrency(nota.descuento)} {nota.porcentajeDeDescuento ? `(${nota.porcentajeDeDescuento}%)` : ''}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    
                    {nota.ventaId && (
                      <TouchableOpacity 
                        onPress={() => handleEditSale(nota.ventaId)}
                        disabled={fetchingSaleId === nota.ventaId}
                        className="p-2 justify-center items-center self-center"
                      >
                        {fetchingSaleId === nota.ventaId ? (
                          <ActivityIndicator size="small" color="#4f46e5" />
                        ) : (
                          <Ionicons name="chevron-forward" size={20} color="#4f46e5" />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          
          <TouchableOpacity onPress={handlePrintPDF} className="bg-[#16a34a] p-4 rounded-xl mt-6 flex-row justify-center items-center shadow-md active:bg-[#15803d]">
            <Ionicons name="share-social" size={22} color="#fff" />
            <Text className="text-white font-bold text-lg ml-2 tracking-wide">Compartir Reporte PDF</Text>
          </TouchableOpacity>
        </View>
      )}

        </KeyboardAwareScrollView>

      {/* MODAL AGREGAR INSUMOS */}
      <Modal visible={modalInsumosVisible} transparent animationType="slide" onRequestClose={() => setModalInsumosVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1, justifyContent: 'flex-end' }}
          >
            <View style={{ height: '90%', backgroundColor: '#F8FAFC', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', paddingBottom: Platform.OS === 'android' ? keyboardHeight : 0 }}>
              <View className="flex-row items-center justify-between p-4 bg-white border-b border-gray-200 mt-safe">
                <Text className="text-lg font-bold text-gray-900">Seleccionar Insumo</Text>
                <TouchableOpacity onPress={() => setModalInsumosVisible(false)} className="p-2">
                  <Ionicons name="close" size={24} color="#374151" />
                </TouchableOpacity>
              </View>
              <View className="p-4 bg-white border-b border-gray-100">
                <View className="flex-row items-center bg-gray-100 rounded-lg px-3 py-2">
                  <Ionicons name="search" size={20} color="#9ca3af" />
                  <TextInput
                    value={searchInsumo}
                    onChangeText={setSearchInsumo}
                    placeholder="Buscar insumo o categoría..."
                    className="flex-1 ml-2 text-base text-gray-900"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <FlashList
                  data={filteredInsumos as any[]}
                  estimatedItemSize={70}
                  keyExtractor={(item: any) => item.IDalimentos}
                  renderItem={({ item }: { item: InsumoItem }) => (
                    <TouchableOpacity 
                      onPress={() => {
                        handleAddInsumo(item);
                        setModalInsumosVisible(false);
                      }}
                      className="flex-row items-center p-4 bg-white border-b border-gray-100"
                    >
                      {item.imageUrl || item.imagen ? (
                        <Image source={{ uri: item.imageUrl || item.imagen }} className="w-10 h-10 rounded bg-gray-200 mr-3" />
                      ) : (
                        <View className="w-10 h-10 rounded bg-gray-200 mr-3 items-center justify-center">
                          <Ionicons name="cube" size={20} color="#9ca3af" />
                        </View>
                      )}
                      <View className="flex-1">
                        <Text className="font-semibold text-gray-800">{item.Nombre || item.nombre}</Text>
                        <Text className="text-xs text-gray-500">{item.Categoria || item.categoria || 'Sin categoría'}</Text>
                      </View>
                      <Ionicons name="add-circle" size={24} color="#22c55e" />
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* MODAL SELECCIONAR PRODUCTO */}
      <Modal visible={modalProductosVisible} transparent animationType="slide" onRequestClose={() => { setModalProductosVisible(false); setSelectedIndexForProduct(null); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1, justifyContent: 'flex-end' }}
          >
            <View style={{ height: '90%', backgroundColor: '#F8FAFC', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', paddingBottom: Platform.OS === 'android' ? keyboardHeight : 0 }}>
              <View className="flex-row items-center justify-between p-4 bg-white border-b border-gray-200 mt-safe">
                <View>
                  <Text className="text-lg font-bold text-gray-900">Seleccionar Productos</Text>
                  <Text className="text-xs text-gray-500">Toca para seleccionar/deseleccionar. Varios permitidos.</Text>
                </View>
                <TouchableOpacity onPress={() => {
                  setModalProductosVisible(false);
                  setSelectedIndexForProduct(null);
                }} className="px-4 py-2 rounded-lg" style={{ backgroundColor: primaryColor || '#16a34a' }}>
                  <Text className="text-white font-bold text-sm">Listo</Text>
                </TouchableOpacity>
              </View>
              <View className="p-4 bg-white border-b border-gray-100">
                <View className="flex-row items-center bg-gray-100 rounded-lg px-3 py-2">
                  <Ionicons name="search" size={20} color="#9ca3af" />
                  <TextInput
                    value={searchProducto}
                    onChangeText={setSearchProducto}
                    placeholder="Buscar producto..."
                    className="flex-1 ml-2 text-base text-gray-900"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <FlashList
                  data={filteredProductos as any[]}
                  estimatedItemSize={70}
                  keyExtractor={(item: any) => item.IDproductos || Math.random().toString()}
                  renderItem={({ item }: { item: any }) => {
                    const currentField = selectedIndexForProduct !== null ? (fields[selectedIndexForProduct] as any) : null;
                    const selectedIds: string[] = currentField
                      ? (Array.isArray(currentField.paraQueProducto) ? currentField.paraQueProducto : (currentField.paraQueProducto ? [currentField.paraQueProducto] : []))
                      : [];
                    const isSelected = selectedIds.includes(item.IDproductos);
                    return (
                      <TouchableOpacity 
                        onPress={() => handleSelectProducto(item)}
                        className={`flex-row items-center p-4 border-b border-gray-100 ${isSelected ? 'bg-green-50' : 'bg-white'}`}
                      >
                        {item.imagen || item.imageUrl ? (
                          <Image source={{ uri: item.imagen || item.imageUrl }} className="w-10 h-10 rounded bg-gray-200 mr-3" />
                        ) : (
                          <View className="w-10 h-10 rounded bg-gray-200 mr-3 items-center justify-center">
                            <Ionicons name="fast-food" size={20} color="#9ca3af" />
                          </View>
                        )}
                        <View className="flex-1">
                          <Text className={`font-semibold ${isSelected ? 'text-green-700' : 'text-gray-800'}`}>{item.nombre || item.Nombre}</Text>
                          <Text className="text-xs text-gray-500">{item.categoria || item.Categoria || 'Sin categoría'}</Text>
                        </View>
                        {isSelected
                          ? <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
                          : <Ionicons name="add-circle-outline" size={24} color="#9ca3af" />}
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={guardarModalVisible} transparent animationType="fade">
        <View className="flex-1 justify-center items-center bg-black/60 px-4">
          <View className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <Text className="text-lg font-bold text-gray-900 mb-2 text-center">Opciones de Guardado</Text>
            <Text className="text-sm text-gray-500 mb-6 text-center">¿Qué deseas hacer con los cambios en esta caja?</Text>
            
            <View className="space-y-3 gap-y-3">
              <TouchableOpacity 
                className="bg-blue-600 py-3.5 rounded-xl items-center shadow-sm"
                onPress={() => {
                  setGuardarModalVisible(false);
                  (handleSubmit as any)(async (data: any) => {
                    await onSave(data, false);
                    if (pendingNavigationAction) {
                      allowNavigation.current = true;
                      navigation.dispatch(pendingNavigationAction);
                    } else if (pendingTabChange) {
                      const nextTab = pendingTabChange;
                      setPendingTabChange(null);
                      const isCerrada = resumenData?.caja?.cierre?.toLowerCase() === 'cerrada';
                      if ((nextTab === 'cuadre' || nextTab === 'analysis') && !isNew && !verificacionCompletada && !isCerrada) {
                        setPendingTab(nextTab);
                        setVerifyModalVisible(true);
                      } else {
                        setActiveTab(nextTab);
                      }
                    }
                  }, onError)();
                }}
              >
                <Text className="text-white font-bold">Solo Actualizar Datos</Text>
              </TouchableOpacity>
              
              {!(resumenData?.caja?.cierre?.toLowerCase() === 'cerrada' || resumenData?.caja?.apertura?.toLowerCase() === 'cerrada') && (
              <TouchableOpacity 
                className="bg-red-600 py-3.5 rounded-xl items-center mt-2 shadow-sm"
                onPress={() => {
                  setGuardarModalVisible(false);
                  (handleSubmit as any)(async (data: any) => {
                    await onSave(data, true);
                    if (pendingNavigationAction) {
                      allowNavigation.current = true;
                      navigation.dispatch(pendingNavigationAction);
                    } else if (pendingTabChange) {
                      const nextTab = pendingTabChange;
                      setPendingTabChange(null);
                      const isCerrada = resumenData?.caja?.cierre?.toLowerCase() === 'cerrada';
                      if ((nextTab === 'cuadre' || nextTab === 'analysis') && !isNew && !verificacionCompletada && !isCerrada) {
                        setPendingTab(nextTab);
                        setVerifyModalVisible(true);
                      } else {
                        setActiveTab(nextTab);
                      }
                    }
                  }, onError)();
                }}
              >
                <Text className="text-white font-bold">Cierre Definitivo de Caja</Text>
              </TouchableOpacity>
              )}

              {resumenData?.caja?.cierre === 'cerrada' && isAdmin && (
                <TouchableOpacity 
                  className="py-3.5 rounded-xl items-center mt-2 shadow-sm"
                  style={{ backgroundColor: primaryColor || '#16a34a' }}
                  onPress={async () => {
                    setGuardarModalVisible(false);
                    setSaving(true);
                    try {
                      await reabrirCaja(cajaId);
                      Toast.show({ type: 'success', text1: 'Caja Reabierta', text2: 'La caja está nuevamente en curso' });
                      navigation.goBack();
                    } catch (err: any) {
                      Toast.show({ type: 'error', text1: 'Error', text2: err?.response?.data?.message || err?.message || 'No se pudo reabrir la caja' });
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <Text className="text-white font-bold">Reabrir Caja (Admin)</Text>
                </TouchableOpacity>
              )}

              {pendingNavigationAction && (
                <TouchableOpacity 
                  className="bg-red-100 py-3.5 rounded-xl items-center mt-2"
                  onPress={() => {
                    setGuardarModalVisible(false);
                    allowNavigation.current = true;
                    navigation.dispatch(pendingNavigationAction);
                  }}
                >
                  <Text className="text-red-700 font-bold">Salir sin Guardar</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                className="bg-gray-200 py-3.5 rounded-xl items-center mt-2"
                onPress={() => {
                  setGuardarModalVisible(false);
                  setPendingNavigationAction(null);
                  setPendingTabChange(null);
                }}
              >
                <Text className="text-gray-700 font-bold">Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

        <VerifyInsumosModal
          visible={verifyModalVisible}
          cajaId={cajaId || ''}
          onVerified={handleVerificationPassed}
          onPostponed={handleVerificationPassed}
          onCancel={handleVerificationCancelled}
        />

        {/* Add Quantity Modal */}
        <Modal
          visible={addQtyModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setAddQtyModalVisible(false)}
        >
          <View className="flex-1 bg-black/50 justify-center items-center px-4">
            <View className="bg-white rounded-2xl p-5 w-full max-w-sm">
              {addQtyIndex !== null && (() => {
                const insumoData = allInsumos.find((i: any) => i.IDalimentos === fields[addQtyIndex]?.nombreInsumo);
                const showTabs = Number(insumoData?.cantidadPorPaquete) > 0;

                return (
                  <>
                    {showTabs && (
                      <View className="flex-row bg-gray-100 rounded-lg p-1 mb-4">
                        <TouchableOpacity
                          className={`flex-1 p-2 rounded-md items-center ${addQtyMode === 'paquete' ? 'bg-white shadow-sm' : ''}`}
                          onPress={() => setAddQtyMode('paquete')}
                        >
                          <Text className={`font-semibold ${addQtyMode === 'paquete' ? 'text-blue-600' : 'text-gray-500'}`}>Abrir Paquete</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          className={`flex-1 p-2 rounded-md items-center ${addQtyMode === 'libre' ? 'bg-white shadow-sm' : ''}`}
                          onPress={() => setAddQtyMode('libre')}
                        >
                          <Text className={`font-semibold ${addQtyMode === 'libre' ? 'text-blue-600' : 'text-gray-500'}`}>Cant. Libre</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <Text className="text-lg font-bold text-gray-800 mb-2">
                      {addQtyMode === 'paquete' ? 'Abrir Paquete de Insumo' : 'Añadir Cantidad Libre'}
                    </Text>
                    <Text className="text-sm text-gray-500 mb-2">
                      {addQtyMode === 'paquete' 
                        ? 'Ingresa la cantidad real extraída del paquete para sumarla a la apertura.'
                        : 'Ingresa la cantidad manual a sumar a la apertura (no descuenta paquetes de bodega).'}
                    </Text>
                    
                    {addQtyMode === 'paquete' && (
                      <View className="flex-row justify-between mb-4">
                        <Text className="text-xs text-blue-600 font-semibold">
                          Teórico por paquete: {insumoData?.cantidadPorPaquete || 'N/A'}
                        </Text>
                        <Text className="text-xs text-blue-600 font-semibold">
                          Paquetes en bodega: {insumoData?.paquetesEnBodega || 0}
                        </Text>
                      </View>
                    )}
                    
                    <TextInput
                      className="bg-gray-50 border border-gray-300 rounded-lg p-3 text-lg text-center font-bold text-gray-900 mb-4"
                      keyboardType="numeric"
                      value={addQtyAmount}
                      onChangeText={setAddQtyAmount}
                      placeholder="Ej. 32"
                      autoFocus
                    />

                    {addQtyMode === 'paquete' && (
                      <View className="flex-row items-center justify-between bg-white p-3 rounded-lg border border-gray-200 mb-4">
                        <View className="flex-1 mr-3">
                          <Text className="text-gray-800 font-bold">Cuadrar con Stock Global</Text>
                          <Text className="text-gray-500 text-xs">Si se desactiva, solo se sumará a esta caja y no descontará paquetes ni modificará el stock principal del inventario.</Text>
                        </View>
                        <Switch
                          value={syncGlobalStock}
                          onValueChange={setSyncGlobalStock}
                          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                          thumbColor={syncGlobalStock ? '#2563eb' : '#f3f4f6'}
                        />
                      </View>
                    )}
                    
                    <View className="flex-row justify-end mt-2 space-x-3 gap-3">
                      <TouchableOpacity 
                        className="px-4 py-2 bg-gray-200 rounded-lg"
                        onPress={() => setAddQtyModalVisible(false)}
                        disabled={isSubmittingAdjustment}
                      >
                        <Text className="text-gray-700 font-bold">Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        className="px-4 py-2 bg-green-600 rounded-lg items-center justify-center min-w-[80px]"
                        disabled={isSubmittingAdjustment}
                        onPress={async () => {
                          if (addQtyIndex !== null && addQtyAmount && !isNaN(Number(addQtyAmount))) {
                            const amountToAdd = Number(addQtyAmount);
                            
                            if (addQtyMode === 'paquete') {
                              const insumoId = fields[addQtyIndex].nombreInsumo;
                              setIsSubmittingAdjustment(true);
                              try {
                                await api.post('/movimientos-insumos/abrir-paquete', {
                                  insumoId: insumoId,
                                  cajaId: cajaId,
                                  cantidadReal: amountToAdd,
                                  syncGlobalStock: syncGlobalStock
                                });
                                
                                const currentVal = Number(getValues(`insumos.${addQtyIndex}.cantApertura`)) || 0;
                                setValue(`insumos.${addQtyIndex}.cantApertura`, currentVal + amountToAdd, { shouldDirty: true });
                                setModifiedInsumoIndexes(prev => new Set(prev).add(addQtyIndex));
                                showAlert({ title: 'Éxito', message: 'Paquete abierto y stock sumado a la caja.', type: 'success' });
                                setAddQtyModalVisible(false);
                              } catch (error: any) {
                                const errorData = error.response?.data;
                                const backendMessage = errorData?.message;
                                const finalMsg = Array.isArray(backendMessage) ? backendMessage.join('\n') : (backendMessage || 'No se pudo registrar la apertura.');
                                showAlert({ title: 'Error', message: finalMsg, type: 'error' });
                              } finally {
                                setIsSubmittingAdjustment(false);
                              }
                            } else {
                              // Modo libre
                              const insumoId = fields[addQtyIndex].nombreInsumo;
                              setIsSubmittingAdjustment(true);
                              try {
                                await api.post('/movimientos-insumos/entrada-libre', {
                                  insumoId: insumoId,
                                  cajaId: cajaId,
                                  cantidadAgregada: amountToAdd
                                });

                                const currentVal = Number(getValues(`insumos.${addQtyIndex}.cantApertura`)) || 0;
                                setValue(`insumos.${addQtyIndex}.cantApertura`, currentVal + amountToAdd, { shouldDirty: true });
                                setModifiedInsumoIndexes(prev => new Set(prev).add(addQtyIndex));
                                showAlert({ title: 'Éxito', message: 'Entrada registrada y sumada al stock global.', type: 'success' });
                                setAddQtyModalVisible(false);
                              } catch (error: any) {
                                const errorData = error.response?.data;
                                const backendMessage = errorData?.message;
                                const finalMsg = Array.isArray(backendMessage) ? backendMessage.join('\n') : (backendMessage || 'No se pudo registrar la entrada.');
                                showAlert({ title: 'Error', message: finalMsg, type: 'error' });
                              } finally {
                                setIsSubmittingAdjustment(false);
                              }
                            }
                          }
                        }}
                      >
                        {isSubmittingAdjustment ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text className="text-white font-bold">{addQtyMode === 'paquete' ? 'Abrir Paquete' : 'Añadir'}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        </Modal>

        {/* Subtract Quantity Modal */}
        <Modal
          visible={subQtyModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSubQtyModalVisible(false)}
        >
          <View className="flex-1 bg-black/50 justify-center items-center px-4">
            <View className="bg-white rounded-2xl p-5 w-full max-w-sm">
              <Text className="text-lg font-bold text-gray-800 mb-2">Descuento de Producción</Text>
              <Text className="text-sm text-gray-500 mb-4">Se deducirá del stock general y de tu cantidad de apertura actual (ej. daño, consumo interno).</Text>
              
              <TextInput
                className="bg-gray-50 border border-gray-300 rounded-lg p-3 text-lg text-center font-bold text-gray-900 mb-3"
                keyboardType="numeric"
                value={subQtyAmount}
                onChangeText={setSubQtyAmount}
                placeholder="Cantidad (Ej. 5)"
                autoFocus
              />

              <TextInput
                className="bg-gray-50 border border-gray-300 rounded-lg p-3 text-sm text-gray-900 mb-4"
                value={subQtyReason}
                onChangeText={setSubQtyReason}
                placeholder="Motivo del descuento (Opcional)"
                multiline
              />
              
              <View className="flex-row justify-end space-x-3">
                <TouchableOpacity 
                  className="px-4 py-2 bg-gray-200 rounded-lg"
                  onPress={() => setSubQtyModalVisible(false)}
                  disabled={isSubmittingAdjustment}
                >
                  <Text className="text-gray-700 font-bold">Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  className="px-4 py-2 bg-red-600 rounded-lg items-center justify-center min-w-[80px]"
                  disabled={isSubmittingAdjustment}
                  onPress={async () => {
                    if (addQtyIndex !== null && subQtyAmount && !isNaN(Number(subQtyAmount))) {
                      const amountToSub = Number(subQtyAmount);
                      const insumoId = fields[addQtyIndex].nombreInsumo;
                      
                      setIsSubmittingAdjustment(true);
                      try {
                        await api.post('/movimientos-insumos/descuento-produccion', {
                          insumoId: insumoId,
                          cajaId: cajaId,
                          cantidadDescontada: amountToSub,
                          observacion: subQtyReason
                        });
                        
                        const currentVal = Number(getValues(`insumos.${addQtyIndex}.cantApertura`)) || 0;
                        const newVal = Math.max(0, currentVal - amountToSub);
                        setValue(`insumos.${addQtyIndex}.cantApertura`, newVal, { shouldDirty: true });
                        setModifiedInsumoIndexes(prev => new Set(prev).add(addQtyIndex));
                        showAlert({ title: 'Éxito', message: 'Consumo interno registrado y descontado del stock global.', type: 'success' });
                      } catch (error: any) {
                        showAlert({ title: 'Error', message: error.response?.data?.message || 'No se pudo descontar el insumo.', type: 'error' });
                      } finally {
                        setIsSubmittingAdjustment(false);
                      }
                    }
                    setSubQtyModalVisible(false);
                  }}
                >
                  {isSubmittingAdjustment ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="text-white font-bold">Descontar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* CUADRE MODAL (Scenario B) */}
        <Modal
          visible={cuadreModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCuadreModalVisible(false)}
        >
          <View className="flex-1 bg-black/60 justify-end">
            <View className="bg-white rounded-t-3xl h-[85%]">
              <View className="flex-row items-center justify-between p-5 border-b border-gray-100 mt-safe">
                <View>
                  <Text className="text-xl font-bold text-gray-900">Ajustar Ventas</Text>
                  <Text className="text-sm text-gray-500">
                    {cuadreProduct?.nombre} <Text className="text-red-500 font-bold">(Exceso de {Math.abs(cuadreDiff)})</Text>
                  </Text>
                </View>
                <TouchableOpacity 
                  onPress={() => setCuadreModalVisible(false)}
                  className="bg-gray-100 p-2 rounded-full"
                >
                  <Ionicons name="close" size={24} color="#374151" />
                </TouchableOpacity>
              </View>

              <ScrollView className="p-5" contentContainerStyle={{ paddingBottom: 100 }}>
                {isSearchingCuadre ? (
                  <View className="py-10 items-center justify-center">
                    <ActivityIndicator size="large" color="#4f46e5" />
                    <Text className="text-gray-500 mt-4">Buscando ventas...</Text>
                  </View>
                ) : cuadreOrders.length === 0 ? (
                  <View className="py-10 items-center justify-center">
                    <Text className="text-gray-500 mt-4">No se encontraron ventas para este producto en la fecha actual.</Text>
                  </View>
                ) : (
                  ['TRANSFERENCIA', 'EFECTIVO', 'COMENTARIOS'].map((grupoKey, gIdx) => {
                    const groupOrders = cuadreOrders.filter(v => {
                      const hasComment = v.ordenVentas?.some((ov: any) => 
                        (ov.nombre === cuadreProduct?.nombre || ov.nombreProducto === cuadreProduct?.nombre) && 
                        ov.comentarios && ov.comentarios.trim().length > 0
                      );
                      
                      if (grupoKey === 'COMENTARIOS') return hasComment;
                      if (grupoKey === 'TRANSFERENCIA') return !hasComment && v.medioDePago !== 'EFECTIVO';
                      if (grupoKey === 'EFECTIVO') return !hasComment && v.medioDePago === 'EFECTIVO';
                      return false;
                    });

                    if (groupOrders.length === 0) return null;

                    return (
                      <View key={gIdx} className="mb-6">
                        <Text className="text-sm font-bold text-gray-400 mb-3 ml-1 uppercase tracking-wider">
                          {grupoKey === 'COMENTARIOS' ? 'Con Comentarios / Modificadores' : grupoKey}
                        </Text>
                        
                        {groupOrders.map((venta, vIdx) => {
                          const orderVenta = venta.ordenVentas?.find((ov: any) => 
                            ov.nombre === cuadreProduct?.nombre || ov.nombreProducto === cuadreProduct?.nombre
                          );
                          if (!orderVenta) return null;
                          
                          return (
                            <View key={vIdx} className="bg-white border border-gray-200 rounded-xl mb-3 shadow-sm overflow-hidden">
                              <View className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex-row justify-between items-center">
                                <Text className="text-xs font-bold text-gray-600">Pedido #{venta.pedido?.split('-').pop()}</Text>
                                <Text className="text-xs text-gray-500">{new Date(venta.fechaYHora).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
                              </View>
                              
                              <View className="p-4 flex-row items-center justify-between">
                                <View className="flex-1 mr-4">
                                  <Text className="text-sm font-bold text-gray-800">{orderVenta.nombre}</Text>
                                  {orderVenta.comentarios && (
                                    <View className="bg-amber-50 self-start px-2 py-1 rounded mt-1 border border-amber-100">
                                      <Text className="text-xs text-amber-800">{orderVenta.comentarios}</Text>
                                    </View>
                                  )}
                                </View>
                                
                                <View className="flex-row items-center gap-2">
                                  <Text className="font-bold text-lg mr-2 text-indigo-700">x{orderVenta.cantidad}</Text>
                                  
                                  <TouchableOpacity 
                                    className="bg-orange-100 px-3 py-2 rounded-lg"
                                    onPress={() => handleUpdateProductInVenta(venta.IDventas, orderVenta.IDorderventas, orderVenta.cantidad - 1)}
                                  >
                                    <Text className="text-orange-700 font-bold text-xs">-1</Text>
                                  </TouchableOpacity>
                                  
                                  <TouchableOpacity 
                                    className="bg-red-100 px-3 py-2 rounded-lg"
                                    onPress={() => handleUpdateProductInVenta(venta.IDventas, orderVenta.IDorderventas, 0)}
                                  >
                                    <Text className="text-red-700 font-bold text-xs">Quitar</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <AdminSaleFormModal 
          visible={adminFormVisible}
          onClose={() => setAdminFormVisible(false)}
          onSuccess={() => {
            setAdminFormVisible(false);
            fetchResumenSilenciosamente();
          }}
          saleData={selectedVenta}
        />
    </View>
  );
}
