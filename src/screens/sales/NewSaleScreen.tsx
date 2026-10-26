import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { View, TouchableOpacity, ActivityIndicator, Image, RefreshControl, Platform, TextInput, FlatList, StyleSheet, Modal as RNModal, ScrollView, Text as RNText, KeyboardAvoidingView, Keyboard, useWindowDimensions, BackHandler } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import { getProducts } from '../../services/products';
import { getMesas, Mesa } from '../../services/mesas';
import { getComentarios, Comentario } from '../../services/comentarios';
import { getClientes, Cliente } from '../../services/clientes.service';
import { createSale, addProductosToVenta, SalePayload, getSales } from '../../services/sales';
import { processVoiceOrderWithIA } from '../../services/api';
import { useSocket, useSocketEmitter, useSocketEvent } from '../../hooks';
import { useCustomAlert } from '../../context/CustomAlertContext';
import { Room, SocketEvent } from '../../types/socket.types';
import Toast from 'react-native-toast-message';
import { useProductStore } from '../../store/useProductStore';
import { useMesaStore } from '../../store/useMesaStore';
import { useSalesStore } from '../../store/useSalesStore';
import usePrinterStore from '../../store/usePrinterStore';
import { getCachedConfiguracion, getConfiguracion } from '../../services/configuracion';
import { getDomicilios, DomicilioWAItem } from '../../services/domicilios.service';
import { getGramosPapaForProduct } from '../../utils/printer';
import { Text } from '../../components/ui/text';
import { Button } from '../../components/ui/button';
import PaymentModal from '../../components/ui/PaymentModal';
import useCartStore, { CartItem } from '../../store/useCartStore';
import useAuthStore from '../../store/useAuthStore';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import { soundService } from '../../services/soundService';
import QuantityNumpad from '../../components/ui/QuantityNumpad';
import { useSettingsStore } from '../../store/useSettingsStore';

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
  mostrarDisponibilidad?: boolean;
  disponibilidadCalculada?: number;
  gramosPapa?: number;
};

const CATEGORIES_ORDER = ['LO MAS VENDIDO', 'GRANIZADOS', 'BEBIDAS', 'COMIDAS', 'COMBOS', 'OTROS'];

const Clock = React.memo(() => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    const dayName = date.toLocaleDateString('es-CO', { weekday: 'short' });
    const dateStr = date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
    const timeStr = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${dayName} ${dateStr} ${timeStr}`;
  };

  return <RNText style={styles.timeText}>{formatTime(currentTime)}</RNText>;
});

const ProductItemComponent = React.memo(({
  item,
  addToCart,
  getFullImageUrl
}: {
  item: ProductItem;
  addToCart: (item: ProductItem) => void;
  getFullImageUrl: (url?: string) => string | undefined;
}) => {
  const price = item.precioUnitario || item.Precio_Unitario || 0;
  const isZero = item.disponibilidadCalculada === 0;

  return (
    <TouchableOpacity style={styles.productCard} onPress={() => addToCart(item)} activeOpacity={0.7}>
      <View style={styles.imageContainer}>
        {item.imagenUrl || item.image ? (
          <Image source={{ uri: getFullImageUrl(item.imagenUrl || item.image) }} style={[styles.productImage, item.mostrarDisponibilidad && isZero && { opacity: 0.5 }]} resizeMode="cover" />
        ) : (
          <View style={styles.placeholderImage}>
            <Ionicons name="fast-food-outline" size={24} color="#9ca3af" />
          </View>
        )}

        {item.mostrarDisponibilidad && item.disponibilidadCalculada !== undefined && item.disponibilidadCalculada !== null && (
          <View style={{ backgroundColor: isZero ? '#ef4444' : '#3b82f6', position: 'absolute', top: 5, right: 5, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, minWidth: 24, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1 }}>
            <RNText style={{ color: 'white', fontSize: 11, fontWeight: 'bold' }}>{item.disponibilidadCalculada}</RNText>
          </View>
        )}
      </View>
      <RNText style={styles.productName} numberOfLines={2}>{item.nombre}</RNText>
      <RNText style={styles.productPrice}>${parseFloat(price.toString()).toLocaleString()}</RNText>
    </TouchableOpacity>
  );
});

const CartItemComponent = React.memo(({
  item,
  addToCart,
  decrementQuantity,
  handleRemoveItem,
  openNumpad,
  setSelectedCartItemId,
  setModifiersModalVisible
}: {
  item: CartItem;
  addToCart: (item: ProductItem | CartItem) => void;
  decrementQuantity: (id: string) => void;
  handleRemoveItem: (id: string) => void;
  openNumpad: (item: CartItem) => void;
  setSelectedCartItemId: (id: string) => void;
  setModifiersModalVisible: (val: boolean) => void;
}) => {
  const unitPrice = Number(item.precioUnitario || item.Precio_Unitario || 0);
  const modifiersTotal = Array.isArray(item.modifiers)
    ? item.modifiers.reduce((sum, mod) => sum + (Number(mod.price || 0) * (mod.quantity || 1)), 0)
    : 0;
  const totalPrice = (unitPrice * item.quantity) + modifiersTotal;

  return (
    <View style={styles.cartItemRowCompact}>
      <View style={styles.qtyColumnCompact}>
        <TouchableOpacity style={styles.qtyBtnCompact} onPress={() => {
          if (item.quantity === 1) handleRemoveItem(item.IDproductos);
          else decrementQuantity(item.IDproductos);
        }}>
          <Ionicons name={item.quantity === 1 ? "trash" : "remove"} size={18} color={item.quantity === 1 ? "#ef4444" : "#4b5563"} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => addToCart(item)}
          onLongPress={() => openNumpad(item)}
          delayLongPress={350}
          activeOpacity={0.7}
          style={styles.qtyTextTouchable}
        >
          <RNText style={styles.qtyTextCompact}>{item.quantity}</RNText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.qtyBtnCompact} onPress={() => addToCart(item)}>
          <Ionicons name="add" size={18} color="#4b5563" />
        </TouchableOpacity>
      </View>

      <View style={styles.infoColumnCompact}>
        <View style={styles.infoRowTop}>
          <RNText style={styles.cartItemNameCompact} numberOfLines={1}>{item.nombre}</RNText>
          <RNText style={styles.cartItemUnitPriceCompact}>${unitPrice.toLocaleString()}</RNText>
        </View>

        {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
          <View style={styles.appliedModifiersContainerCompact}>
            {item.modifiers.map((mod, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.appliedModifierChipCompact}
                onPress={() => {
                  setSelectedCartItemId(item.IDproductos);
                  setModifiersModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <RNText style={styles.appliedModifierTextCompact}>
                  {mod.quantity}x {mod.name} {mod.price ? (mod.price > 0 ? `(+${mod.price})` : `(-${Math.abs(mod.price)})`) : ''}
                </RNText>
              </TouchableOpacity>
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
          <RNText style={styles.addNoteTextCompact}>Nota/Adicional</RNText>
        </TouchableOpacity>
      </View>

      <View style={styles.priceColumnCompact}>
        <RNText style={styles.cartItemTotalCompact}>${totalPrice.toLocaleString()}</RNText>
        <TouchableOpacity onPress={() => handleRemoveItem(item.IDproductos)} style={styles.deleteBtnCompact}>
          <Ionicons name="close" size={24} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
});

const resolveGramosPapa = (item: any): number => {
  return getGramosPapaForProduct(item);
};

const NewSaleScreen = ({ navigation, route }: Props) => {
  const { width: windowWidth } = useWindowDimensions();
  const isMobileScreen = windowWidth < 768;
  const { primaryColor, gridColumnsWeb, gridColumnsMobile } = useSettingsStore();
  const dynamicColumns = isMobileScreen ? (gridColumnsMobile || 4) : (gridColumnsWeb || 8);

  const { joinRoom, isConnected } = useSocket();
  const { emitCustomEvent: socketEmit } = useSocketEmitter();

  const { showAlert } = useCustomAlert();
  const insets = useSafeAreaInsets();
  const cachedMesas = useMesaStore((state) => state.mesas);
  const setCachedMesas = useMesaStore((state) => state.setMesas);
  const shouldRefetchMesas = useMesaStore((state) => state.shouldRefetch);

  const [searchInsumosText, setSearchInsumosText] = useState('');
  const [selectedInsumos, setSelectedInsumos] = useState<any[]>([]);
  const [discountOptionsModalVisible, setDiscountOptionsModalVisible] = useState(false);

  const getFullImageUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('file:') || url.startsWith('content:') || url.startsWith('data:') || url.startsWith('blob:')) return url;
    const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
    return url.startsWith('/uploads') ? `${baseUrl}${url}` : url;
  };

  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [comentariosDb, setComentariosDb] = useState<Comentario[]>([]);
  const [loading, setLoading] = useState(useProductStore.getState().productos.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [mesaModalVisible, setMesaModalVisible] = useState(false);
  const [modifiersModalVisible, setModifiersModalVisible] = useState(false);
  const [clienteModalVisible, setClienteModalVisible] = useState(false);
  
  const activeTemporalIdRef = useRef<string | null>(null);
  const lastTicketDataRef = useRef<any>(null);
  const printTriggeredRef = useRef<boolean>(false);
  useSocketEvent(SocketEvent.VENTA_ID_GENERATED, useCallback((data: any) => {
    if (data && activeTemporalIdRef.current && data.temporalId === activeTemporalIdRef.current) {
       if (!printTriggeredRef.current && lastTicketDataRef.current) {
         printTriggeredRef.current = true;
         console.log('[IMPRESIÓN RÁPIDA] Ticket impreso vía socket con ID:', data.pedido);
         let cleanOrderId = data.pedido;
         if (cleanOrderId && cleanOrderId.toLowerCase().startsWith('pedido-')) {
           cleanOrderId = cleanOrderId.substring(7);
         }
         const ticketData = { ...lastTicketDataRef.current, orderId: cleanOrderId };
         const printer = usePrinterStore.getState();
         if (printer.shouldPrintComanda(ticketData.estado) || printer.shouldPrintFactura(ticketData.estado)) {
           printer.printTicket(ticketData);
         }
       }
       activeTemporalIdRef.current = null;
    }
  }, []));

  // ── Domicilios WhatsApp & Bloqueo de Ventas ──────────────────────────────
  const [recentDomis, setRecentDomis] = useState<DomicilioWAItem[]>([]);
  const [isSalesBlocked, setIsSalesBlocked] = useState(false);
  const [desatendidosCount, setDesatendidosCount] = useState(0);
  const [configNegocio, setConfigNegocio] = useState<any>(null);

  const storeCategorias = useProductStore((state) => state.categorias);
  const isComidaLocal = useMemo(() => {
    return (storeCategorias || []).some((c) =>
      /hamburguesa|alitas|salchipapa|carne|perro|sandwich|sanduche|fundido|queso|parrilla|asado|costilla|platos|cocina/i.test(c || '')
    );
  }, [storeCategorias]);

  const pedidoTieneComida = useCallback((dom: DomicilioWAItem): boolean => {
    const FOOD_REGEX =
      /\b(hamburguesa|hamburguesas|burger|burgers|alita|alitas|wings|perro|perros|hot\s*dog|hotdogs|choriperro|choriperros|chorizo|chorizos|salchipapa|salchipapas|sandwich|sandwiches|sanduche|sanduches|sánduche|sánduches|sándwich|sándwiches|carne|carnes|asado|asados|costilla|costillas|parrilla|porcion|porción|papas|papa\s*francesa|papas\s*francesas|francesa|rustica|rústica|desgranado|desgranados|patacon|patacón|patacones|arepa|arepas|taco|tacos|burrito|burritos|quesadilla|quesadillas|mazorca|mazorcas|pincho|pinchos|crispy|parcera|fogata|combo|pollo|pechuga|nugget|nuggets|fundido|fundidos)\b/i;

    const checkName = (name?: string): boolean => {
      if (!name || typeof name !== 'string') return false;
      return FOOD_REGEX.test(name.trim());
    };

    if (Array.isArray(dom.itemsMapeados) && dom.itemsMapeados.length > 0) {
      for (const it of dom.itemsMapeados as any[]) {
        if (checkName(it.nombre || it.name)) return true;
      }
    }

    if (Array.isArray(dom.itemsExternos) && dom.itemsExternos.length > 0) {
      for (const it of dom.itemsExternos as any[]) {
        if (checkName(it.nombre || it.name || it.observacion)) return true;
      }
    }

    if (dom.detalleTextoWA && typeof dom.detalleTextoWA === 'string') {
      if (FOOD_REGEX.test(dom.detalleTextoWA)) return true;
    }

    return false;
  }, []);

  const loadDomiciliosBloqueo = useCallback(async () => {
    try {
      const cfgRes = await getConfiguracion();
      const cfg = (cfgRes as any)?.data || cfgRes;
      setConfigNegocio(cfg);

      if (cfg?.domisHabilitado && cfg?.domisBloqueoVentas) {
        const domis = await getDomicilios('RECIENTE');
        if (Array.isArray(domis)) {
          const filtered = isComidaLocal ? domis.filter((d) => pedidoTieneComida(d)) : domis;
          setRecentDomis(filtered);
        }
      } else {
        setRecentDomis([]);
        setIsSalesBlocked(false);
        setDesatendidosCount(0);
      }
    } catch (e) {
      console.error('Error loading domicilios bloqueo:', e);
    }
  }, [isComidaLocal, pedidoTieneComida]);

  // Carga inicial y al enfocar la pantalla (sin bucles de dependencias)
  useFocusEffect(
    useCallback(() => {
      loadDomiciliosBloqueo();
    }, [loadDomiciliosBloqueo])
  );

  // Ticker local (en memoria) cada 4 segundos: evalúa si algún pedido superó el tiempo límite.
  // NO hace llamadas de red para no provocar bucles de peticiones ni saturar el servidor (Error 429).
  useEffect(() => {
    const cfg = configNegocio || getCachedConfiguracion()?.data || getCachedConfiguracion();
    if (!cfg?.domisHabilitado || !cfg?.domisBloqueoVentas) {
      setIsSalesBlocked(false);
      setDesatendidosCount(0);
      return;
    }

    const checkOverdues = () => {
      const timeoutMs = (Number(cfg.domisTimeoutMinutos) || 10) * 60 * 1000;
      const now = Date.now();
      const overdues = recentDomis.filter((d) => {
        if (d.estado !== 'RECIENTE') return false;
        if (isComidaLocal && !pedidoTieneComida(d)) return false;
        const created = new Date(d.timestampPedido || d.createdAt).getTime();
        return now - created >= timeoutMs;
      });
      setDesatendidosCount(overdues.length);
      setIsSalesBlocked(overdues.length > 0);
    };

    checkOverdues();
    const interval = setInterval(checkOverdues, 4000);

    return () => clearInterval(interval);
  }, [configNegocio, recentDomis, isComidaLocal, pedidoTieneComida]);

  useSocketEvent<DomicilioWAItem>(SocketEvent.NUEVO_DOMICILIO, (nuevoDom) => {
    if (!nuevoDom) return;
    if (isComidaLocal && !pedidoTieneComida(nuevoDom)) return;
    if (configNegocio?.domisAlertaSonora) {
      soundService.playDeliveryAlert();
    }
    setRecentDomis((prev) => [nuevoDom, ...prev.filter((d) => d.IDdomicilio !== nuevoDom.IDdomicilio)]);
  });

  useSocketEvent<DomicilioWAItem>(SocketEvent.DOMICILIO_ACTUALIZADO, (domActualizado) => {
    if (!domActualizado) return;
    setRecentDomis((prev) => {
      if (domActualizado.estado !== 'RECIENTE' || (isComidaLocal && !pedidoTieneComida(domActualizado))) {
        return prev.filter((d) => d.IDdomicilio !== domActualizado.IDdomicilio);
      }
      return prev.map((d) => (d.IDdomicilio === domActualizado.IDdomicilio ? { ...d, ...domActualizado } : d));
    });
  });

  useSocketEvent<DomicilioWAItem>(SocketEvent.DOMICILIO_TIMEOUT, (domTimeout) => {
    if (!domTimeout) return;
    if (isComidaLocal && !pedidoTieneComida(domTimeout)) return;
    if (configNegocio?.domisAlertaSonora) {
      soundService.playDeliveryAlert();
    }
    Toast.show({
      type: 'error',
      text1: '⏰ ¡Domicilio sin atender!',
      text2: `Pedido #${domTimeout.orderIdWA || ''} superó el tiempo límite.`,
      position: 'top',
      visibilityTime: 8000,
    });
  });

  const [mesaSearchQuery, setMesaSearchQuery] = useState('');
  const [mesaNota, setMesaNota] = useState('');
  
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

  const { handleScroll } = useScrollDirection();

  const cachedProductos = useProductStore((state) => state.productos);
  const shouldRefetchProducts = useProductStore((state) => state.shouldRefetch);

  const cart = useCartStore((state) => state.cart);
  const cartStartTime = useCartStore((state) => state.cartStartTime);
  const reservasGlobales = useProductStore((state) => state.reservasGlobales);
  const editingSaleId = useCartStore((state) => state.editingSaleId);
  const editingVenta = useCartStore((state) => state.editingVenta);
  const storeAddToCart = useCartStore((state) => state.addToCart);
  const addToCart = React.useCallback((item: any) => {
    storeAddToCart(item);
    soundService.playBeep();
  }, [storeAddToCart]);
  const decrementQuantity = useCartStore((state) => state.decrementQuantity);
  const removeFromCart = useCartStore((state) => state.removeFromCart);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const clearCart = useCartStore((state) => state.clearCart);
  const getTotalItems = useCartStore((state) => state.getTotalItems);
  const getTotalPrice = useCartStore((state) => state.getTotalPrice);
  const getNewProductsOnly = useCartStore((state) => state.getNewProductsOnly);

  const isEditing = editingSaleId !== null;
  const saleIdFromRoute = route?.params?.saleId;

  // ── Verificación inteligente de mesa ocupada (solo pedidos ABIERTOS y PENDIENTES DE PAGO) ──
  const isMesaOccupied = useCallback(
    (targetId?: string, targetName?: string): boolean => {
      if (!targetName && !targetId) return false;
      const activeVentas = useSalesStore.getState().ventas;
      const clean = (s?: string) => (s || '').replace(/\s+/g, '').toLowerCase();
      const targetNameClean = clean(targetName);

      return (Array.isArray(activeVentas) ? activeVentas : []).some((v) => {
        // 1. Verificar si coincide con la mesa (por ID o por Nombre)
        const vMesaClean = clean(typeof v.mesa === 'string' ? v.mesa : '');
        const matches =
          (targetId && v.mesa === targetId) ||
          (targetName && v.mesa === targetName) ||
          (targetNameClean && vMesaClean === targetNameClean) ||
          (targetNameClean && vMesaClean === `mesa${targetNameClean}`) ||
          (targetNameClean && `mesa${vMesaClean}` === targetNameClean);
        if (!matches) return false;

        // 2. Si estamos editando este mismo pedido, no cuenta como conflicto
        if (editingVenta) {
          const editId = (editingVenta as any).IDventas || (editingVenta as any).id;
          const editPedido = (editingVenta as any).pedido;
          if (editId && (v.IDventas === editId || v.id === editId)) return false;
          if (editPedido && v.pedido === editPedido) return false;
        }

        // 3. Ventas canceladas o anuladas nunca ocupan mesa
        const est = (v.estado || '').toUpperCase();
        if (est === 'CANCELADO' || est === 'ANULADO') return false;

        // 4. Si la venta ya está cobrada/pagada (PAGADO o medio de pago asignado diferente a PENDIENTE), la mesa está LIBERADA
        const isPaid = est === 'PAGADO' || (!!v.medioDePago && v.medioDePago !== 'PENDIENTE');
        if (isPaid) return false;

        // 5. Si ya fue despejada, no ocupa mesa
        if (v.despejadoAt != null) return false;

        // 6. Ignorar pedidos antiguos de días anteriores (> 24 horas)
        const fechaStr = v.fechaYHora || v.fecha;
        if (fechaStr) {
          const diffHours = (Date.now() - new Date(fechaStr).getTime()) / 3600000;
          if (diffHours > 24) return false;
        }

        // 7. Únicamente pedidos ABIERTOS y PENDIENTES DE PAGO ocupan la mesa
        const openUnpaidStates = ['TOMADO', 'PREPARANDO', 'LISTO_PARA_ENTREGA', 'EN_EL_CARRITO', 'ENTREGADO', 'DEUDOR'];
        return openUnpaidStates.includes(est);
      });
    },
    [editingVenta]
  );

  // ── Quantity Numpad state ────────────────────────────────────────────────
  const [numpadVisible, setNumpadVisible] = useState(false);
  const [numpadItem, setNumpadItem] = useState<CartItem | null>(null);

  const openNumpad = (item: CartItem) => {
    setNumpadItem(item);
    setNumpadVisible(true);
  };

  const handleNumpadConfirm = (quantity: number) => {
    if (!numpadItem) return;
    setQuantity(numpadItem.IDproductos, quantity);
    setNumpadVisible(false);
    setNumpadItem(null);
  };
  // ────────────────────────────────────────────────────────────────────────
  
  // ── Sockets & Reservas Inventario ───────────────────────────────────────
  const prevReservedItems = useRef<Set<string>>(new Set());

  // Liberar al salir de la pantalla y escuchar expiraciones
  useEffect(() => {
    const handleExpiracion = () => clearCart();
    
    let sub: any;
    try {
      const { DeviceEventEmitter } = require('react-native');
      sub = DeviceEventEmitter.addListener('on_reserva_expirada', handleExpiracion);
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('on_reserva_expirada', handleExpiracion);
      }
    } catch (e) {}

    return () => {
      if (sub) sub.remove();
      try {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('on_reserva_expirada', handleExpiracion);
        }
      } catch (e) {}
      socketEmit('liberar_reservas', {});
    };
  }, [clearCart, socketEmit]);

  // Sincronizar carrito con backend
  useEffect(() => {
    if (!isConnected || isSubmitting) return; // FIX: Pausar liberación de reservas mientras se procesa la venta
    
    const currentReserved = new Map<string, number>();
    cart.forEach(item => {
      if (item.mostrarDisponibilidad === true || item.mostrarDisponibilidad === 1 || item.mostrarDisponibilidad === '1' || item.mostrarDisponibilidad === 'true') {
        currentReserved.set(item.IDproductos, item.quantity);
      }
    });

    prevReservedItems.current.forEach(prodId => {
      if (!currentReserved.has(prodId)) {
        socketEmit('reservar_producto', { productoId: prodId, cantidad: 0 });
      }
    });

    currentReserved.forEach((cantidad, prodId) => {
      socketEmit('reservar_producto', { productoId: prodId, cantidad });
    });

    prevReservedItems.current = new Set(currentReserved.keys());
  }, [cart, isConnected, socketEmit, isSubmitting]);

  const [tiempoReservaMinutos, setTiempoReservaMinutos] = useState(5);

  useEffect(() => {
    import('../../services/configuracion').then(({ getConfiguracion }) => {
      getConfiguracion().then((res: any) => {
        const config = res?.data || res;
        if (config?.tiempoReservaInventario) setTiempoReservaMinutos(config.tiempoReservaInventario);
      }).catch(() => {});
    }).catch(() => {});
  }, []);

  const hasReservedItems = useMemo(() => cart.some(item => 
    item.mostrarDisponibilidad === true || item.mostrarDisponibilidad === 1 || String(item.mostrarDisponibilidad) === 'true' || String(item.mostrarDisponibilidad) === '1'
  ), [cart]);

  const [timeLeftStr, setTimeLeftStr] = useState('');

  useEffect(() => {
    if (!hasReservedItems || !cartStartTime) {
      setTimeLeftStr('');
      return;
    }
    
    const updateTime = () => {
      const start = new Date(cartStartTime).getTime();
      const expire = start + tiempoReservaMinutos * 60 * 1000;
      const now = Date.now();
      const left = expire - now;
      if (left <= 0) {
        setTimeLeftStr('¡Expirado!');
      } else {
        const m = Math.floor(left / 60000);
        const s = Math.floor((left % 60000) / 1000);
        setTimeLeftStr(`${m}:${s.toString().padStart(2, '0')}`);
      }
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [hasReservedItems, cartStartTime, tiempoReservaMinutos]);
  // ────────────────────────────────────────────────────────────────────────

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

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      const editingSale = useCartStore.getState().editingSaleId;
      if (editingSale) {
        navigation.navigate('Main', { screen: 'Pedidos' } as any);
      } else {
        navigation.navigate('Main', { screen: 'Inicio' } as any);
      }
    }
  }, [navigation]);

  useEffect(() => {
    const onBackPress = () => {
      handleBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [handleBack]);

  const fetchData = useCallback(async () => {
    try {
      const hasCachedProducts = useProductStore.getState().productos.length > 0;
      if (!hasCachedProducts) {
        setLoading(true);
      }
      console.log('[NewSaleScreen] Fetching data...');
      
      const promises: Promise<any>[] = [];
      let productsPromiseIndex = -1;
      let mesasPromiseIndex = -1;
      let comentariosPromiseIndex = -1;

      // Only fetch products if needed
      if (shouldRefetchProducts() || !hasCachedProducts) {
        productsPromiseIndex = promises.length;
        promises.push(getProducts({ limit: 1500 }));
      }
      
      // Only fetch mesas if needed
      if (shouldRefetchMesas() || useMesaStore.getState().mesas.length === 0) {
        mesasPromiseIndex = promises.length;
        promises.push(getMesas());
      }
      
      comentariosPromiseIndex = promises.length;
      promises.push(getComentarios());
      
      // Fetch active sales to know which mesas are occupied
      promises.push(getSales({ limit: 300 }).then(res => {
        const data = res?.data || res;
        if (Array.isArray(data)) {
          useSalesStore.getState().setVentas(data);
        }
      }).catch(err => console.log('Error fetching active sales for mesas', err)));

      const results = await Promise.all(promises);

      if (productsPromiseIndex !== -1) {
        const productsRes = results[productsPromiseIndex];
        const productsData = productsRes?.data || productsRes;
        console.log('[NewSaleScreen] Fetched Products:', Array.isArray(productsData) ? productsData.length : 0);
        if (Array.isArray(productsData) && productsData.length > 0) {
          useProductStore.getState().setProductos(productsData);
        }
      }

      if (mesasPromiseIndex !== -1) {
        const mesasData = results[mesasPromiseIndex];
        console.log('[NewSaleScreen] Fetched Mesas:', Array.isArray(mesasData) ? mesasData.length : 0);
        const mesasArray = Array.isArray(mesasData) ? mesasData : [];
        setMesas(mesasArray);
        setCachedMesas(mesasArray);
      }

      const comentariosData = results[comentariosPromiseIndex];
      setComentariosDb(Array.isArray(comentariosData) ? comentariosData : []);

    } catch (error: any) {
      console.error('[NewSaleScreen] Error fetching data:', error?.message || error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setCachedMesas, shouldRefetchProducts, shouldRefetchMesas]);

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

  useEffect(() => {
    if (editingVenta && editingVenta.mesa && editingVenta.mesa !== 'V.R') {
      const foundMesa = mesas.find(m => m.IdMesas === editingVenta.mesa || m.nombre === editingVenta.mesa);
      if (foundMesa) {
        if (!selectedMesa || (selectedMesa.IdMesas === editingVenta.mesa && selectedMesa.nombre === editingVenta.mesa && foundMesa.nombre !== editingVenta.mesa)) {
          setSelectedMesa(foundMesa);
        }
      } else if (!selectedMesa) {
        // Fallback en caso de que la mesa no se encuentre en la lista (ej. DOMICILIO WA o lista vacía)
        setSelectedMesa({ IdMesas: editingVenta.mesa, nombre: editingVenta.mesa });
      }
    }
  }, [editingVenta, mesas, selectedMesa]);

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

  const handleRefreshData = useCallback(() => {
    console.log('[NewSaleScreen] Refreshing data via socket event');
    // Clear cache timestamp just in case, though SocketContext also does it
    useProductStore.getState().clearCache();
    fetchData();
  }, [fetchData]);

  useSocketEvent('refreshProductos', handleRefreshData, [handleRefreshData]);
  useSocketEvent('refreshInsumos', handleRefreshData, [handleRefreshData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const categories = useMemo(() => {
    const cats = ['LO MAS VENDIDO'];
    const visibleProductos = cachedProductos.filter(p => !p.mostrar || String(p.mostrar).toLowerCase().trim() === 'si' || String(p.mostrar).toLowerCase().trim() === 'visible' || String(p.mostrar).trim() === 'true');
    visibleProductos.forEach(p => {
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
    // Only show visible products
    let filtered = cachedProductos.filter(p => !p.mostrar || String(p.mostrar).toLowerCase().trim() === 'si' || String(p.mostrar).toLowerCase().trim() === 'visible' || String(p.mostrar).trim() === 'true');

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.nombre?.toLowerCase().includes(query)
      );
    } else if (activeCategory === 'LO MAS VENDIDO') {
      const explicitProducts = filtered.filter(p => (p.categoriaNombre || p.categoria) === 'LO MAS VENDIDO');
      if (explicitProducts.length > 0) {
        filtered = explicitProducts;
      } else {
        // Fallback: Show all visible products sorted by orden, take first 10
        filtered = [...filtered]
          .sort((a: any, b: any) => (a.orden ?? 999) - (b.orden ?? 999))
          .slice(0, 10);
      }
    } else if (activeCategory) {
      filtered = filtered.filter(p =>
        (p.categoriaNombre || p.categoria) === activeCategory
      );
    }

    // Calcular insumos reservados a nivel global
    const insumosReservadosGlobales: Record<string, number> = {};
    cachedProductos.forEach(p => {
      const reservado = reservasGlobales[p.IDproductos] || 0;
      if (reservado > 0 && p.insumosRequeridos && p.insumosRequeridos.length > 0) {
        p.insumosRequeridos.forEach((ins: any) => {
          insumosReservadosGlobales[ins.IDinsumo] = (insumosReservadosGlobales[ins.IDinsumo] || 0) + (ins.cantidad * reservado);
        });
      }
    });

    // Calcular disponibilidad real
    return filtered.map(p => {
      if (p.mostrarDisponibilidad === true || p.mostrarDisponibilidad === 1 || String(p.mostrarDisponibilidad) === 'true' || String(p.mostrarDisponibilidad) === '1') {
        let maxPossible = Number(p.disponibilidadCalculada ?? p.cantidad ?? p.Stock ?? 0);
        
        if (p.insumosRequeridos && p.insumosRequeridos.length > 0) {
          // Si el producto depende de insumos, su disponibilidad es el cuello de botella de sus insumos restantes
          maxPossible = Infinity;
          let countValidInsumos = 0;
          p.insumosRequeridos.forEach((ins: any) => {
            if (ins.descontarCantDeVentas === false || String(ins.descontarCantDeVentas).toLowerCase() === 'no') return;
            countValidInsumos++;
            const stockRestante = Math.max(0, ins.stockGlobal - (insumosReservadosGlobales[ins.IDinsumo] || 0));
            const cantRequerida = ins.cantidad;
            if (cantRequerida > 0) {
              const possible = Math.floor(stockRestante / cantRequerida);
              if (possible < maxPossible) maxPossible = possible;
            }
          });
          if (maxPossible === Infinity || countValidInsumos === 0) {
            maxPossible = Number(p.disponibilidadCalculada ?? p.cantidad ?? p.Stock ?? 0);
          }
        } else {
          // Si no tiene insumos, su disponibilidad es simplemente su stock menos sus reservas
          const reservado = reservasGlobales[p.IDproductos] || 0;
          maxPossible = Math.max(0, maxPossible - reservado);
        }

        return {
          ...p,
          disponibilidadCalculada: maxPossible,
        };
      }
      return p;
    });
  }, [cachedProductos, searchQuery, activeCategory, reservasGlobales]);

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
          isMeteringEnabled: true,
          android: {
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 16000, // Reduced from 44.1kHz to 16kHz for smaller file size (still perfectly fine for voice)
            numberOfChannels: 1,
            bitRate: 32000, // Reduced from 128kbps to 32kbps
          },
          ios: {
            extension: '.m4a',
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
            audioQuality: Audio.IOSAudioQuality.LOW,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 32000,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
          web: {
            mimeType: 'audio/webm',
            bitsPerSecond: 32000,
          },
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
        showAlert({ type: 'warning', title: 'Permiso Denegado', message: 'Debes otorgar permisos de micrófono para usar esta función.' });
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
        if (Platform.OS === 'web') {
          try {
            const blobResponse = await fetch(uri);
            const blob = await blobResponse.blob();
            formData.append('audio', blob, 'audio.webm');
          } catch (fetchErr) {
            console.error('Error fetching blob from uri on web', fetchErr);
            throw new Error('Error procesando el audio en la web.');
          }
        } else {
          const fileExt = uri.split('.').pop() || 'm4a';
          formData.append('audio', {
            uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
            name: `audio.${fileExt}`,
            type: `audio/${fileExt === 'm4a' ? 'mp4' : 'wav'}`,
          } as any);
        }

        const response = await processVoiceOrderWithIA(formData);
        
        if (response && response.data) {
          if (response.data.mesaId) {
            const foundMesa = mesas.find(m => m.IdMesas === response.data.mesaId);
            if (foundMesa) {
              setSelectedMesa(foundMesa);
              Toast.show({
                type: 'info',
                text1: 'Mesa Seleccionada',
                text2: `La IA seleccionó: ${foundMesa.nombre}`,
                position: 'top',
              });
            }
          }

          if (response.data.items && response.data.items.length > 0) {
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
        }
        } // Cierra el if (response && response.data)
        
        if (!response?.data?.items?.length && !response?.data?.mesaId) {
          Toast.show({
            type: 'error',
            text1: 'Atención',
            text2: 'No se reconoció ningún pedido o mesa válida en el audio.',
            position: 'top',
          });
        }
      }
    } catch (err: any) {
      console.error('Error procesando audio', err);
      const errorMsg = typeof err === 'string' ? err : (err?.message || 'Hubo un problema al procesar el audio.');
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: errorMsg,
        position: 'top',
      });
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const handleCheckout = async () => {
    if (isSalesBlocked) {
      Toast.show({
        type: 'error',
        text1: '⛔ Ventas Bloqueadas',
        text2: `Tienes ${desatendidosCount} domicilio(s) sin atender en la pestaña DOMIS`,
        position: 'top',
        visibilityTime: 4000,
      });
      return;
    }
    if (cart.length === 0) return;
    Keyboard.dismiss();
    setTimeout(() => {
      setPaymentModalVisible(true);
    }, 150);
  };

  const handlePaymentConfirm = async (paymentData: {
    medioDePago: string;
    banco?: string | null;
    efectivoRecibido?: number;
    devueltas?: number;
    transferencia?: number;
    estado: string;
    propina?: number;
    porcentajePropina?: string;
    totalInput?: number;
    abono?: number;
  }) => {
    if (isSubmitting) return; // FIX: Prevent double submission
    setIsSubmitting(true);
    try {
      const { discountPercent } = useCartStore.getState();
      const recalcularTotal = cart.reduce((sum, item) => {
        let p = Number(item.precioUnitario || item.Precio_Unitario);
        if (isNaN(p)) p = 0;
        let c = Number(item.quantity);
        if (isNaN(c)) c = 1;
        let modSum = 0;
        if (item.modifiers && Array.isArray(item.modifiers)) {
          modSum = item.modifiers.reduce((acc, m) => {
            let mp = Number(m.price);
            if (isNaN(mp)) mp = 0;
            let mq = Number(m.quantity);
            if (isNaN(mq)) mq = 1;
            return acc + (mp * mq);
          }, 0);
        }
        return sum + (p * c) + modSum;
      }, 0);
      const exactDiscount = recalcularTotal * (discountPercent || 0);
      const descuento = Math.floor(exactDiscount / 1000) * 1000;
      const finalTotal = recalcularTotal - descuento;
      const mesaValue = selectedMesa?.IdMesas || 'V.R';

      if (isEditing && editingSaleId) {
        const payload: SalePayload = {
          venta: {
            mesa: mesaValue,
            estado: paymentData.estado,
            medioDePago: paymentData.medioDePago,
            efectivoRecibido: paymentData.efectivoRecibido || paymentData.totalInput || finalTotal,
            devueltas: paymentData.devueltas || 0,
            banco: paymentData.medioDePago === 'EFECTIVO' ? null : paymentData.banco,
            valorDeTransferencia: paymentData.transferencia,
            totalInput: paymentData.totalInput || finalTotal,
            descuento: descuento,
            porcentajeDeDescuento: discountPercent.toString(),
            propina: paymentData.propina,
            porcentajePropina: paymentData.porcentajePropina,
            clienteId: selectedCliente ? selectedCliente.IDcliente : undefined,
            abono: paymentData.abono,
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
            estado: paymentData.estado === 'ENTREGADO' ? 'LISTO' : 'PREPARANDO',
            imagenUrl: item.imagenUrl || item.image,
            comentarios: item.modifiers?.length ? JSON.stringify(item.modifiers) : undefined,
            seccionCocinaId: item.seccionCocinaId || item.categoriaSeccionCocinaId || (item as any).producto?.seccionCocinaId || (item as any).producto?.categoria?.seccionCocinaId || (item as any).producto?.categoriaRelacion?.seccionCocinaId || (item as any).producto?.categoriaSeccionCocinaId || null,
          })),
        };

        setPaymentModalVisible(false);
        clearCart();
        setSelectedMesa(null);

        
        // IMPRESIÓN OPTIMISTA PARA VENTA EXISTENTE
        const finalMethod = payload.venta.medioDePago;
        const printStore = usePrinterStore.getState();

        const mesaNombre = selectedMesa?.nombre || selectedMesa?.IdMesas || (mesaValue !== 'V.R' && mesaValue !== 'CAJA' ? mesaValue : 'V.R');
        let cleanOrderId = editingVenta?.pedido;
        if (cleanOrderId && cleanOrderId.toLowerCase().startsWith('pedido-')) {
          cleanOrderId = cleanOrderId.substring(7);
        }
        if (cleanOrderId && mesaNombre) {
          const partes = cleanOrderId.split('-');
          if (partes.length >= 2) {
            partes[0] = mesaNombre;
            cleanOrderId = partes.join('-');
          }
        }
        if (!cleanOrderId || /^[a-z0-9]{25}$/i.test(cleanOrderId)) {
          cleanOrderId = `${mesaNombre}-C-001`;
        }

        const mesaAnterior = editingVenta?.mesa || (editingVenta?.pedido ? editingVenta.pedido.split('-')[0] : '');
        const mesaAnteriorNorm = String(mesaAnterior || '').trim().toUpperCase();
        const selectedIdNorm = String(selectedMesa?.IdMesas || '').trim().toUpperCase();
        const selectedNombreNorm = String(selectedMesa?.nombre || '').trim().toUpperCase();
        const mesaNombreNorm = String(mesaNombre || '').trim().toUpperCase();
        const isSameMesa =
          !mesaAnteriorNorm ||
          mesaNombreNorm === mesaAnteriorNorm ||
          (selectedIdNorm && selectedIdNorm === mesaAnteriorNorm) ||
          (selectedNombreNorm && selectedNombreNorm === mesaAnteriorNorm);
        const mesaCambio = !isSameMesa;

        if (printStore.shouldPrintComanda(paymentData.estado) || printStore.shouldPrintFactura(paymentData.estado)) {
          let nuevosProductos: any[] = [];
          let productosAnteriores: any[] = [];
          
          let yaEstuvoEnCocina = false;
          if (isEditing && editingVenta) {
             yaEstuvoEnCocina = Boolean(
               editingVenta.comandaImpresa ||
               editingVenta.cocinaInicioAt || 
               editingVenta.comandaImpresaAt || 
               editingVenta._isDomicilioWA ||
               (Array.isArray(editingVenta.ordenVentas) && editingVenta.ordenVentas.some((ov: any) => ov.comandaImpresa)) ||
               (Array.isArray(editingVenta.registroDeTiempo) && editingVenta.registroDeTiempo.some((r: any) => ['TOMADO', 'PREPARANDO', 'PAGADO', 'ENTREGADO', 'LISTO_PARA_ENTREGA'].includes((r.estado || '').toUpperCase()))) ||
               (editingVenta.estado && editingVenta.estado !== 'EN_EL_CARRITO')
             );

             const normalizeName = (name?: string) => (name || '').trim().toLowerCase();
             const originalEntries = (editingVenta.ordenVentas || []).map((ov: any) => ({
               id: String(ov.producto?.IDproductos || ov.productoId || ov.IDproductos || ov.IDorderventas || '').trim(),
               normName: normalizeName(ov.nombre || ov.nombreProducto || ov.producto?.nombre),
               qty: !yaEstuvoEnCocina ? 0 : (Number(ov.cantidad) || 1),
               prep: Number(ov.cantidadPreparada) || 0,
             }));

             payload.productos.forEach(item => {
               const id = String(item.productoId || '').trim();
               const normName = normalizeName(item.nombre || item.nombreProducto);

               let originalQty = 0;
               let preparadaQty = 0;

               originalEntries.forEach((entry: any) => {
                 const matchById = Boolean(id && entry.id && id === entry.id);
                 const matchByName = Boolean(normName && entry.normName && normName === entry.normName);
                 if (matchById || matchByName) {
                   originalQty += entry.qty;
                   preparadaQty += entry.prep;
                   entry.qty = 0;
                   entry.prep = 0;
                 }
               });

               const newQty = item.cantidad - originalQty;

               if (newQty > 0) {
                 nuevosProductos.push({
                   cantidad: newQty,
                   nombre: item.nombre,
                   precioUnitario: item.precio,
                   subtotal: item.precio * newQty,
                   modifiers: item.comentarios ? JSON.parse(item.comentarios) : undefined,
                   seccionCocinaId: item.seccionCocinaId || item.categoriaSeccionCocinaId || (item as any).producto?.seccionCocinaId || (item as any).producto?.categoria?.seccionCocinaId || (item as any).producto?.categoriaRelacion?.seccionCocinaId || (item as any).producto?.categoriaSeccionCocinaId || null,
                   gramosPapa: resolveGramosPapa(item),
                 });
               }

               if (originalQty > 0) {
                 const prevQty = Math.min(originalQty, item.cantidad);
                 productosAnteriores.push({
                   cantidad: prevQty,
                   nombre: item.nombre,
                   precioUnitario: item.precio,
                   subtotal: item.precio * prevQty,
                   modifiers: item.comentarios ? JSON.parse(item.comentarios) : undefined,
                   cantidadPreparada: preparadaQty,
                   seccionCocinaId: item.seccionCocinaId || item.categoriaSeccionCocinaId || (item as any).producto?.seccionCocinaId || (item as any).producto?.categoria?.seccionCocinaId || (item as any).producto?.categoriaRelacion?.seccionCocinaId || (item as any).producto?.categoriaSeccionCocinaId || null,
                   gramosPapa: resolveGramosPapa(item),
                 });
               }
             });
          } else {
             nuevosProductos = payload.productos.map(item => ({
               cantidad: item.cantidad,
               nombre: item.nombre,
               precioUnitario: item.precio,
               subtotal: item.precioTotal,
               modifiers: item.comentarios ? JSON.parse(item.comentarios) : undefined,
               seccionCocinaId: item.seccionCocinaId || item.categoriaSeccionCocinaId || (item as any).producto?.seccionCocinaId || (item as any).producto?.categoria?.seccionCocinaId || (item as any).producto?.categoriaRelacion?.seccionCocinaId || (item as any).producto?.categoriaSeccionCocinaId || null,
               gramosPapa: resolveGramosPapa(item),
             }));
          }

          const ticketData: any = {
            orderId: cleanOrderId,
            fecha: new Date().toLocaleString('es-CO'),
            cliente: selectedCliente?.nombre || editingVenta?.cliente,
            telefono: selectedCliente?.whatsapp || (selectedCliente as any)?.telefono || (editingVenta?.numeroTelefono ? String(editingVenta.numeroTelefono) : undefined),
            direccion: (selectedCliente as any)?.direccion || editingVenta?.direccion,
            observaciones: mesaNota || editingVenta?.notas,
            total: payload.venta.totalInput,
            totalGlobal: recalcularTotal,
            descuento: descuento,
            productos: nuevosProductos,
            productosAnteriores: productosAnteriores,
            estado: paymentData.estado,
            metodoPago: finalMethod,
            efectivoRecibido: payload.venta.efectivoRecibido,
            devueltas: payload.venta.devueltas,
            abono: paymentData.abono,
            vendedor: useAuthStore.getState().user?.nombre || 'Caja',
            porcentajeMermaPapa: getCachedConfiguracion()?.data?.porcentajeMermaPapa ?? getCachedConfiguracion()?.porcentajeMermaPapa ?? 10
          };

          if (nuevosProductos.length === 0) {
            ticketData.suppressComanda = true;
            ticketData.forceComanda = false;
            ticketData.isAdicion = false;
          } else if (mesaCambio) {
            // Si la mesa cambió y hay productos por comandar, cocina necesita la comanda completa con la nueva mesa
            ticketData.forceComanda = true;
            ticketData.suppressComanda = false;
            ticketData.isAdicion = false;
            ticketData.productos = payload.productos.map(item => ({
              cantidad: item.cantidad,
              nombre: item.nombre,
              precioUnitario: item.precio,
              subtotal: item.precioTotal,
              modifiers: item.comentarios ? JSON.parse(item.comentarios) : undefined,
              seccionCocinaId: item.seccionCocinaId || item.categoriaSeccionCocinaId || (item as any).producto?.seccionCocinaId || (item as any).producto?.categoria?.seccionCocinaId || (item as any).producto?.categoriaRelacion?.seccionCocinaId || (item as any).producto?.categoriaSeccionCocinaId || null,
              gramosPapa: resolveGramosPapa(item),
            }));
            ticketData.productosAnteriores = [];
          } else if (isEditing && editingVenta && yaEstuvoEnCocina) {
            ticketData.isAdicion = true;
            ticketData.forceComanda = true;
            ticketData.suppressComanda = false;
          }

          printStore.printTicket(ticketData);
        }


        import('../../services/sales').then(async ({ updateVentaCompleta }) => {
          try {
            const response = await updateVentaCompleta(editingSaleId, payload);
            const ventaActualizada = response?.data || response;
            emitOrdenActualizada({ 
              ventaId: editingSaleId, 
              IDventas: editingSaleId, 
              estado: paymentData.estado,
              venta: ventaActualizada.IDventas ? ventaActualizada : {
                ...editingVenta,
                ...payload.venta,
                IDventas: editingSaleId,
                ordenVentas: payload.productos
              },
              productos: ventaActualizada?.ordenVentas || payload.productos 
            });

            // Sincronizar DomicilioWA si la venta proviene de un domicilio
            if (paymentData.estado === 'PAGADO') {
              try {
                const { updateDomicilioEstado, getDomicilios } = await import('../../services/domicilios.service');
                const doms = await getDomicilios();
                const domList = Array.isArray(doms) ? doms : [];
                const linkedDom = domList.find((d: any) => d.ventaId === editingSaleId || d.IDdomicilio === editingSaleId);
                if (linkedDom) {
                  await updateDomicilioEstado(linkedDom.IDdomicilio, 'COBRADO');
                }
              } catch (e) {
                console.error('Error al actualizar domicilio vinculado tras cobro en carrito:', e);
              }
            }

            setTimeout(() => {
              Toast.show({
                type: 'success',
                text1: 'Cobro Exitoso',
                text2: `Pedido actualizado y cobrado correctamente`,
                position: 'top',
                visibilityTime: 3000,
              });
            }, 350);

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

        return { pedidoId: 'PROCESANDO...' };
      }

      const payload: SalePayload = {
        venta: {
          mesa: mesaValue,
          estado: paymentData.estado,
          medioDePago: paymentData.medioDePago,
          efectivoRecibido: paymentData.efectivoRecibido || paymentData.totalInput || finalTotal,
          devueltas: paymentData.devueltas || 0,
          banco: paymentData.medioDePago === 'EFECTIVO' ? null : paymentData.banco,
          valorDeTransferencia: paymentData.transferencia,
          totalInput: paymentData.totalInput || finalTotal,
          descuento: descuento,
          porcentajeDeDescuento: discountPercent.toString(),
          propina: paymentData.propina,
          porcentajePropina: paymentData.porcentajePropina,
          cartStartTime: cartStartTime,
          clienteId: selectedCliente ? selectedCliente.IDcliente : undefined,
          abono: paymentData.abono,
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
          seccionCocinaId: item.seccionCocinaId || item.categoriaSeccionCocinaId || (item as any).producto?.seccionCocinaId || (item as any).producto?.categoria?.seccionCocinaId || (item as any).producto?.categoriaRelacion?.seccionCocinaId || (item as any).producto?.categoriaSeccionCocinaId || null,
        })),
      };

      // UI: Se limpia instantáneamente sin esperar al servidor
      setPaymentModalVisible(false);
      clearCart();
      setSelectedMesa(null);
      setSelectedCliente(null);

      const finalMethod = payload.venta.medioDePago;

      // Proceso de backend asíncrono (Promesa huérfana para no bloquear)
      createSale(payload)
        .then((response: any) => {
          soundService.playSuccess();
          const ventaCreada = response?.data || response;
          const pedidoGenerado = ventaCreada?.pedido || payload.venta.pedido;
          
          // IMPRESIÓN CON EL ID REAL DEL BACKEND
          const printStore = usePrinterStore.getState();
          if (printStore.shouldPrintComanda(payload.venta.estado) || printStore.shouldPrintFactura(payload.venta.estado)) {
            let cleanOrderId = pedidoGenerado;
            if (cleanOrderId && cleanOrderId.toLowerCase().startsWith('pedido-')) {
              cleanOrderId = cleanOrderId.substring(7);
            }
            const ticketData = {
              orderId: cleanOrderId,
              fecha: new Date().toLocaleString('es-CO'),
              cliente: selectedCliente?.nombre,
              observaciones: mesaNota || undefined,
              total: payload.venta.totalInput,
              totalGlobal: recalcularTotal,
              descuento: descuento,
              productos: payload.productos.map(item => ({
                cantidad: item.cantidad,
                nombre: item.nombre,
                precioUnitario: item.precio,
                subtotal: item.precioTotal,
                modifiers: item.comentarios ? JSON.parse(item.comentarios) : undefined,
                seccionCocinaId: item.seccionCocinaId || item.categoriaSeccionCocinaId || (item as any).producto?.seccionCocinaId || (item as any).producto?.categoria?.seccionCocinaId || (item as any).producto?.categoriaRelacion?.seccionCocinaId || (item as any).producto?.categoriaSeccionCocinaId || null,
                gramosPapa: resolveGramosPapa(item),
              })),
              estado: payload.venta.estado,
              forceComanda: !isEditing && payload.venta.estado === 'PAGADO',
              metodoPago: finalMethod,
              efectivoRecibido: payload.venta.efectivoRecibido,
              devueltas: payload.venta.devueltas,
              propina: payload.venta.propina,
              porcentajePropina: payload.venta.porcentajePropina,
              abono: paymentData.abono,
              vendedor: useAuthStore.getState().user?.nombre || 'Caja',
              porcentajeMermaPapa: getCachedConfiguracion()?.data?.porcentajeMermaPapa ?? getCachedConfiguracion()?.porcentajeMermaPapa ?? 10
            };
            printStore.printTicket(ticketData);

            if (ventaCreada?.IDventas) {
              import('../../services/sales').then(({ marcarComandaImpresa }) => {
                marcarComandaImpresa(ventaCreada.IDventas).catch(() => {});
              });
            }
          }

          // Emitir Sockets
          const ordenData = {
            venta: {
              ...payload.venta,
              ...ventaCreada, // Esto inyecta IDventas, fechaYHora, fecha, etc.
              pedido: pedidoGenerado
            },
            productos: ventaCreada?.ordenVentas || payload.productos,
            ventaId: ventaCreada?.IDventas || pedidoGenerado,
          };
          emitNuevaOrden(ordenData);
          
          setTimeout(() => {
            Toast.show({
              type: 'success',
              text1: 'Cobro Exitoso',
              text2: `Pedido ${pedidoGenerado} registrado correctamente`,
              position: 'top',
              visibilityTime: 3000,
            });
          }, 350);

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

  const handleSavePedido = async (data: { estado: string; medioDePago?: string | null; abono?: number }) => {
    if (isSubmitting) return; // FIX: Prevent double submission
    setIsSubmitting(true);
    try {
      const { discountPercent } = useCartStore.getState();
      const recalcularTotal = cart.reduce((sum, item) => {
        let p = Number(item.precioUnitario || item.Precio_Unitario);
        if (isNaN(p)) p = 0;
        let c = Number(item.quantity);
        if (isNaN(c)) c = 1;
        let modSum = 0;
        if (item.modifiers && Array.isArray(item.modifiers)) {
          modSum = item.modifiers.reduce((acc, m) => {
            let mp = Number(m.price);
            if (isNaN(mp)) mp = 0;
            let mq = Number(m.quantity);
            if (isNaN(mq)) mq = 1;
            return acc + (mp * mq);
          }, 0);
        }
        return sum + (p * c) + modSum;
      }, 0);
      const exactDiscount = recalcularTotal * (discountPercent || 0);
      const descuento = Math.floor(exactDiscount / 1000) * 1000;
      const finalTotal = recalcularTotal - descuento;
      
      if (isEditing && editingSaleId) {
        const payload: SalePayload = {
          venta: {
            mesa: selectedMesa?.IdMesas || 'V.R',
            estado: data.estado,
            medioDePago: data.medioDePago || editingVenta?.medioDePago || 'PENDIENTE',
            efectivoRecibido: editingVenta?.efectivoRecibido || finalTotal,
            devueltas: editingVenta?.devueltas || 0,
            banco: editingVenta?.banco,
            valorDeTransferencia: editingVenta?.valorDeTransferencia ? Number(editingVenta.valorDeTransferencia) : undefined,
            totalInput: finalTotal,
            descuento: descuento,
            porcentajeDeDescuento: discountPercent.toString(),
            clienteId: selectedCliente ? selectedCliente.IDcliente : undefined,
            abono: data.abono,
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
            estado: data.estado === 'ENTREGADO' ? 'LISTO' : 'PREPARANDO',
            imagenUrl: item.imagenUrl || item.image,
            comentarios: item.modifiers?.length ? JSON.stringify(item.modifiers) : undefined,
            seccionCocinaId: item.seccionCocinaId || item.categoriaSeccionCocinaId || (item as any).producto?.seccionCocinaId || (item as any).producto?.categoria?.seccionCocinaId || (item as any).producto?.categoriaRelacion?.seccionCocinaId || (item as any).producto?.categoriaSeccionCocinaId || null,
          })),
        };
        // Eliminamos el setTimeout optimista para esperar a la respuesta del backend

        import('../../services/sales').then(async ({ updateVentaCompleta }) => {
          try {
            // IMPRESIÓN INSTANTÁNEA ANTES DE GUARDAR EN BASE DE DATOS
            const mesaNombre = selectedMesa?.nombre || selectedMesa?.IdMesas || (selectedMesa?.IdMesas !== 'V.R' && selectedMesa?.IdMesas !== 'CAJA' ? selectedMesa?.IdMesas : 'V.R');
            let cleanOrderId = editingVenta?.pedido;
            if (cleanOrderId && cleanOrderId.toLowerCase().startsWith('pedido-')) {
              cleanOrderId = cleanOrderId.substring(7);
            }
            if (cleanOrderId && mesaNombre) {
              const partes = cleanOrderId.split('-');
              if (partes.length >= 2) {
                partes[0] = mesaNombre;
                cleanOrderId = partes.join('-');
              }
            }
            const pedidoGenerado = cleanOrderId || 'Editando...';
            const printStore = usePrinterStore.getState();
            if (printStore.shouldPrintComanda(data.estado) || printStore.shouldPrintFactura(data.estado)) {
              if (cleanOrderId && cleanOrderId.toLowerCase().startsWith('pedido-')) {
                cleanOrderId = cleanOrderId.substring(7);
              }

              const yaEstuvoEnCocina = Boolean(
                editingVenta?.comandaImpresa ||
                editingVenta?.cocinaInicioAt ||
                editingVenta?.comandaImpresaAt ||
                editingVenta?._isDomicilioWA ||
                (Array.isArray(editingVenta?.ordenVentas) && editingVenta.ordenVentas.some((ov: any) => ov.comandaImpresa)) ||
                (Array.isArray(editingVenta?.registroDeTiempo) && editingVenta.registroDeTiempo.some((r: any) => ['TOMADO', 'PREPARANDO', 'PAGADO', 'ENTREGADO', 'LISTO_PARA_ENTREGA'].includes((r.estado || '').toUpperCase()))) ||
                (editingVenta?.estado && editingVenta.estado !== 'EN_EL_CARRITO')
              );

              const normalizeName = (name?: string) => (name || '').trim().toLowerCase();
              const originalEntries = (editingVenta?.ordenVentas || []).map((ov: any) => ({
                id: String(ov.producto?.IDproductos || ov.productoId || ov.IDproductos || ov.IDorderventas || '').trim(),
                normName: normalizeName(ov.nombre || ov.nombreProducto || ov.producto?.nombre),
                qty: !yaEstuvoEnCocina ? 0 : (Number(ov.cantidad) || 1),
                prep: Number(ov.cantidadPreparada) || 0,
              }));

              const nuevosProductos: any[] = [];
              const productosAnteriores: any[] = [];

              payload.productos.forEach(item => {
                const id = String(item.productoId || '').trim();
                const normName = normalizeName(item.nombre || item.nombreProducto);
                let originalQty = 0;
                let preparadaQty = 0;

                originalEntries.forEach((entry: any) => {
                  const matchById = Boolean(id && entry.id && id === entry.id);
                  const matchByName = Boolean(normName && entry.normName && normName === entry.normName);
                  if (matchById || matchByName) {
                    originalQty += entry.qty;
                    preparadaQty += entry.prep;
                    entry.qty = 0;
                    entry.prep = 0;
                  }
                });

                const newQty = item.cantidad - originalQty;
                if (newQty > 0) {
                  nuevosProductos.push({
                    cantidad: newQty,
                    nombre: item.nombre,
                    precioUnitario: item.precio,
                    subtotal: item.precio * newQty,
                    modifiers: item.comentarios ? JSON.parse(item.comentarios) : undefined,
                    seccionCocinaId: item.seccionCocinaId || null,
                    gramosPapa: resolveGramosPapa(item),
                  });
                }
                if (originalQty > 0) {
                  const prevQty = Math.min(originalQty, item.cantidad);
                  productosAnteriores.push({
                    cantidad: prevQty,
                    nombre: item.nombre,
                    precioUnitario: item.precio,
                    subtotal: item.precio * prevQty,
                    modifiers: item.comentarios ? JSON.parse(item.comentarios) : undefined,
                    cantidadPreparada: preparadaQty,
                    seccionCocinaId: item.seccionCocinaId || null,
                    gramosPapa: resolveGramosPapa(item),
                  });
                }
              });

              const ticketData: any = {
                orderId: cleanOrderId,
                fecha: new Date().toLocaleString('es-CO'),
                cliente: selectedCliente?.nombre || editingVenta?.cliente,
                observaciones: mesaNota || editingVenta?.notas,
                total: finalTotal,
                totalGlobal: recalcularTotal,
                descuento: descuento,
                productos: nuevosProductos,
                productosAnteriores: productosAnteriores,
                suppressComanda: nuevosProductos.length === 0,
                forceComanda: yaEstuvoEnCocina && nuevosProductos.length > 0,
                isAdicion: yaEstuvoEnCocina && nuevosProductos.length > 0,
                estado: data.estado,
                metodoPago: data.medioDePago || editingVenta?.medioDePago || 'PENDIENTE',
                efectivoRecibido: editingVenta?.efectivoRecibido || finalTotal,
                devueltas: editingVenta?.devueltas || 0,
                propina: editingVenta?.propina,
                porcentajePropina: editingVenta?.porcentajePropina,
                abono: data.abono,
                vendedor: useAuthStore.getState().user?.nombre || 'Caja',
                porcentajeMermaPapa: getCachedConfiguracion()?.data?.porcentajeMermaPapa ?? getCachedConfiguracion()?.porcentajeMermaPapa ?? 10
              };
              printStore.printTicket(ticketData);
            }

            // AHORA SÍ, GUARDAMOS EN SEGUNDO PLANO
            const response = await updateVentaCompleta(editingSaleId, payload);
            const ventaActualizada = response?.data || response;

            emitOrdenActualizada({ 
              ventaId: editingSaleId, 
              IDventas: editingSaleId, 
              estado: data.estado,
              venta: ventaActualizada.IDventas ? ventaActualizada : {
                ...editingVenta,
                ...payload.venta,
                IDventas: editingSaleId,
                ordenVentas: payload.productos
              },
              productos: ventaActualizada?.ordenVentas || payload.productos
            });

            

            setPaymentModalVisible(false);
            clearCart();
            setSelectedMesa(null);

            if (editingSaleId) {
              const targetTab = data.estado === 'TOMADO' ? 'TOMADO' : (data.estado === 'PAGADO' ? 'PAGADO' : 'todos');
              navigation.navigate('Main', { screen: 'Pedidos', params: { tab: targetTab } });
            }
            setTimeout(() => {
              Toast.show({
                type: 'success',
                text1: 'Pedido Actualizado',
                text2: `Estado actualizado a ${data.estado}`,
                position: 'top',
              });
            }, 350);
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

        return { pedidoId: 'PROCESANDO...' };
      }

      const mesaValue = selectedMesa?.IdMesas || 'V.R';
      
      const temporalId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      activeTemporalIdRef.current = temporalId;
      printTriggeredRef.current = false;
      
      lastTicketDataRef.current = {
        orderId: 'PROCESANDO...',
        fecha: new Date().toLocaleString('es-CO'),
        cliente: selectedCliente?.nombre,
        observaciones: mesaNota || undefined,
        total: finalTotal,
        totalGlobal: recalcularTotal,
        descuento: descuento,
        abono: data.abono,
        porcentajeMermaPapa: getCachedConfiguracion()?.data?.porcentajeMermaPapa ?? getCachedConfiguracion()?.porcentajeMermaPapa ?? 10,
        productos: cart.map(item => ({
          cantidad: item.quantity,
          nombre: item.nombre,
          precioUnitario: Number(item.precioUnitario || item.Precio_Unitario || 0),
          subtotal: (Number(item.precioUnitario || item.Precio_Unitario || 0) * item.quantity) + (item.modifiers?.reduce((sum, mod) => sum + (Number(mod.price) * (mod.quantity || 1)), 0) || 0),
          modifiers: item.modifiers,
          seccionCocinaId: item.seccionCocinaId || item.categoriaSeccionCocinaId || (item as any).producto?.seccionCocinaId || (item as any).producto?.categoria?.seccionCocinaId || (item as any).producto?.categoriaRelacion?.seccionCocinaId || (item as any).producto?.categoriaSeccionCocinaId || null,
          gramosPapa: resolveGramosPapa(item),
        })),
        estado: data.estado,
        metodoPago: data.medioDePago || 'PENDIENTE',
        efectivoRecibido: 0,
        devueltas: 0,
        vendedor: useAuthStore.getState().user?.nombre || 'Caja'
      };

      const payload: SalePayload = {
        venta: {
          mesa: mesaValue,
          estado: data.estado,
          medioDePago: data.estado === 'PAGADO' ? (data.medioDePago || 'EFECTIVO') : 'PENDIENTE',
          efectivoRecibido: 0,
          devueltas: 0,
          banco: null,
          totalInput: finalTotal,
          descuento: descuento,
          porcentajeDeDescuento: discountPercent.toString(),
          cartStartTime: cartStartTime,
          temporalId: temporalId,
          clienteId: selectedCliente ? selectedCliente.IDcliente : undefined,
          abono: data.abono,
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
          seccionCocinaId: item.seccionCocinaId || item.categoriaSeccionCocinaId || (item as any).producto?.seccionCocinaId || (item as any).producto?.categoria?.seccionCocinaId || (item as any).producto?.categoriaRelacion?.seccionCocinaId || (item as any).producto?.categoriaSeccionCocinaId || null,
        })),
      };

      // Eliminamos el setTimeout optimista para esperar a la respuesta del backend

      import('../../services/sales').then(({ createSale }) => {
        createSale(payload)
          .then((response: any) => {
            soundService.playSuccess();
            const ventaCreada = response?.data || response;
            const pedidoGenerado = ventaCreada?.pedido || `pedido-${Date.now()}`;
            
            // IMPRESIÓN CON EL ID REAL DEL BACKEND (CREATE) FALLBACK
            const printStore = usePrinterStore.getState();
            if (!printTriggeredRef.current) {
              printTriggeredRef.current = true;
              console.log('[IMPRESIÓN FALLBACK] Imprimiendo después del createSale');
              if (printStore.shouldPrintComanda(data.estado) || printStore.shouldPrintFactura(data.estado)) {
                let cleanOrderId = pedidoGenerado;
                if (cleanOrderId && cleanOrderId.toLowerCase().startsWith('pedido-')) {
                  cleanOrderId = cleanOrderId.substring(7);
                }
                const ticketData = { ...lastTicketDataRef.current, orderId: cleanOrderId };
                printStore.printTicket(ticketData);
              }
            }

            setPaymentModalVisible(false);
            clearCart();
            setSelectedMesa(null);
            
            setTimeout(() => {
              const ordenData = {
                venta: {
                  ...payload.venta,
                  ...ventaCreada,
                  pedido: pedidoGenerado
                },
                productos: ventaCreada?.ordenVentas || payload.productos,
                ventaId: ventaCreada?.IDventas || pedidoGenerado,
              };
              emitNuevaOrden(ordenData);
            }, 0);

            setTimeout(() => {
              Toast.show({
                type: 'success',
                text1: 'Orden Guardada',
                text2: `Pedido ${pedidoGenerado} guardado en estado ${data.estado}`,
                position: 'top',
              });
            }, 350);
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
    let filteredModifiers = comentariosDb.filter(mod => 
      mod.comentarios.toLowerCase().includes(modifierSearchQuery.toLowerCase())
    );

    // Agregar notas personalizadas ya aplicadas para que aparezcan en la lista y se puedan gestionar
    if (selectedItem && selectedItem.modifiers) {
      const appliedCustoms = selectedItem.modifiers.filter(m => !comentariosDb.some(cdb => cdb.comentarios === m.name));
      appliedCustoms.forEach((customMod, index) => {
        if (customMod.name.toLowerCase().includes(modifierSearchQuery.toLowerCase())) {
          if (!filteredModifiers.some(fm => fm.comentarios === customMod.name)) {
            filteredModifiers.unshift({
              ID: `custom-applied-${index}`,
              comentarios: customMod.name,
              precio: customMod.price,
              tipo: 'Nota Personalizada'
            });
          }
        }
      });
    }

    // Verificar si la búsqueda exacta ya existe
    const isCustomNoteUnique = modifierSearchQuery.trim().length > 0 && 
      !filteredModifiers.some(mod => mod.comentarios.toLowerCase() === modifierSearchQuery.trim().toLowerCase());

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
          behavior="padding"
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

  const renderProduct = useCallback(({ item }: { item: ProductItem }) => (
    <ProductItemComponent 
      item={item}
      addToCart={addToCart}
      getFullImageUrl={getFullImageUrl}
    />
  ), [addToCart, getFullImageUrl]);

  const renderCartItem = useCallback(({ item }: { item: CartItem }) => (
    <CartItemComponent
      item={item}
      addToCart={addToCart}
      decrementQuantity={decrementQuantity}
      handleRemoveItem={handleRemoveItem}
      openNumpad={openNumpad}
      setSelectedCartItemId={setSelectedCartItemId}
      setModifiersModalVisible={setModifiersModalVisible}
    />
  ), [addToCart, decrementQuantity, handleRemoveItem, openNumpad, setSelectedCartItemId, setModifiersModalVisible]);
  const renderCategoryChip = (cat: string, index: number) => (
    <TouchableOpacity
      key={`${cat}-${index}`}
      style={[styles.categoryChip, activeCategory === cat && [styles.categoryChipActive, { backgroundColor: primaryColor, borderColor: primaryColor }]]}
      onPress={() => setActiveCategory(cat)}
    >
      <Text style={[styles.categoryChipText, activeCategory === cat && styles.categoryChipTextActive]}>
        {cat}
      </Text>
    </TouchableOpacity>
  );

  return (
    <>
      <StatusBar style="light" backgroundColor={primaryColor} />
      <SafeAreaView style={[styles.container, { backgroundColor: primaryColor }]} edges={['top']}>
        <KeyboardAvoidingView 
          style={{ flex: 1, backgroundColor: '#F8FAFC' }} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          enabled={Platform.OS === 'ios'}
        >
          <View style={[styles.topBar, { backgroundColor: primaryColor }]}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
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

      {/* BANNER DE BLOQUEO DE VENTAS POR DOMICILIOS DESATENDIDOS */}
      {isSalesBlocked && (
        <View style={{ backgroundColor: '#dc2626', paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
            <Ionicons name="warning" size={22} color="#fff" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <RNText style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
                ⛔ VENTAS BLOQUEADAS: {desatendidosCount} DOMI(S) SIN ATENDER
              </RNText>
              <RNText style={{ color: '#fecaca', fontSize: 11 }}>
                Hay domicilios de WhatsApp desatendidos por más de {configNegocio?.domisTimeoutMinutos || 10} min. Debes gestionarlos para continuar.
              </RNText>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Main', { screen: 'Pedidos', params: { tab: 'DOMIS' } })}
            style={{ backgroundColor: '#fff', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 }}
          >
            <RNText style={{ color: '#dc2626', fontWeight: 'bold', fontSize: 12 }}>Ir a DOMIS</RNText>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView 
        style={styles.mainContent} 
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />}
      >
        <View style={styles.headerSection}>
          <View style={styles.headerTop}>
            <View style={styles.timeBox}>
              <Ionicons name="time-outline" size={16} color="#4CAF50" />
              <Clock />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, paddingLeft: 10 }}>
              <TouchableOpacity style={[styles.mesaButton, { flexShrink: 1 }]} onPress={() => setMesaModalVisible(true)}>
                <MaterialCommunityIcons 
                  name={selectedMesa ? "table-furniture" : "flash-outline"}
                  size={18}
                  color="#4CAF50"
                />
                <Text style={[styles.mesaButtonText, { flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">
                  {selectedMesa?.nombre || 'V.R'}
                </Text>
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
              <TouchableOpacity activeOpacity={1} style={[styles.mesaModalContent, { width: 300, maxHeight: '85%' }]}>
                <View style={styles.mesaModalHeader}>
                    <Text style={styles.mesaModalTitle}>Seleccionar Mesa</Text>
                    <TouchableOpacity onPress={() => setMesaModalVisible(false)}>
                      <Ionicons name="close" size={20} color="#6b7280" />
                    </TouchableOpacity>
                  </View>

                  {/* Buscador de Mesas */}
                  <View style={[styles.searchBox, { marginBottom: 10, minHeight: 40 }]}>
                    <Ionicons name="search" size={18} color="#9ca3af" />
                    <TextInput
                      style={[styles.searchInput, { height: undefined, minHeight: 36, paddingVertical: 4 }]}
                      placeholder="Buscar mesa..."
                      placeholderTextColor="#9ca3af"
                      value={mesaSearchQuery}
                      onChangeText={setMesaSearchQuery}
                      multiline={true}
                    />
                    {mesaSearchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setMesaSearchQuery('')}>
                        <Ionicons name="close-circle" size={18} color="#9ca3af" />
                      </TouchableOpacity>
                    )}
                  </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
                  {(!mesaSearchQuery || 'venta rapida (v.r)'.includes(mesaSearchQuery.toLowerCase())) && (
                    <TouchableOpacity
                      style={[styles.mesaOption, !selectedMesa && styles.mesaOptionActive]}
                      onPress={() => { 
                        setSelectedMesa(null); 
                        setMesaModalVisible(false); 
                      }}
                    >
                      <MaterialCommunityIcons name="flash-outline" size={20} color={!selectedMesa ? '#fff' : '#6b7280'} />
                      <Text style={[styles.mesaOptionText, !selectedMesa && styles.mesaOptionTextActive]}>
                        Venta Rapida (V.R)
                      </Text>
                    </TouchableOpacity>
                  )}
                  {mesaSearchQuery.length > 0 && !mesas.some(m => m.nombre.toLowerCase() === mesaSearchQuery.toLowerCase()) && (
                    <TouchableOpacity
                      style={[styles.mesaOption, { backgroundColor: '#fef3c7', borderColor: '#fde68a', borderWidth: 1 }]}
                      onPress={() => { 
                        const mesaName = mesaSearchQuery.trim();
                        if (isMesaOccupied(undefined, mesaName)) {
                          showAlert({
                            title: 'Mesa Ocupada',
                            message: `La mesa "${mesaName}" ya tiene un pedido abierto y pendiente de cobro. Por favor, factura o cierra el pedido actual antes de usar esta mesa nuevamente.`,
                            type: 'warning'
                          });
                          return;
                        }

                        setSelectedMesa({
                          IdMesas: mesaName,
                          nombre: mesaName,
                        });
                        setMesaModalVisible(false); 
                      }}
                    >
                      <Ionicons name="add-circle-outline" size={20} color="#d97706" />
                      <Text style={[styles.mesaOptionText, { color: '#d97706', marginLeft: 8, flexShrink: 1 }]}>
                        Anotar como "{mesaSearchQuery}"
                      </Text>
                    </TouchableOpacity>
                  )}
                  {mesas.filter(m => m.nombre.toLowerCase().includes(mesaSearchQuery.toLowerCase())).map((mesa) => {
                    const isOccupied = isMesaOccupied(mesa.IdMesas, mesa.nombre);
                    const isSelected = selectedMesa?.IdMesas === mesa.IdMesas || selectedMesa?.nombre === mesa.nombre;
                    return (
                      <TouchableOpacity
                        key={mesa.IdMesas}
                        style={[
                          styles.mesaOption, 
                          isSelected && styles.mesaOptionActive,
                          isOccupied && !isSelected && { backgroundColor: '#fee2e2', borderColor: '#fca5a5', borderWidth: 1 }
                        ]}
                        onPress={() => { 
                          if (isOccupied) {
                            showAlert({
                              title: 'Mesa Ocupada',
                              message: `La mesa "${mesa.nombre}" tiene un pedido abierto y pendiente de cobro. Por favor, factura o cierra el pedido actual antes de usar esta mesa nuevamente.`,
                              type: 'warning'
                            });
                            return;
                          }

                          setSelectedMesa(mesa);
                          setMesaModalVisible(false); 
                        }}
                      >
                        <MaterialCommunityIcons 
                          name="table-furniture" 
                          size={20} 
                          color={isSelected ? '#fff' : (isOccupied ? '#ef4444' : '#6b7280')} 
                        />
                        <RNText 
                          style={[
                            styles.mesaOptionText, 
                            isSelected && styles.mesaOptionTextActive,
                            isOccupied && !isSelected && { color: '#b91c1c' }
                          ]}
                        >
                          {mesa.nombre} {isOccupied ? '(Ocupada)' : ''}
                        </RNText>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </TouchableOpacity>
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
              {hasReservedItems && timeLeftStr !== '' && (
                <View style={{ backgroundColor: '#fef3c7', padding: 8, marginHorizontal: 12, marginBottom: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="timer-outline" size={18} color="#d97706" />
                  <Text style={{ color: '#d97706', fontSize: 12, marginLeft: 6, flex: 1 }}>
                    Tus artículos están reservados por {tiempoReservaMinutos} min.
                  </Text>
                  <Text style={{ color: '#b45309', fontWeight: 'bold', fontSize: 14 }}>
                    {timeLeftStr}
                  </Text>
                </View>
              )}
              <View style={{ paddingBottom: 10 }}>
                {cart.map((item, index) => (
                  <View key={`${item.IDproductos}-${index}`}>
                    {renderCartItem({ item })}
                  </View>
                ))}
              </View>
            </View>
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoriesScroll}
            contentContainerStyle={styles.categoriesContent}
            keyboardShouldPersistTaps="handled"
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
              <ActivityIndicator size="large" color={primaryColor} />
            </View>
          ) : filteredProducts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="food-off" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>Sin productos</Text>
            </View>
          ) : (
            <View style={{ flex: 1, minHeight: 400, width: '100%' }}>
              <FlashList
                key={`grid-${dynamicColumns}`}
                data={filteredProducts}
                renderItem={renderProduct}
                keyExtractor={(item, index) => `${item.IDproductos}-${index}`}
                numColumns={dynamicColumns}
                // @ts-ignore
                estimatedItemSize={200}
                contentContainerStyle={{ paddingBottom: 100 }}
                keyboardShouldPersistTaps="handled"
              />
            </View>
          )}
        </View>
      </ScrollView>

      {cart.length > 0 && (
        <View style={[styles.cartBar, { paddingBottom: Platform.OS === 'ios' ? 34 : 16 }]}>
          <View style={styles.cartBarInfo}>
            <View style={[styles.cartBadgeLarge, { backgroundColor: primaryColor }]}>
              <Text style={styles.cartBadgeText}>{getTotalItems()}</Text>
            </View>
            <View>
              <Text style={styles.cartBarLabel}>a cobrar</Text>
              <Text style={styles.cartBarTotal}>${useCartStore.getState().getFinalTotalPrice().toLocaleString()}</Text>
            </View>
          </View>
          <Button 
            style={[styles.checkoutButton, { backgroundColor: isSalesBlocked ? '#dc2626' : primaryColor }]} 
            onPress={handleCheckout} 
            disabled={isSubmitting || isSalesBlocked}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.checkoutContent}>
                <Text style={styles.checkoutText}>{isSalesBlocked ? 'Bloqueado' : 'Cobrar'}</Text>
                <Ionicons name={isSalesBlocked ? "lock-closed" : "checkmark-circle"} size={20} color="white" />
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
        cliente={selectedCliente}
        editingPedidoId={editingVenta?.pedido || undefined}
        initialPaymentMethod={editingVenta?.medioDePago}
        initialEfectivo={
          editingVenta?.efectivoRecibido && Number(editingVenta.efectivoRecibido) > 0
            ? Number(editingVenta.efectivoRecibido)
            : (editingVenta?.medioDePago === 'EFECTIVO' && editingVenta?.totalInput ? Number(editingVenta.totalInput) : undefined)
        }
        initialTransferencia={
          editingVenta?.valorDeTransferencia ? Number(editingVenta.valorDeTransferencia) :
          (editingVenta?.transferencia ? Number(editingVenta.transferencia) :
          (editingVenta?.medioDePago === 'EFECTIVO Y OTROS' && editingVenta?.totalInput && editingVenta?.efectivoRecibido ?
            Math.max(0, Number(editingVenta.totalInput) - Number(editingVenta.efectivoRecibido)) : undefined))
        }
        initialBanco={editingVenta?.banco}
        initialEstado={editingVenta?.estado}
        initialPorcentajePropina={editingVenta?.porcentajePropina}
        abonoPrevio={editingVenta?.abono ? Number(editingVenta.abono) : 0}
      />

      {renderClienteModal()}
      {renderModifiersModal()}

      {/* Quantity Numpad — bottom sheet overlay */}
      {numpadItem && (
        <QuantityNumpad
          visible={numpadVisible}
          productName={numpadItem.nombre}
          unitPrice={Number(numpadItem.precioUnitario || numpadItem.Precio_Unitario || 0)}
          currentQuantity={numpadItem.quantity}
          onConfirm={handleNumpadConfirm}
          onCancel={() => { setNumpadVisible(false); setNumpadItem(null); }}
        />
      )}
        </KeyboardAvoidingView>
    </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  backButton: { padding: 8 },
  totalContainer: { flex: 1, marginLeft: 8 },
  totalText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  topBarBtn: { padding: 8 },
  mainContent: { flex: 1 },
  headerSection: { backgroundColor: 'white', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  timeBox: { flexDirection: 'row', alignItems: 'center' },
  timeText: { fontSize: 16, fontWeight: '700', color: '#111827', marginLeft: 6 },
  mesaButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5, backgroundColor: 'transparent' },
  mesaButtonText: { fontSize: 13, fontWeight: '600', marginHorizontal: 6 },
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
  qtyTextTouchable: { minWidth: 28, height: 28, justifyContent: 'center', alignItems: 'center', borderRadius: 6, backgroundColor: 'rgba(76,175,80,0.1)' },
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
