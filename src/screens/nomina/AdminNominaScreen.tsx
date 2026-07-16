import React, { useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Switch, Platform, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Text } from '../../components/ui/text';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import api from '../../services/api';
import { Picker } from '@react-native-picker/picker';
import { getResumenEmpleadoAdmin, liquidarEmpleado, getTurnos, updateTurnoAdmin, deleteTurno, getLiquidaciones, getLiquidacionById, reenviarNotificacionFirma, firmarLiquidacionAdmin, agregarDescuentoExtraLiquidacion, deshacerLiquidacion } from '../../services/nomina.service';
import { useCustomAlert } from '../../context/CustomAlertContext';
import TurnoManualModal from './TurnoManualModal';
import SignatureModal from '../../components/ui/SignatureModal';
let Print: any = null;
try {
  Print = require('expo-print');
} catch (e) {
  console.warn('expo-print no está disponible');
}
let Sharing: any = null;
try {
  Sharing = require('expo-sharing');
} catch (e) {
  console.warn('expo-sharing no está disponible');
}
import { generarLiquidacionHTML } from '../../utils/nominaPdf';

export default function AdminNominaScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { showAlert } = useCustomAlert();
  
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [turnosHoy, setTurnosHoy] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'Todos' | 'Activos' | 'Liquidados'>('Todos');
  const [liquidaciones, setLiquidaciones] = useState<any[]>([]);
  const [loadingLiquidaciones, setLoadingLiquidaciones] = useState(false);
  
  // Modal states for Liquidación / Resumen
  const [selectedEmpleado, setSelectedEmpleado] = useState<any>(null);
  const [resumen, setResumen] = useState<any>(null);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [liquidando, setLiquidando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [minDateLiquidacion, setMinDateLiquidacion] = useState('');
  const [maxDateLiquidacion, setMaxDateLiquidacion] = useState('');

  // Modal states for Historial de Turnos
  const [historyEmpleado, setHistoryEmpleado] = useState<any>(null);
  const [historyTurnos, setHistoryTurnos] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Edit Turno State
  const [editingTurno, setEditingTurno] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [savingTurno, setSavingTurno] = useState(false);
  
  // Date Picker State
  const [pickerConfig, setPickerConfig] = useState<{show: boolean, mode: 'date'|'time', field: 'horaEntrada'|'horaSalida'}>({show: false, mode: 'date', field: 'horaEntrada'});

  // Llegadas Tarde State
  const [showLlegadasModal, setShowLlegadasModal] = useState(false);
  const [showTurnosAnteriores, setShowTurnosAnteriores] = useState(false);
  const [selectedExtraTurnos, setSelectedExtraTurnos] = useState<string[]>([]);
  const [selectedLlegadas, setSelectedLlegadas] = useState<string[]>([]);
  const [aplicandoLlegadas, setAplicandoLlegadas] = useState(false);

  // Turnos Manuales
  const [showTurnoManualModal, setShowTurnoManualModal] = useState(false);
  const [empleadoTurnoManual, setEmpleadoTurnoManual] = useState(null);

  // Firma Admin
  const [showSignatureAdmin, setShowSignatureAdmin] = useState(false);
  const [firmaAdmin, setFirmaAdmin] = useState<string>('');
  const [liquidacionParaFirmaAdmin, setLiquidacionParaFirmaAdmin] = useState<string | null>(null);

  // Extra Discount
  const [showDescuentoExtraModal, setShowDescuentoExtraModal] = useState(false);
  const [descuentoExtraLiqId, setDescuentoExtraLiqId] = useState<string | null>(null);
  const [extraConcepto, setExtraConcepto] = useState('DESCUADRE_CAJA');
  const [extraDescripcion, setExtraDescripcion] = useState('');
  const [extraValor, setExtraValor] = useState('');
  const [guardandoDescuentoExtra, setGuardandoDescuentoExtra] = useState(false);

  useEffect(() => {
    loadData();
    loadLiquidaciones();
  }, []);

  const loadLiquidaciones = async () => {
    try {
      setLoadingLiquidaciones(true);
      const res = await getLiquidaciones({ limit: 50, _t: Date.now() } as any);
      setLiquidaciones(res.data || []);
    } catch (error) {
      console.error('Error cargando liquidaciones:', error);
    } finally {
      setLoadingLiquidaciones(false);
    }
  };

  const [deshaciendo, setDeshaciendo] = useState(false);
  const [confirmDeshacerId, setConfirmDeshacerId] = useState<string | null>(null);

  const handleReenviarNotificacion = async (id: string) => {
    try {
      await reenviarNotificacionFirma(id);
      showAlert({ type: 'success', title: 'Éxito', message: 'Notificación reenviada al empleado' });
    } catch (e: any) {
      showAlert({ type: 'error', title: 'Error', message: e.response?.data?.message || 'No se pudo reenviar' });
    }
  };

  const handleDeshacerLiquidacion = async (id: string) => {
    setConfirmDeshacerId(id);
  };

  const ejecutarDeshacer = async () => {
    if (!confirmDeshacerId) return;
    try {
      setDeshaciendo(true);
      const res = await deshacerLiquidacion(confirmDeshacerId);
      showAlert({ type: 'success', title: 'Éxito', message: res?.data?.mensaje || 'Liquidación deshecha' });
      setConfirmDeshacerId(null);
      loadLiquidaciones();
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Error al deshacer la liquidación';
      showAlert({ type: 'error', title: 'Error', message: Array.isArray(msg) ? msg[0] : msg });
    } finally {
      setDeshaciendo(false);
    }
  };

  const handleSaveSignature = async (signatureBase64: string) => {
    // Si estamos firmando una liquidación ya existente:
    if (liquidacionParaFirmaAdmin) {
      try {
        setLiquidando(true);
        await firmarLiquidacionAdmin(liquidacionParaFirmaAdmin, { firma: signatureBase64 });
        showAlert({ type: 'success', title: 'Éxito', message: 'Firma de administrador guardada correctamente' });
        setLiquidacionParaFirmaAdmin(null);
        setShowSignatureAdmin(false);
        await loadLiquidaciones();
      } catch (e: any) {
        showAlert({ type: 'error', title: 'Error', message: e.response?.data?.message || 'No se pudo guardar la firma' });
        setShowSignatureAdmin(false);
        setLiquidacionParaFirmaAdmin(null);
      } finally {
        setLiquidando(false);
      }
      return;
    }

    // Si estamos generando una liquidación nueva:
    if (empleadoALiquidar.current) {
      setLiquidando(true);
      try {
        const { minDate, maxDate } = getLiquidacionDates();
        const res = await liquidarEmpleado({
          usuarioId: empleadoALiquidar.current.IDusuarios,
          fechaDesde: minDate as string,
          fechaHasta: maxDate as string,
          extraTurnosIds: selectedExtraTurnos,
          firmaAdmin: signatureBase64,
        });

        showAlert({ type: 'success', title: 'Éxito', message: res?.mensaje || 'Liquidación generada con éxito' });
        empleadoALiquidar.current = null;
        setShowSignatureAdmin(false);
        setSelectedEmpleado(null); // Cierra el modal de resumen
        await loadLiquidaciones();
      } catch (error: any) {
        console.error(error);
        const msg = error?.response?.data?.message || 'Error al liquidar al empleado';
        showAlert({ type: 'error', title: 'Error', message: Array.isArray(msg) ? msg[0] : msg });
        setShowSignatureAdmin(false);
        empleadoALiquidar.current = null;
      } finally {
        setLiquidando(false);
      }
      return;
    }
  };

  const handleSaveDescuentoExtra = async () => {
    if (!descuentoExtraLiqId) return;
    if (!extraValor || isNaN(Number(extraValor))) {
      return showAlert({ type: 'error', title: 'Aviso', message: 'El valor debe ser numérico' });
    }
    if (!extraDescripcion.trim()) {
      return showAlert({ type: 'error', title: 'Aviso', message: 'Debe ingresar una descripción' });
    }
    setGuardandoDescuentoExtra(true);
    try {
      await agregarDescuentoExtraLiquidacion(descuentoExtraLiqId, {
        concepto: extraConcepto,
        descripcion: extraDescripcion,
        valor: Number(extraValor)
      });
      showAlert({ type: 'success', title: 'Éxito', message: 'Descuento extra aplicado' });
      setShowDescuentoExtraModal(false);
      setExtraDescripcion('');
      setExtraValor('');
      await loadLiquidaciones();
    } catch (e: any) {
      showAlert({ type: 'error', title: 'Error', message: e.response?.data?.message || 'No se pudo agregar el descuento' });
    } finally {
      setGuardandoDescuentoExtra(false);
    }
  };

  const abrirPdfDesdeHTML = async (html: string, nombreArchivo = 'Liquidacion_Nomina.pdf') => {
    if (Platform.OS === 'web') {
      // Web: expo-print's printToFileAsync is NOT supported on web.
      // The reliable approach is to open a new tab, write the HTML, and trigger print().
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        // Give the browser time to render the HTML before triggering the print dialog
        setTimeout(() => { printWindow.print(); }, 600);
      } else {
        showAlert({ type: 'error', title: 'Error', message: 'El navegador bloqueó la ventana emergente. Por favor, permite las ventanas emergentes para este sitio e intenta de nuevo.' });
      }
      return;
    }


    if (!Print) return showAlert({ type: 'error', title: 'Error', message: 'Módulo PDF no disponible' });

    let FileSystem: any = null;
    try { FileSystem = require('expo-file-system/legacy'); } catch (_) {}

    const { uri } = await Print.printToFileAsync({ html, base64: false });

    if (Platform.OS === 'android' && FileSystem) {
      const SAF_KEY = '@saf_downloads_directory';
      let directoryUri = await AsyncStorage.getItem(SAF_KEY);
      if (!directoryUri) {
        showAlert({ type: 'info', title: 'Configurar Descargas', message: 'Por favor selecciona tu carpeta "Descargas" o "Downloads" en la siguiente pantalla. Solo tendrás que hacerlo esta vez.' });
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          directoryUri = permissions.directoryUri;
          await AsyncStorage.setItem(SAF_KEY, directoryUri);
        } else {
          return;
        }
      }
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const newUri = await FileSystem.StorageAccessFramework.createFileAsync(directoryUri!, nombreArchivo, 'application/pdf');
        await FileSystem.writeAsStringAsync(newUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        showAlert({ type: 'success', title: 'Descarga Exitosa', message: `Guardado en Descargas: ${nombreArchivo}` });
        try {
          const contentUri = await FileSystem.getContentUriAsync(uri);
          const IntentLauncher = require('expo-intent-launcher');
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: contentUri,
            flags: 1,
            type: 'application/pdf',
          });
        } catch (openError: any) {
          if (Sharing && await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Abrir PDF' });
          }
        }
      } catch (safError) {
        await AsyncStorage.removeItem(SAF_KEY);
        showAlert({ type: 'error', title: 'Error de Carpeta', message: 'El permiso de la carpeta expiró. Intenta de nuevo para reasignarla.' });
      }
    } else {
      // iOS / fallback
      if (Sharing && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: 'Comprobante de Liquidación' });
      } else {
        showAlert({ type: 'info', title: 'PDF Generado', message: `Archivo guardado en: ${uri}` });
      }
    }
  };

  const handleVerPDF = async (liquidacion: any) => {
    try {
      // Fetch full record to get turnosDetalle and descuentosDetalle which are not included in the list response
      const full = await getLiquidacionById(liquidacion.IDliquidacion);
      const liq = full || liquidacion;
      const now = new Date();
      const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      const fileName = `Liquidacion_${(liq.usuario?.nombre || 'Empleado').replace(/\s+/g,'_')}_${now.getDate()}_${meses[now.getMonth()]}_${now.getFullYear()}.pdf`;
      const sortByFechaDesc = (arr: any[]) =>
        [...arr].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

      const html = generarLiquidacionHTML({
        empleadoNombre: liq.usuario?.nombre || 'Empleado',
        empleadoCargo: liq.usuario?.cargo?.nombre || 'Sin Cargo',
        cargo: liq.usuario?.cargo,
        minutosGracia: liq.minutosGracia ?? 5,
        fechaInicio: liq.fechaInicio,
        fechaFin: liq.fechaFin,
        turnos: sortByFechaDesc((liq.turnosDetalle as any[]) || []),
        descuentos: sortByFechaDesc((liq.descuentosDetalle as any[]) || []),
        totalBruto: liq.totalBruto,
        totalDescuentos: liq.totalDescuentos,
        totalNeto: liq.totalNeto,
        firmaAdmin: liq.firmaAdmin,
        firmaEmpleado: liq.firmaEmpleado,
      });
      await abrirPdfDesdeHTML(html, fileName);
    } catch (e) {
      showAlert({ type: 'error', title: 'Error', message: 'No se pudo generar el PDF' });
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      const resUsuarios = await api.get('/usuarios');
      const usuariosActivos = (resUsuarios.data?.data || []).filter((u: any) => u.isActive);
      setEmpleados(usuariosActivos);

      const now = new Date();
      const colombiaTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));
      
      const y = colombiaTime.getUTCFullYear();
      const m = colombiaTime.getUTCMonth();
      const d = colombiaTime.getUTCDate();

      const hoyUTC = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
      const finHoyUTC = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));

      const resTurnos = await getTurnos({ 
        fechaDesde: hoyUTC.toISOString(), 
        fechaHasta: finHoyUTC.toISOString(),
        limit: 100
      });
      
      const resActivos = await getTurnos({
        estado: 'ACTIVO',
        limit: 100
      });

      const combined = [...(resTurnos.data || []), ...(resActivos.data || [])];
      const uniqueTurnos = Array.from(new Map(combined.map(t => [t.IDturno, t])).values());

      setTurnosHoy(uniqueTurnos);

    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudieron cargar los datos' });
    } finally {
      setLoading(false);
    }
  };

  
  const getCurrentQuincena = () => {
    const now = new Date();
    const offsetMs = 5 * 60 * 60 * 1000;
    const colombiaTime = new Date(now.getTime() - offsetMs);

    const year = colombiaTime.getUTCFullYear();
    const month = colombiaTime.getUTCMonth();
    const date = colombiaTime.getUTCDate();

    let startDay = 1;
    let endDay = 15;

    if (date > 15) {
      startDay = 16;
      endDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    }

    const fechaDesde = new Date(Date.UTC(year, month, startDay, 0, 0, 0, 0));
    const fechaHasta = new Date(Date.UTC(year, month, endDay, 23, 59, 59, 999));

    return {
      fechaDesde: fechaDesde.toISOString(),
      fechaHasta: fechaHasta.toISOString()
    };
  };

  const STORAGE_KEY = (id: string) => `extraTurnos_${id}`;

  const saveExtraTurnos = async (empleadoId: string, ids: string[]) => {
    try {
      const value = JSON.stringify(ids);
      if (Platform.OS === 'web') {
        localStorage.setItem(STORAGE_KEY(empleadoId), value);
      } else {
        await AsyncStorage.setItem(STORAGE_KEY(empleadoId), value);
      }
    } catch (e) {
      console.warn('No se pudo guardar la selección de turnos', e);
    }
  };

  const loadExtraTurnos = async (empleadoId: string): Promise<string[]> => {
    try {
      let value: string | null = null;
      if (Platform.OS === 'web') {
        value = localStorage.getItem(STORAGE_KEY(empleadoId));
      } else {
        value = await AsyncStorage.getItem(STORAGE_KEY(empleadoId));
      }
      return value ? JSON.parse(value) : [];
    } catch (e) {
      return [];
    }
  };

  const clearExtraTurnos = async (empleadoId: string) => {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(STORAGE_KEY(empleadoId));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY(empleadoId));
      }
    } catch (e) {}
  };

  const openResumen = async (empleado: any) => {
    setSelectedEmpleado(empleado);
    try {
      setLoadingResumen(true);
      const { fechaDesde, fechaHasta } = getCurrentQuincena();
      const [res, savedIds] = await Promise.all([
        getResumenEmpleadoAdmin(empleado.IDusuarios, { fechaDesde, fechaHasta }),
        loadExtraTurnos(empleado.IDusuarios),
      ]);
      setResumen(res.data);
      const validIds = (res.data?.turnosAnteriores || []).map((t: any) => t.IDturno);
      setSelectedExtraTurnos(savedIds.filter((id: string) => validIds.includes(id)));
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudo cargar el resumen del empleado' });
      setSelectedEmpleado(null);
    } finally {
      setLoadingResumen(false);
    }
  };

  const openHistory = async (empleado: any) => {
    setHistoryEmpleado(empleado);
    try {
      setLoadingHistory(true);
      const res = await getTurnos({ usuarioId: empleado.IDusuarios, limit: 30 });
      setHistoryTurnos(res.data || []);
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudo cargar el historial de turnos' });
      setHistoryEmpleado(null);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleDeleteTurno = (turno: any) => {
    showAlert({
      type: 'confirm',
      title: 'Eliminar Turno',
      message: '¿Estás seguro de que quieres eliminar este turno permanentemente?',
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          await deleteTurno(turno.IDturno);
          showAlert({ type: 'success', title: 'Éxito', message: 'Turno eliminado' });
          if (historyEmpleado) openHistory(historyEmpleado);
          loadData(); 
        } catch (error) {
          showAlert({ type: 'error', title: 'Error', message: 'No se pudo eliminar el turno' });
        }
      }
    });
  };

  const handleEditTurno = (turno: any) => {
    setEditingTurno(turno);
    setEditForm({
      estado: turno.estado,
      horaEntrada: new Date(turno.horaEntrada).toISOString(),
      horaSalida: turno.horaSalida ? new Date(turno.horaSalida).toISOString() : '',
      ceno: !!turno.ceno,
      valorTurno: turno.valorTurno?.toString() || '0'
    });
  };

  const handleSaveTurno = async () => {
    try {
      setSavingTurno(true);

      const payload: any = {
        estado: editForm.estado,
        ceno: editForm.ceno,
        valorTurno: Number(editForm.valorTurno),
        horaEntrada: editForm.horaEntrada
          ? new Date(editForm.horaEntrada).toISOString()
          : undefined,
        horaSalida: editForm.horaSalida
          ? new Date(editForm.horaSalida).toISOString()
          : undefined,
      };
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      await updateTurnoAdmin(editingTurno.IDturno, payload);
      showAlert({ type: 'success', title: 'Éxito', message: 'Turno actualizado correctamente' });
      setEditingTurno(null);
      if (historyEmpleado) openHistory(historyEmpleado);
      loadData();
    } catch (error: any) {
      console.error(error);
      const msg = error?.response?.data?.message || 'No se pudo guardar el turno';
      showAlert({ type: 'error', title: 'Error', message: Array.isArray(msg) ? msg[0] : msg });
    } finally {
      setSavingTurno(false);
    }
  };

  
  const handleOpenLlegadas = () => {
    const pendientes = (resumen?.descuentos || []).filter((d: any) => d.concepto === 'LLEGADA_TARDE' && d.estado === 'PENDIENTE');
    setSelectedLlegadas(pendientes.map((d: any) => d.IDdescuento));
    setShowLlegadasModal(true);
  };

  const handleAplicarLlegadas = async () => {
    if (selectedLlegadas.length === 0) {
      return showAlert({ type: 'error', title: 'Aviso', message: 'Selecciona al menos una llegada tarde para aplicar' });
    }
    try {
      setAplicandoLlegadas(true);
      await api.post('/nomina/llegadas-tarde/aplicar', { descuentoIds: selectedLlegadas });
      showAlert({ type: 'success', title: 'Éxito', message: 'Descuentos aplicados correctamente' });
      setShowLlegadasModal(false);
      if (selectedEmpleado) openResumen(selectedEmpleado);
      loadData();
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudieron aplicar los descuentos' });
    } finally {
      setAplicandoLlegadas(false);
    }
  };

  const getLiquidacionDates = () => {
    const { fechaDesde, fechaHasta } = getCurrentQuincena();
    return { minDate: fechaDesde, maxDate: fechaHasta };
  };

  const previewPdf = async () => {
    if (!selectedEmpleado || !resumen) return;
    const { minDate, maxDate } = getLiquidacionDates();
    if (!minDate || !maxDate) return;

    const extraTurnosToPDF = (resumen.turnosAnteriores || []).filter((t: any) => selectedExtraTurnos.includes(t.IDturno));
    const extraBrutoToPDF = extraTurnosToPDF.reduce((sum: number, t: any) => sum + Number(t.valorTurno), 0);

    const now = new Date();
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fileName = `Resumen_${(selectedEmpleado.nombre || 'Empleado').replace(/\s+/g,'_')}_${now.getDate()}_${meses[now.getMonth()]}_${now.getFullYear()}.pdf`;

    const html = generarLiquidacionHTML({
      empleadoNombre: selectedEmpleado.nombre,
      empleadoCargo: selectedEmpleado.cargo?.nombre || 'Empleado',
      cargo: selectedEmpleado.cargo,
      minutosGracia: resumen.minutosGracia ?? 5,
      fechaInicio: minDate,
      fechaFin: maxDate,
      turnos: [...(resumen.turnos || []), ...extraTurnosToPDF],
      descuentos: (resumen.descuentos || []).filter((d: any) => !(d.concepto === 'LLEGADA_TARDE' && d.estado === 'PENDIENTE')),
      totalBruto: (resumen.totalBruto || 0) + extraBrutoToPDF,
      totalDescuentos: resumen.totalDescuentos,
      totalNeto: (resumen.totalNeto || 0) + extraBrutoToPDF,
      firmaAdmin: firmaAdmin,
    });
    
    await abrirPdfDesdeHTML(html, fileName);
  };

  const empleadoALiquidar = useRef<any>(null);

  const handleLiquidar = () => {
    const hasTurnos = resumen?.turnos && resumen.turnos.length > 0;
    const hasDescuentos = resumen?.descuentos && resumen.descuentos.length > 0;

    if (!hasTurnos && !hasDescuentos) {
      return showAlert({ type: 'error', title: 'Aviso', message: 'No hay turnos ni descuentos pendientes por liquidar' });
    }

    const { minDate, maxDate } = getLiquidacionDates();
    setMinDateLiquidacion(minDate as string);
    setMaxDateLiquidacion(maxDate as string);

    showAlert({
      type: 'confirm',
      title: 'Liquidar Empleado',
      message: `¿Estás seguro de liquidar a ${selectedEmpleado.nombre} por un total de $${Number(resumen.totalNeto).toLocaleString('es-CO')}?\n\nPresiona "Liquidar" para continuar y firmar el documento.`,
      confirmText: 'Liquidar',
      onConfirm: () => {
        empleadoALiquidar.current = selectedEmpleado;
        setShowSignatureAdmin(true);
      }
    });
  };

  const handleRecalcular = async () => {
    try {
      setRecalculando(true);
      const res = await api.post(`/nomina/recalcular/${selectedEmpleado.IDusuarios}`);
      showAlert({ type: 'success', title: 'Éxito', message: res.data?.mensaje || 'Turnos recalculados' });
      const { fechaDesde, fechaHasta } = getCurrentQuincena();
      const resUpdated = await getResumenEmpleadoAdmin(selectedEmpleado.IDusuarios, { fechaDesde, fechaHasta });
      setResumen(resUpdated.data);
    } catch (error: any) {
      console.error(error);
      const msg = error?.response?.data?.message || 'Error al recalcular turnos';
      showAlert({ type: 'error', title: 'Error', message: Array.isArray(msg) ? msg[0] : msg });
    } finally {
      setRecalculando(false);
    }
  };

  const getStatusTurnoHoy = (usuarioId: string) => {
    const turnoActivo = turnosHoy.find(t => t.usuarioId === usuarioId && t.estado === 'ACTIVO');
    if (turnoActivo) {
      return { 
        text: `En turno (Inició ${new Date(turnoActivo.horaEntrada).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'})})`, 
        color: '#10b981', 
        icon: 'checkmark-circle' 
      };
    }

    const turnoCerradoHoy = turnosHoy.find(t => {
      if (t.usuarioId !== usuarioId || t.estado === 'ACTIVO') return false;
      const entrada = new Date(t.horaEntrada);
      const colombiaTime = new Date(entrada.getTime() - (5 * 60 * 60 * 1000));
      const today = new Date();
      const todayColombia = new Date(today.getTime() - (5 * 60 * 60 * 1000));
      return colombiaTime.getUTCFullYear() === todayColombia.getUTCFullYear() &&
             colombiaTime.getUTCMonth() === todayColombia.getUTCMonth() &&
             colombiaTime.getUTCDate() === todayColombia.getUTCDate();
    });

    if (turnoCerradoHoy) {
      return { text: 'Turno cerrado hoy', color: '#6b7280', icon: 'time' };
    }

    return { text: 'No ha iniciado turno hoy', color: '#ef4444', icon: 'close-circle' };
  };

  const empleadosFiltrados = empleados.filter(emp => {
    if (filterTab === 'Todos') return true;
    return turnosHoy.some(t => t.usuarioId === emp.IDusuarios && t.estado === 'ACTIVO');
  });

  const handleValorChange = (text: string) => {
    const numeric = text.replace(/\D/g, '');
    setEditForm({ ...editForm, valorTurno: numeric });
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setPickerConfig({ ...pickerConfig, show: false });
      return;
    }
    if (selectedDate) {
      const field = pickerConfig.field;
      const currentVal = editForm[field] ? new Date(editForm[field]) : new Date();
      
      if (pickerConfig.mode === 'date') {
        currentVal.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        setEditForm({ ...editForm, [field]: currentVal.toISOString() });
        if (Platform.OS === 'android') {
          setPickerConfig({ show: true, mode: 'time', field });
        } else {
          setPickerConfig({ ...pickerConfig, show: false });
        }
      } else {
        currentVal.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
        setEditForm({ ...editForm, [field]: currentVal.toISOString() });
        setPickerConfig({ ...pickerConfig, show: false });
      }
    }
  };

  const openPicker = (field: 'horaEntrada'|'horaSalida') => {
    setPickerConfig({ show: true, mode: 'date', field });
  };

  const formatPrettyDate = (isoString?: string) => {
    if (!isoString) return 'No seleccionada';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Fecha inválida';
    return d.toLocaleString('es-CO', { 
      year: 'numeric', month: 'short', day: '2-digit', 
      hour: '2-digit', minute: '2-digit', hour12: true 
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Nómina y Asistencia</Text>
        <TouchableOpacity 
          onPress={() => navigation.navigate('RepartoDescuentos')} 
          style={styles.headerActionBtn}
        >
          <Ionicons name="cash-outline" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tabBtn, filterTab === 'Todos' && styles.tabBtnActive]} onPress={() => setFilterTab('Todos')}>
          <Text style={[styles.tabBtnText, filterTab === 'Todos' && styles.tabBtnTextActive]}>Todos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, filterTab === 'Activos' && styles.tabBtnActive]} onPress={() => setFilterTab('Activos')}>
          <Text style={[styles.tabBtnText, filterTab === 'Activos' && styles.tabBtnTextActive]}>Turnos Activos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, filterTab === 'Liquidados' && styles.tabBtnActive]} onPress={() => { setFilterTab('Liquidados'); loadLiquidaciones(); }}>
          <Text style={[styles.tabBtnText, filterTab === 'Liquidados' && styles.tabBtnTextActive]}>Liquidados</Text>
        </TouchableOpacity>
      </View>

      {loading && filterTab !== 'Liquidados' ? (
        <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 40 }} />
      ) : filterTab === 'Liquidados' ? (
        <ScrollView style={styles.content}>
          {loadingLiquidaciones ? (
             <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
          ) : liquidaciones.length === 0 ? (
            <Text style={{ textAlign: 'center', marginTop: 40, color: '#6b7280' }}>No hay liquidaciones recientes.</Text>
          ) : (
            liquidaciones.map((liq) => (
              <Card key={liq.IDliquidacion} style={{ marginBottom: 12, padding: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700' }}>{liq.usuario?.nombre}</Text>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      {new Date(liq.fechaInicio).toLocaleDateString('es-CO')} - {new Date(liq.fechaFin).toLocaleDateString('es-CO')}
                    </Text>
                    <View style={[styles.statusBadge, { marginTop: 6, alignSelf: 'flex-start', backgroundColor: liq.estado === 'FIRMADO' ? '#d1fae5' : '#fef3c7' }]}>
                      <Ionicons name={liq.estado === 'FIRMADO' ? 'checkmark-circle' : 'time-outline'} size={12} color={liq.estado === 'FIRMADO' ? '#059669' : '#d97706'} />
                      <Text style={[styles.statusText, { color: liq.estado === 'FIRMADO' ? '#059669' : '#d97706', fontSize: 11, marginLeft: 4 }]}>
                        {liq.estado.replace('_', ' ')}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#10b981' }}>
                      ${Number(liq.totalNeto).toLocaleString('es-CO')}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', marginTop: 12, flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                  <Button variant="outline" size="sm" style={{ flex: 1, borderColor: '#3b82f6', marginBottom: 4 }} onPress={() => handleVerPDF(liq)}>
                    <Ionicons name="document-text-outline" size={16} color="#3b82f6" style={{ marginRight: 4 }} />
                    <Text style={{ color: '#3b82f6', fontSize: 13, flexShrink: 1 }} numberOfLines={1}>Ver PDF</Text>
                  </Button>
                  {liq.estado === 'ESPERANDO_FIRMA' && (
                    <Button variant="default" size="sm" style={{ flex: 1, backgroundColor: '#f59e0b', marginBottom: 4 }} onPress={() => handleReenviarNotificacion(liq.IDliquidacion)}>
                      <Ionicons name="paper-plane-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
                      <Text style={{ color: '#fff', fontSize: 13, flexShrink: 1 }} numberOfLines={1}>Reenviar</Text>
                    </Button>
                  )}
                  <View style={{ width: '100%' }}>
                    <Button variant="default" size="sm" style={{ width: '100%', backgroundColor: liq.firmaAdmin ? '#3b82f6' : '#10b981', marginBottom: 8 }} onPress={() => { setLiquidacionParaFirmaAdmin(liq.IDliquidacion); setShowSignatureAdmin(true); }}>
                      <Ionicons name="create-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
                      <Text style={{ color: '#fff', fontSize: 13, flexShrink: 1 }} numberOfLines={1}>{liq.firmaAdmin ? 'Cambiar Firma' : 'Firmar'}</Text>
                    </Button>
                    <Button size="sm" style={{ width: '100%', backgroundColor: '#ef4444' }} onPress={() => handleDeshacerLiquidacion(liq.IDliquidacion)} disabled={deshaciendo}>
                      <Ionicons name="trash-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
                      <Text style={{ color: '#fff', fontSize: 13, flexShrink: 1 }} numberOfLines={1}>Deshacer Liquidación</Text>
                    </Button>
                  </View>
                </View>
              </Card>
            ))
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      ) : (
        <ScrollView style={styles.content}>
          {empleadosFiltrados.length === 0 ? (
            <Text style={{ textAlign: 'center', marginTop: 40, color: '#6b7280' }}>No hay empleados en esta lista.</Text>
          ) : (
            empleadosFiltrados.map((empleado) => {
              const status = getStatusTurnoHoy(empleado.IDusuarios);
              return (
                <View key={empleado.IDusuarios} style={styles.employeeListItem}>
                  <TouchableOpacity style={styles.employeeInfoContainer} onPress={() => openHistory(empleado)} activeOpacity={0.7}>
                    <View style={styles.employeeAvatar}>
                      <Text style={styles.employeeAvatarText}>{empleado.nombre.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.employeeDetails}>
                      <Text style={styles.employeeName}>{empleado.nombre}</Text>
                      <Text style={styles.employeeRole}>{empleado.cargo?.nombre || 'Sin cargo'} • {empleado.rol}</Text>
                      <View style={[styles.statusBadge, { marginTop: 4 }]}>
                        <Ionicons name={status.icon as any} size={12} color={status.color} />
                        <Text style={[styles.statusText, { color: status.color, fontSize: 11, marginLeft: 4 }]}>{status.text}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  
                  <View style={styles.employeeActionsRow}>
                    <TouchableOpacity style={styles.iconBtnAction} onPress={() => {
                      setEmpleadoTurnoManual(empleado);
                      setShowTurnoManualModal(true);
                    }}>
                      <Ionicons name="add-circle" size={24} color="#3b82f6" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.primaryActionBtn} onPress={() => openResumen(empleado)}>
                      <Text style={styles.primaryActionBtnText}>Resumen</Text>
                      <Ionicons name="chevron-forward" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* Modal Resumen */}
      <Modal visible={!!selectedEmpleado} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {loadingResumen ? (
              <ActivityIndicator size="large" color="#4CAF50" style={{ margin: 40 }} />
            ) : (
              resumen && (() => {
                const descuentosAgrupados = resumen?.descuentos?.reduce((acc: any, d: any) => {
                  if (d.concepto === 'LLEGADA_TARDE' && d.estado === 'PENDIENTE') return acc;
                  const concepto = d.concepto || 'OTRO';
                  if (!acc[concepto]) acc[concepto] = { count: 0, total: 0 };
                  acc[concepto].count += 1;
                  acc[concepto].total += Number(d.valor);
                  return acc;
                }, {});

                return (
                  <>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16}}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalTitle}>Resumen de Pagos</Text>
                        <Text style={styles.modalSubtitle}>{selectedEmpleado?.nombre}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity onPress={previewPdf} style={{backgroundColor: '#e0e7ff', padding: 8, borderRadius: 8, marginRight: 12}}>
                          <Ionicons name="document-text" size={24} color="#4338ca" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setSelectedEmpleado(null)} style={{ padding: 4 }} disabled={liquidando || recalculando}>
                          <Ionicons name="close" size={26} color="#6b7280" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  
                  <ScrollView style={{ maxHeight: 400, marginVertical: 16 }}>
                    <View style={styles.summaryBox}>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Total Turnos (Bruto):</Text>
                        <Text style={styles.summaryValue}>${Number(resumen.totalBruto + selectedExtraTurnos.reduce((sum: number, id: string) => {
                          const t = resumen.turnosAnteriores?.find((x: any) => x.IDturno === id);
                          return sum + (t ? Number(t.valorTurno) : 0);
                        }, 0)).toLocaleString('es-CO')}</Text>
                      </View>
                      
                      {Object.keys(descuentosAgrupados || {}).length > 0 && (
                        <View style={{ marginTop: 8, marginBottom: 4, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: '#fca5a5' }}>
                          {Object.entries(descuentosAgrupados).map(([concepto, data]: any) => {
                            const label = concepto === 'CENA' 
                              ? `${data.count} ${data.count === 1 ? 'CENA' : 'CENAS'}`
                              : `${data.count} ${data.count === 1 ? 'vez' : 'veces'} - ${concepto.replace(/_/g, ' ')}`;
                            
                            return (
                              <View key={concepto} style={[styles.summaryRow, { marginBottom: 4 }]}>
                                <Text style={{ fontSize: 13, color: '#6b7280' }}>
                                  ↳ {label}
                                </Text>
                                <Text style={{ fontSize: 13, color: '#ef4444' }}>
                                  -${Number(data.total).toLocaleString('es-CO')}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      <View style={[styles.summaryRow, { marginTop: 8 }]}>
                        <Text style={styles.summaryLabel}>Total Descuentos:</Text>
                        <Text style={[styles.summaryValue, { color: '#ef4444' }]}>-${Number(resumen.totalDescuentos).toLocaleString('es-CO')}</Text>
                      </View>
                      <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8, marginTop: 8 }]}>
                        <Text style={[styles.summaryLabel, { fontWeight: '700' }]}>Total Neto a Pagar:</Text>
                        <Text style={[styles.summaryValue, { color: '#10b981', fontSize: 18 }]}>${Number(resumen.totalNeto + selectedExtraTurnos.reduce((sum: number, id: string) => {
                          const t = resumen.turnosAnteriores?.find((x: any) => x.IDturno === id);
                          return sum + (t ? Number(t.valorTurno) : 0);
                        }, 0)).toLocaleString('es-CO')}</Text>
                      </View>
                    </View>

                    <Text style={{ fontWeight: '700', marginVertical: 8 }}>Desglose de Turnos ({(resumen.turnos?.length || 0) + selectedExtraTurnos.length})</Text>
                    {[...(resumen.turnos || []), ...(resumen.turnosAnteriores || []).filter((t: any) => selectedExtraTurnos.includes(t.IDturno))].map((t: any) => (
                      <View key={t.IDturno} style={styles.itemRow}>
                        <Text style={{ flex: 1, fontSize: 13 }}>
                          {new Date(t.fecha).toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' })}
                        </Text>
                        <Text style={{ flex: 1, fontSize: 13, textAlign: 'center' }}>
                          {t.horaEntrada ? new Date(t.horaEntrada).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--'}
                        </Text>
                        <Text style={{ flex: 1, fontSize: 13, textAlign: 'right', color: '#10b981', fontWeight: '600' }}>
                          ${Number(t.valorTurno).toLocaleString('es-CO')}
                        </Text>
                      </View>
                    ))}

                    <Text style={{ fontWeight: '700', marginTop: 16, marginBottom: 8 }}>Descuentos ({(resumen.descuentos || []).filter((d: any) => !(d.concepto === 'LLEGADA_TARDE' && d.estado === 'PENDIENTE')).length})</Text>
                    {(resumen.descuentos || []).filter((d: any) => !(d.concepto === 'LLEGADA_TARDE' && d.estado === 'PENDIENTE')).map((d: any) => (
                      <View key={d.IDdescuento} style={styles.itemRow}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ fontSize: 13, fontWeight: '500' }}>{d.concepto}</Text>
                            {d.fecha && (
                              <Text style={{ fontSize: 12, color: '#4b5563', marginLeft: 6, textTransform: 'capitalize' }}>
                                ({new Date(d.fecha).toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' })})
                              </Text>
                            )}
                          </View>
                          {d.descripcion && (
                            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{d.descripcion}</Text>
                          )}
                        </View>
                        <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '600' }}>
                          -${Number(d.valor).toLocaleString('es-CO')}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>

                  
                    { (resumen.descuentos || []).some((d: any) => d.concepto === 'LLEGADA_TARDE' && d.estado === 'PENDIENTE') && (
                      <Button style={{ marginBottom: 12, backgroundColor: '#f97316' }} onPress={handleOpenLlegadas}>
                        <Text style={{ color: '#fff', fontSize: 14 }}>Evaluar Llegadas Tarde Pendientes</Text>
                      </Button>
                    )}
                    { (resumen.turnosAnteriores && resumen.turnosAnteriores.length > 0) && (
                      <Button style={{ marginBottom: 12, backgroundColor: '#3b82f6' }} onPress={() => setShowTurnosAnteriores(true)}>
                        <Text style={{ color: '#fff', fontSize: 14 }}>Evaluar Turnos Anteriores Pendientes ({resumen.turnosAnteriores.length})</Text>
                      </Button>
                    )}
                  <View style={styles.modalActions}>
                    <Button style={{ flex: 1, marginRight: 8, backgroundColor: '#f3f4f6' }} onPress={() => setSelectedEmpleado(null)} disabled={liquidando || recalculando}>
                      <Text style={{ color: '#111827' }}>Cerrar</Text>
                    </Button>
                    <Button style={{ flex: 1, marginRight: 8, backgroundColor: '#eab308' }} onPress={handleRecalcular} loading={recalculando} disabled={liquidando}>
                      <Text style={{ color: '#fff', fontSize: 13 }}>Recalcular</Text>
                    </Button>
                    <Button style={{ flex: 1, backgroundColor: '#4CAF50' }} onPress={handleLiquidar} loading={liquidando} disabled={recalculando}>
                      <Text style={{ color: '#fff', fontSize: 13 }}>Liquidar</Text>
                    </Button>
                  </View>
                </>
              );
            })()
          )}
          </View>
        </View>
      </Modal>

      
      
      {/* Modal Turnos Anteriores */}
      <Modal visible={showTurnosAnteriores} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Turnos Anteriores Pendientes</Text>
                <Text style={styles.modalSubtitle}>Selecciona los turnos de meses pasados a incluir en este pago</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTurnosAnteriores(false)} style={{ padding: 4, marginLeft: 8 }}>
                <Ionicons name="close" size={26} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ maxHeight: 300, marginBottom: 16 }}>
              {resumen?.turnosAnteriores?.map((t: any) => {
                const isSelected = selectedExtraTurnos.includes(t.IDturno);
                return (
                  <TouchableOpacity 
                    key={t.IDturno} 
                    style={[styles.itemRow, { backgroundColor: isSelected ? '#eff6ff' : '#fff', borderColor: isSelected ? '#3b82f6' : '#e5e7eb', borderWidth: 1 }]}
                    onPress={() => {
                      if (isSelected) {
                        setSelectedExtraTurnos(prev => prev.filter(id => id !== t.IDturno));
                      } else {
                        setSelectedExtraTurnos(prev => [...prev, t.IDturno]);
                      }
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: isSelected ? '700' : '400' }}>
                        {new Date(t.fecha).toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' })}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#6b7280' }}>
                        {t.horaEntrada ? new Date(t.horaEntrada).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 13, color: '#10b981', fontWeight: '600' }}>
                        +${Number(t.valorTurno).toLocaleString('es-CO')}
                      </Text>
                      {isSelected && <Ionicons name="checkmark-circle" size={16} color="#3b82f6" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            
            <Button style={{ backgroundColor: '#3b82f6' }} onPress={async () => {
              if (selectedEmpleado) await saveExtraTurnos(selectedEmpleado.IDusuarios, selectedExtraTurnos);
              setShowTurnosAnteriores(false);
            }}>
              <Text style={{ color: '#fff' }}>Aceptar Selección</Text>
            </Button>
          </View>
        </View>
      </Modal>

      {/* Modal Llegadas Tarde */}
      <Modal visible={showLlegadasModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Llegadas Tarde Pendientes</Text>
            <Text style={styles.modalSubtitle}>Selecciona cuáles deseas cobrar en esta liquidación</Text>
            
            <ScrollView style={{ maxHeight: 300, marginBottom: 16 }}>
              {(resumen?.descuentos || []).filter((d: any) => d.concepto === 'LLEGADA_TARDE' && d.estado === 'PENDIENTE').map((d: any) => (
                <TouchableOpacity 
                  key={d.IDdescuento} 
                  style={[styles.itemRow, { alignItems: 'center', backgroundColor: selectedLlegadas.includes(d.IDdescuento) ? '#f3f4f6' : '#fff', paddingHorizontal: 8, borderRadius: 8 }]}
                  onPress={() => {
                    if (selectedLlegadas.includes(d.IDdescuento)) {
                      setSelectedLlegadas(selectedLlegadas.filter(id => id !== d.IDdescuento));
                    } else {
                      setSelectedLlegadas([...selectedLlegadas, d.IDdescuento]);
                    }
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '500' }}>{new Date(d.fecha).toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' })}</Text>
                    <Text style={{ fontSize: 11, color: '#6b7280' }}>{d.descripcion}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '600', marginRight: 12 }}>
                      -${Number(d.valor).toLocaleString('es-CO')}
                    </Text>
                    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: selectedLlegadas.includes(d.IDdescuento) ? '#10b981' : '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: selectedLlegadas.includes(d.IDdescuento) ? '#10b981' : 'transparent' }}>
                      {selectedLlegadas.includes(d.IDdescuento) && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button style={{ flex: 1, marginRight: 8, backgroundColor: '#f3f4f6' }} onPress={() => setShowLlegadasModal(false)} disabled={aplicandoLlegadas}>
                <Text style={{ color: '#111827' }}>Cancelar</Text>
              </Button>
              <Button style={{ flex: 1, backgroundColor: '#10b981' }} onPress={handleAplicarLlegadas} loading={aplicandoLlegadas}>
                <Text style={{ color: '#fff', fontSize: 13 }}>Aplicar ({selectedLlegadas.length})</Text>
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Historial de Turnos */}
      <Modal visible={!!historyEmpleado} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <Text style={styles.modalTitle}>Historial de Turnos</Text>
                <Text style={styles.modalSubtitle}>{historyEmpleado?.nombre}</Text>
              </View>
              <TouchableOpacity onPress={() => setHistoryEmpleado(null)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {loadingHistory ? (
              <ActivityIndicator size="large" color="#4CAF50" style={{ margin: 40 }} />
            ) : (
              <ScrollView style={{ flex: 1 }}>
                {historyTurnos.length === 0 ? (
                  <Text style={{ textAlign: 'center', marginTop: 20, color: '#6b7280' }}>No hay turnos registrados</Text>
                ) : (
                  historyTurnos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).map(turno => (
                    <View key={turno.IDturno} style={styles.historyCard}>
                      <View style={styles.historyHeader}>
                        <Text style={styles.historyDate}>
                          {new Date(turno.fecha).toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' })}
                        </Text>
                        <View style={[styles.statusTag, { backgroundColor: turno.estado === 'ACTIVO' ? '#dcfce7' : '#f3f4f6' }]}>
                          <Text style={[styles.statusTagText, { color: turno.estado === 'ACTIVO' ? '#16a34a' : '#6b7280' }]}>
                            {turno.estado}
                          </Text>
                        </View>
                      </View>
                      
                      <View style={styles.historyDetails}>
                        <View style={styles.timeBox}>
                          <Text style={styles.timeLabel}>Entrada</Text>
                          <Text style={styles.timeValue}>{new Date(turno.horaEntrada).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'})}</Text>
                        </View>
                        <Ionicons name="arrow-forward" size={16} color="#9ca3af" />
                        <View style={styles.timeBox}>
                          <Text style={styles.timeLabel}>Salida</Text>
                          <Text style={styles.timeValue}>{turno.horaSalida ? new Date(turno.horaSalida).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'}) : '--:--'}</Text>
                        </View>
                      </View>

                      <View style={styles.historyFooter}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.historyFooterText}>
                            {turno.ceno ? '🍔 Cenó' : '❌ No cenó'}
                          </Text>
                          <Text style={[styles.historyFooterValue, { marginLeft: 12 }]}>
                            Turno: ${Number(turno.valorTurno || 0).toLocaleString('es-CO')}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row' }}>
                          <TouchableOpacity style={styles.iconBtn} onPress={() => handleEditTurno(turno)}>
                            <Ionicons name="pencil" size={18} color="#3b82f6" />
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.iconBtn, { marginLeft: 8 }]} onPress={() => handleDeleteTurno(turno)}>
                            <Ionicons name="trash" size={18} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal Editar Turno */}
      <Modal visible={!!editingTurno} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={styles.modalTitle}>Editar Turno</Text>
              <TouchableOpacity onPress={() => setEditingTurno(null)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Estado del turno</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {['ACTIVO', 'COMPLETADO', 'LIQUIDADO', 'ANULADO'].map(est => (
                    <TouchableOpacity 
                      key={est}
                      style={[styles.statusChip, editForm.estado === est && styles.statusChipActive]}
                      onPress={() => setEditForm({...editForm, estado: est})}
                    >
                      <Text style={[styles.statusChipText, editForm.estado === est && styles.statusChipTextActive]}>{est}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Entrada</Text>
                {Platform.OS === 'web' ? (
                  React.createElement('input', {
                    type: 'datetime-local',
                    value: editForm.horaEntrada ? new Date(new Date(editForm.horaEntrada).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
                    onChange: (e: any) => {
                      if (e.target.value) {
                        setEditForm({...editForm, horaEntrada: new Date(e.target.value).toISOString()});
                      }
                    },
                    style: { padding: '12px', backgroundColor: '#f9fafb', borderWidth: '1px', borderColor: '#e5e7eb', borderRadius: '8px', fontSize: '16px', width: '100%', fontFamily: 'inherit' }
                  })
                ) : (
                  <TouchableOpacity style={styles.datePickerBtn} onPress={() => openPicker('horaEntrada')}>
                    <Ionicons name="calendar-outline" size={18} color="#4b5563" style={{ marginRight: 8 }} />
                    <Text style={styles.datePickerText}>{formatPrettyDate(editForm.horaEntrada)}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Salida</Text>
                {Platform.OS === 'web' ? (
                  React.createElement('input', {
                    type: 'datetime-local',
                    value: editForm.horaSalida ? new Date(new Date(editForm.horaSalida).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
                    onChange: (e: any) => {
                      if (e.target.value) {
                        setEditForm({...editForm, horaSalida: new Date(e.target.value).toISOString()});
                      }
                    },
                    style: { padding: '12px', backgroundColor: '#f9fafb', borderWidth: '1px', borderColor: '#e5e7eb', borderRadius: '8px', fontSize: '16px', width: '100%', fontFamily: 'inherit' }
                  })
                ) : (
                  <TouchableOpacity style={styles.datePickerBtn} onPress={() => openPicker('horaSalida')}>
                    <Ionicons name="calendar-outline" size={18} color="#4b5563" style={{ marginRight: 8 }} />
                    <Text style={styles.datePickerText}>{formatPrettyDate(editForm.horaSalida)}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Valor del Turno ($)</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.valorTurno ? Number(editForm.valorTurno).toLocaleString('es-CO') : ''}
                  onChangeText={handleValorChange}
                  keyboardType="numeric"
                  placeholder="Ej. 60.000"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>¿Cenó?</Text>
                <View style={{ flexDirection: 'row', marginTop: 4 }}>
                  <TouchableOpacity 
                    style={[styles.cenoBtn, editForm.ceno === true && styles.cenoBtnActive]}
                    onPress={() => setEditForm({...editForm, ceno: true})}
                  >
                    <Text style={[styles.cenoBtnText, editForm.ceno === true && styles.cenoBtnTextActive]}>Sí</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.cenoBtn, editForm.ceno === false && styles.cenoBtnActiveError]}
                    onPress={() => setEditForm({...editForm, ceno: false})}
                  >
                    <Text style={[styles.cenoBtnText, editForm.ceno === false && styles.cenoBtnTextActiveError]}>No</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Button style={{ flex: 1, marginRight: 8, backgroundColor: '#f3f4f6' }} onPress={() => setEditingTurno(null)} disabled={savingTurno}>
                <Text style={{ color: '#111827' }}>Cancelar</Text>
              </Button>
              <Button style={{ flex: 1, backgroundColor: '#3b82f6' }} onPress={handleSaveTurno} loading={savingTurno}>
                <Text style={{ color: '#fff' }}>Guardar</Text>
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {pickerConfig.show && (
        <DateTimePicker
          value={editForm[pickerConfig.field] ? new Date(editForm[pickerConfig.field]) : new Date()}
          mode={pickerConfig.mode}
          is24Hour={false}
          display="default"
          onChange={handleDateChange}
        />
      )}

      {showTurnoManualModal && (
        <TurnoManualModal
          visible={showTurnoManualModal}
          empleado={empleadoTurnoManual}
          onClose={() => {
            setShowTurnoManualModal(false);
            setEmpleadoTurnoManual(null);
          }}
          onSuccess={() => {
            loadData();
          }}
        />
      )}

      {showSignatureAdmin && (
        <SignatureModal
          visible={showSignatureAdmin}
          title="Firma del Administrador"
          loading={liquidando}
          onClose={() => {
            setShowSignatureAdmin(false);
            setLiquidacionParaFirmaAdmin(null);
            empleadoALiquidar.current = null;
          }}
          onSave={handleSaveSignature}
        />
      )}

      {/* Modal Descuento Extra */}
      <Modal visible={showDescuentoExtraModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>Agregar Descuento Extra</Text>
              <TouchableOpacity onPress={() => setShowDescuentoExtraModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, color: '#374151', marginBottom: 4, fontWeight: 'bold' }}>Concepto</Text>
              <View style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, backgroundColor: '#f9fafb', height: 48, justifyContent: 'center' }}>
                <Picker selectedValue={extraConcepto} onValueChange={(v) => setExtraConcepto(v)} style={{ height: 48, backgroundColor: 'transparent' }}>
                  <Picker.Item label="Descuadre de Caja" value="DESCUADRE_CAJA" />
                  <Picker.Item label="Pérdida" value="PERDIDA" />
                  <Picker.Item label="Robo" value="ROBO" />
                  <Picker.Item label="Adelanto" value="ADELANTO" />
                  <Picker.Item label="Otro" value="OTRO" />
                </Picker>
              </View>
            </View>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, color: '#374151', marginBottom: 4, fontWeight: 'bold' }}>Descripción</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, backgroundColor: '#f9fafb', color: '#111827' }}
                placeholder="Motivo del descuento"
                value={extraDescripcion}
                onChangeText={setExtraDescripcion}
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, color: '#374151', marginBottom: 4, fontWeight: 'bold' }}>Valor ($)</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, backgroundColor: '#f9fafb', color: '#111827' }}
                placeholder="Ej. 15000"
                keyboardType="numeric"
                value={extraValor}
                onChangeText={setExtraValor}
                placeholderTextColor="#9ca3af"
              />
            </View>
            <Button
              onPress={handleSaveDescuentoExtra}
              disabled={guardandoDescuentoExtra}
              style={{ height: 48 }}
            >
              {guardandoDescuentoExtra ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Guardar Descuento</Text>
              )}
            </Button>
          </View>
        </View>
      </Modal>

      <Modal visible={!!confirmDeshacerId} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ backgroundColor: '#fee2e2', padding: 12, borderRadius: 50, marginBottom: 12 }}>
                <Ionicons name="warning" size={32} color="#ef4444" />
              </View>
              <Text style={[styles.modalTitle, { textAlign: 'center' }]}>Deshacer Liquidación</Text>
              <Text style={[styles.modalSubtitle, { textAlign: 'center', marginTop: 8 }]}>
                ¿Estás seguro? Esta acción borrará la liquidación permanentemente y restaurará los turnos al estado 'por cobrar'.
              </Text>
            </View>
            <View style={styles.modalActions}>
              <Button style={{ flex: 1, marginRight: 8, backgroundColor: '#f3f4f6' }} onPress={() => setConfirmDeshacerId(null)} disabled={deshaciendo}>
                <Text style={{ color: '#111827', fontWeight: 'bold' }}>Cancelar</Text>
              </Button>
              <Button style={{ flex: 1, backgroundColor: '#ef4444' }} onPress={ejecutarDeshacer} loading={deshaciendo}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Sí, Deshacer</Text>
              </Button>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn: { padding: 8 },
  headerActionBtn: { padding: 8, backgroundColor: '#eff6ff', borderRadius: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  
  tabContainer: { flexDirection: 'row', padding: 16, paddingBottom: 0 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: '#3b82f6' },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  tabBtnTextActive: { color: '#3b82f6' },

  content: { padding: 16 },
  
  card: { padding: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 12, elevation: 1 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 },
  cardSubtitle: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  
  statusBadge: { flexDirection: 'row', alignItems: 'center' },
  statusText: { fontSize: 12, marginLeft: 4, fontWeight: '500' },

  actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginLeft: 8 },
  actionBtnText: { color: '#3b82f6', fontWeight: '600', marginRight: 4, fontSize: 13 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', backgroundColor: '#fff', borderRadius: 16, padding: 24, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  modalSubtitle: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  
  summaryBox: { backgroundColor: '#f9fafb', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  summaryLabel: { fontSize: 14, color: '#374151' },
  summaryValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },

  historyCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 12 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },

  employeeListItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#f3f4f6', elevation: 0 },
  employeeInfoContainer: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  employeeAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  employeeAvatarText: { color: '#3b82f6', fontSize: 18, fontWeight: 'bold' },
  employeeDetails: { flex: 1, justifyContent: 'center' },
  employeeName: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  employeeRole: { fontSize: 12, color: '#6b7280' },
  employeeActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtnAction: { padding: 8, backgroundColor: '#eff6ff', borderRadius: 8 },
  primaryActionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  primaryActionBtnText: { color: '#fff', fontSize: 13, fontWeight: '600', marginRight: 4 },
  historyDate: { fontSize: 14, fontWeight: '700', color: '#374151', textTransform: 'capitalize' },
  statusTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusTagText: { fontSize: 11, fontWeight: '700' },
  historyDetails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb', padding: 12, borderRadius: 8, marginBottom: 12 },
  timeBox: { alignItems: 'center' },
  timeLabel: { fontSize: 11, color: '#6b7280', marginBottom: 2 },
  timeValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  historyFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 8 },
  historyFooterText: { fontSize: 12, color: '#4b5563', fontWeight: '500' },
  historyFooterValue: { fontSize: 14, fontWeight: '700', color: '#10b981' },
  
  iconBtn: { padding: 6, backgroundColor: '#f3f4f6', borderRadius: 6 },
  
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 14, color: '#111827' },
  
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12 },
  datePickerText: { fontSize: 16, color: '#111827' },
  
  cenoBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 8, marginHorizontal: 4, borderWidth: 1, borderColor: '#e5e7eb' },
  cenoBtnActive: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  cenoBtnActiveError: { backgroundColor: '#fef2f2', borderColor: '#ef4444' },
  cenoBtnText: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  cenoBtnTextActive: { color: '#047857' },
  cenoBtnTextActiveError: { color: '#b91c1c' },
  
  statusChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f3f4f6', marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  statusChipActive: { backgroundColor: '#111827', borderColor: '#111827' },
  statusChipText: { fontSize: 12, fontWeight: '600', color: '#4b5563' },
  statusChipTextActive: { color: '#fff' }
});
