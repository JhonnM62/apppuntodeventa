import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Text as RNText, Alert, Image, ActivityIndicator, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { getProductById, createProduct, updateProduct, deleteProduct } from '../../services/products';
import { insumosService } from '../../services/insumos';
import categoriasService from '../../services/categorias';
import Toast from 'react-native-toast-message';
import { formatCurrency } from '../../utils/formatters';
import { usePermissions } from '../../hooks/usePermissions';
import { useScrollDirection } from '../../hooks/useScrollDirection';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ProductoDetail'>;
  route: RouteProp<RootStackParamList, 'ProductoDetail'>;
};

const ProductoDetailScreen = ({ navigation, route }: Props) => {
  const { id } = route.params;
  const isNew = id === 'new';
  const { canEdit, canDelete } = usePermissions('productos');
  const handleScroll = useScrollDirection();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [insumosList, setInsumosList] = useState<any[]>([]);
  const [categoriasList, setCategoriasList] = useState<any[]>([]);
  
  const [formData, setFormData] = useState<any>({
    nombre: '',
    categoria: '',
    categoriaNombre: '',
    mostrar: 'si',
    cantidad: 0,
    precioUnitario: 0,
    imagenUrl: '',
    precioDeCompra: 0,
    unidades: 'Und',
    descontar: 'no',
    llevarControlEnCaja: 'no',
    orden: 0,
    recetaInsumos: []
  });

  const [showInsumoSelector, setShowInsumoSelector] = useState(false);
  const [selectedInsumoId, setSelectedInsumoId] = useState('');
  const [newInsumoCantidad, setNewInsumoCantidad] = useState('1');

  const [searchInsumoText, setSearchInsumoText] = useState('');
  const [selectedInsumoCategory, setSelectedInsumoCategory] = useState<string | null>(null);

  const getInsumoCategoryName = useCallback((i: any) => {
    // 1. Priorizar campos de nombre conocidos
    const name = i.categoriaNombre || i.nombreCategoria || i.NombreCategoria || i.Categoria_Nombre;
    
    // Función para detectar si un string parece un ID (UUID, CUID, MongoDB ID, etc)
    const isId = (val: string) => {
      if (!val) return false;
      return (
        val.match(/^[0-9a-fA-F-]{12,}$/) || // Detecta UUIDs y IDs Hex largos
        val.match(/^c[a-z0-9]{20,}$/) ||    // Detecta CUIDs (Prisma)
        val.length >= 20 // Regla general: si tiene más de 20 caracteres y no tiene espacios, probablemente sea un ID
      ) && !val.includes(' ');
    };

    if (name && name.length > 0 && !isId(name)) return name;

    // 2. Si no hay nombre válido, usar el campo 'categoria' SOLO si no es un ID
    const cat = i.categoria || i.Categoria;
    if (cat && cat.length > 0 && !isId(cat)) return cat;

    return 'Sin Categoría';
  }, []);

  const insumosCategories = useMemo(() => {
    const cats = new Set<string>();
    
    insumosList.forEach(i => {
      const catName = getInsumoCategoryName(i);
      if (catName !== 'Sin Categoría') {
        cats.add(catName);
      }
    });

    return Array.from(cats).sort();
  }, [insumosList, getInsumoCategoryName]);

  const filteredInsumos = useMemo(() => {
    let result = insumosList;
    
    if (searchInsumoText) {
      const search = searchInsumoText.toLowerCase();
      result = result.filter(i => (i.Nombre || i.nombre || '').toLowerCase().includes(search));
    }

    if (selectedInsumoCategory) {
      result = result.filter(i => getInsumoCategoryName(i) === selectedInsumoCategory);
    }

    return result;
  }, [insumosList, searchInsumoText, selectedInsumoCategory, getInsumoCategoryName]);

  const fetchData = useCallback(async () => {
    try {
      const [insumosRes, categoriasRes] = await Promise.all([
        insumosService.getAll({ limit: 1000 }),
        categoriasService.getAll()
      ]);
      setInsumosList(insumosRes || []);
      setCategoriasList((categoriasRes as any)?.data || categoriasRes || []);

      if (!isNew) {
        const product = await getProductById(id);
        if (product) {
          setFormData({
            ...product,
            recetaInsumos: product.recetaInsumos || []
          });
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudieron cargar los datos' });
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleChange = (key: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!formData.nombre) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'El nombre es obligatorio' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nombre: formData.nombre,
        categoria: formData.categoria,
        categoriaNombre: formData.categoriaNombre,
        mostrar: formData.mostrar || 'si',
        cantidad: Number(formData.cantidad) || 0,
        precioUnitario: Number(formData.precioUnitario) || 0,
        precioDeCompra: Number(formData.precioDeCompra) || 0,
        image: formData.image,
        imagenUrl: formData.imagenUrl,
        unidades: formData.unidades,
        descontar: formData.descontar || 'no',
        llevarControlEnCaja: formData.llevarControlEnCaja || 'no',
        orden: Number(formData.orden) || 0,
        recetaInsumos: formData.recetaInsumos.map((ri: any) => ({
          insumo: ri.insumo || ri.insumoRelacion?.IDalimentos,
          tipoDeMedida: ri.tipoDeMedida || ri.insumoRelacion?.Unidades || 'Und',
          cantidad: Number(ri.cantidad) || 0
        }))
      };

      if (isNew) {
        await createProduct(payload);
        Toast.show({ type: 'success', text1: 'Éxito', text2: 'Producto creado' });
      } else {
        await updateProduct(id, payload);
        Toast.show({ type: 'success', text1: 'Éxito', text2: 'Producto actualizado' });
      }
      navigation.goBack();
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Error al guardar';
      Toast.show({ type: 'error', text1: 'Error', text2: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Eliminar Producto',
      '¿Estás seguro de eliminar este producto? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Eliminar', 
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProduct(id);
              Toast.show({ type: 'success', text1: 'Éxito', text2: 'Producto eliminado' });
              navigation.goBack();
            } catch (error: any) {
              const msg = error?.response?.data?.message || 'Error al eliminar';
              Toast.show({ type: 'error', text1: 'Error', text2: msg });
            }
          }
        }
      ]
    );
  };

  const addInsumoToReceta = () => {
    if (!selectedInsumoId) return;
    const qty = Number(newInsumoCantidad);
    if (qty <= 0) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'La cantidad debe ser mayor a 0' });
      return;
    }

    const insumoObj = insumosList.find(i => i.IDalimentos === selectedInsumoId);
    if (!insumoObj) return;

    // Verificar si ya existe
    const exists = formData.recetaInsumos.find((ri: any) => 
      (ri.insumo === selectedInsumoId) || (ri.insumoRelacion?.IDalimentos === selectedInsumoId)
    );

    if (exists) {
      Toast.show({ type: 'info', text1: 'Info', text2: 'El insumo ya está en la receta' });
      return;
    }

    const newRecetaInsumo = {
      insumo: selectedInsumoId,
      insumoRelacion: insumoObj,
      tipoDeMedida: insumoObj.Unidades || insumoObj.unidades || 'Und',
      cantidad: qty
    };

    setFormData((prev: any) => ({
      ...prev,
      recetaInsumos: [...prev.recetaInsumos, newRecetaInsumo]
    }));

    setSelectedInsumoId('');
    setNewInsumoCantidad('1');
    setShowInsumoSelector(false);
  };

  const removeInsumoFromReceta = (index: number) => {
    setFormData((prev: any) => {
      const newRecetas = [...prev.recetaInsumos];
      newRecetas.splice(index, 1);
      return { ...prev, recetaInsumos: newRecetas };
    });
  };

  const costoTotalReceta = useMemo(() => {
    return formData.recetaInsumos.reduce((total: number, ri: any) => {
      const insumoData = ri.insumoRelacion || insumosList.find(i => i.IDalimentos === ri.insumo);
      const precioUnidad = Number(insumoData?.Precio || insumoData?.precio || 0);
      return total + (precioUnidad * Number(ri.cantidad));
    }, 0);
  }, [formData.recetaInsumos, insumosList]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <RNText style={styles.title}>{isNew ? 'Nuevo Producto' : 'Editar Producto'}</RNText>
        {!isNew && canDelete ? (
          <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <KeyboardAwareScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={{ paddingBottom: 20 }}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={120}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.content}>
          <Card style={styles.card}>
            <RNText style={styles.sectionTitle}>Información General</RNText>
            
            <View style={styles.inputGroup}>
              <RNText style={styles.label}>Nombre *</RNText>
              <Input
                value={formData.nombre}
                onChangeText={(t) => handleChange('nombre', t)}
                placeholder="Ej. Hamburguesa Sencilla"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <RNText style={styles.label}>Precio de Venta</RNText>
                <Input
                  value={String(formData.precioUnitario)}
                  onChangeText={(t) => handleChange('precioUnitario', t.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <RNText style={styles.label}>Costo (Referencia)</RNText>
                <Input
                  value={String(formData.precioDeCompra)}
                  onChangeText={(t) => handleChange('precioDeCompra', t.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <RNText style={styles.label}>Categoría</RNText>
                <View style={styles.pickerContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {categoriasList.map((cat: any) => (
                      <TouchableOpacity
                        key={cat.IDcategoria}
                        style={[styles.pickerChip, formData.categoria === cat.IDcategoria && styles.pickerChipActive]}
                        onPress={() => {
                          handleChange('categoria', cat.IDcategoria);
                          handleChange('categoriaNombre', cat.nombre);
                        }}
                      >
                        <RNText style={[styles.pickerChipText, formData.categoria === cat.IDcategoria && styles.pickerChipTextActive]}>
                          {cat.nombre}
                        </RNText>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <RNText style={styles.label}>URL de Imagen</RNText>
              <Input
                value={formData.imagenUrl}
                onChangeText={(t) => handleChange('imagenUrl', t)}
                placeholder="https://ejemplo.com/imagen.jpg"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <RNText style={styles.label}>¿Visible en menú?</RNText>
                <TouchableOpacity
                  style={[styles.toggleBtn, formData.mostrar === 'si' ? styles.toggleActive : styles.toggleInactive]}
                  onPress={() => handleChange('mostrar', formData.mostrar === 'si' ? 'no' : 'si')}
                >
                  <RNText style={[styles.toggleText, formData.mostrar === 'si' ? styles.toggleTextActive : styles.toggleTextInactive]}>
                    {formData.mostrar === 'si' ? 'SÍ' : 'NO'}
                  </RNText>
                </TouchableOpacity>
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <RNText style={styles.label}>¿Descontar Inventario?</RNText>
                <TouchableOpacity
                  style={[styles.toggleBtn, formData.descontar === 'si' ? styles.toggleActive : styles.toggleInactive]}
                  onPress={() => handleChange('descontar', formData.descontar === 'si' ? 'no' : 'si')}
                >
                  <RNText style={[styles.toggleText, formData.descontar === 'si' ? styles.toggleTextActive : styles.toggleTextInactive]}>
                    {formData.descontar === 'si' ? 'SÍ' : 'NO'}
                  </RNText>
                </TouchableOpacity>
              </View>
            </View>
          </Card>

          <Card style={styles.card}>
            <View style={styles.recetaHeader}>
              <RNText style={styles.sectionTitle}>Receta / Insumos</RNText>
              <RNText style={styles.costoReceta}>Costo: {formatCurrency(costoTotalReceta)}</RNText>
            </View>
            <RNText style={styles.helperText}>Agrega los insumos que componen este producto para descontarlos automáticamente del inventario al vender.</RNText>

            {formData.recetaInsumos.map((ri: any, index: number) => {
              const insumoData = ri.insumoRelacion || insumosList.find(i => i.IDalimentos === ri.insumo);
              const nombre = insumoData?.Nombre || insumoData?.nombre || 'Insumo desconocido';
              const stockDisponible = insumoData?.Disponible || insumoData?.disponible || 0;
              const unidad = ri.tipoDeMedida || 'Und';
              const precioUnidad = Number(insumoData?.Precio || insumoData?.precio || 0);

              return (
                <View key={index} style={styles.recetaItem}>
                  <View style={styles.recetaItemInfo}>
                    <RNText style={styles.recetaItemName}>{nombre}</RNText>
                    <View style={styles.recetaItemSub}>
                      <RNText style={styles.recetaItemStock}>Stock: {stockDisponible} {unidad}</RNText>
                      <RNText style={styles.recetaItemPrice}>{formatCurrency(precioUnidad * ri.cantidad)}</RNText>
                    </View>
                  </View>
                  <View style={styles.recetaItemControls}>
                    <TextInput
                      style={[styles.recetaQtyInput, { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' }]}
                      value={String(ri.cantidad)}
                      onChangeText={(t) => {
                        const val = t.replace(/[^0-9]/g, '');
                        const newRecetas = [...formData.recetaInsumos];
                        newRecetas[index].cantidad = val;
                        setFormData((prev: any) => ({ ...prev, recetaInsumos: newRecetas }));
                      }}
                      keyboardType="numeric"
                    />
                    <RNText style={styles.recetaItemUnit}>{unidad}</RNText>
                    <TouchableOpacity onPress={() => removeInsumoFromReceta(index)} style={styles.removeInsumoBtn}>
                      <Ionicons name="close-circle" size={24} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {!showInsumoSelector ? (
              canEdit && (
                <TouchableOpacity style={styles.addInsumoBtn} onPress={() => setShowInsumoSelector(true)}>
                  <Ionicons name="add" size={20} color="#4CAF50" />
                  <RNText style={styles.addInsumoText}>Agregar Insumo</RNText>
                </TouchableOpacity>
              )
            ) : (
              <View style={styles.selectorContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <RNText style={[styles.label, { marginBottom: 0 }]}>Seleccionar Insumo:</RNText>
                  <TouchableOpacity onPress={() => { setShowInsumoSelector(false); setSelectedInsumoId(''); setSearchInsumoText(''); setSelectedInsumoCategory(null); }}>
                    <Ionicons name="close" size={24} color="#9ca3af" />
                  </TouchableOpacity>
                </View>

                <View style={styles.insumoSearchContainer}>
                  <Ionicons name="search" size={18} color="#9ca3af" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.insumoSearchInput}
                    placeholder="Buscar insumo por nombre..."
                    value={searchInsumoText}
                    onChangeText={setSearchInsumoText}
                  />
                  {searchInsumoText.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchInsumoText('')}>
                      <Ionicons name="close-circle" size={18} color="#9ca3af" />
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} keyboardShouldPersistTaps="handled">
                  <TouchableOpacity
                    style={[styles.pickerChip, !selectedInsumoCategory && styles.pickerChipActive]}
                    onPress={() => setSelectedInsumoCategory(null)}
                  >
                    <RNText style={[styles.pickerChipText, !selectedInsumoCategory && styles.pickerChipTextActive]}>Todas</RNText>
                  </TouchableOpacity>
                  {insumosCategories.map((cat: string) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.pickerChip, selectedInsumoCategory === cat && styles.pickerChipActive]}
                      onPress={() => setSelectedInsumoCategory(cat)}
                    >
                      <RNText style={[styles.pickerChipText, selectedInsumoCategory === cat && styles.pickerChipTextActive]}>{cat}</RNText>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <ScrollView style={{ maxHeight: 180, marginBottom: 12 }} keyboardShouldPersistTaps="handled">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {filteredInsumos.map((ins: any) => (
                      <TouchableOpacity
                        key={ins.IDalimentos}
                        style={[styles.insumoOptionChip, selectedInsumoId === ins.IDalimentos && styles.insumoOptionChipActive]}
                        onPress={() => setSelectedInsumoId(ins.IDalimentos)}
                      >
                        <RNText style={[styles.insumoOptionText, selectedInsumoId === ins.IDalimentos && styles.insumoOptionTextActive]}>
                          {ins.Nombre || ins.nombre}
                        </RNText>
                      </TouchableOpacity>
                    ))}
                    {filteredInsumos.length === 0 && (
                      <RNText style={{ color: '#6b7280', fontStyle: 'italic', padding: 8 }}>No se encontraron insumos</RNText>
                    )}
                  </View>
                </ScrollView>

                {selectedInsumoId && (
                  <View style={styles.row}>
                    <View style={[styles.inputGroup, { flex: 1, marginRight: 8, marginBottom: 0 }]}>
                      <RNText style={styles.label}>Cantidad a usar</RNText>
                      <TextInput
                        style={[styles.recetaQtyInput, { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', width: '100%' }]}
                        value={newInsumoCantidad}
                        onChangeText={(t) => setNewInsumoCantidad(t.replace(/[^0-9]/g, ''))}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 8, justifyContent: 'flex-end' }}>
                      <Button onPress={addInsumoToReceta}>
                        <RNText style={{ color: 'white', fontWeight: 'bold' }}>Confirmar</RNText>
                      </Button>
                    </View>
                  </View>
                )}
              </View>
            )}

          </Card>
        </View>
      </KeyboardAwareScrollView>

      <View style={styles.footer}>
        {canEdit && (
          <Button 
            onPress={handleSave} 
            loading={saving}
            style={styles.saveBtn}
          >
            <RNText style={{ color: 'white', fontWeight: 'bold' }}>{isNew ? "Crear Producto" : "Guardar Cambios"}</RNText>
          </Button>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backButton: { padding: 8, marginLeft: -8 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#111827', flex: 1, marginLeft: 8 },
  deleteButton: { padding: 8 },
  content: { flex: 1, padding: 16 },
  card: { padding: 16, marginBottom: 16, borderRadius: 16, backgroundColor: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#4b5563', marginBottom: 8 },
  row: { flexDirection: 'row' },
  pickerContainer: { flexDirection: 'row', alignItems: 'center' },
  pickerChip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f3f4f6', borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  pickerChipActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  pickerChipText: { fontSize: 13, color: '#4b5563', fontWeight: '500' },
  pickerChipTextActive: { color: '#fff', fontWeight: 'bold' },
  toggleBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  toggleActive: { backgroundColor: '#ecfdf5', borderColor: '#34d399' },
  toggleInactive: { backgroundColor: '#fef2f2', borderColor: '#f87171' },
  toggleText: { fontWeight: 'bold', fontSize: 14 },
  toggleTextActive: { color: '#059669' },
  toggleTextInactive: { color: '#dc2626' },
  recetaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  costoReceta: { fontSize: 14, fontWeight: 'bold', color: '#059669' },
  helperText: { fontSize: 13, color: '#6b7280', marginBottom: 16, lineHeight: 18 },
  recetaItem: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f9fafb', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#f3f4f6' },
  recetaItemInfo: { flex: 1 },
  recetaItemName: { fontSize: 14, fontWeight: '600', color: '#1f2937', marginBottom: 4 },
  recetaItemSub: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recetaItemStock: { fontSize: 12, color: '#6b7280' },
  recetaItemPrice: { fontSize: 12, fontWeight: '600', color: '#059669' },
  recetaItemControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recetaQtyInput: { width: 50, textAlign: 'center', paddingVertical: 6 },
  recetaItemUnit: { fontSize: 12, color: '#6b7280', width: 45 },
  removeInsumoBtn: { padding: 4 },
  addInsumoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: '#4CAF50', borderRadius: 12, marginTop: 8 },
  addInsumoText: { color: '#4CAF50', fontWeight: '600', marginLeft: 8 },
  selectorContainer: { marginTop: 8, padding: 12, backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  insumoSearchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', height: 40, marginBottom: 12 },
  insumoSearchInput: { flex: 1, fontSize: 14, color: '#111827' },
  insumoOptionChip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  insumoOptionChipActive: { backgroundColor: '#ecfdf5', borderColor: '#34d399' },
  insumoOptionText: { fontSize: 13, color: '#4b5563', fontWeight: '500' },
  insumoOptionTextActive: { color: '#059669', fontWeight: 'bold' },
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  saveBtn: { width: '100%' },
});

export default ProductoDetailScreen;