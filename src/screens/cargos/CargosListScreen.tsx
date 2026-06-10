import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Modal, Switch, ActivityIndicator, Alert } from 'react-native';
import { Text } from '../../components/ui/text';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCargos, createCargo, updateCargo, deleteCargo, Cargo } from '../../services/cargos.service';
import { useCustomAlert } from '../../context/CustomAlertContext';

export default function CargosListScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { showAlert } = useCustomAlert();
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCargo, setEditingCargo] = useState<Cargo | null>(null);
  
  // Form
  const [nombre, setNombre] = useState('');
  const [salarioBase, setSalarioBase] = useState('');
  const [esFijo, setEsFijo] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCargos();
  }, []);

  const loadCargos = async () => {
    try {
      setLoading(true);
      const res = await getCargos();
      setCargos(res.data || []);
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudieron cargar los cargos' });
    } finally {
      setLoading(false);
    }
  };

  const openForm = (cargo?: Cargo) => {
    if (cargo) {
      setEditingCargo(cargo);
      setNombre(cargo.nombre);
      setSalarioBase(String(cargo.salarioBase));
      setEsFijo(cargo.esFijo);
    } else {
      setEditingCargo(null);
      setNombre('');
      setSalarioBase('');
      setEsFijo(false);
    }
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!nombre.trim()) return showAlert({ type: 'error', title: 'Error', message: 'El nombre es obligatorio' });
    if (!salarioBase.trim() || isNaN(Number(salarioBase))) return showAlert({ type: 'error', title: 'Error', message: 'Salario inválido' });

    setSaving(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        salarioBase: Number(salarioBase),
        esFijo
      };

      if (editingCargo) {
        await updateCargo(editingCargo.IDcargo, payload);
      } else {
        await createCargo(payload);
      }
      setModalVisible(false);
      loadCargos();
    } catch (error) {
      console.error(error);
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
        } catch (error) {
          console.error(error);
          showAlert({ type: 'error', title: 'Error', message: 'No se pudo eliminar el cargo' });
        }
      }
    });
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
            <Text style={{ textAlign: 'center', marginTop: 20, color: '#666' }}>No hay cargos creados</Text>
          ) : (
            cargos.map((cargo) => (
              <Card key={cargo.IDcargo} style={styles.card}>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle}>{cargo.nombre}</Text>
                  <Text style={styles.cardSubtitle}>
                    Salario Base: ${Number(cargo.salarioBase).toLocaleString('es-CO')}
                  </Text>
                  <Text style={styles.badgeText}>
                    {cargo.esFijo ? 'Pago Fijo (por día/turno)' : 'Pago Variable (por horas)'}
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={() => openForm(cargo)} style={styles.actionBtn}>
                    <Ionicons name="pencil" size={20} color="#3b82f6" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(cargo.IDcargo)} style={styles.actionBtn}>
                    <Ionicons name="trash" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </Card>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Form Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingCargo ? 'Editar Cargo' : 'Nuevo Cargo'}</Text>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Nombre del Cargo</Text>
              <Input value={nombre} onChangeText={setNombre} placeholder="Ej: Cajero, Mesero" />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Salario Base ($)</Text>
              <Input value={salarioBase} onChangeText={setSalarioBase} placeholder="Ej: 50000" keyboardType="numeric" />
            </View>

            <View style={styles.switchGroup}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>¿Salario Fijo?</Text>
                <Text style={{ fontSize: 12, color: '#666' }}>Si está inactivo, el pago se calcula por horas de asistencia.</Text>
              </View>
              <Switch value={esFijo} onValueChange={setEsFijo} trackColor={{ true: '#4CAF50', false: '#ccc' }} />
            </View>

            <View style={styles.modalActions}>
              <Button style={{ flex: 1, marginRight: 8, backgroundColor: '#f3f4f6' }} onPress={() => setModalVisible(false)} disabled={saving}>
                <Text style={{ color: '#111827' }}>Cancelar</Text>
              </Button>
              <Button style={{ flex: 1, backgroundColor: '#4CAF50' }} onPress={handleSave} isLoading={saving}>
                <Text style={{ color: '#fff' }}>Guardar</Text>
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
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 12, elevation: 1 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: '#4b5563', marginBottom: 4 },
  badgeText: { fontSize: 12, color: '#6b7280', fontStyle: 'italic' },
  cardActions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { padding: 8, marginLeft: 8 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', backgroundColor: '#fff', borderRadius: 16, padding: 24, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 20 },
  formGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  switchGroup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between' }
});
