import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ScrollView, Modal,
  Switch, ActivityIndicator, TextInput, Text as RNText,
  KeyboardAvoidingView, Platform, Keyboard
} from 'react-native';
import { Text } from '../../components/ui/text';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCargos, createCargo, updateCargo, deleteCargo, Cargo, DIAS_SEMANA } from '../../services/cargos.service';
import { useCustomAlert } from '../../context/CustomAlertContext';

const ROLES_DISPONIBLES = [
  { key: 'Admin app',    label: 'Admin App',     description: 'Administrador de la aplicación' },
  { key: 'Cajero',       label: 'Cajero',         description: 'Encargado de caja y cobros' },
  { key: 'Mesero',       label: 'Mesero',         description: 'Toma pedidos y atiende mesas' },
  { key: 'Cocina',       label: 'Cocina',         description: 'Prepara los pedidos' },
  { key: 'Proveedor',    label: 'Proveedor',      description: 'Gestiona proveedores' },
  { key: 'Domiciliario', label: 'Domiciliario',   description: 'Entrega pedidos a domicilio' },
  { key: 'Jefe',         label: 'Jefe',           description: 'Supervisa operaciones' },
  { key: 'Admin negocio',label: 'Admin Negocio',  description: 'Administrador del negocio' },
  { key: 'Inventarista', label: 'Inventarista',   description: 'Gestiona el inventario' },
];

type TarifasDias = Record<string, string>;

const emptyTarifas = (): TarifasDias => ({
  tarifaLunes: '',
  tarifaMartes: '',
  tarifaMiercoles: '',
  tarifaJueves: '',
  tarifaViernes: '',
  tarifaSabado: '',
  tarifaDomingo: '',
});

/** Formatea un número con puntos de miles: 50000 → 50.000 (regex, confiable en RN/Android) */
const fmt = (n: number | string | null | undefined): string => {
  if (n == null || n === '' || n === 'null' || n === 'undefined') return '0';
  const num = Math.round(Number(n));
  if (isNaN(num)) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

/** Formatea mientras el usuario escribe (acepta string con o sin puntos) */
const formatPrice = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

/** Quita los puntos para obtener el número puro */
const parsePrice = (formatted: string): string => formatted.replace(/\./g, '');

export default function CargosListScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { showAlert } = useCustomAlert();

  const [cargos, setCargos]             = useState<Cargo[]>([]);
  const [loading, setLoading]           = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCargo, setEditingCargo] = useState<Cargo | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Escuchar teclado para Android
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Form state
  const [nombre, setNombre]           = useState('');
  const [tarifas, setTarifas]         = useState<TarifasDias>(emptyTarifas());
  const [descuentoCena, setDescuentoCena] = useState('');
  const [esFijo, setEsFijo]           = useState(false);
  const [saving, setSaving]           = useState(false);

  useEffect(() => { loadCargos(); }, []);

  const loadCargos = async () => {
    try {
      setLoading(true);
      const res = await getCargos();
      setCargos(res.data || []);
    } catch {
      showAlert({ type: 'error', title: 'Error', message: 'No se pudieron cargar los cargos' });
    } finally {
      setLoading(false);
    }
  };

  const openForm = (cargo?: Cargo) => {
    if (cargo) {
      setEditingCargo(cargo);
      setNombre(cargo.nombre);
      setTarifas({
        tarifaLunes:     cargo.tarifaLunes     ? fmt(cargo.tarifaLunes)     : '',
        tarifaMartes:    cargo.tarifaMartes    ? fmt(cargo.tarifaMartes)    : '',
        tarifaMiercoles: cargo.tarifaMiercoles ? fmt(cargo.tarifaMiercoles) : '',
        tarifaJueves:    cargo.tarifaJueves    ? fmt(cargo.tarifaJueves)    : '',
        tarifaViernes:   cargo.tarifaViernes   ? fmt(cargo.tarifaViernes)   : '',
        tarifaSabado:    cargo.tarifaSabado    ? fmt(cargo.tarifaSabado)    : '',
        tarifaDomingo:   cargo.tarifaDomingo   ? fmt(cargo.tarifaDomingo)   : '',
      });
      setDescuentoCena(cargo.descuentoCena ? fmt(cargo.descuentoCena) : '');
    } else {
      setEditingCargo(null);
      setNombre('');
      setTarifas(emptyTarifas());
      setDescuentoCena('');
      setEsFijo(false);
    }
    setShowDropdown(false);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!nombre.trim()) return showAlert({ type: 'error', title: 'Error', message: 'Selecciona un rol del cargo' });

    // Al menos un día con salario
    const algunaTarifa = DIAS_SEMANA.some(d => tarifas[d.key] !== '' && !isNaN(Number(tarifas[d.key])));
    if (!algunaTarifa) return showAlert({ type: 'error', title: 'Error', message: 'Debes ingresar el salario de al menos un día' });

    setSaving(true);
    try {
      const payload: Partial<Cargo> = { nombre: nombre.trim() };
      DIAS_SEMANA.forEach(d => {
        const raw = parsePrice(tarifas[d.key]);
        if (raw !== '' && !isNaN(Number(raw))) {
          (payload as any)[d.key] = Number(raw);
        }
      });
      const cenaRaw = parsePrice(descuentoCena);
      if (cenaRaw !== '' && !isNaN(Number(cenaRaw))) {
        payload.descuentoCena = Number(cenaRaw);
      }

      if (editingCargo) {
        await updateCargo(editingCargo.IDcargo, payload);
      } else {
        await createCargo(payload);
      }
      setModalVisible(false);
      loadCargos();
    } catch {
      showAlert({ type: 'error', title: 'Error', message: 'No se pudo guardar el cargo' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    showAlert({
      type: 'confirm',
      title: 'Eliminar Cargo',
      message: '¿Estás seguro de eliminar este cargo?',
      onConfirm: async () => {
        try {
          await deleteCargo(id);
          loadCargos();
        } catch {
          showAlert({ type: 'error', title: 'Error', message: 'No se pudo eliminar el cargo' });
        }
      }
    });
  };

  /** Calcula el promedio de los días ingresados para mostrar en la tarjeta */
  const getTarifaPromedio = (cargo: Cargo) => {
    const vals = DIAS_SEMANA.map(d => (cargo as any)[d.key]).filter((v: any) => v != null && v > 0);
    if (vals.length === 0) return null;
    const sum = vals.reduce((a: number, b: number) => a + b, 0);
    return Math.round(sum / vals.length);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Cargos y Salarios</Text>
        <TouchableOpacity onPress={() => openForm()} style={styles.addBtn}>
          <Ionicons name="add" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.content}>
          {cargos.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="briefcase-outline" size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No hay cargos creados</Text>
              <Text style={styles.emptySubtext}>Toca el botón + para agregar el primero</Text>
            </View>
          ) : (
            cargos.map((cargo) => {
              const vals = DIAS_SEMANA
                .map(d => Number((cargo as any)[d.key]))
                .filter(v => !isNaN(v) && v > 0);
              const avg = vals.length > 0
                ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
                : null;

              return (
                <View key={cargo.IDcargo} style={styles.card}>
                  {/* Cabecera: ícono + nombre + promedio + acciones */}
                  <View style={styles.cardHeader}>
                    <View style={styles.cardIconBg}>
                      <Ionicons name="briefcase" size={16} color="#16a34a" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{cargo.nombre}</Text>
                      {avg != null && (
                        <Text style={styles.avgText}>
                          Prom. <Text style={styles.avgValue}>${fmt(avg)}/día</Text>
                        </Text>
                      )}
                    </View>
                    <View style={styles.cardActions}>
                      <TouchableOpacity onPress={() => openForm(cargo)} style={styles.actionBtnEdit}>
                        <Ionicons name="pencil" size={14} color="#3b82f6" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(cargo.IDcargo)} style={styles.actionBtnDelete}>
                        <Ionicons name="trash" size={14} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Grilla de días compacta */}
                  <View style={styles.daysGrid}>
                    {DIAS_SEMANA.map((d, idx) => {
                      const val = Number((cargo as any)[d.key]);
                      const hasVal = !isNaN(val) && val > 0;
                      const isWeekend = idx >= 5;
                      return (
                        <View key={d.key} style={[styles.dayCell, isWeekend && styles.dayCellWeekend]}>
                          <Text style={[styles.dayCellLabel, isWeekend && styles.dayCellLabelWeekend]}>
                            {d.label.substring(0, 3)}
                          </Text>
                          <Text
                            style={[styles.dayCellVal, !hasVal && styles.dayCellEmpty]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            {hasVal ? `$${fmt(val)}` : '—'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  {/* Descuento cena inline */}
                  {cargo.descuentoCena != null && Number(cargo.descuentoCena) > 0 && (
                    <View style={styles.cenaRow}>
                      <Ionicons name="restaurant" size={11} color="#d97706" />
                      <Text style={styles.cenaText}>
                        {' '}Cena: <Text style={styles.cenaVal}>${fmt(cargo.descuentoCena)}</Text>
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* Form Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent statusBarTranslucent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.modalOverlay,
              Platform.OS === 'android' && { paddingBottom: keyboardHeight }
            ]}
          >
            <View style={styles.modalContent}>
            {/* Header del modal */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCargo ? 'Editar Cargo' : 'Nuevo Cargo'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
              keyboardShouldPersistTaps="handled"
            >

              {/* Selector de rol */}
              <View style={styles.formGroup}>
                <RNText style={styles.label}>Nombre del Cargo *</RNText>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => setShowDropdown(!showDropdown)}
                >
                  <RNText style={[styles.dropdownButtonText, !nombre && { color: '#9ca3af' }]}>
                    {ROLES_DISPONIBLES.find(r => r.key === nombre)?.label || 'Selecciona un rol...'}
                  </RNText>
                  <Ionicons name={showDropdown ? 'chevron-up' : 'chevron-down'} size={18} color="#6b7280" />
                </TouchableOpacity>

                {showDropdown && (
                  <View style={styles.dropdownMenu}>
                    {ROLES_DISPONIBLES.map(rol => (
                      <TouchableOpacity
                        key={rol.key}
                        style={[styles.dropdownItem, nombre === rol.key && styles.dropdownItemActive]}
                        onPress={() => { setNombre(rol.key); setShowDropdown(false); }}
                      >
                        <RNText style={[styles.dropdownItemText, nombre === rol.key && styles.dropdownItemTextActive]}>
                          {rol.label}
                        </RNText>
                        <RNText style={styles.dropdownItemDesc}>{rol.description}</RNText>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Tarifas por día */}
              <View style={styles.formGroup}>
                <RNText style={styles.label}>💰 Salario por día de la semana</RNText>
                <RNText style={styles.sublabel}>Ingresa el salario para cada día que aplique. Puedes dejar en blanco los días que no trabaja.</RNText>
                
                {DIAS_SEMANA.map((dia, idx) => {
                  const esFinSemana = idx >= 5; // Sábado y Domingo
                  return (
                    <View key={dia.key} style={[styles.diaRow, esFinSemana && styles.diaRowWeekend]}>
                      <View style={styles.diaLabel}>
                        <RNText style={[styles.diaNombre, esFinSemana && styles.diaNombreWeekend]}>
                          {dia.label}
                        </RNText>
                        {esFinSemana && <RNText style={styles.weekendBadge}>Fin de semana</RNText>}
                      </View>
                      <View style={styles.diaInputWrapper}>
                        <RNText style={styles.diaPrefix}>$</RNText>
                        <TextInput
                          style={styles.diaInput}
                          placeholder="0"
                          placeholderTextColor="#9ca3af"
                          keyboardType="numeric"
                          value={tarifas[dia.key]}
                          onChangeText={val =>
                            setTarifas(prev => ({ ...prev, [dia.key]: formatPrice(val) }))
                          }
                        />
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Descuento cena */}
              <View style={styles.formGroup}>
                <RNText style={styles.label}>🍽 Descuento por cena</RNText>
                <RNText style={styles.sublabel}>Valor que se descuenta del pago si el empleado cenó en el turno.</RNText>
                <View style={styles.diaInputWrapper}>
                  <RNText style={styles.diaPrefix}>$</RNText>
                  <TextInput
                    style={styles.diaInput}
                    placeholder="0"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={descuentoCena}
                    onChangeText={val => setDescuentoCena(formatPrice(val))}
                  />
                </View>
              </View>

              <View style={{ height: 20 }} />
            </ScrollView>

            {/* Botones */}
            <View style={styles.modalActions}>
              <Button
                style={{ flex: 1, marginRight: 8, backgroundColor: '#f3f4f6' }}
                onPress={() => setModalVisible(false)}
                disabled={saving}
              >
                <Text style={{ color: '#111827' }}>Cancelar</Text>
              </Button>
              <Button
                style={{ flex: 1, backgroundColor: '#4CAF50' }}
                onPress={handleSave}
                isLoading={saving}
              >
                <Text style={{ color: '#fff' }}>Guardar</Text>
              </Button>
            </View>
            </View>{/* /modalContent */}
          </View>{/* /modalOverlay */}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f3f4f6' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn:         { padding: 8 },
  title:           { fontSize: 20, fontWeight: '700', color: '#111827' },
  addBtn:          { width: 40, height: 40, borderRadius: 20, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center' },
  content:         { padding: 16 },
  emptyState:      { alignItems: 'center', paddingTop: 60 },
  emptyText:       { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 16 },
  emptySubtext:    { fontSize: 14, color: '#6b7280', marginTop: 6 },

  card:            { backgroundColor: '#fff', borderRadius: 16, marginBottom: 14, padding: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  cardHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardTitleRow:    { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardIconBg:      { width: 32, height: 32, borderRadius: 10, backgroundColor: '#f0fdf4', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  cardTitle:       { fontSize: 16, fontWeight: '800', color: '#111827' },
  cardActions:     { flexDirection: 'row', gap: 10 },
  actionBtnEdit:   { width: 34, height: 34, borderRadius: 8, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  actionBtnDelete: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#fef2f2', justifyContent: 'center', alignItems: 'center' },
  avgText:         { fontSize: 11, color: '#6b7280', marginTop: 1 },
  avgValue:        { fontWeight: '700', color: '#16a34a' },

  // Grilla compacta de días (7 celdas en wrap)
  daysGrid:           { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, marginBottom: 6, gap: 6 },
  dayCell:            { width: '23%', minWidth: 60, alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 2, borderWidth: 1, borderColor: '#e5e7eb' },
  dayCellWeekend:     { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  dayCellLabel:       { fontSize: 9, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3 },
  dayCellLabelWeekend: { color: '#16a34a' },
  dayCellVal:         { fontSize: 11, fontWeight: '700', color: '#111827', marginTop: 2 },
  dayCellEmpty:       { color: '#d1d5db', fontWeight: '400' },

  cenaRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff7ed', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4 },
  cenaText:        { fontSize: 11, color: '#92400e' },
  cenaVal:         { fontWeight: '700', color: '#d97706' },

  // Modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent:    { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:      { fontSize: 20, fontWeight: '700', color: '#111827' },
  formGroup:       { marginBottom: 20 },
  label:           { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 6 },
  sublabel:        { fontSize: 12, color: '#6b7280', marginBottom: 12, lineHeight: 18 },
  modalActions:    { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb' },

  // Dropdown
  dropdownButton:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14 },
  dropdownButtonText:   { flex: 1, fontSize: 15, color: '#111827' },
  dropdownMenu:         { backgroundColor: '#fff', borderRadius: 12, marginTop: 8, elevation: 4, borderWidth: 1, borderColor: '#e5e7eb' },
  dropdownItem:         { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dropdownItemActive:   { backgroundColor: '#f0fdf4' },
  dropdownItemText:     { fontSize: 14, fontWeight: '600', color: '#374151' },
  dropdownItemTextActive: { color: '#22c55e' },
  dropdownItemDesc:     { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  // Filas de días
  diaRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  diaRowWeekend:    { backgroundColor: '#fafff5', borderRadius: 8, paddingHorizontal: 8, borderBottomWidth: 0, marginBottom: 2 },
  diaLabel:         { flex: 1 },
  diaNombre:        { fontSize: 14, fontWeight: '600', color: '#374151' },
  diaNombreWeekend: { color: '#15803d' },
  weekendBadge:     { fontSize: 10, color: '#22c55e', fontWeight: '600' },
  diaInputWrapper:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 10, minWidth: 120 },
  diaPrefix:        { fontSize: 15, color: '#6b7280', marginRight: 2 },
  diaInput:         { flex: 1, paddingVertical: 10, fontSize: 15, color: '#111827', textAlign: 'right' },
});
