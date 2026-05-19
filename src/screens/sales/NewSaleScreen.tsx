import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { View, TouchableOpacity, ActivityIndicator, Image, RefreshControl, Platform, TextInput, FlatList, StyleSheet, Modal as RNModal, ScrollView, Alert, Text as RNText, KeyboardAvoidingView, Keyboard } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { getProducts } from '../../services/products';
import { getMesas, Mesa } from '../../services/mesas';
import { getComentarios, Comentario } from '../../services/comentarios';
import { getClientes, Cliente } from '../../services/clientes.service';
import { createSale, addProductosToVenta, SalePayload } from '../../services/sales';
import { processVoiceOrderWithIA } from '../../services/api';
import { useSocket, useSocketEmitter, useSocketEvent } from '../../hooks';
import { Room } from '../../types/socket.types';
import Toast from 'react-native-toast-message';
import { useProductStore } from '../../store/useProductStore';
import { useMesaStore } from '../../store/useMesaStore';
import usePrinterStore from '../../store/usePrinterStore';
import { Text } from '../../components/ui/text';
import { Button } from '../../components/ui/button';
import PaymentModal from '../../components/ui/PaymentModal';
import useCartStore, { CartItem } from '../../store/useCartStore';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { useScrollDirection } from '../../hooks/useScrollDirection';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Sales'>;
  route?: RouteProp<RootStackParamList, 'Sales'>;
};

type ProductItem = {
  IDproductos: string;
  nombre: string;
  precioUnitario?: string | number;
  Precio_Unitario?: string | number;
  imagenUrl?: string;
  image?: string;
  categoriaNombre?: string;
  categoria?: string;
};

const CATEGORIES_ORDER = ['LO MAS VENDIDO', 'GRANIZADOS', 'BEBIDAS', 'COMIDAS', 'COMBOS', 'OTROS'];

const NewSaleScreen = ({ navigation, route }: Props) => {
  const insets = useSafeAreaInsets();
  const cachedMesas = useMesaStore((state) => state.mesas);
  const setCachedMesas = useMesaStore((state) => state.setMesas);
  const shouldRefetchMesas = useMesaStore((state) => state.shouldRefetch);

  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [comentariosDb, setComentariosDb] = useState<Comentario[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [mesaModalVisible, setMesaModalVisible] = useState(false);
  const [modifiersModalVisible, setModifiersModalVisible] = useState(false);
  const [clienteModalVisible, setClienteModalVisible] = useState(false);
  
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  // VAD (Voice Activity Detection) Refs
  const hasSpoken = useRef(false);
  const silenceStart = useRef<number | null>(null);

  const [modifierSearchQuery, setModifierSearchQuery] = useState('');
  const [selectedCartItemId, setSelectedCartItemId] = useState<string | null>(null);
  const [selectedMesa, setSelectedMesa] = useState<Mesa | null>(null);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeCategory, setActiveCategory] = useState<string>('LO MAS VENDIDO');

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const handleScroll = useScrollDirection();

  const cachedProductos = useProductStore((state) => state.productos);
  const shouldRefetchProducts = useProductStore((state) => state.shouldRefetch);

  const cart = useCartStore((state) => state.cart);
  const cartStartTime = useCartStore((state) => state.cartStartTime);
  const editingSaleId = useCartStore((state) => state.editingSaleId);
  const editingVenta = useCartStore((state) => state.editingVenta);
  const addToCart = useCartStore((state) => state.addToCart);
  const decrementQuantity = useCartStore((state) => state.decrementQuantity);
  const removeFromCart = useCartStore((state) => state.removeFromCart);
  const clearCart = useCartStore((state) => state.clearCart);
  const getTotalItems = useCartStore((state) => state.getTotalItems);
  const getTotalPrice = useCartStore((state) => state.getTotalPrice);
  const getNewProductsOnly = useCartStore((state) => state.getNewProductsOnly);

  const isEditing = editingSaleId !== null;
  const saleIdFromRoute = route?.params?.saleId;

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[NewSaleScreen] Fetching data...');
      const [productsRes, mesasData, comentariosData] = await Promise.all([
        getProducts(),
        getMesas(),
        getComentarios()
      ]);
      const productsData = productsRes?.data || productsRes;
      console.log('[NewSaleScreen] Products:', Array.isArray(productsData) ? productsData.length : 0);
      console.log('[NewSaleScreen] Mesas:', Array.isArray(mesasData) ? mesasData.length : 0);

      if (Array.isArray(productsData) && productsData.length > 0) {
        useProductStore.getState().setProductos(productsData);
      }
      const mesasArray = Array.isArray(mesasData) ? mesasData : [];
      setMesas(mesasArray);
      setCachedMesas(mesasArray);
      setComentariosDb(Array.isArray(comentariosData) ? comentariosData : []);
    } catch (error: any) {
      console.error('[NewSaleScreen] Error fetching data:', error?.message || error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setCachedMesas]);

  useEffect(() => {
    const loadInitialData = () => {
      console.log('[NewSaleScreen] Initial load - cachedProductos:', cachedProductos.length, 'cachedMesas:', cachedMesas.length);
      if (cachedMesas.length > 0) {
        setMesas(cachedMesas);
      }
      
      // Siempre solicitamos los comentarios de la BD para tener la lista más reciente,
      // incluso si ya tenemos productos cacheados.
      fetchData();
    };
    loadInitialData();
  }, []);

  const { joinRoom, isConnected } = useSocket();
  const { emitNuevaOrden, emitOrdenActualizada } = useSocketEmitter();

  const hasJoinedRoom = useRef(false);

  useEffect(() => {
    if (isConnected && !hasJoinedRoom.current) {
      hasJoinedRoom.current = true;
      joinRoom(Room.CAJA);
    }
  }, [isConnected, joinRoom]);

  const handleNewOrderFromSocket = useCallback((data: any) => {
    console.log('[NewSaleScreen] Orden actualizada via socket:', JSON.stringify(data)?.slice(0, 200));
  }, []);

  useSocketEvent('ordenRecibida', handleNewOrderFromSocket, []);
  useSocketEvent('ordenActualizada', handleNewOrderFromSocket, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const categories = useMemo(() => {
    const cats = ['LO MAS VENDIDO'];
    cachedProductos.forEach(p => {
      const cat = p.categoriaNombre || p.categoria;
      if (cat && cat !== 'LO MAS VENDIDO' && !cats.includes(cat)) {
        cats.push(cat);
      }
    });
    const remaining = cats.filter(c => CATEGORIES_ORDER.includes(c));
    const others = cats.filter(c => !CATEGORIES_ORDER.includes(c)).sort();
    return [...remaining, ...others];
  }, [cachedProductos]);

  const filteredProducts = useMemo(() => {
    let filtered = cachedProductos;

    if (activeCategory !== 'LO MAS VENDIDO') {
      filtered = filtered.filter(p =>
        (p.categoriaNombre || p.categoria) === activeCategory
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.nombre?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [cachedProductos, searchQuery, activeCategory]);

  const startRecording = async () => {
    try {
      // Prevent multiple recordings
      if (isRecording || isProcessingVoice || recording) return;

      const permission = await Audio.requestPermissionsAsync();
      if (permission.status === 'granted') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const { recording: newRecording } = await Audio.Recording.createAsync({
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        });
        
        // Reset VAD state
        hasSpoken.current = false;
        silenceStart.current = null;

        newRecording.setOnRecordingStatusUpdate((status) => {
          if (status.isRecording && status.metering !== undefined) {
            const now = Date.now();
            
            // -35 dB is a good threshold for speaking vs background noise in expo-av
            if (status.metering > -35) {
              hasSpoken.current = true;
              silenceStart.current = null;
            } else {
              if (!silenceStart.current) {
                silenceStart.current = now;
              } else {
                const silenceDuration = now - silenceStart.current;
                
                // If user spoke and then paused for 1.5 seconds -> Auto Stop
                if (hasSpoken.current && silenceDuration > 1500) {
                  stopRecording(newRecording);
                } 
                // If user never spoke, wait up to 5 seconds before giving up
                else if (!hasSpoken.current && silenceDuration > 5000) {
                  stopRecording(newRecording);
                }
              }
            }
          }
        });

        setRecording(newRecording);
        setIsRecording(true);

      } else {
        Alert.alert('Permiso Denegado', 'Debes otorgar permisos de micrófono para usar esta función.');
      }
    } catch (err) {
      console.error('Error iniciando grabación', err);
      setIsRecording(false);
    }
  };

  const stopRecording = async (activeRecording = recording) => {
    // Prevent multiple unloads
    if (!activeRecording) return;
    
    // Remove listener immediately to prevent any async updates while unloading
    activeRecording.setOnRecordingStatusUpdate(null);
    
    // Check if we already cleared the recording state to avoid double processing
    if (activeRecording !== recording && isProcessingVoice) return;
    
    setIsRecording(false);
    setRecording(null);
    setIsProcessingVoice(true);
    
    try {
      // Safely check status before unloading to avoid "Recorder does not exist"
      const status = await activeRecording.getStatusAsync();
      if (status && !status.isDoneRecording && status.canRecord) {
        await activeRecording.stopAndUnloadAsync();
      }
      
      const uri = activeRecording.getURI();
      
      if (uri) {
        Toast.show({
          type: 'info',
          text1: '✨ Analizando audio con IA...',
          text2: 'Procesando tu pedido, por favor espera.',
          position: 'top',
        });

        const formData = new FormData();
        const fileExt = uri.split('.').pop() || 'm4a';
        formData.append('audio', {
          uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
          name: `audio.${fileExt}`,
          type: `audio/${fileExt === 'm4a' ? 'mp4' : 'wav'}`,
        } as any);

        const response = await processVoiceOrderWithIA(formData);
        
        if (response && response.data && response.data.items && response.data.items.length > 0) {
          let countAdded = 0;
          response.data.items.forEach((item: any) => {
            const product = cachedProductos.find(p => p.IDproductos === item.productoId);
            if (product) {
              const orderItem: CartItem = {
                ...product,
                quantity: item.cantidad || 1,
                modifiers: [],
              };
              
              if (item.comentariosIds && item.comentariosIds.length > 0) {
                item.comentariosIds.forEach((modId: string) => {
                  const mod = comentariosDb.find(c => c.ID === modId);
                  if (mod) {
                    orderItem.modifiers!.push({
                      name: mod.comentarios,
                      price: Number(mod.precio || 0),
                      quantity: 1,
                    });
                  }
                });
              }

              // Feature: Add fallback plain-text notes from AI for things not in catalog (like "carro rojo")
              if (item.notasAdicionales && Array.isArray(item.notasAdicionales) && item.notasAdicionales.length > 0) {
                item.notasAdicionales.forEach((nota: string) => {
                  orderItem.modifiers!.push({
                    name: nota,
                    price: 0,
                    quantity: 1,
                  });
                });
              }
              
              addToCart(orderItem);
              countAdded += orderItem.quantity;
            }
          });
          
          if (countAdded > 0) {
            Toast.show({
              type: 'success',
              text1: '¡Pedido Agregado!',
              text2: `Se agregaron ${countAdded} productos con IA.`,
              position: 'top',
            });
          } else {
            Toast.show({
              type: 'error',
              text1: 'Atención',
              text2: 'La IA no pudo emparejar los productos con el catálogo actual.',
              position: 'top',
            });
          }
        } else {
          Toast.show({
            type: 'error',
            text1: 'Atención',
            text2: 'No se reconoció ningún pedido válido en el audio.',
            position: 'top',
          });
        }
      }
    } catch (err: any) {
      console.error('Error procesando audio', err);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: err?.response?.data?.message || err?.message || 'Hubo un problema al procesar el audio.',
        position: 'top',
      });
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setPaymentModalVisible(true);
  };

  const handlePaymentConfirm = async (paymentData: {
    medioDePago: string;
    banco?: string | null;
    efectivoRecibido?: number;
    devueltas?: number;
    transferencia?: number;
    estado: string;
  }) => {
    setIsSubmitting(true);
    try {
      const { getFinalTotalPrice, getDiscountAmount, discountPercent } = useCartStore.getState();
      const finalTotal = getFinalTotalPrice();
      const descuento = getDiscountAmount();
      const mesaValue = selectedMesa?.IdMesas || 'V.R';

      if (isEditing && editingSaleId) {
        const updatePayload = {
          estado: paymentData.estado,
          medioDePago: paymentData.medioDePago,
          efectivoRecibido: paymentData.efectivoRecibido || finalTotal,
          devueltas: paymentData.devueltas || 0,
          banco: paymentData.medioDePago === 'EFECTIVO' ? null : paymentData.banco,
          totalInput: finalTotal,
          descuento: descuento,
          porcentajeDeDescuento: discountPercent.toString(),
          clienteId: selectedCliente ? selectedCliente.IDcliente : undefined,
        };

        const newProducts = getNewProductsOnly().map((item) => ({
          productoId: item.IDproductos,
          nombre: item.nombre,
          nombreProducto: item.nombre,
          categoria: item.categoriaNombre || item.categoria || 'LO MAS VENDIDO',
          categoriaProducto: item.categoriaNombre || item.categoria || 'LO MAS VENDIDO',
          cantidad: item.quantity,
          precio: Number(item.precioUnitario || item.Precio_Unitario || 0),
          precioTotal: (Number(item.precioUnitario || item.Precio_Unitario || 0) * item.quantity) + (item.modifiers?.reduce((sum, mod) => sum + (Number(mod.price) * (mod.quantity || 1)), 0) || 0),
          estado: paymentData.estado,
          imagenUrl: item.imagenUrl || item.image,
          comentarios: item.modifiers?.length ? JSON.stringify(item.modifiers) : undefined,
        }));

        setPaymentModalVisible(false);
        clearCart();
        setSelectedMesa(null);

        import('../../services/sales').then(async ({ updateVentaPago, addProductosToVenta }) => {
          try {
            await updateVentaPago(editingSaleId, updatePayload);
            if (newProducts.length > 0) {
              await addProductosToVenta(editingSaleId, newProducts);
            }

            emitOrdenActualizada({ ventaId: editingSaleId, estado: paymentData.estado });

            Toast.show({
              type: 'success',
              text1: 'Cobro Exitoso',
              text2: `Pedido actualizado y cobrado correctamente`,
              position: 'top',
              visibilityTime: 3000,
            });

            setTimeout(() => {
               const finalMethod = updatePayload.medioDePago;
               const printStore = usePrinterStore.getState();
               if (printStore.shouldPrint(updatePayload.estado)) {
                 let cleanOrderId = editingVenta?.pedido || editingSaleId;
                 if (cleanOrderId && cleanOrderId.toLowerCase().startsWith('pedido-')) {
                   cleanOrderId = cleanOrderId.substring(7);
                 }

                 const allProducts = cart.map(item => ({
                   cantidad: item.quantity,
                   nombre: item.nombre,
                   precioUnitario: Number(item.precioUnitario || item.Precio_Unitario || 0),
                   subtotal: (Number(item.precioUnitario || item.Precio_Unitario || 0) * item.quantity) + (item.modifiers?.reduce((sum, mod) => sum + (Number(mod.price) * (mod.quantity || 1)), 0) || 0),
                   modifiers: item.modifiers,
                 }));

                 const ticketData = {
                   orderId: cleanOrderId,
                   fecha: new Date().toLocaleString('es-CO'),
                   total: updatePayload.totalInput,
                   productos: allProducts,
                   estado: updatePayload.estado,
                   metodoPago: finalMethod,
                   efectivoRecibido: updatePayload.efectivoRecibido,
                   devueltas: updatePayload.devueltas,
                 };
                 printStore.printTicket(ticketData);
               }
            }, 500);

            navigation.goBack();
          } catch (error: any) {
            console.error('Error al actualizar venta:', error?.message || error);
            Toast.show({
              type: 'error',
              text1: 'Error en el cobro',
              text2: error?.response?.data?.message || 'Hubo un problema al cobrar el pedido',
              position: 'top',
              visibilityTime: 4000,
            });
          }
        });

        return { pedidoId: editingSaleId };
      }

      const payload: SalePayload = {
        venta: {
          mesa: mesaValue,
          estado: paymentData.estado,
          medioDePago: paymentData.medioDePago,
          efectivoRecibido: paymentData.efectivoRecibido || finalTotal,
          devueltas: paymentData.devueltas || 0,
          banco: paymentData.medioDePago === 'EFECTIVO' ? null : paymentData.banco,
          totalInput: finalTotal,
          descuento: descuento,
          porcentajeDeDescuento: discountPercent.toString(),
          cartStartTime: cartStartTime,
          clienteId: selectedCliente ? selectedCliente.IDcliente : undefined,
        },
        productos: cart.map((item) => ({
          productoId: item.IDproductos,
          nombre: item.nombre,
          nombreProducto: item.nombre,
          categoria: item.categoriaNombre || item.categoria || 'LO MAS VENDIDO',
          categoriaProducto: item.categoriaNombre || item.categoria || 'LO MAS VENDIDO',
          cantidad: item.quantity,
          precio: Number(item.precioUnitario || item.Precio_Unitario || 0),
          precioTotal: (Number(item.precioUnitario || item.Precio_Unitario || 0) * item.quantity) + (item.modifiers?.reduce((sum, mod) => sum + (Number(mod.price) * (mod.quantity || 1)), 0) || 0),
          estado: paymentData.estado,
          imagenUrl: item.imagenUrl || item.image,
          comentarios: item.modifiers?.length ? JSON.stringify(item.modifiers) : undefined,
        })),
      };

      // UI: Se limpia instantáneamente sin esperar al servidor
      setPaymentModalVisible(false);
      clearCart();
      setSelectedMesa(null);
      setSelectedCliente(null);

      // Proceso de backend asíncrono (Promesa huérfana para no bloquear)
      createSale(payload)
        .then((response: any) => {
          const ventaCreada = response?.data || response;
          const pedidoGenerado = ventaCreada?.pedido || payload.venta.pedido;
          
          // Emitir Sockets
          const ordenData = {
            venta: {
              ...payload.venta,
              ...ventaCreada, // Esto inyecta IDventas, fechaYHora, fecha, etc.
              pedido: pedidoGenerado
            },
            productos: payload.productos,
            ventaId: ventaCreada?.IDventas || pedidoGenerado,
          };
          emitNuevaOrden(ordenData);
          
          Toast.show({
            type: 'success',
            text1: 'Cobro Exitoso',
            text2: `Pedido ${pedidoGenerado} registrado correctamente`,
            position: 'top',
            visibilityTime: 3000,
          });

          // Disparar la impresión AHORA que ya tenemos el ID real del backend
          // Usamos un pequeño timeout para no trabar el render de la notificación
          setTimeout(() => {
             const finalMethod = payload.venta.medioDePago;
             const printStore = usePrinterStore.getState();
             if (printStore.shouldPrint(payload.venta.estado)) {
               
               let cleanOrderId = pedidoGenerado;
               if (cleanOrderId && cleanOrderId.toLowerCase().startsWith('pedido-')) {
                 cleanOrderId = cleanOrderId.substring(7);
               }

               const ticketData = {
                 orderId: cleanOrderId,
                 fecha: new Date().toLocaleString('es-CO'),
                 total: payload.venta.totalInput,
                 productos: payload.productos.map(item => ({
                   cantidad: item.cantidad,
                   nombre: item.nombre,
                   precioUnitario: item.precio,
                   subtotal: item.precioTotal,
                   modifiers: item.comentarios ? JSON.parse(item.comentarios) : undefined,
                 })),
                 estado: payload.venta.estado,
                 metodoPago: finalMethod,
                 efectivoRecibido: payload.venta.efectivoRecibido,
                 devueltas: payload.venta.devueltas,
               };
               printStore.printTicket(ticketData);
             }
          }, 500);

        })
        .catch((error: any) => {
          console.error('Error al crear venta:', error?.message || error);
          Toast.show({
            type: 'error',
            text1: 'Error en el cobro',
            text2: error?.response?.data?.message || 'Hubo un problema al registrar la venta',
            position: 'top',
            visibilityTime: 4000,
          });
        })
        .finally(() => {
          setIsSubmitting(false);
        });

      // Importante: No devolvemos un ID falso para evitar que la impresora 
      // imprima un ticket con un ID como "pedido-1715..."
      // La impresora se conectará en otro flujo o deberíamos imprimir DENTRO del .then
      return { pedidoId: 'PROCESANDO...' };
    } catch (error: any) {
      console.error('Error procesando payload:', error);
      setIsSubmitting(false);
    }
  };

  const handleSavePedido = async (data: { estado: string }) => {
    setIsSubmitting(true);
    try {
      const { getFinalTotalPrice, getDiscountAmount, discountPercent } = useCartStore.getState();
      const finalTotal = getFinalTotalPrice();
      const descuento = getDiscountAmount();

      if (isEditing && editingSaleId) {
        const newProducts = getNewProductsOnly().map((item) => ({
          productoId: item.IDproductos,
          nombre: item.nombre,
          nombreProducto: item.nombre,
          categoria: item.categoriaNombre || item.categoria || 'LO MAS VENDIDO',
          categoriaProducto: item.categoriaNombre || item.categoria || 'LO MAS VENDIDO',
          cantidad: item.quantity,
          precio: Number(item.precioUnitario || item.Precio_Unitario || 0),
          precioTotal: (Number(item.precioUnitario || item.Precio_Unitario || 0) * item.quantity) + (item.modifiers?.reduce((sum, mod) => sum + (Number(mod.price) * (mod.quantity || 1)), 0) || 0),
          estado: data.estado,
          imagenUrl: item.imagenUrl || item.image,
          comentarios: item.modifiers?.length ? JSON.stringify(item.modifiers) : undefined,
        }));

        setPaymentModalVisible(false);
        clearCart();
        setSelectedMesa(null);

        import('../../services/sales').then(async ({ updateVentaEstado, addProductosToVenta }) => {
          try {
            await updateVentaEstado(editingSaleId, data.estado);
            if (newProducts.length > 0) {
              await addProductosToVenta(editingSaleId, newProducts);
            }
            emitOrdenActualizada({ ventaId: editingSaleId, estado: data.estado });

            Toast.show({
              type: 'success',
              text1: 'Pedido Actualizado',
              text2: `Estado actualizado a ${data.estado}`,
              position: 'top',
            });
            navigation.goBack();
          } catch (error) {
            console.error('Error al guardar pedido:', error);
            Toast.show({
              type: 'error',
              text1: 'Error',
              text2: 'Hubo un problema al actualizar el pedido',
              position: 'top',
            });
          }
        });

        return;
      }

      const mesaValue = selectedMesa?.IdMesas || 'V.R';

      const payload: SalePayload = {
        venta: {
          mesa: mesaValue,
          estado: data.estado,
          medioDePago: 'PENDIENTE',
          efectivoRecibido: 0,
          devueltas: 0,
          banco: null,
          totalInput: finalTotal,
          descuento: descuento,
          porcentajeDeDescuento: discountPercent.toString(),
          cartStartTime: cartStartTime,
        },
        productos: cart.map((item) => ({
          productoId: item.IDproductos,
          nombre: item.nombre,
          nombreProducto: item.nombre,
          categoria: item.categoriaNombre || item.categoria || 'LO MAS VENDIDO',
          categoriaProducto: item.categoriaNombre || item.categoria || 'LO MAS VENDIDO',
          cantidad: item.quantity,
          precio: Number(item.precioUnitario || item.Precio_Unitario || 0),
          precioTotal: (Number(item.precioUnitario || item.Precio_Unitario || 0) * item.quantity) + (item.modifiers?.reduce((sum, mod) => sum + (Number(mod.price) * (mod.quantity || 1)), 0) || 0),
          estado: data.estado,
          imagenUrl: item.imagenUrl || item.image,
          comentarios: item.modifiers?.length ? JSON.stringify(item.modifiers) : undefined,
        })),
      };

      setPaymentModalVisible(false);
      clearCart();
      setSelectedMesa(null);

      import('../../services/sales').then(({ createSale }) => {
        createSale(payload)
          .then((response: any) => {
            const ventaCreada = response?.data || response;
            const pedidoGenerado = ventaCreada?.pedido || `pedido-${Date.now()}`;
            
            setTimeout(() => {
              const ordenData = {
                venta: {
                  ...payload.venta,
                  ...ventaCreada,
                  pedido: pedidoGenerado
                },
                productos: payload.productos,
                ventaId: ventaCreada?.IDventas || pedidoGenerado,
              };
              emitNuevaOrden(ordenData);

              const printStore = usePrinterStore.getState();
              if (printStore.shouldPrint(data.estado)) {
                let cleanOrderId = pedidoGenerado;
                if (cleanOrderId && cleanOrderId.toLowerCase().startsWith('pedido-')) {
                  cleanOrderId = cleanOrderId.substring(7);
                }

                const ticketData = {
                  orderId: cleanOrderId,
                  fecha: new Date().toLocaleString('es-CO'),
                  total: payload.venta.totalInput,
                  productos: payload.productos.map(item => ({
                    cantidad: item.cantidad,
                    nombre: item.nombre,
                    precioUnitario: item.precio,
                    subtotal: item.precioTotal,
                    modifiers: item.comentarios ? JSON.parse(item.comentarios) : undefined,
                  })),
                  estado: data.estado,
                };
                printStore.printTicket(ticketData);
              }
            }, 0);

            Toast.show({
              type: 'success',
              text1: 'Orden Guardada',
              text2: `Pedido ${pedidoGenerado} guardado en estado ${data.estado}`,
              position: 'top',
            });
          })
          .catch((error: any) => {
            console.error('Error al guardar pedido:', error?.message || error);
            Toast.show({
              type: 'error',
              text1: 'Error',
              text2: error?.response?.data?.message || 'Hubo un problema al guardar el pedido',
              position: 'top',
            });
          })
          .finally(() => {
            setIsSubmitting(false);
          });
      });

      return { pedidoId: 'PROCESANDO...' };
    } catch (error: any) {
      console.error('Error procesando payload:', error);
      setIsSubmitting(false);
    }
  };

  const formatTime = (date: Date) => {
    const dayName = date.toLocaleDateString('es-CO', { weekday: 'short' });
    const dateStr = date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
    const timeStr = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${dayName} ${dateStr} ${timeStr}`;
  };

  const handleRemoveItem = (productId: string) => {
    removeFromCart(productId);
  };

  const handleIncrementModifier = (mod: Comentario) => {
    if (!selectedCartItemId) return;
    const item = cart.find(i => i.IDproductos === selectedCartItemId);
    if (!item) return;

    const appliedMod = item.modifiers?.find(m => m.name === mod.comentarios);
    const currentQty = appliedMod ? appliedMod.quantity || 1 : 0;
    
    if (currentQty >= item.quantity) {
      Toast.show({ type: 'info', text1: 'Límite alcanzado', text2: 'No puedes agregar más adicionales que la cantidad del producto.', position: 'bottom' });
      return;
    }

    useCartStore.getState().addModifier(selectedCartItemId, { name: mod.comentarios, price: Number(mod.precio || 0), quantity: currentQty + 1 });
  };

  const handleDecrementModifier = (mod: Comentario) => {
    if (!selectedCartItemId) return;
    const item = cart.find(i => i.IDproductos === selectedCartItemId);
    if (!item) return;

    const appliedMod = item.modifiers?.find(m => m.name === mod.comentarios);
    const currentQty = appliedMod ? appliedMod.quantity || 1 : 0;
    
    if (currentQty <= 1) {
      useCartStore.getState().removeModifier(selectedCartItemId, mod.comentarios);
    } else {
      useCartStore.getState().addModifier(selectedCartItemId, { name: mod.comentarios, price: Number(mod.precio || 0), quantity: currentQty - 1 });
    }
  };

  const [clienteSearchQuery, setClienteSearchQuery] = useState('');
  const [clientesDb, setClientesDb] = useState<Cliente[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);

  const fetchClientesOptions = useCallback(async (query: string) => {
    setLoadingClientes(true);
    try {
      const response = await getClientes(1, 10, query);
      setClientesDb(response.data);
    } catch (error) {
      console.error('Error fetching clientes for modal:', error);
    } finally {
      setLoadingClientes(false);
    }
  }, []);

  useEffect(() => {
    if (clienteModalVisible) {
      fetchClientesOptions('');
    }
  }, [clienteModalVisible, fetchClientesOptions]);

  const handleClienteSearch = (text: string) => {
    setClienteSearchQuery(text);
    fetchClientesOptions(text);
  };

  const handleCreateCliente = async () => {
    if (!clienteSearchQuery.trim()) return;
    try {
      // Basic auto-create with the name or IDcliente if it's a number
      const isNumber = !isNaN(Number(clienteSearchQuery.trim()));
      const payload: Partial<Cliente> = isNumber 
        ? { IDcliente: Number(clienteSearchQuery.trim()), nombre: 'Nuevo Cliente' }
        : { nombre: clienteSearchQuery.trim() };
      
      const { createCliente } = await import('../../services/clientes.service');
      const newCliente = await createCliente(payload);
      
      setSelectedCliente(newCliente);
      setClienteModalVisible(false);
      setClienteSearchQuery('');
      Toast.show({ type: 'success', text1: 'Cliente creado y asociado' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo crear el cliente' });
    }
  };

  const renderClienteModal = () => (
    <RNModal visible={clienteModalVisible} transparent animationType="fade" onRequestClose={() => setClienteModalVisible(false)}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <TouchableOpacity style={styles.mesaModalOverlay} activeOpacity={1} onPress={() => setClienteModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.mesaModalContent, { width: 300, maxHeight: '80%' }]}>
            <View style={styles.mesaModalHeader}>
              <Text style={styles.mesaModalTitle}>Asociar Cliente</Text>
              <TouchableOpacity onPress={() => setClienteModalVisible(false)}>
                <Ionicons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color="#9ca3af" />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por ID (Ej: 1234), Nombre..."
                placeholderTextColor="#9ca3af"
                value={clienteSearchQuery}
                onChangeText={handleClienteSearch}
                keyboardType="numeric"
                autoFocus
              />
              {clienteSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => handleClienteSearch('')}>
                  <Ionicons name="close-circle" size={18} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>

            {loadingClientes ? (
              <ActivityIndicator size="small" color="#4CAF50" style={{ marginVertical: 20 }} />
            ) : (
              <ScrollView style={{ maxHeight: 250, marginTop: 10 }}>
                <TouchableOpacity
                  style={[styles.mesaOption, !selectedCliente && styles.mesaOptionActive]}
                  onPress={() => { setSelectedCliente(null); setClienteModalVisible(false); }}
                >
                  <Ionicons name="person-outline" size={20} color={!selectedCliente ? '#fff' : '#6b7280'} />
                  <Text style={[styles.mesaOptionText, !selectedCliente && styles.mesaOptionTextActive]}>Consumidor Final (Ninguno)</Text>
                </TouchableOpacity>
                
                {clientesDb.map((cliente) => (
                  <TouchableOpacity
                    key={cliente.IDcliente}
                    style={[styles.mesaOption, selectedCliente?.IDcliente === cliente.IDcliente && styles.mesaOptionActive]}
                    onPress={() => { setSelectedCliente(cliente); setClienteModalVisible(false); }}
                  >
                    <Ionicons name="person" size={20} color={selectedCliente?.IDcliente === cliente.IDcliente ? '#fff' : '#6b7280'} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <RNText style={[styles.mesaOptionText, { marginLeft: 0 }, selectedCliente?.IDcliente === cliente.IDcliente && styles.mesaOptionTextActive]}>
                        {cliente.nombre || 'Sin nombre'}
                      </RNText>
                      {(cliente.cedula || cliente.whatsapp) && (
                        <RNText style={{ fontSize: 10, color: selectedCliente?.IDcliente === cliente.IDcliente ? '#d1fae5' : '#9ca3af' }}>
                          {cliente.cedula ? `CC: ${cliente.cedula} ` : ''}{cliente.whatsapp ? `Tel: ${cliente.whatsapp}` : ''}
                        </RNText>
                      )}
                    </View>
                    <View style={{ backgroundColor: selectedCliente?.IDcliente === cliente.IDcliente ? '#fff' : '#4CAF50', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                      <Text style={{ fontSize: 10, fontWeight: 'bold', color: selectedCliente?.IDcliente === cliente.IDcliente ? '#4CAF50' : '#fff' }}>
                        {cliente.contador || 0}/10
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}

                {clienteSearchQuery.length > 0 && clientesDb.length === 0 && (
                  <TouchableOpacity
                    style={[styles.mesaOption, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1 }]}
                    onPress={handleCreateCliente}
                  >
                    <Ionicons name="add-circle" size={20} color="#3b82f6" />
                    <Text style={[styles.mesaOptionText, { color: '#3b82f6' }]}>Crear: "{clienteSearchQuery}"</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </RNModal>
  );

  const renderModifiersModal = () => {
    const selectedItem = cart.find(i => i.IDproductos === selectedCartItemId);
    
    // Filtrar los comentarios según la búsqueda
    const filteredModifiers = comentariosDb.filter(mod => 
      mod.comentarios.toLowerCase().includes(modifierSearchQuery.toLowerCase())
    );

    // Verificar si la búsqueda exacta ya existe
    const isCustomNoteUnique = modifierSearchQuery.trim().length > 0 && 
      !comentariosDb.some(mod => mod.comentarios.toLowerCase() === modifierSearchQuery.trim().toLowerCase());

    const handleAddCustomNote = () => {
      if (!selectedCartItemId || !modifierSearchQuery.trim()) return;
      
      const customNote: Comentario = {
        ID: `custom-${Date.now()}`,
        comentarios: modifierSearchQuery.trim(),
        precio: 0,
        tipo: 'Nota Personalizada'
      };
      
      handleIncrementModifier(customNote);
      setModifierSearchQuery(''); // Limpiar la búsqueda tras agregar
    };

    const bottomPadding = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 12);

    return (
      <RNModal visible={modifiersModalVisible} transparent animationType="slide" onRequestClose={() => setModifiersModalVisible(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modifiersModalOverlay}
        >
          <TouchableOpacity style={{ flex: 1, width: '100%', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setModifiersModalVisible(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.modifiersModalContent}>
              <View style={styles.modifiersModalHeader}>
              <View>
                <Text style={styles.modifiersModalTitle}>Adicionales / Notas</Text>
                <Text style={styles.modifiersModalSubtitle}>{selectedItem?.nombre} (Cant: {selectedItem?.quantity || 0})</Text>
              </View>
              <TouchableOpacity onPress={() => setModifiersModalVisible(false)} style={styles.modifiersCloseBtn}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {/* Buscador de Notas/Adicionales */}
            <View style={styles.modifierSearchBox}>
              <Ionicons name="search" size={18} color="#9ca3af" />
              <TextInput
                style={styles.modifierSearchInput}
                placeholder="Buscar o escribir nota rápida..."
                placeholderTextColor="#9ca3af"
                value={modifierSearchQuery}
                onChangeText={setModifierSearchQuery}
                returnKeyType="done"
                onSubmitEditing={isCustomNoteUnique ? handleAddCustomNote : undefined}
              />
              {modifierSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setModifierSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>

            {/* Opción para agregar Nota Personalizada Rápida */}
            {isCustomNoteUnique && (
              <TouchableOpacity style={styles.customNoteBtn} onPress={handleAddCustomNote}>
                <Ionicons name="add-circle" size={20} color="#3b82f6" />
                <Text style={styles.customNoteBtnText}>Agregar como nota: "{modifierSearchQuery.trim()}"</Text>
              </TouchableOpacity>
            )}

            <ScrollView style={styles.modifiersList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {filteredModifiers.length === 0 && !isCustomNoteUnique ? (
                <Text style={styles.emptyModifiersText}>No se encontraron resultados.</Text>
              ) : (
                filteredModifiers.map(mod => {
                  const appliedMod = selectedItem?.modifiers?.find(m => m.name === mod.comentarios);
                  const isApplied = !!appliedMod;
                  const qty = appliedMod ? appliedMod.quantity || 1 : 0;
                  const modPrice = Number(mod.precio || 0);
                  const priceStr = modPrice !== 0 ? (modPrice > 0 ? `+$${modPrice.toLocaleString()}` : `-$${Math.abs(modPrice).toLocaleString()}`) : 'Gratis';
                  
                  return (
                    <View key={mod.ID} style={[styles.modifierOption, isApplied && styles.modifierOptionActive]}>
                      <View style={styles.modifierOptionLeft}>
                        <View>
                          <Text style={[styles.modifierOptionName, isApplied && styles.modifierOptionNameActive]}>
                            {mod.comentarios}
                          </Text>
                          <Text style={[styles.modifierOptionPrice, isApplied && styles.modifierOptionPriceActive]}>
                            {priceStr} {mod.tipo && `• ${mod.tipo}`}
                          </Text>
                        </View>
                      </View>
                      
                      <View style={styles.modifierQtyControls}>
                        {isApplied ? (
                          <>
                            <TouchableOpacity onPress={() => handleDecrementModifier(mod)} style={styles.modQtyBtn}>
                              <Ionicons name="remove" size={16} color="#3b82f6" />
                            </TouchableOpacity>
                            <Text style={styles.modQtyText}>{qty}</Text>
                            <TouchableOpacity onPress={() => handleIncrementModifier(mod)} style={styles.modQtyBtn}>
                              <Ionicons name="add" size={16} color="#3b82f6" />
                            </TouchableOpacity>
                          </>
                        ) : (
                          <TouchableOpacity onPress={() => handleIncrementModifier(mod)} style={styles.modAddBtn}>
                            <Ionicons name="add" size={18} color="#fff" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
            
            <View style={[styles.modifiersModalFooter, { paddingBottom: bottomPadding }]}>
                <TouchableOpacity onPress={() => { setModifiersModalVisible(false); setModifierSearchQuery(''); }} style={styles.modalListoBtn}>
                  <Text style={styles.modalListoText}>Listo</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </RNModal>
    );
  };

  const renderProduct = ({ item }: { item: ProductItem }) => {
    const price = item.precioUnitario || item.Precio_Unitario || 0;
    return (
      <TouchableOpacity style={styles.productCard} onPress={() => addToCart(item)} activeOpacity={0.7}>
        <View style={styles.imageContainer}>
          {item.imagenUrl || item.image ? (
            <Image source={{ uri: item.imagenUrl || item.image }} style={styles.productImage} resizeMode="cover" />
          ) : (
            <View style={styles.placeholderImage}>
              <MaterialCommunityIcons name="food-fork-drink" size={24} color="#9ca3af" />
            </View>
          )}
        </View>
        <Text style={styles.productName} numberOfLines={2}>{item.nombre}</Text>
        <Text style={styles.productPrice}>${parseFloat(price.toString()).toLocaleString()}</Text>
      </TouchableOpacity>
    );
  };

  const renderCartItem = ({ item }: { item: CartItem }) => {
    const unitPrice = Number(item.precioUnitario || item.Precio_Unitario || 0);
    const modifiersTotal = (item.modifiers || []).reduce((sum, mod) => sum + (Number(mod.price) * (mod.quantity || 1)), 0);
    const totalPrice = (unitPrice * item.quantity) + modifiersTotal;

    return (
      <View style={styles.cartItemRowCompact}>
        {/* Quantity Controls (Left) */}
        <View style={styles.qtyColumnCompact}>
          <TouchableOpacity style={styles.qtyBtnCompact} onPress={() => {
            if (item.quantity === 1) handleRemoveItem(item.IDproductos);
            else decrementQuantity(item.IDproductos);
          }}>
            <Ionicons name={item.quantity === 1 ? "trash" : "remove"} size={18} color={item.quantity === 1 ? "#ef4444" : "#4b5563"} />
          </TouchableOpacity>
          <Text style={styles.qtyTextCompact}>{item.quantity}</Text>
          <TouchableOpacity style={styles.qtyBtnCompact} onPress={() => addToCart(item)}>
            <Ionicons name="add" size={18} color="#4b5563" />
          </TouchableOpacity>
        </View>

        {/* Info Column (Middle) */}
        <View style={styles.infoColumnCompact}>
          <View style={styles.infoRowTop}>
            <Text style={styles.cartItemNameCompact} numberOfLines={1}>{item.nombre}</Text>
            <Text style={styles.cartItemUnitPriceCompact}>${unitPrice.toLocaleString()}</Text>
          </View>
          
          {item.modifiers && item.modifiers.length > 0 && (
            <View style={styles.appliedModifiersContainerCompact}>
              {item.modifiers.map((mod, idx) => (
                <View key={idx} style={styles.appliedModifierChipCompact}>
                  <Text style={styles.appliedModifierTextCompact}>
                    {mod.quantity}x {mod.name} {mod.price ? (mod.price > 0 ? `(+$${mod.price})` : `(-$${Math.abs(mod.price)})`) : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity 
            style={styles.addNoteBtnCompact} 
            onPress={() => {
              setSelectedCartItemId(item.IDproductos);
              setModifiersModalVisible(true);
            }}
          >
            <Ionicons name="add-circle-outline" size={12} color="#3b82f6" />
            <Text style={styles.addNoteTextCompact}>Nota/Adicional</Text>
          </TouchableOpacity>
        </View>

        {/* Price & Delete (Right) */}
        <View style={styles.priceColumnCompact}>
          <Text style={styles.cartItemTotalCompact}>${totalPrice.toLocaleString()}</Text>
          <TouchableOpacity onPress={() => handleRemoveItem(item.IDproductos)} style={styles.deleteBtnCompact}>
            <Ionicons name="close" size={24} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderCategoryChip = (cat: string, index: number) => (
    <TouchableOpacity
      key={`${cat}-${index}`}
      style={[styles.categoryChip, activeCategory === cat && styles.categoryChipActive]}
      onPress={() => setActiveCategory(cat)}
    >
      <Text style={[styles.categoryChipText, activeCategory === cat && styles.categoryChipTextActive]}>
        {cat}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.totalContainer}>
          <Text style={styles.totalText}>TOTAL ({getTotalItems()})</Text>
        </View>
        
        {/* Botón de Comando de Voz IA */}
        <TouchableOpacity
          style={[styles.mesaButton, { 
            marginRight: 8, 
            borderColor: isRecording ? '#ef4444' : '#10b981', 
            backgroundColor: isRecording ? 'rgba(239, 68, 68, 0.8)' : (isProcessingVoice ? 'rgba(16, 185, 129, 0.5)' : 'rgba(16, 185, 129, 0.2)'),
            paddingHorizontal: 12
          }]}
          onPress={isRecording ? () => stopRecording() : startRecording}
          disabled={isProcessingVoice}
        >
          {isProcessingVoice ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name={isRecording ? "radio-button-on" : "mic"} size={20} color="#fff" />
          )}
        </TouchableOpacity>
        
        {/* Client Selection Button Relocated to Header */}
        <TouchableOpacity
          style={[styles.mesaButton, { marginRight: 8, borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.2)' }]}
          onPress={() => setClienteModalVisible(true)}
        >
          <Ionicons name="person" size={16} color="#fff" />
          <Text style={[styles.mesaButtonText, { color: '#fff' }]} numberOfLines={1} ellipsizeMode="tail">
            {selectedCliente ? (selectedCliente.nombre || selectedCliente.cedula || 'Cliente') : 'Cliente'}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.mainContent} 
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />}
      >
        <View style={styles.headerSection}>
          <View style={styles.headerTop}>
            <View style={styles.timeBox}>
              <Ionicons name="time-outline" size={16} color="#4CAF50" />
              <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity style={styles.mesaButton} onPress={() => setMesaModalVisible(true)}>
                <MaterialCommunityIcons 
                  name={selectedMesa ? "table-furniture" : "flash-outline"}
                  size={18}
                  color="#4CAF50"
                />
                <Text style={styles.mesaButtonText}>{selectedMesa?.nombre || 'V.R'}</Text>
                <Ionicons name="chevron-down" size={16} color="#4CAF50" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar productos..."
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>

          <RNModal visible={mesaModalVisible} transparent animationType="fade" onRequestClose={() => setMesaModalVisible(false)}>
            <TouchableOpacity style={styles.mesaModalOverlay} activeOpacity={1} onPress={() => setMesaModalVisible(false)}>
              <View style={styles.mesaModalContent}>
                <View style={styles.mesaModalHeader}>
                  <Text style={styles.mesaModalTitle}>Seleccionar Mesa</Text>
                  <TouchableOpacity onPress={() => setMesaModalVisible(false)}>
                    <Ionicons name="close" size={20} color="#6b7280" />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.mesaOption, !selectedMesa && styles.mesaOptionActive]}
                  onPress={() => { setSelectedMesa(null); setMesaModalVisible(false); }}
                >
                  <MaterialCommunityIcons name="flash-outline" size={20} color={!selectedMesa ? '#fff' : '#6b7280'} />
                  <Text style={[styles.mesaOptionText, !selectedMesa && styles.mesaOptionTextActive]}>Venta Rapida (V.R)</Text>
                </TouchableOpacity>
                {mesas.map((mesa) => (
                  <TouchableOpacity
                    key={mesa.IdMesas}
                    style={[styles.mesaOption, selectedMesa?.IdMesas === mesa.IdMesas && styles.mesaOptionActive]}
                    onPress={() => { setSelectedMesa(mesa); setMesaModalVisible(false); }}
                  >
                    <MaterialCommunityIcons name="table-furniture" size={20} color={selectedMesa?.IdMesas === mesa.IdMesas ? '#fff' : '#6b7280'} />
                    <RNText style={[styles.mesaOptionText, selectedMesa?.IdMesas === mesa.IdMesas && styles.mesaOptionTextActive]}>{mesa.nombre}</RNText>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </RNModal>

          {cart.length > 0 && (
            <View style={styles.cartSection}>
              <View style={styles.cartSectionHeader}>
                <View style={styles.cartSectionLeft}>
                  <View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>{getTotalItems()}</Text>
                  </View>
                  <Text style={styles.cartSectionTitle}>Mi Carrito</Text>
                </View>
                <TouchableOpacity style={styles.clearCartBtn} onPress={clearCart}>
                  <Ionicons name="trash-outline" size={14} color="#ef4444" />
                  <Text style={styles.clearCartText}>Limpiar</Text>
                </TouchableOpacity>
              </View>
              <View>
                {cart.map((item, index) => (
                  <React.Fragment key={item.IDproductos || `cart-${index}`}>
                    {renderCartItem({ item })}
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoriesScroll}
            contentContainerStyle={styles.categoriesContent}
          >
            {categories.map((cat, index) => renderCategoryChip(cat, index))}
          </ScrollView>
        </View>

        <View style={styles.productsSection}>
          <View style={styles.sectionTitle}>
            <Text style={styles.sectionTitleText}>{activeCategory}</Text>
            <Text style={styles.productCount}>{filteredProducts.length}</Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4CAF50" />
            </View>
          ) : filteredProducts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="food-off" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>Sin productos</Text>
            </View>
          ) : (
            <View style={styles.productsGrid}>
              {filteredProducts.map((item, index) => (
                <View key={item.IDproductos || `product-${index}`} style={styles.productCardWrapper}>
                  {renderProduct({ item })}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {cart.length > 0 && (
        <View style={[styles.cartBar, { paddingBottom: Platform.OS === 'ios' ? 34 : 16 }]}>
          <View style={styles.cartBarInfo}>
            <View style={styles.cartBadgeLarge}>
              <Text style={styles.cartBadgeText}>{getTotalItems()}</Text>
            </View>
            <View>
              <Text style={styles.cartBarLabel}>a cobrar</Text>
              <Text style={styles.cartBarTotal}>${useCartStore.getState().getFinalTotalPrice().toLocaleString()}</Text>
            </View>
          </View>
          <Button style={styles.checkoutButton} onPress={handleCheckout} disabled={isSubmitting}>
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.checkoutContent}>
                <Text style={styles.checkoutText}>Cobrar</Text>
                <Ionicons name="checkmark-circle" size={20} color="white" />
              </View>
            )}
          </Button>
        </View>
      )}

      <PaymentModal
        visible={paymentModalVisible}
        onClose={() => setPaymentModalVisible(false)}
        onSave={handleSavePedido}
        onCobrar={handlePaymentConfirm}
        total={useCartStore.getState().getTotalPrice()}
        isLoading={isSubmitting}
      />

      {renderClienteModal()}
      {renderModifiersModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  topBar: { backgroundColor: '#4CAF50', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  backButton: { padding: 8 },
  totalContainer: { flex: 1, marginLeft: 8 },
  totalText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  topBarBtn: { padding: 8 },
  mainContent: { flex: 1 },
  headerSection: { backgroundColor: 'white', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  timeBox: { flexDirection: 'row', alignItems: 'center' },
  timeText: { fontSize: 16, fontWeight: '700', color: '#111827', marginLeft: 6 },
  mesaButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5, borderColor: '#4CAF50', backgroundColor: 'transparent' },
  mesaButtonText: { fontSize: 13, fontWeight: '600', color: '#4CAF50', marginHorizontal: 6 },
  mesaSelector: { marginLeft: -12, marginRight: -12 },
  mesaChip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, marginLeft: 12, borderRadius: 16, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  mesaChipActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  mesaChipText: { fontSize: 12, fontWeight: '600', color: '#4CAF50', marginLeft: 4 },
  mesaChipTextActive: { color: '#fff' },
  mesaModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 100, paddingRight: 12 },
  mesaModalContent: { backgroundColor: 'white', borderRadius: 16, padding: 16, width: 200, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 },
  mesaModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  mesaModalTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  mesaOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6, backgroundColor: '#f3f4f6' },
  mesaOptionActive: { backgroundColor: '#4CAF50' },
  mesaOptionText: { fontSize: 14, fontWeight: '600', color: '#374151', marginLeft: 10 },
  mesaOptionTextActive: { color: '#fff' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#333', marginLeft: 8, height: 36 },
  categoriesScroll: { marginHorizontal: -12 },
  categoriesContent: { paddingHorizontal: 12, flexDirection: 'row' },
  categoryChip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  categoryChipActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  categoryChipText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  categoryChipTextActive: { color: '#fff' },
  cartSection: { backgroundColor: '#f0fdf4', marginBottom: 12, marginHorizontal: 2, borderRadius: 12, overflow: 'hidden', borderLeftWidth: 4, borderRightWidth: 4, borderColor: '#22c55e' },
  cartSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  cartSectionLeft: { flexDirection: 'row', alignItems: 'center' },
  cartBadge: { backgroundColor: '#4CAF50', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cartBadgeText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  cartSectionTitle: { fontSize: 16, fontWeight: '700', color: '#166534', marginLeft: 10 },
  clearCartBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fee2e2', borderRadius: 8 },
  clearCartText: { fontSize: 13, fontWeight: '600', color: '#dc2626', marginLeft: 6 },
  cartItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#d1fae5' },
  cartItemMain: { flex: 1, marginRight: 12 },
  cartItemName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  cartItemUnitPrice: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  cartItemControls: { flexDirection: 'row', alignItems: 'center' },
  qtyBtnCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center' },
  qtyTextCenter: { fontWeight: 'bold', color: '#333', paddingHorizontal: 10, fontSize: 15 },
  cartItemTotal: { fontSize: 14, fontWeight: '800', color: '#166534', marginHorizontal: 12, minWidth: 70, textAlign: 'right' },
  deleteBtn: { padding: 4 },
  productsSection: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 100 },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  sectionTitleText: { fontSize: 14, fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: 1 },
  productCount: { fontSize: 12, color: '#9ca3af' },
  loadingContainer: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
  productsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 4 },
  productCardWrapper: { width: '33.33%', paddingHorizontal: 4, marginBottom: 8 },
  productRow: { justifyContent: 'flex-start' },
  productCard: { backgroundColor: 'white', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' },
  imageContainer: { width: '100%', aspectRatio: 1, backgroundColor: '#f9fafb', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  placeholderImage: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3f4f6' },
  productImage: { width: '100%', height: '100%' },
  productName: { fontSize: 10, fontWeight: 'bold', color: '#1f2937', textAlign: 'center', marginBottom: 4 },
  productPrice: { fontSize: 12, fontWeight: '800', color: '#111827' },
  emptyContainer: { justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, color: '#9ca3af', marginTop: 12 },
  cartBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  cartBarInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cartBadgeLarge: { backgroundColor: '#4CAF50', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cartBarLabel: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase' },
  cartBarTotal: { fontSize: 20, fontWeight: '800', color: '#111827' },
  checkoutButton: { backgroundColor: '#4CAF50', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, height: 50 },
  checkoutContent: { flexDirection: 'row', alignItems: 'center' },
  checkoutText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginRight: 6 },
  
  // Compact Cart Styles
  cartItemRowCompact: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#d1fae5', backgroundColor: '#fff' },
  qtyColumnCompact: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 6, marginRight: 12, height: 38 },
  qtyBtnCompact: { padding: 4, width: 28, alignItems: 'center', justifyContent: 'center' },
  qtyTextCompact: { fontSize: 15, fontWeight: '800', color: '#111827', minWidth: 24, textAlign: 'center' },
  infoColumnCompact: { flex: 1, justifyContent: 'center' },
  infoRowTop: { flexDirection: 'column' },
  cartItemNameCompact: { fontSize: 13, fontWeight: '700', color: '#1f2937', marginBottom: 2 },
  cartItemUnitPriceCompact: { fontSize: 11, color: '#6b7280' },
  appliedModifiersContainerCompact: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, gap: 4 },
  appliedModifierChipCompact: { backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  appliedModifierTextCompact: { fontSize: 10, color: '#d97706', fontWeight: '600' },
  addNoteBtnCompact: { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingVertical: 4 },
  addNoteTextCompact: { fontSize: 11, color: '#3b82f6', fontWeight: '700', marginLeft: 4 },
  priceColumnCompact: { alignItems: 'flex-end', justifyContent: 'center', marginLeft: 8 },
  cartItemTotalCompact: { fontSize: 14, fontWeight: '800', color: '#166534', marginBottom: 8 },
  deleteBtnCompact: { padding: 8, backgroundColor: '#fee2e2', borderRadius: 8, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  // Modifier Modal Styles
  modifiersModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modifiersModalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', paddingTop: 20, paddingHorizontal: 20, paddingBottom: 0 },
  modifiersModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  modifiersModalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  modifiersModalSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  modifiersCloseBtn: { padding: 4, backgroundColor: '#f3f4f6', borderRadius: 12 },
  modifierSearchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  modifierSearchInput: { flex: 1, fontSize: 15, color: '#333', marginLeft: 8, height: 36 },
  customNoteBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', padding: 12, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#bfdbfe' },
  customNoteBtnText: { fontSize: 14, fontWeight: '700', color: '#1d4ed8', marginLeft: 8 },
  modifiersList: { marginBottom: 16 },
  emptyModifiersText: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 20 },
  modifierOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: '#f9fafb', marginBottom: 8, borderWidth: 1.5, borderColor: 'transparent' },
  modifierOptionActive: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  modifierOptionLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  modifierOptionName: { fontSize: 14, fontWeight: '600', color: '#374151' },
  modifierOptionNameActive: { color: '#1d4ed8' },
  modifierOptionPrice: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginTop: 2 },
  modifierOptionPriceActive: { color: '#2563eb' },
  modifierQtyControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', padding: 2 },
  modAddBtn: { paddingVertical: 4, paddingHorizontal: 12, backgroundColor: '#3b82f6', borderRadius: 6 },
  modQtyBtn: { padding: 4, backgroundColor: '#eff6ff', borderRadius: 6 },
  modQtyText: { fontSize: 14, fontWeight: '700', color: '#111827', minWidth: 24, textAlign: 'center', marginHorizontal: 4 },
  modifiersModalFooter: { paddingTop: 12, paddingBottom: 24, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  modalListoBtn: { backgroundColor: '#22c55e', borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center' },
  modalListoText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});

export default NewSaleScreen;
