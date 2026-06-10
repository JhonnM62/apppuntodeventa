import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Text } from '../../components/ui/text';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { repartirDescuento } from '../../services/nomina.service';
import { useCustomAlert } from '../../context/CustomAlertContext';

export default function RepartoDescuentosScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { showAlert } = useCustomAlert();
  
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  
  const [concepto, setConcepto] = useState('');
  const [valorTotalStr, setValorTotalStr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEmpleados();
  }, []);

  const loadEmpleados = async () => {
    try {
      setLoading(true);
      const res = await api.get('/auth/users');
      setEmpleados((res.data?.data || []).filter((u: any) => u.isActive));
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudieron cargar los empleados' });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === empleados.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(empleados.map(e => e.IDusuarios)));
    }
  };

  const handleGuardar = () => {
    const valorTotal = Number(valorTotalStr);
    
    if (selectedIds.size === 0) {
      return showAlert({ type: 'error', title: 'Error', message: 'Debes seleccionar al menos un empleado' });
    }
    if (!concepto.trim()) {
      return showAlert({ type: 'error', title: 'Error', message: 'El concepto es obligatorio' });
    }
    if (isNaN(valorTotal) || valorTotal <= 0) {
      return showAlert({ type: 'error', title: 'Error', message: 'El valor debe ser un número mayor a cero' });
    }

    const valorPorPersona = valorTotal / selectedIds.size;

    showAlert({
      type: 'confirm',
      title: 'Repartir Descuento',
      message: `Se descontarán $${valorPorPersona.toLocaleString('es-CO')} a cada uno de los ${selectedIds.size} empleados seleccionados.\n\n¿Estás seguro?`,
      confirmText: 'Aplicar',
      onConfirm: async () => {
        try {
          setSaving(true);
          await repartirDescuento({
            usuariosIds: Array.from(selectedIds),
            concepto: concepto.trim(),
            valorTotal
          });
          showAlert({ type: 'success', title: 'Éxito', message: 'Descuento aplicado correctamente' });
          navigation.goBack();
        } catch (error) {
          console.error(error);
          showAlert({ type: 'error', title: 'Error', message: 'No se pudo aplicar el descuento' });
        } finally {
          setSaving(false);
        }
      }
    });
  };

  const valorCalculado = Number(valorTotalStr) / (selectedIds.size || 1);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Repartir Descuento</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Concepto (Motivo)</Text>
            <Input 
              value={concepto} 
              onChangeText={setConcepto} 
              placeholder="Ej: Descuadre caja principal" 
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Valor Total a Repartir ($)</Text>
            <Input 
              value={valorTotalStr} 
              onChangeText={setValorTotalStr} 
              placeholder="Ej: 50000" 
              keyboardType="numeric" 
            />
          </View>

          {selectedIds.size > 0 && !isNaN(Number(valorTotalStr)) && Number(valorTotalStr) > 0 && (
            <View style={styles.summaryBox}>
              <Ionicons name="calculator-outline" size={24} color="#3b82f6" />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ fontSize: 13, color: '#3b82f6' }}>Valor exacto por empleado:</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#1d4ed8' }}>
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
            isLoading={saving}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
              Aplicar Descuento
            </Text>
          </Button>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn: { padding: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  content: { padding: 16 },
  
  formGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  
  summaryBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#bfdbfe' },
  
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  selectAllText: { color: '#3b82f6', fontSize: 13, fontWeight: '600' },
  
  employeeList: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 24 },
  employeeItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  employeeItemSelected: { backgroundColor: '#f0fdf4' },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', justifyContent: 'center', alignItems: 'center' },
  checkboxSelected: { backgroundColor: '#10b981', borderColor: '#10b981' },
  empName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  empRole: { fontSize: 12, color: '#6b7280' },
  
  mainBtn: { backgroundColor: '#4CAF50', paddingVertical: 16, borderRadius: 12 }
});
