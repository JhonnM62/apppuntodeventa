import React, { useState, useEffect } from 'react';
import { View, Text as RNText, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Modal, TextInput, Platform, Switch, KeyboardAvoidingView, PermissionsAndroid } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import useSeccionesStore from '../../store/useSeccionesStore';
import { getSeccionesAll, createSeccion, updateSeccion, deleteSeccion, SeccionCocina } from '../../services/seccion-cocina';
import Toast from 'react-native-toast-message';
import { useCustomAlert } from '../../context/CustomAlertContext';
import usePrinterStore from '../../store/usePrinterStore';
import { BLEPrinter } from 'react-native-thermal-receipt-printer-image-qr';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'SeccionesCocina'>;
};

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'];

const SeccionesCocinaScreen = ({ navigation }: Props) => {
  const { showAlert } = useCustomAlert();
  const { secciones, impresoras, loading, fetchSecciones, setImpresora } = useSeccionesStore();
  const [localSecciones, setLocalSecciones] = useState<SeccionCocina[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Formulario modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ nombre: '', color: COLORS[0], activa: true });
  const [saving, setSaving] = useState(false);

  // Impresoras modal
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [selectingForSeccion, setSelectingForSeccion] = useState<SeccionCocina | null>(null);
  const [scannedPrinters, setScannedPrinters] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);

  const keyboardHeight = useKeyboardHeight();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getSeccionesAll();
      setLocalSecciones(data || []);
      await fetchSecciones(); // actualiza el store también
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudieron cargar las secciones.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenForm = (sec?: SeccionCocina) => {
    if (sec) {
      setEditingId(sec.IDseccion);
      setFormData({ nombre: sec.nombre, color: sec.color, activa: sec.activa });
    } else {
      setEditingId(null);
      setFormData({ nombre: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], activa: true });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.nombre.trim()) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'El nombre es obligatorio.' });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateSeccion(editingId, { ...formData, orden: 0, icono: '' });
        Toast.show({ type: 'success', text1: 'Éxito', text2: 'Sección actualizada' });
      } else {
        await createSeccion({ ...formData, orden: 0, icono: '' });
        Toast.show({ type: 'success', text1: 'Éxito', text2: 'Sección creada' });
      }
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo guardar la sección.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    showAlert({
      type: 'confirm',
      title: 'Eliminar Sección',
      message: '¿Estás seguro de eliminar esta sección? Los productos volverán a la impresión general.',
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          await deleteSeccion(id);
          Toast.show({ type: 'success', text1: 'Éxito', text2: 'Sección eliminada' });
          loadData();
        } catch (error) {
          console.error(error);
          Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo eliminar.' });
        }
      },
      onCancel: () => {},
    });
  };

  const openPrinterSelector = (sec: SeccionCocina) => {
    setSelectingForSeccion(sec);
    setShowPrinterModal(true);
  };

  const scanPrinters = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);
        
        const sdkInt = Platform.Version;
        if (typeof sdkInt === 'number' && sdkInt >= 31) {
          if (
            granted['android.permission.BLUETOOTH_SCAN'] !== PermissionsAndroid.RESULTS.GRANTED ||
            granted['android.permission.BLUETOOTH_CONNECT'] !== PermissionsAndroid.RESULTS.GRANTED
          ) {
            showAlert({ type: 'warning', title: 'Permisos requeridos', message: 'Se necesitan permisos de Bluetooth.' });
            return;
          }
        } else {
          if (granted['android.permission.ACCESS_FINE_LOCATION'] !== PermissionsAndroid.RESULTS.GRANTED) {
            showAlert({ type: 'warning', title: 'Permisos requeridos', message: 'Se necesita permiso de ubicación.' });
            return;
          }
        }
      } catch (err) {
        console.warn(err);
      }
    }

    if (!BLEPrinter) {
      Toast.show({ type: 'error', text1: 'Simulador', text2: 'Bluetooth no disponible en simulador.' });
      return;
    }
    setScanning(true);
    try {
      await BLEPrinter.init();
      await new Promise(resolve => setTimeout(resolve, 300));
      const results = await BLEPrinter.getDeviceList();
      setScannedPrinters(results || []);
    } catch (err) {
      console.error(err);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Asegúrate de tener el Bluetooth activado.' });
    } finally {
      setScanning(false);
    }
  };

  const selectPrinterMode = (mode: 'principal' | 'remota' | any) => {
    if (selectingForSeccion) {
      setImpresora(selectingForSeccion.IDseccion, mode);
      Toast.show({ type: 'success', text1: 'Configurado', text2: 'Ruta de impresión actualizada.' });
    }
    setShowPrinterModal(false);
  };

  const renderImpresoraBadge = (sec: SeccionCocina) => {
    const imp = impresoras[sec.IDseccion];
    if (!imp || imp === 'principal') {
      return (
        <View style={[styles.badge, { backgroundColor: '#f3f4f6' }]}>
          <Ionicons name="print-outline" size={14} color="#4b5563" />
          <RNText style={[styles.badgeText, { color: '#4b5563' }]}>Impresora Principal</RNText>
        </View>
      );
    }
    if (imp === 'remota') {
      return (
        <View style={[styles.badge, { backgroundColor: '#e0e7ff' }]}>
          <Ionicons name="cloud-outline" size={14} color="#4f46e5" />
          <RNText style={[styles.badgeText, { color: '#4f46e5' }]}>Impresión Remota</RNText>
        </View>
      );
    }
    // Es una impresora BT específica
    return (
      <View style={[styles.badge, { backgroundColor: '#dcfce7' }]}>
        <Ionicons name="bluetooth-outline" size={14} color="#16a34a" />
        <RNText style={[styles.badgeText, { color: '#16a34a' }]} numberOfLines={1}>
          {imp.device_name || 'Impresora BT'}
        </RNText>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <RNText style={styles.headerTitle}>Secciones e Impresión</RNText>
        <TouchableOpacity onPress={() => handleOpenForm()} style={styles.addBtn}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={24} color="#4f46e5" />
            <RNText style={styles.infoText}>
              Crea secciones (ej. Cocina, Bebidas) y asigna los productos a ellas. Aquí configuras por dónde se imprimirán los tickets de cada sección.
            </RNText>
          </View>

          {localSecciones.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="restaurant-outline" size={48} color="#9ca3af" />
              <RNText style={styles.emptyTitle}>No hay secciones</RNText>
              <RNText style={styles.emptySubtitle}>Crea tu primera sección para organizar los tickets de producción.</RNText>
            </View>
          ) : (
            localSecciones.map((sec) => (
              <View key={sec.IDseccion} style={[styles.card, !sec.activa && { opacity: 0.6 }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleRow}>
                    <View style={[styles.colorDot, { backgroundColor: sec.color }]} />
                    <RNText style={styles.cardTitle}>{sec.nombre}</RNText>
                    {!sec.activa && (
                      <View style={styles.inactiveBadge}>
                        <RNText style={styles.inactiveText}>Inactiva</RNText>
                      </View>
                    )}
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity onPress={() => handleOpenForm(sec)} style={styles.actionBtn}>
                      <Ionicons name="pencil-outline" size={20} color="#6b7280" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(sec.IDseccion)} style={styles.actionBtn}>
                      <Ionicons name="trash-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.printerSection}>
                  <RNText style={styles.printerLabel}>Ruta de Impresión:</RNText>
                  <TouchableOpacity onPress={() => openPrinterSelector(sec)} style={styles.printerSelectorBtn}>
                    {renderImpresoraBadge(sec)}
                    <Ionicons name="chevron-down" size={16} color="#9ca3af" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Modal Formulario */}
      <Modal visible={showModal} animationType="slide" transparent={true} onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalOverlay, { paddingBottom: Platform.OS === 'android' ? keyboardHeight : 0 }]}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <RNText style={styles.modalTitle}>{editingId ? 'Editar Sección' : 'Nueva Sección'}</RNText>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <RNText style={styles.label}>Nombre de la sección</RNText>
            <TextInput
              style={styles.input}
              value={formData.nombre}
              onChangeText={(t) => setFormData(prev => ({ ...prev, nombre: t }))}
              placeholder="Ej. Barra de Bebidas"
            />

            <RNText style={styles.label}>Color identificador</RNText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorScroll}>
              {COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorOption, { backgroundColor: c }, formData.color === c && styles.colorSelected]}
                  onPress={() => setFormData(prev => ({ ...prev, color: c }))}
                >
                  {formData.color === c && <Ionicons name="checkmark" size={16} color="#fff" />}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.switchRow}>
              <View>
                <RNText style={styles.labelSwitch}>Sección Activa</RNText>
                <RNText style={styles.helpText}>Si se desactiva, los productos irán a impresión general.</RNText>
              </View>
              <Switch
                value={formData.activa}
                onValueChange={(v) => setFormData(prev => ({ ...prev, activa: v }))}
                trackColor={{ false: '#d1d5db', true: '#818cf8' }}
                thumbColor={formData.activa ? '#4f46e5' : '#f3f4f6'}
              />
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <RNText style={styles.saveBtnText}>Guardar</RNText>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Seleccionar Impresora */}
      <Modal visible={showPrinterModal} animationType="fade" transparent={true} onRequestClose={() => setShowPrinterModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <RNText style={styles.modalTitle}>Ruta de Impresión</RNText>
              <TouchableOpacity onPress={() => setShowPrinterModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <RNText style={styles.modalSubtitle}>¿Por dónde se imprimirán los tickets de la sección "{selectingForSeccion?.nombre}"?</RNText>

            <TouchableOpacity style={styles.optionBtn} onPress={() => selectPrinterMode('principal')}>
              <View style={[styles.iconBox, { backgroundColor: '#f3f4f6' }]}>
                <Ionicons name="print" size={20} color="#4b5563" />
              </View>
              <View style={styles.optionTextCont}>
                <RNText style={styles.optionTitle}>Impresora Principal</RNText>
                <RNText style={styles.optionDesc}>Usa la impresora conectada configurada en los ajustes generales.</RNText>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionBtn} onPress={() => selectPrinterMode('remota')}>
              <View style={[styles.iconBox, { backgroundColor: '#e0e7ff' }]}>
                <Ionicons name="cloud" size={20} color="#4f46e5" />
              </View>
              <View style={styles.optionTextCont}>
                <RNText style={styles.optionTitle}>Impresora Remota (Socket)</RNText>
                <RNText style={styles.optionDesc}>Envía el ticket por red a otro dispositivo que sea el servidor de impresión.</RNText>
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />

            <View style={styles.scanRow}>
              <RNText style={styles.optionTitle}>Impresora Bluetooth Específica</RNText>
              <TouchableOpacity onPress={scanPrinters} disabled={scanning} style={styles.scanBtn}>
                {scanning ? <ActivityIndicator size="small" color="#4f46e5" /> : <Ionicons name="refresh" size={20} color="#4f46e5" />}
              </TouchableOpacity>
            </View>

            {scannedPrinters.length === 0 ? (
              <RNText style={styles.emptyDesc}>Presiona el botón para buscar impresoras Bluetooth emparejadas en este dispositivo.</RNText>
            ) : (
              <ScrollView style={{ maxHeight: 200, marginTop: 12 }}>
                {scannedPrinters.map(printer => (
                  <TouchableOpacity key={printer.inner_mac_address} style={styles.btPrinterBtn} onPress={() => selectPrinterMode(printer)}>
                    <Ionicons name="bluetooth" size={18} color="#16a34a" />
                    <RNText style={styles.btPrinterText}>{printer.device_name}</RNText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  backBtn: { marginRight: 16 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', flex: 1 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  infoCard: { flexDirection: 'row', backgroundColor: '#e0e7ff', padding: 16, borderRadius: 12, marginBottom: 20, alignItems: 'center' },
  infoText: { flex: 1, marginLeft: 12, fontSize: 14, color: '#3730a3', lineHeight: 20 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#4b5563', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 8, paddingHorizontal: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  colorDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1f2937' },
  inactiveBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginLeft: 8 },
  inactiveText: { fontSize: 10, color: '#6b7280', fontWeight: 'bold' },
  cardActions: { flexDirection: 'row' },
  actionBtn: { padding: 4, marginLeft: 8 },
  printerSection: { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  printerLabel: { fontSize: 14, color: '#6b7280' },
  printerSelectorBtn: { flexDirection: 'row', alignItems: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, marginRight: 8 },
  badgeText: { fontSize: 12, fontWeight: 'bold', marginLeft: 4, maxWidth: 120 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  modalSubtitle: { fontSize: 14, color: '#4b5563', marginBottom: 20 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 16, color: '#1f2937', marginBottom: 20 },
  colorScroll: { flexDirection: 'row', marginBottom: 24 },
  colorOption: { width: 36, height: 36, borderRadius: 18, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  colorSelected: { borderWidth: 3, borderColor: '#1f2937' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  labelSwitch: { fontSize: 16, fontWeight: 'bold', color: '#1f2937' },
  helpText: { fontSize: 12, color: '#6b7280', marginTop: 2, maxWidth: '80%' },
  saveBtn: { backgroundColor: '#4f46e5', borderRadius: 12, padding: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  optionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#f3f4f6', padding: 16, borderRadius: 12, marginBottom: 12 },
  iconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  optionTextCont: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1f2937', marginBottom: 4 },
  optionDesc: { fontSize: 13, color: '#6b7280' },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 16 },
  scanRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scanBtn: { padding: 8, backgroundColor: '#e0e7ff', borderRadius: 8 },
  emptyDesc: { fontSize: 13, color: '#9ca3af', marginTop: 8 },
  btPrinterBtn: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f0fdf4', borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#bbf7d0' },
  btPrinterText: { fontSize: 14, fontWeight: 'bold', color: '#16a34a', marginLeft: 12 },
});

export default SeccionesCocinaScreen;
