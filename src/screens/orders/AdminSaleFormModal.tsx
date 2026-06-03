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

const parseLegacyComment = (comment: string) => {
  let price = 0;
  const name = comment.trim();
  
  if (name.includes('$') || name.includes('+') || name.includes('-')) {
    const match = name.match(/(-|\+)?\s*\$?\s*(\d+([.,]\d+)?)/);
    if (match) {
      const sign = match[1] === '-' ? -1 : 1;
      const numStr = match[2].replace(/[.,]/g, '');
      let num = parseFloat(numStr);
      
      if (num < 100 && num > 0) {
        num = num * 1000;
      }
      price = sign * num;
    }
  }
  
  return { name, price, quantity: 1 };
};

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
  const [discountPercent, setDiscountPercent] = useState<number>(0);

  // Pago Mixto
  const [efectivoInput, setEfectivoInput] = useState('');

  // Add Modifier State
  const [modifiersModalVisible, setModifiersModalVisible] = useState(false);
  const [selectedCartItemId, setSelectedCartItemId] = useState<number | null>(null);
  const [modifierSearchQuery, setModifierSearchQuery] = useState('');
  const [comentariosDb, setComentariosDb] = useState<any[]>([]);

  useEffect(() => {
    if (visible) {
      fetchProducts();
      fetchComentarios();
      if (isEdit && saleData) {
        setFechaManual(saleData.fecha ? new Date(saleData.fecha) : new Date());
        setEstado(saleData.estado || 'PAGADO');
        setMedioDePago(saleData.medioDePago || 'EFECTIVO');
        setDiscountPercent(Number(saleData.porcentajeDeDescuento || 0));
        
        if (saleData.ordenVentas) {
          setCart(saleData.ordenVentas.map((ov: any) => {
            let parsedModifiers: any[] = [];
            if (ov.comentarios) {
              try {
                parsedModifiers = JSON.parse(ov.comentarios);
                if (!Array.isArray(parsedModifiers)) {
                  parsedModifiers = [parseLegacyComment(ov.comentarios)];
                } else {
                  parsedModifiers = parsedModifiers.map((m: any) => ({
                    name: m.name || m.comentarios || m.Nombre || '',
                    price: Number(m.price ?? m.precio ?? m.Precio ?? 0),
                    quantity: Number(m.quantity ?? m.cantidad ?? 1)
                  }));
                }
              } catch (e) {
                parsedModifiers = [parseLegacyComment(ov.comentarios)];
              }
            }
            return {
              productoId: ov.productoId || ov.IDorderventas, // fallback if productoId is null
              nombre: ov.nombre || ov.nombreProducto,
              precio: Number(ov.precio || 0),
              cantidad: Number(ov.cantidad || 1),
              categoria: ov.categoria || ov.categoriaProducto || 'OTROS',
              modifiers: parsedModifiers
            };
          }));
        }
      } else {
        setFechaManual(new Date());
        setEstado('PAGADO');
        setMedioDePago('EFECTIVO');
        setDiscountPercent(0);
        setCart([]);
        setEfectivoInput('');
      }
    }
  }, [visible, saleData]);

  const parseMoney = (val: string) => Number(val.replace(/\D/g, '')) || 0;
  const efectivoAmount = parseMoney(efectivoInput);

  const fetchProducts = async () => {
    try {
      const res = await getProducts({ limit: 1000 });
      setProducts(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchComentarios = async () => {
    try {
      const response = await api.get('/comentarios');
      setComentariosDb(Array.isArray(response.data) ? response.data : (response.data.data || []));
    } catch (err) {
      console.log('Error fetching comentarios', err);
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

  const handleIncrementModifier = (mod: any, explicitCartIdx?: number) => {
    const idx = explicitCartIdx !== undefined ? explicitCartIdx : selectedCartItemId;
    if (idx === null) return;
    const item = cart[idx];
    if (!item) return;

    const appliedMod = item.modifiers?.find((m: any) => m.name === mod.comentarios);
    const currentQty = appliedMod ? appliedMod.quantity || 1 : 0;
    
    if (currentQty >= item.cantidad) {
      Toast.show({ type: 'info', text1: 'Límite alcanzado', text2: 'No puedes agregar más adicionales que la cantidad del producto.', position: 'bottom' });
      return;
    }

    setCart(prev => {
      const newCart = [...prev];
      const newModifiers = [...(newCart[idx].modifiers || [])];
      
      const existIdx = newModifiers.findIndex((m: any) => m.name === mod.comentarios);
      if (existIdx >= 0) {
        newModifiers[existIdx] = { ...newModifiers[existIdx], quantity: currentQty + 1 };
      } else {
        newModifiers.push({ name: mod.comentarios, price: Number(mod.precio || 0), quantity: 1 });
      }
      
      newCart[idx] = { ...newCart[idx], modifiers: newModifiers };
      return newCart;
    });
  };

  const handleDecrementModifier = (mod: any, explicitCartIdx?: number) => {
    const idx = explicitCartIdx !== undefined ? explicitCartIdx : selectedCartItemId;
    if (idx === null) return;
    const item = cart[idx];
    if (!item) return;

    const appliedMod = item.modifiers?.find((m: any) => m.name === mod.comentarios);
    if (!appliedMod) return;
    const currentQty = appliedMod.quantity || 1;
    
    setCart(prev => {
      const newCart = [...prev];
      let newModifiers = [...(newCart[idx].modifiers || [])];
      
      if (currentQty <= 1) {
        newModifiers = newModifiers.filter((m: any) => m.name !== mod.comentarios);
      } else {
        const existIdx = newModifiers.findIndex((m: any) => m.name === mod.comentarios);
        if (existIdx >= 0) {
          newModifiers[existIdx] = { ...newModifiers[existIdx], quantity: currentQty - 1 };
        }
      }
      
      newCart[idx] = { ...newCart[idx], modifiers: newModifiers };
      return newCart;
    });
  };

  const handleSave = async () => {
    if (cart.length === 0) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Agrega al menos un producto' });
      return;
    }

    const baseTotal = cart.reduce((sum, item) => {
      const itemBaseTotal = item.precio * item.cantidad;
      const modsTotal = (item.modifiers || []).reduce((mSum: number, mod: any) => mSum + (Number(mod.price) * (mod.quantity || 1)), 0);
      return sum + itemBaseTotal + modsTotal;
    }, 0);
    const calculatedDescuento = baseTotal * discountPercent;
    const finalTotalInput = Math.max(0, baseTotal - calculatedDescuento);

    setLoading(true);
    try {
      const fechaString = fechaManual.toISOString().substring(0, 10);

      if (medioDePago === 'EFECTIVO Y OTROS' && efectivoAmount > finalTotalInput) {
        Toast.show({ type: 'error', text1: 'Error', text2: 'El efectivo no puede superar el total en pago mixto' });
        setLoading(false);
        return;
      }

      const payload = {
        venta: {
          mesa: isEdit && saleData.mesa ? saleData.mesa : 'V.R',
          estado,
          medioDePago,
          efectivoRecibido: medioDePago === 'EFECTIVO Y OTROS' ? efectivoAmount : finalTotalInput,
          devueltas: 0,
          totalInput: finalTotalInput,
          descuento: calculatedDescuento,
          porcentajeDeDescuento: String(discountPercent),
        },
        productos: cart.map(item => {
          const itemBaseTotal = item.precio * item.cantidad;
          const modsTotal = (item.modifiers || []).reduce((mSum: number, mod: any) => mSum + (Number(mod.price) * (mod.quantity || 1)), 0);
          return {
            productoId: item.productoId,
            nombre: item.nombre,
            nombreProducto: item.nombre,
            categoria: item.categoria,
            categoriaProducto: item.categoria,
            cantidad: item.cantidad,
            precio: item.precio,
            precioTotal: itemBaseTotal + modsTotal,
            estado,
            comentarios: item.modifiers && item.modifiers.length > 0 ? JSON.stringify(item.modifiers) : undefined
          };
        }),
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

  const total = cart.reduce((sum, item) => {
    const itemBaseTotal = item.precio * item.cantidad;
    const modsTotal = (item.modifiers || []).reduce((mSum: number, mod: any) => mSum + (Number(mod.price) * (mod.quantity || 1)), 0);
    return sum + itemBaseTotal + modsTotal;
  }, 0);
  const calculatedDescuento = total * discountPercent;
  const finalTotal = Math.max(0, total - calculatedDescuento);

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
            
            {medioDePago === 'EFECTIVO Y OTROS' && (
              <View className="mt-4 bg-gray-50 p-3 rounded-xl border border-gray-200">
                <Text className="text-gray-700 font-bold mb-1">Monto recibido en Efectivo</Text>
                <View className="flex-row items-center border border-gray-300 rounded-xl px-3 py-1 bg-white mb-2">
                  <Text className="text-lg font-bold text-gray-500 mr-1">$</Text>
                  <TextInput
                    className="flex-1 text-base text-gray-800 h-10 font-bold"
                    placeholder="0"
                    keyboardType="numeric"
                    value={efectivoInput}
                    onChangeText={(text) => {
                      const num = text.replace(/\D/g, '');
                      setEfectivoInput(num ? Number(num).toLocaleString('es-CO') : '');
                    }}
                  />
                </View>
                <View className="flex-row justify-between items-center bg-amber-50 p-2 rounded-lg border border-amber-100">
                  <Text className="text-xs font-bold text-amber-800">Restante en Transferencia:</Text>
                  <Text className="text-xs font-black text-amber-900">${Math.max(0, finalTotal - efectivoAmount).toLocaleString('es-CO')}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Descuento */}
          <View className="mb-4">
            <Text className="text-gray-700 font-bold mb-1">Descuento Global</Text>
            <View className="flex-row gap-2">
              {[0, 0.15, 0.30, 0.50].map((percent) => {
                const isSelected = discountPercent === percent;
                return (
                  <TouchableOpacity
                    key={percent}
                    className={`flex-1 py-3 px-2 rounded-xl border items-center justify-center ${isSelected ? 'bg-orange-100 border-orange-500' : 'bg-white border-gray-300'}`}
                    onPress={() => setDiscountPercent(percent)}
                  >
                    <Text className={`font-bold text-xs ${isSelected ? 'text-orange-700' : 'text-gray-600'}`}>
                      {percent === 0 ? 'SIN DESC.' : `-${percent * 100}%`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
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
              cart.map((item, idx) => {
                const itemBaseTotal = item.precio * item.cantidad;
                const modsTotal = (item.modifiers || []).reduce((mSum: number, mod: any) => mSum + (Number(mod.price) * (mod.quantity || 1)), 0);
                const itemFinalTotal = itemBaseTotal + modsTotal;
                return (
                <View key={idx} className={`p-3 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                  <View className="flex-row items-center justify-between">
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
                    <Text className="font-bold text-gray-900 ml-4 w-20 text-right">${itemFinalTotal.toLocaleString()}</Text>
                  </View>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <View className="mt-2 pl-2">
                      {item.modifiers.map((mod: any, mIdx: number) => {
                        const qty = mod.quantity || 1;
                        return (
                          <View key={mIdx} className="flex-row justify-between items-center mb-1 bg-amber-50 rounded-md p-1 px-2 border border-amber-200">
                            <Text className="text-amber-800 text-xs flex-1">{qty > 1 ? `${qty}x ` : ''}{mod.name}</Text>
                            <View className="flex-row items-center">
                              <Text className="text-amber-700 text-xs font-bold mr-3">
                                {mod.price < 0 ? `-$${Math.abs(Number(mod.price) * qty).toLocaleString()}` : (mod.price > 0 ? `+$${(Number(mod.price) * qty).toLocaleString()}` : '')}
                              </Text>
                              <View className="flex-row items-center bg-white rounded-md border border-amber-200 p-0.5">
                                <TouchableOpacity onPress={() => handleDecrementModifier({ comentarios: mod.name }, idx)} className="p-1 px-2">
                                  <Ionicons name="remove" size={14} color="#b45309" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => handleIncrementModifier({ comentarios: mod.name, precio: mod.price }, idx)} className="p-1 px-2 border-l border-amber-100">
                                  <Ionicons name="add" size={14} color="#b45309" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  <View className="mt-1 flex-row justify-end">
                    <TouchableOpacity onPress={() => {
                      setSelectedCartItemId(idx);
                      setModifiersModalVisible(true);
                    }}>
                      <Text className="text-indigo-600 text-xs font-bold">+ Agregar Nota/Promo</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                );
              })
            )}
            {cart.length > 0 && (
              <View className="bg-gray-50 p-3 border-t border-gray-200 rounded-b-xl">
                {calculatedDescuento > 0 && (
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="font-bold text-gray-500">Subtotal</Text>
                    <Text className="font-bold text-gray-500">${total.toLocaleString()}</Text>
                  </View>
                )}
                {calculatedDescuento > 0 && (
                  <View className="flex-row justify-between items-center mb-2 border-b border-gray-200 pb-2">
                    <Text className="font-bold text-orange-600">Descuento ({discountPercent * 100}%)</Text>
                    <Text className="font-bold text-orange-600">-${calculatedDescuento.toLocaleString()}</Text>
                  </View>
                )}
                <View className="flex-row justify-between items-center">
                  <Text className="font-bold text-gray-600">TOTAL</Text>
                  <Text className="font-black text-green-600 text-lg">${finalTotal.toLocaleString()}</Text>
                </View>
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
      {/* Modifiers Modal */}
      <Modal visible={modifiersModalVisible} transparent animationType="slide" onRequestClose={() => setModifiersModalVisible(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 bg-black/50 justify-end"
        >
          <TouchableOpacity className="flex-1 w-full justify-end" activeOpacity={1} onPress={() => setModifiersModalVisible(false)}>
            <TouchableOpacity activeOpacity={1} className="bg-white rounded-t-3xl pt-5 px-5 pb-0 max-h-[85%]">
              <View className="flex-row justify-between items-start mb-3">
                <View>
                  <Text className="text-lg font-black text-gray-900">Adicionales / Notas</Text>
                  {selectedCartItemId !== null && cart[selectedCartItemId] && (
                    <Text className="text-xs text-gray-500 mt-0.5">{cart[selectedCartItemId].nombre} (Cant: {cart[selectedCartItemId].cantidad || 0})</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => setModifiersModalVisible(false)} className="p-1 bg-gray-100 rounded-xl">
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <View className="flex-row items-center bg-gray-100 rounded-xl px-3 py-2 mb-3">
                <Ionicons name="search" size={18} color="#9ca3af" />
                <TextInput
                  className="flex-1 text-[15px] text-gray-800 ml-2 h-9"
                  placeholder="Buscar o escribir nota rápida..."
                  placeholderTextColor="#9ca3af"
                  value={modifierSearchQuery}
                  onChangeText={setModifierSearchQuery}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (modifierSearchQuery.trim().length > 0 && !comentariosDb.some(mod => mod.comentarios.toLowerCase() === modifierSearchQuery.trim().toLowerCase())) {
                      const customNote = { ID: `custom-${Date.now()}`, comentarios: modifierSearchQuery.trim(), precio: 0, tipo: 'Nota Personalizada' };
                      handleIncrementModifier(customNote);
                      setModifierSearchQuery('');
                    }
                  }}
                />
                {modifierSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setModifierSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color="#9ca3af" />
                  </TouchableOpacity>
                )}
              </View>

              {modifierSearchQuery.trim().length > 0 && !comentariosDb.some(mod => mod.comentarios.toLowerCase() === modifierSearchQuery.trim().toLowerCase()) && (
                <TouchableOpacity className="flex-row items-center bg-blue-50 p-3 rounded-xl mb-3 border border-blue-200" onPress={() => {
                  const customNote = { ID: `custom-${Date.now()}`, comentarios: modifierSearchQuery.trim(), precio: 0, tipo: 'Nota Personalizada' };
                  handleIncrementModifier(customNote);
                  setModifierSearchQuery('');
                }}>
                  <Ionicons name="add-circle" size={20} color="#3b82f6" />
                  <Text className="text-sm font-bold text-blue-700 ml-2">Agregar como nota: "{modifierSearchQuery.trim()}"</Text>
                </TouchableOpacity>
              )}

              <ScrollView className="mb-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {comentariosDb.filter(mod => mod.comentarios.toLowerCase().includes(modifierSearchQuery.toLowerCase())).length === 0 && !(modifierSearchQuery.trim().length > 0 && !comentariosDb.some(mod => mod.comentarios.toLowerCase() === modifierSearchQuery.trim().toLowerCase())) ? (
                  <Text className="text-gray-500 text-sm text-center mt-5">No se encontraron resultados.</Text>
                ) : (
                  comentariosDb.filter(mod => mod.comentarios.toLowerCase().includes(modifierSearchQuery.toLowerCase())).map((mod: any) => {
                    const appliedMod = selectedCartItemId !== null && cart[selectedCartItemId] ? cart[selectedCartItemId].modifiers?.find((m: any) => m.name === mod.comentarios) : null;
                    const isApplied = !!appliedMod;
                    const qty = appliedMod ? appliedMod.quantity || 1 : 0;
                    const modPrice = Number(mod.precio || 0);
                    const priceStr = modPrice !== 0 ? (modPrice > 0 ? `+$${modPrice.toLocaleString()}` : `-$${Math.abs(modPrice).toLocaleString()}`) : 'Gratis';
                    
                    return (
                      <View key={mod.ID} className={`flex-row justify-between items-center p-3 rounded-xl bg-gray-50 mb-2 border-2 ${isApplied ? 'bg-blue-50 border-blue-500' : 'border-transparent'}`}>
                        <View className="flex-1 flex-row items-center pr-2">
                          <View>
                            <Text className={`text-sm font-bold ${isApplied ? 'text-blue-700' : 'text-gray-700'}`}>
                              {mod.comentarios}
                            </Text>
                            <Text className={`text-xs font-bold mt-0.5 ${isApplied ? 'text-blue-600' : 'text-gray-500'}`}>
                              {priceStr} {mod.tipo && `• ${mod.tipo}`}
                            </Text>
                          </View>
                        </View>
                        
                        <View className="flex-row items-center bg-white rounded-lg border border-gray-200 p-0.5">
                          {isApplied ? (
                            <>
                              <TouchableOpacity onPress={() => handleDecrementModifier(mod)} className="p-1 bg-blue-50 rounded-md">
                                <Ionicons name="remove" size={16} color="#3b82f6" />
                              </TouchableOpacity>
                              <Text className="text-sm font-bold text-gray-900 min-w-[24px] text-center mx-1">{qty}</Text>
                              <TouchableOpacity onPress={() => handleIncrementModifier(mod)} className="p-1 bg-blue-50 rounded-md">
                                <Ionicons name="add" size={16} color="#3b82f6" />
                              </TouchableOpacity>
                            </>
                          ) : (
                            <TouchableOpacity onPress={() => handleIncrementModifier(mod)} className="py-1 px-3 bg-blue-500 rounded-md">
                              <Ionicons name="add" size={18} color="#fff" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
              
              <View className="pt-3 border-t border-gray-200 mb-6 mt-2">
                <TouchableOpacity onPress={() => { setModifiersModalVisible(false); setModifierSearchQuery(''); }} className="bg-green-500 rounded-xl h-12 justify-center items-center">
                  <Text className="text-white font-bold text-base">Listo</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </Modal>
  );
}
