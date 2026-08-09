import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  Text as RNText,
  TextInput,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { Button } from './button';
import usePrinterStore from '../../store/usePrinterStore';
import { executePrint, TicketData } from '../../utils/printer';
import useCartStore from '../../store/useCartStore';
import useAuthStore from '../../store/useAuthStore';
import { Cliente } from '../../services/clientes.service';

type PaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'EFECTIVO Y OTROS';

type OrderStatus = 'PAGADO' | 'EN_EL_CARRITO' | 'TOMADO' | 'LISTO_PARA_ENTREGA' | 'ENTREGADO' | 'DEUDOR';

interface PaymentModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: { estado: OrderStatus; pedidoId?: string; medioDePago?: string | null }) => Promise<{ pedidoId?: string } | void>;
  onCobrar?: (paymentData: {
    medioDePago: string;
    banco?: string | null;
    efectivoRecibido?: number;
    devueltas?: number;
    transferencia?: number;
    estado: OrderStatus;
    pedidoId?: string;
  }) => Promise<{ pedidoId?: string } | void>;
  total: number;
  isLoading?: boolean;
  editingPedidoId?: string;
  cliente?: Cliente | null;
}

interface BankOption {
  key: string;
  label: string;
  icon: string;
}

const ORDER_STATUSES: { key: OrderStatus; label: string; color: string; icon: string }[] = [
  { key: 'PAGADO', label: 'PAGADO', color: '#22c55e', icon: 'checkmark-circle' },
  { key: 'EN_EL_CARRITO', label: 'CARRITO', color: '#f59e0b', icon: 'cart' },
  { key: 'TOMADO', label: 'TOMADO', color: '#3b82f6', icon: 'hand-left' },
  { key: 'LISTO_PARA_ENTREGA', label: 'LISTO', color: '#8b5cf6', icon: 'checkmark-done' },
  { key: 'ENTREGADO', label: 'ENTREGADO', color: '#10b981', icon: 'paper-plane' },
  { key: 'DEUDOR', label: 'DEUDOR', color: '#ef4444', icon: 'alert-circle' },
];

const BANKS: BankOption[] = [
  { key: 'NEQUI', label: 'NEQUI', icon: 'phone-portrait-outline' },
  { key: 'DAVIPLATA', label: 'DAVIPLATA', icon: 'phone-landscape-outline' },
];

const METHOD_ICONS: Record<PaymentMethod, { name: string; color: string }> = {
  EFECTIVO: { name: 'cash', color: '#22c55e' },
  TRANSFERENCIA: { name: 'swap-horizontal', color: '#3b82f6' },
  TARJETA: { name: 'card', color: '#8b5cf6' },
  'EFECTIVO Y OTROS': { name: 'wallet', color: '#f59e0b' },
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: 'EFECTIVO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  TARJETA: 'TARJETA',
  'EFECTIVO Y OTROS': 'EFECTIVO + OTROS',
};

const PaymentModal: React.FC<PaymentModalProps> = ({
  visible,
  onClose,
  onSave,
  onCobrar,
  total,
  isLoading = false,
  editingPedidoId,
  cliente,
}) => {
  const { height: windowHeight } = useWindowDimensions();
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [selectedEstado, setSelectedEstado] = useState<OrderStatus>('EN_EL_CARRITO');
  const [efectivoInput, setEfectivoInput] = useState('');
  const [transferenciaInput, setTransferenciaInput] = useState('');
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(2000));
  const keyboardHeight = useKeyboardHeight();

  // Printer integration
  const { currentPrinter, paperSize, isConnected, shouldPrintComanda, shouldPrintFactura } = usePrinterStore();
  const { cart, discountPercent, setDiscountPercent, getDiscountAmount, getFinalTotalPrice } = useCartStore();
  const { user } = useAuthStore();
  const actualTotal = getFinalTotalPrice();

  useEffect(() => {
    if (visible) {
      const isCobrarMode = !!onCobrar;
      setMethod(isCobrarMode ? 'EFECTIVO' : null);
      setSelectedBank(null); // Reset bank on open
      setEfectivoInput('');
      setTransferenciaInput('');
      setSelectedEstado(isCobrarMode ? 'PAGADO' : 'EN_EL_CARRITO');
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: windowHeight, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    onClose();
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const parseMoney = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    return parseInt(cleaned, 10) || 0;
  };

  const efectivoAmount = parseMoney(efectivoInput);
  const transferenciaAmount = parseMoney(transferenciaInput);
  const devueltas = efectivoAmount > actualTotal ? efectivoAmount - actualTotal : 0;
  const remaining = actualTotal - efectivoAmount - transferenciaAmount;
  const isMixedPaymentComplete = efectivoAmount + transferenciaAmount >= actualTotal && efectivoAmount > 0 && transferenciaAmount > 0;
  const isPagado = selectedEstado === 'PAGADO';

  const getDisplayCompras = () => {
    if (!cliente) return '0';
    const total = parseInt(cliente.compras || '0', 10) || 0;
    if (total === 0) return '0';
    return ((total - 1) % 10) + 1;
  };

  const handleEfectivoChange = (text: string) => {
    const value = parseMoney(text);
    if (!value) {
      setEfectivoInput('');
    } else {
      setEfectivoInput(value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."));
    }
    
    // Si es un pago mixto y el efectivo es menor al total, calcular la transferencia sugerida
    if (method === 'EFECTIVO Y OTROS' && value > 0 && value < actualTotal) {
      const suggestedTransfer = actualTotal - value;
      setTransferenciaInput(suggestedTransfer.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."));
    }
  };

  const handleTransferenciaChange = (text: string) => {
    const value = parseMoney(text);
    if (!value) {
      setTransferenciaInput('');
    } else {
      setTransferenciaInput(value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."));
    }
    
    // Si es un pago mixto y la transferencia es menor al total, calcular el efectivo sugerido
    if (method === 'EFECTIVO Y OTROS' && value > 0 && value < actualTotal) {
      const suggestedEfectivo = actualTotal - value;
      setEfectivoInput(suggestedEfectivo.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."));
    }
  };

  const toggleEstado = (newEstado: OrderStatus) => {
    if (selectedEstado === newEstado) {
      // Si ya está seleccionado, volvemos al estado base 'EN_EL_CARRITO' o 'PAGADO' dependiendo del modo
      const baseEstado = onCobrar ? 'PAGADO' : 'EN_EL_CARRITO';
      setSelectedEstado(baseEstado);
    } else {
      setSelectedEstado(newEstado);
    }
  };

  const attemptAutoPrint = async (
    estado: string,
    orderId?: string,
    method?: string,
    efectivoRec?: number,
    cambio?: number
  ) => {
    const printComanda = shouldPrintComanda(estado);
    const printFactura = shouldPrintFactura(estado);
    
    if (!printComanda && !printFactura) return;
    
    if (!isConnected || !currentPrinter) {
      Toast.show({ type: 'warning', text1: 'Impresión Fallida', text2: 'No hay impresora conectada', position: 'top' });
      return;
    }

    // Extraemos de forma limpia el ID sin la palabra repetida
    let cleanOrderId = orderId;
    if (orderId && orderId.toLowerCase().startsWith('pedido-')) {
      cleanOrderId = orderId.substring(7); // Remueve "pedido-"
    }

    const ticketData: TicketData = {
      orderId: cleanOrderId,
      fecha: new Date().toLocaleString('es-CO'),
      total: actualTotal,
      vendedor: user?.nombre,
      productos: cart.map(item => {
        const precioUnitario = Number(item.precioUnitario || item.Precio_Unitario || 0);
        const modifiersTotal = (item.modifiers || []).reduce((sum: number, mod: any) => sum + (Number(mod.price) * (mod.quantity || 1)), 0);
        const subtotal = (precioUnitario * item.quantity) + modifiersTotal;
        return {
          cantidad: item.quantity,
          nombre: item.nombre,
          precioUnitario: precioUnitario,
          subtotal: subtotal,
          modifiers: item.modifiers?.map((m: any) => ({ name: m.name, price: m.price, quantity: m.quantity })),
        };
      }),
      estado: estado,
      metodoPago: method,
      efectivoRecibido: efectivoRec,
      devueltas: cambio,
    };

    let errorCount = 0;

    if (printComanda) {
      const successComanda = await executePrint(ticketData, paperSize, currentPrinter.inner_mac_address, 'comanda');
      if (!successComanda) errorCount++;
    }

    if (printFactura) {
      // Pequeña pausa para no saturar el buffer de la impresora Bluetooth si se mandan ambos
      if (printComanda) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      const successFactura = await executePrint(ticketData, paperSize, currentPrinter.inner_mac_address, 'factura');
      if (!successFactura) errorCount++;
    }

    if (errorCount > 0) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo imprimir correctamente', position: 'top' });
    }
  };

  const handleSaveOnly = async () => {
    try {
      // Optimizacion UI: Ocultamos el modal inmediatamente antes de procesar el guardado
      // Esto elimina la percepción visual de "carga" (loader) para la cajera
      const estadoActual = selectedEstado;
      const pedidoIdActual = editingPedidoId;
      
      const result = await onSave({ estado: estadoActual, pedidoId: pedidoIdActual, medioDePago: method });
      const finalOrderId = (result && 'pedidoId' in result) ? result.pedidoId : pedidoIdActual;
      
      // Intentar impresión automática en segundo plano
      if (finalOrderId && finalOrderId !== 'PROCESANDO...' && !finalOrderId.startsWith('PROCESANDO')) {
        setTimeout(() => {
          attemptAutoPrint(estadoActual, finalOrderId).catch(err => {
            console.log('Error en auto-print:', err);
          });
        }, 0);
      }

    } catch (error) {
      console.error('Error saving:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Hubo un problema al guardar la orden', position: 'top' });
    }
  };

  const handleConfirmCobrar = async () => {
    if (!method) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Selecciona un metodo de pago', position: 'top' });
      return;
    }

    if (!onCobrar) return;

    // Ejecutar lógica de interfaz de usuario de inmediato
    onCobrarLogic();
  };

  const onCobrarLogic = async () => {

    switch (method) {
      case 'EFECTIVO':
        break;
      case 'TRANSFERENCIA':
      case 'TARJETA':
        if (!selectedBank) {
          Toast.show({ type: 'error', text1: 'Error', text2: 'Selecciona un banco', position: 'top' });
          return;
        }
        break;
      case 'EFECTIVO Y OTROS':
        if (!isMixedPaymentComplete) {
          Toast.show({ type: 'error', text1: 'Error', text2: 'La suma de efectivo y transferencia debe cubrir el total', position: 'top' });
          return;
        }
        if (!selectedBank) {
          Toast.show({ type: 'error', text1: 'Error', text2: 'Selecciona el banco para la transferencia', position: 'top' });
          return;
        }
        break;
    }

    try {
      const finalMethod = method;
      const finalEfectivo = method === 'EFECTIVO' || method === 'EFECTIVO Y OTROS' ? efectivoAmount : undefined;
      const finalDevueltas = method === 'EFECTIVO' ? devueltas : undefined;

      const result = await onCobrar({
        medioDePago: finalMethod as string,
        banco: finalMethod === 'EFECTIVO' ? null : selectedBank, // Fix: Do not send bank if cash
        efectivoRecibido: finalEfectivo,
        devueltas: finalDevueltas,
        transferencia: method === 'TRANSFERENCIA' || method === 'TARJETA' || method === 'EFECTIVO Y OTROS' ? transferenciaAmount : undefined,
        estado: selectedEstado,
        pedidoId: editingPedidoId,
      });

      // Si tenemos un resultado válido del backend con el ID real, imprimimos.
      // Si el ID es 'PROCESANDO...' (Optimistic UI), la impresión se hará desde el manejador de éxito del componente padre.
      const finalOrderId = (result && 'pedidoId' in result) ? result.pedidoId : editingPedidoId;
      if (finalOrderId && finalOrderId !== 'PROCESANDO...' && !finalOrderId.startsWith('PROCESANDO')) {
        setTimeout(() => {
          attemptAutoPrint(selectedEstado, finalOrderId, finalMethod as string, finalEfectivo, finalDevueltas).catch(err => {
            console.log('Error en auto-print:', err);
          });
        }, 0);
      }

    } catch (error) {
      console.error('Error confirming payment:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Hubo un problema al procesar el pago', position: 'top' });
    }
  };

  const renderEstadoSelector = () => (
    <View style={styles.estadoContainer}>
      <RNText style={styles.estadoSectionTitle}>TODOS LOS ESTADOS</RNText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.estadoScrollContent}>
        {ORDER_STATUSES.map((status) => {
          const isSelected = selectedEstado === status.key;
          return (
            <TouchableOpacity
              key={status.key}
              style={[styles.estadoChip, isSelected && { backgroundColor: status.color, borderColor: status.color }]}
              onPress={() => toggleEstado(status.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Ionicons name={status.icon as any} size={16} color={isSelected ? '#fff' : status.color} />
              <RNText style={[styles.estadoChipText, isSelected && styles.estadoChipTextSelected]}>
                {status.label}
              </RNText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderMethodSelector = () => (
    <View style={styles.methodsContainer}>
      <RNText style={styles.sectionTitle}>MÉTODO DE PAGO</RNText>
      <View style={styles.methodsGrid}>
        {(Object.keys(METHOD_ICONS) as PaymentMethod[]).map((key) => {
          const icon = METHOD_ICONS[key];
          const isSelected = method === key;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.methodCard,
                isSelected && { borderColor: icon.color, borderWidth: 2, backgroundColor: icon.color + '08' },
              ]}
              onPress={() => {
                setMethod(key);
                if ((key === 'TRANSFERENCIA' || key === 'EFECTIVO Y OTROS') && !selectedBank) {
                  setSelectedBank('NEQUI');
                }
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Metodo de pago ${METHOD_LABELS[key]}`}
            >
              <View style={[styles.methodIconContainer, { backgroundColor: icon.color + '15' }]}>
                <Ionicons name={icon.name as any} size={32} color={icon.color} />
              </View>
              <RNText style={[styles.methodLabel, isSelected && { color: icon.color, fontWeight: '700' }]}>
                {METHOD_LABELS[key]}
              </RNText>
              {isSelected && (
                <View style={[styles.checkBadge, { backgroundColor: icon.color }]}>
                  <Ionicons name="checkmark" size={12} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderCashInput = () => (
    <View style={styles.inputSection}>
      <View style={styles.inputHeader}>
        <Ionicons name="cash-outline" size={18} color="#6b7280" />
        <RNText style={styles.inputLabel}>MONTO EN EFECTIVO</RNText>
      </View>
      <View style={styles.inputRowContainer}>
        {efectivoAmount > 0 && (
          <View style={[styles.changeContainerInline, devueltas > 0 ? styles.changePositiveInline : styles.changeNeutralInline]}>
            <Ionicons
              name={devueltas > 0 ? 'return-down-forward-outline' : 'checkmark-circle-outline'}
              size={16}
              color={devueltas > 0 ? '#16a34a' : '#6b7280'}
            />
            <View style={styles.changeTextCol}>
              <RNText style={[styles.changeLabelInline, { color: devueltas > 0 ? '#16a34a' : '#6b7280' }]}>
                {devueltas > 0 ? 'CAMBIO' : 'EXACTO'}
              </RNText>
              <RNText style={[styles.changeAmountInline, { color: devueltas > 0 ? '#16a34a' : '#374151' }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(devueltas)}
              </RNText>
            </View>
          </View>
        )}
        
        <View style={[styles.inputWrapper, { flex: 1 }]}>
          <RNText style={styles.currencySymbol}>$</RNText>
          <TextInput
            style={styles.moneyInput}
            value={efectivoInput ? efectivoInput : ''}
            onChangeText={handleEfectivoChange}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#d1d5db"
            accessibilityLabel="Monto en efectivo"
          />
        </View>
      </View>
    </View>
  );

  const renderTransferenciaInput = (hideBankSelector = false) => (
    <View style={styles.inputSection}>
      <View style={styles.inputHeader}>
        <Ionicons name="swap-horizontal-outline" size={18} color="#6b7280" />
        <RNText style={styles.inputLabel}>MONTO POR TRANSFERENCIA</RNText>
      </View>
      <View style={styles.inputWrapper}>
        <RNText style={styles.currencySymbol}>$</RNText>
        <TextInput
          style={styles.moneyInput}
          value={transferenciaInput ? transferenciaInput : ''}
          onChangeText={handleTransferenciaChange}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor="#d1d5db"
          accessibilityLabel="Monto por transferencia"
        />
      </View>
      {!hideBankSelector && (
        <View style={styles.bankSection}>
          <View style={styles.inputHeader}>
            <Ionicons name="business-outline" size={18} color="#6b7280" />
            <RNText style={styles.inputLabel}>SELECCIONA EL BANCO</RNText>
          </View>
          <View style={styles.bankSelector}>
            {BANKS.map((bank) => {
              const isSelected = selectedBank === bank.key;
              return (
                <TouchableOpacity
                  key={bank.key}
                  style={[styles.bankOption, isSelected && styles.bankOptionSelected]}
                  onPress={() => setSelectedBank(bank.key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`Banco ${bank.label}`}
                >
                  <Ionicons
                    name={bank.icon as any}
                    size={22}
                    color={isSelected ? '#fff' : '#6b7280'}
                  />
                  <RNText style={[styles.bankOptionText, isSelected && styles.bankOptionTextSelected]}>
                    {bank.label}
                  </RNText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );

  const renderMixedPayment = () => (
    <View style={styles.mixedContainer}>
      <View style={styles.mixedRow}>
        {/* Input Compacto Efectivo */}
        <View style={styles.mixedInputWrapper}>
          <View style={styles.inputHeader}>
            <Ionicons name="cash-outline" size={14} color="#6b7280" />
            <RNText style={styles.inputLabelSmall}>EFECTIVO</RNText>
          </View>
          <View style={[styles.inputWrapper, { paddingHorizontal: 12 }]}>
            <RNText style={styles.currencySymbolSmall}>$</RNText>
            <TextInput
              style={styles.moneyInputSmall}
              value={efectivoInput ? efectivoInput : ''}
              onChangeText={handleEfectivoChange}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#d1d5db"
              accessibilityLabel="Monto en efectivo"
            />
          </View>
        </View>

        {/* Input Compacto Transferencia */}
        <View style={styles.mixedInputWrapper}>
          <View style={styles.inputHeader}>
            <Ionicons name="swap-horizontal-outline" size={14} color="#6b7280" />
            <RNText style={styles.inputLabelSmall}>TRANSFERENCIA</RNText>
          </View>
          <View style={[styles.inputWrapper, { paddingHorizontal: 12 }]}>
            <RNText style={styles.currencySymbolSmall}>$</RNText>
            <TextInput
              style={styles.moneyInputSmall}
              value={transferenciaInput ? transferenciaInput : ''}
              onChangeText={handleTransferenciaChange}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#d1d5db"
              accessibilityLabel="Monto por transferencia"
            />
          </View>
        </View>
      </View>

      {/* Selector de Banco a ancho completo */}
      <View style={styles.bankSection}>
        <View style={styles.inputHeader}>
          <Ionicons name="business-outline" size={16} color="#6b7280" />
          <RNText style={styles.inputLabel}>BANCO DESTINO</RNText>
        </View>
        <View style={styles.bankSelector}>
          {BANKS.map((bank) => {
            const isSelected = selectedBank === bank.key;
            return (
              <TouchableOpacity
                key={bank.key}
                style={[styles.bankOption, isSelected && styles.bankOptionSelected]}
                onPress={() => setSelectedBank(bank.key)}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Ionicons name={bank.icon as any} size={20} color={isSelected ? '#fff' : '#6b7280'} />
                <RNText style={[styles.bankOptionText, isSelected && styles.bankOptionTextSelected]}>
                  {bank.label}
                </RNText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Estado del Pago */}
      <View style={styles.pendingContainer}>
        {remaining > 0 ? (
          <View style={styles.pendingBadge}>
            <Ionicons name="alert-circle-outline" size={20} color="#d97706" />
            <RNText style={styles.pendingText}>FALTAN: {formatMoney(remaining)}</RNText>
          </View>
        ) : devueltas > 0 ? (
          <View style={[styles.completeBadge, { borderColor: '#86efac', backgroundColor: '#f0fdf4' }]}>
            <Ionicons name="return-down-forward-outline" size={20} color="#16a34a" />
            <RNText style={[styles.completeText, { color: '#16a34a' }]}>CAMBIO: {formatMoney(devueltas)}</RNText>
          </View>
        ) : (
          <View style={styles.completeBadge}>
            <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
            <RNText style={styles.completeText}>PAGO COMPLETO</RNText>
          </View>
        )}
      </View>
    </View>
  );

  const renderCartSummary = () => {
    if (!cart || cart.length === 0) return null;
    
    return (
      <View style={styles.cartSummaryContainer}>
        <View style={styles.cartSummaryHeader}>
          <Ionicons name="cart" size={16} color="#4b5563" />
          <RNText style={styles.cartSummaryTitle}>PRODUCTOS ({cart.reduce((sum, item) => sum + item.quantity, 0)})</RNText>
        </View>
        <ScrollView style={[styles.cartSummaryList, { maxHeight: windowHeight * 0.18 }]} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {cart.map((item, index) => {
            const unitPrice = Number(item.precioUnitario || item.Precio_Unitario || 0);
            const baseSubtotal = item.quantity * unitPrice;
            return (
              <View key={`${item.IDproductos}-${index}`} style={{ marginBottom: 6, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                <View style={[styles.cartSummaryItem, { marginBottom: 2 }]}>
                  <View style={styles.cartSummaryItemLeft}>
                    <View style={styles.cartSummaryQty}>
                      <RNText style={styles.cartSummaryQtyText}>{item.quantity}x</RNText>
                    </View>
                    <RNText style={styles.cartSummaryName} numberOfLines={1}>{item.nombre}</RNText>
                  </View>
                  <RNText style={styles.cartSummaryPrice}>{formatMoney(baseSubtotal)}</RNText>
                </View>

                {/* MODIFICADORES */}
                {item.modifiers && item.modifiers.length > 0 && (
                  <View style={{ paddingLeft: 36 }}>
                    {item.modifiers.map((mod: any, modIdx: number) => {
                      const modQty = mod.quantity || 1;
                      const modTotal = Number(mod.price) * modQty;
                      return (
                      <View key={`mod-${modIdx}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 1 }}>
                        <RNText style={{ fontSize: 10, color: '#6b7280', flex: 1, marginRight: 8 }} numberOfLines={1}>
                          {modQty > 1 ? `${modQty}x ` : ''}+ {mod.name}
                        </RNText>
                        <RNText style={{ fontSize: 10, color: '#9ca3af', fontWeight: 'bold' }}>
                          {modTotal < 0 ? `-${formatMoney(Math.abs(modTotal))}` : `+${formatMoney(modTotal)}`}
                        </RNText>
                      </View>
                    )})}
                  </View>
                )}

                {/* NOTA PERSONALIZADA (Si existe) */}
                {item.notaPersonalizada ? (
                  <View style={{ paddingLeft: 36, marginTop: 2 }}>
                    <RNText style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }} numberOfLines={2}>
                      ✏️ {item.notaPersonalizada}
                    </RNText>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>

        {/* CONTROLES DE DESCUENTO */}
        <View style={styles.discountContainer}>
          <View style={styles.inputHeader}>
            <Ionicons name="pricetag-outline" size={14} color="#6b7280" />
            <RNText style={styles.inputLabelSmall}>DESCUENTO APLICABLE</RNText>
          </View>
          <View style={styles.discountRow}>
            {[0, 0.15, 0.30, 0.50].map((percent) => {
              const isSelected = discountPercent === percent;
              return (
                <TouchableOpacity
                  key={percent}
                  style={[styles.discountChip, isSelected && styles.discountChipSelected]}
                  onPress={() => setDiscountPercent(percent)}
                  activeOpacity={0.7}
                >
                  <RNText style={[styles.discountChipText, isSelected && styles.discountChipTextSelected]}>
                    {percent === 0 ? 'SIN DESC.' : `-${percent * 100}%`}
                  </RNText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  const renderContent = () => {
    if (isPagado && !method) {
      return (
        <ScrollView style={[styles.scrollContent, { maxHeight: windowHeight * 0.32 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {renderEstadoSelector()}
          {renderMethodSelector()}
        </ScrollView>
      );
    }

    if (!isPagado && !method) {
      return (
        <ScrollView style={[styles.scrollContent, { maxHeight: windowHeight * 0.32 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {renderEstadoSelector()}
        </ScrollView>
      );
    }

    const methodIcon = METHOD_ICONS[method!];

    return (
      <ScrollView style={[styles.scrollContent, { maxHeight: windowHeight * 0.32 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.headerMethodActions}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setMethod(null)}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Ionicons name="arrow-back" size={22} color="#374151" />
            <RNText style={styles.backText}>Volver</RNText>
          </TouchableOpacity>
          
          <View style={styles.quickStatusGridSmall}>
            <TouchableOpacity
              style={[
                styles.quickStatusBtnSmall,
                selectedEstado === 'TOMADO' && styles.quickStatusBtnActiveTomado
              ]}
              onPress={() => toggleEstado('TOMADO')}
            >
              <Ionicons name="hand-left" size={16} color={selectedEstado === 'TOMADO' ? '#fff' : '#3b82f6'} />
              <RNText style={[styles.quickStatusTextSmall, selectedEstado === 'TOMADO' && styles.quickStatusTextActive]}>
                TOMADO
              </RNText>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.quickStatusBtnSmall,
                selectedEstado === 'ENTREGADO' && styles.quickStatusBtnActiveEntregado
              ]}
              onPress={() => toggleEstado('ENTREGADO')}
            >
              <Ionicons name="paper-plane" size={16} color={selectedEstado === 'ENTREGADO' ? '#fff' : '#10b981'} />
              <RNText style={[styles.quickStatusTextSmall, selectedEstado === 'ENTREGADO' && styles.quickStatusTextActive]}>
                ENTREGADO
              </RNText>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.selectedMethodContainer}>
          <View style={[styles.selectedMethodIcon, { backgroundColor: methodIcon.color + '15' }]}>
            <Ionicons name={methodIcon.name as any} size={28} color={methodIcon.color} />
          </View>
          <RNText style={styles.selectedMethod}>{METHOD_LABELS[method]}</RNText>
        </View>

        {method === 'EFECTIVO' && renderCashInput()}
        {method === 'TRANSFERENCIA' && renderTransferenciaInput()}
        {method === 'TARJETA' && renderTransferenciaInput()}
        {method === 'EFECTIVO Y OTROS' && renderMixedPayment()}
      </ScrollView>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle="pageSheet"
      transparent={true}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        style={styles.modalOverlay}
        keyboardVerticalOffset={0}
      >
        <Animated.View style={[styles.overlayBg, { opacity: fadeAnim }]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={handleClose}
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel="Cerrar modal"
          />
        </Animated.View>
        <Animated.View style={[styles.modalContent, { 
          transform: [{ translateY: slideAnim }], 
          maxHeight: windowHeight * 0.94,
          marginBottom: Platform.OS === 'android' ? keyboardHeight : 0
        }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="receipt-outline" size={24} color="#111827" />
              <RNText style={styles.title}>RESUMEN DE ORDEN</RNText>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            >
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {cliente && (
            <View style={styles.clientInfoContainer}>
              <View style={styles.clientInfoLeft}>
                <View style={styles.clientIconContainer}>
                  <Ionicons name="person" size={20} color="#6366f1" />
                </View>
                <View style={{ flex: 1 }}>
                  <RNText style={styles.clientInfoLabel}>CLIENTE SELECCIONADO</RNText>
                  <RNText style={styles.clientInfoName} numberOfLines={1}>{cliente.nombre}</RNText>
                </View>
              </View>
              <View style={styles.clientPurchasesBadge}>
                <Ionicons name="gift" size={14} color="#10b981" />
                <RNText style={styles.clientPurchasesText}>{getDisplayCompras()}/10 COMPRAS</RNText>
              </View>
            </View>
          )}

          {renderCartSummary()}

          <View style={styles.totalDisplay}>
            <RNText style={styles.totalLabel}>TOTAL A PAGAR</RNText>
            {discountPercent > 0 && (
              <RNText style={styles.originalAmountLineThrough}>{formatMoney(total)}</RNText>
            )}
            <RNText style={styles.totalAmount}>{formatMoney(actualTotal)}</RNText>
          </View>

          {renderContent()}

          <View style={styles.footer}>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.cancelButton}
              disabled={isLoading}
              accessibilityRole="button"
            >
              <Ionicons name="close-circle-outline" size={20} color="#6b7280" />
              <RNText style={styles.cancelButtonText}>Cancelar</RNText>
            </TouchableOpacity>
            {!isPagado ? (
              <TouchableOpacity
                onPress={handleSaveOnly}
                style={styles.saveButton}
                disabled={isLoading}
                accessibilityRole="button"
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="save-outline" size={20} color="#fff" />
                )}
                <RNText style={styles.saveButtonText}>{isLoading ? 'Guardando...' : 'GUARDAR'}</RNText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleConfirmCobrar}
                style={styles.confirmButton}
                disabled={!method || isLoading}
                accessibilityRole="button"
              >
                {isLoading ? (
                  <>
                    <ActivityIndicator color="#fff" size="small" />
                    <RNText style={styles.confirmButtonText}>Procesando...</RNText>
                  </>
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                    <RNText style={styles.confirmButtonText}>COBRAR</RNText>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: Platform.OS === 'ios' ? 34 : 20 },
  handle: { width: 40, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, alignSelf: 'center', marginTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#111827', letterSpacing: 0.5, marginLeft: 10 },
  closeBtn: { padding: 6, borderRadius: 12, backgroundColor: '#f3f4f6' },
  totalDisplay: { backgroundColor: '#f9fafb', marginHorizontal: 20, marginTop: 10, padding: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  totalLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', letterSpacing: 1.5, marginBottom: 6 },
  originalAmountLineThrough: { fontSize: 16, fontWeight: '700', color: '#ef4444', textDecorationLine: 'line-through', marginBottom: 2 },
  totalAmount: { fontSize: 40, fontWeight: '800', color: '#111827' },
  scrollContent: { paddingHorizontal: 20 },
  backButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f3f4f6', borderRadius: 12, alignSelf: 'flex-start' },
  backText: { fontSize: 15, fontWeight: '600', color: '#374151', marginLeft: 6 },
  headerMethodActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 8 },
  quickStatusGridSmall: { flexDirection: 'row', gap: 8 },
  quickStatusBtnSmall: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#f9fafb', borderWidth: 1.5, borderColor: '#e5e7eb' },
  quickStatusTextSmall: { fontSize: 11, fontWeight: '700', color: '#374151', marginLeft: 6, letterSpacing: 0.5 },
  selectedMethodContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, paddingVertical: 12, backgroundColor: '#f9fafb', borderRadius: 14 },
  selectedMethodIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  selectedMethod: { fontSize: 20, fontWeight: '800', color: '#111827', letterSpacing: 0.5 },
  estadoContainer: { paddingTop: 8, marginHorizontal: -20 },
  estadoSectionTitle: { fontSize: 11, fontWeight: '800', color: '#9ca3af', letterSpacing: 1.5, marginBottom: 12, textAlign: 'center', paddingHorizontal: 20 },
  estadoScrollContent: { paddingHorizontal: 20, gap: 8, flexDirection: 'row' },
  estadoChip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  estadoChipText: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginLeft: 6 },
  estadoChipTextSelected: { color: '#fff' },
  methodsContainer: { paddingHorizontal: 20, paddingTop: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#9ca3af', letterSpacing: 1.5, marginBottom: 16, textAlign: 'center' },
  methodsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  methodCard: { width: '48%', backgroundColor: '#f9fafb', borderRadius: 16, padding: 20, marginBottom: 12, alignItems: 'center', borderWidth: 2, borderColor: 'transparent', position: 'relative' },
  methodIconContainer: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  methodLabel: { fontSize: 13, fontWeight: '700', color: '#374151', textAlign: 'center', letterSpacing: 0.3 },
  checkBadge: { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  inputSection: { marginBottom: 16 },
  inputHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: '#6b7280', letterSpacing: 1.5, marginLeft: 6 },
  inputRowContainer: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 14, paddingHorizontal: 16, borderWidth: 1.5, borderColor: '#e5e7eb' },
  currencySymbol: { fontSize: 28, fontWeight: '800', color: '#374151', marginRight: 4 },
  moneyInput: { flex: 1, fontSize: 28, fontWeight: '700', color: '#111827', paddingVertical: 14 },
  changeContainerInline: { flex: 0.7, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, justifyContent: 'center' },
  changePositiveInline: { backgroundColor: '#f0fdf4', borderWidth: 1.5, borderColor: '#bbf7d0' },
  changeNeutralInline: { backgroundColor: '#f9fafb', borderWidth: 1.5, borderColor: '#e5e7eb' },
  changeTextCol: { marginLeft: 8, justifyContent: 'center' },
  changeLabelInline: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  changeAmountInline: { fontSize: 16, fontWeight: '800', marginTop: -2 },
  changeContainer: { marginTop: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12 },
  changePositive: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  changeNeutral: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb' },
  changeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  changeLabel: { fontSize: 15, fontWeight: '700', marginLeft: 8, marginRight: 4 },
  changeAmount: { fontSize: 22, fontWeight: '800' },
  bankSection: { marginTop: 16 },
  bankSelector: { flexDirection: 'row', gap: 12 },
  bankOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: '#f3f4f6', borderWidth: 2, borderColor: 'transparent' },
  bankOptionSelected: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  bankOptionText: { fontSize: 14, fontWeight: '700', color: '#6b7280', marginLeft: 8 },
  bankOptionTextSelected: { color: '#fff' },
  defaultBankInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f3ff', paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  defaultBankText: { fontSize: 13, fontWeight: '600', color: '#8b5cf6', marginLeft: 8 },
  mixedContainer: { marginTop: 4 },
  mixedRow: { flexDirection: 'row', gap: 12 },
  mixedInputWrapper: { flex: 1 },
  inputLabelSmall: { fontSize: 10, fontWeight: '800', color: '#6b7280', letterSpacing: 1.5, marginLeft: 6 },
  currencySymbolSmall: { fontSize: 20, fontWeight: '800', color: '#374151', marginRight: 4 },
  moneyInputSmall: { flex: 1, fontSize: 20, fontWeight: '700', color: '#111827', paddingVertical: 10 },
  pendingContainer: { marginTop: 16, alignItems: 'center' },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: '#fcd34d' },
  pendingText: { fontSize: 15, fontWeight: '800', color: '#d97706', marginLeft: 8 },
  completeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdf4', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: '#86efac' },
  completeText: { fontSize: 15, fontWeight: '800', color: '#16a34a', marginLeft: 8 },
  footer: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 16, gap: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  cancelButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  cancelButtonText: { fontSize: 16, fontWeight: '700', color: '#6b7280', marginLeft: 8 },
  confirmButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: '#22c55e' },
  confirmButtonText: { fontSize: 16, fontWeight: '700', color: '#fff', marginLeft: 8 },
  saveButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: '#3b82f6' },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: '#fff', marginLeft: 8 },
  quickStatusContainerMain: { paddingHorizontal: 20, paddingTop: 16, marginBottom: 8 },
  quickStatusContainer: { marginBottom: 20 },
  quickStatusGrid: { flexDirection: 'row', gap: 12 },
  quickStatusBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 16, backgroundColor: '#f9fafb', borderWidth: 2, borderColor: 'transparent' },
  quickStatusBtnActiveTomado: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  quickStatusBtnActiveEntregado: { backgroundColor: '#10b981', borderColor: '#10b981' },
  quickStatusText: { fontSize: 13, fontWeight: '700', color: '#374151', marginLeft: 8, letterSpacing: 0.5 },
  quickStatusTextActive: { color: '#fff' },
  cartSummaryContainer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  cartSummaryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cartSummaryTitle: { fontSize: 11, fontWeight: '800', color: '#4b5563', letterSpacing: 1.5, marginLeft: 6 },
  cartSummaryList: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  cartSummaryItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cartSummaryItemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  cartSummaryQty: { backgroundColor: '#e5e7eb', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 8 },
  cartSummaryQtyText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  cartSummaryName: { fontSize: 12, fontWeight: '600', color: '#111827', flex: 1 },
  cartSummaryPrice: { fontSize: 12, fontWeight: '700', color: '#111827' },
  discountContainer: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  discountRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  discountChip: { flex: 1, paddingVertical: 4, marginHorizontal: 2, borderRadius: 6, backgroundColor: '#f3f4f6', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  discountChipSelected: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  discountChipText: { fontSize: 10, fontWeight: '700', color: '#6b7280' },
  discountChipTextSelected: { color: '#fff' },
  clientInfoContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#eef2ff', marginHorizontal: 20, marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#c7d2fe' },
  clientInfoLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  clientIconContainer: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e0e7ff', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  clientInfoLabel: { fontSize: 10, fontWeight: '800', color: '#6366f1', letterSpacing: 1 },
  clientInfoName: { fontSize: 14, fontWeight: '700', color: '#312e81' },
  clientPurchasesBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#a7f3d0' },
  clientPurchasesText: { fontSize: 12, fontWeight: '800', color: '#059669', marginLeft: 4 },
});

export default PaymentModal;
