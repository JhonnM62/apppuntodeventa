import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, RefreshControl, Image, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
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
  }, [fetchCategorias]);

  const filteredData = useMemo(() => {
    if (!search) return categorias;
    const lower = search.toLowerCase();
    return categorias.filter(c => c.nombre.toLowerCase().includes(lower));
  }, [categorias, search]);

  const renderItem = useCallback(({ item }: { item: CategoriaInsumoItem }) => {
    return (
      <TouchableOpacity 
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => canEdit ? navigation.navigate('CategoriasInsumosForm', { id: item.IDcategoriainsumos }) : null}
      >
        <View style={styles.cardContent}>
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
  }, [canEdit, navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Categorías de Insumos</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Input
          placeholder="Buscar categoría..."
          value={search}
          onChangeText={setSearch}
          leftIcon={<Ionicons name="search" size={20} color="#9CA3AF" />}
          containerStyle={styles.searchInput}
        />
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