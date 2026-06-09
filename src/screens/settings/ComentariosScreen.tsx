import React, { useEffect, useState } from 'react';
import { View, FlatList, ActivityIndicator, TouchableOpacity, StyleSheet, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/ui/text';
import { Button } from '../../components/ui/button';
import { getComentarios, createComentario, updateComentario, deleteComentario, Comentario } from '../../services/comentarios';
import Toast from 'react-native-toast-message';
import { usePermissions } from '../../hooks/usePermissions';
import { useCustomAlert } from '../../context/CustomAlertContext';
import { FlashList as OriginalFlashList } from '@shopify/flash-list';
const FlashList = OriginalFlashList as any;

const ComentariosScreen = ({ navigation }: any) => {
  const { showAlert } = useCustomAlert();
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { canCreate, canEdit, canDelete } = usePermissions('configuracion');

  // Form state
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('');
  const [precio, setPrecio] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const insets = useSafeAreaInsets();

  const uniqueTipos = Array.from(new Set(comentarios.map(c => c.tipo).filter(Boolean))) as string[];
  const filteredComentarios = comentarios
    .filter(c => 
      c.comentarios?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.tipo?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => (a.tipo || '').localeCompare(b.tipo || ''));

  const fetchComentarios = async () => {
    try {
      setLoading(true);
      const data = await getComentarios();
      setComentarios(data);
    } catch (error) {
      console.error('Error fetching comentarios:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudieron cargar los comentarios' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComentarios();
  }, []);

  const handleSave = async () => {
    if (!nombre.trim()) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'El nombre del comentario es obligatorio' });
      return;
    }

    const payload = {
      comentarios: nombre,
      tipo: tipo || 'Adicional',
      precio: parseFloat(precio) || 0,
    };

    try {
      setIsSubmitting(true);
      if (editingId) {
        await updateComentario(editingId, payload);
        Toast.show({ type: 'success', text1: 'Éxito', text2: 'Comentario actualizado' });
      } else {
        await createComentario(payload);
        Toast.show({ type: 'success', text1: 'Éxito', text2: 'Comentario creado' });
      }
      resetForm();
      fetchComentarios();
    } catch (error) {
      console.error('Error saving comentario:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo guardar el comentario' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (item: Comentario) => {
    setEditingId(item.ID);
    setNombre(item.comentarios || '');
    setTipo(item.tipo || '');
    setPrecio(item.precio ? item.precio.toString() : '0');
  };

const handleDelete = (id: string) => {
    showAlert({
      type: 'confirm',
      title: 'Confirmar',
      message: '¿Estás seguro de que deseas eliminar este comentario?',
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          await deleteComentario(id);
          Toast.show({ type: 'success', text1: 'Éxito', text2: 'Comentario eliminado' });
          fetchComentarios();
        } catch (error) {
          showAlert({ type: 'error', title: 'Error', message: 'No se pudo eliminar' });
        }
      },
      onCancel: () => {},
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setNombre('');
    setTipo('');
    setPrecio('');
  };

  const renderItem = ({ item }: { item: Comentario }) => (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{item.comentarios}</Text>
        <Text style={styles.cardSubtitle}>Tipo: {item.tipo || 'N/A'}</Text>
        <Text style={styles.cardPrice}>
          {item.precio && item.precio !== 0 ? `$${item.precio.toLocaleString()}` : 'Gratis'}
        </Text>
      </View>
      {(canEdit || canDelete) && (
        <View style={styles.cardActions}>
          {canEdit && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleEdit(item)}>
              <Ionicons name="pencil" size={20} color="#3b82f6" />
            </TouchableOpacity>
          )}
          {canDelete && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item.ID)}>
              <Ionicons name="trash" size={20} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Adicionales y Descuentos</Text>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre o tipo..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {(editingId ? canEdit : canCreate) && (
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>{editingId ? 'Editar Adicional' : 'Nuevo Adicional'}</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nombre (ej: Sin Cebolla, +Queso)</Text>
              <TextInput
                style={styles.input}
                value={nombre}
                onChangeText={setNombre}
                placeholder="Nombre del adicional"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Tipo</Text>
                <TextInput
                  style={styles.input}
                  value={tipo}
                  onChangeText={setTipo}
                  placeholder="ej: Adicional"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>Precio (+ o -)</Text>
                <TextInput
                  style={styles.input}
                  value={precio}
                  onChangeText={setPrecio}
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                />
              </View>
            </View>

            {uniqueTipos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipsScroll, { marginBottom: 16, marginTop: -8 }]}>
                {uniqueTipos.map(t => (
                  <TouchableOpacity key={t} style={styles.tipoChip} onPress={() => setTipo(t)}>
                    <Text style={styles.tipoChipText}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.formActions}>
              {editingId && (
                <Button variant="outline" style={{ flex: 1, marginRight: 8 }} onPress={resetForm}>
                  Cancelar
                </Button>
              )}
              <Button style={{ flex: 1 }} onPress={handleSave} loading={isSubmitting}>
                Guardar
              </Button>
            </View>
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 20 }} />
        ) : (
          <View style={{ flex: 1 }}>
            <FlashList
              data={filteredComentarios}
              keyExtractor={(item: Comentario) => item.ID}
              renderItem={renderItem}
              estimatedItemSize={80}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn: { marginRight: 16 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  formContainer: { padding: 16, backgroundColor: '#fff', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  formTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 12 },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 4 },
  input: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827' },
  chipsScroll: { marginTop: 8, flexDirection: 'row' },
  tipoChip: { backgroundColor: '#e0e7ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 6 },
  tipoChipText: { fontSize: 12, color: '#4338ca', fontWeight: '600' },
  row: { flexDirection: 'row' },
  formActions: { flexDirection: 'row', marginTop: 8 },
  listContent: { padding: 16, paddingBottom: 100 },
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  cardPrice: { fontSize: 14, fontWeight: '800', color: '#10b981', marginTop: 4 },
  cardActions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { padding: 8, marginLeft: 8, backgroundColor: '#f3f4f6', borderRadius: 8 },
});

export default ComentariosScreen;
