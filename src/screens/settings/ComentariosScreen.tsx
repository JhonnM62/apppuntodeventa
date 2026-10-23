import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/ui/text';
import { Button } from '../../components/ui/button';
import {
  getComentarios,
  createComentario,
  updateComentario,
  deleteComentario,
  Comentario,
} from '../../services/comentarios';
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
  const [modalFormVisible, setModalFormVisible] = useState(false);
  const [selectedTipoFilter, setSelectedTipoFilter] = useState<string>('TODOS');
  const { canCreate, canEdit, canDelete } = usePermissions('configuracion');

  // Form state
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('');
  const [precio, setPrecio] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  // Es desktop cuando está en web y el ancho es suficiente para 2 columnas
  const isDesktop = Platform.OS === 'web' && windowWidth >= 920;

  const uniqueTipos = useMemo(() => {
    const tipos = Array.from(
      new Set(comentarios.map((c) => c.tipo?.trim()).filter(Boolean))
    ) as string[];
    // Sugerencias comunes si hay pocos o ninguno
    const defaultSuggestions = ['Adicional', 'Domicilios', 'Sabores', 'Descuento'];
    const merged = Array.from(new Set([...tipos, ...defaultSuggestions]));
    return merged;
  }, [comentarios]);

  const tipoCounts = useMemo(() => {
    const counts: Record<string, number> = { TODOS: comentarios.length };
    comentarios.forEach((c) => {
      const t = c.tipo?.trim() || 'Sin tipo';
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [comentarios]);

  const filteredComentarios = useMemo(() => {
    return comentarios
      .filter((c) => {
        const query = searchQuery.trim().toLowerCase();
        const matchesSearch =
          !query ||
          c.comentarios?.toLowerCase().includes(query) ||
          c.tipo?.toLowerCase().includes(query);

        const matchesTipo =
          selectedTipoFilter === 'TODOS' ||
          (c.tipo || '').trim().toLowerCase() === selectedTipoFilter.toLowerCase();

        return matchesSearch && matchesTipo;
      })
      .sort((a, b) => (a.tipo || '').localeCompare(b.tipo || ''));
  }, [comentarios, searchQuery, selectedTipoFilter]);

  const fetchComentarios = async () => {
    try {
      setLoading(true);
      const data = await getComentarios();
      setComentarios(data);
    } catch (error) {
      console.error('Error fetching comentarios:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'No se pudieron cargar los adicionales y descuentos',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComentarios();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setNombre('');
    setTipo('');
    setPrecio('');
    setModalFormVisible(false);
  };

  const handleOpenCreate = () => {
    resetForm();
    if (!isDesktop) {
      setModalFormVisible(true);
    }
  };

  const handleEdit = (item: Comentario) => {
    setEditingId(item.ID);
    setNombre(item.comentarios || '');
    setTipo(item.tipo || '');
    setPrecio(item.precio ? item.precio.toString() : '0');
    if (!isDesktop) {
      setModalFormVisible(true);
    }
  };

  const handleSave = async () => {
    if (!nombre.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Campo obligatorio',
        text2: 'El nombre del adicional o descuento es obligatorio',
      });
      return;
    }

    const payload = {
      comentarios: nombre.trim(),
      tipo: tipo.trim() || 'Adicional',
      precio: parseFloat(precio) || 0,
    };

    try {
      setIsSubmitting(true);
      if (editingId) {
        await updateComentario(editingId, payload);
        Toast.show({
          type: 'success',
          text1: 'Actualizado',
          text2: 'Adicional/descuento actualizado con éxito',
        });
      } else {
        await createComentario(payload);
        Toast.show({
          type: 'success',
          text1: 'Guardado',
          text2: 'Adicional/descuento creado con éxito',
        });
      }
      resetForm();
      fetchComentarios();
    } catch (error) {
      console.error('Error saving comentario:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'No se pudo guardar el adicional',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id: string, nombreItem?: string) => {
    showAlert({
      type: 'confirm',
      title: 'Eliminar Adicional',
      message: `¿Estás seguro de que deseas eliminar "${nombreItem || 'este ítem'}"?`,
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          await deleteComentario(id);
          Toast.show({
            type: 'success',
            text1: 'Eliminado',
            text2: 'Se ha eliminado correctamente',
          });
          if (editingId === id) resetForm();
          fetchComentarios();
        } catch (error) {
          showAlert({
            type: 'error',
            title: 'Error',
            message: 'No se pudo eliminar el adicional',
          });
        }
      },
      onCancel: () => {},
    });
  };

  const renderPrecioBadge = (val?: number) => {
    const num = Number(val || 0);
    if (num > 0) {
      return (
        <View style={styles.badgePrecioPositivo}>
          <Text style={styles.badgePrecioPositivoText}>
            +${num.toLocaleString('es-CO')}
          </Text>
        </View>
      );
    }
    if (num < 0) {
      return (
        <View style={styles.badgePrecioDescuento}>
          <Text style={styles.badgePrecioDescuentoText}>
            -${Math.abs(num).toLocaleString('es-CO')}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.badgePrecioGratis}>
        <Ionicons
          name="checkmark-circle-outline"
          size={12}
          color="#64748b"
          style={{ marginRight: 3 }}
        />
        <Text style={styles.badgePrecioGratisText}>Gratis ($0)</Text>
      </View>
    );
  };

  const renderItem = ({ item }: { item: Comentario }) => (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.comentarios}
          </Text>
        </View>

        <View style={styles.cardMetaRow}>
          <View style={styles.tipoBadge}>
            <Ionicons
              name="pricetag-outline"
              size={11}
              color="#4338ca"
              style={{ marginRight: 4 }}
            />
            <Text style={styles.tipoBadgeText}>
              {item.tipo || 'Sin Tipo'}
            </Text>
          </View>

          {renderPrecioBadge(item.precio)}
        </View>
      </View>

      {(canEdit || canDelete) && (
        <View style={styles.cardActions}>
          {canEdit && (
            <TouchableOpacity
              style={styles.actionBtnEdit}
              onPress={() => handleEdit(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={17} color="#4f46e5" />
            </TouchableOpacity>
          )}
          {canDelete && (
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={() => handleDelete(item.ID, item.comentarios)}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={17} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );

  // Formulario reutilizable (en panel lateral desktop o en modal móvil)
  const renderFormContent = (isInsideModal: boolean = false) => {
    return (
      <View
        style={[
          styles.formContainer,
          isInsideModal && styles.formContainerModal,
        ]}
      >
        <View style={styles.formHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View
              style={[
                styles.formIconContainer,
                editingId ? { backgroundColor: '#e0e7ff' } : { backgroundColor: '#dcfce7' },
              ]}
            >
              <Ionicons
                name={editingId ? 'create-outline' : 'add-circle-outline'}
                size={20}
                color={editingId ? '#4338ca' : '#15803d'}
              />
            </View>
            <View>
              <Text style={styles.formTitle}>
                {editingId ? 'Editar Adicional' : 'Nuevo Adicional'}
              </Text>
              <Text style={styles.formSubtitle}>
                {editingId
                  ? 'Modifica los campos del adicional seleccionado'
                  : 'Registra un extra, opción de menú o descuento'}
              </Text>
            </View>
          </View>

          {isInsideModal && (
            <TouchableOpacity onPress={resetForm} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Nombre <Text style={{ color: '#ef4444' }}>*</Text> (ej: Sin Cebolla, +Queso, Descuento 10%)
          </Text>
          <TextInput
            style={styles.input}
            value={nombre}
            onChangeText={setNombre}
            placeholder="Escribe el nombre del adicional o nota"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1.2, marginRight: 8 }]}>
            <Text style={styles.label}>Tipo / Categoría</Text>
            <TextInput
              style={styles.input}
              value={tipo}
              onChangeText={setTipo}
              placeholder="ej: Adicional, Domicilios..."
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={[styles.inputGroup, { flex: 0.9, marginLeft: 8 }]}>
            <Text style={styles.label}>Precio (+ o -)</Text>
            <TextInput
              style={styles.input}
              value={precio}
              onChangeText={(text) => setPrecio(text.replace(/[^0-9\-]/g, ''))}
              placeholder="0"
              placeholderTextColor="#94a3b8"
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Sugerencias Rápidas de Tipos */}
        {uniqueTipos.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.miniLabel}>Sugerencias rápidas de tipo:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
            >
              {uniqueTipos.map((t) => {
                const isActive = tipo.toLowerCase() === t.toLowerCase();
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.tipoChip,
                      isActive && styles.tipoChipActive,
                    ]}
                    onPress={() => setTipo(t)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.tipoChipText,
                        isActive && styles.tipoChipTextActive,
                      ]}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Botones de Acción */}
        <View style={styles.formActions}>
          {editingId && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={resetForm}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.saveBtn,
              isSubmitting && { opacity: 0.7 },
              editingId && { backgroundColor: '#4f46e5' },
            ]}
            onPress={handleSave}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons
                  name={editingId ? 'checkmark-circle' : 'save'}
                  size={18}
                  color="#ffffff"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.saveBtnText}>
                  {editingId ? 'Actualizar Adicional' : 'Guardar Adicional'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header Superior */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Adicionales y Descuentos</Text>
          <Text style={styles.headerSubtitle}>
            {comentarios.length} ítems registrados en el sistema
          </Text>
        </View>

        {!isDesktop && (canCreate || canEdit) && (
          <TouchableOpacity
            style={styles.headerAddBtn}
            onPress={handleOpenCreate}
            activeOpacity={0.8}
          >
            <Ionicons
              name="add-circle"
              size={18}
              color="#ffffff"
              style={{ marginRight: 4 }}
            />
            <Text style={styles.headerAddBtnText}>Nuevo</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Contenido Principal Responsivo */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.mainLayout, isDesktop && styles.mainLayoutDesktop]}>
          {/* COLUMNA IZQUIERDA: Formulario Fijo en Desktop */}
          {isDesktop && (canCreate || canEdit) && (
            <View style={styles.desktopSidebar}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {renderFormContent(false)}
              </ScrollView>
            </View>
          )}

          {/* COLUMNA DERECHA: Buscador, Filtros y Lista Completa */}
          <View style={styles.listColumn}>
            {/* Buscador de Adicionales */}
            <View style={styles.searchBoxWrapper}>
              <View style={styles.searchBox}>
                <Ionicons
                  name="search"
                  size={18}
                  color="#64748b"
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar por nombre o tipo..."
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="close-circle" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Barra de Filtros por Tipo (Tabs horizontales) */}
            <View style={styles.filterTabsWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
              >
                <TouchableOpacity
                  style={[
                    styles.filterTab,
                    selectedTipoFilter === 'TODOS' && styles.filterTabActive,
                  ]}
                  onPress={() => setSelectedTipoFilter('TODOS')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      selectedTipoFilter === 'TODOS' && styles.filterTabTextActive,
                    ]}
                  >
                    Todos ({tipoCounts['TODOS'] || 0})
                  </Text>
                </TouchableOpacity>

                {Object.keys(tipoCounts)
                  .filter((k) => k !== 'TODOS')
                  .map((t) => {
                    const isSelected = selectedTipoFilter.toLowerCase() === t.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={t}
                        style={[
                          styles.filterTab,
                          isSelected && styles.filterTabActive,
                        ]}
                        onPress={() => setSelectedTipoFilter(t)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.filterTabText,
                            isSelected && styles.filterTabTextActive,
                          ]}
                        >
                          {t} ({tipoCounts[t]})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            </View>

            {/* Lista Principal de Adicionales */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#10b981" />
                <Text style={styles.loadingText}>Cargando adicionales...</Text>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <FlashList
                  data={filteredComentarios}
                  keyExtractor={(item: Comentario) => item.ID}
                  renderItem={renderItem}
                  estimatedItemSize={88}
                  contentContainerStyle={[
                    styles.listContent,
                    { paddingBottom: Math.max(insets.bottom + 90, 90) },
                  ]}
                  showsVerticalScrollIndicator={true}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Ionicons
                        name="file-tray-outline"
                        size={48}
                        color="#cbd5e1"
                        style={{ marginBottom: 12 }}
                      />
                      <Text style={styles.emptyTitle}>
                        {searchQuery
                          ? 'No se encontraron resultados'
                          : 'No hay adicionales registrados'}
                      </Text>
                      <Text style={styles.emptySubtitle}>
                        {searchQuery
                          ? `No hay coincidencias para "${searchQuery}". Intenta con otro término.`
                          : 'Crea tu primer adicional, sabor o descuento para tus platos y domicilios.'}
                      </Text>

                      {!searchQuery && !isDesktop && (canCreate || canEdit) && (
                        <TouchableOpacity
                          style={styles.emptyActionBtn}
                          onPress={handleOpenCreate}
                        >
                          <Ionicons
                            name="add-circle"
                            size={18}
                            color="#ffffff"
                            style={{ marginRight: 6 }}
                          />
                          <Text style={styles.emptyActionBtnText}>
                            Crear Nuevo Adicional
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  }
                />
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Modal para Crear / Editar en Móvil */}
      {!isDesktop && (
        <Modal
          visible={modalFormVisible}
          transparent
          animationType="fade"
          onRequestClose={resetForm}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable style={styles.modalBackdrop} onPress={resetForm} />
            <View
              style={[
                styles.modalCard,
                { paddingBottom: Math.max(insets.bottom + 16, 24) },
              ]}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {renderFormContent(true)}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: {
    marginRight: 12,
    padding: 4,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  headerAddBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  // Layout Responsivo
  mainLayout: {
    flex: 1,
    flexDirection: 'column',
  },
  mainLayoutDesktop: {
    flexDirection: 'row',
    maxWidth: 1400,
    width: '100%',
    alignSelf: 'center',
  },
  desktopSidebar: {
    width: 380,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 16,
  },
  listColumn: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },

  // Buscador y Filtros
  searchBoxWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    padding: 0,
  },
  filterTabsWrapper: {
    backgroundColor: '#ffffff',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterTabActive: {
    backgroundColor: '#10b981',
    borderColor: '#059669',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterTabTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },

  // Formulario
  formContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  formContainerModal: {
    padding: 16,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  formIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  formSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 5,
  },
  miniLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  row: {
    flexDirection: 'row',
  },
  chipsScroll: {
    flexDirection: 'row',
  },
  tipoChip: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  tipoChipActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4338ca',
  },
  tipoChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4f46e5',
  },
  tipoChipTextActive: {
    color: '#ffffff',
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#10b981',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },

  // Tarjetas de Lista
  listContent: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardContent: {
    flex: 1,
    paddingRight: 10,
  },
  cardHeaderRow: {
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    lineHeight: 20,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  tipoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef2ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  tipoBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3730a3',
  },
  badgePrecioPositivo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  badgePrecioPositivoText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  badgePrecioDescuento: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  badgePrecioDescuentoText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b91c1c',
  },
  badgePrecioGratis: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  badgePrecioGratisText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtnEdit: {
    padding: 7,
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  actionBtnDelete: {
    padding: 7,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },

  // Estados Vacíos y Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 10,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    maxWidth: 320,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    marginTop: 16,
  },
  emptyActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  // Modal Móvil
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
});

export default ComentariosScreen;
