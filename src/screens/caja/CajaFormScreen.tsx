import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, ScrollView, ActivityIndicator, TouchableOpacity, Image, Modal, TextInput, KeyboardAvoidingView, Platform, Keyboard, Dimensions, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import Toast from 'react-native-toast-message';
import { FlashList } from '@shopify/flash-list';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { getConfiguracion } from '../../services/configuracion';

import { Text } from '../../components/ui/text';
import { Input } from '../../components/ui/input';
import useAuthStore from '../../store/useAuthStore';
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
import { cn } from '../../lib/utils';

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
  const d = new Date(isoString);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

export default function CajaFormScreen({ route, navigation }: any) {
  const { cajaId } = route.params || {};
  const isNew = !cajaId;
  const { user } = useAuthStore();
  const { canCreate, canEdit, canDelete } = usePermissions('caja');
  const { showAlert } = useCustomAlert();
  const isAdmin = user?.rol === 'Admin app' || user?.rol === 'Admin negocio';
  
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

  const [resumenData, setResumenData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'form' | 'analysis' | 'cuadre'>('form');
  const [horaCongelada, _setHoraCongelada] = useState<string | null>(null);

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
  const pendingSaveRef = useRef<{ data: any, isFinalClose: boolean } | null>(null);

  const handleTabChange = (tab: 'form' | 'analysis' | 'cuadre') => {
    if ((tab === 'cuadre' || tab === 'analysis') && !isNew && !verificacionCompletada) {
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
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [guardarModalVisible, setGuardarModalVisible] = useState(false);
  const [verificacionCompletada, setVerificacionCompletada] = useState(false);

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
  const [addQtyIndex, setAddQtyIndex] = useState<number | null>(null);
  const [addQtyAmount, setAddQtyAmount] = useState<string>('');
  
  const { control, handleSubmit, reset, watch, formState: { errors }, setValue, getValues } = useForm({
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

  const insumosActuales = watch('insumos');

  const { joinRoom } = useSocket();

  useEffect(() => {
    joinRoom('caja');
  }, [joinRoom]);

  useSocketEvent('refreshCaja', (data: any) => {
    if (data && data.action !== 'delete' && data.cajaId === cajaId) {
      Toast.show({ type: 'info', text1: 'Actualización', text2: 'Alguien modificó esta caja' });
      fetchResumenSilenciosamente();
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

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const [insumosRes, prodRes, configRes] = await Promise.all([
        insumosService.getAll({ limit: 1000 }),
        getProducts(),
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
            paraQueProducto: [] as string[],
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
            cantDeCierre: i.cantDeCierre || 0,
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
          observaciones: caja.observaciones || ''
        });
        
        // Explicitly replace the field array to prevent react-hook-form duplication bugs
        replace(mappedInsumos);
        
        // Recuperar el valor guardado de transferencias contadas si existe
        if (caja.transferenciasContadas != null) {
          setTransferenciasContadas(String(caja.transferenciasContadas));
        }
      }
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cargar la información' });
    } finally {
      setLoading(false);
    }
  }, [cajaId, isNew, reset, user]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const onSave = async (data: any, isFinalClose: boolean = false) => {
    setSaving(true);
    try {
      const cleanData = { ...data };
      if (!isNew) {
        delete cleanData.fechaDeApertura;
        delete cleanData.horaDeApertura;
      }
      if (!cleanData.fechaDeCierre) delete cleanData.fechaDeCierre;
      if (!cleanData.horaDeCierre) delete cleanData.horaDeCierre;
      if (cleanData.efectivoDeCierre === '' || isNaN(cleanData.efectivoDeCierre)) delete cleanData.efectivoDeCierre;

      // Asegurar que transferenciasContadas viaje en el objeto de datos para guardar
      if (transferenciasContadas !== '' && !isNaN(Number(transferenciasContadas))) {
        cleanData.transferenciasContadas = Number(transferenciasContadas);
      }

      if (cleanData.insumos) {
        cleanData.insumos = cleanData.insumos.map((i: any) => ({
          ...i,
          cantDeCierre: i.cantDeCierre === '' || isNaN(Number(i.cantDeCierre)) ? undefined : Number(i.cantDeCierre)
        }));
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
          const updateData = { ...cleanData, insumosAEliminar, usuario: user?.name || user?.nombre };
          await updateCaja(cajaId, updateData);

          // SEGUNDO: Enviamos el cierre definitivo SOLO con los campos financieros básicos que el DTO viejo y estricto espera.
          const closeData: any = {};

          if (cleanData.efectivoDeCierre !== undefined) closeData.efectivoDeCierre = cleanData.efectivoDeCierre;
          if (cleanData.resumen !== undefined) closeData.resumen = cleanData.resumen;
          if (cleanData.plataGuardada !== undefined) closeData.plataGuardada = cleanData.plataGuardada;
          if (cleanData.valorFaltante !== undefined) closeData.valorFaltante = cleanData.valorFaltante;
          if (cleanData.valorExcedente !== undefined) closeData.valorExcedente = cleanData.valorExcedente;
          if (cleanData.observaciones !== undefined) closeData.observaciones = cleanData.observaciones;
          if (cleanData.transferenciasContadas !== undefined) closeData.transferenciasContadas = cleanData.transferenciasContadas;
          
          if (cleanData.insumos) {
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
          const updateData = { ...cleanData, insumosAEliminar, usuario: user?.name || user?.nombre };
          await updateCaja(cajaId, updateData);
          Toast.show({ type: 'success', text1: 'Arqueo Guardado', text2: 'El arqueo parcial se ha guardado' });
        }
        
        navigation.goBack();
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
    const exists = insumosActuales.find(i => i.nombreInsumo === insumo.IDalimentos);
    if (!exists) {
      append({
        nombreInsumo: insumo.IDalimentos,
        nombreInsumoReal: insumo.Nombre || insumo.nombre,
        paraQueProducto: [] as string[],
        nombreProductoReal: '',
        categoria: insumo.Categoria || insumo.categoria || '',
        unidadDeMedida: insumo.Unidades || insumo.unidades || 'Und',
        cantApertura: 0,
        cantDeCierre: 0,
        observacion: '',
        imageUrl: insumo.imageUrl || insumo.imagen || ''
      });
      Toast.show({ type: 'success', text1: 'Agregado', text2: 'Insumo añadido a la lista' });
    } else {
      Toast.show({ type: 'info', text1: 'Aviso', text2: 'El insumo ya está en la lista' });
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
      const updatedResumenData = {
        ...resumenData,
        caja: {
          ...resumenData.caja,
          observaciones: currentValues.observaciones,
        },
        insumos: resumenData.insumos?.map((backendInsumo: any) => {
          // Encontrar el insumo correspondiente en el formulario actual
          const formInsumo = currentValues.insumos?.find(
            (fi: any) => fi.Idcierreyapertura === backendInsumo.Idcierreyapertura || fi.nombreInsumo === backendInsumo.nombreInsumo
          );

          if (formInsumo) {
            const gastadoFisico = (Number(formInsumo.cantApertura) || 0) - (Number(formInsumo.cantDeCierre) || 0);
            const diferencia = gastadoFisico - (backendInsumo.ventasEnSistema || 0);
            
            return {
              ...backendInsumo,
              nombreReal: formInsumo.nombreInsumoReal || backendInsumo.nombreReal,
              nombreProductoReal: formInsumo.nombreProductoReal || backendInsumo.nombreProductoReal,
              cantApertura: formInsumo.cantApertura,
              cantDeCierre: formInsumo.cantDeCierre,
              seUtilizaron: gastadoFisico,
              diferencia: diferencia
            };
          }
          return backendInsumo;
        }) || []
      };

      await generateAndShareCajaPDF(updatedResumenData);
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
            })() as string[],
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
      <View style={{ backgroundColor: '#4CAF50', paddingTop: insets.top }}>
        <View className="bg-primary flex-row items-center justify-between px-4 py-3 shadow-md" style={{ backgroundColor: '#4CAF50' }}>
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
        enableOnAndroid={true}
        extraScrollHeight={100}
        extraHeight={100}
        enableAutomaticScroll={true}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 60 }}
      >
          
          {activeTab === 'form' && (
            <>
              {/* CAMPOS PRINCIPALES */}
              <View className="bg-white p-4 rounded-xl shadow-sm mb-4 border border-gray-200">
                <Text className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Información General</Text>
            
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
              <Input editable={!isReadOnly} keyboardType="numeric" value={formatCurrency(value)} onChangeText={(val) => onChange(parseCurrency(val))} className={cn("font-bold bg-gray-50 border-gray-300 text-gray-900", errors.efectivoDeApertura && "border-red-500")} style={{ fontSize: 15 }} />
            )} />
            {errors.efectivoDeApertura && (
              <Text className="text-red-500 text-xs mt-1 font-medium">{errors.efectivoDeApertura.message as string}</Text>
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
        </View>

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
                <TouchableOpacity onPress={() => setModalInsumosVisible(true)} className="bg-green-600 px-2 py-1.5 rounded flex-row items-center">
                  <Ionicons name="add" size={14} color="#fff" />
                  <Text className="text-white font-semibold ml-1 text-xs">Agregar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {fields.length === 0 ? (
            <View className="p-6 items-center">
              <Ionicons name="cube-outline" size={40} color="#d1d5db" />
              <Text className="text-gray-400 mt-2">No hay insumos registrados</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="w-full">
              <View className="flex-col min-w-full">
                {/* Header Row */}
                <View className="flex-row items-center bg-gray-100 border-b border-gray-200 p-2">
                  <View className="w-10 items-center" />
                  <Text className="w-40 font-bold text-xs text-gray-600">Para qué producto</Text>
                  <Text className="w-48 font-bold text-xs text-gray-600">Insumos</Text>
                  <Text className="w-24 font-bold text-xs text-gray-600 text-center">Cant. Apertura</Text>
                  <Text className="w-24 font-bold text-xs text-gray-600 text-center">Cant. Cierre</Text>
                </View>

                {/* Items */}
                {fields.map((item, index) => (
                  <View key={item.id} className="border-b border-gray-100 p-2 bg-white">
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

                      <View className="w-24 px-1">
                        <Controller
                          control={control}
                          name={`insumos.${index}.cantApertura`}
                          render={({ field: { onChange, value } }) => (
                            <View className="flex-row items-center">
                              <TextInput
                                editable={!isReadOnly && isAdmin}
                                keyboardType="numeric"
                                value={value !== undefined ? String(value) : ''}
                                onChangeText={onChange}
                                className={`flex-1 text-center font-bold bg-gray-50 border ${errors.insumos?.[index]?.cantApertura ? 'border-red-500' : 'border-gray-200'} rounded py-1 text-gray-900`}
                              />
                              {!isReadOnly && isAdmin && (
                                <TouchableOpacity 
                                  className="ml-1 bg-green-500 rounded w-6 h-6 items-center justify-center"
                                  onPress={() => {
                                    setAddQtyIndex(index);
                                    setAddQtyAmount('');
                                    setAddQtyModalVisible(true);
                                  }}
                                >
                                  <Ionicons name="add" size={16} color="white" />
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        />
                      </View>

                      <View className="w-24 px-1">
                        <Controller
                          control={control}
                          name={`insumos.${index}.cantDeCierre`}
                          render={({ field: { onChange, value } }) => (
                            <View>
                              <TextInput
                                editable={!isReadOnly}
                                keyboardType="numeric"
                                value={value !== undefined ? String(value) : ''}
                                onChangeText={onChange}
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
                ))}
              </View>
            </ScrollView>
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
                  <Input 
                    editable={!isReadOnly}
                    keyboardType="numeric" 
                    value={value !== undefined && (value as any) !== '' && value !== null && Number(value) !== 0 ? formatCurrency(Number(value)) : ''} 
                    onChangeText={(val) => onChange(parseCurrency(val))} 
                    onFocus={() => {
                      if (Number(value) === 0) {
                        onChange('' as any);
                      }
                    }}
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
                    <Text className={`font-black text-sm ${diff === 0 ? 'text-green-700' : diff < 0 ? 'text-red-700' : 'text-orange-700'}`}>{diff > 0 ? '+' : ''}{formatCurrency(diff)}</Text>
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
                <Input 
                  editable={!isReadOnly}
                  keyboardType="numeric" 
                  value={transferenciasContadas !== undefined && transferenciasContadas !== '' && transferenciasContadas !== null && Number(transferenciasContadas) !== 0 ? formatCurrency(transferenciasContadas) : ''} 
                  onChangeText={(val) => setTransferenciasContadas(String(parseCurrency(val)))} 
                  onFocus={() => {
                    if (Number(transferenciasContadas) === 0) {
                      setTransferenciasContadas('');
                    }
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
                    <Text className={`font-black text-sm ${diff === 0 ? 'text-green-700' : diff < 0 ? 'text-red-700' : 'text-orange-700'}`}>{diff > 0 ? '+' : ''}{formatCurrency(diff)}</Text>
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
                  <View className="bg-white/60 p-3 rounded-lg mt-2">
                    <Text className="text-red-800 font-bold text-xs mb-2 uppercase text-center">Detalle de Diferencias</Text>
                    {diffEfectivo !== 0 && <Text className="text-red-700 text-xs text-center">Efectivo: {diffEfectivo > 0 ? '+' : ''}{formatCurrency(diffEfectivo)}</Text>}
                    {diffTrans !== 0 && <Text className="text-red-700 text-xs text-center mt-1">Transferencias: {diffTrans > 0 ? '+' : ''}{formatCurrency(diffTrans)}</Text>}
                    
                    <View className="border-t border-red-200 mt-2 pt-2">
                      <Text className="text-red-900 font-black text-center">DIFERENCIA TOTAL: {totalDiff > 0 ? '+' : ''}{formatCurrency(totalDiff)}</Text>
                    </View>
                  </View>
                )}

                <View className="flex-row justify-between mt-5 w-full">
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
                          className={`flex-1 py-3 rounded-xl ml-2 items-center justify-center ${isCuadrada ? 'bg-green-600' : 'bg-red-600'}`}
                          onPress={() => {
                            // Append to observaciones
                            const currentObs = watch('observaciones') || '';
                            
                            let rangoInfo = '';
                          if (resumenData?.rangoPedidos) {
                            rangoInfo = `\nRango: Pedido #${resumenData.rangoPedidos.primerPedido} al #${resumenData.rangoPedidos.ultimoPedido} (${resumenData.rangoPedidos.totalVentas} ventas procesadas)`;
                          }
                          
                          const timestampArqueo = horaCongelada 
                            ? `Corte: ${new Date(horaCongelada).toLocaleString('es-CO')}`
                            : `${new Date().toLocaleString('es-CO')}`;

                          const cuadreText = `\n\n--- ARQUEO PARCIAL (${timestampArqueo}) ---${rangoInfo}\nEFECTIVO FÍSICO: ${formatCurrency(efectivoContado)} (Dif: ${formatCurrency(diffEfectivo)})\nTRANSFERENCIAS: ${formatCurrency(transContadas)} (Dif: ${formatCurrency(diffTrans)})\nESTADO: ${isCuadrada ? 'CUADRADA' : 'NO CUADRADA (DIFERENCIA TOTAL: ' + formatCurrency(totalDiff) + ')'}\n----------------------`;
                          setValue('observaciones', currentObs + cuadreText);

                          handleSubmit((data) => onSave(data, false), onError)();
                        }}
                      >
                        <Text className="text-white font-bold text-[10px] uppercase text-center leading-tight">Confirmar Arqueo Parcial</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  {!isReadOnly && !isNew && (
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
                            const cuadreText = `\n\n--- CIERRE DEFINITIVO (${new Date().toLocaleString('es-CO')}) ---\nEFECTIVO FÍSICO: ${formatCurrency(efectivoContado)} (Dif: ${formatCurrency(diffEfectivo)})\nTRANSFERENCIAS: ${formatCurrency(transContadas)} (Dif: ${formatCurrency(diffTrans)})\nESTADO: ${isCuadrada ? 'CUADRADA' : 'NO CUADRADA'}\n----------------------`;
                            setValue('observaciones', currentObs + cuadreText);
                            handleSubmit((data) => onSave(data, true), onError)();
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

          <View className="bg-purple-50 p-5 rounded-xl mb-4 border border-purple-200 shadow-sm flex-row justify-between items-center">
            <Text className="text-purple-900 font-black uppercase tracking-wider text-xs">Total Ventas Sistema</Text>
            <Text className="text-purple-700 text-2xl font-black tracking-tight">{formatCurrency(resumenData.resumen.totalVentas || 0)}</Text>
          </View>

          {/* INSUMOS FÍSICOS - TABLA */}
          {resumenData.insumos && resumenData.insumos.length > 0 && modoOperacion === 'RESTAURANTE' && (
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
                    <View key={index} className={`border-b border-gray-100 ${ins.diferencia === 0 ? 'bg-white' : ins.diferencia < 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
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
                        <Text className={`flex-1 text-xs font-bold text-right self-center ${ins.diferencia < 0 ? 'text-red-600' : ins.diferencia > 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
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
          {resumenData.ventasPorCategoria && resumenData.ventasPorCategoria.length > 0 && modoOperacion === 'RESTAURANTE' && (
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
                  {cat.productos.map((prod: any, pi: number) => (
                    <View key={pi} className="flex-row items-center justify-between px-4 py-1.5 border-b border-gray-50">
                      <Text className="text-xs text-gray-700 flex-1" numberOfLines={1}>{prod.nombre}</Text>
                      <View className="bg-indigo-100 rounded-full px-2 py-0.5">
                        <Text className="text-[10px] font-bold text-indigo-700">{prod.cantidad}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* NUEVA SECCIÓN: ANÁLISIS DE NOTAS Y MODIFICADORES */}
          {resumenData?.notasAnalysis && resumenData.notasAnalysis.length > 0 && (
            <View className="mb-6">
              <Text className="text-lg font-bold text-gray-800 mb-3 border-b border-gray-100 pb-2">Análisis de Notas y Modificadores</Text>
              <View className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <View className="flex-row bg-amber-50 border-b border-amber-200 p-3">
                  <Text className="w-16 text-[10px] font-bold text-amber-800 uppercase">Hora</Text>
                  <Text className="flex-1 text-[10px] font-bold text-amber-800 uppercase">Pedido / Notas</Text>
                </View>
                {resumenData.notasAnalysis.map((nota: any, index: number) => (
                  <View key={index} className={`flex-row p-3 border-b border-gray-100 bg-white`}>
                    <Text className="w-16 text-xs font-bold text-gray-700">{nota.hora || '-'}</Text>
                    <View className="flex-1">
                      <View className="flex-row items-center mb-1">
                        <Ionicons name="receipt-outline" size={14} color="#6b7280" />
                        <Text className="text-xs font-bold text-gray-800 ml-1">{nota.pedido}</Text>
                      </View>
                      {nota.productosConNotas.map((prod: any, pIdx: number) => (
                        <View key={pIdx} className="mb-2 ml-1">
                          <Text className="text-xs font-bold text-gray-700">{prod.cantidad}x {prod.producto}</Text>
                          {prod.notas.map((n: any, nIdx: number) => (
                            <View key={nIdx} className="flex-row items-center ml-2 mt-0.5">
                              <Text className="text-[11px] text-gray-600">• {n.name || n.nombre || n.Nombre}</Text>
                              {(n.price || n.precio || n.Precio) > 0 && (
                                <Text className="text-[10px] text-amber-600 font-bold ml-1">
                                  (+{formatCurrency(n.price || n.precio || n.Precio)})
                                </Text>
                              )}
                            </View>
                          ))}
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View className={`p-5 rounded-xl border shadow-sm flex-row justify-between items-center ${resumenData.resumen.valorFaltante > 0 ? 'bg-red-50 border-red-300' : resumenData.resumen.valorExcedente > 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-300'}`}>
            <View className="flex-row items-center">
              <Ionicons name={resumenData.resumen.valorFaltante > 0 ? 'warning' : resumenData.resumen.valorExcedente > 0 ? 'trending-up' : 'checkmark-circle'} size={24} color={resumenData.resumen.valorFaltante > 0 ? '#b91c1c' : resumenData.resumen.valorExcedente > 0 ? '#047857' : '#4b5563'} style={{ marginRight: 8 }} />
              <Text className={`font-black uppercase tracking-wider text-xs ${resumenData.resumen.valorFaltante > 0 ? 'text-red-900' : resumenData.resumen.valorExcedente > 0 ? 'text-emerald-900' : 'text-gray-700'}`}>
                {resumenData.resumen.valorFaltante > 0 ? 'Faltante Caja' : resumenData.resumen.valorExcedente > 0 ? 'Sobrante Caja' : 'Caja Cuadrada'}
              </Text>
            </View>
            <Text className={`text-2xl font-black tracking-tight ${resumenData.resumen.valorFaltante > 0 ? 'text-red-700' : resumenData.resumen.valorExcedente > 0 ? 'text-emerald-700' : 'text-gray-700'}`}>
              {resumenData.resumen.valorFaltante > 0 ? '-' + formatCurrency(resumenData.resumen.valorFaltante) : resumenData.resumen.valorExcedente > 0 ? '+' + formatCurrency(resumenData.resumen.valorExcedente) : '$0'}
            </Text>
          </View>
          
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
            <View style={{ height: '90%', backgroundColor: '#F8FAFC', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', marginBottom: Platform.OS === 'android' ? keyboardHeight : 0 }}>
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
            <View style={{ height: '90%', backgroundColor: '#F8FAFC', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', marginBottom: Platform.OS === 'android' ? keyboardHeight : 0 }}>
              <View className="flex-row items-center justify-between p-4 bg-white border-b border-gray-200 mt-safe">
                <View>
                  <Text className="text-lg font-bold text-gray-900">Seleccionar Productos</Text>
                  <Text className="text-xs text-gray-500">Toca para seleccionar/deseleccionar. Varios permitidos.</Text>
                </View>
                <TouchableOpacity onPress={() => {
                  setModalProductosVisible(false);
                  setSelectedIndexForProduct(null);
                }} className="bg-green-600 px-4 py-2 rounded-lg">
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
                  (handleSubmit as any)((data: any) => onSave(data, false), onError)();
                }}
              >
                <Text className="text-white font-bold">Solo Actualizar Datos</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                className="bg-red-600 py-3.5 rounded-xl items-center shadow-sm"
                onPress={() => {
                  setGuardarModalVisible(false);
                  (handleSubmit as any)((data: any) => onSave(data, true), onError)();
                }}
              >
                <Text className="text-white font-bold">Cierre Definitivo de Caja</Text>
              </TouchableOpacity>

              {resumenData?.caja?.cierre === 'cerrada' && isAdmin && (
                <TouchableOpacity 
                  className="bg-green-600 py-3.5 rounded-xl items-center mt-2 shadow-sm"
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

              <TouchableOpacity 
                className="bg-gray-200 py-3.5 rounded-xl items-center mt-2"
                onPress={() => setGuardarModalVisible(false)}
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
              <Text className="text-lg font-bold text-gray-800 mb-2">Sumar a la Apertura</Text>
              <Text className="text-sm text-gray-500 mb-4">Ingresa la cantidad que deseas agregar a la apertura existente.</Text>
              
              <TextInput
                className="bg-gray-50 border border-gray-300 rounded-lg p-3 text-lg text-center font-bold text-gray-900 mb-4"
                keyboardType="numeric"
                value={addQtyAmount}
                onChangeText={setAddQtyAmount}
                placeholder="Ej. 10"
                autoFocus
              />
              
              <View className="flex-row justify-end space-x-3">
                <TouchableOpacity 
                  className="px-4 py-2 bg-gray-200 rounded-lg"
                  onPress={() => setAddQtyModalVisible(false)}
                >
                  <Text className="text-gray-700 font-bold">Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  className="px-4 py-2 bg-blue-600 rounded-lg"
                  onPress={() => {
                    if (addQtyIndex !== null && addQtyAmount && !isNaN(Number(addQtyAmount))) {
                      const amountToAdd = Number(addQtyAmount);
                      const currentVal = Number(getValues(`insumos.${addQtyIndex}.cantApertura`)) || 0;
                      setValue(`insumos.${addQtyIndex}.cantApertura`, currentVal + amountToAdd, { shouldDirty: true });
                    }
                    setAddQtyModalVisible(false);
                  }}
                >
                  <Text className="text-white font-bold">Sumar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
    </View>
  );
}
