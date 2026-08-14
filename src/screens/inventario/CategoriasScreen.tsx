import React, { useState, useEffect, useCallback } from 'react';
import { View, TouchableOpacity, Text as RNText, StyleSheet, ScrollView, Modal, TextInput, ActivityIndicator, RefreshControl, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from '../../components/ui/text';
import categoriasService, { CategoriaItem, CreateCategoriaDto } from '../../services/categorias';
import useAuthStore from '../../store/useAuthStore';
import { usePermissions } from '../../hooks/usePermissions';
import { useSocketEvent } from '../../hooks/useSocketEvent';
import { SocketEvent } from '../../types/socket.types';
import { useCustomAlert } from '../../context/CustomAlertContext';
import { FlashList as OriginalFlashList } from '@shopify/flash-list';
const FlashList = OriginalFlashList as any;

const CategoriasScreen = () => {
  const { showAlert } = useCustomAlert();
  const { user } = useAuthStore();
  const [categorias, setCategorias] = useState<CategoriaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState<CategoriaItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);

  const [formData, setFormData] = useState<CreateCategoriaDto>({
    nombre: '',
    image: '',
  });

  const { canCreate, canEdit, canDelete } = usePermissions('inventario');

  const loadCategorias = useCallback(async () => {
    try {
      const data = await categoriasService.getAll();
      setCategorias(data || []);
    } catch (error: any) {
      showAlert({ type: 'error', title: 'Error', message: 'No se pudieron cargar las categorías' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCategorias();
  }, [loadCategorias]);

  useSocketEvent<any>(SocketEvent.REFRESH_CATEGORIAS, () => {
    loadCategorias();
  }, [loadCategorias]);

  const onRefresh = () => {
    setRefreshing(true);
    loadCategorias();
    setSelectedItems([]);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBatchDelete = () => {
    // Only allow deletion if none of the selected categories have products
    const categoriesToDelete = categorias.filter(c => selectedItems.map(String).includes(String(c.IDcategoria)));
    const invalidCategories = categoriesToDelete.filter(c => c.productos && c.productos.length > 0);
    
    if (invalidCategories.length > 0) {
      Alert.alert('Error', `No se pueden eliminar ${invalidCategories.length} categorías porque tienen productos asociados.`);
      return;
    }

    Alert.alert(
      "Eliminar categorías",
      `¿Estás seguro de eliminar ${selectedItems.length} categoría(s)?`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Eliminar", 
          style: "destructive",
          onPress: async () => {
            setIsDeletingBatch(true);
            try {
              await Promise.all(selectedItems.map(id => categoriasService.delete(id)));
              setSelectedItems([]);
              loadCategorias();
              showAlert({ type: 'success', title: 'Éxito', message: 'Categorías eliminadas.' });
            } catch (error: any) {
              showAlert({ type: 'error', title: 'Error', message: 'No se pudieron eliminar todas las categorías.' });
            } finally {
              setIsDeletingBatch(false);
            }
          }
        }
      ]
    );
  };

  const handleSave = async () => {
    if (!formData.nombre.trim()) {
      showAlert({ type: 'error', title: 'Error', message: 'El nombre es requerido' });
      return;
    }

    setSaving(true);
    try {
      if (editingCategoria) {
        await categoriasService.update(editingCategoria.IDcategoria, formData);
        showAlert({ type: 'success', title: 'Éxito', message: 'Categoría actualizada' });
      } else {
        await categoriasService.create(formData);
        showAlert({ type: 'success', title: 'Éxito', message: 'Categoría creada' });
      }
      setShowModal(false);
      setEditingCategoria(null);
      setFormData({ nombre: '', image: '' });
      loadCategorias();
    } catch (error: any) {
      showAlert({ type: 'error', title: 'Error', message: error?.response?.data?.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (cat: CategoriaItem) => {
    if (cat.productos && cat.productos.length > 0) {
      showAlert({ type: 'error', title: 'Error', message: `No se puede eliminar. Tiene ${cat.productos.length} productos asociados.` });
      return;
    }

    showAlert({
      type: 'confirm',
      title: 'Confirmar',
      message: `¿Eliminar categoría "${cat.nombre}"?`,
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          await categoriasService.delete(cat.IDcategoria);
          loadCategorias();
        } catch (error: any) {
          showAlert({ type: 'error', title: 'Error', message: 'No se pudo eliminar' });
        }
      },
      onCancel: () => {},
    });
  };

  const openCreateModal = () => {
    setEditingCategoria(null);
    setFormData({ nombre: '', image: '' });
    setShowModal(true);
  };

  const openEditModal = (cat: CategoriaItem) => {
    setEditingCategoria(cat);
    setFormData({ nombre: cat.nombre, image: cat.image || '' });
    setShowModal(true);
  };

  const renderCategoria = ({ item }: { item: CategoriaItem }) => {
    const productoCount = item.productos?.length || 0;
    const isSelected = selectedItems.includes(item.IDcategoria);

    return (
      <TouchableOpacity 
        activeOpacity={0.7}
        onPress={() => {
          if (selectedItems.length > 0) {
            handleToggleSelect(item.IDcategoria);
          } else {
            // Future navigation if needed, or open edit modal
            if (canEdit) openEditModal(item);
          }
        }}
        onLongPress={() => handleToggleSelect(item.IDcategoria)}
        style={[styles.categoriaItem, isSelected && { borderColor: '#3b82f6', borderWidth: 2 }]}
      >
        <View style={styles.categoriaRow}>
          {selectedItems.length > 0 && (
            <TouchableOpacity onPress={() => handleToggleSelect(item.IDcategoria)} style={{ marginRight: 12 }}>
              <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={24} color={isSelected ? "#3b82f6" : "#d1d5db"} />
            </TouchableOpacity>
          )}
          <View style={styles.categoryIcon}>
            <MaterialCommunityIcons name="folder" size={22} color="#f59e0b" />
          </View>

          <View style={styles.categoriaInfo}>
            <RNText style={styles.categoriaName}>{item.nombre}</RNText>
            <RNText style={styles.categoriaMeta}>
              {productoCount > 0 ? `${productoCount} productos` : 'Sin productos'}
            </RNText>
          </View>

          {(canEdit || canDelete) && (
            <View style={styles.categoriaActions}>
              {canEdit && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => openEditModal(item)}
                >
                  <Ionicons name="pencil" size={20} color="#3b82f6" />
                </TouchableOpacity>
              )}
              {canDelete && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleDelete(item)}
                >
                  <Ionicons name="trash-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {selectedItems.length > 0 ? (
            <>
              <TouchableOpacity onPress={() => setSelectedItems([])} style={{ marginRight: 12 }}>
                <Ionicons name="close" size={24} color="#111827" />
              </TouchableOpacity>
              <RNText style={styles.headerTitle}>{selectedItems.length} seleccionadas</RNText>
            </>
          ) : (
            <RNText style={styles.headerTitle}>Categorías</RNText>
          )}
        </View>
        
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {selectedItems.length > 0 && canDelete && (
            <TouchableOpacity 
              style={[styles.addBtn, { backgroundColor: '#ef4444', marginRight: 8 }]} 
              onPress={handleBatchDelete}
              disabled={isDeletingBatch}
            >
              {isDeletingBatch ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="trash" size={20} color="#fff" />}
            </TouchableOpacity>
          )}
          {canCreate && selectedItems.length === 0 && (
            <TouchableOpacity style={styles.addBtn} onPress={openCreateModal}>
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlashList
        data={categorias}
        renderItem={renderCategoria}
        keyExtractor={(item: CategoriaItem) => item.IDcategoria}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="folder-open-outline" size={64} color="#d1d5db" />
            <RNText style={styles.emptyText}>No hay categorías</RNText>
            {canCreate && (
              <TouchableOpacity style={styles.emptyBtn} onPress={openCreateModal}>
                <RNText style={styles.emptyBtnText}>Crear primera categoría</RNText>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <Modal visible={showModal} animationType="slide" onRequestClose={() => setShowModal(false)} presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          <View style={styles.modalHeader}>
            <RNText style={styles.modalTitle}>
              {editingCategoria ? 'Editar Categoría' : 'Nueva Categoría'}
            </RNText>
            <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>Nombre *</RNText>
              <TextInput
                style={styles.input}
                placeholder="Nombre de la categoría"
                placeholderTextColor="#9ca3af"
                value={formData.nombre}
                onChangeText={(t) => setFormData(p => ({ ...p, nombre: t }))}
              />
            </View>

            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>URL de imagen (opcional)</RNText>
              <TextInput
                style={styles.input}
                placeholder="https://..."
                placeholderTextColor="#9ca3af"
                value={formData.image}
                onChangeText={(t) => setFormData(p => ({ ...p, image: t }))}
              />
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
              <RNText style={styles.cancelBtnText}>Cancelar</RNText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <RNText style={styles.saveBtnText}>
                  {editingCategoria ? 'Actualizar' : 'Crear'}
                </RNText>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#22c55e', justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  categoriaItem: { marginBottom: 8 },
  categoriaRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14 },
  categoryIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#fef3c7', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  categoriaInfo: { flex: 1 },
  categoriaName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  categoriaMeta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  categoriaActions: { flexDirection: 'row', gap: 4 },
  actionBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 16, color: '#6b7280', marginTop: 16 },
  emptyBtn: { marginTop: 20, backgroundColor: '#3b82f6', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  emptyBtnText: { color: '#fff', fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  modalContent: { flex: 1, padding: 20 },
  inputGroup: { marginTop: 20 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#f9fafb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb' },
  modalFooter: { flexDirection: 'row', padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#22c55e', alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#9ca3af' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

export default CategoriasScreen;