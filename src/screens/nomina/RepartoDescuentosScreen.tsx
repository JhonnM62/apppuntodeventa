import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, FlatList, Modal, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Text } from '../../components/ui/text';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import api from '../../services/api';
import { repartirDescuento, getDescuentos, updateDescuento } from '../../services/nomina.service';
import { useCustomAlert } from '../../context/CustomAlertContext';

const CONCEPTOS_VALIDOS = ['DESCUADRE_CAJA', 'CENA', 'PERDIDA', 'ROBO', 'ADELANTO', 'OTRO'];

const getMonthName = (monthIndex: number) => {
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return months[monthIndex];
};

const generateQuincenas = () => {
  const quincenas = [];
  let current = new Date();

  for (let i = 0; i < 8; i++) {
    const y = current.getFullYear();
    const m = current.getMonth();
    const isFirstHalf = current.getDate() <= 15;

    if (isFirstHalf) {
      quincenas.push({
        id: `${y}-${m}-1`,
        label: `1-15 ${getMonthName(m)} ${y}`,
        fechaDesde: `${y}-${String(m + 1).padStart(2, '0')}-01`,
        fechaHasta: `${y}-${String(m + 1).padStart(2, '0')}-15`,
      });
      // Move to previous month, 2nd half
      current = new Date(y, m, 0); // last day of previous month
    } else {
      const lastDay = new Date(y, m + 1, 0).getDate();
      quincenas.push({
        id: `${y}-${m}-2`,
        label: `16-${lastDay} ${getMonthName(m)} ${y}`,
        fechaDesde: `${y}-${String(m + 1).padStart(2, '0')}-16`,
        fechaHasta: `${y}-${String(m + 1).padStart(2, '0')}-${lastDay}`,
      });
      // Move to current month, 1st half
      current = new Date(y, m, 15);
    }
  }
  return quincenas;
};

const QUINCENAS = generateQuincenas();

export default function RepartoDescuentosScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { showAlert } = useCustomAlert();

  const [descuentos, setDescuentos] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedQuincena, setSelectedQuincena] = useState(QUINCENAS[0]);

  // Modal form states
  const [modalVisible, setModalVisible] = useState(false);
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingForm, setLoadingForm] = useState(false);

  // Edit Modal states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingDescuento, setEditingDescuento] = useState<any>(null);
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editValorStr, setEditValorStr] = useState('');

  const [concepto, setConcepto] = useState('DESCUADRE_CAJA');
  const [descripcion, setDescripcion] = useState('');
  const [montoTotalStr, setMontoTotalStr] = useState('');
  const [fechaDescuento, setFechaDescuento] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    loadDescuentos();
  }, [selectedQuincena]);

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height));
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  const loadDescuentos = async () => {
    try {
      setLoadingList(true);
      const [yD, mD, dD] = selectedQuincena.fechaDesde.split('-').map(Number);
      const [yH, mH, dH] = selectedQuincena.fechaHasta.split('-').map(Number);

      const offsetMs = 5 * 60 * 60 * 1000; // Colombia es UTC-5
      const inicioUTC = new Date(Date.UTC(yD, mD - 1, dD, 0, 0, 0, 0) + offsetMs);
      const finUTC = new Date(Date.UTC(yH, mH - 1, dH, 23, 59, 59, 999) + offsetMs);

      const res = await getDescuentos({
        fechaDesde: inicioUTC.toISOString(),
        fechaHasta: finUTC.toISOString(),
        limit: 100
      });
      setDescuentos(res.data || []);
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudieron cargar los descuentos' });
    } finally {
      setLoadingList(false);
    }
  };

  const openForm = async () => {
    setModalVisible(true);
    setConcepto('DESCUADRE_CAJA');
    setDescripcion('');
    setMontoTotalStr('');
    setFechaDescuento(new Date());
    setSelectedIds(new Set());
    if (empleados.length === 0) {
      try {
        setLoadingForm(true);
        const res = await api.get('/usuarios');
        setEmpleados((res.data?.data || []).filter((u: any) => u.isActive));
      } catch (error) {
        console.error(error);
        showAlert({ type: 'error', title: 'Error', message: 'No se pudieron cargar los empleados' });
      } finally {
        setLoadingForm(false);
      }
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === empleados.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(empleados.map(e => e.IDusuarios)));
  };

  const handleGuardar = () => {
    const montoTotal = Number(montoTotalStr);

    if (selectedIds.size < 1) {
      return showAlert({ type: 'error', title: 'Error', message: 'Debes seleccionar al menos un empleado para asignar un descuento' });
    }
    if (!descripcion.trim()) {
      return showAlert({ type: 'error', title: 'Error', message: 'La descripción es obligatoria' });
    }
    if (isNaN(montoTotal) || montoTotal <= 0) {
      return showAlert({ type: 'error', title: 'Error', message: 'El monto total debe ser un número mayor a cero' });
    }

    const valorPorPersona = montoTotal / selectedIds.size;
    const msg = selectedIds.size === 1
      ? `Se le descontará $${valorPorPersona.toLocaleString('es-CO')} al empleado seleccionado.\n\n¿Estás seguro?`
      : `Se descontarán $${valorPorPersona.toLocaleString('es-CO')} a cada uno de los ${selectedIds.size} empleados seleccionados.\n\n¿Estás seguro?`;

    showAlert({
      type: 'confirm',
      title: 'Asignar Descuento',
      message: msg,
      confirmText: 'Aplicar',
      onConfirm: async () => {
        try {
          setSaving(true);
          await repartirDescuento({
            usuarioIds: Array.from(selectedIds),
            montoTotal,
            concepto,
            descripcion: descripcion.trim(),
            fecha: fechaDescuento.toISOString()
          });
          showAlert({ type: 'success', title: 'Éxito', message: 'Descuento repartido correctamente' });
          setModalVisible(false);
          loadDescuentos();
        } catch (error) {
          console.error(error);
          showAlert({ type: 'error', title: 'Error', message: 'No se pudo aplicar el descuento' });
        } finally {
          setSaving(false);
        }
      }
    });
  };

  const valorCalculado = Number(montoTotalStr) / (selectedIds.size || 1);

  const openEditForm = (item: any) => {
    setEditingDescuento(item);
    setEditDescripcion(item.descripcion);
    setEditValorStr(String(item.valor));
    setEditModalVisible(true);
  };

  const handleUpdate = async () => {
    const valor = Number(editValorStr);
    if (!editDescripcion.trim()) {
      return showAlert({ type: 'error', title: 'Error', message: 'La descripción es obligatoria' });
    }
    if (isNaN(valor) || valor <= 0) {
      return showAlert({ type: 'error', title: 'Error', message: 'El monto debe ser mayor a cero' });
    }

    try {
      setSaving(true);
      await updateDescuento(editingDescuento.IDdescuento, {
        descripcion: editDescripcion.trim(),
        valor
      });
      showAlert({ type: 'success', title: 'Éxito', message: 'Descuento actualizado correctamente' });
      setEditModalVisible(false);
      loadDescuentos();
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudo actualizar el descuento' });
    } finally {
      setSaving(false);
    }
  };

  const renderQuincenaItem = ({ item }: { item: any }) => {
    const isSelected = item.id === selectedQuincena.id;
    return (
      <TouchableOpacity
        style={[styles.quincenaTab, isSelected && styles.quincenaTabActive]}
        onPress={() => setSelectedQuincena(item)}
      >
        <Text style={[styles.quincenaText, isSelected && styles.quincenaTextActive]}>{item.label}</Text>
      </TouchableOpacity>
    );
  };

  const renderDescuento = ({ item }: { item: any }) => {
    return (
      <TouchableOpacity style={styles.card} onPress={() => openEditForm(item)}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconBg}>
            <MaterialCommunityIcons name="percent-circle-outline" size={20} color="#ec4899" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.usuario?.nombre || 'Empleado'}</Text>
            <Text style={styles.cardSubtitle}>{new Date(item.fecha).toLocaleDateString()}</Text>
          </View>
          <Text style={styles.cardValor}>-${Number(item.valor).toLocaleString('es-CO')}</Text>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.badgeConcepto}>
            <Text style={styles.badgeText}>{item.concepto}</Text>
          </View>
          <Text style={styles.cardDesc}>{item.descripcion}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.title}>Historial Descuentos</Text>
        </View>
        <TouchableOpacity onPress={openForm} style={styles.addBtn}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.filterContainer}>
        <FlatList
          data={QUINCENAS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => item.id}
          renderItem={renderQuincenaItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
        />
      </View>

      {loadingList ? (
        <ActivityIndicator size="large" color="#ec4899" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={descuentos}
          keyExtractor={item => item.IDdescuento}
          renderItem={renderDescuento}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="cash-remove" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>No hay descuentos</Text>
              <Text style={styles.emptySubtext}>No se encontraron registros en esta quincena.</Text>
            </View>
          }
        />
      )}

      {/* MODAL DE REPARTO */}
      <Modal visible={modalVisible} animationType="slide" transparent statusBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={[styles.modalOverlay, Platform.OS === 'android' && { paddingBottom: keyboardHeight }]}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Repartir Nuevo Descuento</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Ionicons name="close" size={24} color="#374151" />
                  </TouchableOpacity>
                </View>

                {loadingForm ? (
                  <ActivityIndicator size="large" color="#ec4899" style={{ marginVertical: 40 }} />
                ) : (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
                  >
                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Concepto General</Text>
                      <View style={styles.conceptosGrid}>
                        {CONCEPTOS_VALIDOS.map(c => (
                          <TouchableOpacity
                            key={c}
                            style={[styles.conceptoChip, concepto === c && styles.conceptoChipActive]}
                            onPress={() => setConcepto(c)}
                          >
                            <Text style={[styles.conceptoText, concepto === c && styles.conceptoTextActive]}>
                              {c.replace('_', ' ')}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Fecha del Descuento</Text>
                      <TouchableOpacity
                        style={{ padding: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }}
                        onPress={() => setShowDatePicker(true)}
                      >
                        <Text style={{ fontSize: 16, color: '#111827' }}>
                          {fechaDescuento.toLocaleDateString()}
                        </Text>
                      </TouchableOpacity>
                      {showDatePicker && (
                        <DateTimePicker
                          value={fechaDescuento}
                          mode="date"
                          display="default"
                          onChange={(event, selectedDate) => {
                            setShowDatePicker(false);
                            if (selectedDate) setFechaDescuento(selectedDate);
                          }}
                        />
                      )}
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Descripción Detallada</Text>
                      <Input
                        value={descripcion}
                        onChangeText={setDescripcion}
                        placeholder="Ej: Faltante caja principal turno tarde"
                      />
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Monto Total a Repartir ($)</Text>
                      <Input
                        value={montoTotalStr}
                        onChangeText={setMontoTotalStr}
                        placeholder="Ej: 50000"
                        keyboardType="numeric"
                      />
                    </View>

                    {selectedIds.size > 0 && !isNaN(Number(montoTotalStr)) && Number(montoTotalStr) > 0 && (
                      <View style={styles.summaryBox}>
                        <Ionicons name="calculator-outline" size={24} color="#ec4899" />
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text style={{ fontSize: 13, color: '#ec4899' }}>A descontar por persona:</Text>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: '#be185d' }}>
                            ${valorCalculado.toLocaleString('es-CO')}
                          </Text>
                        </View>
                      </View>
                    )}

                    <View style={styles.listHeader}>
                      <Text style={styles.label}>Seleccionar Empleados ({selectedIds.size}/{empleados.length})</Text>
                      <TouchableOpacity onPress={selectAll}>
                        <Text style={styles.selectAllText}>
                          {selectedIds.size === empleados.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.employeeList}>
                      {empleados.map((empleado) => {
                        const isSelected = selectedIds.has(empleado.IDusuarios);
                        return (
                          <TouchableOpacity
                            key={empleado.IDusuarios}
                            style={[styles.employeeItem, isSelected && styles.employeeItemSelected]}
                            onPress={() => toggleSelect(empleado.IDusuarios)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                              {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                            </View>
                            <View style={{ marginLeft: 12 }}>
                              <Text style={styles.empName}>{empleado.nombre}</Text>
                              <Text style={styles.empRole}>{empleado.rol}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Button
                      style={styles.mainBtn}
                      onPress={handleGuardar}
                      loading={saving}
                    >
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                        Aplicar Descuento
                      </Text>
                    </Button>
                    <View style={{ height: 20 }} />
                  </ScrollView>
                )}
              </View>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
      {/* MODAL DE EDICIÓN */}
      <Modal visible={editModalVisible} animationType="fade" transparent statusBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Editar Descuento</Text>
                <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#374151" />
                </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Valor del Descuento ($)</Text>
                <Input
                  keyboardType="numeric"
                  value={editValorStr}
                  onChangeText={setEditValorStr}
                  placeholder="Ej: 5000"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Descripción</Text>
                <Input
                  value={editDescripcion}
                  onChangeText={setEditDescripcion}
                  placeholder="Motivo o detalle del descuento..."
                  multiline
                  numberOfLines={2}
                />
              </View>

              <Button
                style={styles.mainBtn}
                onPress={handleUpdate}
                loading={saving}
              >
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                  Guardar Cambios
                </Text>
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn: { padding: 8, marginRight: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ec4899', justifyContent: 'center', alignItems: 'center' },

  filterContainer: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  quincenaTab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: 'transparent' },
  quincenaTabActive: { backgroundColor: '#fdf2f8', borderColor: '#fbcfe8' },
  quincenaText: { fontSize: 14, fontWeight: '600', color: '#4b5563' },
  quincenaTextActive: { color: '#ec4899' },

  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#6b7280', marginTop: 6 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardIconBg: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#fdf2f8', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardSubtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  cardValor: { fontSize: 16, fontWeight: '800', color: '#be185d' },
  cardBody: { backgroundColor: '#f9fafb', borderRadius: 8, padding: 12 },
  badgeConcepto: { alignSelf: 'flex-start', backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#4b5563' },
  cardDesc: { fontSize: 13, color: '#374151' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },

  formGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 10 },

  conceptosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  conceptoChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  conceptoChipActive: { backgroundColor: '#fdf2f8', borderColor: '#ec4899' },
  conceptoText: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
  conceptoTextActive: { color: '#be185d' },

  summaryBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fdf2f8', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#fbcfe8' },

  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  selectAllText: { color: '#ec4899', fontSize: 13, fontWeight: '700' },

  employeeList: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 24 },
  employeeItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  employeeItemSelected: { backgroundColor: '#fdf2f8' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', justifyContent: 'center', alignItems: 'center' },
  checkboxSelected: { backgroundColor: '#ec4899', borderColor: '#ec4899' },
  empName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  empRole: { fontSize: 12, color: '#6b7280' },

  mainBtn: { backgroundColor: '#ec4899', paddingVertical: 16, borderRadius: 12 }
});
