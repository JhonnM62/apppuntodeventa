import React, { useState, useEffect } from 'react';
import { View, Modal, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../components/ui/text';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getProducts } from '../../services/products';
import { createSale } from '../../services/sales';
import Toast from 'react-native-toast-message';
import api from '../../services/api';

interface AdminSaleFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  saleData?: any; // If provided, we are in edit mode
}

export default function AdminSaleFormModal({ visible, onClose, onSuccess, saleData }: AdminSaleFormModalProps) {
  const insets = useSafeAreaInsets();
  const isEdit = !!saleData;
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductSelector, setShowProductSelector] = useState(false);

  // Form State
  const [fechaManual, setFechaManual] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [estado, setEstado] = useState('PAGADO');
  const [medioDePago, setMedioDePago] = useState('EFECTIVO');
  const [cart, setCart] = useState<any[]>([]);

  useEffect(() => {
    if (visible) {
      fetchProducts();
      if (isEdit && saleData) {
        setFechaManual(saleData.fecha ? new Date(saleData.fecha) : new Date());
        setEstado(saleData.estado || 'PAGADO');
        setMedioDePago(saleData.medioDePago || 'EFECTIVO');
        
        if (saleData.ordenVentas) {
          setCart(saleData.ordenVentas.map((ov: any) => ({
            productoId: ov.productoId || ov.IDorderventas, // fallback if productoId is null
            nombre: ov.nombre || ov.nombreProducto,
            precio: Number(ov.precio || 0),
            cantidad: Number(ov.cantidad || 1),
            categoria: ov.categoria || ov.categoriaProducto || 'OTROS'
          })));
        }
      } else {
        setFechaManual(new Date());
        setEstado('PAGADO');
        setMedioDePago('EFECTIVO');
        setCart([]);
      }
    }
  }, [visible, saleData]);

  const fetchProducts = async () => {
    try {
      const res = await getProducts({ limit: 1000 });
      setProducts(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddProduct = (prod: any) => {
    setCart(prev => {
      const existing = prev.find(p => p.productoId === prod.IDproductos);
      if (existing) {
        return prev.map(p => p.productoId === prod.IDproductos ? { ...p, cantidad: p.cantidad + 1 } : p);
      }
      return [...prev, {
        productoId: prod.IDproductos,
        nombre: prod.nombre,
        precio: Number(prod.precioUnitario || prod.Precio_Unitario || 0),
        cantidad: 1,
        categoria: prod.categoriaNombre || prod.categoria || 'OTROS'
      }];
    });
    setShowProductSelector(false);
    setProductSearch('');
  };

  const updateQuantity = (index: number, delta: number) => {
    setCart(prev => {
      const newCart = [...prev];
      newCart[index].cantidad += delta;
      if (newCart[index].cantidad <= 0) {
        newCart.splice(index, 1);
      }
      return newCart;
    });
  };

  const handleSave = async () => {
    if (cart.length === 0) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Agrega al menos un producto' });
      return;
    }

    setLoading(true);
    try {
      const total = cart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
      const fechaString = fechaManual.toISOString().substring(0, 10);

      const payload = {
        venta: {
          estado,
          medioDePago,
          efectivoRecibido: total,
          devueltas: 0,
          totalInput: total,
        },
        productos: cart.map(item => ({
          productoId: item.productoId,
          nombre: item.nombre,
          categoria: item.categoria,
          cantidad: item.cantidad,
          precio: item.precio,
          precioTotal: item.precio * item.cantidad,
          estado
        })),
        fechaContableManual: fechaString
      };

      if (isEdit) {
        await api.put(`/ventas/${saleData.IDventas}`, payload);
        Toast.show({ type: 'success', text1: 'Venta Actualizada' });
      } else {
        await createSale(payload);
        Toast.show({ type: 'success', text1: 'Venta Pasada Creada' });
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.message || 'Error al guardar' });
    } finally {
      setLoading(false);
    }
  };

  const total = cart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#F8FAFC' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingTop: insets.top }} className="bg-white">
          <View className="flex-row justify-between items-center p-4 border-b border-gray-200">
            <Text className="text-lg font-bold text-gray-800">{isEdit ? 'Editar Venta' : 'Crear Venta Pasada'}</Text>
            <TouchableOpacity onPress={onClose} className="p-2 bg-gray-100 rounded-full">
              <Ionicons name="close" size={24} color="#4b5563" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
          {/* Fecha */}
          <View className="mb-4">
            <Text className="text-gray-700 font-bold mb-1">Fecha Contable (YYYY-MM-DD)</Text>
            <TouchableOpacity 
              onPress={() => {
                Keyboard.dismiss();
                setShowDatePicker(true);
              }}
              className="bg-white border border-gray-300 rounded-xl px-4 py-3"
            >
              <Text className="text-gray-800">{fechaManual.toISOString().substring(0, 10)}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={fechaManual}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowDatePicker(false);
                  if (selectedDate) {
                    setFechaManual(selectedDate);
                  }
                }}
              />
            )}
          </View>

          {/* Estado & Medio de Pago */}
          <View className="mb-4">
            <Text className="text-gray-700 font-bold mb-1">Estado</Text>
            <View className="flex-row flex-wrap gap-2">
              {['PAGADO', 'ENTREGADO', 'DEUDOR'].map(est => (
                <TouchableOpacity 
                  key={est} 
                  onPress={() => setEstado(est)}
                  className={`px-3 py-2 rounded-lg border ${estado === est ? 'bg-indigo-100 border-indigo-500' : 'bg-white border-gray-300'}`}
                >
                  <Text className={`text-xs font-bold ${estado === est ? 'text-indigo-700' : 'text-gray-600'}`}>{est}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View className="mb-6">
            <Text className="text-gray-700 font-bold mb-1">Medio de Pago</Text>
            <View className="flex-row flex-wrap gap-2">
              {['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BANCOLOMBIA', 'EFECTIVO Y OTROS'].map(mp => (
                <TouchableOpacity 
                  key={mp} 
                  onPress={() => setMedioDePago(mp)}
                  className={`px-3 py-2 rounded-lg border ${medioDePago === mp ? 'bg-green-100 border-green-500' : 'bg-white border-gray-300'}`}
                >
                  <Text className={`text-xs font-bold ${medioDePago === mp ? 'text-green-700' : 'text-gray-600'}`}>{mp}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Productos */}
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-gray-800 font-bold text-base">Productos</Text>
            <TouchableOpacity 
              onPress={() => setShowProductSelector(true)}
              className="bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 flex-row items-center"
            >
              <Ionicons name="add" size={16} color="#4f46e5" />
              <Text className="text-indigo-700 font-bold text-xs ml-1">Agregar</Text>
            </TouchableOpacity>
          </View>

          <View className="bg-white rounded-xl border border-gray-200 mb-6">
            {cart.length === 0 ? (
              <Text className="text-gray-500 text-center py-6">No hay productos en la venta</Text>
            ) : (
              cart.map((item, idx) => (
                <View key={idx} className={`flex-row items-center justify-between p-3 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                  <View className="flex-1">
                    <Text className="font-bold text-gray-800">{item.nombre}</Text>
                    <Text className="text-gray-500 text-xs">${item.precio.toLocaleString()}</Text>
                  </View>
                  <View className="flex-row items-center bg-gray-100 rounded-lg p-1">
                    <TouchableOpacity onPress={() => updateQuantity(idx, -1)} className="p-2">
                      <Ionicons name="remove" size={16} color="#ef4444" />
                    </TouchableOpacity>
                    <Text className="font-bold px-2">{item.cantidad}</Text>
                    <TouchableOpacity onPress={() => updateQuantity(idx, 1)} className="p-2">
                      <Ionicons name="add" size={16} color="#10b981" />
                    </TouchableOpacity>
                  </View>
                  <Text className="font-bold text-gray-900 ml-4 w-20 text-right">${(item.precio * item.cantidad).toLocaleString()}</Text>
                </View>
              ))
            )}
            {cart.length > 0 && (
              <View className="bg-gray-50 p-3 flex-row justify-between items-center border-t border-gray-200 rounded-b-xl">
                <Text className="font-bold text-gray-600">TOTAL</Text>
                <Text className="font-black text-green-600 text-lg">${total.toLocaleString()}</Text>
              </View>
            )}
          </View>

        </ScrollView>

        <View className="p-4 bg-white border-t border-gray-200" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
          <TouchableOpacity 
            onPress={handleSave} 
            disabled={loading}
            className={`bg-green-600 py-3.5 rounded-xl flex-row justify-center items-center mb-8 ${loading ? 'opacity-70' : ''}`}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="save-outline" size={20} color="#fff" />
                <Text className="text-white font-bold ml-2">{isEdit ? 'Guardar Cambios' : 'Crear Venta'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>

      {/* Selector de Productos Modal */}
      <Modal visible={showProductSelector} animationType="fade" transparent onRequestClose={() => setShowProductSelector(false)}>
        <View className="flex-1 bg-black/50 justify-center p-4">
          <View className="bg-white rounded-2xl h-3/4 flex-col">
            <View className="flex-row justify-between items-center p-4 border-b border-gray-200">
              <Text className="font-bold text-lg">Seleccionar Producto</Text>
              <TouchableOpacity onPress={() => setShowProductSelector(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <View className="p-3 border-b border-gray-100">
              <TextInput 
                className="bg-gray-100 rounded-lg px-3 py-2"
                placeholder="Buscar..."
                value={productSearch}
                onChangeText={setProductSearch}
              />
            </View>
            <ScrollView className="flex-1">
              {products.filter(p => p.nombre?.toLowerCase().includes(productSearch.toLowerCase())).map(p => (
                <TouchableOpacity 
                  key={p.IDproductos} 
                  onPress={() => handleAddProduct(p)}
                  className="flex-row justify-between items-center p-4 border-b border-gray-100"
                >
                  <Text className="font-bold text-gray-800">{p.nombre}</Text>
                  <Text className="text-gray-500">${Number(p.precioUnitario || p.Precio_Unitario || 0).toLocaleString()}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}
