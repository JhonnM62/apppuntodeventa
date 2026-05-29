import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useMesaStore } from '../../store/useMesaStore';
import { getMesas, createMesa, updateMesa, deleteMesa, Mesa } from '../../services/mesas';

const MesasScreen = ({ navigation }: any) => {
  const { mesas, setMesas, addMesa, updateMesaState, removeMesaState, isLoading, setLoading } = useMesaStore();
  
  // States for Modals
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  
  // State for Form
  const [currentMesa, setCurrentMesa] = useState<Partial<Mesa>>({ nombre: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for Detail
  const [selectedMesa, setSelectedMesa] = useState<Mesa | null>(null);

  useEffect(() => {
    loadMesas();
  }, []);

  const loadMesas = async () => {
    setLoading(true);
    try {
      const data = await getMesas();
      setMesas(data);
    } catch (error) {
      Alert.alert('Error', 'No se pudieron cargar las mesas');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setCurrentMesa({ nombre: '' });
    setIsEditing(false);
    setFormModalVisible(true);
  };

  const handleOpenEdit = (mesa: Mesa) => {
    setCurrentMesa(mesa);
    setIsEditing(true);
    setDetailModalVisible(false); // Close detail if open
    setFormModalVisible(true);
  };

  const handleOpenDetail = (mesa: Mesa) => {
    setSelectedMesa(mesa);
    setDetailModalVisible(true);
  };

  const handleSave = async () => {
    if (!currentMesa.nombre?.trim()) {
      Alert.alert('Atención', 'El nombre de la mesa es requerido');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && currentMesa.IdMesas) {
        const updated = await updateMesa(currentMesa.IdMesas, { nombre: currentMesa.nombre.trim() });
        updateMesaState(updated.IdMesas, updated);
      } else {
        const created = await createMesa({ nombre: currentMesa.nombre.trim() });
        addMesa(created);
      }
      setFormModalVisible(false);
    } catch (error) {
      Alert.alert('Error', 'Ocurrió un error al guardar la mesa');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (mesa: Mesa) => {
    Alert.alert(
      'Eliminar Mesa',
      `¿Estás seguro de que deseas eliminar la mesa "${mesa.nombre}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await deleteMesa(mesa.IdMesas);
              removeMesaState(mesa.IdMesas);
              setDetailModalVisible(false);
            } catch (error) {
              Alert.alert('Error', 'No se pudo eliminar la mesa');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const renderMesaItem = ({ item }: { item: Mesa }) => (
    <TouchableOpacity style={styles.mesaCard} onPress={() => handleOpenDetail(item)}>
      <View style={styles.mesaCardContent}>
        <View style={styles.mesaIconContainer}>
          <Ionicons name="restaurant-outline" size={24} color="#3b82f6" />
        </View>
        <View style={styles.mesaInfo}>
          <Text style={styles.mesaName}>{item.nombre}</Text>
          <Text style={styles.mesaId}>ID: {item.IdMesas.slice(-6)}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ backgroundColor: '#fff' }} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Gestión de Mesas</Text>
          <TouchableOpacity style={styles.addBtn} onPress={handleOpenCreate}>
            <Ionicons name="add" size={24} color="#3b82f6" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View style={styles.listContainer}>
        {isLoading && mesas.length === 0 ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        ) : mesas.length === 0 ? (
          <View style={styles.centerContent}>
            <Ionicons name="layers-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>No hay mesas registradas</Text>
          </View>
        ) : (
          <FlashList
            data={mesas}
            renderItem={renderMesaItem}
            keyExtractor={(item: Mesa) => item.IdMesas}
            estimatedItemSize={80}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

      {/* Modal de Formulario (Crear/Editar) */}
      <Modal visible={formModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView 
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isEditing ? 'Editar Mesa' : 'Nueva Mesa'}</Text>
              <TouchableOpacity onPress={() => setFormModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Nombre de la Mesa</Text>
              <TextInput
                style={styles.input}
                value={currentMesa.nombre}
                onChangeText={(text) => setCurrentMesa({ ...currentMesa, nombre: text })}
                placeholder="Ej. Mesa 1, Terraza A..."
                autoFocus
                placeholderTextColor="#9ca3af"
              />
            </View>

            <TouchableOpacity 
              style={[styles.saveBtn, isSubmitting && styles.saveBtnDisabled]} 
              onPress={handleSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Guardar</Text>
              )}
            </TouchableOpacity>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal de Vista Detalle */}
      <Modal visible={detailModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detalle de Mesa</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {selectedMesa && (
              <View style={styles.detailBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Nombre:</Text>
                  <Text style={styles.detailValue}>{selectedMesa.nombre}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>ID Sistema:</Text>
                  <Text style={styles.detailValue}>{selectedMesa.IdMesas}</Text>
                </View>

                <View style={styles.detailActions}>
                  <TouchableOpacity 
                    style={[styles.actionBtn, styles.editBtn]} 
                    onPress={() => handleOpenEdit(selectedMesa)}
                  >
                    <Ionicons name="pencil" size={20} color="#fff" />
                    <Text style={styles.actionBtnText}>Editar</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.actionBtn, styles.deleteBtn]} 
                    onPress={() => handleDelete(selectedMesa)}
                  >
                    <Ionicons name="trash" size={20} color="#fff" />
                    <Text style={styles.actionBtnText}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  listContainer: { flex: 1 },
  listContent: { padding: 16 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { fontSize: 16, color: '#6b7280', marginTop: 12, fontWeight: '500' },
  
  mesaCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  mesaCardContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  mesaIconContainer: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  mesaInfo: { flex: 1 },
  mesaName: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 4 },
  mesaId: { fontSize: 13, color: '#6b7280' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, minHeight: 300 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  closeBtn: { padding: 4 },
  
  formGroup: { marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#111827' },
  
  saveBtn: { backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  detailBody: { marginTop: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  detailLabel: { fontSize: 15, color: '#6b7280', fontWeight: '500' },
  detailValue: { fontSize: 15, color: '#111827', fontWeight: '600' },
  
  detailActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 32 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, marginHorizontal: 6 },
  editBtn: { backgroundColor: '#10b981' },
  deleteBtn: { backgroundColor: '#ef4444' },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '600', marginLeft: 8 },
});

export default MesasScreen;