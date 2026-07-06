import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, FlatList, Modal, KeyboardAvoidingView, Platform, Keyboard, SectionList, TextInput } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Text } from '../../components/ui/text';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import api from '../../services/api';
import { repartirDescuento, getDescuentos, updateDescuento, deleteDescuento } from '../../services/nomina.service';
import { useCustomAlert } from '../../context/CustomAlertContext';

const CONCEPTOS_VALIDOS = ['DESCUADRE_CAJA', 'CENA', 'PERDIDA', 'ROBO', 'ADELANTO', 'LLEGADA_TARDIA', 'OTRO'];

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
  const [searchQuery, setSearchQuery] = useState('');

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
  const [editFecha, setEditFecha] = useState(new Date());
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [showEditTimePicker, setShowEditTimePicker] = useState(false);

  const [concepto, setConcepto] = useState('DESCUADRE_CAJA');
  const [descripcion, setDescripcion] = useState('');
  const [montoTotalStr, setMontoTotalStr] = useState('');
  const [fechaDescuento, setFechaDescuento] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [porcentajeCobro, setPorcentajeCobro] = useState<string>('100');

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
      const inicioUTC = new Date(Date.UTC(yD, mD - 1, dD, 0, 0, 0, 0));
      const finUTC = new Date(Date.UTC(yH, mH - 1, dH, 23, 59, 59, 999));

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
    setPorcentajeCobro('100');
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
    const porcentaje = Number(porcentajeCobro);

    if (selectedIds.size < 1) {
      return showAlert({ type: 'error', title: 'Error', message: 'Debes seleccionar al menos un empleado para asignar un descuento' });
    }
    if (!descripcion.trim()) {
      return showAlert({ type: 'error', title: 'Error', message: 'La descripción es obligatoria' });
    }
    if (isNaN(montoTotal) || montoTotal <= 0) {
      return showAlert({ type: 'error', title: 'Error', message: 'El monto total debe ser un número mayor a cero' });
    }
    if (isNaN(porcentaje) || porcentaje <= 0 || porcentaje > 100) {
      return showAlert({ type: 'error', title: 'Error', message: 'El porcentaje de cobro debe ser válido entre 1 y 100' });
    }

    const montoEfectivo = montoTotal * (porcentaje / 100);
    const valorPorPersona = montoEfectivo / selectedIds.size;
    const msg = selectedIds.size === 1
      ? `Faltante de $${montoTotal.toLocaleString('es-CO')}. Se cobrará el ${porcentaje}%. \n\nSe descontará $${valorPorPersona.toLocaleString('es-CO')} al empleado seleccionado.\n\n¿Estás seguro?`
      : `Faltante de $${montoTotal.toLocaleString('es-CO')}. Se cobrará el ${porcentaje}%. \n\nSe descontarán $${valorPorPersona.toLocaleString('es-CO')} a cada uno de los ${selectedIds.size} empleados seleccionados.\n\n¿Estás seguro?`;

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
            montoTotal: montoEfectivo,
            concepto,
            descripcion: `${descripcion.trim()} (Faltante original: $${montoTotal} / Cobro: ${porcentaje}%)`,
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
    setEditFecha(item.fecha ? new Date(item.fecha) : new Date());
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
        valor,
        fecha: editFecha.toISOString()
      } as any);
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

  const handleDeleteDescuento = (descuento: any) => {
    showAlert({
      type: 'confirm',
      title: 'Eliminar Descuento',
      message: `¿Estás seguro de eliminar el descuento por $${descuento.valor.toLocaleString('es-CO')}?`,
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          await deleteDescuento(descuento.IDdescuento);
          showAlert({ type: 'success', title: 'Éxito', message: 'Descuento eliminado' });
          if (editModalVisible) setEditModalVisible(false);
          loadDescuentos();
        } catch (error) {
          showAlert({ type: 'error', title: 'Error', message: 'No se pudo eliminar el descuento' });
        }
      }
    });
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

  // Lógica de filtrado y agrupación
  const filteredDescuentos = descuentos.filter(d => {
    const q = searchQuery.toLowerCase();
    const nombre = (d.usuario?.nombre || '').toLowerCase();
    const desc = (d.descripcion || '').toLowerCase();
    const conc = (d.concepto || '').toLowerCase();
    return nombre.includes(q) || desc.includes(q) || conc.includes(q);
  });

  const groupedMap = new Map<string, any>();
  filteredDescuentos.forEach(d => {
    const empleadoId = d.usuarioId || d.usuario?.IDusuarios || 'unknown';
    const empleadoName = d.usuario?.nombre || 'Empleado';
    if (!groupedMap.has(empleadoId)) {
      groupedMap.set(empleadoId, {
        id: empleadoId,
        title: empleadoName,
        total: 0,
        data: []
      });
    }
    const group = groupedMap.get(empleadoId);
    group.total += Number(d.valor);
    group.data.push(d);
  });

  const sectionData = Array.from(groupedMap.values()).sort((a, b) => a.title.localeCompare(b.title));

  const renderSectionHeader = ({ section }: { section: any }) => (
    <View style={styles.sectionHeader}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={styles.sectionAvatar}>
          <Text style={styles.sectionAvatarText}>{section.title.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
      <Text style={styles.sectionTotal}>-${section.total.toLocaleString('es-CO')}</Text>
    </View>
  );

  const renderDescuento = ({ item, index, section }: { item: any, index: number, section: any }) => {
    const isLast = index === section.data.length - 1;
    return (
      <TouchableOpacity style={[styles.cardItem, isLast && styles.cardItemLast]} onPress={() => openEditForm(item)}>
        <View style={styles.cardHeaderSmall}>
          <View style={styles.badgeConceptoSmall}>
            <Text style={styles.badgeTextSmall}>{item.concepto.replace('_', ' ')}</Text>
          </View>
          <Text style={styles.cardSubtitleSmall}>{new Date(item.fecha).toLocaleDateString()}</Text>
        </View>
        <View style={styles.cardBodySmall}>
          <Text style={styles.cardDescSmall}>{item.descripcion}</Text>
          <View style={{ alignItems: 'flex-end', justifyContent: 'flex-end' }}>
            <Text style={styles.cardValorSmall}>-${Number(item.valor).toLocaleString('es-CO')}</Text>
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDeleteDescuento(item); }} style={{ padding: 4, marginTop: 4 }}>
              <Ionicons name="trash" size={16} color="#ef4444" />
            </TouchableOpacity>
          </View>
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
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9ca3af" />
          <TextInput
            style={styles.searchInput as any}
            placeholder="Buscar por empleado, concepto..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9ca3af"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loadingList ? (
        <ActivityIndicator size="large" color="#ec4899" style={{ marginTop: 40 }} />
      ) : (
        <SectionList
          sections={sectionData}
          keyExtractor={item => item.IDdescuento}
          renderItem={renderDescuento}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="cash-remove" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>No hay descuentos</Text>
              <Text style={styles.emptySubtext}>No se encontraron registros para esta búsqueda.</Text>
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
                      {Platform.OS === 'web' ? (
                        React.createElement('input', {
                          type: 'date',
                          value: !isNaN(fechaDescuento.getTime()) ? fechaDescuento.toISOString().split('T')[0] : '',
                          onChange: (e: any) => {
                            if (e.target.value) {
                              const [year, month, day] = e.target.value.split('-');
                              const newDate = new Date(fechaDescuento);
                              newDate.setFullYear(Number(year), Number(month) - 1, Number(day));
                              setFechaDescuento(newDate);
                            }
                          },
                          style: { padding: '12px', backgroundColor: '#f9fafb', borderWidth: '1px', borderColor: '#e5e7eb', borderRadius: '8px', fontSize: '16px', width: '100%' }
                        })
                      ) : (
                        <>
                          <TouchableOpacity
                            style={{ padding: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }}
                            onPress={() => setShowDatePicker(true)}
                          >
                            <Text style={{ fontSize: 16, color: '#111827' }}>
                              {!isNaN(fechaDescuento.getTime()) ? fechaDescuento.toLocaleDateString() : ''}
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
                        </>
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

                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Porcentaje a cobrar al equipo (%)</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <TouchableOpacity
                          style={[styles.conceptoChip, porcentajeCobro === '50' && styles.conceptoChipActive, { paddingVertical: 12, paddingHorizontal: 20 }]}
                          onPress={() => setPorcentajeCobro('50')}
                        >
                          <Text style={[styles.conceptoText, porcentajeCobro === '50' && styles.conceptoTextActive, { fontSize: 16 }]}>50%</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.conceptoChip, porcentajeCobro === '100' && styles.conceptoChipActive, { paddingVertical: 12, paddingHorizontal: 20 }]}
                          onPress={() => setPorcentajeCobro('100')}
                        >
                          <Text style={[styles.conceptoText, porcentajeCobro === '100' && styles.conceptoTextActive, { fontSize: 16 }]}>100%</Text>
                        </TouchableOpacity>
                        <View style={{ flex: 1, minWidth: 80 }}>
                          <Input
                            value={porcentajeCobro}
                            onChangeText={setPorcentajeCobro}
                            placeholder="Ej: 30"
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                    </View>

                    {selectedIds.size > 0 && !isNaN(Number(montoTotalStr)) && Number(montoTotalStr) > 0 && !isNaN(Number(porcentajeCobro)) && Number(porcentajeCobro) > 0 && (
                      <View style={styles.summaryBox}>
                        <Ionicons name="calculator-outline" size={24} color="#ec4899" />
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text style={{ fontSize: 13, color: '#ec4899' }}>
                            Faltante: ${Number(montoTotalStr).toLocaleString('es-CO')}
                          </Text>
                          <Text style={{ fontSize: 14, color: '#be185d', fontWeight: 'bold' }}>
                            A cobrar ({porcentajeCobro}%): ${(Number(montoTotalStr) * (Number(porcentajeCobro) / 100)).toLocaleString('es-CO')}
                          </Text>
                          <View style={{ height: 1, backgroundColor: '#fbcfe8', marginVertical: 6 }} />
                          <Text style={{ fontSize: 12, color: '#ec4899' }}>A descontar por persona:</Text>
                          <Text style={{ fontSize: 20, fontWeight: '800', color: '#be185d' }}>
                            ${((Number(montoTotalStr) * (Number(porcentajeCobro) / 100)) / selectedIds.size).toLocaleString('es-CO')}
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

              <View style={styles.formGroup}>
                <Text style={styles.label}>Fecha y Hora</Text>
                {Platform.OS === 'web' ? (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {React.createElement('input', {
                      type: 'date',
                      value: !isNaN(editFecha.getTime()) ? editFecha.toISOString().split('T')[0] : '',
                      onChange: (e: any) => {
                        if (e.target.value) {
                          const [year, month, day] = e.target.value.split('-');
                          const newDate = new Date(editFecha);
                          newDate.setFullYear(Number(year), Number(month) - 1, Number(day));
                          setEditFecha(newDate);
                        }
                      },
                      style: { flex: 1, padding: '12px', backgroundColor: '#f9fafb', borderWidth: '1px', borderColor: '#e5e7eb', borderRadius: '8px', fontSize: '16px' }
                    })}
                    {React.createElement('input', {
                      type: 'time',
                      value: !isNaN(editFecha.getTime()) ? editFecha.toTimeString().split(' ')[0].substring(0, 5) : '',
                      onChange: (e: any) => {
                        if (e.target.value) {
                          const [hours, minutes] = e.target.value.split(':');
                          const newDate = new Date(editFecha);
                          newDate.setHours(Number(hours), Number(minutes), 0, 0);
                          setEditFecha(newDate);
                        }
                      },
                      style: { flex: 1, padding: '12px', backgroundColor: '#f9fafb', borderWidth: '1px', borderColor: '#e5e7eb', borderRadius: '8px', fontSize: '16px' }
                    })}
                  </View>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <TouchableOpacity
                        style={{ flex: 1, padding: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }}
                        onPress={() => setShowEditDatePicker(true)}
                      >
                        <Text style={{ fontSize: 16, color: '#111827', textAlign: 'center' }}>
                          {!isNaN(editFecha.getTime()) ? editFecha.toLocaleDateString() : ''}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, padding: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }}
                        onPress={() => setShowEditTimePicker(true)}
                      >
                        <Text style={{ fontSize: 16, color: '#111827', textAlign: 'center' }}>
                          {!isNaN(editFecha.getTime()) ? editFecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {showEditDatePicker && (
                      <DateTimePicker
                        value={editFecha}
                        mode="date"
                        display="default"
                        onChange={(event, selectedDate) => {
                          setShowEditDatePicker(false);
                          if (selectedDate) {
                            const newDate = new Date(editFecha);
                            newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                            setEditFecha(newDate);
                          }
                        }}
                      />
                    )}
                    {showEditTimePicker && (
                      <DateTimePicker
                        value={editFecha}
                        mode="time"
                        display="default"
                        onChange={(event, selectedDate) => {
                          setShowEditTimePicker(false);
                          if (selectedDate) {
                            const newDate = new Date(editFecha);
                            newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
                            setEditFecha(newDate);
                          }
                        }}
                      />
                    )}
                  </>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                <Button
                  style={[styles.mainBtn, { flex: 1, backgroundColor: '#f3f4f6' }]}
                  onPress={() => handleDeleteDescuento(editingDescuento)}
                  disabled={saving}
                >
                  <Text style={{ color: '#ef4444', fontSize: 16, fontWeight: 'bold' }}>Eliminar</Text>
                </Button>
                <Button
                  style={[styles.mainBtn, { flex: 1 }]}
                  onPress={handleUpdate}
                  loading={saving}
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Guardar</Text>
                </Button>
              </View>
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

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', height: 40 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#111827', height: '100%', outlineStyle: 'none' as any },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fdf2f8', padding: 12, borderTopLeftRadius: 12, borderTopRightRadius: 12, marginTop: 16, borderWidth: 1, borderColor: '#fbcfe8', borderBottomWidth: 0 },
  sectionAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ec4899', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  sectionAvatarText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#831843' },
  sectionTotal: { fontSize: 16, fontWeight: '800', color: '#be185d' },

  cardItem: { backgroundColor: '#fff', padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderTopWidth: 0 },
  cardItemLast: { borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderBottomWidth: 1, marginBottom: 8 },
  cardHeaderSmall: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  badgeConceptoSmall: { backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeTextSmall: { fontSize: 10, fontWeight: '700', color: '#4b5563' },
  cardSubtitleSmall: { fontSize: 11, color: '#6b7280' },
  cardBodySmall: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardDescSmall: { flex: 1, fontSize: 13, color: '#374151', paddingRight: 8 },
  cardValorSmall: { fontSize: 14, fontWeight: '700', color: '#be185d' },

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
