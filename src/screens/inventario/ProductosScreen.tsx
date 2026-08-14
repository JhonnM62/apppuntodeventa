import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, TouchableOpacity, Text as RNText, StyleSheet, ScrollView, TextInput, RefreshControl, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { FlashList as OriginalFlashList } from '@shopify/flash-list';
const FlashList = OriginalFlashList as any;
import { Text } from '../../components/ui/text';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { getProducts, deleteProduct } from '../../services/products';
import { formatCurrency } from '../../utils/formatters';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { useSocketEvent } from '../../hooks/useSocketEvent';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import { usePermissions } from '../../hooks/usePermissions';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Productos'>;
};

const ProductosScreen = ({ navigation }: Props) => {
  const { canCreate } = usePermissions('productos');

  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedCategoria, setSelectedCategoria] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);

  const handleScroll = useScrollDirection();

  const fetchProductos = useCallback(async () => {
    try {
      const res = await getProducts({ limit: 1000 });
      setProductos(res?.data || []);
    } catch (error) {
      console.error('Error fetching productos:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  useSocketEvent('REFRESH_PRODUCTOS', () => {
    fetchProductos();
  });

  const onRefresh = () => {
    setRefreshing(true);
    fetchProductos();
    setSelectedItems([]);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBatchDelete = () => {
    Alert.alert(
      "Eliminar productos",
      `¿Estás seguro de eliminar ${selectedItems.length} producto(s) seleccionado(s)?`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Eliminar", 
          style: "destructive",
          onPress: async () => {
            setIsDeletingBatch(true);
            try {
              await Promise.all(selectedItems.map(id => deleteProduct(id)));
              setSelectedItems([]);
              fetchProductos();
            } catch (error) {
              console.error("Error deleting products in batch:", error);
              Alert.alert("Error", "No se pudieron eliminar todos los productos seleccionados.");
            } finally {
              setIsDeletingBatch(false);
            }
          }
        }
      ]
    );
  };

  const categorias = useMemo(() => {
    const cats = new Set<string>();
    productos.forEach(p => {
      const cat = p.categoriaNombre || p.Categoria_Nombre;
      if (cat) cats.add(cat);
    });
    return Array.from(cats).sort();
  }, [productos]);

  const filteredProductos = useMemo(() => {
    let result = productos;

    if (searchText) {
      const search = searchText.toLowerCase();
      result = result.filter(p =>
        (p.nombre || '').toLowerCase().includes(search) ||
        (p.categoriaNombre || '').toLowerCase().includes(search)
      );
    }

    if (selectedCategoria) {
      result = result.filter(p => p.categoriaNombre === selectedCategoria || p.Categoria_Nombre === selectedCategoria);
    }

    return result;
  }, [productos, searchText, selectedCategoria]);

  const renderItem = ({ item }: { item: any }) => {
    const isSelected = selectedItems.includes(item.IDproductos);
    return (
    <TouchableOpacity 
      activeOpacity={0.7}
      onPress={() => {
        if (selectedItems.length > 0) {
          handleToggleSelect(item.IDproductos);
        } else {
          navigation.navigate('ProductoDetail', { id: item.IDproductos });
        }
      }}
      onLongPress={() => handleToggleSelect(item.IDproductos)}
    >
      <Card style={[styles.card, isSelected && { borderColor: '#3b82f6', borderWidth: 2 }]}>
        <View style={styles.cardHeader}>
          {selectedItems.length > 0 && (
            <TouchableOpacity onPress={() => handleToggleSelect(item.IDproductos)} style={{ marginRight: 12 }}>
              <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={24} color={isSelected ? "#3b82f6" : "#d1d5db"} />
            </TouchableOpacity>
          )}
          {item.imagenUrl ? (
            <Image source={{ uri: item.imagenUrl }} style={styles.productImage} />
          ) : (
            <View style={styles.placeholderImage}>
              <Ionicons name="fast-food-outline" size={24} color="#9ca3af" />
            </View>
          )}
          <View style={styles.cardInfo}>
            <RNText style={styles.productName}>{item.nombre}</RNText>
            <RNText style={styles.productCategory}>{item.categoriaNombre || 'Sin Categoría'}</RNText>
            
            <View style={styles.statsRow}>
              <View style={styles.statBadge}>
                <Ionicons name="pricetag-outline" size={14} color="#059669" />
                <RNText style={styles.statText}>{formatCurrency(item.precioUnitario || 0)}</RNText>
              </View>
              <View style={[styles.statBadge, { backgroundColor: item.mostrar === 'si' ? '#dcfce7' : '#fee2e2' }]}>
                <Ionicons name={item.mostrar === 'si' ? "eye-outline" : "eye-off-outline"} size={14} color={item.mostrar === 'si' ? "#059669" : "#ef4444"} />
                <RNText style={[styles.statText, { color: item.mostrar === 'si' ? '#059669' : '#ef4444' }]}>
                  {item.mostrar === 'si' ? 'Visible' : 'Oculto'}
                </RNText>
              </View>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </View>
      </Card>
    </TouchableOpacity>
  );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="transparent" translucent />
      <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => {
            if (selectedItems.length > 0) {
              setSelectedItems([]);
            } else {
              navigation.goBack();
            }
          }} style={styles.backButton}>
            <Ionicons name={selectedItems.length > 0 ? "close" : "arrow-back"} size={24} color="#111827" />
          </TouchableOpacity>
          <RNText style={styles.title}>
            {selectedItems.length > 0 ? `${selectedItems.length} seleccionados` : 'Productos'}
          </RNText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {selectedItems.length > 0 && canCreate ? (
            <TouchableOpacity onPress={handleBatchDelete} style={[styles.addButton, { backgroundColor: '#ef4444', marginRight: 8 }]} disabled={isDeletingBatch}>
              {isDeletingBatch ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="trash" size={20} color="#fff" />}
            </TouchableOpacity>
          ) : null}
          {canCreate && selectedItems.length === 0 ? (
            <TouchableOpacity onPress={() => navigation.navigate('ProductoDetail', { id: 'new' })} style={styles.addButton}>
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 0 }} />
          )}
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar producto..."
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor="#9ca3af"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')}>
            <Ionicons name="close-circle" size={20} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterChip, !selectedCategoria && styles.filterChipActive]}
            onPress={() => setSelectedCategoria(null)}
          >
            <RNText style={[styles.filterChipText, !selectedCategoria && styles.filterChipTextActive]}>
              Todos
            </RNText>
          </TouchableOpacity>
          {categorias.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.filterChip, selectedCategoria === cat && styles.filterChipActive]}
              onPress={() => setSelectedCategoria(cat)}
            >
              <RNText style={[styles.filterChipText, selectedCategoria === cat && styles.filterChipTextActive]}>
                {cat}
              </RNText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.listContainer}>
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
          </View>
        ) : filteredProductos.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="fast-food-outline" size={48} color="#d1d5db" />
            <RNText style={styles.emptyText}>No se encontraron productos</RNText>
          </View>
        ) : (
          <FlashList
            // @ts-ignore
            data={filteredProductos}
            renderItem={renderItem}
            estimatedItemSize={100}
            onScroll={handleScroll}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
            }
          />
        )}
      </View>
    </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backButton: { padding: 8, marginLeft: -8 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  addButton: { backgroundColor: '#4CAF50', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 16, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', height: 48 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: '#111827' },
  filterScroll: { paddingHorizontal: 16, paddingBottom: 12 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  filterChipActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  filterChipText: { fontSize: 14, color: '#4b5563', fontWeight: '500' },
  filterChipTextActive: { color: '#fff', fontWeight: 'bold' },
  listContainer: { flex: 1 },
  listContent: { padding: 16, paddingTop: 4 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { marginTop: 12, fontSize: 16, color: '#6b7280', fontWeight: '500' },
  card: { marginBottom: 12, padding: 12, borderRadius: 16, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  productImage: { width: 60, height: 60, borderRadius: 12, backgroundColor: '#f3f4f6' },
  placeholderImage: { width: 60, height: 60, borderRadius: 12, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1, marginLeft: 12 },
  productName: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 2 },
  productCategory: { fontSize: 13, color: '#6b7280', marginBottom: 6 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ecfdf5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, gap: 4 },
  statText: { fontSize: 12, fontWeight: '700', color: '#059669' },
});

export default ProductosScreen;