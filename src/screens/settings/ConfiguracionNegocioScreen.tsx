import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, ScrollView, Platform, Switch, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import Toast from 'react-native-toast-message';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getConfiguracion, updateConfiguracion, getConfiguracionWhatsapp, updateConfiguracionWhatsapp, uploadLogo } from '../../services/configuracion';
import api, { getConfiguracionIA, updateConfiguracionIA } from '../../services/api';
import { SearchableSelect, SelectOption } from '../../components/ui/SearchableSelect';
import categoriasService from '../../services/categorias';
import divipolaData from '../../data/divipola';
import { APP_CONFIG } from '../../constants/app.config';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { useSettingsStore } from '../../store/useSettingsStore';
import { getProducts } from '../../services/products';

export interface ReglaEmpaqueDomi {
  id: string;
  tipoDestino: 'CATEGORIA' | 'PRODUCTO';
  categoriaNombre?: string;
  productoId?: string;
  productoNombre?: string;
  empaqueProductoId: string;
  empaqueProductoNombre: string;
  cantidadPorPlato: number;
  cobrarAlCliente: boolean;
}

let Location: any;
try {
  Location = require('expo-location');
} catch (e) {
  console.warn('expo-location no está disponible de forma nativa aún');
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ConfiguracionNegocio'>;
};

const PercentageChips = ({ values, onChange }: { values: number[], onChange: (v: number[]) => void }) => {
  const [input, setInput] = useState('');
  
  const addValue = () => {
    const val = parseInt(input.trim(), 10);
    if (!isNaN(val) && !values.includes(val)) {
      onChange([...values, val].sort((a, b) => a - b));
    }
    setInput('');
  };
  
  const removeValue = (valToRemove: number) => {
    onChange(values.filter(v => v !== valToRemove));
  };

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {values.map(v => (
          <View key={v} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0e7ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
            <Text style={{ color: '#4f46e5', fontWeight: 'bold' }}>{v}%</Text>
            <TouchableOpacity onPress={() => removeValue(v)} style={{ marginLeft: 6 }}>
              <Ionicons name="close-circle" size={16} color="#4f46e5" />
            </TouchableOpacity>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          value={input}
          onChangeText={setInput}
          placeholder="Añadir porcentaje..."
          keyboardType="numeric"
          onSubmitEditing={addValue}
        />
        <TouchableOpacity onPress={addValue} style={{ backgroundColor: '#4f46e5', padding: 12, borderRadius: 8, marginLeft: 8 }}>
          <Text style={{ color: 'white', fontWeight: 'bold' }}>Añadir</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default function ConfiguracionNegocioScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { enableSound, forceEarpiece, setEnableSound, setForceEarpiece } = useSettingsStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [horaCorteDia, setHoraCorteDia] = useState('00:00');
  const [modoOperacion, setModoOperacion] = useState('GENERAL');
  const [tiempoReservaInventario, setTiempoReservaInventario] = useState('5');
  const [porcentajeMermaPapa, setPorcentajeMermaPapa] = useState('10');
  
  // Datos comerciales
  const [nombreComercial, setNombreComercial] = useState(APP_CONFIG.ticketName);
  const [nit, setNit] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [latitudNegocio, setLatitudNegocio] = useState('');
  const [longitudNegocio, setLongitudNegocio] = useState('');
  const [radioGeocercaM, setRadioGeocercaM] = useState('100');
  const [radioGeocercaDescansoM, setRadioGeocercaDescansoM] = useState('50');
  const [minutosGraciaLlegadaTarde, setMinutosGraciaLlegadaTarde] = useState('5');
  
  // Propinas y Descuentos
  const [habilitarPropinas, setHabilitarPropinas] = useState(true);
  const [habilitarDescuentos, setHabilitarDescuentos] = useState(true);
  const [opcionesPropina, setOpcionesPropina] = useState<number[]>([5, 10, 15]);
  const [opcionesDescuento, setOpcionesDescuento] = useState<number[]>([5, 10, 20]);
  
  // Opciones de Logo y Ticket
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [imprimirLogo, setImprimirLogo] = useState(false);
  const [logoSize58, setLogoSize58] = useState('380');
  const [logoSize80, setLogoSize80] = useState('500');
  
  // Estados para IA
  const [iaConfig, setIaConfig] = useState({
    apiKey: '',
    modeloDefecto: 'gemini-3.5-flash',
    temperatura: '0.4',
    maxTokens: '2048',
    isActive: true,
    usarRazonamiento: false,
    validarFacialAsistencia: false,
  });

  // Estados para Whatsapp
  const [whatsappConfig, setWhatsappConfig] = useState({
    enabled: false,
    urlBase: '',
    sessionId: '',
    token: '',
    receiver: '',
    isGroup: false,
    descansoAlertEnabled: false,
    descansoAnticipacionMinutos: '10',
    descansoFrecuenciaMinutos: '5',
  });

  const [showTestModal, setShowTestModal] = useState(false);
  const [empleadosEnDescanso, setEmpleadosEnDescanso] = useState<{ id: string; nombre: string }[]>([]);
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState<string | null>(null);
  const [testApiError, setTestApiError] = useState<string | null>(null);
  const [testingWhatsapp, setTestingWhatsapp] = useState(false);

  // Estados para Factus
  const [factusConfig, setFactusConfig] = useState({
    emitirFacturaAutomatica: false,
    preguntarFacturaElectronica: false,
    factusEmail: '',
    factusPassword: '',
    factusClientId: '',
    factusClientSecret: '',
    factusMunicipioCodigo: '52356',
    factusEntorno: 'SANDBOX'
  });

  // Estados para Domicilios WhatsApp (wa-queue-api-v2)
  const [domisConfig, setDomisConfig] = useState({
    domisHabilitado: false,
    domisBloqueoVentas: false,
    domisTimeoutMinutos: '10',
    domisAlertaSonora: true,
    domisPromptMapeo: '',
    domisWebhookSecret: '',
    domisWaQueueUrl: '',
  });

  // Reglas de empaque y adicionales para Domicilios IA
  const [reglasEmpaque, setReglasEmpaque] = useState<ReglaEmpaqueDomi[]>([]);
  const [modalReglaVisible, setModalReglaVisible] = useState(false);
  const [reglaEditandoId, setReglaEditandoId] = useState<string | null>(null);
  const [categoriasSeleccionadas, setCategoriasSeleccionadas] = useState<string[]>([]);
  const [productosSeleccionados, setProductosSeleccionados] = useState<string[]>([]);
  const [productosDisponibles, setProductosDisponibles] = useState<any[]>([]);
  const [categoriasDisponibles, setCategoriasDisponibles] = useState<string[]>([]);
  const [searchEmpaque, setSearchEmpaque] = useState('');
  const [searchPlato, setSearchPlato] = useState('');

  // Opciones optimizadas y elegantes para los selectores
  const categoriaOptions: SelectOption[] = useMemo(() => {
    return categoriasDisponibles.map((cat) => ({
      label: cat,
      value: cat,
      icon: 'folder-outline',
      subtitle: 'Categoría de catálogo',
    }));
  }, [categoriasDisponibles]);

  const platoOptions: SelectOption[] = useMemo(() => {
    return productosDisponibles.map((p) => ({
      label: p.nombre,
      value: p.IDproductos,
      subtitle: p.categoriaNombre || p.categoria || 'Sin categoría',
      price: Number(p.precioUnitario || 0),
      icon: 'restaurant-outline',
      category: p.categoriaNombre || p.categoria || '',
    }));
  }, [productosDisponibles]);

  const empaqueOptions: SelectOption[] = useMemo(() => {
    return productosDisponibles
      .map((p) => {
        const isEmpaque =
          (p.categoriaNombre && p.categoriaNombre.toUpperCase() === 'DESECHABLES') ||
          /caja|vaso|tapa|empaque|desechable|bolsa|envase|cubierto|domicilio/i.test(p.nombre || '');
        return {
          label: p.nombre,
          value: p.IDproductos,
          subtitle: p.categoriaNombre || p.categoria || 'Sin categoría',
          price: Number(p.precioUnitario || 0),
          isEmpaque,
          icon: isEmpaque ? 'cube' : 'pricetag-outline',
          category: p.categoriaNombre || p.categoria || '',
        };
      })
      .sort((a, b) => {
        if (a.isEmpaque && !b.isEmpaque) return -1;
        if (!a.isEmpaque && b.isEmpaque) return 1;
        return a.label.localeCompare(b.label, 'es', { sensitivity: 'base' });
      });
  }, [productosDisponibles]);

  const [selectedDepto, setSelectedDepto] = useState<string>('');

  const deptoOptions: SelectOption[] = useMemo(() => {
    return divipolaData.map((d) => ({
      label: d.nombre,
      value: d.codigo_dane,
      icon: 'map-outline',
    }));
  }, []);

  const municipioOptions: SelectOption[] = useMemo(() => {
    const depto = divipolaData.find((d) => d.codigo_dane === selectedDepto);
    if (!depto) return [];
    return depto.municipios.map((m) => ({
      label: m.nombre,
      value: m.codigo_dane,
      icon: 'location-outline',
    }));
  }, [selectedDepto]);

  const empleadoOptions: SelectOption[] = useMemo(() => {
    return empleadosEnDescanso.map((emp: any) => ({
      label: emp.nombre,
      value: emp.id,
      subtitle: emp.telefono ? `Tel: ${emp.telefono}` : undefined,
      icon: 'person-outline',
    }));
  }, [empleadosEnDescanso]);
  const [nuevaRegla, setNuevaRegla] = useState<{
    tipoDestino: 'CATEGORIA' | 'PRODUCTO';
    categoriaNombre: string;
    productoId: string;
    productoNombre: string;
    empaqueProductoId: string;
    empaqueProductoNombre: string;
    cantidadPorPlato: string;
    cobrarAlCliente: boolean;
  }>({
    tipoDestino: 'CATEGORIA',
    categoriaNombre: '',
    productoId: '',
    productoNombre: '',
    empaqueProductoId: '',
    empaqueProductoNombre: '',
    cantidadPorPlato: '1',
    cobrarAlCliente: false,
  });
  
  // Para el Time Picker
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  // Helper para mostrar la hora en formato 12h AM/PM
  const format12Hour = (time24: string) => {
    if (!time24) return '';
    const [h, m] = time24.split(':');
    let hours = parseInt(h, 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // la hora '0' debe ser '12'
    return `${hours.toString().padStart(2, '0')}:${m} ${ampm}`;
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const [resNegocio, resIA, resWhatsapp] = await Promise.all([
        getConfiguracion(),
        getConfiguracionIA(),
        getConfiguracionWhatsapp()
      ]);

      const dataNegocio = resNegocio.data ? resNegocio.data : resNegocio;
      if (dataNegocio) {
        if (dataNegocio.horaCorteDia) {
          setHoraCorteDia(dataNegocio.horaCorteDia);
          const [h, m] = dataNegocio.horaCorteDia.split(':');
          const d = new Date();
          d.setHours(parseInt(h, 10), parseInt(m, 10), 0);
          setTempDate(d);
        }
        if (dataNegocio.modoOperacion) {
          setModoOperacion(dataNegocio.modoOperacion);
        }
        if (dataNegocio.tiempoReservaInventario !== undefined && dataNegocio.tiempoReservaInventario !== null) {
          setTiempoReservaInventario(String(dataNegocio.tiempoReservaInventario));
        }
        if (dataNegocio.nombreComercial) setNombreComercial(dataNegocio.nombreComercial);
        if (dataNegocio.nit) setNit(dataNegocio.nit);
        if (dataNegocio.direccion) setDireccion(dataNegocio.direccion);
        if (dataNegocio.telefono) setTelefono(dataNegocio.telefono);
        if (dataNegocio.latitudNegocio !== null && dataNegocio.latitudNegocio !== undefined) setLatitudNegocio(String(dataNegocio.latitudNegocio));
        if (dataNegocio.longitudNegocio !== null && dataNegocio.longitudNegocio !== undefined) setLongitudNegocio(String(dataNegocio.longitudNegocio));
        if (dataNegocio.radioGeocercaM !== null && dataNegocio.radioGeocercaM !== undefined) setRadioGeocercaM(String(dataNegocio.radioGeocercaM));
        if (dataNegocio.radioGeocercaDescansoM !== null && dataNegocio.radioGeocercaDescansoM !== undefined) setRadioGeocercaDescansoM(String(dataNegocio.radioGeocercaDescansoM));
        if (dataNegocio.minutosGraciaLlegadaTarde !== null && dataNegocio.minutosGraciaLlegadaTarde !== undefined) setMinutosGraciaLlegadaTarde(String(dataNegocio.minutosGraciaLlegadaTarde));
        
        if (dataNegocio.habilitarPropinas !== undefined) setHabilitarPropinas(dataNegocio.habilitarPropinas);
        if (dataNegocio.habilitarDescuentos !== undefined) setHabilitarDescuentos(dataNegocio.habilitarDescuentos);
        if (dataNegocio.porcentajeMermaPapa !== undefined && dataNegocio.porcentajeMermaPapa !== null) {
          setPorcentajeMermaPapa(String(dataNegocio.porcentajeMermaPapa));
        }
        if (dataNegocio.opcionesPropina) {
          try {
            const arr = typeof dataNegocio.opcionesPropina === 'string' ? JSON.parse(dataNegocio.opcionesPropina) : dataNegocio.opcionesPropina;
            if (Array.isArray(arr)) setOpcionesPropina(arr);
          } catch(e) {}
        }
        if (dataNegocio.opcionesDescuento) {
          try {
            const arr = typeof dataNegocio.opcionesDescuento === 'string' ? JSON.parse(dataNegocio.opcionesDescuento) : dataNegocio.opcionesDescuento;
            if (Array.isArray(arr)) setOpcionesDescuento(arr);
          } catch(e) {}
        }

        if (dataNegocio.logoUrl) setLogoUrl(dataNegocio.logoUrl);
        if (dataNegocio.imprimirLogo !== undefined) setImprimirLogo(dataNegocio.imprimirLogo);
        if (dataNegocio.logoSize58 !== undefined) setLogoSize58(String(dataNegocio.logoSize58));
        if (dataNegocio.logoSize80 !== undefined) setLogoSize80(String(dataNegocio.logoSize80));
        
        setFactusConfig({
          emitirFacturaAutomatica: dataNegocio.emitirFacturaAutomatica ?? false,
          preguntarFacturaElectronica: dataNegocio.preguntarFacturaElectronica ?? false,
          factusEmail: dataNegocio.factusEmail || '',
          factusPassword: dataNegocio.factusPassword || '',
          factusClientId: dataNegocio.factusClientId || '',
          factusClientSecret: dataNegocio.factusClientSecret || '',
          factusMunicipioCodigo: dataNegocio.factusMunicipioCodigo || '52356',
          factusEntorno: dataNegocio.factusEntorno || 'SANDBOX'
        });

        setDomisConfig({
          domisHabilitado: dataNegocio.domisHabilitado ?? false,
          domisBloqueoVentas: dataNegocio.domisBloqueoVentas ?? false,
          domisTimeoutMinutos: String(dataNegocio.domisTimeoutMinutos ?? 10),
          domisAlertaSonora: dataNegocio.domisAlertaSonora ?? true,
          domisPromptMapeo: dataNegocio.domisPromptMapeo || '',
          domisWebhookSecret: dataNegocio.domisWebhookSecret || '',
          domisWaQueueUrl: dataNegocio.domisWaQueueUrl || '',
        });

        if (dataNegocio.domisReglasEmpaque) {
          try {
            const arr = typeof dataNegocio.domisReglasEmpaque === 'string'
              ? JSON.parse(dataNegocio.domisReglasEmpaque)
              : dataNegocio.domisReglasEmpaque;
            if (Array.isArray(arr)) setReglasEmpaque(arr);
          } catch (e) {
            console.error('Error parseando domisReglasEmpaque:', e);
          }
        }

        try {
          const [prodRes, catsRes] = await Promise.all([
            getProducts({ limit: 1000 }),
            categoriasService.getAll().catch((e) => {
              console.error('Error cargando categorias desde servicio:', e);
              return [];
            }),
          ]);
          const prods = Array.isArray(prodRes?.data) ? prodRes.data : [];
          setProductosDisponibles(prods);

          const catNamesFromDb = Array.isArray(catsRes)
            ? catsRes.map((c: any) => (c.nombre || '').trim()).filter(Boolean)
            : [];
          const catNamesFromProds = prods
            .map((p: any) => (p.categoriaNombre || p.categoria || '').trim())
            .filter(Boolean);

          const allCats = Array.from(new Set([...catNamesFromDb, ...catNamesFromProds]))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

          setCategoriasDisponibles(allCats);
        } catch (e) {
          console.error('Error cargando productos y categorias para empaques:', e);
        }

        // Initialize Department based on municipality
        const munCode = dataNegocio.factusMunicipioCodigo || '52356';
        const depto = divipolaData.find(d => d.municipios.some(m => m.codigo_dane === munCode));
        if (depto) {
          setSelectedDepto(depto.codigo_dane);
        }
      }

      const dataIA = resIA.data ? resIA.data : resIA;
      if (dataIA) {
        setIaConfig({
          apiKey: dataIA.apiKey || '',
          modeloDefecto: dataIA.modeloDefecto || 'gemini-3.5-flash',
          temperatura: (dataIA.temperatura ?? 0.4).toString(),
          maxTokens: (dataIA.maxTokens ?? 2048).toString(),
          isActive: dataIA.isActive ?? true,
          usarRazonamiento: dataIA.usarRazonamiento ?? false,
          validarFacialAsistencia: dataIA.validarFacialAsistencia ?? false,
        });
      }

      const dataWhatsapp = resWhatsapp.data ? resWhatsapp.data : resWhatsapp;
      if (dataWhatsapp) {
        setWhatsappConfig({
          enabled: dataWhatsapp.enabled ?? false,
          urlBase: dataWhatsapp.urlBase || '',
          sessionId: dataWhatsapp.sessionId || '',
          token: dataWhatsapp.token || '',
          receiver: dataWhatsapp.receiver || '',
          isGroup: dataWhatsapp.isGroup ?? false,
          descansoAlertEnabled: dataWhatsapp.descansoAlertEnabled ?? false,
          descansoAnticipacionMinutos: dataWhatsapp.descansoAnticipacionMinutos !== undefined ? String(dataWhatsapp.descansoAnticipacionMinutos) : '10',
          descansoFrecuenciaMinutos: dataWhatsapp.descansoFrecuenciaMinutos !== undefined ? String(dataWhatsapp.descansoFrecuenciaMinutos) : '5',
        });
      }
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cargar la configuración' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const { preguntarFacturaElectronica, ...factusToSave } = factusConfig;
      await Promise.all([
        updateConfiguracion({ 
          horaCorteDia, modoOperacion, nombreComercial, nit, direccion, telefono,
          tiempoReservaInventario: tiempoReservaInventario ? parseInt(tiempoReservaInventario, 10) : 5,
          latitudNegocio: latitudNegocio ? parseFloat(latitudNegocio) : undefined,
          longitudNegocio: longitudNegocio ? parseFloat(longitudNegocio) : undefined,
          radioGeocercaM: radioGeocercaM ? parseInt(radioGeocercaM, 10) : 100,
          radioGeocercaDescansoM: radioGeocercaDescansoM ? parseInt(radioGeocercaDescansoM, 10) : 50,
          minutosGraciaLlegadaTarde: minutosGraciaLlegadaTarde ? parseInt(minutosGraciaLlegadaTarde, 10) : 5,
          habilitarPropinas,
          habilitarDescuentos,
          porcentajeMermaPapa: porcentajeMermaPapa ? parseFloat(porcentajeMermaPapa) : 10,
          opcionesPropina: JSON.stringify(opcionesPropina),
          opcionesDescuento: JSON.stringify(opcionesDescuento),
          imprimirLogo,
          logoSize58: logoSize58 ? parseInt(logoSize58, 10) : 380,
          logoSize80: logoSize80 ? parseInt(logoSize80, 10) : 500,
          domisHabilitado: domisConfig.domisHabilitado,
          domisBloqueoVentas: domisConfig.domisBloqueoVentas,
          domisTimeoutMinutos: parseInt(domisConfig.domisTimeoutMinutos, 10) || 10,
          domisAlertaSonora: domisConfig.domisAlertaSonora,
          domisPromptMapeo: domisConfig.domisPromptMapeo,
          domisWebhookSecret: domisConfig.domisWebhookSecret,
          domisWaQueueUrl: domisConfig.domisWaQueueUrl,
          domisReglasEmpaque: JSON.stringify(reglasEmpaque),
          ...factusToSave
        } as any),
        updateConfiguracionIA({
          apiKey: iaConfig.apiKey,
          modeloDefecto: iaConfig.modeloDefecto,
          temperatura: parseFloat(iaConfig.temperatura) || 0.4,
          maxTokens: parseInt(iaConfig.maxTokens, 10) || 2048,
          isActive: iaConfig.isActive,
          usarRazonamiento: iaConfig.usarRazonamiento,
          validarFacialAsistencia: iaConfig.validarFacialAsistencia,
        }),
        updateConfiguracionWhatsapp({
          enabled: whatsappConfig.enabled,
          urlBase: whatsappConfig.urlBase,
          sessionId: whatsappConfig.sessionId,
          token: whatsappConfig.token,
          receiver: whatsappConfig.receiver,
          isGroup: whatsappConfig.isGroup,
          descansoAlertEnabled: whatsappConfig.descansoAlertEnabled,
          descansoAnticipacionMinutos: parseInt(whatsappConfig.descansoAnticipacionMinutos) || 10,
          descansoFrecuenciaMinutos: parseInt(whatsappConfig.descansoFrecuenciaMinutos) || 5,
        })
      ]);
      Toast.show({ type: 'success', text1: 'Éxito', text2: 'Configuración guardada correctamente' });
      navigation.goBack();
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: error?.response?.data?.message || 'Error al guardar la configuración' });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenModalRegla = () => {
    const firstCat = categoriasDisponibles[0] || '';
    const firstProd = productosDisponibles[0];
    const defaultEmpaque = productosDisponibles.find((p) =>
      (p.categoriaNombre && p.categoriaNombre.toUpperCase() === 'DESECHABLES') ||
      /empaque|desechable|caja|tapa|vaso|icopor|recipiente|bolsa|envase/i.test(p.nombre || '')
    ) || firstProd;

    setReglaEditandoId(null);
    setCategoriasSeleccionadas([]);
    setProductosSeleccionados([]);
    setSearchEmpaque('');
    setSearchPlato('');
    setNuevaRegla({
      tipoDestino: 'CATEGORIA',
      categoriaNombre: '',
      productoId: '',
      productoNombre: '',
      empaqueProductoId: defaultEmpaque?.IDproductos || '',
      empaqueProductoNombre: defaultEmpaque?.nombre || '',
      cantidadPorPlato: '1',
      cobrarAlCliente: false,
    });
    setModalReglaVisible(true);
  };

  const handleEditarRegla = (regla: ReglaEmpaqueDomi) => {
    setReglaEditandoId(regla.id);
    setSearchEmpaque('');
    setSearchPlato('');
    if (regla.tipoDestino === 'CATEGORIA') {
      setCategoriasSeleccionadas(regla.categoriaNombre ? [regla.categoriaNombre] : []);
      setProductosSeleccionados([]);
    } else {
      setProductosSeleccionados(regla.productoId ? [regla.productoId] : []);
      setCategoriasSeleccionadas([]);
    }
    setNuevaRegla({
      tipoDestino: regla.tipoDestino,
      categoriaNombre: regla.categoriaNombre || '',
      productoId: regla.productoId || '',
      productoNombre: regla.productoNombre || '',
      empaqueProductoId: regla.empaqueProductoId,
      empaqueProductoNombre: regla.empaqueProductoNombre,
      cantidadPorPlato: String(regla.cantidadPorPlato || 1),
      cobrarAlCliente: Boolean(regla.cobrarAlCliente),
    });
    setModalReglaVisible(true);
  };

  const handleGuardarNuevaRegla = () => {
    if (!nuevaRegla.empaqueProductoId) {
      Toast.show({ type: 'error', text1: 'Dato requerido', text2: 'Debes seleccionar el producto de empaque' });
      return;
    }

    const cantidadNum = Math.max(1, parseInt(nuevaRegla.cantidadPorPlato, 10) || 1);
    const empaqueProd = productosDisponibles.find((p) => p.IDproductos === nuevaRegla.empaqueProductoId);
    const empaqueNombre = empaqueProd?.nombre || nuevaRegla.empaqueProductoNombre || 'Empaque';

    // MODO EDICIÓN
    if (reglaEditandoId) {
      if (nuevaRegla.tipoDestino === 'CATEGORIA' && !nuevaRegla.categoriaNombre && categoriasSeleccionadas.length === 0) {
        Toast.show({ type: 'error', text1: 'Dato requerido', text2: 'Debes seleccionar una categoría' });
        return;
      }
      if (nuevaRegla.tipoDestino === 'PRODUCTO' && !nuevaRegla.productoId && productosSeleccionados.length === 0) {
        Toast.show({ type: 'error', text1: 'Dato requerido', text2: 'Debes seleccionar un plato del catálogo' });
        return;
      }

      const catFinal = nuevaRegla.tipoDestino === 'CATEGORIA'
        ? (categoriasSeleccionadas[0] || nuevaRegla.categoriaNombre)
        : undefined;
      const prodIdFinal = nuevaRegla.tipoDestino === 'PRODUCTO'
        ? (productosSeleccionados[0] || nuevaRegla.productoId)
        : undefined;
      const prodObj = prodIdFinal ? productosDisponibles.find((p) => p.IDproductos === prodIdFinal) : undefined;
      const prodNombreFinal = prodObj?.nombre || nuevaRegla.productoNombre || undefined;

      setReglasEmpaque((prev) =>
        prev.map((r) => {
          if (r.id !== reglaEditandoId) return r;
          return {
            ...r,
            tipoDestino: nuevaRegla.tipoDestino,
            categoriaNombre: catFinal,
            productoId: prodIdFinal,
            productoNombre: prodNombreFinal,
            empaqueProductoId: nuevaRegla.empaqueProductoId,
            empaqueProductoNombre: empaqueNombre,
            cantidadPorPlato: cantidadNum,
            cobrarAlCliente: nuevaRegla.cobrarAlCliente,
          };
        })
      );

      setModalReglaVisible(false);
      setReglaEditandoId(null);
      Toast.show({
        type: 'success',
        text1: 'Regla actualizada',
        text2: 'Pulsa "Guardar Configuración" para aplicar los cambios.',
      });
      return;
    }

    // MODO CREACIÓN (con selección múltiple)
    if (nuevaRegla.tipoDestino === 'CATEGORIA') {
      const catsToApply = categoriasSeleccionadas.length > 0
        ? categoriasSeleccionadas
        : (nuevaRegla.categoriaNombre ? [nuevaRegla.categoriaNombre] : []);

      if (catsToApply.length === 0) {
        Toast.show({ type: 'error', text1: 'Dato requerido', text2: 'Debes seleccionar al menos una categoría' });
        return;
      }

      setReglasEmpaque((prev) => {
        let current = [...prev];
        for (const cat of catsToApply) {
          const existingIndex = current.findIndex(
            (r) => r.tipoDestino === 'CATEGORIA' && r.categoriaNombre === cat && r.empaqueProductoId === nuevaRegla.empaqueProductoId
          );
          if (existingIndex >= 0) {
            current[existingIndex] = {
              ...current[existingIndex],
              cantidadPorPlato: cantidadNum,
              cobrarAlCliente: nuevaRegla.cobrarAlCliente,
              empaqueProductoNombre: empaqueNombre,
            };
          } else {
            current.push({
              id: `regla_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              tipoDestino: 'CATEGORIA',
              categoriaNombre: cat,
              empaqueProductoId: nuevaRegla.empaqueProductoId,
              empaqueProductoNombre: empaqueNombre,
              cantidadPorPlato: cantidadNum,
              cobrarAlCliente: nuevaRegla.cobrarAlCliente,
            });
          }
        }
        return current;
      });

      setModalReglaVisible(false);
      Toast.show({
        type: 'success',
        text1: catsToApply.length === 1 ? 'Regla agregada' : `${catsToApply.length} reglas agregadas`,
        text2: 'Pulsa "Guardar Configuración" para aplicar los cambios.',
      });
    } else {
      // PRODUCTO
      const prodsToApply = productosSeleccionados.length > 0
        ? productosSeleccionados
        : (nuevaRegla.productoId ? [nuevaRegla.productoId] : []);

      if (prodsToApply.length === 0) {
        Toast.show({ type: 'error', text1: 'Dato requerido', text2: 'Debes seleccionar al menos un plato' });
        return;
      }

      setReglasEmpaque((prev) => {
        let current = [...prev];
        for (const pId of prodsToApply) {
          const prodObj = productosDisponibles.find((p) => p.IDproductos === pId);
          const pNombre = prodObj?.nombre || 'Plato';

          const existingIndex = current.findIndex(
            (r) => r.tipoDestino === 'PRODUCTO' && r.productoId === pId && r.empaqueProductoId === nuevaRegla.empaqueProductoId
          );
          if (existingIndex >= 0) {
            current[existingIndex] = {
              ...current[existingIndex],
              productoNombre: pNombre,
              cantidadPorPlato: cantidadNum,
              cobrarAlCliente: nuevaRegla.cobrarAlCliente,
              empaqueProductoNombre: empaqueNombre,
            };
          } else {
            current.push({
              id: `regla_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              tipoDestino: 'PRODUCTO',
              productoId: pId,
              productoNombre: pNombre,
              empaqueProductoId: nuevaRegla.empaqueProductoId,
              empaqueProductoNombre: empaqueNombre,
              cantidadPorPlato: cantidadNum,
              cobrarAlCliente: nuevaRegla.cobrarAlCliente,
            });
          }
        }
        return current;
      });

      setModalReglaVisible(false);
      Toast.show({
        type: 'success',
        text1: prodsToApply.length === 1 ? 'Regla agregada' : `${prodsToApply.length} reglas agregadas`,
        text2: 'Pulsa "Guardar Configuración" para aplicar los cambios.',
      });
    }
  };

  const onChangeTime = (event: any, selectedDate?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setTempDate(selectedDate);
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      setHoraCorteDia(`${hours}:${minutes}`);
    }
  };

  const openTimePicker = () => {
    setShowTimePicker(true);
  };

  const getLocation = async () => {
    if (!Location) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Módulo de ubicación no disponible' });
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return Toast.show({ type: 'error', text1: 'Error', text2: 'Permiso de ubicación denegado' });
    }
    try {
      const loc = await Location.getCurrentPositionAsync({});
      setLatitudNegocio(String(loc.coords.latitude));
      setLongitudNegocio(String(loc.coords.longitude));
      Toast.show({ type: 'success', text1: 'Ubicación obtenida', text2: 'Coordenadas actualizadas' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo obtener la ubicación' });
    }
  };

  const fetchEmpleadosParaPrueba = async () => {
    try {
      setTestingWhatsapp(true);
      const res = await api.get('/configuracion/whatsapp/empleados-para-prueba');
      setEmpleadosEnDescanso(res.data);
      if (res.data && res.data.length > 0) {
        setSelectedEmpleadoId(res.data[0].id);
        setTestApiError(null);
        setShowTestModal(true);
      } else {
        Toast.show({ type: 'info', text1: 'Info', text2: 'No hay empleados con teléfono configurado' });
      }
    } catch (err) {
      console.warn(err);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudieron cargar los empleados' });
    } finally {
      setTestingWhatsapp(false);
    }
  };

  const handleTestWhatsapp = async () => {
    if (!selectedEmpleadoId) return;
    try {
      setTestApiError(null);
      setTestingWhatsapp(true);
      await api.post('/configuracion/whatsapp/test-conexion', { usuarioId: selectedEmpleadoId });
      Toast.show({ type: 'success', text1: 'Éxito', text2: 'Prueba de WhatsApp enviada' });
      setShowTestModal(false);
    } catch (err: any) {
      console.warn('Error from testWhatsapp:', err);
      let errorMsg = 'Error al enviar prueba';
      if (err.response?.data) {
        if (err.response.data.message) {
          errorMsg = Array.isArray(err.response.data.message) 
            ? err.response.data.message.join(', ') 
            : err.response.data.message;
        } else {
          errorMsg = typeof err.response.data === 'string' 
            ? err.response.data 
            : JSON.stringify(err.response.data);
        }
      } else if (err.message) {
        errorMsg = err.message;
      }
      setTestApiError(errorMsg);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Hubo un error al enviar (ver detalles)', visibilityTime: 5000 });
    } finally {
      setTestingWhatsapp(false);
    }
  };

  const handlePickLogo = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (permissionResult.granted === false) {
        Toast.show({ type: 'error', text1: 'Permisos requeridos', text2: 'Se necesita permiso para acceder a la galería' });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSaving(true);
        // Usamos una baseUrl ficticia pero que resuelve en el backend para la URL pública
        // En producción el backend sabe su propia IP o dominio, pero usamos esto por compatibilidad
        const baseUrl = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1').replace('/api/v1', '').replace('/api', '');
        const res = await uploadLogo(result.assets[0].uri, baseUrl);
        if (res.success && res.url) {
          setLogoUrl(res.url);
          Toast.show({ type: 'success', text1: 'Éxito', text2: 'Logo subido correctamente. Se convirtió a blanco y negro.' });
        }
      }
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo subir el logo' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configuración del Sistema</Text>
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={{ padding: 16, paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
      >
        {/* NEGOCIO */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="briefcase-outline" size={20} /> Negocio
          </Text>
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color="#3b82f6" />
            <Text style={styles.infoText}>
              La Hora de Corte define en qué momento termina el "Día Comercial". Los datos comerciales se imprimirán en la cabecera de las facturas (estilo remisión).
            </Text>
          </View>

          <Text style={styles.label}>Nombre Comercial</Text>
          <TextInput
            style={styles.input}
            value={nombreComercial}
            onChangeText={setNombreComercial}
            placeholder={`Ej. ${APP_CONFIG.ticketName}`}
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>NIT / RUT</Text>
              <TextInput
                style={styles.input}
                value={nit}
                onChangeText={setNit}
                placeholder="Ej. 901234567-8"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                style={styles.input}
                value={telefono}
                onChangeText={setTelefono}
                keyboardType="phone-pad"
                placeholder="Ej. 300 123 4567"
              />
            </View>
          </View>

          <Text style={styles.label}>Dirección</Text>
          <TextInput
            style={styles.input}
            value={direccion}
            onChangeText={setDireccion}
            placeholder="Ej. Calle 123 #45-67"
          />

          <Text style={[styles.label, { marginTop: 20 }]}>Hora de Corte del Día</Text>
          {Platform.OS === 'web' ? (
            <View style={[styles.timePickerButton, { padding: 0, overflow: 'hidden' }]}>
              <View style={{ position: 'absolute', left: 15, zIndex: 1, pointerEvents: 'none' }}>
                <Ionicons name="time-outline" size={24} color="#4f46e5" />
              </View>
              {/* @ts-ignore */}
              <input 
                type="time"
                value={horaCorteDia}
                onChange={(e: any) => {
                  if (e.target.value) {
                    setHoraCorteDia(e.target.value);
                    const [h, m] = e.target.value.split(':');
                    const d = new Date(tempDate);
                    d.setHours(parseInt(h, 10));
                    d.setMinutes(parseInt(m, 10));
                    setTempDate(d);
                  }
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  paddingLeft: 50,
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#1f2937',
                  fontSize: 16,
                  fontWeight: '600',
                  outline: 'none',
                  fontFamily: 'system-ui',
                  cursor: 'pointer'
                }}
              />
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.timePickerButton} onPress={openTimePicker}>
                <Ionicons name="time-outline" size={24} color="#4f46e5" style={{ marginRight: 10 }} />
                <Text style={styles.timePickerText}>{format12Hour(horaCorteDia)}</Text>
              </TouchableOpacity>

              {showTimePicker && (
                <DateTimePicker
                  value={tempDate}
                  mode="time"
                  is24Hour={false}
                  display="default"
                  onChange={onChangeTime}
                />
              )}
            </>
          )}

          <Text style={[styles.label, { marginTop: 20 }]}>Modo de Operación</Text>
          <View style={styles.modelButtons}>
            <TouchableOpacity
              style={[styles.modelBtn, { flex: 1, alignItems: 'center' }, modoOperacion === 'GENERAL' && styles.modelBtnActive]}
              onPress={() => setModoOperacion('GENERAL')}
            >
              <Ionicons name="storefront-outline" size={20} color={modoOperacion === 'GENERAL' ? '#fff' : '#4b5563'} style={{ marginBottom: 4 }} />
              <Text style={[styles.modelBtnText, modoOperacion === 'GENERAL' && styles.modelBtnTextActive]}>
                General
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.modelBtn, { flex: 1, alignItems: 'center' }, modoOperacion === 'RESTAURANTE' && styles.modelBtnActive]}
              onPress={() => setModoOperacion('RESTAURANTE')}
            >
              <Ionicons name="restaurant-outline" size={20} color={modoOperacion === 'RESTAURANTE' ? '#fff' : '#4b5563'} style={{ marginBottom: 4 }} />
              <Text style={[styles.modelBtnText, modoOperacion === 'RESTAURANTE' && styles.modelBtnTextActive]}>
                Restaurante
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
            El modo Restaurante habilita el control de insumos por plato en los reportes de caja.
          </Text>

          <Text style={[styles.label, { marginTop: 20 }]}>Tiempo de Reserva de Inventario (Minutos)</Text>
          <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
            Tiempo que los productos en el carrito de Nueva Venta restarán inventario antes de expirar.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity 
              style={[styles.timeBtn, { marginRight: 8 }]}
              onPress={() => setTiempoReservaInventario(String(Math.max(1, parseInt(tiempoReservaInventario || '1', 10) - 1)))}
            >
              <Ionicons name="remove" size={20} color="#374151" />
            </TouchableOpacity>
            <TextInput
              style={[styles.input, { flex: 1, textAlign: 'center', marginBottom: 0 }]}
              value={tiempoReservaInventario}
              onChangeText={(text) => setTiempoReservaInventario(text.replace(/[^0-9]/g, ''))}
              placeholder="Ej. 5"
              keyboardType="numeric"
            />
            <TouchableOpacity 
              style={[styles.timeBtn, { marginLeft: 8 }]}
              onPress={() => setTiempoReservaInventario(String(parseInt(tiempoReservaInventario || '0', 10) + 1))}
            >
              <Ionicons name="add" size={20} color="#374151" />
            </TouchableOpacity>
          </View>

          {/* OPCIONES DE LOGO */}
          <View style={{ marginTop: 24, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 16 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 16 }]}>Logotipo y Ticket</Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={{ width: 80, height: 80, borderRadius: 8, marginRight: 16, backgroundColor: '#f3f4f6' }} resizeMode="contain" />
              ) : (
                <View style={{ width: 80, height: 80, borderRadius: 8, marginRight: 16, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="image-outline" size={32} color="#9ca3af" />
                </View>
              )}
              <TouchableOpacity onPress={handlePickLogo} style={{ backgroundColor: '#4f46e5', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>{logoUrl ? 'Cambiar Logo' : 'Subir Logo'}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Imprimir Logo en Tickets</Text>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>Si está habilitado, el logo se imprimirá en los tickets.</Text>
              </View>
              <Switch
                value={imprimirLogo}
                onValueChange={setImprimirLogo}
                trackColor={{ false: '#d1d5db', true: '#818cf8' }}
                thumbColor={imprimirLogo ? '#4f46e5' : '#f3f4f6'}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Tamaño (58mm)</Text>
                <TextInput
                  style={styles.input}
                  value={logoSize58}
                  onChangeText={setLogoSize58}
                  placeholder="Ej. 380"
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Tamaño (80mm)</Text>
                <TextInput
                  style={styles.input}
                  value={logoSize80}
                  onChangeText={setLogoSize80}
                  placeholder="Ej. 500"
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>

          {/* PROPINAS Y DESCUENTOS */}
          <View style={{ marginTop: 24, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 16 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 16 }]}>Propinas y Descuentos</Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Habilitar Propinas</Text>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>Mostrar módulo de propinas en el modal de pagos.</Text>
              </View>
              <Switch
                value={habilitarPropinas}
                onValueChange={setHabilitarPropinas}
                trackColor={{ false: '#d1d5db', true: '#818cf8' }}
                thumbColor={habilitarPropinas ? '#4f46e5' : '#f3f4f6'}
              />
            </View>

            {habilitarPropinas && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.label}>Opciones de Propina (%)</Text>
                <PercentageChips values={opcionesPropina} onChange={setOpcionesPropina} />
              </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Habilitar Descuentos Dinámicos</Text>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>Permitir aplicar descuentos configurables.</Text>
              </View>
              <Switch
                value={habilitarDescuentos}
                onValueChange={setHabilitarDescuentos}
                trackColor={{ false: '#d1d5db', true: '#818cf8' }}
                thumbColor={habilitarDescuentos ? '#4f46e5' : '#f3f4f6'}
              />
            </View>

            {habilitarDescuentos && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.label}>Opciones de Descuento (%)</Text>
                <PercentageChips values={opcionesDescuento} onChange={setOpcionesDescuento} />
              </View>
            )}

            {/* COCINA Y COMANDAS */}
            <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 16 }}>
              <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Cocina y Comandas</Text>
              
              <Text style={styles.label}>Margen de Error / Merma de Papa (%)</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                Porcentaje adicional que se sumará a los gramos de papa en las comandas de cocina (ej. 10% para compensar merma por fritura/deshidratación).
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={porcentajeMermaPapa}
                  onChangeText={(text) => setPorcentajeMermaPapa(text.replace(/[^0-9.]/g, ''))}
                  placeholder="10"
                  keyboardType="numeric"
                />
                <Text style={{ marginLeft: 10, fontSize: 16, fontWeight: 'bold', color: '#4b5563' }}>%</Text>
              </View>
            </View>
          </View>
        </View>

        {/* GEOCERCA NÓMINA */}
        <View style={[styles.card, { marginTop: 20, borderColor: '#fef08a', borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={[styles.iaIconContainer, { backgroundColor: '#fef9c3' }]}>
              <Ionicons name="location" size={20} color="#ca8a04" />
            </View>
            <Text style={[styles.sectionTitleIA, { color: '#ca8a04' }]}>
              Geocerca de Nómina
            </Text>
          </View>
          
          <View style={[styles.infoCardIA, { backgroundColor: '#fefce8' }]}>
            <Ionicons name="information-circle" size={24} color="#ca8a04" />
            <Text style={[styles.infoTextIA, { color: '#a16207' }]}>
              Configura las coordenadas del negocio para validar que los empleados estén en el sitio al momento de registrar su asistencia (Check-In / Check-Out).
            </Text>
          </View>

          <TouchableOpacity style={[styles.timePickerButton, { backgroundColor: '#fef9c3', borderColor: '#fde047', marginBottom: 16 }]} onPress={getLocation}>
            <Ionicons name="locate" size={24} color="#ca8a04" style={{ marginRight: 10 }} />
            <Text style={[styles.timePickerText, { color: '#ca8a04', fontSize: 16 }]}>Fijar con mi ubicación actual</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Latitud</Text>
              <TextInput
                style={styles.input}
                value={latitudNegocio}
                onChangeText={setLatitudNegocio}
                placeholder="Ej. 6.2442"
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Longitud</Text>
              <TextInput
                style={styles.input}
                value={longitudNegocio}
                onChangeText={setLongitudNegocio}
                placeholder="Ej. -75.5812"
                keyboardType="numeric"
              />
            </View>
          </View>
          
          <Text style={[styles.label, { marginTop: 12 }]}>Radio de tolerancia (Metros)</Text>
          <TextInput
            style={styles.input}
            value={radioGeocercaM}
            onChangeText={(text) => setRadioGeocercaM(text.replace(/[^0-9]/g, ''))}
            placeholder="Ej. 100"
            keyboardType="numeric"
          />

          <Text style={[styles.label, { marginTop: 12 }]}>Radio de tolerancia de descanso (Metros)</Text>
          <TextInput
            style={styles.input}
            value={radioGeocercaDescansoM}
            onChangeText={(text) => setRadioGeocercaDescansoM(text.replace(/[^0-9]/g, ''))}
            placeholder="Ej. 50"
            keyboardType="numeric"
          />

          <Text style={[styles.label, { marginTop: 12 }]}>Minutos de gracia para llegadas tarde</Text>
          <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
            Tiempo límite (en minutos) después de la hora de entrada antes de generar descuento.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity 
              style={[styles.timeBtn, { marginRight: 8 }]}
              onPress={() => setMinutosGraciaLlegadaTarde(String(Math.max(0, parseInt(minutosGraciaLlegadaTarde || '0', 10) - 1)))}
            >
              <Ionicons name="remove" size={20} color="#374151" />
            </TouchableOpacity>
            <TextInput
              style={[styles.input, { flex: 1, textAlign: 'center', marginBottom: 0 }]}
              value={minutosGraciaLlegadaTarde}
              onChangeText={(text) => setMinutosGraciaLlegadaTarde(text.replace(/[^0-9]/g, ''))}
              placeholder="Ej. 5"
              keyboardType="numeric"
            />
            <TouchableOpacity 
              style={[styles.timeBtn, { marginLeft: 8 }]}
              onPress={() => setMinutosGraciaLlegadaTarde(String(parseInt(minutosGraciaLlegadaTarde || '0', 10) + 1))}
            >
              <Ionicons name="add" size={20} color="#374151" />
            </TouchableOpacity>
          </View>
        </View>

        {/* FACTURACION ELECTRONICA */}
        <View style={[styles.card, { marginTop: 20, borderColor: '#bfdbfe', borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.iaIconContainer, { backgroundColor: '#bfdbfe' }]}>
                <Ionicons name="document-text" size={20} color="#2563eb" />
              </View>
              <Text style={[styles.sectionTitleIA, { color: '#2563eb' }]}>
                Facturación Electrónica (Factus)
              </Text>
            </View>
            <Switch
              value={factusConfig.emitirFacturaAutomatica}
              onValueChange={(val) => setFactusConfig({...factusConfig, emitirFacturaAutomatica: val})}
              trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
              thumbColor={factusConfig.emitirFacturaAutomatica ? '#2563eb' : '#f3f4f6'}
            />
          </View>
          
          <View style={[styles.infoCardIA, { backgroundColor: '#eff6ff' }]}>
            <Ionicons name="information-circle" size={24} color="#2563eb" />
            <Text style={[styles.infoTextIA, { color: '#1e3a8a' }]}>
              Si activas esta opción, se emitirá una factura electrónica automáticamente a nombre de "Consumidor Final" cuando se cobre un pedido (sino tiene cliente asociado).
            </Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
              <Text style={styles.label}>Preguntar por Factura Electrónica al Cobrar</Text>
            </View>
            <Switch
              value={factusConfig.preguntarFacturaElectronica}
              onValueChange={(val) => setFactusConfig({...factusConfig, preguntarFacturaElectronica: val})}
              trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
              thumbColor={factusConfig.preguntarFacturaElectronica ? '#2563eb' : '#f3f4f6'}
            />
          </View>
          
          <Text style={styles.label}>Factus Email</Text>
          <TextInput
            style={styles.input}
            value={factusConfig.factusEmail}
            onChangeText={(text) => setFactusConfig({...factusConfig, factusEmail: text})}
            placeholder="correo@ejemplo.com"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Factus Password</Text>
          <TextInput
            style={styles.input}
            value={factusConfig.factusPassword}
            onChangeText={(text) => setFactusConfig({...factusConfig, factusPassword: text})}
            placeholder="Contraseña de API"
            secureTextEntry={true}
            autoCapitalize="none"
          />
          
          <Text style={styles.label}>Client ID</Text>
          <TextInput
            style={styles.input}
            value={factusConfig.factusClientId}
            onChangeText={(text) => setFactusConfig({...factusConfig, factusClientId: text})}
            placeholder="Client ID"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Client Secret</Text>
          <TextInput
            style={styles.input}
            value={factusConfig.factusClientSecret}
            onChangeText={(text) => setFactusConfig({...factusConfig, factusClientSecret: text})}
            placeholder="Client Secret"
            secureTextEntry={true}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Ubicación (Facturación Electrónica)</Text>
          <SearchableSelect
            placeholder="Seleccione Departamento"
            title="Seleccionar Departamento"
            searchPlaceholder="Buscar departamento..."
            options={deptoOptions}
            selectedValue={selectedDepto}
            onSelect={(val) => {
              setSelectedDepto(val);
              setFactusConfig((prev) => ({ ...prev, factusMunicipioCodigo: '' }));
            }}
            leadingIcon="map-outline"
          />

          <SearchableSelect
            placeholder={selectedDepto ? "Seleccione Municipio" : "Primero seleccione un departamento"}
            title="Seleccionar Municipio"
            searchPlaceholder="Buscar municipio (ej. Medellín, Pasto, Cali)..."
            options={municipioOptions}
            selectedValue={factusConfig.factusMunicipioCodigo}
            onSelect={(val) => setFactusConfig((prev) => ({ ...prev, factusMunicipioCodigo: val }))}
            leadingIcon="location-outline"
            disabled={!selectedDepto}
          />

          <Text style={styles.label}>Entorno (API Factus)</Text>
          <View style={{ flexDirection: 'row', marginTop: 4, marginBottom: 12 }}>
            <TouchableOpacity
              style={[styles.modelBtn, factusConfig.factusEntorno === 'SANDBOX' && styles.modelBtnActive, { flex: 1 }]}
              onPress={() => setFactusConfig({...factusConfig, factusEntorno: 'SANDBOX'})}
            >
              <Text style={[styles.modelBtnText, factusConfig.factusEntorno === 'SANDBOX' && styles.modelBtnTextActive, { fontSize: 13, textAlign: 'center' }]}>Sandbox (Pruebas)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modelBtn, factusConfig.factusEntorno === 'PRODUCCION' && styles.modelBtnActive, { flex: 1, marginLeft: 8 }]}
              onPress={() => setFactusConfig({...factusConfig, factusEntorno: 'PRODUCCION'})}
            >
              <Text style={[styles.modelBtnText, factusConfig.factusEntorno === 'PRODUCCION' && styles.modelBtnTextActive, { fontSize: 13, textAlign: 'center' }]}>Producción</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* INTELIGENCIA ARTIFICIAL */}
        <View style={[styles.card, { marginTop: 20, borderColor: '#e0e7ff', borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.iaIconContainer}>
                <Ionicons name="sparkles" size={20} color="#4f46e5" />
              </View>
              <Text style={styles.sectionTitleIA}>
                Inteligencia Artificial
              </Text>
            </View>
            <Switch
              value={iaConfig.isActive}
              onValueChange={(val) => setIaConfig({...iaConfig, isActive: val})}
              trackColor={{ false: '#d1d5db', true: '#c7d2fe' }}
              thumbColor={iaConfig.isActive ? '#4f46e5' : '#f3f4f6'}
            />
          </View>
          
          <View style={styles.infoCardIA}>
            <Ionicons name="bulb" size={24} color="#4f46e5" />
            <Text style={styles.infoTextIA}>
              Activa la IA para autocompletar formularios leyendo fotos de recibos o facturas automáticamente usando Gemini.
            </Text>
          </View>
          
          <Text style={styles.label}>API Key (Gemini)</Text>
          <TextInput
            style={styles.input}
            value={iaConfig.apiKey}
            onChangeText={(text) => setIaConfig({...iaConfig, apiKey: text})}
            placeholder="AIzaSy..."
            secureTextEntry={true}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Modelo de Visión</Text>
          <View style={styles.modelButtons}>
            {['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview'].map((modelo) => (
              <TouchableOpacity
                key={modelo}
                style={[styles.modelBtn, iaConfig.modeloDefecto === modelo && styles.modelBtnActive]}
                onPress={() => setIaConfig({...iaConfig, modeloDefecto: modelo})}
              >
                <Text style={[styles.modelBtnText, iaConfig.modeloDefecto === modelo && styles.modelBtnTextActive]}>
                  {modelo}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={styles.label}>Usar Modelo de Razonamiento</Text>
              <Text style={[styles.infoTextIA, { marginTop: 0, fontSize: 12 }]}>Activa el "Thinking Level" para mayor precisión (aumenta el tiempo de espera a 10-30s).</Text>
            </View>
            <Switch
              value={iaConfig.usarRazonamiento}
              onValueChange={(val) => setIaConfig({...iaConfig, usarRazonamiento: val})}
              trackColor={{ false: '#d1d5db', true: '#c7d2fe' }}
              thumbColor={iaConfig.usarRazonamiento ? '#4f46e5' : '#f3f4f6'}
            />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={styles.label}>Validar Rostro en Asistencia</Text>
              <Text style={[styles.infoTextIA, { marginTop: 0, fontSize: 12 }]}>
                Exige que las fotos de check-in y descansos contengan un rostro humano claro y encuadrado con el modelo de IA seleccionado. Si no hay API Key o se desactiva, se omite.
              </Text>
            </View>
            <Switch
              value={iaConfig.validarFacialAsistencia}
              onValueChange={(val) => setIaConfig({...iaConfig, validarFacialAsistencia: val})}
              trackColor={{ false: '#d1d5db', true: '#c7d2fe' }}
              thumbColor={iaConfig.validarFacialAsistencia ? '#4f46e5' : '#f3f4f6'}
            />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Creatividad (Temp)</Text>
              <TextInput
                style={styles.input}
                value={iaConfig.temperatura}
                onChangeText={(text) => setIaConfig({...iaConfig, temperatura: text.replace(/[^0-9.]/g, '')})}
                keyboardType="numeric"
                placeholder="0.4"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Max Tokens</Text>
              <TextInput
                style={styles.input}
                value={iaConfig.maxTokens}
                onChangeText={(text) => setIaConfig({...iaConfig, maxTokens: text.replace(/[^0-9]/g, '')})}
                keyboardType="numeric"
                placeholder="2048"
              />
            </View>
          </View>

        </View>

        {/* NOTIFICACIONES WHATSAPP */}
        <View style={[styles.card, { marginTop: 20, borderColor: '#dcfce7', borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.iaIconContainer, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="logo-whatsapp" size={20} color="#16a34a" />
              </View>
              <Text style={[styles.sectionTitleIA, { color: '#16a34a' }]}>
                Notificaciones WhatsApp
              </Text>
            </View>
            <Switch
              value={whatsappConfig.enabled}
              onValueChange={(val) => setWhatsappConfig({...whatsappConfig, enabled: val})}
              trackColor={{ false: '#d1d5db', true: '#bbf7d0' }}
              thumbColor={whatsappConfig.enabled ? '#16a34a' : '#f3f4f6'}
            />
          </View>

          <View style={[styles.infoCardIA, { backgroundColor: '#f0fdf4' }]}>
            <Ionicons name="information-circle" size={24} color="#16a34a" />
            <Text style={[styles.infoTextIA, { color: '#15803d' }]}>
              Activa esta opción para que al generar un reporte de caja, se envíe automáticamente en PDF vía WhatsApp usando la API configurada (Ej. Evolution API).
            </Text>
          </View>

          <Text style={styles.label}>URL Base de la API</Text>
          <TextInput
            style={styles.input}
            value={whatsappConfig.urlBase}
            onChangeText={(text) => setWhatsappConfig({...whatsappConfig, urlBase: text})}
            placeholder="http://192.168.1.100:8080"
            autoCapitalize="none"
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Session ID</Text>
              <TextInput
                style={styles.input}
                value={whatsappConfig.sessionId}
                onChangeText={(text) => setWhatsappConfig({...whatsappConfig, sessionId: text})}
                placeholder="default"
                autoCapitalize="none"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Teléfono Destino</Text>
              <TextInput
                style={styles.input}
                value={whatsappConfig.receiver}
                onChangeText={(text) => setWhatsappConfig({...whatsappConfig, receiver: text.replace(/[^0-9@g.us]/g, '')})}
                keyboardType="default"
                placeholder="573001234567"
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 8 }}>
            <Text style={[styles.label, { flex: 1, marginTop: 0 }]}>¿El destino es un Grupo?</Text>
            <Switch
              value={whatsappConfig.isGroup}
              onValueChange={(val) => setWhatsappConfig({...whatsappConfig, isGroup: val})}
              trackColor={{ false: '#d1d5db', true: '#bbf7d0' }}
              thumbColor={whatsappConfig.isGroup ? '#16a34a' : '#f3f4f6'}
            />
          </View>

          <Text style={styles.label}>Token (x-access-token)</Text>
          <TextInput
            style={styles.input}
            value={whatsappConfig.token}
            onChangeText={(text) => setWhatsappConfig({...whatsappConfig, token: text})}
            placeholder="v2.local...."
            autoCapitalize="none"
          />

          <View style={{ marginTop: 24, padding: 16, backgroundColor: '#f9fafb', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.label, { marginTop: 0, fontWeight: 'bold' }]}>Alertas de Descanso por WhatsApp</Text>
              <Switch
                value={whatsappConfig.descansoAlertEnabled}
                onValueChange={(val) => setWhatsappConfig({...whatsappConfig, descansoAlertEnabled: val})}
                trackColor={{ false: '#d1d5db', true: '#bbf7d0' }}
                thumbColor={whatsappConfig.descansoAlertEnabled ? '#16a34a' : '#f3f4f6'}
              />
            </View>
            <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Activa esta opción para notificar a los empleados cuando su tiempo de descanso esté por terminar y cuando finalice.</Text>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.label}>Tiempo Anticipación (min)</Text>
                <TextInput
                  style={styles.input}
                  value={String(whatsappConfig.descansoAnticipacionMinutos)}
                  onChangeText={(text) => setWhatsappConfig({...whatsappConfig, descansoAnticipacionMinutos: text.replace(/[^0-9]/g, '')})}
                  keyboardType="numeric"
                  placeholder="10"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.label}>Frecuencia (min)</Text>
                <TextInput
                  style={styles.input}
                  value={String(whatsappConfig.descansoFrecuenciaMinutos)}
                  onChangeText={(text) => setWhatsappConfig({...whatsappConfig, descansoFrecuenciaMinutos: text.replace(/[^0-9]/g, '')})}
                  keyboardType="numeric"
                  placeholder="5"
                />
              </View>
            </View>

            <TouchableOpacity 
              style={{ marginTop: 16, backgroundColor: '#4f46e5', padding: 12, borderRadius: 8, alignItems: 'center', opacity: testingWhatsapp ? 0.7 : 1 }} 
              onPress={fetchEmpleadosParaPrueba}
              disabled={testingWhatsapp}
            >
              {testingWhatsapp ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Probar Alerta de Descanso</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* DOMICILIOS WHATSAPP (WA-QUEUE-API-V2) */}
        <View style={[styles.card, { marginTop: 20, borderColor: '#fef08a', borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.iaIconContainer, { backgroundColor: '#fef3c7' }]}>
                <Ionicons name="bicycle" size={20} color="#d97706" />
              </View>
              <Text style={[styles.sectionTitleIA, { color: '#d97706' }]}>
                Domicilios WhatsApp (IA)
              </Text>
            </View>
            <Switch
              value={domisConfig.domisHabilitado}
              onValueChange={(val) => setDomisConfig({ ...domisConfig, domisHabilitado: val })}
              trackColor={{ false: '#d1d5db', true: '#fde68a' }}
              thumbColor={domisConfig.domisHabilitado ? '#d97706' : '#f3f4f6'}
            />
          </View>

          <View style={[styles.infoCardIA, { backgroundColor: '#fffbeb' }]}>
            <Ionicons name="information-circle" size={24} color="#d97706" />
            <Text style={[styles.infoTextIA, { color: '#b45309' }]}>
              Integra los pedidos tomados por tu Chatbot de WhatsApp con IA en la pestaña "DOMIS" de Pedidos.
            </Text>
          </View>

          {/* Webhook URL para copiar */}
          <Text style={styles.label}>URL del Webhook (Para configurar en el Bot / Panel)</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' }}>
            <TextInput
              style={{ flex: 1, fontSize: 13, color: '#374151', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}
              value={`${(api.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '')}/api/v1/domicilios/webhook`}
              editable={false}
              selectTextOnFocus
            />
            <TouchableOpacity
              onPress={() => {
                const url = `${(api.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '')}/api/v1/domicilios/webhook`;
                if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(url);
                }
                Toast.show({ type: 'info', text1: 'URL de Webhook', text2: 'Copia esta URL en los endpoints POS del bot' });
              }}
              style={{ marginLeft: 8, padding: 6, backgroundColor: '#e5e7eb', borderRadius: 6 }}
            >
              <Ionicons name="copy-outline" size={18} color="#4b5563" />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Token Secreto de Webhook (Opcional)</Text>
          <TextInput
            style={styles.input}
            value={domisConfig.domisWebhookSecret}
            onChangeText={(text) => setDomisConfig({ ...domisConfig, domisWebhookSecret: text })}
            placeholder="Ej. mi-secreto-seguro"
            autoCapitalize="none"
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 8 }}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={styles.label}>Bloquear Ventas por Domicilios Desatendidos</Text>
              <Text style={{ fontSize: 12, color: '#6b7280' }}>
                Si un pedido de WhatsApp supera el tiempo límite sin ser atendido (Tomado), se bloquea el cobro en Nueva Venta.
              </Text>
            </View>
            <Switch
              value={domisConfig.domisBloqueoVentas}
              onValueChange={(val) => setDomisConfig({ ...domisConfig, domisBloqueoVentas: val })}
              trackColor={{ false: '#d1d5db', true: '#fca5a5' }}
              thumbColor={domisConfig.domisBloqueoVentas ? '#ef4444' : '#f3f4f6'}
            />
          </View>

          <Text style={styles.label}>Tiempo Límite de Atención (Minutos)</Text>
          <TextInput
            style={styles.input}
            value={domisConfig.domisTimeoutMinutos}
            onChangeText={(text) => setDomisConfig({ ...domisConfig, domisTimeoutMinutos: text.replace(/[^0-9]/g, '') })}
            keyboardType="numeric"
            placeholder="10"
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 8 }}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={styles.label}>Alerta Sonora al Recibir Domicilio</Text>
              <Text style={{ fontSize: 12, color: '#6b7280' }}>
                Reproduce un sonido de campana de entrega al ingresar un nuevo pedido desde WhatsApp.
              </Text>
            </View>
            <Switch
              value={domisConfig.domisAlertaSonora}
              onValueChange={(val) => setDomisConfig({ ...domisConfig, domisAlertaSonora: val })}
              trackColor={{ false: '#d1d5db', true: '#fde68a' }}
              thumbColor={domisConfig.domisAlertaSonora ? '#d97706' : '#f3f4f6'}
            />
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>Prompt del Sistema para Mapeo de Platos y Promos (IA)</Text>
          <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
            Instrucciones para Gemini al interpretar los pedidos del bot. Puedes definir combos, promociones, sustituciones o sinónimos.
          </Text>
          <TextInput
            style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
            value={domisConfig.domisPromptMapeo}
            onChangeText={(text) => setDomisConfig({ ...domisConfig, domisPromptMapeo: text })}
            placeholder="Ej: Si el cliente pide 'promo alitas 2x1', mapear a 2 unidades del producto 'Porción Alitas' aplicando 50% de descuento..."
            multiline
            numberOfLines={4}
          />

          {/* SECCIÓN REGLAS DE EMPAQUES Y DESECHABLES (IA) */}
          <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#fef08a' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
                <Ionicons name="cube-outline" size={18} color="#d97706" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1f2937' }}>
                  Reglas de Empaques y Desechables (IA)
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleOpenModalRegla}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#fef3c7',
                  borderWidth: 1,
                  borderColor: '#f59e0b',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 8,
                }}
              >
                <Ionicons name="add-circle" size={16} color="#b45309" style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#b45309' }}>+ Agregar Regla</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, lineHeight: 16 }}>
              Define qué producto de empaque (caja, tapa, desechable) usa cada categoría o plato al ingresar un domicilio por WhatsApp y si se cobra como ítem adicional o va incluido.
            </Text>

            {/* Banner de Regla Estricta de Precios */}
            <View style={{ backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, padding: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="shield-checkmark" size={20} color="#2563eb" style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1e40af' }}>
                  Regla Estricta: Precios de Catálogo Protegidos
                </Text>
                <Text style={{ fontSize: 11, color: '#1e3a8a', marginTop: 2, lineHeight: 15 }}>
                  El precio unitario de los productos de catálogo NUNCA se modifica ni se le infla el valor del desechable. Los empaques y desechables se agregan como ítems independientes según las reglas a continuación.
                </Text>
              </View>
            </View>

            {reglasEmpaque.length === 0 ? (
              <View style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 14, alignItems: 'center', marginVertical: 4 }}>
                <Ionicons name="cube" size={28} color="#9ca3af" style={{ marginBottom: 4 }} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#4b5563', textAlign: 'center' }}>
                  No hay reglas de empaque configuradas
                </Text>
                <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 2 }}>
                  Pulsa "+ Agregar Regla" para asociar un empaque a una categoría o plato.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {reglasEmpaque.map((regla) => (
                  <View
                    key={regla.id}
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      padding: 12,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.04,
                      shadowRadius: 2,
                      elevation: 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                          {/* Destino: Categoría vs Plato con iconos vectoriales elegantes */}
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: regla.tipoDestino === 'CATEGORIA' ? '#eef2ff' : '#ecfdf5',
                              borderWidth: 1,
                              borderColor: regla.tipoDestino === 'CATEGORIA' ? '#c7d2fe' : '#a7f3d0',
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 6,
                            }}
                          >
                            <Ionicons
                              name={regla.tipoDestino === 'CATEGORIA' ? 'folder-outline' : 'restaurant-outline'}
                              size={13}
                              color={regla.tipoDestino === 'CATEGORIA' ? '#4f46e5' : '#059669'}
                              style={{ marginRight: 4 }}
                            />
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '700',
                                color: regla.tipoDestino === 'CATEGORIA' ? '#3730a3' : '#065f46',
                              }}
                            >
                              {regla.tipoDestino === 'CATEGORIA'
                                ? `CATEGORÍA: ${regla.categoriaNombre}`
                                : `PLATO: ${regla.productoNombre}`}
                            </Text>
                          </View>

                          {/* Cobro: Incluido vs Extra con icono vectorial */}
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: regla.cobrarAlCliente ? '#fffbeb' : '#f8fafc',
                              borderWidth: 1,
                              borderColor: regla.cobrarAlCliente ? '#fde68a' : '#e2e8f0',
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 6,
                            }}
                          >
                            <Ionicons
                              name={regla.cobrarAlCliente ? 'cash-outline' : 'checkmark-circle-outline'}
                              size={13}
                              color={regla.cobrarAlCliente ? '#d97706' : '#64748b'}
                              style={{ marginRight: 4 }}
                            />
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '700',
                                color: regla.cobrarAlCliente ? '#b45309' : '#475569',
                              }}
                            >
                              {regla.cobrarAlCliente
                                ? 'Cobrar al cliente (Ítem extra)'
                                : 'Incluido en plato (Nota $0)'}
                            </Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                          <Ionicons name="cube-outline" size={14} color="#d97706" style={{ marginRight: 5 }} />
                          <Text style={{ fontSize: 13, color: '#1f2937' }}>
                            Lleva <Text style={{ fontWeight: '700', color: '#d97706' }}>{regla.cantidadPorPlato}x</Text> {regla.empaqueProductoNombre}
                          </Text>
                        </View>
                      </View>

                      {/* Botones de Acción: Editar y Eliminar */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TouchableOpacity
                          onPress={() => handleEditarRegla(regla)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 8,
                            paddingVertical: 6,
                            borderRadius: 6,
                            backgroundColor: '#eef2ff',
                            borderWidth: 1,
                            borderColor: '#c7d2fe',
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="create-outline" size={15} color="#4f46e5" style={{ marginRight: 3 }} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#4f46e5' }}>Editar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            if (Platform.OS === 'web') {
                              if (window.confirm('¿Eliminar esta regla de empaque?')) {
                                setReglasEmpaque((prev) => prev.filter((r) => r.id !== regla.id));
                              }
                            } else {
                              Alert.alert('Eliminar Regla', '¿Deseas eliminar esta regla de empaque?', [
                                { text: 'Cancelar', style: 'cancel' },
                                {
                                  text: 'Eliminar',
                                  style: 'destructive',
                                  onPress: () => setReglasEmpaque((prev) => prev.filter((r) => r.id !== regla.id)),
                                },
                              ]);
                            }
                          }}
                          style={{
                            padding: 6,
                            borderRadius: 6,
                            backgroundColor: '#fee2e2',
                            borderWidth: 1,
                            borderColor: '#fca5a5',
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={15} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 85, 85) }]}>
        <TouchableOpacity 
          style={[styles.saveButton, saving && { opacity: 0.7 }]} 
          onPress={handleSave} 
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.saveButtonText}>Guardar Configuración</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Modal para Seleccionar Empleado en Descanso */}
      <Modal visible={showTestModal} transparent={true} animationType="fade" onRequestClose={() => setShowTestModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Probar Configuración de WhatsApp</Text>
            <Text style={{ marginBottom: 12, color: '#4b5563', fontSize: 14 }}>Selecciona cualquier empleado con teléfono configurado para enviarle un mensaje de prueba genérico de conexión.</Text>
            
            <SearchableSelect
              label="Empleado Destino"
              placeholder="Seleccione un empleado"
              title="Seleccionar Empleado para Prueba"
              searchPlaceholder="Buscar empleado por nombre o teléfono..."
              options={empleadoOptions}
              selectedValue={selectedEmpleadoId}
              onSelect={(val) => setSelectedEmpleadoId(val)}
              leadingIcon="person-outline"
            />

            {testApiError && (
              <View style={{ marginTop: 15, padding: 10, backgroundColor: '#fef2f2', borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5' }}>
                <Text style={{ color: '#991b1b', fontWeight: 'bold', marginBottom: 4 }}>Respuesta de la API:</Text>
                <Text style={{ color: '#7f1d1d', fontSize: 13, fontFamily: 'monospace' }}>
                  {testApiError}
                </Text>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowTestModal(false)} disabled={testingWhatsapp}>
                <Text style={styles.modalCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={[styles.modalSubmitBtn, testingWhatsapp && { opacity: 0.7 }]} onPress={handleTestWhatsapp} disabled={testingWhatsapp}>
                {testingWhatsapp ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Enviar Prueba</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal para Agregar Regla de Empaque / Acompañamiento */}
      <Modal visible={modalReglaVisible} transparent={true} animationType="fade" onRequestClose={() => setModalReglaVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '88%', padding: 20 }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <View style={[styles.iaIconContainer, { backgroundColor: '#fef3c7', marginRight: 10 }]}>
                  <Ionicons name={reglaEditandoId ? "create" : "cube"} size={20} color="#d97706" />
                </View>
                <Text style={styles.modalTitle}>
                  {reglaEditandoId ? 'Editar Regla de Empaque (IA)' : 'Nueva Regla de Empaque (IA)'}
                </Text>
              </View>

              <Text style={{ fontSize: 13, color: '#4b5563', marginBottom: 14, lineHeight: 18 }}>
                {reglaEditandoId
                  ? 'Modifica los parámetros de empaque, cantidades y modo de cobro para esta regla.'
                  : 'Asocia qué producto de catálogo (caja, vaso, tapa, desechable) debe acompañar a tus pedidos cuando entren por WhatsApp. Puedes seleccionar múltiples ítems para aplicarles la regla en lote.'}
              </Text>

              {/* Selector de Destino: Categoría vs Plato */}
              <Text style={styles.label}>Aplicar a:</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <TouchableOpacity
                  style={[
                    styles.modelBtn,
                    { flex: 1, alignItems: 'center' },
                    nuevaRegla.tipoDestino === 'CATEGORIA' && styles.modelBtnActive,
                  ]}
                  onPress={() => setNuevaRegla({ ...nuevaRegla, tipoDestino: 'CATEGORIA' })}
                >
                  <Text style={[styles.modelBtnText, nuevaRegla.tipoDestino === 'CATEGORIA' && styles.modelBtnTextActive]}>
                    Por Categoría
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modelBtn,
                    { flex: 1, alignItems: 'center' },
                    nuevaRegla.tipoDestino === 'PRODUCTO' && styles.modelBtnActive,
                  ]}
                  onPress={() => setNuevaRegla({ ...nuevaRegla, tipoDestino: 'PRODUCTO' })}
                >
                  <Text style={[styles.modelBtnText, nuevaRegla.tipoDestino === 'PRODUCTO' && styles.modelBtnTextActive]}>
                    Por Plato Específico
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Si es por Categoría */}
              {nuevaRegla.tipoDestino === 'CATEGORIA' ? (
                <SearchableSelect
                  label={reglaEditandoId ? "Selecciona la Categoría" : "Selecciona las Categorías (Selección múltiple)"}
                  title="Seleccionar Categorías del Catálogo"
                  placeholder={reglaEditandoId ? "-- Seleccionar Categoría --" : "-- Seleccionar Categorías (puedes elegir varias) --"}
                  searchPlaceholder="Buscar categoría (ej. Hamburguesas, Salchipapas)..."
                  options={categoriaOptions}
                  isMultiSelect={!reglaEditandoId}
                  selectedValues={categoriasSeleccionadas}
                  onSelectMultiple={(vals) => {
                    setCategoriasSeleccionadas(vals);
                    if (vals.length > 0) {
                      setNuevaRegla((prev) => ({ ...prev, categoriaNombre: vals[0] }));
                    }
                  }}
                  selectedValue={nuevaRegla.categoriaNombre}
                  onSelect={(val) => {
                    setNuevaRegla((prev) => ({ ...prev, categoriaNombre: val }));
                    setCategoriasSeleccionadas([val]);
                  }}
                  leadingIcon="folder-outline"
                />
              ) : (
                <SearchableSelect
                  label={reglaEditandoId ? "Selecciona el Plato Específico" : "Selecciona los Platos (Selección múltiple)"}
                  title="Seleccionar Platos del Catálogo"
                  placeholder={reglaEditandoId ? "-- Seleccionar Plato --" : "-- Seleccionar Platos (puedes elegir varios) --"}
                  searchPlaceholder="Buscar plato por nombre o categoría..."
                  options={platoOptions}
                  isMultiSelect={!reglaEditandoId}
                  selectedValues={productosSeleccionados}
                  onSelectMultiple={(vals, opts) => {
                    setProductosSeleccionados(vals);
                    if (vals.length > 0) {
                      const firstOpt = opts[0];
                      setNuevaRegla((prev) => ({
                        ...prev,
                        productoId: vals[0],
                        productoNombre: firstOpt?.label || '',
                      }));
                    }
                  }}
                  selectedValue={nuevaRegla.productoId}
                  onSelect={(val, opt) => {
                    setNuevaRegla((prev) => ({
                      ...prev,
                      productoId: val,
                      productoNombre: opt?.label || '',
                    }));
                    setProductosSeleccionados([val]);
                  }}
                  leadingIcon="restaurant-outline"
                />
              )}

              {/* Producto de Empaque / Acompañamiento */}
              <SearchableSelect
                label="Producto de Empaque / Acompañamiento (del catálogo)"
                title="Seleccionar Producto de Empaque"
                placeholder="-- Seleccionar Producto de Empaque --"
                searchPlaceholder="Buscar empaque (caja, vaso, tapa, bolsa)..."
                options={empaqueOptions}
                selectedValue={nuevaRegla.empaqueProductoId}
                onSelect={(val, opt) => {
                  setNuevaRegla({
                    ...nuevaRegla,
                    empaqueProductoId: val,
                    empaqueProductoNombre: opt?.label || '',
                  });
                }}
                leadingIcon="cube-outline"
                showQuickEmpaquesFilter={true}
              />

              {/* Cantidad por plato */}
              <Text style={styles.label}>Cantidad de empaque por cada plato</Text>
              <TextInput
                style={[styles.input, { marginBottom: 14 }]}
                value={nuevaRegla.cantidadPorPlato}
                onChangeText={(text) => setNuevaRegla({ ...nuevaRegla, cantidadPorPlato: text.replace(/[^0-9]/g, '') })}
                keyboardType="numeric"
                placeholder="1"
              />

              {/* Modo de cobro */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <Text style={styles.label}>¿Cobrar este empaque al cliente?</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>
                    {nuevaRegla.cobrarAlCliente
                      ? 'Sí: Se agregará como producto independiente con su precio de catálogo en la orden.'
                      : 'No: Viene incluido en el plato. La IA lo anotará como referencia de empaque con precio $0 en observaciones.'}
                  </Text>
                </View>
                <Switch
                  value={nuevaRegla.cobrarAlCliente}
                  onValueChange={(val) => setNuevaRegla({ ...nuevaRegla, cobrarAlCliente: val })}
                  trackColor={{ false: '#d1d5db', true: '#fde68a' }}
                  thumbColor={nuevaRegla.cobrarAlCliente ? '#d97706' : '#f3f4f6'}
                />
              </View>

              {/* Botones de acción del Modal */}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setModalReglaVisible(false)}
                >
                  <Text style={styles.modalCancelBtnText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalSubmitBtn, { backgroundColor: '#d97706' }]}
                  onPress={handleGuardarNuevaRegla}
                >
                  <Text style={styles.modalSubmitBtnText}>
                    {reglaEditandoId ? 'Actualizar Regla' : 'Guardar Regla(s)'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: { padding: 8, marginRight: 8 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  content: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937', marginBottom: 12 },
  infoCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe'
  },
  infoText: { flex: 1, marginLeft: 12, fontSize: 13, color: '#1e40af', lineHeight: 20 },
  infoCardIA: {
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    marginBottom: 16,
  },
  infoTextIA: { flex: 1, marginLeft: 12, fontSize: 13, color: '#4338ca', lineHeight: 20 },
  iaIconContainer: {
    backgroundColor: '#e0e7ff',
    padding: 8,
    borderRadius: 8,
    marginRight: 10
  },
  sectionTitleIA: { fontSize: 18, fontWeight: 'bold', color: '#4f46e5' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 8 },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', marginBottom: 12 },
  timeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  modelButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  timePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c7d2fe'
  },
  timePickerText: { fontSize: 24, fontWeight: 'bold', color: '#4f46e5' },
  modelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  modelBtnActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  modelBtnText: { fontSize: 13, color: '#4b5563', fontWeight: '500' },
  modelBtnTextActive: { color: '#ffffff' },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  saveButton: {
    backgroundColor: '#4f46e5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#111827'
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    marginBottom: 20,
    overflow: 'hidden'
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 12
  },
  modalCancelBtnText: {
    color: '#6b7280',
    fontWeight: 'bold'
  },
  modalSubmitBtn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8
  },
  modalSubmitBtnText: {
    color: '#fff',
    fontWeight: 'bold'
  }
});