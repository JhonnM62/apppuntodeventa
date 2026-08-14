import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, RefreshControl, Image, Platform, KeyboardAvoidingView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FlashList as OriginalFlashList } from '@shopify/flash-list';
const FlashList = OriginalFlashList as any;
import Toast from 'react-native-toast-message';
import { Text } from '../../components/ui/text';
import { Input } from '../../components/ui/input';
import { categoriasInsumosService, CategoriaInsumoItem } from '../../services/categoriasInsumos';
import { usePermissions } from '../../hooks/usePermissions';

export default function CategoriasInsumosScreen({ navigation }: any) {
  const [categorias, setCategorias] = useState<CategoriaInsumoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const { canCreate, canEdit, canDelete } = usePermissions('inventario'); // Assuming inventory permissions
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);

  const fetchCategorias = useCallback(async () => {
    try {
      const data = await categoriasInsumosService.getAll();
      setCategorias(data);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudieron cargar las categorías' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchCategorias();
    });
    return unsubscribe;
  }, [navigation, fetchCategorias]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCategorias();
    setSelectedItems([]);
  }, [fetchCategorias]);

  const handleToggleSelect = (id: string) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBatchDelete = () => {
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
              await Promise.all(selectedItems.map(id => categoriasInsumosService.remove(id)));
              setSelectedItems([]);
              fetchCategorias();
              Toast.show({ type: 'success', text1: 'Éxito', text2: 'Categorías eliminadas.' });
            } catch (error) {
              console.error("Error deleting categories:", error);
              Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudieron eliminar todas las categorías.' });
            } finally {
              setIsDeletingBatch(false);
            }
          }
        }
      ]
    );
  };

  const filteredData = useMemo(() => {
    if (!search) return categorias;
    const lower = search.toLowerCase();
    return categorias.filter(c => c.nombre.toLowerCase().includes(lower));
  }, [categorias, search]);

  const renderItem = useCallback(({ item }: { item: CategoriaInsumoItem }) => {
    const isSelected = selectedItems.includes(item.IDcategoriainsumos);
    return (
      <TouchableOpacity 
        style={[styles.card, isSelected && { borderColor: '#3b82f6', borderWidth: 2 }]}
        activeOpacity={0.7}
        onPress={() => {
          if (selectedItems.length > 0) {
            handleToggleSelect(item.IDcategoriainsumos);
          } else if (canEdit) {
            navigation.navigate('CategoriasInsumosForm', { id: item.IDcategoriainsumos });
          }
        }}
        onLongPress={() => handleToggleSelect(item.IDcategoriainsumos)}
      >
        <View style={styles.cardContent}>
          {selectedItems.length > 0 && (
            <TouchableOpacity onPress={() => handleToggleSelect(item.IDcategoriainsumos)} style={{ marginRight: 12 }}>
              <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={24} color={isSelected ? "#3b82f6" : "#d1d5db"} />
            </TouchableOpacity>
          )}
          {item.imagen ? (
            <Image source={{ uri: item.imagen }} style={styles.image} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="folder-outline" size={24} color="#9CA3AF" />
            </View>
          )}
          <View style={styles.textContainer}>
            <Text style={styles.title}>{item.nombre}</Text>
          </View>
          {canEdit && (
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" style={styles.chevron} />
          )}
        </View>
      </TouchableOpacity>
    );
  }, [canEdit, navigation, selectedItems]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={styles.backBtn} onPress={() => {
            if (selectedItems.length > 0) {
              setSelectedItems([]);
            } else {
              navigation.goBack();
            }
          }} accessibilityLabel="Volver">
            <Ionicons name={selectedItems.length > 0 ? "close" : "arrow-back"} size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { marginLeft: 12 }]}>
            {selectedItems.length > 0 ? `${selectedItems.length} seleccionadas` : 'Categorías de Insumos'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {selectedItems.length > 0 && canDelete && (
            <TouchableOpacity 
              style={[styles.backBtn, { backgroundColor: '#ef4444' }]} 
              onPress={handleBatchDelete}
              disabled={isDeletingBatch}
            >
              {isDeletingBatch ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="trash" size={20} color="#fff" />}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInput}>
          <Input
            placeholder="Buscar categoría..."
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {/* List */}
      <View style={styles.listContainer}>
        <FlashList
          data={filteredData}
          renderItem={renderItem}
          keyExtractor={(item) => item.IDcategoriainsumos}
          estimatedItemSize={80}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#10B981']} />}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyText}>No hay categorías disponibles</Text>
              </View>
            ) : null
          }
        />
      </View>

      {/* FAB */}
      {canCreate && (
        <TouchableOpacity 
          style={styles.fab} 
          activeOpacity={0.8}
          onPress={() => navigation.navigate('CategoriasInsumosForm')}
          accessibilityLabel="Crear Categoría"
        >
          <Ionicons name="add" size={32} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6', // slate-100
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchInput: {
    marginBottom: 0,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    minHeight: 80, // touch target size
  },
  image: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  imagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    marginLeft: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  chevron: {
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 16,
    fontWeight: '500',
  },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10B981', // emerald-500
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});