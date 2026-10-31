import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, TouchableOpacity, ActivityIndicator, Text as RNText, StyleSheet, FlatList, RefreshControl, Modal, ScrollView, Pressable, Image, TextInput, KeyboardAvoidingView, Platform, AppState, AppStateStatus, Linking, Alert, useWindowDimensions } from 'react-native';
// Removed FlashList import because it causes layout bugs on mobile web viewports.
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getSales, updateVentaEstado, updateVentaPago, deleteSale, deleteSalesBulk, getVentaById, updateOrderItemState, createSale, despejarVenta, despejarSalesBulk } from '../../services/sales';
import { getDomicilios, updateDomicilioEstado, vincularVentaDomicilio, deleteDomicilio, DomicilioWAItem } from '../../services/domicilios.service';
import { emitirFacturaDian, eliminarFacturaDian } from '../../services/facturacion';
import { Cliente, getClientes, getClienteById, createCliente } from '../../services/clientes.service';
import { useSocket, useSocketEvent, useSocketEmitter } from '../../hooks';
import { Room, SocketEvent } from '../../types/socket.types';
import Toast from 'react-native-toast-message';
import { useSalesStore } from '../../store/useSalesStore';
import PaymentModal from '../../components/ui/PaymentModal';
import { Text } from '../../components/ui/text';
import { RootStackParamList } from '../../navigation/RootNavigator';
import useCartStore from '../../store/useCartStore';
import useAuthStore from '../../store/useAuthStore';
import { useProductStore } from '../../store/useProductStore';
import { usePermissions } from '../../hooks/usePermissions';
import { useCustomAlert } from '../../context/CustomAlertContext';
import usePrinterStore from '../../store/usePrinterStore';
import PrintPreviewModal from '../../components/ui/PrintPreviewModal';
import { soundService } from '../../services/soundService';
import { TicketData, enrichTicketDataWithPapaFallback, cleanTicketDataForFactura, getGramosPapaForProduct } from '../../utils/printer';
import { getCachedConfiguracion, getConfiguracion } from '../../services/configuracion';
import { FloatingScrollButtons } from '../../components/ui/FloatingScrollButtons';
import { useScrollDirection } from '../../hooks/useScrollDirection';

const TABS = [
  { key: 'todos', label: 'TODOS', color: '#6366f1' },
  { key: 'DOMIS', label: 'DOMIS', color: '#f59e0b' },
  { key: 'PAGADO', label: 'PAGADO', color: '#22c55e' },
  { key: 'TOMADO', label: 'TOMADO', color: '#3b82f6' },
  { key: 'LISTO_PARA_ENTREGA', label: 'LISTO PARA ENTREGA', color: '#8b5cf6' },
  { key: 'ENTREGADO', label: 'ENTREGADO', color: '#10b981' },
  { key: 'RESERVA', label: 'RESERVA', color: '#f43f5e' },
  { key: 'DEUDOR', label: 'DEUDOR', color: '#ef4444' },
  { key: 'EN_EL_CARRITO', label: 'EN EL CARRITO', color: '#f59e0b' },
];

const METODOS_PAGO = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'EFECTIVO Y OTROS', 'PENDIENTE'];
const ESTADOS_POSIBLES = ['EN_EL_CARRITO', 'TOMADO', 'LISTO_PARA_ENTREGA', 'PAGADO', 'ENTREGADO', 'RESERVA', 'DEUDOR'];

type VentaItem = {
  IDventas: string;
  mesa?: string;
  estado?: string;
  medioDePago?: string;
  efectivoRecibido?: number;
  devueltas?: number;
  banco?: string;
  valorDeTransferencia?: number;
  transferencia?: number;
  totalInput?: number;
  abono?: number;
  pedido?: string;
  fecha?: string;
  hora?: string;
  fechaYHora?: string;
  direccion?: string;
  costoDelDomicilio?: number;
  descuento?: number;
  porcentajeDeDescuento?: string;
  propina?: number;
  porcentajePropina?: string;
  totalGlobal?: number;
  Total?: number;
  notas?: string;
  numeroTelefono?: number;
  mensaje?: string;
  clienteId?: number | null;
  cliente?: string;
  ordenVentas?: OrderVenta[];
  usuarioRelacion?: { nombre?: string; email?: string };
  registroDeTiempo?: any[];
  facturaElectronica?: any;
  cocinaInicioAt?: string | null;
  cocinaFinAt?: string | null;
  despejadoAt?: string | null;
  comandaImpresaAt?: string | null;
  _isDomicilioWA?: boolean;
  _rawDomicilio?: any;
};

type OrderVenta = {
  IDorderventas?: string;
  nombre?: string;
  categoria?: string;
  cantidad?: number;
  precio?: number;
  precioTotal?: number;
  estado?: string;
  cantidadPreparada?: number;
  preparadoAt?: string;
  comandaImpresa?: boolean;
  createdAt?: string;
  comentarios?: string;
  salsa?: string;
  helado?: string;
  topings?: string;
  imagen?: string;
  nombreProducto?: string;
  categoriaProducto?: string;
  imagenUrl?: string;
  producto?: {
    IDproductos?: string;
    nombre?: string;
    categoriaNombre?: string;
    categoria?: string;
    imagenUrl?: string;
    image?: string;
  };
};

interface FilterState {
  searchText: string;
  estados: string[];
  mediosDePago: string[];
  fechaDesde: string;
  fechaHasta: string;
  vendedor: string;
  minTotal: string;
  maxTotal: string;
  pedidoNumero: string;
  cliente: string;
  categoriaProducto: string[];
  banco?: string[];
}

type SectionData = {
  title: string;
  date: Date;
  data: VentaItem[];
};

export const getVentaTotal = (venta: VentaItem | null): number => {
  if (!venta) return 0;
  if (venta.ordenVentas && Array.isArray(venta.ordenVentas) && venta.ordenVentas.length > 0) {
    const sumProducts = venta.ordenVentas.reduce((sum, p) => {
      let tot = Number(p.precioTotal);
      if (isNaN(tot) || tot === 0) {
        tot = (Number(p.precio || (p as any).precioUnitario || 0)) * (Number(p.cantidad) || 1);
      }
      return sum + (isNaN(tot) ? 0 : tot);
    }, 0);
    if (sumProducts > 0) return sumProducts;
  }
  const t = typeof venta.totalInput === 'number' ? venta.totalInput : (parseFloat(venta.totalInput as any) || 0);
  if (t > 0) return t;
  return 0;
};

let lastKnownConfig: any = null;

export const setPedidosScreenConfig = (cfg: any) => {
  if (cfg) lastKnownConfig = cfg?.data?.data || cfg?.data || cfg;
};

const isModoRestaurante = (): boolean => {
  const raw = lastKnownConfig || getCachedConfiguracion();
  const config = raw?.data?.data || raw?.data || raw;
  const modo = config?.modoOperacion || 'GENERAL';
  return String(modo).toUpperCase() === 'RESTAURANTE';
};

const hasPassedKitchenInLog = (registroDeTiempo?: any[]): boolean => {
  if (!Array.isArray(registroDeTiempo)) return false;
  for (let i = registroDeTiempo.length - 1; i >= 0; i--) {
    const st = String(registroDeTiempo[i]?.estado || '').toUpperCase();
    if (st === 'TOMADO' || st === 'PREPARANDO') return false;
    if (st === 'LISTO_PARA_ENTREGA' || st === 'ENTREGADO') return true;
  }
  return false;
};

export const isVentaPagada = (v: VentaItem | any): boolean => {
  if (!v) return false;
  const est = (v.estado || '').toUpperCase();
  if (est === 'PAGADO' || est === 'COBRADO') return true;
  const medio = (v.medioDePago || '').toUpperCase().replace(/_/g, ' ').trim();
  if (medio && !['PENDIENTE', 'NO ASIGNADO', 'SIN MEDIO', 'NO_ASIGNADO', 'SIN_MEDIO'].includes(medio)) return true;
  if (Number(v.efectivoRecibido || 0) > 0 || Number(v.valorDeTransferencia || 0) > 0 || Number(v.transferencia || 0) > 0) return true;
  if (Array.isArray(v.registroDeTiempo) && v.registroDeTiempo.some((r: any) => {
    const regEst = (r?.estado || '').toUpperCase();
    return regEst === 'PAGADO' || regEst === 'COBRADO';
  })) return true;
  return false;
};

const isVentaActivaEnTomado = (v: VentaItem): boolean => {
  if (!v || v.despejadoAt) return false;
  const est = (v.estado || '').toUpperCase();
  if (est === 'TOMADO' || est === 'PREPARANDO') return true;
  if (isModoRestaurante() && est === 'PAGADO' && !v.cocinaFinAt) {
    if (hasPassedKitchenInLog(v.registroDeTiempo)) return false;
    return true;
  }
  return false;
};

export const extractVentaFecha = (v: any): string => {
  if (v?.fecha) {
    return String(v.fecha).substring(0, 10);
  }
  if (v?.fechaYHora) {
    const d = new Date(v.fechaYHora);
    if (!isNaN(d.getTime())) {
      const col = new Date(d.getTime() - 5 * 3600 * 1000);
      return col.toISOString().substring(0, 10);
    }
  }
  return '';
};

const computeActiveMs = (
  registroDeTiempo?: any[], 
  endTime: number = Date.now(),
  cocinaInicioAt?: string | null,
  cocinaFinAt?: string | null
) => {
  // 1. Determinar el inicio de la preparación (cocina o creación)
  let startMs: number | null = null;
  if (cocinaInicioAt) {
    const parsed = new Date(cocinaInicioAt).getTime();
    if (!isNaN(parsed)) startMs = parsed;
  }

  if (startMs === null && Array.isArray(registroDeTiempo) && registroDeTiempo.length > 0) {
    // Buscar el momento en que entró a cocina o se tomó el pedido
    const kitchenEntry = registroDeTiempo.find(
      (e: any) => e.estado === 'TOMADO' || e.estado === 'PREPARANDO' || e.estado === 'PAGADO'
    ) || registroDeTiempo[0];
    const parsed = new Date(kitchenEntry.fecha_hora).getTime();
    if (!isNaN(parsed)) startMs = parsed;
  }

  // 2. Determinar el fin de la preparación
  let endMs = endTime;
  if (cocinaFinAt) {
    const parsed = new Date(cocinaFinAt).getTime();
    if (!isNaN(parsed)) endMs = parsed;
  }

  if (startMs !== null && endMs >= startMs) {
    return endMs - startMs;
  }

  return 0;
};

const formatDurationStr = (diff: number, formatAsStopwatch: boolean = false) => {
  if (formatAsStopwatch) {
    const diffInSeconds = Math.floor(diff / 1000);
    const m = Math.floor(diffInSeconds / 60).toString().padStart(2, '0');
    const s = (diffInSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const m = Math.floor((diff / 1000 / 60) % 60);
  const s = Math.floor((diff / 1000) % 60);

  let durStr = '';
  if (d > 0) durStr += `${d}d `;
  if (h > 0) durStr += `${h}h `;
  if (m > 0) durStr += `${m}m `;
  durStr += `${s}s`;
  return durStr;
};

export const getFechaContableActual = (horaCorteDiaStr?: string): string => {
  const config = lastKnownConfig || getCachedConfiguracion()?.data || getCachedConfiguracion();
  const corteStr = horaCorteDiaStr || config?.horaCorteDia || '00:00';
  const [corteHours, corteMinutes] = (corteStr || '00:00').split(':').map(Number);
  
  const now = new Date();
  const colombiaTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));
  const currentMinutes = (colombiaTime.getUTCHours() * 60) + colombiaTime.getUTCMinutes();
  const corteTotalMinutes = ((corteHours || 0) * 60) + (corteMinutes || 0);

  if (currentMinutes < corteTotalMinutes) {
    colombiaTime.setUTCDate(colombiaTime.getUTCDate() - 1);
  }

  const y = colombiaTime.getUTCFullYear();
  const m = String(colombiaTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(colombiaTime.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getTimerStyle = (diffMs: number, estado: string, isEnCocinaActivo: boolean = false) => {
  if (!isEnCocinaActivo && (estado === 'ENTREGADO' || estado === 'CANCELADO' || estado === 'ANULADO' || estado === 'PAGADO')) {
    return { bg: '#f3f4f6', text: '#6b7280', icon: 'pause-circle-outline' as const };
  }
  if (estado === 'LISTO') {
    return { bg: '#d1fae5', text: '#10b981', icon: 'checkmark-done-circle' as const };
  }
  const diffMins = diffMs / (1000 * 60);
  if (diffMins < 10) {
    return { bg: '#d1fae5', text: '#10b981', icon: 'time-outline' as const };
  } else if (diffMins < 20) {
    return { bg: '#fef3c7', text: '#f59e0b', icon: 'time-outline' as const };
  } else {
    return { bg: '#fee2e2', text: '#ef4444', icon: 'warning-outline' as const };
  }
};

const OrderTimerBadge = ({ venta }: { venta: any }) => {
  const [duration, setDuration] = useState<string>('');
  const [style, setStyle] = useState({ bg: '#f3f4f6', text: '#6b7280', icon: 'time-outline' as any });

  useEffect(() => {
    const estUpper = (venta.estado || '').toUpperCase();
    const isModoRest = isModoRestaurante();
    const vDate = (venta.fecha || venta.fechaYHora || '').substring(0, 10);
    const fechaContable = getFechaContableActual();
    const isHoy = !vDate || vDate === fechaContable;

    // En modo General, PAGADO ya está finalizado.
    const isFinalizado = estUpper === 'ENTREGADO' || 
                         estUpper === 'CANCELADO' || 
                         estUpper === 'ANULADO' || 
                         venta.cocinaFinAt != null ||
                         hasPassedKitchenInLog(venta.registroDeTiempo) ||
                         (!isModoRest && estUpper === 'PAGADO');

    // Un cronómetro solo corre en vivo si es de hoy Y está en proceso activo en cocina
    const isEnCocinaActivo = isHoy && !isFinalizado && isVentaActivaEnTomado(venta);

    const update = () => {
      let diff = 0;
      if (isFinalizado || !isHoy) {
        let endMs: number;
        if (venta.cocinaFinAt) {
          endMs = new Date(venta.cocinaFinAt).getTime();
        } else if (venta.registroDeTiempo && venta.registroDeTiempo.length > 0) {
          const lastRelevantEntry = [...venta.registroDeTiempo].reverse().find(
            (e: any) => e.estado === estUpper || e.estado === 'ENTREGADO' || e.estado === 'PAGADO'
          ) || venta.registroDeTiempo[venta.registroDeTiempo.length - 1];
          endMs = new Date(lastRelevantEntry.fecha_hora).getTime();
        } else {
          endMs = venta.fechaYHora ? new Date(venta.fechaYHora).getTime() : Date.now();
        }
        diff = computeActiveMs(venta.registroDeTiempo, endMs, venta.cocinaInicioAt, venta.cocinaFinAt);
      } else {
        diff = computeActiveMs(venta.registroDeTiempo, Date.now(), venta.cocinaInicioAt, venta.cocinaFinAt);
      }

      setDuration(formatDurationStr(diff, !isFinalizado));
      setStyle(getTimerStyle(diff, venta.estado || 'INICIADO', isEnCocinaActivo));
    };

    update();
    let interval: NodeJS.Timeout | null = null;
    if (isEnCocinaActivo) {
      interval = setInterval(update, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [venta.estado, venta.cocinaInicioAt, venta.cocinaFinAt, venta.registroDeTiempo, venta.fecha, venta.fechaYHora]);

  if (!duration) return null;

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: style.bg,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: style.text + '25',
    }}>
      <Ionicons name={style.icon as any} size={12} color={style.text} />
      <RNText style={{ fontSize: 11, color: style.text, fontWeight: '700', marginLeft: 4 }}>
        {duration}
      </RNText>
    </View>
  );
};

const PreparationTimer = ({ 
  registroDeTiempo, 
  preparadoAt, 
  estado 
}: { 
  registroDeTiempo?: any[], 
  preparadoAt?: string, 
  estado?: string 
}) => {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const calculateTime = () => {
      if (!registroDeTiempo || registroDeTiempo.length === 0) {
        setElapsed('');
        return;
      }

      let diff = 0;

      if (estado === 'LISTO' && preparadoAt) {
        const end = new Date(preparadoAt).getTime();
        diff = computeActiveMs(registroDeTiempo, end);
      } else {
        diff = computeActiveMs(registroDeTiempo, Date.now());
      }
      
      if (diff < 0) {
        setElapsed('00:00');
        return;
      }

      setElapsed(formatDurationStr(diff, true));
    };

    calculateTime();

    if (estado !== 'LISTO') {
      interval = setInterval(calculateTime, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [registroDeTiempo, preparadoAt, estado]);

  if (!registroDeTiempo || registroDeTiempo.length === 0) return null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
      {(() => {
        const isReady = estado === 'LISTO';
        const style = getTimerStyle(
          isReady && preparadoAt
            ? computeActiveMs(registroDeTiempo, new Date(preparadoAt).getTime())
            : computeActiveMs(registroDeTiempo, Date.now()),
          isReady ? 'LISTO' : 'PREPARANDO',
          !isReady
        );
        return (
          <>
            <Ionicons name={style.icon as any} size={14} color={style.text} style={{ marginRight: 4 }} />
            <RNText style={{ fontSize: 12, color: style.text, fontWeight: '600' }}>
              {elapsed}
            </RNText>
          </>
        );
      })()}
    </View>
  );
};



const RealtimeDurationTimer = React.memo(({ selectedVenta }: { selectedVenta: any }) => {
  const [realtimeDuration, setRealtimeDuration] = useState<string | null>(null);
  const [timerStyle, setTimerStyle] = useState({ bg: '#f3f4f6', text: '#6b7280', icon: 'pause-circle-outline' as any });

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (!selectedVenta) {
      setRealtimeDuration(null);
      return;
    }

    const estUpper = (selectedVenta.estado || '').toUpperCase();
    const isModoRest = isModoRestaurante();
    const vDate = (selectedVenta.fecha || selectedVenta.fechaYHora || '').substring(0, 10);
    const fechaContable = getFechaContableActual();
    const isHoy = !vDate || vDate === fechaContable;

    const isFinalizado = estUpper === 'ENTREGADO' || 
                         estUpper === 'CANCELADO' || 
                         estUpper === 'ANULADO' || 
                         selectedVenta.cocinaFinAt != null ||
                         (!isModoRest && estUpper === 'PAGADO');

    const isEnCocinaActivo = isHoy && !isFinalizado && (
      estUpper === 'TOMADO' || 
      estUpper === 'PREPARANDO' || 
      (isModoRest && estUpper === 'PAGADO' && !selectedVenta.cocinaFinAt)
    );

    const updateTimer = () => {
      let diff = 0;
      if (isFinalizado || !isHoy) {
        let endMs: number;
        if (selectedVenta.cocinaFinAt) {
          endMs = new Date(selectedVenta.cocinaFinAt).getTime();
        } else if (selectedVenta.registroDeTiempo && selectedVenta.registroDeTiempo.length > 0) {
          const lastRelevantEntry = [...selectedVenta.registroDeTiempo].reverse().find(
            (e: any) => e.estado === estUpper || e.estado === 'ENTREGADO' || e.estado === 'PAGADO'
          ) || selectedVenta.registroDeTiempo[selectedVenta.registroDeTiempo.length - 1];
          endMs = new Date(lastRelevantEntry.fecha_hora).getTime();
        } else {
          endMs = selectedVenta.fechaYHora ? new Date(selectedVenta.fechaYHora).getTime() : Date.now();
        }
        diff = computeActiveMs(selectedVenta.registroDeTiempo, endMs, selectedVenta.cocinaInicioAt, selectedVenta.cocinaFinAt);
      } else {
        diff = computeActiveMs(selectedVenta.registroDeTiempo, Date.now(), selectedVenta.cocinaInicioAt, selectedVenta.cocinaFinAt);
      }
      setRealtimeDuration(formatDurationStr(diff, !isFinalizado));
      setTimerStyle(getTimerStyle(diff, selectedVenta.estado || 'INICIADO', isEnCocinaActivo));
    };

    updateTimer();
    if (isEnCocinaActivo) {
      interval = setInterval(updateTimer, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedVenta?.IDventas, selectedVenta?.estado, selectedVenta?.cocinaInicioAt, selectedVenta?.cocinaFinAt, selectedVenta?.registroDeTiempo, selectedVenta?.fecha, selectedVenta?.fechaYHora]);

  if (!realtimeDuration) return null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: timerStyle.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, marginTop: 4, marginLeft: 8 }}>
      <Ionicons name={timerStyle.icon as any} size={14} color={timerStyle.text} style={{ marginRight: 4 }} />
      <RNText style={{ fontSize: 12, color: timerStyle.text, fontWeight: 'bold' }}>
        {realtimeDuration}
      </RNText>
    </View>
  );
});

const DomicilioTimer = ({ timestamp, estado }: { timestamp: string; estado: string }) => {
  const [elapsed, setElapsed] = useState('');
  const [diffMs, setDiffMs] = useState(0);

  useEffect(() => {
    const calc = () => {
      if (!timestamp) {
        setElapsed('00:00');
        return;
      }
      const start = new Date(timestamp).getTime();
      const now = Date.now();
      const diff = Math.max(0, now - start);
      setDiffMs(diff);
      const diffInSeconds = Math.floor(diff / 1000);
      const m = Math.floor(diffInSeconds / 60).toString().padStart(2, '0');
      const s = (diffInSeconds % 60).toString().padStart(2, '0');
      setElapsed(`${m}:${s}`);
    };

    calc();
    if (estado !== 'COBRADO' && estado !== 'CANCELADO') {
      const interval = setInterval(calc, 1000);
      return () => clearInterval(interval);
    }
  }, [timestamp, estado]);

  const diffMins = diffMs / (1000 * 60);
  let color = '#10b981';
  let bg = '#d1fae5';
  if (diffMins >= 20) {
    color = '#ef4444';
    bg = '#fee2e2';
  } else if (diffMins >= 10) {
    color = '#f59e0b';
    bg = '#fef3c7';
  }

  if (estado === 'COBRADO') {
    color = '#10b981';
    bg = '#d1fae5';
  } else if (estado === 'CANCELADO') {
    color = '#6b7280';
    bg = '#f3f4f6';
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
      <Ionicons name="time-outline" size={13} color={color} style={{ marginRight: 4 }} />
      <RNText style={{ fontSize: 12, fontWeight: '700', color }}>{elapsed}</RNText>
    </View>
  );
};

const isWeb = Platform.OS === 'web';

const PedidosScreen = () => {
  const { width: windowWidth } = useWindowDimensions();
  const isMobileWeb = isWeb && windowWidth < 640;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { showAlert } = useCustomAlert();
  const { canCreate: canCreatePedido } = usePermissions('pedidos');
  const { canCreate: canCreateVenta } = usePermissions('ventas');
  const [activeTab, setActiveTab] = useState('todos');
  const [loading, setLoading] = useState(useSalesStore.getState().ventas.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [domicilios, setDomicilios] = useState<DomicilioWAItem[]>([]);
  const [loadingDomicilios, setLoadingDomicilios] = useState(false);
  const [domisSubTab, setDomisSubTab] = useState<'NUEVOS' | 'TOMADOS' | 'PAGADOS' | 'TODOS'>('NUEVOS');
  const [selectedToDelete, setSelectedToDelete] = useState<string[]>([]);
  const [showDespejados, setShowDespejados] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<{show: boolean, type: 'desde' | 'hasta'}>({show: false, type: 'desde'});
  const [selectedVenta, setSelectedVenta] = useState<VentaItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [cobrarVenta, setCobrarVenta] = useState<VentaItem | null>(null);
  const [cobrarCliente, setCobrarCliente] = useState<Cliente | null>(null);
  const [resolvingCliente, setResolvingCliente] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [remoteSearchResults, setRemoteSearchResults] = useState<VentaItem[] | null>(null);
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);

  // --- Mutex / In-flight locks para evitar duplicación al tomar domicilios ---
  const takingDomicilioIdsRef = useRef<Set<string>>(new Set());
  const [takingDomicilioIds, setTakingDomicilioIds] = useState<Record<string, boolean>>({});

  // --- Scroll & Floating Buttons ---
  const listRef = useRef<any>(null);
  const { handleScroll: handleScrollBase } = useScrollDirection();
  const [showScrollUp, setShowScrollUp] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const handleScroll = useCallback((event: any) => {
    handleScrollBase(event);
    const offsetY = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const layoutHeight = event.nativeEvent.layoutMeasurement.height;
    
    setShowScrollUp(offsetY > 400);
    
    const isScrollable = contentHeight > layoutHeight;
    const distanceToBottom = contentHeight - layoutHeight - offsetY;
    setShowScrollDown(isScrollable && distanceToBottom > 400);
  }, [handleScrollBase]);

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
  }, []);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd?.({ animated: true });
  }, []);

  // Manual Print Preview States
  const { manualPreviewEnabled, printManual } = usePrinterStore();
  const [printPreviewVisible, setPrintPreviewVisible] = useState(false);
  const [printPreviewType, setPrintPreviewType] = useState<'comanda' | 'factura' | null>(null);
  const [printPreviewData, setPrintPreviewData] = useState<any>(null);
  const isPrintingManualRef = useRef(false);



  const mapVentaToTicketData = (venta: any): TicketData => {
    let cleanOrderId = venta.pedido || venta.IDventas || '';
    if (cleanOrderId.toLowerCase().startsWith('pedido-')) {
      cleanOrderId = cleanOrderId.substring(7);
    }
    
    const getModifiers = (comentarios: string | undefined) => {
      if (!comentarios) return undefined;
      try {
        const parsed = JSON.parse(comentarios);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((m: any) => ({ name: m.name, price: Number(m.price || m.precio || 0), quantity: Number(m.quantity || 1) }));
        }
      } catch (e) {}
      return undefined;
    };

    const fechaRaw = venta.fechaYHora || venta.fecha;
    const formattedFecha = fechaRaw ? new Date(fechaRaw).toLocaleString('es-CO') : new Date().toLocaleString('es-CO');

    const rawDom = venta._rawDomicilio;
    const clienteNombre = venta.cliente || rawDom?.clienteNombre || undefined;
    const clienteTelefono = venta.numeroTelefono ? String(venta.numeroTelefono) : (venta.telefono || rawDom?.clienteTelefono || undefined);
    const clienteDireccion = venta.direccion || rawDom?.direccion || undefined;

    return {
      orderId: cleanOrderId,
      fecha: formattedFecha,
      cliente: clienteNombre,
      telefono: clienteTelefono,
      direccion: clienteDireccion,
      total: getVentaTotal(venta),
      efectivoRecibido: venta.efectivoRecibido ? Number(venta.efectivoRecibido) : undefined,
      devueltas: venta.devueltas ? Number(venta.devueltas) : undefined,
      metodoPago: venta.medioDePago,
      estado: venta.estado,
      vendedor: venta.usuarioRelacion?.nombre,
      observaciones: venta.notas,
      propina: venta.propina ? Number(venta.propina) : undefined,
      porcentajePropina: venta.porcentajePropina,
      descuento: venta.descuento ? Number(venta.descuento) : undefined,
      abono: venta.abono ? Number(venta.abono) : undefined,
      totalGlobal: venta.totalGlobal ? Number(venta.totalGlobal) : undefined,
      porcentajeMermaPapa: getCachedConfiguracion()?.porcentajeMermaPapa ?? 10,
      productos: (venta.ordenVentas || []).map((prod: any) => ({
        cantidad: Number(prod.cantidad || 1),
        nombre: prod.nombre || 'Producto',
        precioUnitario: Number(prod.precio || 0),
        subtotal: Number(prod.precioTotal || ((prod.precio || 0) * (prod.cantidad || 1))),
        modifiers: getModifiers(prod.comentarios),
        cantidadPreparada: prod.cantidadPreparada ? Number(prod.cantidadPreparada) : undefined,
        seccionCocinaId: prod.producto?.seccionCocinaId || prod.producto?.categoria?.seccionCocinaId || prod.producto?.categoriaRelacion?.seccionCocinaId || prod.seccionCocinaId || prod.categoriaSeccionCocinaId || venta?.categoriaSeccionCocinaId,
        gramosPapa: getGramosPapaForProduct(prod),
      }))
    };
  };

  const [isEmittingDian, setIsEmittingDian] = useState(false);

  const handleEmitirFacturaDian = async (venta: VentaItem) => {
    try {
      setIsEmittingDian(true);
      await emitirFacturaDian(venta.IDventas);
      Toast.show({ type: 'success', text1: 'Éxito', text2: 'Factura DIAN emitida correctamente' });
      closeModal();
    } catch (error: any) {
      console.error('Error Factura:', error?.response?.data || error);
      const data = error?.response?.data;
      const msg = data?.error?.message || data?.message || (typeof data === 'string' ? data : 'Error al emitir factura DIAN');
      Toast.show({ type: 'error', text1: 'Error', text2: msg });
    } finally {
      setIsEmittingDian(false);
    }
  };

  const handleEliminarFacturaDian = async (venta: VentaItem) => {
    try {
      setIsEmittingDian(true);
      await eliminarFacturaDian(venta.IDventas);
      Toast.show({ type: 'success', text1: 'Éxito', text2: 'Factura eliminada correctamente' });
      closeModal();
    } catch (error: any) {
      console.error('Error al eliminar Factura:', error?.response?.data || error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo eliminar la factura' });
    } finally {
      setIsEmittingDian(false);
    }
  };

  const handleManualPrint = async (venta: any, type: 'comanda' | 'factura') => {
    if (isPrintingManualRef.current) return;
    isPrintingManualRef.current = true;
    setTimeout(() => { isPrintingManualRef.current = false; }, 2000);

    const rawTicket = mapVentaToTicketData(venta);
    const ticketData = type === 'comanda'
      ? enrichTicketDataWithPapaFallback(rawTicket)
      : cleanTicketDataForFactura(rawTicket);
    if (manualPreviewEnabled) {
      setPrintPreviewData(ticketData);
      setPrintPreviewType(type);
      setPrintPreviewVisible(true);
    } else {
      await printManual(ticketData, type);
    }
  };

  const toggleProductReady = async (venta: VentaItem, orderVenta: OrderVenta, action?: 'increment' | 'decrement' | 'max') => {
    if (!orderVenta.IDorderventas) return;
    
    let newEstado = orderVenta.estado === 'LISTO' ? 'PREPARANDO' : 'LISTO';
    let newCantidadPreparada = orderVenta.cantidadPreparada || 0;
    const maxCantidad = orderVenta.cantidad || 1;

    if (action === 'increment') {
      newCantidadPreparada = Math.min(newCantidadPreparada + 1, maxCantidad);
      newEstado = newCantidadPreparada >= maxCantidad ? 'LISTO' : 'PREPARANDO';
    } else if (action === 'decrement') {
      newCantidadPreparada = Math.max(newCantidadPreparada - 1, 0);
      newEstado = 'PREPARANDO'; // Si decrece, por definición no están todos listos
    } else if (action === 'max') {
      // Si ya estaban todos listos, hacer toggle a 0 (PREPARANDO)
      // Si faltan platos (0 o parcial), marcar todos como listos (LISTO)
      if ((orderVenta.cantidadPreparada || 0) >= maxCantidad) {
        newCantidadPreparada = 0;
        newEstado = 'PREPARANDO';
      } else {
        newCantidadPreparada = maxCantidad;
        newEstado = 'LISTO';
      }
    } else {
      // Toggle tradicional para cantidad = 1
      newCantidadPreparada = newEstado === 'LISTO' ? maxCantidad : 0;
    }

    // Optimistic UI Update with skew-compensated simulated time
    if (selectedVenta && selectedVenta.IDventas === venta.IDventas) {
      const clientStartStr = selectedVenta.registroDeTiempo?.[0]?.fecha_hora;
      const serverStartStr = orderVenta.createdAt || selectedVenta.fechaYHora || selectedVenta.fecha;
      
      let simulatedPreparadoAt: string | undefined = undefined;
      
      if (newEstado === 'LISTO' && serverStartStr) {
        // Calculate true elapsed time based on client clock
        const clientStartTime = new Date(clientStartStr || serverStartStr).getTime();
        const trueElapsed = Math.max(0, Date.now() - clientStartTime);
        
        // Add true elapsed time to the server start time to simulate the backend's "preparadoAt"
        const serverStartTime = new Date(serverStartStr).getTime();
        simulatedPreparadoAt = new Date(serverStartTime + trueElapsed).toISOString();
      }

      const updatedOrdenVentas = selectedVenta.ordenVentas?.map((ov) => {
        if (ov.IDorderventas === orderVenta.IDorderventas) {
          return { 
            ...ov, 
            estado: newEstado, 
            cantidadPreparada: newCantidadPreparada,
            preparadoAt: newEstado === 'LISTO' ? simulatedPreparadoAt : undefined 
          };
        }
        return ov;
      });
      setSelectedVenta({ ...selectedVenta, ordenVentas: updatedOrdenVentas });
      updateVenta(venta.IDventas, { ordenVentas: updatedOrdenVentas });
    }

    try {
      await updateOrderItemState(venta.IDventas, orderVenta.IDorderventas, newEstado, newCantidadPreparada);
    } catch (e) {
      console.error('Error toggling product state:', e);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo actualizar el estado del plato' });
    }
  };


  const [filters, setFilters] = useState<FilterState>({
    searchText: '',
    estados: [],
    mediosDePago: [],
    fechaDesde: '',
    fechaHasta: '',
    vendedor: '',
    minTotal: '',
    maxTotal: '',
    pedidoNumero: '',
    cliente: '',
    categoriaProducto: [],
    banco: [],
  });

  const { joinRoom, isConnected } = useSocket();
  const { emitOrdenActualizada } = useSocketEmitter();
  const { user } = useAuthStore();
  const isAdminApp = user?.rol === 'Admin app';

  useEffect(() => {
    if (isConnected) {
      joinRoom(Room.VENTAS);
      joinRoom(Room.DOMICILIOS);
      joinRoom(Room.KITCHEN);
      joinRoom(Room.CAJA);
    }
  }, [isConnected, joinRoom]);

  const [configNegocio, setConfigNegocio] = useState<any>(() => getCachedConfiguracion()?.data || getCachedConfiguracion());

  useEffect(() => {
    getConfiguracion()
      .then((cfg: any) => {
        const data = cfg?.data || cfg;
        setConfigNegocio(data);
        setPedidosScreenConfig(data);
      })
      .catch((e) => console.log('[PedidosScreen] Error loading config:', e));
  }, []);


  const productCategorias = useProductStore((state) => state.categorias);


  const route = useRoute<any>();

  const cachedVentas = useSalesStore((state) => state.ventas);
  const setCachedVentas = useSalesStore((state) => state.setVentas);
  const shouldRefetchVentas = useSalesStore((state) => state.shouldRefetch);
  const addVenta = useSalesStore((state) => state.addVenta);

  useFocusEffect(
    useCallback(() => {
      if (route.params?.ventaId) {
        // En lugar de buscarla localmente donde podría no estar, la fetcheamos
        const loadSale = async () => {
          try {
            const result = await getVentaById(route.params.ventaId);
            if (result?.data) {
              setSelectedVenta(result.data);
              setModalVisible(true);
              // Limpiar params para no re-abrir modal
              navigation.setParams({ ventaId: undefined });
            }
          } catch (e) {
            console.error('Error fetching deep linked venta:', e);
          }
        };
        loadSale();
      }

      if (route.params?.tab) {
        setActiveTab(route.params.tab);
        navigation.setParams({ tab: undefined });
      }
    }, [route.params?.ventaId, route.params?.tab, navigation])
  );
  const updateVenta = useSalesStore((state) => state.updateVenta);
  const removeVenta = useSalesStore((state) => state.removeVenta);
  const forceFetchRef = useRef<() => void>(() => {});

  const fetchDomicilios = useCallback(async () => {
    try {
      setLoadingDomicilios(true);
      const data = await getDomicilios();
      if (Array.isArray(data)) {
        setDomicilios(data);
      }
    } catch (err) {
      console.error('Error fetching domicilios:', err);
    } finally {
      setLoadingDomicilios(false);
    }
  }, []);

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

  const normalizeCOP = (val?: any): number => {
    if (val == null) return 0;
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0;
    if (num > 0 && num < 100) return num * 1000;
    return num;
  };

  const isZeroPriceOrExternalProduct = useCallback((it: any): boolean => {
    if (!it) return true;
    const catalog = useProductStore.getState().productos || [];
    const prodId = it.productoId || it.IDproductos || it.id;
    const itName = (it.nombre || it.nombreProducto || '').toLowerCase().trim();

    const match = catalog.find((p: any) => {
      if (prodId && (p.IDproductos === prodId || p.id === prodId)) return true;
      if (itName && p.nombre && p.nombre.toLowerCase().trim() === itName) return true;
      return false;
    });

    if (match) {
      const catalogPrice = Number(match.precioUnitario ?? match.Precio_Unitario ?? match.precio ?? 0);
      if (catalogPrice <= 0) return true;
      return false;
    }

    // Si hay catálogo cargado y el producto no coincide con ningún producto del catálogo:
    // NO es un producto propio de este negocio -> es externo
    if (catalog.length > 0) {
      return true;
    }

    const uPrice = Number(it.precioUnitario ?? it.precio ?? 0);
    const tPrice = Number(it.precioTotal ?? 0);
    if (uPrice <= 0 && tPrice <= 0) return true;

    return false;
  }, []);

  const visibleDomicilios = useMemo(() => {
    const list = Array.isArray(domicilios) ? domicilios : [];
    if (isComidaLocal) {
      // Si este local es de comida, excluir pedidos que son SOLO granizados / bebidas (sin comida)
      return list.filter((d) => pedidoTieneComida(d));
    }
    // Si este local es de granizados, excluir pedidos que son SOLO comida rápida / otro comercio (sin granizados/items propios)
    return list.filter((d) => {
      const rawItems = Array.isArray(d.itemsMapeados) ? d.itemsMapeados : [];
      const validItems = rawItems.filter((it) => !isZeroPriceOrExternalProduct(it));
      if (validItems.length > 0) return true;

      // Si no tiene productos propios y tiene items externos o es comida, ocultar en local de granizados
      const hasExt = Array.isArray(d.itemsExternos) && d.itemsExternos.length > 0;
      if (hasExt || pedidoTieneComida(d)) return false;

      return true;
    });
  }, [domicilios, isComidaLocal, pedidoTieneComida, isZeroPriceOrExternalProduct]);

  const tabsWithCounts = useMemo(() => {
    const arraySeguro = Array.isArray(cachedVentas) ? cachedVentas : [];
    const fechaContable = getFechaContableActual();
    
    return TABS.map(tab => {
      let count = 0;
      if (tab.key === 'todos') {
        count = arraySeguro.length;
      } else if (tab.key === 'DOMIS') {
        count = visibleDomicilios.filter(d => d.estado === 'RECIENTE').length;
      } else if (tab.key === 'PAGADO') {
        // En PAGADO se dejan todos sin filtro de fecha por defecto
        count = arraySeguro.filter(v => {
          const est = (v.estado || '').toUpperCase();
          return isVentaPagada(v) && est !== 'CANCELADO' && est !== 'ANULADO';
        }).length;
      } else if (tab.key === 'TOMADO') {
        // Pestaña operativa TOMADO: pedidos en TOMADO, PREPARANDO o PAGADO aún activos en cocina de la jornada actual
        count = arraySeguro.filter(v => {
          if (!isVentaActivaEnTomado(v)) return false;
          const vDate = extractVentaFecha(v);
          if (vDate && vDate !== fechaContable) return false;
          return true;
        }).length;
      } else if (tab.key === 'ENTREGADO') {
        // Pestaña operativa ENTREGADO: pedidos entregados de la jornada actual (no despejados)
        count = arraySeguro.filter(v => {
          const vDate = extractVentaFecha(v);
          if (vDate && vDate !== fechaContable) return false;
          const est = (v.estado || '').toUpperCase();
          const isEntregado = est === 'ENTREGADO';
          return isEntregado && !v.despejadoAt;
        }).length;
      } else {
        const tabUpper = tab.key.toUpperCase().replace(/_/g, ' ');
        count = arraySeguro.filter(v => {
          const estadoUpper = (v.estado || '').toUpperCase().replace(/_/g, ' ');
          return estadoUpper === tabUpper;
        }).length;
      }
      return { ...tab, count };
    });
  }, [cachedVentas, visibleDomicilios, configNegocio]);

  const domisSubTabsWithCounts = useMemo(() => {
    const list = visibleDomicilios;
    const isDomCobrado = (d: DomicilioWAItem) =>
      d.estado === 'COBRADO' || d.estado === 'PAGADO' || isVentaPagada(d.ventaRelacion);

    const countNuevos = list.filter(d => d.estado === 'RECIENTE' && d.ventaRelacion?.estado !== 'PAGADO').length;
    const countTomados = list.filter(d => 
      (d.estado === 'TOMADO' || d.ventaRelacion?.estado === 'TOMADO') &&
      !isDomCobrado(d) &&
      d.estado !== 'CANCELADO' &&
      d.ventaRelacion?.estado !== 'CANCELADO'
    ).length;
    const countPagados = list.filter(d => isDomCobrado(d)).length;
    const countTodos = list.length;

    return [
      { key: 'NUEVOS', label: 'Nuevos', count: countNuevos, color: '#f59e0b' },
      { key: 'TOMADOS', label: 'Tomados', count: countTomados, color: '#3b82f6' },
      { key: 'PAGADOS', label: 'Pagados', count: countPagados, color: '#22c55e' },
      { key: 'TODOS', label: 'Todos', count: countTodos, color: '#6b7280' },
    ];
  }, [visibleDomicilios]);

  const entregadosActivosCount = useMemo(() => {
    if (!Array.isArray(cachedVentas)) return 0;
    const fechaHoy = getFechaContableActual();
    return cachedVentas.filter(v => {
      const vDate = extractVentaFecha(v);
      if (vDate && vDate !== fechaHoy) return false;
      const est = (v.estado || '').toUpperCase();
      return est === 'ENTREGADO' && !v.despejadoAt;
    }).length;
  }, [cachedVentas]);

  const entregadosDespejadosCount = useMemo(() => {
    if (!Array.isArray(cachedVentas)) return 0;
    const fechaHoy = getFechaContableActual();
    return cachedVentas.filter(v => {
      const vDate = extractVentaFecha(v);
      if (vDate && vDate !== fechaHoy) return false;
      const est = (v.estado || '').toUpperCase();
      return est === 'ENTREGADO' && !!v.despejadoAt;
    }).length;
  }, [cachedVentas]);

  const fetchIdRef = useRef<number>(0);

  const fetchVentas = useCallback(async (force = false, pageNumber = 1, isLoadMore = false) => {
    const state = useSalesStore.getState();
    const currentCachedVentas = state.ventas;
    const hasHydrated = state._hasHydrated;
    
    if (!force && hasHydrated && !shouldRefetchVentas() && currentCachedVentas && Array.isArray(currentCachedVentas) && currentCachedVentas.length > 0 && !isLoadMore) {
      setLoading(false);
      return;
    }
    const currentFetchId = Date.now();
    fetchIdRef.current = currentFetchId;

    if (isLoadMore) setLoadingMore(true);

    try {
      // Pedimos datos frescos de ventas
      const data = await getSales({ limit: 500, page: pageNumber });
      if (fetchIdRef.current !== currentFetchId && !isLoadMore) {
        console.log('[Pedidos] Ignorando respuesta stale de getSales');
        return;
      }
      
      let ventasData = [];
      if (Array.isArray(data)) {
        ventasData = data;
      } else if (data?.data && Array.isArray(data.data)) {
        ventasData = data.data;
      } else if (data?.data?.data && Array.isArray(data.data.data)) {
        ventasData = data.data.data;
      }

      const meta = (data as any)?.meta || (data as any)?.data?.meta || {};

      if (Array.isArray(ventasData)) {
        if (isLoadMore) {
          setCachedVentas([...useSalesStore.getState().ventas, ...ventasData]);
        } else {
          setCachedVentas(ventasData);
        }
        setPage(pageNumber);
        setHasNextPage(meta?.hasNextPage ?? false);
      }
    } catch (error: any) {
      if (error?.message === 'Network Error') {
        console.log('[Pedidos] Fetch ignorado: Sin red o app en segundo plano');
      } else {
        console.error('Error fetching sales:', error?.message || error);
      }
      setHasNextPage(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [shouldRefetchVentas, setCachedVentas]);

  useEffect(() => {
    forceFetchRef.current = () => {
      fetchVentas(true);
      fetchDomicilios();
    };
  }, [fetchVentas, fetchDomicilios]);

  useEffect(() => {
    fetchVentas();
    fetchDomicilios();

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App has come to the foreground, fetch latest sales & domicilios
        fetchVentas(true);
        fetchDomicilios();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [fetchVentas, fetchDomicilios]);

  // ── Sockets: escuchar REFRESH_VENTAS del backend ──────────────────────────
  useSocketEvent<{ action: string; venta?: any; ventaId?: string; ventaIds?: string[] }>(
    SocketEvent.REFRESH_VENTAS,
    (data) => {
      if (!data) return;
      if (data.action === 'updateEstado' && data.venta) {
        // Actualización parcial en store (sin re-fetch completo)
        updateVenta(data.venta.IDventas, data.venta);
        // Si el modal está mostrando ese pedido, sincronizarlo también
        setSelectedVenta((prev) =>
          prev && prev.IDventas === data.venta.IDventas
            ? { ...prev, ...data.venta }
            : prev
        );
      } else if (data.action === 'create' && data.venta) {
        addVenta(data.venta);
      } else if (data.action === 'delete' && data.ventaId) {
        removeVenta(data.ventaId);
        if (selectedVenta?.IDventas === data.ventaId) closeModal();
      } else if (data.action === 'bulkDelete' && data.ventaIds) {
        data.ventaIds.forEach((id) => removeVenta(id));
      } else if (data.action === 'update' && data.venta) {
        updateVenta(data.venta.IDventas, data.venta);
        setSelectedVenta((prev) =>
          prev && prev.IDventas === data.venta.IDventas
            ? { ...prev, ...data.venta }
            : prev
        );
      } else if (data.action === 'despejarBulk' && (data as any).ventaIds) {
        const ids: string[] = (data as any).ventaIds;
        const despAt = (data as any).despejadoAt;
        ids.forEach((id) => updateVenta(id, { despejadoAt: despAt }));
      } else if (data.action === 'restore' && data.venta) {
        // Venta restaurada desde papelera: vuelve a aparecer en la lista
        addVenta(data.venta);
      } else {
        // Fallback para acciones desconocidas: re-fetch completo
        fetchVentas(true);
      }
    }
  );

  // ── Sockets: eventos directos de órdenes entre dispositivos (móvil <-> web) ──
  useSocketEvent<any>(SocketEvent.NUEVA_ORDEN, (data) => {
    if (!data) return;
    const v = data.venta || (data.IDventas ? data : null);
    if (v) {
      const hasRealOrdenVentas = Array.isArray(v.ordenVentas) && v.ordenVentas.length > 0 && v.ordenVentas[0]?.IDorderventas;
      const vConProductos = hasRealOrdenVentas
        ? v
        : (data.productos ? { ...v, ordenVentas: data.productos } : v);
      addVenta(vConProductos);
    }
  });

  useSocketEvent<any>(SocketEvent.ORDEN_RECIBIDA, (data) => {
    if (!data) return;
    const v = data.venta || (data.IDventas ? data : null);
    if (v) {
      const hasRealOrdenVentas = Array.isArray(v.ordenVentas) && v.ordenVentas.length > 0 && v.ordenVentas[0]?.IDorderventas;
      const vConProductos = hasRealOrdenVentas
        ? v
        : (data.productos ? { ...v, ordenVentas: data.productos } : v);
      addVenta(vConProductos);
    }
  });

  useSocketEvent<any>(SocketEvent.ORDEN_ACTUALIZADA, (data) => {
    if (!data) return;
    const v = data.venta || (data.IDventas ? data : null);
    const id = data.ventaId || data.IDventas || v?.IDventas;
    if (id && v) {
      const hasRealOrdenVentas = Array.isArray(v.ordenVentas) && v.ordenVentas.length > 0 && v.ordenVentas[0]?.IDorderventas;
      const vConProductos = hasRealOrdenVentas
        ? v
        : (data.productos ? { ...v, ordenVentas: data.productos } : v);
      updateVenta(id, vConProductos);
      setSelectedVenta((prev) =>
        prev && prev.IDventas === id ? { ...prev, ...vConProductos } : prev
      );
    } else if (id && data.estado) {
      updateVenta(id, { estado: data.estado });
      setSelectedVenta((prev) =>
        prev && prev.IDventas === id ? { ...prev, estado: data.estado } : prev
      );
    }
  });

  // ── Sockets: Domicilios WhatsApp ──────────────────────────────────────────
  useSocketEvent<DomicilioWAItem>(
    SocketEvent.NUEVO_DOMICILIO,
    (nuevoDom) => {
      if (!nuevoDom) return;
      // En locales de comida, si el pedido no tiene comida (solo granizados), ignorar
      if (isComidaLocal && !pedidoTieneComida(nuevoDom)) {
        return;
      }
      soundService.playDeliveryAlert();
      Toast.show({
        type: 'info',
        text1: '🛵 ¡Nuevo Domicilio de WhatsApp!',
        text2: `${nuevoDom.clienteNombre || nuevoDom.clienteTelefono || 'Cliente'}: $${(nuevoDom.totalWA || 0).toLocaleString()}`,
        position: 'top',
        visibilityTime: 6000,
      });
      setDomicilios((prev) => [nuevoDom, ...prev.filter((d) => d.IDdomicilio !== nuevoDom.IDdomicilio)]);
    }
  );

  useSocketEvent<DomicilioWAItem>(
    SocketEvent.DOMICILIO_ACTUALIZADO,
    (domActualizado) => {
      if (!domActualizado) return;
      setDomicilios((prev) =>
        prev.map((d) => (d.IDdomicilio === domActualizado.IDdomicilio ? { ...d, ...domActualizado } : d))
      );
    }
  );

  useSocketEvent<DomicilioWAItem>(
    SocketEvent.DOMICILIO_TIMEOUT,
    (domTimeout) => {
      if (!domTimeout) return;
      if (isComidaLocal && !pedidoTieneComida(domTimeout)) {
        return;
      }
      soundService.playDeliveryAlert();
      Toast.show({
        type: 'error',
        text1: '⏰ ¡Domicilio sin atender!',
        text2: `Pedido #${domTimeout.orderIdWA || ''} (${domTimeout.clienteNombre || domTimeout.clienteTelefono || 'Cliente'}) superó el tiempo límite`,
        position: 'top',
        visibilityTime: 8000,
      });
    }
  );

  const handleSocketUpdateFallback = useCallback(() => {
    // Legacy fallback. Only keep for explicit manual refreshes if needed.
    // fetchVentas(true);
  }, [fetchVentas]);

  // Se remueven los fallbacks masivos a estos eventos porque provocaban un render loop y crasheaban la app.
  // El evento SocketEvent.REFRESH_VENTAS (que se maneja arriba) ya actualiza el estado de forma granular en Zustand.
  

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.searchText) count++;
    if (filters.estados.length > 0) count++;
    if (filters.mediosDePago.length > 0) count++;
    if (filters.fechaDesde) count++;
    if (filters.fechaHasta) count++;
    if (filters.vendedor) count++;
    if (filters.minTotal || filters.maxTotal) count++;
    if (filters.pedidoNumero) count++;
    if (filters.cliente) count++;
    if (filters.banco && filters.banco.length > 0) count++;
    return count;
  }, [filters]);

  const fetchRemoteSearch = async (pageNumber = 1, isLoadMore = false) => {
    setIsSearchingRemote(true);
    if (isLoadMore) setLoadingMore(true);

    try {
      const query: any = { limit: 500, page: pageNumber };
      if (filters.searchText) query.search = filters.searchText;
      if (filters.estados && filters.estados.length > 0) query.estado = filters.estados.join(',');
      if (filters.mediosDePago && filters.mediosDePago.length > 0) query.medioDePago = filters.mediosDePago.join(',');
      if (filters.fechaDesde) query.fechaDesde = filters.fechaDesde;
      if (filters.fechaHasta) query.fechaHasta = filters.fechaHasta;
      if (filters.vendedor) query.usuario = filters.vendedor;
      if (filters.minTotal) query.totalMin = filters.minTotal;
      if (filters.maxTotal) query.totalMax = filters.maxTotal;
      if (filters.categoriaProducto && filters.categoriaProducto.length > 0) query.categoriaProducto = filters.categoriaProducto.join(',');
      if (filters.banco && filters.banco.length > 0) query.banco = filters.banco.join(',');
      if (filters.cliente) query.search = query.search ? `${query.search} ${filters.cliente}` : filters.cliente;
      if (filters.pedidoNumero) query.search = query.search ? `${query.search} ${filters.pedidoNumero}` : filters.pedidoNumero;

      const data = await getSales(query);
      let ventasData = [];
      if (Array.isArray(data)) {
        ventasData = data;
      } else if (data?.data && Array.isArray(data.data)) {
        ventasData = data.data;
      } else if (data?.data?.data && Array.isArray(data.data.data)) {
        ventasData = data.data.data;
      }

      const meta = (data as any)?.meta || (data as any)?.data?.meta || {};

      if (Array.isArray(ventasData)) {
        if (isLoadMore && remoteSearchResults) {
          setRemoteSearchResults([...remoteSearchResults, ...ventasData]);
        } else {
          setRemoteSearchResults(ventasData);
        }
        setPage(pageNumber);
        setHasNextPage(meta?.hasNextPage ?? false);
      }
    } catch (e) {
      console.error('Error fetching remote search', e);
      setHasNextPage(false);
    } finally {
      setIsSearchingRemote(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (activeFiltersCount === 0 && !filters.searchText) {
      setRemoteSearchResults(null);
      setIsSearchingRemote(false);
      setPage(1); // Reset page when clearing filters
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      fetchRemoteSearch(1, false);
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [filters, activeFiltersCount]);

  const handleLoadMore = () => {
    if (!hasNextPage || loadingMore || loading) return;
    
    if (activeFiltersCount > 0 || filters.searchText) {
      fetchRemoteSearch(page + 1, true);
    } else {
      fetchVentas(false, page + 1, true);
    }
  };


  const applyFilters = useCallback((ventas: VentaItem[]) => {
    let filtered = Array.isArray(ventas) ? [...ventas] : [];

    if (activeTab !== 'todos') {
      const fechaContable = getFechaContableActual();
      if (activeTab === 'PAGADO') {
        // Pestaña PAGADO: Se deja tal cual (sin filtro de fecha por defecto)
        filtered = filtered.filter(v => {
          const est = (v.estado || '').toUpperCase();
          return isVentaPagada(v) && est !== 'CANCELADO' && est !== 'ANULADO';
        });
      } else if (activeTab === 'TOMADO') {
        // Pestaña TOMADO: pedidos en TOMADO, PREPARANDO o PAGADO aún activos en cocina de la jornada actual (o según filtro de fecha explícito)
        filtered = filtered.filter(v => {
          if (!isVentaActivaEnTomado(v)) return false;
          const vDate = extractVentaFecha(v);
          if (vDate && vDate !== fechaContable && !filters.fechaDesde && !filters.fechaHasta) {
            return false;
          }
          return true;
        });
      } else if (activeTab === 'ENTREGADO') {
        // Pestaña ENTREGADO: pedidos entregados de la jornada actual (despejados según toggle)
        filtered = filtered.filter(v => {
          const vDate = extractVentaFecha(v);
          if (vDate && vDate !== fechaContable && !filters.fechaDesde && !filters.fechaHasta) return false;
          const est = (v.estado || '').toUpperCase();
          const isEntregado = est === 'ENTREGADO';
          if (!isEntregado) return false;
          return showDespejados ? !!v.despejadoAt : !v.despejadoAt;
        });
      } else {
        const tabUpper = activeTab.toUpperCase().replace(/_/g, ' ');
        filtered = filtered.filter(v => {
          const estadoUpper = (v.estado || '').toUpperCase().replace(/_/g, ' ');
          return estadoUpper === tabUpper;
        });
      }
    }

    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      const parsedNum = parseFloat(filters.searchText.replace(/[^\d]/g, ''));
      const isNum = !isNaN(parsedNum) && parsedNum > 0 && filters.searchText.replace(/[^\d.]/g, '').length > 0;

      filtered = filtered.filter(v => {
        const textMatch = 
          (v.pedido?.toLowerCase().includes(searchLower)) ||
          (v.cliente?.toLowerCase().includes(searchLower)) ||
          (v.mesa?.toLowerCase().includes(searchLower)) ||
          (v.medioDePago?.toLowerCase().includes(searchLower)) ||
          (v.usuarioRelacion?.nombre?.toLowerCase().includes(searchLower)) ||
          (v.direccion?.toLowerCase().includes(searchLower)) ||
          (v.ordenVentas?.some(prod => prod.nombre?.toLowerCase().includes(searchLower) || prod.nombreProducto?.toLowerCase().includes(searchLower)));

        if (isNum) {
          const numMatch = 
            (getVentaTotal(v) === parsedNum) ||
            (v.numeroTelefono === parsedNum) ||
            (v.ordenVentas?.some(prod => prod.precioTotal === parsedNum || prod.precio === parsedNum));
          return textMatch || numMatch;
        }
        return textMatch;
      });
    }

    if (filters.pedidoNumero) {
      const pedidoLower = filters.pedidoNumero.toLowerCase();
      filtered = filtered.filter(v => v.pedido?.toLowerCase().includes(pedidoLower));
    }

    if (filters.cliente) {
      const clienteLower = filters.cliente.toLowerCase();
      filtered = filtered.filter(v => v.cliente?.toLowerCase().includes(clienteLower));
    }

    if (filters.estados.length > 0) {
      filtered = filtered.filter(v => filters.estados.includes(v.estado || ''));
    }

    if (filters.mediosDePago.length > 0) {
      filtered = filtered.filter(v => {
        const combined = `${v.medioDePago || ''} ${v.banco || ''}`.toLowerCase();
        return filters.mediosDePago.some(m => combined.includes(m.toLowerCase()));
      });
    }

    if (filters.banco && filters.banco.length > 0) {
      filtered = filtered.filter(v => {
        const bancoLower = (v.banco || '').toLowerCase();
        return filters.banco!.some(b => bancoLower.includes(b.toLowerCase()));
      });
    }

    if (filters.fechaDesde) {
      const desde = new Date(filters.fechaDesde);
      filtered = filtered.filter(v => {
        if (!v.fechaYHora) return false;
        return new Date(v.fechaYHora) >= desde;
      });
    }

    if (filters.fechaHasta) {
      const hasta = new Date(filters.fechaHasta);
      hasta.setHours(23, 59, 59, 999);
      filtered = filtered.filter(v => {
        if (!v.fechaYHora) return false;
        return new Date(v.fechaYHora) <= hasta;
      });
    }

    if (filters.vendedor) {
      const vendedorLower = filters.vendedor.toLowerCase();
      filtered = filtered.filter(v => v.usuarioRelacion?.nombre?.toLowerCase().includes(vendedorLower));
    }

    if (filters.minTotal) {
      const min = parseFloat(filters.minTotal);
      if (!isNaN(min)) {
        filtered = filtered.filter(v => getVentaTotal(v) >= min);
      }
    }

    if (filters.maxTotal) {
      const max = parseFloat(filters.maxTotal);
      if (!isNaN(max)) {
        filtered = filtered.filter(v => getVentaTotal(v) <= max);
      }
    }

    if (filters.categoriaProducto && filters.categoriaProducto.length > 0) {
      filtered = filtered.filter(v => 
        v.ordenVentas?.some(prod => filters.categoriaProducto.includes(prod.categoriaProducto || '') || filters.categoriaProducto.includes(prod.categoria || ''))
      );
    }

    // Sort intelligently based on searchText exact matches
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      const parsedNum = parseFloat(filters.searchText.replace(/[^\d]/g, ''));
      const isNum = !isNaN(parsedNum) && parsedNum > 0 && filters.searchText.replace(/[^\d.]/g, '').length > 0;

      filtered.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;

        // Num matches give highest priority
        if (isNum) {
          if (getVentaTotal(a) === parsedNum) scoreA += 100;
          if (getVentaTotal(b) === parsedNum) scoreB += 100;
          if (a.ordenVentas?.some(p => p.precioTotal === parsedNum || p.precio === parsedNum)) scoreA += 50;
          if (b.ordenVentas?.some(p => p.precioTotal === parsedNum || p.precio === parsedNum)) scoreB += 50;
        }

        // Product name exact matches
        if (a.ordenVentas?.some(p => p.nombre?.toLowerCase() === searchLower || p.nombreProducto?.toLowerCase() === searchLower)) scoreA += 80;
        if (b.ordenVentas?.some(p => p.nombre?.toLowerCase() === searchLower || p.nombreProducto?.toLowerCase() === searchLower)) scoreB += 80;
        
        // Product name includes
        if (a.ordenVentas?.some(p => p.nombre?.toLowerCase().includes(searchLower) || p.nombreProducto?.toLowerCase().includes(searchLower))) scoreA += 40;
        if (b.ordenVentas?.some(p => p.nombre?.toLowerCase().includes(searchLower) || p.nombreProducto?.toLowerCase().includes(searchLower))) scoreB += 40;

        return scoreB - scoreA; // Highest score first
      });
    }

    return filtered;
  }, [activeTab, filters, showDespejados, configNegocio]);

  const groupByDate = useCallback((ventas: VentaItem[]): SectionData[] => {
    const grupos: { [key: string]: VentaItem[] } = {};

    if (!Array.isArray(ventas)) return [];

    ventas.forEach(venta => {
      let fechaStr = 'Sin Fecha';
      
      // PRIORITIZE `fecha` (Accounting date) to respect business day cutoff
      if (venta.fecha) {
        const datePart = venta.fecha.substring(0, 10);
        const [year, month, day] = datePart.split('-');
        if (year && month && day) {
          const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          fechaStr = localDate.toLocaleDateString('es-CO', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }
      } else if (venta.fechaYHora) {
        const fecha = new Date(venta.fechaYHora);
        if (!isNaN(fecha.getTime())) {
          fechaStr = fecha.toLocaleDateString('es-CO', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }
      }

      if (!grupos[fechaStr]) {
        grupos[fechaStr] = [];
      }
      grupos[fechaStr].push(venta);
    });

    return Object.keys(grupos).map(key => {
      const firstItem = grupos[key][0];
      let sortDate = new Date(firstItem.fechaYHora || firstItem.fecha || Date.now());
      if (firstItem.fecha) {
         const datePart = firstItem.fecha.substring(0, 10);
         const [year, month, day] = datePart.split('-');
         if (year && month && day) {
            sortDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
         }
      }

      return {
        title: key,
        date: sortDate,
        data: grupos[key],
      };
    }).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, []);

  const groupDomisByDate = useCallback((domisList: DomicilioWAItem[]) => {
    const grupos: { [key: string]: DomicilioWAItem[] } = {};

    domisList.forEach(dom => {
      let fechaStr = 'Sin Fecha';
      
      if (dom.ventaRelacion?.fecha) {
        const datePart = String(dom.ventaRelacion.fecha).substring(0, 10);
        const [year, month, day] = datePart.split('-');
        if (year && month && day) {
          const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          fechaStr = localDate.toLocaleDateString('es-CO', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }
      } else {
        const rawDate = dom.timestampPedido || dom.createdAt;
        if (rawDate) {
          const fecha = new Date(rawDate);
          if (!isNaN(fecha.getTime())) {
            fechaStr = fecha.toLocaleDateString('es-CO', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
          }
        }
      }

      if (!grupos[fechaStr]) {
        grupos[fechaStr] = [];
      }
      grupos[fechaStr].push(dom);
    });

    return Object.keys(grupos).map(key => {
      const firstItem = grupos[key][0];
      const rawDate = firstItem.timestampPedido || firstItem.createdAt || firstItem.ventaRelacion?.fecha || Date.now();
      const sortDate = new Date(rawDate);

      return {
        title: key,
        date: sortDate,
        data: grupos[key],
      };
    }).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, []);

  const filteredVentas = useMemo(() => {
    const dataSource = (activeFiltersCount > 0 && remoteSearchResults !== null) ? remoteSearchResults : (Array.isArray(cachedVentas) ? cachedVentas : []);
    const filtered = applyFilters(dataSource);
    return filtered;
  }, [cachedVentas, remoteSearchResults, activeFiltersCount, applyFilters]);

  const groupedVentas = useMemo(() => {
    return groupByDate(filteredVentas);
  }, [filteredVentas, groupByDate]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchVentas(true);
    fetchDomicilios();
  };

  const handleDeleteSingle = (venta: VentaItem) => {
    if (venta._isDomicilioWA) {
      const dom = venta._rawDomicilio;
      showAlert({
        type: 'confirm',
        title: 'Eliminar Domicilio',
        message: `¿Estás seguro de que deseas eliminar el domicilio #${dom?.orderIdWA || venta.pedido}?`,
        confirmText: 'Eliminar',
        onConfirm: async () => {
          setLoading(true);
          try {
            if (dom?.IDdomicilio) {
              await deleteDomicilio(dom.IDdomicilio);
              setDomicilios(prev => prev.filter(d => d.IDdomicilio !== dom.IDdomicilio));
            }
            if (venta.IDventas && venta.IDventas !== dom?.IDdomicilio) {
              await deleteSale(venta.IDventas).catch(() => {});
              removeVenta(venta.IDventas);
            }
            closeModal();
            Toast.show({ type: 'success', text1: 'Eliminado', text2: 'El domicilio fue eliminado exitosamente' });
          } catch (e) {
            console.error('Error al eliminar domicilio:', e);
            Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo eliminar el domicilio' });
          } finally {
            setLoading(false);
          }
        },
        onCancel: () => {},
      });
      return;
    }

    if (venta.estado === 'PAGADO' || venta.estado === 'ENTREGADO') {
      showAlert({
        type: 'confirm',
        title: 'Dependencias Activas',
        message: 'Este pedido ya ha sido pagado o entregado. ¿Estás seguro de que deseas eliminarlo? Esto afectará los registros financieros.',
        confirmText: 'Eliminar',
        onConfirm: () => executeDelete(venta.IDventas),
        onCancel: () => {},
      });
    } else {
      showAlert({
        type: 'confirm',
        title: 'Eliminar Pedido',
        message: `¿Estás seguro de que deseas eliminar el pedido ${venta.pedido}?`,
        confirmText: 'Eliminar',
        onConfirm: () => executeDelete(venta.IDventas),
        onCancel: () => {},
      });
    }
  };

  const executeDelete = async (id: string) => {
    setLoading(true);
    try {
      await deleteSale(id);
      Toast.show({ type: 'success', text1: 'Eliminado', text2: 'El pedido fue eliminado exitosamente' });
      removeVenta(id); // Actualización optimista local sin resetear la caché
      if (selectedVenta?.IDventas === id) {
        closeModal();
      }
    } catch (error) {
      console.error('Error deleting sale:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo eliminar el pedido' });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedToDelete.length === 0) return;
    
    const hasActiveDeps = filteredVentas.some(v => 
      selectedToDelete.includes(v.IDventas) && (v.estado === 'PAGADO' || v.estado === 'ENTREGADO')
    );

    const message = hasActiveDeps 
      ? 'Algunos de los pedidos seleccionados ya han sido pagados o entregados. ¿Deseas continuar con la eliminación masiva?'
      : `¿Estás seguro de que deseas eliminar los ${selectedToDelete.length} pedidos seleccionados?`;

showAlert({
      type: 'confirm',
      title: 'Eliminación Masiva',
      message: message,
      confirmText: 'Eliminar',
      onConfirm: async () => {
        setLoading(true);
        try {
          await deleteSalesBulk(selectedToDelete);
          Toast.show({ type: 'success', text1: 'Eliminados', text2: `${selectedToDelete.length} pedidos fueron eliminados` });
          selectedToDelete.forEach(id => removeVenta(id)); // Actualización optimista
          setSelectedToDelete([]);
          setIsSelectionMode(false);
        } catch (error) {
          console.error('Error en eliminación masiva:', error);
          Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudieron eliminar los pedidos' });
        } finally {
          setLoading(false);
        }
      },
      onCancel: () => {},
    });
  };

  const handleDespejarSingle = async (venta: VentaItem) => {
    if (!venta?.IDventas) return;
    const isDespejado = !!venta.despejadoAt;

    if (!isDespejado) {
      const isUnpaid = !isVentaPagada(venta);
      const promptConfirm = () => {
        showAlert({
          type: 'confirm',
          title: isUnpaid ? 'Pedido pendiente de cobro' : 'Despejar pedido',
          message: isUnpaid
            ? `El pedido #${venta.pedido || ''} aún no tiene registro de cobro. ¿Deseas despejarlo de la vista de entregados de todas formas? (Permanecerá en el sistema y en la pestaña de cobros).`
            : `¿Deseas despejar el pedido #${venta.pedido || ''} de la vista de entregados? Podrás consultarlo en la pestaña de Despejados o en Pagados.`,
          confirmText: 'Despejar',
          onConfirm: async () => {
            try {
              await despejarVenta(venta.IDventas, true);
              const nowIso = new Date().toISOString();
              updateVenta(venta.IDventas, { despejadoAt: nowIso });
              Toast.show({ type: 'success', text1: 'Vista despejada', text2: `Pedido #${venta.pedido || ''} despejado` });
            } catch (err: any) {
              console.error('[PedidosScreen] Error al despejar venta:', err);
              Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo despejar el pedido' });
            }
          },
          onCancel: () => {},
        });
      };

      if (isUnpaid) {
        promptConfirm();
      } else {
        try {
          await despejarVenta(venta.IDventas, true);
          const nowIso = new Date().toISOString();
          updateVenta(venta.IDventas, { despejadoAt: nowIso });
          Toast.show({ type: 'success', text1: 'Vista despejada', text2: `Pedido #${venta.pedido || ''} despejado` });
        } catch (err: any) {
          console.error('[PedidosScreen] Error al despejar venta:', err);
          Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo despejar el pedido' });
        }
      }
    } else {
      // Restaurar a la vista activa
      try {
        await despejarVenta(venta.IDventas, false);
        updateVenta(venta.IDventas, { despejadoAt: null });
        Toast.show({ type: 'success', text1: 'Pedido restaurado', text2: `Pedido #${venta.pedido || ''} visible en entregados` });
      } catch (err: any) {
        console.error('[PedidosScreen] Error al restaurar venta:', err);
        Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo restaurar el pedido' });
      }
    }
  };

  const handleDespejarBulk = (explicitIds?: string[]) => {
    const ids = explicitIds && explicitIds.length > 0 
      ? explicitIds 
      : filteredVentas.filter(v => !v.despejadoAt).map(v => v.IDventas);

    if (ids.length === 0) {
      Toast.show({ type: 'info', text1: 'Sin pedidos', text2: 'No hay pedidos activos para despejar en esta vista' });
      return;
    }

    const unpaidCount = filteredVentas.filter(v => ids.includes(v.IDventas) && !isVentaPagada(v)).length;

    const message = unpaidCount > 0
      ? `Hay ${unpaidCount} pedido(s) que aún no han sido cobrados. ¿Estás seguro de despejar los ${ids.length} pedidos entregados de la vista?`
      : `¿Deseas despejar los ${ids.length} pedidos entregados de la pantalla? La vista quedará limpia para la jornada actual.`;

    showAlert({
      type: 'confirm',
      title: 'Despejar pedidos entregados',
      message,
      confirmText: 'Despejar',
      onConfirm: async () => {
        setLoading(true);
        try {
          await despejarSalesBulk(ids, true);
          const nowIso = new Date().toISOString();
          ids.forEach(id => updateVenta(id, { despejadoAt: nowIso }));
          setSelectedToDelete([]);
          setIsSelectionMode(false);
          Toast.show({ type: 'success', text1: 'Vista despejada', text2: `${ids.length} pedido(s) despejados` });
        } catch (err) {
          console.error('[PedidosScreen] Error al despejar en lote:', err);
          Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudieron despejar los pedidos' });
        } finally {
          setLoading(false);
        }
      },
      onCancel: () => {},
    });
  };

  const handleRestaurarBulk = (explicitIds?: string[]) => {
    const ids = explicitIds && explicitIds.length > 0 
      ? explicitIds 
      : filteredVentas.filter(v => !!v.despejadoAt).map(v => v.IDventas);

    if (ids.length === 0) {
      Toast.show({ type: 'info', text1: 'Sin pedidos', text2: 'No hay pedidos despejados para restaurar' });
      return;
    }

    showAlert({
      type: 'confirm',
      title: 'Restaurar pedidos a la vista',
      message: `¿Deseas restaurar ${ids.length} pedido(s) a la vista de entregados activos?`,
      confirmText: 'Restaurar',
      onConfirm: async () => {
        setLoading(true);
        try {
          await despejarSalesBulk(ids, false);
          ids.forEach(id => updateVenta(id, { despejadoAt: null }));
          setSelectedToDelete([]);
          setIsSelectionMode(false);
          Toast.show({ type: 'success', text1: 'Pedidos restaurados', text2: `${ids.length} pedido(s) visibles nuevamente` });
        } catch (err) {
          console.error('[PedidosScreen] Error al restaurar en lote:', err);
          Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudieron restaurar los pedidos' });
        } finally {
          setLoading(false);
        }
      },
      onCancel: () => {},
    });
  };

  const toggleSelection = (id: string) => {
    setSelectedToDelete(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const clearAllFilters = () => {
    setFilters({
      searchText: '',
      estados: [],
      mediosDePago: [],
      fechaDesde: '',
      fechaHasta: '',
      vendedor: '',
      minTotal: '',
      maxTotal: '',
      pedidoNumero: '',
      cliente: '',
      categoriaProducto: [],
    });
    setIsFiltering(false);
    setFilterModalVisible(false);
  };

  const toggleEstado = (estado: string) => {
    setFilters(prev => ({
      ...prev,
      estados: prev.estados.includes(estado)
        ? prev.estados.filter(e => e !== estado)
        : [...prev.estados, estado]
    }));
  };

  const toggleMedioDePago = (medio: string) => {
    setFilters(prev => ({
      ...prev,
      mediosDePago: prev.mediosDePago.includes(medio)
        ? prev.mediosDePago.filter(m => m !== medio)
        : [...prev.mediosDePago, medio]
    }));
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'N/A';
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const hoursStr = String(hours).padStart(2, '0');
      return `${day}/${month}/${year} ${hoursStr}:${minutes} ${ampm}`;
    } catch {
      return 'N/A';
    }
  };

  const formatTimeOnly = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const hoursStr = String(hours).padStart(2, '0');
      return `${hoursStr}:${minutes} ${ampm}`;
    } catch {
      return '';
    }
  };

  const handleCopyToClipboard = (text?: string, label: string = 'Texto copiado') => {
    if (!text) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText) {
        (navigator as any).clipboard.writeText(text);
      } else {
        const RNClipboard = require('react-native').Clipboard;
        if (RNClipboard && RNClipboard.setString) {
          RNClipboard.setString(text);
        }
      }
      Toast.show({
        type: 'success',
        text1: 'Copiado al portapapeles',
        text2: label,
        position: 'top',
        visibilityTime: 1800,
      });
    } catch (err) {
      console.error('Error al copiar:', err);
      Toast.show({
        type: 'info',
        text1: 'Copiado',
        text2: label,
        position: 'top',
      });
    }
  };

  const getCleanPhoneNumber = (venta: any): string | null => {
    if (!venta) return null;
    if (venta.numeroTelefono) return String(venta.numeroTelefono);
    if (venta.clienteRelacion?.whatsapp) return String(venta.clienteRelacion.whatsapp);
    if (venta._rawDomicilio?.clienteTelefono) return String(venta._rawDomicilio.clienteTelefono);
    const raw = `${venta.pedido || ''} ${venta.mesa || ''}`;
    const match = raw.match(/WA\s*([0-9]{10,12})/i) || raw.match(/([0-9]{10,12})/);
    return match ? match[1] : null;
  };

  const formatMoney = (amount?: number) => {
    if (amount == null) return '$0';
    let val = Number(amount) || 0;
    if (val > 0 && val < 100) val = val * 1000;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val);
  };


  const getStatusColor = (status?: string) => {
    const s = (status || '').toUpperCase().replace(/_/g, ' ');
    const tab = TABS.find(t => t.key.toUpperCase().replace(/_/g, ' ') === s);
    return tab?.color || '#6b7280';
  };

  const hasNotes = (item: VentaItem) => {
    if (!item.ordenVentas) return false;
    return item.ordenVentas.some(prod => {
      if (!prod.comentarios) return false;
      try {
        const parsed = JSON.parse(prod.comentarios);
        if (Array.isArray(parsed) && parsed.length > 0) return true;
      } catch (e) {}
      // Fallback for plain text comments
      return typeof prod.comentarios === 'string' && prod.comentarios.trim().length > 0;
    });
  };

  const renderSectionHeader = (section: { title: string; count: number; date: Date; total?: number }) => {
    // Check if all items in this section are selected
    const itemsInSection = (activeTab === 'DOMIS' ? [] : (groupedVentas.find(g => g.title === section.title)?.data || []));
    const allSelected = itemsInSection.length > 0 && itemsInSection.every(item => selectedToDelete.includes(item.IDventas));
    const someSelected = itemsInSection.some(item => selectedToDelete.includes(item.IDventas));

    const toggleSectionSelection = () => {
      if (allSelected) {
        // Deselect all
        const idsToRemove = itemsInSection.map(i => i.IDventas);
        setSelectedToDelete(prev => prev.filter(id => !idsToRemove.includes(id)));
      } else {
        // Select all
        const idsToAdd = itemsInSection.map(i => i.IDventas);
        setSelectedToDelete(prev => {
          const newSelection = [...prev];
          idsToAdd.forEach(id => {
            if (!newSelection.includes(id)) newSelection.push(id);
          });
          return newSelection;
        });
      }
    };

    return (
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionHeaderLeft, { flex: 1, marginRight: 10 }]}>
          {isSelectionMode && (
            <TouchableOpacity onPress={toggleSectionSelection} style={{ marginRight: 12 }}>
              <View style={[styles.checkbox, allSelected && styles.checkboxSelected]}>
                {someSelected && <Ionicons name={allSelected ? "checkmark" : "remove"} size={14} color="#fff" />}
              </View>
            </TouchableOpacity>
          )}
          <Ionicons name="calendar-outline" size={16} color="#6366f1" />
          <RNText style={[styles.sectionHeaderText, { flexShrink: 1 }]} numberOfLines={2}>{section.title}</RNText>
        </View>
        <View style={{ flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
          <RNText style={styles.sectionHeaderCount}>{section.count} pedido{section.count !== 1 ? 's' : ''}</RNText>
          {section.total !== undefined && (
            <RNText style={[styles.sectionHeaderCount, { color: '#059669', fontWeight: 'bold', marginTop: 2 }]}>
              {formatMoney(section.total)}
            </RNText>
          )}
        </View>
      </View>
    );
  };

  const renderVentaItem = ({ item }: { item: VentaItem }) => {
    const productos = item.ordenVentas || [];
    const totalItems = productos.reduce((sum, p) => sum + (p.cantidad || 0), 0);
    const isSelected = selectedToDelete.includes(item.IDventas);

    return (
      <View style={styles.cardContainer}>
        {isSelectionMode && (
          <TouchableOpacity 
            style={styles.checkboxContainer} 
            onPress={() => toggleSelection(item.IDventas)}
          >
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.card, isSelectionMode && { flex: 1, marginBottom: 0 }]}
          onPress={() => {
            if (isSelectionMode) {
              toggleSelection(item.IDventas);
            } else {
              setSelectedVenta(item);
              setModalVisible(true);
            }
          }}
          onLongPress={() => {
            if (isAdminApp && !isSelectionMode) {
              setIsSelectionMode(true);
              toggleSelection(item.IDventas);
            }
          }}
          activeOpacity={0.7}
        >
          {/* Fila 1: Cabecera con Título a la izquierda y Estado + Acciones a la derecha */}
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 }}>
              <View style={[
                styles.cardTypeIconContainer,
                item.mesa?.startsWith('DOMICILIO WA') || item.direccion || (item.costoDelDomicilio && item.costoDelDomicilio > 0)
                  ? { backgroundColor: '#e0f2fe' }
                  : { backgroundColor: '#f1f5f9' }
              ]}>
                <Ionicons
                  name={
                    item.mesa?.startsWith('DOMICILIO WA') || item.direccion || (item.costoDelDomicilio && item.costoDelDomicilio > 0)
                      ? 'bicycle-outline'
                      : 'receipt-outline'
                  }
                  size={16}
                  color={
                    item.mesa?.startsWith('DOMICILIO WA') || item.direccion || (item.costoDelDomicilio && item.costoDelDomicilio > 0)
                      ? '#0284c7'
                      : '#475569'
                  }
                />
              </View>
              <RNText style={styles.cardTitle} numberOfLines={2}>
                {item.pedido || 'Sin pedido'}
              </RNText>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.estado) + '18' }]}>
                {item.estado === 'EN_EL_CARRITO' && (
                  <Ionicons name="lock-closed" size={10} color={getStatusColor(item.estado)} style={{ marginRight: 4 }} />
                )}
                <RNText style={[styles.statusText, { color: getStatusColor(item.estado) }]}>
                  {item.estado === 'EN_EL_CARRITO' ? 'EDITANDO' : (item.estado?.replace(/_/g, ' ') || 'SIN ESTADO')}
                </RNText>
              </View>

              {isAdminApp && !isSelectionMode && (
                <TouchableOpacity 
                  style={{ marginLeft: 10, padding: 4 }} 
                  onPress={(e) => {
                    e.stopPropagation();
                    handleDeleteSingle(item);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={17} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Fila 2: Badges operativos ordenados con buen espaciado (Timer, Pago, Notas, Domis, IA) */}
          <View style={styles.cardBadgesRow}>
            <OrderTimerBadge venta={item} />

            {isVentaPagada(item) ? (
              <View style={styles.paymentBadgeSuccess}>
                <Ionicons name="checkmark-circle-outline" size={12} color="#059669" />
                <RNText style={styles.paymentBadgeSuccessText}>
                  {item.medioDePago && !['PENDIENTE', 'NO ASIGNADO', 'SIN MEDIO', 'NO_ASIGNADO', 'SIN_MEDIO'].includes((item.medioDePago || '').toUpperCase().trim())
                    ? `PAGADO (${item.medioDePago})`
                    : 'PAGADO'}
                </RNText>
              </View>
            ) : (
              <View style={styles.paymentBadgePending}>
                <Ionicons name="time-outline" size={12} color="#d97706" />
                <RNText style={styles.paymentBadgePendingText}>
                  PENDIENTE COBRO
                </RNText>
              </View>
            )}

            {hasNotes(item) && (
              <View style={styles.notesBadge}>
                <Ionicons name="document-text-outline" size={12} color="#b45309" />
                <RNText style={styles.notesBadgeText}>NOTAS</RNText>
              </View>
            )}

            {(item.mesa?.startsWith('DOMICILIO WA') || (item.costoDelDomicilio && item.costoDelDomicilio > 0)) ? (
              <View style={styles.domiBadge}>
                <Ionicons name="bicycle-outline" size={12} color="#0284c7" />
                <RNText style={styles.domiBadgeText}>DOMI</RNText>
              </View>
            ) : null}

            {item.mensaje?.includes('Auto-Cuadre IA') && (
              <View style={styles.iaBadge}>
                <Ionicons name="sparkles-outline" size={12} color="#7c3aed" />
                <RNText style={styles.iaBadgeText}>IA</RNText>
              </View>
            )}
          </View>

          {/* Fila 3: Información clave (Fecha y Hora, Items, Cliente) */}
          <View style={styles.cardInfo}>
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={13} color="#64748b" />
              <RNText style={styles.infoText}>
                {formatDateTime(item.fechaYHora)}
              </RNText>
            </View>

            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="counter" size={14} color="#64748b" />
              <RNText style={styles.infoText}>{totalItems} item{totalItems !== 1 ? 's' : ''}</RNText>
            </View>

            {item.cliente && (
              <View style={[styles.infoRow, { maxWidth: 160 }]}>
                <Ionicons name="person-outline" size={13} color="#64748b" />
                <RNText style={styles.infoText} numberOfLines={1}>{item.cliente}</RNText>
              </View>
            )}
          </View>

          {/* Fila 4: Vista previa de productos con chips estilizados */}
          {productos.length > 0 && (
            <View style={styles.productsPreview}>
              {productos.slice(0, 3).map((prod, idx) => {
                const nombre = prod.nombreProducto || prod.nombre || '';
                return (
                  <View key={prod.IDorderventas || prod.producto?.IDproductos || idx} style={styles.productChip}>
                    <RNText style={styles.productChipQty}>{prod.cantidad}x</RNText>
                    <RNText style={styles.productChipName} numberOfLines={1}>{nombre}</RNText>
                  </View>
                );
              })}
              {productos.length > 3 && (
                <View style={styles.moreProductsChip}>
                  <RNText style={styles.moreProductsText}>+{productos.length - 3} más</RNText>
                </View>
              )}
            </View>
          )}

          {/* Fila 5: Pie de tarjeta (Total a la izquierda, Botones de acción a la derecha) */}
          <View style={styles.cardFooter}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <RNText style={styles.totalLabel}>TOTAL</RNText>
              <RNText style={styles.totalAmount}>{formatMoney(getVentaTotal(item))}</RNText>
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity 
                onPress={(e) => { e.stopPropagation(); handleManualPrint(item, 'comanda'); }}
                style={styles.cardActionBtnComanda}
                accessibilityLabel="Imprimir Comanda"
              >
                <Ionicons name="restaurant-outline" size={18} color="#d97706" />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={(e) => { e.stopPropagation(); handleManualPrint(item, 'factura'); }}
                style={styles.cardActionBtnFactura}
                accessibilityLabel="Imprimir Factura"
              >
                <Ionicons name="receipt-outline" size={18} color="#0284c7" />
              </TouchableOpacity>
            {!isVentaPagada(item) && (
              <TouchableOpacity 
                onPress={(e) => { 
                  e.stopPropagation(); 
                  try {
                    if (item.ordenVentas && item.ordenVentas.length > 0) {
                      useCartStore.getState().loadCartFromVenta(item.ordenVentas);
                    } else {
                      useCartStore.getState().clearCart();
                    }
                  } catch (err) {
                    console.error('[PedidosScreen] Error al cargar carrito:', err);
                    useCartStore.getState().clearCart();
                  }
                  setCobrarVenta(item);
                  resolverClienteParaCobro(item);
                  setPaymentModalVisible(true);
                }}
                style={{ padding: 6, backgroundColor: '#dcfce7', borderRadius: 8 }}
                accessibilityLabel="Cobrar Pedido"
              >
                <Ionicons name="cash-outline" size={18} color="#16a34a" />
              </TouchableOpacity>
            )}
            {activeTab === 'ENTREGADO' && (
              <TouchableOpacity 
                onPress={(e) => { 
                  e.stopPropagation(); 
                  handleDespejarSingle(item); 
                }}
                style={{ 
                  padding: 6, 
                  backgroundColor: item.despejadoAt ? '#eff6ff' : '#f1f5f9', 
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: item.despejadoAt ? '#bfdbfe' : '#e2e8f0',
                }}
                accessibilityLabel={item.despejadoAt ? "Restaurar pedido a la vista" : "Despejar pedido de la vista"}
              >
                <Ionicons 
                  name={item.despejadoAt ? "refresh-outline" : "eye-off-outline"} 
                  size={18} 
                  color={item.despejadoAt ? "#2563eb" : "#64748b"} 
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
        </TouchableOpacity>
      </View>
    );
  };

  const resolverClienteParaCobro = useCallback(async (item: VentaItem | any) => {
    if (!item) {
      setCobrarCliente(null);
      return null;
    }

    setResolvingCliente(true);
    try {
      // 1. Si ya viene con clienteId numérico directo
      const rawCid = item.clienteId ?? (item.cliente && !isNaN(Number(item.cliente)) ? Number(item.cliente) : null);
      if (rawCid && !isNaN(Number(rawCid)) && Number(rawCid) > 0) {
        try {
          const c = await getClienteById(Number(rawCid));
          if (c && c.IDcliente) {
            setCobrarCliente(c);
            return c;
          }
        } catch (e) {}
      }

      // 1b. Si en cliente, notas o pedido viene un código explícito con formato '#706980' o similar
      const idMatch = String(item.cliente || '').match(/#(\d+)/) || 
                      String(item.pedido || '').match(/#(\d+)/) ||
                      String(item.mensaje || '').match(/#(\d+)/);
      if (idMatch && idMatch[1]) {
        try {
          const c = await getClienteById(Number(idMatch[1]));
          if (c && c.IDcliente) {
            setCobrarCliente(c);
            item.clienteId = c.IDcliente;
            return c;
          }
        } catch (e) {}
      }

      // 2. Extraer teléfono de todas las fuentes posibles de la orden o domicilio
      const dom = item._rawDomicilio || (domicilios || []).find((d: any) => 
        (d.ventaId && d.ventaId === item.IDventas) ||
        (d.orderIdWA && item.pedido && item.pedido.includes(d.orderIdWA))
      );

      let cleanPhone = '';
      if (dom?.clienteTelefono) {
        cleanPhone = String(dom.clienteTelefono).replace(/\D/g, '');
      } else if (item.numeroTelefono) {
        cleanPhone = String(item.numeroTelefono).replace(/\D/g, '');
      }
      
      if (!cleanPhone && item.mesa && typeof item.mesa === 'string') {
        const match = item.mesa.match(/57\d{10}|\d{10}/);
        if (match) cleanPhone = match[0];
      }

      if (!cleanPhone && item.pedido && typeof item.pedido === 'string') {
        const match = item.pedido.match(/57\d{10}|\d{10}/);
        if (match) cleanPhone = match[0];
      }

      // 3. Buscar cliente por teléfono si se encontró
      if (cleanPhone && cleanPhone.length >= 7) {
        try {
          const phoneQuery = cleanPhone.slice(-10);
          const searchRes = await getClientes(1, 10, phoneQuery);
          const clientesList = searchRes?.data || [];
          const match = clientesList.find((c: any) => 
            (c.whatsapp && c.whatsapp.includes(phoneQuery)) ||
            (c.cedula && String(c.cedula) === cleanPhone)
          );
          if (match) {
            setCobrarCliente(match);
            item.clienteId = match.IDcliente;
            return match;
          }
        } catch (e) {}
      }

      // 4. Buscar cliente por nombre si no es genérico
      const nombreCliente = (dom?.clienteNombre || item.cliente || '').replace(/#\d+/g, '').trim();
      const esGenerico = !nombreCliente || /^(cliente|mostrador|mesa|domicilio|wa)/i.test(nombreCliente);
      if (!esGenerico) {
        try {
          const searchRes = await getClientes(1, 5, nombreCliente);
          const clientesList = searchRes?.data || [];
          const match = clientesList.find((c: any) => 
            c.nombre && c.nombre.trim().toLowerCase() === nombreCliente.toLowerCase()
          );
          if (match) {
            setCobrarCliente(match);
            item.clienteId = match.IDcliente;
            return match;
          }
        } catch (e) {}
      }

      // 5. Si es un Domicilio con teléfono/nombre y no estaba en la base de datos, crearlo automáticamente
      if ((cleanPhone && cleanPhone.length >= 7) || (!esGenerico && nombreCliente)) {
        try {
          const nuevoNombre = !esGenerico && nombreCliente ? nombreCliente : `Cliente WA (${cleanPhone.slice(-10)})`;
          const nuevo = await createCliente({
            nombre: nuevoNombre,
            whatsapp: cleanPhone ? cleanPhone.slice(-10) : undefined,
            contador: 0,
            compras: '0',
            isActive: true,
          });
          if (nuevo && nuevo.IDcliente) {
            setCobrarCliente(nuevo);
            item.clienteId = nuevo.IDcliente;
            return nuevo;
          }
        } catch (e) {}
      }
    } catch (err) {
      console.error('[PedidosScreen] Error al resolver cliente para cobro:', err);
    } finally {
      setResolvingCliente(false);
    }

    setCobrarCliente(null);
    return null;
  }, [domicilios]);

  useEffect(() => {
    if (cobrarVenta && paymentModalVisible) {
      resolverClienteParaCobro(cobrarVenta);
    } else if (!paymentModalVisible) {
      setCobrarCliente(null);
    }
  }, [cobrarVenta, paymentModalVisible, resolverClienteParaCobro]);

  const handleCobrarPedido = (venta: any) => {
    if (!venta) return;
    try {
      if (venta.ordenVentas && venta.ordenVentas.length > 0) {
        useCartStore.getState().loadCartFromVenta(venta.ordenVentas);
      } else {
        useCartStore.getState().clearCart();
      }
    } catch (err) {
      console.error('[PedidosScreen] Error al cargar carrito para cobrar:', err);
      useCartStore.getState().clearCart();
    }
    setCobrarVenta(venta);
    resolverClienteParaCobro(venta);
    setPaymentModalVisible(true);
  };



  const buildProductosPayloadFromDomicilio = (dom: DomicilioWAItem) => {
    const rawItems = Array.isArray(dom.itemsMapeados) && dom.itemsMapeados.length > 0
      ? dom.itemsMapeados
      : [];

    const validItems = rawItems.filter((it) => !isZeroPriceOrExternalProduct(it));
    const itemsToProcess = validItems;

    const catalog = useProductStore.getState().productos || [];

    return itemsToProcess.map((it) => {
      let unitPrice = it.precioUnitario || 0;
      let totPrice = it.precioTotal || 0;
      if (!unitPrice && !totPrice && it.nombre) {
        const m = it.nombre.match(/\(\$?([\d.,]+)\)/);
        if (m) {
          const rawVal = parseFloat(m[1].replace(/\./g, '')) || 0;
          totPrice = normalizeCOP(rawVal);
          unitPrice = Math.round(totPrice / (it.cantidad || 1));
        }
      }
      unitPrice = normalizeCOP(unitPrice);
      totPrice = normalizeCOP(totPrice);
      if (totPrice === 0 && unitPrice > 0) totPrice = unitPrice * (it.cantidad || 1);
      if (unitPrice === 0 && totPrice > 0) unitPrice = Math.round(totPrice / (it.cantidad || 1));

      const itNameNorm = (it.nombre || '').trim().toLowerCase();
      const matchedCatalogProd = catalog.find((p: any) =>
        (it.productoId && (p.IDproductos === it.productoId || p.id === it.productoId)) ||
        (itNameNorm && p.nombre && p.nombre.trim().toLowerCase() === itNameNorm)
      );
      const resolvedProductoId = matchedCatalogProd?.IDproductos || ((it.productoId && it.productoId.trim() !== '') ? it.productoId : undefined);

      return {
        productoId: resolvedProductoId,
        nombre: matchedCatalogProd?.nombre || it.nombre,
        nombreProducto: matchedCatalogProd?.nombre || it.nombre,
        categoria: matchedCatalogProd?.categoriaNombre || matchedCatalogProd?.categoria || 'DOMICILIOS',
        categoriaProducto: matchedCatalogProd?.categoriaNombre || matchedCatalogProd?.categoria || 'DOMICILIOS',
        cantidad: it.cantidad || 1,
        precio: unitPrice,
        precioTotal: totPrice,
        estado: 'TOMADO',
        comentarios: it.comentarios || '',
      };
    });
  };

  const handleTomarDomicilio = async (dom: DomicilioWAItem) => {
    if (!dom || !dom.IDdomicilio) return;

    if (takingDomicilioIdsRef.current.has(dom.IDdomicilio)) {
      console.log(`[Pedidos] Domicilio ${dom.IDdomicilio} ya se está tomando, ignorando click duplicado.`);
      return;
    }

    takingDomicilioIdsRef.current.add(dom.IDdomicilio);
    setTakingDomicilioIds(prev => ({ ...prev, [dom.IDdomicilio]: true }));

    // 🚀 UI OPTIMISTA INMEDIATA (0 ms de espera para el usuario)
    const nowAtendidoIso = new Date().toISOString();
    const prevDomEstado = dom.estado;
    setDomicilios(prev => prev.map(d => d.IDdomicilio === dom.IDdomicilio ? { ...d, estado: 'TOMADO', atendidoAt: nowAtendidoIso } : d));
    if (activeTab === 'DOMIS') {
      setDomisSubTab('TOMADOS');
    } else {
      setActiveTab('TOMADO');
    }

    try {
      let ventaId = dom.ventaId;
      let ventaCreadaObj: any = null;

      // Buscar si ya existe una venta registrada en Zustand para este domicilio
      if (!ventaId) {
        const currentVentas = useSalesStore.getState().ventas || [];
        const existingVenta = currentVentas.find(v => 
          (v.pedido && dom.orderIdWA && (v.pedido === `#${dom.orderIdWA}` || v.pedido === dom.orderIdWA || v.pedido.includes(dom.orderIdWA))) ||
          (v.domiciliosWA && Array.isArray(v.domiciliosWA) && v.domiciliosWA.some((d: any) => d.IDdomicilio === dom.IDdomicilio))
        );
        if (existingVenta) {
          ventaId = existingVenta.IDventas;
          ventaCreadaObj = existingVenta;
          console.log(`[Pedidos] Venta existente reutilizada (${ventaId}) para domicilio ${dom.IDdomicilio}`);
        }
      }

      const cleanPhone = dom.clienteTelefono ? dom.clienteTelefono.replace(/\D/g, '') : '';
      const mesaStr = cleanPhone ? `DOMICILIO WA ${cleanPhone}` : 'DOMICILIO WA';
      const deterministicTemporalId = `tomar-dom-${dom.IDdomicilio}`;

      if (!ventaId) {
        const productosPayload = buildProductosPayloadFromDomicilio(dom);
        const totalProductos = productosPayload.reduce((s, p) => s + (p.precioTotal || 0), 0);
        const totalVenta = totalProductos;

        let domClienteId: number | undefined = (dom as any).clienteId ? Number((dom as any).clienteId) : undefined;
        if (!domClienteId && dom.origen && dom.origen.includes('cliente:')) {
          const m = dom.origen.match(/cliente:(\d+)/);
          if (m) domClienteId = Number(m[1]);
        }

        const newSale = await createSale({
          temporalId: deterministicTemporalId,
          venta: {
            temporalId: deterministicTemporalId,
            mesa: mesaStr,
            estado: 'TOMADO',
            cliente: dom.clienteNombre || (cleanPhone ? `Cliente WA (${cleanPhone})` : 'Cliente WhatsApp'),
            clienteId: domClienteId,
            direccion: dom.direccion || undefined,
            numeroTelefono: cleanPhone ? (parseInt(cleanPhone.slice(-9), 10) || undefined) : undefined,
            medioDePago: dom.metodoPagoWA || 'PENDIENTE',
            efectivoRecibido: 0,
            totalInput: totalVenta,
            pedido: dom.orderIdWA ? `#${dom.orderIdWA}` : undefined,
            mensaje: dom.detalleTextoWA || undefined,
          },
          productos: productosPayload,
        });

        ventaCreadaObj = (newSale as any)?.data || newSale;
        if (ventaCreadaObj && ventaCreadaObj.IDventas) {
          ventaId = ventaCreadaObj.IDventas;
          addVenta(ventaCreadaObj);
          // Vincular en segundo plano asíncrono (el backend también lo auto-vincula)
          vincularVentaDomicilio(dom.IDdomicilio, ventaId, 'TOMADO').catch(() => {});
        }
      } else {
        vincularVentaDomicilio(dom.IDdomicilio, ventaId, 'TOMADO').catch(() => {});
      }

      setDomicilios(prev => prev.map(d => d.IDdomicilio === dom.IDdomicilio ? { ...d, estado: 'TOMADO', ventaId: ventaId || d.ventaId, atendidoAt: nowAtendidoIso } : d));

      if (ventaId) {
        updateVenta(ventaId, {
          comandaImpresa: true,
          comandaImpresaAt: nowAtendidoIso,
          cocinaInicioAt: ventaCreadaObj?.cocinaInicioAt || nowAtendidoIso,
        } as any);
      }

      // 🖨️ Auto-imprimir comanda de inmediato sin esperar otras llamadas de red
      const printStore = usePrinterStore.getState();
      if (ventaCreadaObj && (printStore.shouldPrintComanda('TOMADO') || printStore.shouldPrintFactura('TOMADO'))) {
        const ticketData = mapVentaToTicketData({
          ...ventaCreadaObj,
          _rawDomicilio: dom,
          direccion: dom.direccion || ventaCreadaObj.direccion,
          cliente: dom.clienteNombre || ventaCreadaObj.cliente,
          telefono: dom.clienteTelefono,
        });
        printStore.printTicket(ticketData).catch(err => {
          console.error('[PedidosScreen] Error imprimiendo comanda al tomar domicilio:', err);
        });
      }

      Toast.show({
        type: 'success',
        text1: 'Pedido Tomado',
        text2: `En preparación en TOMADO (#${ventaCreadaObj?.pedido || dom.orderIdWA || dom.IDdomicilio.slice(-6)})`
      });
    } catch (e: any) {
      console.error('Error al tomar domicilio:', e);
      // Revertir optimismo en caso de error
      setDomicilios(prev => prev.map(d => d.IDdomicilio === dom.IDdomicilio ? { ...d, estado: prevDomEstado } : d));
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo tomar el pedido' });
    } finally {
      takingDomicilioIdsRef.current.delete(dom.IDdomicilio);
      setTakingDomicilioIds(prev => {
        const next = { ...prev };
        delete next[dom.IDdomicilio];
        return next;
      });
    }
  };

  const handleCancelarDomicilio = (dom: DomicilioWAItem) => {
    const doCancel = async () => {
      try {
        await updateDomicilioEstado(dom.IDdomicilio, 'CANCELADO');
        setDomicilios(prev => prev.map(d => d.IDdomicilio === dom.IDdomicilio ? { ...d, estado: 'CANCELADO' } : d));
        if (dom.ventaId) {
          try {
            await updateVentaEstado(dom.ventaId, 'CANCELADO');
            removeVenta(dom.ventaId);
          } catch (err) {
            console.error('Error al cancelar venta vinculada:', err);
          }
        }
        Toast.show({ type: 'info', text1: 'Domicilio cancelado' });
      } catch (e) {
        console.error('Error al cancelar domicilio:', e);
        Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cancelar el domicilio' });
      }
    };

    showAlert({
      type: 'confirm',
      title: 'Cancelar Domicilio',
      message: `¿Deseas cancelar el domicilio #${dom.orderIdWA || dom.IDdomicilio.slice(-6)} de ${dom.clienteNombre || dom.clienteTelefono || 'WhatsApp'}?`,
      confirmText: 'Sí, Cancelar',
      cancelText: 'Volver',
      onConfirm: doCancel,
      onCancel: () => {},
    });
  };

  const handleCobrarDomicilio = async (dom: DomicilioWAItem) => {
    if (dom.ventaId) {
      const allVentas = useSalesStore.getState().ventas || [];
      let existingVenta = allVentas.find(v => v.IDventas === dom.ventaId);
      if (!existingVenta) {
        try {
          const { getVentaById } = await import('../../services/sales');
          const resp = await getVentaById(dom.ventaId);
          existingVenta = resp?.data || resp;
          if (existingVenta) {
            addVenta(existingVenta);
          }
        } catch (e) {
          console.warn('No se pudo recuperar venta vinculada:', e);
        }
      }
      if (existingVenta) {
        handleCobrarPedido(existingVenta);
        return;
      }
    }

    try {
      const productosPayload = buildProductosPayloadFromDomicilio(dom);
      const totalProductos = productosPayload.reduce((s, p) => s + (p.precioTotal || 0), 0);
      const totalVenta = totalProductos > 0
        ? totalProductos
        : (normalizeCOP(dom.totalCalculado) || normalizeCOP(dom.totalWA) || 0);

      const cleanPhone = dom.clienteTelefono ? dom.clienteTelefono.replace(/\D/g, '') : '';
      const mesaStr = cleanPhone ? `DOMICILIO WA ${cleanPhone}` : 'DOMICILIO WA';

      const newSale = await createSale({
        venta: {
          mesa: mesaStr,
          estado: 'TOMADO',
          cliente: dom.clienteNombre || (cleanPhone ? `Cliente WA (${cleanPhone})` : 'Cliente WhatsApp'),
          direccion: dom.direccion || undefined,
          numeroTelefono: cleanPhone ? (parseInt(cleanPhone.slice(-9), 10) || undefined) : undefined,
          medioDePago: dom.metodoPagoWA || 'PENDIENTE',
          efectivoRecibido: 0,
          totalInput: totalVenta,
          pedido: dom.orderIdWA ? `#${dom.orderIdWA}` : undefined,
          mensaje: dom.detalleTextoWA || undefined,
        },
        productos: productosPayload,
      });

      const ventaCreada = (newSale as any)?.data || newSale;
      if (ventaCreada && ventaCreada.IDventas) {
        await vincularVentaDomicilio(dom.IDdomicilio, ventaCreada.IDventas, 'COBRADO');
        addVenta(ventaCreada);
        setDomicilios(prev => prev.map(d => d.IDdomicilio === dom.IDdomicilio ? { ...d, ventaId: ventaCreada.IDventas, estado: 'COBRADO' } : d));
        handleCobrarPedido(ventaCreada);
      }
    } catch (e: any) {
      console.error('Error al preparar venta de domicilio:', e);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo crear la orden para cobrar' });
    }
  };

  const mapDomicilioToVenta = (dom: DomicilioWAItem): any => {
    const rawItemsPropios = Array.isArray(dom.itemsMapeados) ? dom.itemsMapeados : [];
    const rawItemsExt = Array.isArray(dom.itemsExternos) ? dom.itemsExternos : [];

    // Separar productos que en este negocio tienen precio 0 o no pertenecen al catálogo activo
    const itemsPropios: any[] = [];
    const itemsExt: any[] = [...rawItemsExt];

    for (const it of rawItemsPropios) {
      if (isZeroPriceOrExternalProduct(it)) {
        itemsExt.push({
          nombre: it.nombre,
          cantidad: it.cantidad || 1,
          observacion: it.comentarios ? `${it.comentarios}` : `No vendido en este negocio ($0 en catálogo)`,
        });
      } else {
        itemsPropios.push(it);
      }
    }

    const catalog = useProductStore.getState().productos || [];
    const isDomComandeado = Boolean(dom.estado === 'TOMADO' || dom.estado === 'COBRADO' || dom.estado === 'PAGADO' || dom.atendidoAt);

    const ordenVentas: any[] = [
      ...itemsPropios.map((it, idx) => {
        let itUnit = it.precioUnitario || (it.precioTotal ? it.precioTotal / (it.cantidad || 1) : 0);
        let itTot = it.precioTotal || (it.precioUnitario || 0) * (it.cantidad || 1);
        if (itUnit === 0 && itTot === 0 && it.nombre) {
          const m = it.nombre.match(/\(\$?([\d.,]+)\)/);
          if (m) {
            const rawVal = parseFloat(m[1].replace(/\./g, '')) || 0;
            const norm = rawVal < 100 ? rawVal * 1000 : rawVal;
            itTot = norm;
            itUnit = Math.round(norm / (it.cantidad || 1));
          }
        }
        if (itTot > 0 && itTot < 100) itTot = itTot * 1000;
        if (itUnit > 0 && itUnit < 100) itUnit = itUnit * 1000;

        let parsedModifiersList: any[] = [];
        let parsedComentarios = undefined;
        if (it.comentarios) {
          try {
            const p = JSON.parse(it.comentarios);
            if (Array.isArray(p)) {
              parsedModifiersList = p.map((m: any) => typeof m === 'string' ? { name: m, price: 0, quantity: 1 } : { name: m.name || m.nombre || '', price: Number(m.price || m.precio || 0), quantity: Number(m.quantity || m.cantidad || 1) });
            } else if (p && typeof p === 'object') {
              parsedModifiersList = [{ name: p.name || p.nombre || p.observacion || p.comentario || '', price: Number(p.price || p.precio || 0), quantity: Number(p.quantity || p.cantidad || 1) }];
            } else {
              parsedModifiersList = [{ name: String(p), price: 0, quantity: 1 }];
            }
            parsedComentarios = JSON.stringify(parsedModifiersList);
          } catch (e) {
            parsedModifiersList = [{ name: it.comentarios, price: 0, quantity: 1 }];
            parsedComentarios = JSON.stringify(parsedModifiersList);
          }
        }

        const itNameNorm = (it.nombre || '').trim().toLowerCase();
        const matchedCatalogProd = catalog.find((p: any) =>
          (it.productoId && (p.IDproductos === it.productoId || p.id === it.productoId)) ||
          (itNameNorm && p.nombre && p.nombre.trim().toLowerCase() === itNameNorm)
        );
        const resolvedProductoId = matchedCatalogProd?.IDproductos || ((it.productoId && String(it.productoId).trim() !== '') ? it.productoId : undefined);
        const resolvedNombre = matchedCatalogProd?.nombre || it.nombre;

        return {
          IDorderventas: `dom-item-${idx}`,
          productoId: resolvedProductoId,
          IDproductos: resolvedProductoId,
          producto: resolvedProductoId ? { IDproductos: resolvedProductoId, nombre: resolvedNombre, precioUnitario: itUnit } : undefined,
          nombre: resolvedNombre,
          nombreProducto: resolvedNombre,
          cantidad: it.cantidad || 1,
          precio: itUnit,
          precioTotal: itTot,
          estado: dom.estado === 'TOMADO' ? 'PREPARANDO' : (dom.estado === 'COBRADO' ? 'LISTO' : 'TOMADO'),
          cantidadPreparada: dom.estado === 'COBRADO' ? (it.cantidad || 1) : 0,
          comandaImpresa: isDomComandeado,
          comentarios: parsedComentarios,
          modifiers: parsedModifiersList,
        };
      }),
      ...itemsExt.map((ext, idx) => {
        const extMod = ext.observacion
          ? [{ name: `Otro comercio: ${ext.observacion}`, price: 0, quantity: 1 }]
          : [{ name: 'De otro comercio / bot', price: 0, quantity: 1 }];
        return {
          IDorderventas: `dom-ext-${idx}`,
          nombre: `[Externo] ${ext.nombre}`,
          nombreProducto: `[Externo] ${ext.nombre}`,
          cantidad: ext.cantidad || 1,
          precio: 0,
          precioTotal: 0,
          estado: 'LISTO',
          comentarios: JSON.stringify(extMod),
          modifiers: extMod,
        };
      }),
    ];

    const totalLocalCalculado = itemsPropios.reduce((sum, it) => {
      let itPrice = it.precioTotal || (it.precioUnitario || 0) * (it.cantidad || 1);
      return sum + normalizeCOP(itPrice);
    }, 0);
    const totalVenta = totalLocalCalculado;

    if (ordenVentas.length === 0 && dom.detalleTextoWA && itemsExt.length === 0) {
      ordenVentas.push({
        IDorderventas: 'dom-raw-1',
        nombre: dom.detalleTextoWA,
        nombreProducto: dom.detalleTextoWA,
        cantidad: 1,
        precio: totalVenta,
        precioTotal: totalVenta,
        estado: dom.estado,
      });
    }

    const cleanPhone = dom.clienteTelefono ? dom.clienteTelefono.replace(/\D/g, '') : '';
    const mesaStr = cleanPhone ? `DOMICILIO WA ${cleanPhone}` : 'DOMICILIO WA';

    return {
      IDventas: dom.ventaId || dom.IDdomicilio,
      pedido: `#${dom.orderIdWA || dom.IDdomicilio.slice(-6)}`,
      estado: dom.estado === 'RECIENTE' ? 'TOMADO' : (dom.estado === 'TOMADO' ? 'PREPARANDO' : dom.estado),
      fechaYHora: dom.timestampPedido || dom.createdAt,
      fecha: dom.timestampPedido || dom.createdAt,
      cliente: dom.clienteNombre ? `${dom.clienteNombre} (${dom.clienteTelefono})` : dom.clienteTelefono,
      mesa: mesaStr,
      direccion: dom.direccion || 'Sin dirección',
      telefono: dom.clienteTelefono,
      medioDePago: dom.metodoPagoWA || 'PENDIENTE',
      totalInput: totalVenta,
      Total: totalVenta,
      totalGlobal: totalVenta,
      notas: dom.detalleTextoWA || undefined,
      mensaje: `Chatbot WhatsApp (${dom.botNombre || 'IA'})`,
      ordenVentas,
      itemsExternos: itemsExt,
      ...(isDomComandeado ? {
        comandaImpresa: true,
        comandaImpresaAt: dom.atendidoAt || dom.timestampPedido,
        cocinaInicioAt: dom.atendidoAt,
      } : {}),
      _isDomicilioWA: true,
      _rawDomicilio: dom,
    };
  };

  const renderDomicilioItem = ({ item }: { item: DomicilioWAItem }) => {
    const cleanPhone = (item.clienteTelefono || '').replace(/\D/g, '');
    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : null;
    const ventaEstado = item.ventaRelacion?.estado;
    const isCobrado = item.estado === 'COBRADO' || item.estado === 'PAGADO' || isVentaPagada(item.ventaRelacion);
    const isCancelado = item.estado === 'CANCELADO' || ventaEstado === 'CANCELADO';
    const isTomado = (item.estado === 'TOMADO' || ventaEstado === 'TOMADO') && !isCobrado && !isCancelado;
    const isReciente = item.estado === 'RECIENTE' && !isCobrado && !isCancelado;
    const isDeudor = (item.estado === 'DEUDOR' || ventaEstado === 'DEUDOR') && !isCobrado;

    let estadoBadgeBg = '#fef3c7';
    let estadoBadgeText = '#d97706';
    let borderColor = '#f59e0b';
    let estadoLabel = item.estado?.toUpperCase() || 'RECIENTE';

    if (isCobrado) {
      estadoLabel = 'PAGADO';
      estadoBadgeBg = '#d1fae5';
      estadoBadgeText = '#059669';
      borderColor = '#10b981';
    } else if (isDeudor) {
      estadoLabel = 'DEUDOR';
      estadoBadgeBg = '#fee2e2';
      estadoBadgeText = '#dc2626';
      borderColor = '#ef4444';
    } else if (isTomado) {
      estadoLabel = 'TOMADO';
      estadoBadgeBg = '#dbeafe';
      estadoBadgeText = '#2563eb';
      borderColor = '#3b82f6';
    } else if (isCancelado) {
      estadoLabel = 'CANCELADO';
      estadoBadgeBg = '#f3f4f6';
      estadoBadgeText = '#6b7280';
      borderColor = '#9ca3af';
    }

    const rawItemsPropios = Array.isArray(item.itemsMapeados) ? item.itemsMapeados : [];
    const rawItemsExt = Array.isArray(item.itemsExternos) ? item.itemsExternos : [];

    const itemsPropios: any[] = [];
    const itemsExt: any[] = [...rawItemsExt];

    for (const it of rawItemsPropios) {
      if (isZeroPriceOrExternalProduct(it)) {
        itemsExt.push({
          nombre: it.nombre,
          cantidad: it.cantidad || 1,
          observacion: it.comentarios ? `${it.comentarios}` : `Precio $0 en catálogo local`,
        });
      } else {
        itemsPropios.push(it);
      }
    }

    return (
      <View style={{ marginBottom: 12 }}>
        <TouchableOpacity
          style={[
            styles.card,
            {
              borderLeftWidth: 5,
              borderLeftColor: borderColor,
              padding: 14,
            }
          ]}
          onPress={() => {
            setSelectedVenta(mapDomicilioToVenta(item));
            setModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          {/* Header de la tarjeta */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
              <View style={{ backgroundColor: '#25D36620', padding: 6, borderRadius: 10 }}>
                <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <RNText style={[styles.cardTitle, { fontSize: 15 }]}>
                    #{item.orderIdWA || item.IDdomicilio.slice(-6)}
                  </RNText>
                  <View style={{ backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 1, borderColor: '#fde68a' }}>
                    <RNText style={{ fontSize: 10, fontWeight: '800', color: '#b45309' }}>DOMIS</RNText>
                  </View>
                </View>
                <RNText style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
                  {formatDateTime(item.timestampPedido || item.createdAt)}
                </RNText>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <DomicilioTimer timestamp={item.timestampPedido || item.createdAt} estado={item.estado} />
              <View style={[styles.statusBadge, { backgroundColor: estadoBadgeBg }]}>
                <RNText style={[styles.statusText, { color: estadoBadgeText }]}>
                  {estadoLabel}
                </RNText>
              </View>
            </View>
          </View>

          {/* Información del Cliente y Entrega */}
          <View style={{ backgroundColor: '#f9fafb', padding: 10, borderRadius: 10, marginBottom: 10, gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                <Ionicons name="person" size={15} color="#4b5563" style={{ marginRight: 6 }} />
                <RNText style={{ fontSize: 13, fontWeight: '700', color: '#1f2937' }}>
                  {item.clienteNombre || 'Cliente WhatsApp'}
                </RNText>
              </View>
              {waUrl && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    Linking.openURL(waUrl).catch(() => Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo abrir WhatsApp' }));
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#25D366', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 }}
                >
                  <Ionicons name="logo-whatsapp" size={13} color="#fff" style={{ marginRight: 4 }} />
                  <RNText style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>Chat</RNText>
                </TouchableOpacity>
              )}
            </View>

            {/* Banner de Fidelidad y Beneficios Solicitados */}
            {(() => {
              const txt = (item.detalleTextoWA || '') + ' ' + (item.origen || '');
              const tieneDescuento15 = /15%_DESCUENTO|15%\s*descuento/i.test(txt);
              const tieneGranizadoGratis = /GRANIZADO_GRATIS|PREMIO FIDELIDAD|granizado gratis/i.test(txt);
              const mCliente = item.origen && item.origen.match(/cliente:(\d+)/);
              const clienteCod = (item as any).clienteId || (mCliente ? mCliente[1] : null);

              if (!tieneDescuento15 && !tieneGranizadoGratis && !clienteCod) return null;

              return (
                <View style={{ marginTop: 4, padding: 6, backgroundColor: '#fdf4ff', borderRadius: 8, borderWidth: 1, borderColor: '#f0abfc' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <RNText style={{ fontSize: 11, fontWeight: '700', color: '#86198f' }}>
                      🏷️ Tarjeta Fidelidad {clienteCod ? `(Cliente #${clienteCod})` : ''}
                    </RNText>
                  </View>
                  {tieneGranizadoGratis && (
                    <RNText style={{ fontSize: 11, fontWeight: '800', color: '#c026d3', marginTop: 2 }}>
                      🎁 SOLICITÓ GRANIZADO GRATIS 10/10 (Validar antes de despachar)
                    </RNText>
                  )}
                  {tieneDescuento15 && (
                    <RNText style={{ fontSize: 11, fontWeight: '800', color: '#9333ea', marginTop: 2 }}>
                      🎉 SOLICITÓ 15% DCTO EN GRANIZADOS (Validar antes de despachar)
                    </RNText>
                  )}
                </View>
              );
            })()}

            {item.direccion ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1, marginRight: 6 }}>
                  <Ionicons name="location" size={15} color="#ef4444" style={{ marginRight: 6, marginTop: 2 }} />
                  <RNText style={{ fontSize: 12, color: '#374151', fontWeight: '500', flex: 1 }} selectable={true}>
                    {item.direccion}
                  </RNText>
                </View>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    handleCopyToClipboard(item.direccion, 'Dirección copiada');
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0f2fe', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Copiar dirección"
                >
                  <Ionicons name="copy-outline" size={12} color="#0284c7" />
                  <RNText style={{ fontSize: 10, fontWeight: '700', color: '#0284c7', marginLeft: 3 }}>Copiar</RNText>
                </TouchableOpacity>
              </View>
            ) : null}

            {item.metodoPagoWA ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <Ionicons name="wallet-outline" size={14} color="#6b7280" style={{ marginRight: 6 }} />
                <RNText style={{ fontSize: 12, color: '#4b5563' }}>
                  Pago detectado: <RNText style={{ fontWeight: 'bold', color: '#111827' }}>{item.metodoPagoWA}</RNText>
                </RNText>
              </View>
            ) : null}
          </View>

          {/* Resumen de Productos */}
          <View style={{ marginBottom: 10 }}>
            {itemsPropios.map((it, idx) => {
              let itPrice = it.precioTotal || (it.precioUnitario || 0) * (it.cantidad || 1);
              if (!itPrice && it.nombre) {
                const m = it.nombre.match(/\(\$?([\d.,]+)\)/);
                if (m) {
                  const rawVal = parseFloat(m[1].replace(/\./g, '')) || 0;
                  itPrice = rawVal < 100 ? rawVal * 1000 : rawVal;
                }
              }
              if (itPrice > 0 && itPrice < 100) itPrice = itPrice * 1000;

              let modifiersList: Array<{ name: string; price?: number; quantity?: number }> = [];
              if (it.comentarios) {
                try {
                  const parsed = JSON.parse(it.comentarios);
                  if (Array.isArray(parsed)) modifiersList = parsed;
                } catch (e) {}
              }

              return (
                <View key={idx} style={{ paddingVertical: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                      <RNText style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                        {it.cantidad}x{' '}
                      </RNText>
                      <RNText style={{ fontSize: 13, color: '#374151', flexShrink: 1 }} numberOfLines={1}>
                        {it.nombre}
                      </RNText>
                      {it.encontradoEnCatalogo === false && (
                        <View style={{ marginLeft: 6, backgroundColor: '#fef3c7', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                          <RNText style={{ fontSize: 9, color: '#b45309', fontWeight: '600' }}>Sin ID</RNText>
                        </View>
                      )}
                    </View>
                    <RNText style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>
                      {formatMoney(itPrice)}
                    </RNText>
                  </View>
                  {modifiersList.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2, paddingLeft: 16 }}>
                      {modifiersList.map((m, mIdx) => (
                        <View key={mIdx} style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                          <RNText style={{ fontSize: 10, color: '#4b5563' }}>
                            + {m.name} {m.price ? `(${formatMoney(m.price)})` : ''}
                          </RNText>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

            {itemsExt.length > 0 && (
              <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f3e8ff' }}>
                <RNText style={{ fontSize: 10, fontWeight: '700', color: '#7c3aed', marginBottom: 2 }}>
                  Items para otro comercio / bot:
                </RNText>
                {itemsExt.map((ext, idx) => (
                  <RNText key={idx} style={{ fontSize: 12, color: '#6b21a8' }} numberOfLines={1}>
                    • {ext.cantidad}x {ext.nombre} {ext.observacion ? `(${ext.observacion})` : ''}
                  </RNText>
                ))}
              </View>
            )}

            {itemsPropios.length === 0 && itemsExt.length === 0 && item.detalleTextoWA ? (
              <RNText style={{ fontSize: 12, color: '#4b5563', fontStyle: 'italic' }}>
                "{item.detalleTextoWA}"
              </RNText>
            ) : null}
          </View>

          {/* Footer de la tarjeta con Total y Acciones */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
            <View>
              {(() => {
                const totalPedido = normalizeCOP(item.totalWA) || normalizeCOP(item.totalCalculado) || 0;
                const totalLocal = itemsPropios.reduce((sum, it) => {
                  let itPrice = it.precioTotal || (it.precioUnitario || 0) * (it.cantidad || 1);
                  return sum + normalizeCOP(itPrice);
                }, 0);

                const esSoloExterno = itemsPropios.length === 0 && itemsExt.length > 0;
                return (
                  <>
                    <RNText style={{ fontSize: 10, fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase' }}>
                      {esSoloExterno ? 'COBRAR ESTE LOCAL' : (totalLocal > 0 && totalPedido > totalLocal ? 'TOTAL ESTE LOCAL' : 'TOTAL PEDIDO')}
                    </RNText>
                    <RNText style={{ fontSize: 16, fontWeight: '800', color: esSoloExterno ? '#9ca3af' : '#111827' }}>
                      {formatMoney(esSoloExterno ? 0 : (totalLocal > 0 ? totalLocal : totalPedido))}
                    </RNText>
                    {totalLocal > 0 && totalPedido > totalLocal && (
                      <RNText style={{ fontSize: 10, color: '#059669', fontWeight: '700' }}>
                        Total global cliente: {formatMoney(totalPedido)}
                      </RNText>
                    )}
                    {esSoloExterno && (
                      <RNText style={{ fontSize: 10, color: '#7c3aed', fontWeight: '700' }}>
                        Pedido de otro comercio ({formatMoney(totalPedido)})
                      </RNText>
                    )}
                  </>
                );
              })()}
            </View>


            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {isReciente && (
                <>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      handleCancelarDomicilio(item);
                    }}
                    style={{ paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5' }}
                  >
                    <RNText style={{ fontSize: 12, color: '#ef4444', fontWeight: '600' }}>Rechazar</RNText>
                  </TouchableOpacity>

                  {(() => {
                    const isTakingThisDom = !!takingDomicilioIds[item.IDdomicilio];
                    return (
                      <TouchableOpacity
                        disabled={isTakingThisDom}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleTomarDomicilio(item);
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: isTakingThisDom ? '#93c5fd' : '#3b82f6',
                          paddingVertical: 7,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          opacity: isTakingThisDom ? 0.7 : 1,
                        }}
                      >
                        {isTakingThisDom ? (
                          <ActivityIndicator size="small" color="#fff" style={{ marginRight: 4 }} />
                        ) : (
                          <Ionicons name="hand-right-outline" size={14} color="#fff" style={{ marginRight: 4 }} />
                        )}
                        <RNText style={{ fontSize: 12, color: '#fff', fontWeight: 'bold' }}>
                          {isTakingThisDom ? 'Tomando...' : 'Tomar'}
                        </RNText>
                      </TouchableOpacity>
                    );
                  })()}
                </>
              )}

              {isTomado && (
                <>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      handleCancelarDomicilio(item);
                    }}
                    style={{ paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5' }}
                  >
                    <RNText style={{ fontSize: 12, color: '#ef4444', fontWeight: '600' }}>Cancelar</RNText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      handleCobrarDomicilio(item);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#10b981', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8 }}
                  >
                    <Ionicons name="cash-outline" size={14} color="#fff" style={{ marginRight: 4 }} />
                    <RNText style={{ fontSize: 12, color: '#fff', fontWeight: 'bold' }}>Cobrar</RNText>
                  </TouchableOpacity>
                </>
              )}

              {isCobrado && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="checkmark-done" size={16} color="#10b981" />
                  <RNText style={{ fontSize: 12, fontWeight: '700', color: '#10b981' }}>Completado</RNText>
                </View>
              )}

              {isCancelado && (
                <RNText style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Cancelado</RNText>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderListItem = ({ item }: { item: any }) => {
    if (item.isHeader) {
      return renderSectionHeader({ title: item.title, count: item.count, date: item.date, total: item.total });
    }
    if (item.isDomicilio) {
      return renderDomicilioItem({ item: item as DomicilioWAItem });
    }
    return renderVentaItem({ item: item as VentaItem });
  };

  const flatListData = useMemo(() => {
    if (activeTab === 'DOMIS') {
      let filteredDomis = visibleDomicilios;

      if (domisSubTab === 'NUEVOS') {
        filteredDomis = filteredDomis.filter(d => 
          d.estado === 'RECIENTE' && !isVentaPagada(d.ventaRelacion)
        );
      } else if (domisSubTab === 'TOMADOS') {
        filteredDomis = filteredDomis.filter(d => 
          (d.estado === 'TOMADO' || d.ventaRelacion?.estado === 'TOMADO') &&
          !(d.estado === 'COBRADO' || d.estado === 'PAGADO' || isVentaPagada(d.ventaRelacion)) &&
          d.estado !== 'CANCELADO' && d.ventaRelacion?.estado !== 'CANCELADO'
        );
      } else if (domisSubTab === 'PAGADOS') {
        filteredDomis = filteredDomis.filter(d => 
          d.estado === 'COBRADO' || d.estado === 'PAGADO' || isVentaPagada(d.ventaRelacion)
        );
      }

      if (filters.searchText) {
        const q = filters.searchText.toLowerCase();
        filteredDomis = filteredDomis.filter(d => 
          (d.clienteNombre && d.clienteNombre.toLowerCase().includes(q)) ||
          (d.clienteTelefono && d.clienteTelefono.includes(q)) ||
          (d.direccion && d.direccion.toLowerCase().includes(q)) ||
          (d.orderIdWA && d.orderIdWA.toLowerCase().includes(q))
        );
      }

      const grouped = groupDomisByDate(filteredDomis);
      const result: (any)[] = [];
      grouped.forEach(section => {
        const totalAmount = section.data.reduce((sum, item) => {
          const itemTotal = normalizeCOP(item.totalWA) || normalizeCOP(item.totalCalculado) || 0;
          return sum + itemTotal;
        }, 0);
        result.push({
          isHeader: true,
          title: section.title,
          date: section.date,
          count: section.data.length,
          total: totalAmount,
        });
        result.push(...section.data.map(d => ({ ...d, isDomicilio: true })));
      });
      return result;
    }

    const result: (VentaItem | { isHeader: boolean; title: string; date: Date; count: number; total?: number })[] = [];
    groupedVentas.forEach(section => {
      const totalAmount = section.data.reduce((sum, item) => sum + getVentaTotal(item), 0);
      result.push({ isHeader: true, title: section.title, date: section.date, count: section.data.length, total: totalAmount });
      result.push(...section.data);
    });
    return result;
  }, [activeTab, domisSubTab, visibleDomicilios, filters.searchText, groupedVentas, groupDomisByDate]);

  const keyExtractor = (item: any, index: number) => {
    if (item.isHeader) {
      return `header-${item.title}`;
    }
    if (item.isDomicilio) {
      return `domicilio-${item.IDdomicilio || index}`;
    }
    return (item as VentaItem).IDventas || `venta-${index}`;
  };

  const renderTimeline = () => {
    if (!selectedVenta?.registroDeTiempo || !Array.isArray(selectedVenta.registroDeTiempo) || selectedVenta.registroDeTiempo.length === 0) {
      return null;
    }

    const log = selectedVenta.registroDeTiempo;
    return (
      <View style={styles.modalSection}>
        <RNText style={styles.modalSectionTitle}>TRAZA DE TIEMPO</RNText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timelineScroll}>
          {log.map((entry: any, index: number) => {
            const isLast = index === log.length - 1;
            const dateObj = new Date(entry.fecha_hora);
            const timeStr = dateObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const dateStr = dateObj.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
            
            let duracionStr = '';
            if (entry.duracion) {
              const parts = entry.duracion.split(':');
              if (parts.length === 4) {
                const d = parseInt(parts[0], 10);
                const h = parseInt(parts[1], 10);
                const m = parseInt(parts[2], 10);
                const s = parseInt(parts[3], 10);
                if (d > 0) duracionStr += `${d}d `;
                if (h > 0) duracionStr += `${h}h `;
                if (m > 0) duracionStr += `${m}m `;
                if (s > 0 || duracionStr === '') duracionStr += `${s}s`;
              } else {
                duracionStr = entry.duracion;
              }
            }

            const color = getStatusColor(entry.estado);

            return (
              <View key={index} style={styles.timelineNodeRow}>
                <View style={styles.timelineNodeBox}>
                  <View style={styles.timelineTimeContainer}>
                    <RNText style={styles.timelineDateText}>{dateStr}</RNText>
                    <RNText style={styles.timelineTimeText}>{timeStr}</RNText>
                  </View>
                  <RNText style={styles.timelineDurText}>
                    {index > 0 && duracionStr ? `+${duracionStr.trim()}` : ''}
                  </RNText>
                  
                  <View style={[styles.timelineDotHoriz, { backgroundColor: color }]} />
                  
                  <View style={[styles.timelineBadgeHoriz, { backgroundColor: color + '15' }]}>
                    <RNText style={[styles.timelineBadgeText, { color }]}>
                      {entry.estado?.replace(/_/g, ' ')}
                    </RNText>
                  </View>
                </View>

                {!isLast && (
                  <View style={[styles.timelineLineHoriz, { backgroundColor: color + '50' }]} />
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const [realtimeDuration, setRealtimeDuration] = useState<string | null>(null);
  const [repartidores, setRepartidores] = useState<any[]>([]);

  const getFullImageUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('file:') || url.startsWith('content:') || url.startsWith('data:') || url.startsWith('blob:')) return url;
    const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
    return url.startsWith('/uploads') ? `${baseUrl}${url}` : url;
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (selectedVenta && selectedVenta.estado !== 'PAGADO' && selectedVenta.estado !== 'ENTREGADO') {
      const updateTimer = () => {
        if (!selectedVenta.registroDeTiempo || selectedVenta.registroDeTiempo.length === 0) return;
        const diff = computeActiveMs(selectedVenta.registroDeTiempo, Date.now());
        setRealtimeDuration(formatDurationStr(diff));
      };
      
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    } else if (selectedVenta && (selectedVenta.estado === 'PAGADO' || selectedVenta.estado === 'ENTREGADO')) {
      if (selectedVenta.registroDeTiempo && selectedVenta.registroDeTiempo.length > 0) {
        const lastEntry = selectedVenta.registroDeTiempo[selectedVenta.registroDeTiempo.length - 1];
        const end = new Date(lastEntry.fecha_hora).getTime();
        const diff = computeActiveMs(selectedVenta.registroDeTiempo, end);
        setRealtimeDuration(formatDurationStr(diff));
      } else {
        setRealtimeDuration(null);
      }
    } else {
      setRealtimeDuration(null);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedVenta]);

  const renderModal = () => {
    if (!selectedVenta) return null;
    const productos = selectedVenta.ordenVentas || [];

    return (
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={closeModal}
        presentationStyle="pageSheet"
      >
        <StatusBar style="dark" backgroundColor="#ffffff" translucent={false} />
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
                <RNText style={[styles.modalTitle, { flexShrink: 1 }]} numberOfLines={2}>{selectedVenta.pedido}</RNText>
                <RealtimeDurationTimer selectedVenta={selectedVenta} />
              </View>
              <TouchableOpacity onPress={closeModal} style={[styles.closeBtn, { flexShrink: 0 }]}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.modalSection}>
                <RNText style={styles.modalSectionTitle}>INFORMACIÓN</RNText>
                <View style={styles.detailRow}>
                  <RNText style={styles.detailLabel}>Estado:</RNText>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedVenta.estado) + '20' }]}>
                    <RNText style={[styles.statusText, { color: getStatusColor(selectedVenta.estado) }]}>
                      {selectedVenta.estado?.replace(/_/g, ' ')}
                    </RNText>
                  </View>
                </View>
                <View style={styles.detailRow}>
                  <RNText style={styles.detailLabel}>Fecha:</RNText>
                  <RNText style={styles.detailValue}>{formatDateTime(selectedVenta.fechaYHora)}</RNText>
                </View>
                {selectedVenta.cliente && (
                  <View style={styles.detailRow}>
                    <RNText style={styles.detailLabel}>Cliente:</RNText>
                    <RNText style={styles.detailValue} selectable={true}>{selectedVenta.cliente}</RNText>
                  </View>
                )}
                {getCleanPhoneNumber(selectedVenta) ? (
                  <View style={styles.detailRow}>
                    <RNText style={styles.detailLabel}>Teléfono / WA:</RNText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <RNText style={styles.detailValue} selectable={true}>{getCleanPhoneNumber(selectedVenta)}</RNText>
                      <TouchableOpacity
                        style={styles.detailSmallCopyBtn}
                        onPress={() => handleCopyToClipboard(getCleanPhoneNumber(selectedVenta)!, 'Teléfono copiado')}
                        accessibilityRole="button"
                        accessibilityLabel="Copiar teléfono"
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="copy-outline" size={14} color="#0284c7" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
                {selectedVenta.direccion ? (
                  <View style={styles.detailAddressCard}>
                    <View style={styles.detailAddressHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="location" size={16} color="#0284c7" />
                        <RNText style={styles.detailAddressLabel}>DIRECCIÓN DE ENTREGA</RNText>
                      </View>
                      <TouchableOpacity
                        style={styles.detailCopyBtn}
                        onPress={() => handleCopyToClipboard(selectedVenta.direccion, 'Dirección copiada')}
                        accessibilityRole="button"
                        accessibilityLabel="Copiar dirección"
                      >
                        <Ionicons name="copy-outline" size={13} color="#0284c7" />
                        <RNText style={styles.detailCopyBtnText}>Copiar</RNText>
                      </TouchableOpacity>
                    </View>
                    <RNText style={styles.detailAddressValue} selectable={true}>
                      {selectedVenta.direccion}
                    </RNText>
                  </View>
                ) : null}
                {selectedVenta.costoDelDomicilio && Number(selectedVenta.costoDelDomicilio) > 0 ? (
                  <View style={styles.detailRow}>
                    <RNText style={styles.detailLabel}>Costo Domicilio:</RNText>
                    <RNText style={styles.detailValue}>{formatMoney(Number(selectedVenta.costoDelDomicilio))}</RNText>
                  </View>
                ) : null}
                {selectedVenta.mesa && !/^[a-z0-9]{25}$/i.test(selectedVenta.mesa) && !selectedVenta.mesa.startsWith('DOMICILIO WA') ? (
                  <View style={styles.detailRow}>
                    <RNText style={styles.detailLabel}>Mesa:</RNText>
                    <RNText style={styles.detailValue}>{selectedVenta.mesa}</RNText>
                  </View>
                ) : null}
                {selectedVenta.medioDePago && (
                  <View style={styles.detailRow}>
                    <RNText style={styles.detailLabel}>Medio de Pago:</RNText>
                    <RNText style={styles.detailValue}>
                      {selectedVenta.medioDePago}
                      {selectedVenta.banco && selectedVenta.medioDePago !== 'EFECTIVO Y OTROS' ? ` (${selectedVenta.banco})` : ''}
                    </RNText>
                  </View>
                )}
                {selectedVenta.medioDePago === 'EFECTIVO Y OTROS' && (
                  <>
                    <View style={styles.detailRow}>
                      <RNText style={styles.detailLabel}>Efectivo:</RNText>
                      <RNText style={styles.detailValue}>{formatMoney(selectedVenta.efectivoRecibido)}</RNText>
                    </View>
                    <View style={styles.detailRow}>
                      <RNText style={styles.detailLabel}>Transferencia ({selectedVenta.banco || 'Banco'}):</RNText>
                      <RNText style={styles.detailValue}>
                        {formatMoney((selectedVenta.totalInput || 0) - (selectedVenta.efectivoRecibido || 0))}
                      </RNText>
                    </View>
                  </>
                )}
                {selectedVenta.medioDePago === 'EFECTIVO' && (
                  <>
                    <View style={styles.detailRow}>
                      <RNText style={styles.detailLabel}>Recibido:</RNText>
                      <RNText style={styles.detailValue}>{formatMoney(selectedVenta.efectivoRecibido)}</RNText>
                    </View>
                    <View style={styles.detailRow}>
                      <RNText style={styles.detailLabel}>Devueltas:</RNText>
                      <RNText style={styles.detailValue}>{formatMoney(selectedVenta.devueltas)}</RNText>
                    </View>
                  </>
                )}
                {selectedVenta.usuarioRelacion?.nombre && (
                  <View style={styles.detailRow}>
                    <RNText style={styles.detailLabel}>Vendedor:</RNText>
                    <RNText style={styles.detailValue}>{selectedVenta.usuarioRelacion.nombre}</RNText>
                  </View>
                )}
              </View>

              {renderTimeline()}

              <View style={styles.modalSection}>
                <RNText style={styles.modalSectionTitle}>PRODUCTOS ({productos.length})</RNText>
                {productos.map((prod, idx) => {
                  let notas: any[] = [];
                  if (prod.comentarios) {
                    try {
                      let parsed = typeof prod.comentarios === 'string' ? JSON.parse(prod.comentarios) : prod.comentarios;
                      if (typeof parsed === 'string' && parsed.trim().startsWith('{')) {
                        try { parsed = JSON.parse(parsed); } catch (e) {}
                      }
                      if (Array.isArray(parsed)) {
                        notas = parsed;
                      } else if (parsed && typeof parsed === 'object') {
                        notas = [parsed];
                      } else if (parsed) {
                        notas = [{ name: String(parsed), price: 0 }];
                      }
                    } catch (e) {
                      if (typeof prod.comentarios === 'string' && prod.comentarios.trim().length > 0) {
                        let cStr = prod.comentarios.trim();
                        if (cStr.startsWith('{')) {
                          try {
                            const inner = JSON.parse(cStr);
                            notas = [inner];
                          } catch (err) {
                            notas = [{ name: cStr, price: 0 }];
                          }
                        } else {
                          notas = [{ name: cStr, price: 0 }];
                        }
                      }
                    }
                  }

                  const isZeroCatalog = isZeroPriceOrExternalProduct(prod);

                  return (
                    <View key={prod.IDorderventas || prod.producto?.IDproductos || idx} style={{ marginBottom: 12 }}>
                      <View style={styles.productItem}>
                        <View style={styles.productImageContainer}>
                          {prod.imagenUrl || prod.producto?.imagenUrl || prod.producto?.image ? (
                            <Image source={{ uri: getFullImageUrl(prod.imagenUrl || prod.producto?.imagenUrl || prod.producto?.image) }} style={styles.productImage} />
                          ) : (
                            <View style={[styles.productImage, styles.productImagePlaceholder]}>
                              <MaterialCommunityIcons name="image-off" size={20} color="#d1d5db" />
                            </View>
                          )}
                        </View>
                        <View style={styles.productDetails}>
                          <RNText style={styles.productName} numberOfLines={1}>{prod.nombreProducto || prod.nombre}</RNText>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                            <RNText style={styles.productMeta}>{prod.cantidad}x {formatMoney(prod.precio)}</RNText>
                            <PreparationTimer 
                              registroDeTiempo={selectedVenta.registroDeTiempo}
                              preparadoAt={prod.preparadoAt} 
                              estado={(prod.cantidad && prod.cantidad > 1 && (prod.cantidadPreparada || 0) < prod.cantidad) ? 'PREPARANDO' : prod.estado} 
                            />
                          </View>
                          {isZeroCatalog && (
                            <View style={{ backgroundColor: '#fee2e2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginTop: 3, borderWidth: 1, borderColor: '#fca5a5' }}>
                              <RNText style={{ fontSize: 10, color: '#b91c1c', fontWeight: 'bold' }}>
                                ⚠️ Precio $0 en catálogo local (De otro comercio)
                              </RNText>
                            </View>
                          )}
                          
                          {/* Notas/Modificadores con cantidades y precios */}
                          {notas.length > 0 && (
                            <View style={{ marginTop: 2, marginBottom: 2 }}>
                              {notas.map((nota, nIdx) => {
                                let notaName = nota.name || nota.nombre || nota.Nombre || '';
                                if (typeof notaName === 'string' && notaName.trim().startsWith('{')) {
                                  try {
                                    const inner = JSON.parse(notaName);
                                    notaName = inner.name || inner.nombre || inner.Nombre || notaName;
                                  } catch (e) {}
                                }
                                const notaPrice = Number(nota.price ?? nota.precio ?? nota.Precio ?? 0);
                                const notaQty = Number(nota.quantity ?? nota.cantidad ?? 1);
                                const displayQty = notaQty > 1 ? `${notaQty}x ` : '';
                                
                                let priceLabel = '';
                                if (notaPrice !== 0) {
                                  const sign = notaPrice < 0 ? '-' : '+';
                                  priceLabel = ` (${sign}${formatMoney(Math.abs(notaPrice * notaQty))})`;
                                }

                                return (
                                  <View key={nIdx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' }}>
                                    <View style={{ 
                                      backgroundColor: notaPrice < 0 ? '#fce4ec' : '#fef3c7', 
                                      paddingHorizontal: 6, 
                                      paddingVertical: 2, 
                                      borderRadius: 6, 
                                      flexDirection: 'row', 
                                      alignItems: 'center',
                                      flexShrink: 1
                                    }}>
                                      <RNText style={{ fontSize: 10, color: notaPrice < 0 ? '#c62828' : '#b45309', fontWeight: '700', flexShrink: 1 }}>
                                        {displayQty}{notaName}{priceLabel}
                                      </RNText>
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                          <RNText style={styles.productTotal}>{formatMoney(prod.precioTotal)}</RNText>
                          {(() => {
                            const cantTotal = prod.cantidad || 1;
                            const cantPrep = prod.cantidadPreparada || 0;
                            const isFullyReady = cantPrep >= cantTotal;
                            const isPartial = cantPrep > 0 && cantPrep < cantTotal;

                            if (cantTotal > 1) {
                              let pillBg = '#ffffff';
                              let pillBorder = '#d1d5db';
                              let pillTextColor = '#4b5563';

                              if (isFullyReady) {
                                pillBg = '#10b981';
                                pillBorder = '#10b981';
                                pillTextColor = '#ffffff';
                              } else if (isPartial) {
                                pillBg = '#fef3c7'; // Ámbar suave: claramente NO verde cuando faltan unidades
                                pillBorder = '#f59e0b';
                                pillTextColor = '#b45309';
                              }

                              return (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                                  <TouchableOpacity
                                    style={{
                                      backgroundColor: '#f3f4f6',
                                      padding: 4,
                                      borderRadius: 8,
                                      borderWidth: 1,
                                      borderColor: '#d1d5db'
                                    }}
                                    onPress={() => toggleProductReady(selectedVenta, prod, 'decrement')}
                                  >
                                    <Ionicons name="remove" size={16} color="#6b7280" />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={{
                                      backgroundColor: pillBg,
                                      paddingHorizontal: 12,
                                      paddingVertical: 4,
                                      borderRadius: 12,
                                      marginHorizontal: 6,
                                      borderWidth: 1,
                                      borderColor: pillBorder,
                                    }}
                                    onPress={() => toggleProductReady(selectedVenta, prod, 'max')}
                                  >
                                    <RNText style={{ fontSize: 11, fontWeight: 'bold', color: pillTextColor }}>
                                      {cantPrep}/{cantTotal} {cantPrep === 1 ? 'LISTO' : 'LISTOS'}
                                    </RNText>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={{
                                      backgroundColor: '#f3f4f6',
                                      padding: 4,
                                      borderRadius: 8,
                                      borderWidth: 1,
                                      borderColor: '#d1d5db'
                                    }}
                                    onPress={() => toggleProductReady(selectedVenta, prod, 'increment')}
                                  >
                                    <Ionicons name="add" size={16} color="#6b7280" />
                                  </TouchableOpacity>
                                </View>
                              );
                            }

                            const isSingleReady = prod.estado === 'LISTO';
                            return (
                              <TouchableOpacity
                                style={{
                                  marginTop: 6,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  backgroundColor: isSingleReady ? '#10b981' : '#ffffff',
                                  paddingHorizontal: 12,
                                  paddingVertical: 6,
                                  borderRadius: 20,
                                  borderWidth: 1,
                                  borderColor: isSingleReady ? '#10b981' : '#d1d5db',
                                  shadowColor: '#000',
                                  shadowOffset: { width: 0, height: 1 },
                                  shadowOpacity: 0.1,
                                  shadowRadius: 2,
                                  elevation: 2,
                                }}
                                onPress={() => toggleProductReady(selectedVenta, prod)}
                              >
                                <Ionicons name={isSingleReady ? "checkmark-circle" : "time-outline"} size={16} color={isSingleReady ? "#ffffff" : "#6b7280"} />
                                <RNText style={{ fontSize: 11, color: isSingleReady ? '#ffffff' : '#4b5563', fontWeight: 'bold', marginLeft: 6 }}>
                                  {isSingleReady ? 'LISTO' : 'PREPARANDO'}
                                </RNText>
                              </TouchableOpacity>
                            );
                          })()}
                        </View>
                      </View>
                    </View>
                  );
                })}

                {(selectedVenta as any).itemsExternos && (selectedVenta as any).itemsExternos.length > 0 && (
                  <View style={{ backgroundColor: '#faf5ff', padding: 12, borderRadius: 10, marginTop: 10, borderWidth: 1, borderColor: '#e9d5ff' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <Ionicons name="storefront-outline" size={16} color="#7c3aed" style={{ marginRight: 6 }} />
                      <RNText style={{ fontSize: 12, fontWeight: 'bold', color: '#7c3aed' }}>
                        Items de otro comercio / bot (No cobrados ni preparados aquí):
                      </RNText>
                    </View>
                    {(selectedVenta as any).itemsExternos.map((ext: any, eIdx: number) => (
                      <RNText key={eIdx} style={{ fontSize: 12, color: '#6b21a8', paddingVertical: 1 }}>
                        • {ext.cantidad || 1}x {ext.nombre} {ext.observacion ? `(${ext.observacion})` : ''}
                      </RNText>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.modalSection}>
                <View style={[styles.totalSection, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
                  {selectedVenta.descuento && Number(selectedVenta.descuento) > 0 ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <RNText style={[styles.totalSectionLabel, { color: '#ef4444' }]}>DESCUENTO</RNText>
                      <RNText style={[styles.totalSectionAmount, { color: '#ef4444' }]}>
                        -{formatMoney(Number(selectedVenta.descuento))}
                      </RNText>
                    </View>
                  ) : null}

                  {selectedVenta.propina && Number(selectedVenta.propina) > 0 ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <RNText style={styles.totalSectionLabel}>PROPINA {selectedVenta.porcentajePropina ? `(${selectedVenta.porcentajePropina}%)` : ''}</RNText>
                      <RNText style={styles.totalSectionAmount}>
                        {formatMoney(Number(selectedVenta.propina))}
                      </RNText>
                    </View>
                  ) : null}

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <RNText style={styles.totalSectionLabel}>TOTAL GLOBAL</RNText>
                    <RNText style={styles.totalSectionAmount}>
                      {formatMoney(
                        getVentaTotal(selectedVenta)
                      )}
                    </RNText>
                  </View>
                  
                  {(() => {
                    const subtotalProductos = getVentaTotal(selectedVenta);
                    const descuentoVal = Number(selectedVenta.descuento) || 0;
                    const propinaVal = Number(selectedVenta.propina) || 0;
                    const abonoVal = Number(selectedVenta.abono) || 0;
                    const totalNetoAPagar = Math.max(0, subtotalProductos - descuentoVal + propinaVal - abonoVal);

                    return selectedVenta.abono && abonoVal > 0 ? (
                      <>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <RNText style={[styles.totalSectionLabel, { color: '#059669' }]}>ABONO</RNText>
                          <RNText style={[styles.totalSectionAmount, { color: '#059669' }]}>
                            -{formatMoney(abonoVal)}
                          </RNText>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8 }}>
                          <RNText style={styles.totalSectionLabel}>TOTAL A PAGAR</RNText>
                          <RNText style={styles.totalSectionAmount}>
                            {formatMoney(totalNetoAPagar)}
                          </RNText>
                        </View>
                      </>
                    ) : (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8 }}>
                        <RNText style={styles.totalSectionLabel}>TOTAL A PAGAR</RNText>
                        <RNText style={styles.totalSectionAmount}>
                          {formatMoney(totalNetoAPagar)}
                        </RNText>
                      </View>
                    );
                  })()}
                </View>
              </View>

              {selectedVenta.mensaje && (
                <View style={styles.modalSection}>
                  <RNText style={styles.modalSectionTitle}>MENSAJE</RNText>
                  <View style={styles.messageBox}>
                    <Ionicons name="chatbox-ellipses-outline" size={18} color="#6b7280" />
                    <RNText style={styles.messageText}>{selectedVenta.mensaje}</RNText>
                  </View>
                </View>
              )}

              <View style={styles.modalActionsSection}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <RNText style={[styles.modalSectionTitle, { marginBottom: 0 }]}>ACCIONES</RNText>
                  {(isAdminApp || user?.permisos?.ventas?.delete) && (
                    <TouchableOpacity
                      onPress={() => handleDeleteSingle(selectedVenta)}
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}
                    >
                      <Ionicons name="trash-outline" size={14} color="#ef4444" />
                      <RNText style={{ fontSize: 12, color: '#ef4444', fontWeight: '600', marginLeft: 4 }}>Eliminar Pedido</RNText>
                    </TouchableOpacity>
                  )}
                </View>
                {(isAdminApp || user?.permisos?.ventas?.edit) ? (
                  <View style={styles.actionsGrid}>
                    {selectedVenta._isDomicilioWA ? (
                      <>
                        {/* Volver al carrito / Agregar otros productos */}
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#6366f1' }]}
                          onPress={handleVolverCarrito}
                        >
                          <Ionicons name="cart-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Volver al Carrito</RNText>
                        </TouchableOpacity>

                        {/* Pasar de estado */}
                        {selectedVenta._rawDomicilio?.estado === 'RECIENTE' && (() => {
                          const rawDomId = selectedVenta._rawDomicilio?.IDdomicilio;
                          const isTakingModal = !!(rawDomId && takingDomicilioIds[rawDomId]);
                          return (
                            <TouchableOpacity
                              disabled={isTakingModal}
                              style={[styles.actionBtn, { backgroundColor: isTakingModal ? '#93c5fd' : '#3b82f6', opacity: isTakingModal ? 0.7 : 1 }]}
                              onPress={async () => {
                                await handleTomarDomicilio(selectedVenta._rawDomicilio);
                                setSelectedVenta((prev: any) => ({ ...prev, estado: 'TOMADO', _rawDomicilio: { ...prev._rawDomicilio, estado: 'TOMADO' } }));
                              }}
                            >
                              {isTakingModal ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Ionicons name="hand-right-outline" size={20} color="#fff" />
                              )}
                              <RNText style={styles.actionBtnText}>{isTakingModal ? 'Tomando...' : 'Pasar a Tomado'}</RNText>
                            </TouchableOpacity>
                          );
                        })()}

                        {selectedVenta._rawDomicilio?.estado === 'TOMADO' && (
                          <>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#8b5cf6' }]}
                              onPress={() => handleChangeEstado('LISTO_PARA_ENTREGA')}
                            >
                              <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Marcar Listo</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#10b981' }]}
                              onPress={() => handleChangeEstado('ENTREGADO')}
                            >
                              <Ionicons name="home-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Marcar Entregado</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#f59e0b' }]}
                              onPress={() => handleChangeEstado('RECIENTE')}
                            >
                              <Ionicons name="arrow-undo-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Volver a Reciente</RNText>
                            </TouchableOpacity>
                          </>
                        )}

                        {selectedVenta._rawDomicilio?.estado === 'LISTO_PARA_ENTREGA' && (
                          <>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#10b981' }]}
                              onPress={() => handleChangeEstado('ENTREGADO')}
                            >
                              <Ionicons name="paper-plane-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Marcar Entregado</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#3b82f6' }]}
                              onPress={() => handleChangeEstado('TOMADO')}
                            >
                              <Ionicons name="arrow-undo-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Volver a Tomado</RNText>
                            </TouchableOpacity>
                          </>
                        )}

                        {selectedVenta._rawDomicilio?.estado === 'ENTREGADO' && (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#8b5cf6' }]}
                            onPress={() => handleChangeEstado('LISTO_PARA_ENTREGA')}
                          >
                            <Ionicons name="arrow-undo-outline" size={20} color="#fff" />
                            <RNText style={styles.actionBtnText}>Volver a Listo</RNText>
                          </TouchableOpacity>
                        )}

                        {/* Cobro en caja */}
                        {selectedVenta._rawDomicilio?.estado !== 'COBRADO' && (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
                            onPress={() => {
                              const rawDom = selectedVenta._rawDomicilio;
                              closeModal();
                              handleCobrarDomicilio(rawDom);
                            }}
                          >
                            <Ionicons name="cash-outline" size={20} color="#fff" />
                            <RNText style={styles.actionBtnText}>Cobrar en Caja</RNText>
                          </TouchableOpacity>
                        )}

                        {/* Chat directo de WhatsApp */}
                        {selectedVenta._rawDomicilio?.clienteTelefono ? (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#25D366' }]}
                            onPress={() => {
                              const tel = (selectedVenta._rawDomicilio.clienteTelefono || '').replace(/[^0-9]/g, '');
                              const url = `https://wa.me/${tel}?text=Hola%20${encodeURIComponent(selectedVenta._rawDomicilio.clienteNombre || '')},%20te%20escribimos%20de%20Q%27hubo%20Mor%20sobre%20tu%20pedido%20%23${selectedVenta._rawDomicilio.orderIdWA || ''}`;
                              Linking.openURL(url).catch(() => Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo abrir WhatsApp' }));
                            }}
                          >
                            <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                            <RNText style={styles.actionBtnText}>Abrir WhatsApp</RNText>
                          </TouchableOpacity>
                        ) : null}

                        {/* Cancelar / Rechazar */}
                        {selectedVenta._rawDomicilio?.estado !== 'COBRADO' && selectedVenta._rawDomicilio?.estado !== 'CANCELADO' && (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                            onPress={() => {
                              const rawDom = selectedVenta._rawDomicilio;
                              closeModal();
                              handleCancelarDomicilio(rawDom);
                            }}
                          >
                            <Ionicons name="close-circle-outline" size={20} color="#fff" />
                            <RNText style={styles.actionBtnText}>Cancelar Domicilio</RNText>
                          </TouchableOpacity>
                        )}
                      </>
                    ) : (
                      <>
                        {selectedVenta.estado === 'EN_EL_CARRITO' && (
                          <>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#f59e0b' }]}
                              onPress={() => {
                                try {
                                  if (selectedVenta.ordenVentas && selectedVenta.ordenVentas.length > 0) {
                                    useCartStore.getState().loadCartFromVenta(selectedVenta.ordenVentas);
                                  } else {
                                    useCartStore.getState().clearCart();
                                  }
                                  useCartStore.getState().setEditingSale(selectedVenta.IDventas, selectedVenta);
                                  closeModal();
                                  navigation.navigate('Sales' as any);
                                } catch (err) {
                                  console.error('[PedidosScreen] Error al continuar editando:', err);
                                  Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cargar el pedido al carrito' });
                                }
                              }}
                            >
                              <Ionicons name="cart-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Continuar Editando</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                              onPress={() => {
                                useCartStore.getState().clearCart();
                                handleChangeEstado('TOMADO');
                              }}
                            >
                              <Ionicons name="close-circle-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Descartar Edición</RNText>
                            </TouchableOpacity>
                          </>
                        )}
                        {selectedVenta.estado === 'TOMADO' && (
                          <>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#8b5cf6' }]}
                              onPress={() => handleChangeEstado('LISTO_PARA_ENTREGA')}
                            >
                              <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Marcar Listo</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#10b981' }]}
                              onPress={() => handleChangeEstado('ENTREGADO')}
                            >
                              <Ionicons name="home-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Marcar Entregado</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#6b7280' }]}
                              onPress={handleVolverCarrito}
                            >
                              <Ionicons name="cart-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Volver a Carrito</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
                              onPress={handleOpenCobrar}
                            >
                              <Ionicons name="cash-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>
                                {isVentaPagada(selectedVenta) ? 'Ver / Modificar Pago' : 'Cobrar'}
                              </RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                              onPress={() => handleChangeEstado('DEUDOR')}
                            >
                              <Ionicons name="alert-circle-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Marcar Deudor</RNText>
                            </TouchableOpacity>
                          </>
                        )}
                        {selectedVenta.estado === 'LISTO_PARA_ENTREGA' && (
                          <>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#10b981' }]}
                              onPress={() => handleChangeEstado('ENTREGADO')}
                            >
                              <Ionicons name="paper-plane-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Marcar Entregado</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#f59e0b' }]}
                              onPress={() => handleChangeEstado('TOMADO')}
                            >
                              <Ionicons name="hand-left-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Volver a Tomado</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
                              onPress={handleOpenCobrar}
                            >
                              <Ionicons name="cash-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>
                                {isVentaPagada(selectedVenta) ? 'Ver / Modificar Pago' : 'Cobrar'}
                              </RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                              onPress={() => handleChangeEstado('DEUDOR')}
                            >
                              <Ionicons name="alert-circle-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Marcar Deudor</RNText>
                            </TouchableOpacity>
                          </>
                        )}
                        {selectedVenta.estado === 'PAGADO' && (
                          <>
                            {isModoRestaurante() && (
                              <>
                                <TouchableOpacity
                                  style={[styles.actionBtn, { backgroundColor: '#8b5cf6' }]}
                                  onPress={() => handleChangeEstado('LISTO_PARA_ENTREGA')}
                                >
                                  <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
                                  <RNText style={styles.actionBtnText}>Marcar Listo</RNText>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.actionBtn, { backgroundColor: '#10b981' }]}
                                  onPress={() => handleChangeEstado('ENTREGADO')}
                                >
                                  <Ionicons name="paper-plane-outline" size={20} color="#fff" />
                                  <RNText style={styles.actionBtnText}>Marcar Entregado</RNText>
                                </TouchableOpacity>
                              </>
                            )}
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                              onPress={() => handleChangeEstado('DEUDOR')}
                            >
                              <Ionicons name="alert-circle-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Marcar Deudor</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#6b7280' }]}
                              onPress={handleVolverCarrito}
                            >
                              <Ionicons name="cart-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Volver a Carrito</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
                              onPress={handleOpenCobrar}
                            >
                              <Ionicons name="cash-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>
                                {isVentaPagada(selectedVenta) ? 'Ver / Modificar Pago' : 'Cobrar / Pago'}
                              </RNText>
                            </TouchableOpacity>
                          </>
                        )}
                        {selectedVenta.estado === 'ENTREGADO' && (
                          <>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                              onPress={() => handleChangeEstado('DEUDOR')}
                            >
                              <Ionicons name="alert-circle-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Marcar Deudor</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#6b7280' }]}
                              onPress={handleVolverCarrito}
                            >
                              <Ionicons name="cart-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Volver a Carrito</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
                              onPress={handleOpenCobrar}
                            >
                              <Ionicons name="cash-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>
                                {isVentaPagada(selectedVenta) ? 'Ver / Modificar Pago' : 'Cobrar / Pago'}
                              </RNText>
                            </TouchableOpacity>
                          </>
                        )}
                        {selectedVenta.estado === 'DEUDOR' && (
                          <>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
                              onPress={handleOpenCobrar}
                            >
                              <Ionicons name="cash-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Cobrar</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#6b7280' }]}
                              onPress={handleVolverCarrito}
                            >
                              <Ionicons name="cart-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Volver a Carrito</RNText>
                            </TouchableOpacity>
                          </>
                        )}
                        {selectedVenta.estado === 'RESERVA' && (
                          <>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#f59e0b' }]}
                              onPress={() => handleChangeEstado('TOMADO')}
                            >
                              <Ionicons name="hand-left-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Pasar a Tomado</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
                              onPress={handleOpenCobrar}
                            >
                              <Ionicons name="cash-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Cobrar / Pago</RNText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#6b7280' }]}
                              onPress={handleVolverCarrito}
                            >
                              <Ionicons name="cart-outline" size={20} color="#fff" />
                              <RNText style={styles.actionBtnText}>Volver a Carrito</RNText>
                            </TouchableOpacity>
                          </>
                        )}
                      </>
                    )}
                  </View>
                ) : (
                  <View style={{ padding: 12, backgroundColor: '#f3f4f6', borderRadius: 8 }}>
                    <RNText style={{ color: '#6b7280', textAlign: 'center', fontSize: 13 }}>
                      No tienes permisos para modificar el estado de este pedido.
                    </RNText>
                  </View>
                )}
              </View>

              <View style={styles.modalActionsSection}>
                <RNText style={[styles.modalSectionTitle, { marginBottom: 12 }]}>IMPRESIÓN MANUAL</RNText>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { flex: 1, backgroundColor: '#f59e0b' }]}
                    onPress={() => { closeModal(); handleManualPrint(selectedVenta, 'comanda'); }}
                  >
                    <Ionicons name="restaurant-outline" size={20} color="#fff" />
                    <RNText style={styles.actionBtnText}>Comanda</RNText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { flex: 1, backgroundColor: '#0ea5e9' }]}
                    onPress={() => { closeModal(); handleManualPrint(selectedVenta, 'factura'); }}
                  >
                    <Ionicons name="receipt-outline" size={20} color="#fff" />
                    <RNText style={styles.actionBtnText}>Ticket</RNText>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[styles.modalActionsSection, { marginTop: 16 }]}>
                <RNText style={[styles.modalSectionTitle, { marginBottom: 12 }]}>FACTURACIÓN DIAN (FACTUS)</RNText>
                
                {selectedVenta.facturaElectronica && selectedVenta.facturaElectronica.estado === 'VALIDADA' ? (
                  <View style={{ gap: 10 }}>
                    <RNText style={{ fontSize: 14, color: '#16a34a', fontWeight: 'bold', textAlign: 'center' }}>
                      Factura Emitida (CUFE: {selectedVenta.facturaElectronica.cufe?.substring(0, 15)}...)
                    </RNText>
                    {selectedVenta.facturaElectronica.pdfUrl && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#10b981', flexDirection: 'row', justifyContent: 'center' }]}
                        onPress={() => Linking.openURL(selectedVenta.facturaElectronica.pdfUrl)}
                      >
                        <Ionicons name="download-outline" size={20} color="#fff" />
                        <RNText style={styles.actionBtnText}>Descargar / Ver PDF DIAN</RNText>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#ef4444', flexDirection: 'row', justifyContent: 'center' }, isEmittingDian && { opacity: 0.7 }]}
                      onPress={() => handleEliminarFacturaDian(selectedVenta)}
                      disabled={isEmittingDian}
                    >
                      {isEmittingDian ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="trash-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Eliminar Factura</RNText>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : selectedVenta.facturaElectronica ? (
                  <View style={{ gap: 10 }}>
                    <RNText style={{ fontSize: 14, color: '#ef4444', fontWeight: 'bold', textAlign: 'center' }}>
                      Factura en estado: {selectedVenta.facturaElectronica.estado}
                    </RNText>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#ef4444', flexDirection: 'row', justifyContent: 'center' }, isEmittingDian && { opacity: 0.7 }]}
                      onPress={() => handleEliminarFacturaDian(selectedVenta)}
                      disabled={isEmittingDian}
                    >
                      {isEmittingDian ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="trash-outline" size={20} color="#fff" />
                          <RNText style={styles.actionBtnText}>Eliminar Intento Fallido</RNText>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#2563eb', flexDirection: 'row', justifyContent: 'center' }, isEmittingDian && { opacity: 0.7 }]}
                    onPress={() => handleEmitirFacturaDian(selectedVenta)}
                    disabled={isEmittingDian}
                  >
                    {isEmittingDian ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="document-text-outline" size={20} color="#fff" />
                        <RNText style={styles.actionBtnText}>Emitir Factura Electrónica</RNText>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderFilterModal = () => (
    <Modal
      visible={filterModalVisible}
      animationType="slide"
      onRequestClose={() => setFilterModalVisible(false)}
      presentationStyle="pageSheet"
    >
      <StatusBar style="dark" backgroundColor="#ffffff" translucent={false} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.filterModalContainer}>
        <View style={styles.filterModalHeader}>
          <RNText style={styles.filterModalTitle}>Filtros</RNText>
          <TouchableOpacity onPress={() => setFilterModalVisible(false)} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#374151" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.filterModalScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>BÚSQUEDA</RNText>
            <View style={styles.filterInputContainer}>
              <Ionicons name="search" size={18} color="#6b7280" />
              <TextInput
                style={styles.filterInput}
                placeholder="Buscar por pedido, cliente, mesa..."
                placeholderTextColor="#9ca3af"
                value={filters.searchText}
                onChangeText={(text) => setFilters(prev => ({ ...prev, searchText: text }))}
              />
            </View>
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>NÚMERO DE PEDIDO</RNText>
            <View style={styles.filterInputContainer}>
              <Ionicons name="receipt-outline" size={18} color="#6b7280" />
              <TextInput
                style={styles.filterInput}
                placeholder="Ej: Mesa 1-P-001"
                placeholderTextColor="#9ca3af"
                value={filters.pedidoNumero}
                onChangeText={(text) => setFilters(prev => ({ ...prev, pedidoNumero: text }))}
              />
            </View>
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>CLIENTE</RNText>
            <View style={styles.filterInputContainer}>
              <Ionicons name="person-outline" size={18} color="#6b7280" />
              <TextInput
                style={styles.filterInput}
                placeholder="Nombre del cliente"
                placeholderTextColor="#9ca3af"
                value={filters.cliente}
                onChangeText={(text) => setFilters(prev => ({ ...prev, cliente: text }))}
              />
            </View>
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>ESTADO</RNText>
            <View style={styles.chipsContainer}>
              {ESTADOS_POSIBLES.map(estado => (
                <TouchableOpacity
                  key={estado}
                  style={[styles.chip, filters.estados.includes(estado) && styles.chipActive]}
                  onPress={() => toggleEstado(estado)}
                >
                  <RNText style={[styles.chipText, filters.estados.includes(estado) && styles.chipTextActive]}>
                    {estado.replace(/_/g, ' ')}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>MÉTODO DE PAGO</RNText>
            <View style={styles.chipsContainer}>
              {METODOS_PAGO.map(medio => (
                <TouchableOpacity
                  key={medio}
                  style={[styles.chip, filters.mediosDePago.includes(medio) && styles.chipActive]}
                  onPress={() => toggleMedioDePago(medio)}
                >
                  <RNText style={[styles.chipText, filters.mediosDePago.includes(medio) && styles.chipTextActive]}>
                    {medio}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>BANCO</RNText>
            <View style={styles.chipsContainer}>
              {['NEQUI', 'DAVIPLATA', 'BANCOLOMBIA', 'OTROS'].map(banco => (
                <TouchableOpacity
                  key={banco}
                  style={[styles.chip, filters.banco?.includes(banco) && styles.chipActive]}
                  onPress={() => setFilters(prev => {
                    const current = prev.banco || [];
                    return {
                      ...prev,
                      banco: current.includes(banco) ? current.filter(b => b !== banco) : [...current, banco]
                    };
                  })}
                >
                  <RNText style={[styles.chipText, filters.banco?.includes(banco) && styles.chipTextActive]}>
                    {banco}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>CATEGORÍA DE PRODUCTO</RNText>
            <View style={styles.chipsContainer}>
              <TouchableOpacity
                style={[styles.chip, filters.categoriaProducto.length === 0 && styles.chipActive]}
                onPress={() => setFilters(prev => ({ ...prev, categoriaProducto: [] }))}
              >
                <RNText style={[styles.chipText, filters.categoriaProducto.length === 0 && styles.chipTextActive]}>
                  Todas
                </RNText>
              </TouchableOpacity>
              {productCategorias?.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, filters.categoriaProducto.includes(cat) && styles.chipActive]}
                  onPress={() => setFilters(prev => ({ ...prev, categoriaProducto: prev.categoriaProducto.includes(cat) ? prev.categoriaProducto.filter(c => c !== cat) : [...prev.categoriaProducto, cat] }))}
                >
                  <RNText style={[styles.chipText, filters.categoriaProducto.includes(cat) && styles.chipTextActive]}>
                    {cat}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>RANGO DE FECHAS</RNText>
            <View style={styles.dateRangeContainer}>
              <View style={styles.dateInputWrapper}>
                <RNText style={styles.dateLabel}>Desde</RNText>
                <TouchableOpacity 
                  style={[styles.filterInputContainer, { paddingVertical: 10 }]}
                  onPress={() => setShowDatePicker({ show: true, type: 'desde' })}
                >
                  <Ionicons name="calendar-outline" size={18} color="#6b7280" />
                  <RNText style={{ marginLeft: 8, fontSize: 13, color: filters.fechaDesde ? '#1f2937' : '#9ca3af' }}>
                    {filters.fechaDesde || 'YYYY-MM-DD'}
                  </RNText>
                </TouchableOpacity>
              </View>
              <View style={styles.dateInputWrapper}>
                <RNText style={styles.dateLabel}>Hasta</RNText>
                <TouchableOpacity 
                  style={[styles.filterInputContainer, { paddingVertical: 10 }]}
                  onPress={() => setShowDatePicker({ show: true, type: 'hasta' })}
                >
                  <Ionicons name="calendar-outline" size={18} color="#6b7280" />
                  <RNText style={{ marginLeft: 8, fontSize: 13, color: filters.fechaHasta ? '#1f2937' : '#9ca3af' }}>
                    {filters.fechaHasta || 'YYYY-MM-DD'}
                  </RNText>
                </TouchableOpacity>
              </View>
            </View>
            
            {showDatePicker.show && (
              <DateTimePicker
                value={
                  showDatePicker.type === 'desde' && filters.fechaDesde 
                    ? new Date(filters.fechaDesde + 'T12:00:00') 
                    : showDatePicker.type === 'hasta' && filters.fechaHasta 
                      ? new Date(filters.fechaHasta + 'T12:00:00') 
                      : new Date()
                }
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowDatePicker({ show: false, type: 'desde' });
                  if (event.type === 'set' && selectedDate) {
                    const dateString = selectedDate.toISOString().split('T')[0];
                    if (showDatePicker.type === 'desde') {
                      setFilters(prev => ({ ...prev, fechaDesde: dateString }));
                    } else {
                      setFilters(prev => ({ ...prev, fechaHasta: dateString }));
                    }
                  }
                }}
              />
            )}
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>VENDEDOR</RNText>
            <View style={styles.filterInputContainer}>
              <Ionicons name="person-outline" size={18} color="#6b7280" />
              <TextInput
                style={styles.filterInput}
                placeholder="Nombre del vendedor"
                placeholderTextColor="#9ca3af"
                value={filters.vendedor}
                onChangeText={(text) => setFilters(prev => ({ ...prev, vendedor: text }))}
              />
            </View>
          </View>

          <View style={styles.filterSection}>
            <RNText style={styles.filterSectionTitle}>RANGO DE TOTALES</RNText>
            <View style={styles.dateRangeContainer}>
              <View style={styles.dateInputWrapper}>
                <RNText style={styles.dateLabel}>Mínimo</RNText>
                <View style={styles.filterInputContainer}>
                  <Ionicons name="cash-outline" size={18} color="#6b7280" />
                  <TextInput
                    style={styles.filterInput}
                    placeholder="$0"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={filters.minTotal}
                    onChangeText={(text) => setFilters(prev => ({ ...prev, minTotal: text }))}
                  />
                </View>
              </View>
              <View style={styles.dateInputWrapper}>
                <RNText style={styles.dateLabel}>Máximo</RNText>
                <View style={styles.filterInputContainer}>
                  <Ionicons name="cash-outline" size={18} color="#6b7280" />
                  <TextInput
                    style={styles.filterInput}
                    placeholder="$999999"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={filters.maxTotal}
                    onChangeText={(text) => setFilters(prev => ({ ...prev, maxTotal: text }))}
                  />
                </View>
              </View>
            </View>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>

        <View style={styles.filterModalFooter}>
          <TouchableOpacity style={styles.clearFiltersBtn} onPress={clearAllFilters}>
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
            <RNText style={styles.clearFiltersBtnText}>Limpiar Todo</RNText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.applyFiltersBtn}
            onPress={() => {
              setIsFiltering(activeFiltersCount > 0);
              setFilterModalVisible(false);
            }}
          >
            <RNText style={styles.applyFiltersBtnText}>
              Aplicar ({filteredVentas.length} resultados)
            </RNText>
          </TouchableOpacity>
        </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const closeModal = () => {
    setModalVisible(false);
    setSelectedVenta(null);
  };

  const handleChangeEstado = async (newEstado: string) => {
    if (!selectedVenta) return;
    try {
      soundService.playSuccess();

      if (selectedVenta._isDomicilioWA) {
        const rawDom = selectedVenta._rawDomicilio;
        if (rawDom?.IDdomicilio) {
          updateDomicilioEstado(rawDom.IDdomicilio, newEstado).catch(e => console.error(e));
          setDomicilios(prev => prev.map(d => d.IDdomicilio === rawDom.IDdomicilio ? { ...d, estado: newEstado } : d));
        }
        if (selectedVenta.IDventas && selectedVenta.IDventas !== rawDom?.IDdomicilio) {
          updateVentaEstado(selectedVenta.IDventas, newEstado).catch(e => console.error(e));
          updateVenta(selectedVenta.IDventas, { estado: newEstado });
        }
        closeModal();
        Toast.show({ type: 'success', text1: 'Estado Actualizado', text2: `El domicilio pasó a ${newEstado.replace(/_/g, ' ')}`, position: 'top' });
        return;
      }

      // Optimizacion: Actualizar UI y emitir en background
      setTimeout(() => {
        updateVentaEstado(selectedVenta.IDventas, newEstado).catch(e => console.error(e));
        
        let updatedOrdenVentas = selectedVenta.ordenVentas;
        const nowIso = new Date().toISOString();
        const extraUpdates: Partial<VentaItem> = {};
        if (newEstado === 'ENTREGADO') {
          extraUpdates.cocinaFinAt = nowIso;
        } else if (newEstado === 'TOMADO' && !selectedVenta.cocinaInicioAt) {
          extraUpdates.cocinaInicioAt = nowIso;
        }
        extraUpdates.registroDeTiempo = [
          ...(Array.isArray(selectedVenta.registroDeTiempo) ? selectedVenta.registroDeTiempo : []),
          { fecha_hora: nowIso, estado: newEstado, duracion: '00:00:00:00' },
        ];

        if (['ENTREGADO', 'LISTO_PARA_ENTREGA'].includes(newEstado) || (newEstado === 'PAGADO' && (selectedVenta.cocinaFinAt || selectedVenta.estado === 'ENTREGADO'))) {
          updatedOrdenVentas = updatedOrdenVentas?.map(ov => ({
            ...ov,
            estado: 'LISTO',
            cantidadPreparada: ov.cantidad || 1
          }));
        }

        const updatedVenta = { ...selectedVenta, estado: newEstado, ordenVentas: updatedOrdenVentas, ...extraUpdates };
        updateVenta(selectedVenta.IDventas, updatedVenta);
        emitOrdenActualizada({
          ventaId: selectedVenta.IDventas,
          IDventas: selectedVenta.IDventas,
          venta: updatedVenta,
          estado: newEstado,
        });

        // Impresión automática según configuración de estados (ej. TOMADO)
        const printStore = usePrinterStore.getState();
        if (printStore.shouldPrintComanda(newEstado) || printStore.shouldPrintFactura(newEstado)) {
          const ticketData = mapVentaToTicketData(updatedVenta);
          printStore.printTicket(ticketData).catch(err => {
            console.error('[PedidosScreen] Error en auto-impresión de orden:', err);
          });
        }
      }, 0);
      
      closeModal();
      Toast.show({ type: 'success', text1: 'Estado Actualizado', text2: `El pedido pasó a ${newEstado.replace(/_/g, ' ')}`, position: 'top' });
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cambiar el estado del pedido', position: 'top' });
    }
  };

  const handleVolverCarrito = () => {
    if (!selectedVenta) return;
    showAlert({
      type: 'confirm',
      title: 'Editar Pedido / Volver al Carrito',
      message: 'El pedido pasará al carrito y podrás agregar o quitar productos. ¿Deseas continuar?',
      confirmText: 'Sí, Editar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        const yaEstabaComandeado = Boolean(
          selectedVenta._isDomicilioWA ||
          (selectedVenta as any).comandaImpresa ||
          selectedVenta.comandaImpresaAt ||
          selectedVenta.cocinaInicioAt ||
          (selectedVenta.estado && selectedVenta.estado !== 'EN_EL_CARRITO')
        );
        const preservedTimestamps = yaEstabaComandeado ? {
          comandaImpresa: true,
          comandaImpresaAt: selectedVenta.comandaImpresaAt || selectedVenta.cocinaInicioAt || selectedVenta.fechaYHora || new Date().toISOString(),
          cocinaInicioAt: selectedVenta.cocinaInicioAt || selectedVenta.comandaImpresaAt || selectedVenta.fechaYHora || new Date().toISOString(),
        } : {};

        if (!selectedVenta._isDomicilioWA) {
          await handleChangeEstado('EN_EL_CARRITO');
        } else {
          const rawDom = selectedVenta._rawDomicilio;
          if (rawDom && rawDom.estado === 'RECIENTE') {
            await updateDomicilioEstado(rawDom.IDdomicilio, 'TOMADO').catch(() => {});
            setDomicilios(prev => prev.map(d => d.IDdomicilio === rawDom.IDdomicilio ? { ...d, estado: 'TOMADO' } : d));
          }
        }

        try {
          if (selectedVenta.ordenVentas && selectedVenta.ordenVentas.length > 0) {
            useCartStore.getState().loadCartFromVenta(selectedVenta.ordenVentas);
          } else {
            useCartStore.getState().clearCart();
          }
          useCartStore.getState().setEditingSale(selectedVenta.IDventas, {
            ...selectedVenta,
            ...preservedTimestamps,
          });
          closeModal();
          navigation.navigate('Sales' as any);
        } catch (err) {
          console.error('[PedidosScreen] Error al volver al carrito:', err);
          Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cargar el pedido al carrito' });
        }
      },
      onCancel: () => {},
    });
  };

  const handleOpenCobrar = () => {
    if (!selectedVenta) return;
    
    // Cargar los productos de esta orden al store temporalmente para que el PaymentModal los muestre bien
    try {
      if (selectedVenta.ordenVentas && selectedVenta.ordenVentas.length > 0) {
        useCartStore.getState().loadCartFromVenta(selectedVenta.ordenVentas);
      } else {
        useCartStore.getState().clearCart();
      }
    } catch (err) {
      console.error('[PedidosScreen] Error cargando orden a cobrar:', err);
      useCartStore.getState().clearCart();
    }
    
    closeModal();
    setCobrarVenta(selectedVenta);
    resolverClienteParaCobro(selectedVenta);
    setPaymentModalVisible(true);
  };

  const handleCobrarConfirm = async (paymentData: {
    medioDePago: string;
    banco?: string | null;
    efectivoRecibido?: number;
    devueltas?: number;
    transferencia?: number;
    estado: string;
    propina?: number;
    porcentajePropina?: string;
    descuento?: number;
    totalInput?: number;
  }) => {
    if (!cobrarVenta) return;
    try {
      // Calcular el total real de la venta desde los productos reales anotados
      const totalReal = getVentaTotal(cobrarVenta);

      const finalClienteId = cobrarCliente?.IDcliente 
        ? Number(cobrarCliente.IDcliente) 
        : (cobrarVenta.clienteId ? Number(cobrarVenta.clienteId) : undefined);
      const finalClienteNombre = cobrarCliente?.nombre || cobrarVenta.cliente || undefined;

      const yaEstabaListoOEntregado =
        ['ENTREGADO', 'LISTO_PARA_ENTREGA'].includes((cobrarVenta.estado || '').toUpperCase()) ||
        hasPassedKitchenInLog(cobrarVenta.registroDeTiempo);
      const targetEstado = (cobrarVenta.estado === 'ENTREGADO' || yaEstabaListoOEntregado) ? 'ENTREGADO' : (paymentData.estado || 'PAGADO');

      // FIX: Esperamos a que termine la petición en vez de enviarla en background sin control
      // Eliminamos updateVentaEstado para evitar la condición de carrera con updateVentaPago
      await updateVentaPago(cobrarVenta.IDventas, {
        estado: targetEstado,
        medioDePago: paymentData.medioDePago,
        efectivoRecibido: paymentData.efectivoRecibido,
        devueltas: paymentData.devueltas,
        banco: paymentData.banco,
        transferencia: paymentData.transferencia,
        propina: paymentData.propina,
        porcentajePropina: paymentData.porcentajePropina,
        descuento: paymentData.descuento,
        totalInput: paymentData.totalInput ?? totalReal,
        clienteId: finalClienteId,
        cliente: finalClienteNombre,
      });

      // Actualizamos UI localmente de forma opcional (el socket confirmará después)
      const nowCobroIso = new Date().toISOString();
      const updatedVenta = {
        ...cobrarVenta,
        estado: targetEstado,
        medioDePago: paymentData.medioDePago,
        efectivoRecibido: paymentData.efectivoRecibido,
        devueltas: paymentData.devueltas,
        banco: paymentData.banco,
        transferencia: paymentData.transferencia,
        propina: paymentData.propina,
        porcentajePropina: paymentData.porcentajePropina,
        descuento: paymentData.descuento,
        totalInput: paymentData.totalInput ?? totalReal,
        clienteId: finalClienteId ?? cobrarVenta.clienteId,
        cliente: finalClienteNombre ?? cobrarVenta.cliente,
        cocinaFinAt: cobrarVenta.cocinaFinAt || (yaEstabaListoOEntregado ? nowCobroIso : null),
        registroDeTiempo: [
          ...(Array.isArray(cobrarVenta.registroDeTiempo) ? cobrarVenta.registroDeTiempo : []),
          { fecha_hora: nowCobroIso, estado: 'PAGADO', duracion: '00:00:00:00' },
        ],
      };

      // Actualizamos la tienda local inmediatamente para que desaparezca de TOMADO y pase a PAGADO
      updateVenta(cobrarVenta.IDventas, updatedVenta);

      // Si la venta estaba vinculada a un domicilio de WhatsApp, actualizarlo a COBRADO
      const linkedDom = domicilios.find(d => d.ventaId === cobrarVenta.IDventas);
      if (linkedDom) {
        updateDomicilioEstado(linkedDom.IDdomicilio, 'COBRADO').catch(console.error);
        setDomicilios(prev => prev.map(d => d.IDdomicilio === linkedDom.IDdomicilio ? { ...d, estado: 'COBRADO' } : d));
      }

      emitOrdenActualizada({
        ventaId: cobrarVenta.IDventas,
        IDventas: cobrarVenta.IDventas,
        venta: updatedVenta,
        estado: 'PAGADO',
      });

      closeModal();
      setPaymentModalVisible(false);
      setCobrarVenta(null);
      setCobrarCliente(null);
      useCartStore.getState().clearCart();
      Toast.show({ type: 'success', text1: 'Cobro Exitoso', text2: 'Pedido cobrado correctamente', position: 'top' });
      // Retornamos pedidoId para que PaymentModal evalúe solo factura con suppressComanda=true (nunca comanda de cocina)
      return { pedidoId: cobrarVenta.pedido || cobrarVenta.IDventas || undefined };
    } catch (error) {
      console.error('Error al cobrar:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cobrar el pedido', position: 'top' });
    }
  };

  const handleSaveCobrar = async (data: { estado: string }) => {
    if (!cobrarVenta) return;
    try {
      updateVentaEstado(cobrarVenta.IDventas, data.estado);
      closeModal();
      setPaymentModalVisible(false);
      setCobrarVenta(null);
      setCobrarCliente(null);
      useCartStore.getState().clearCart();
      Toast.show({ type: 'success', text1: 'Actualizado', text2: 'El pedido fue actualizado', position: 'top' });
      return { pedidoId: cobrarVenta.pedido || undefined };
    } catch (error) {
      console.error('Error al guardar:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo actualizar el pedido', position: 'top' });
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#ffffff" translucent={false} />
      <SafeAreaView style={{ backgroundColor: '#ffffff' }} edges={['top']}>
        <View style={[styles.header, isWeb && styles.headerWeb]}>
          <View style={isWeb ? styles.headerTitleGroupWeb : undefined}>
            <RNText style={[styles.headerTitle, isWeb && styles.headerTitleWeb]}>Pedidos</RNText>
            <RNText style={[styles.headerSubtitle, isWeb && styles.headerSubtitleWeb]}>
              {activeTab === 'DOMIS' ? flatListData.filter((it: any) => !it.isHeader).length : filteredVentas.length} registro{(activeTab === 'DOMIS' ? flatListData.filter((it: any) => !it.isHeader).length : filteredVentas.length) !== 1 ? 's' : ''}
            </RNText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {Platform.OS === 'web' && (
              <TouchableOpacity
                style={[
                  styles.newSaleBtn, 
                  styles.refreshBtnWeb, 
                  isMobileWeb && styles.refreshBtnMobileWeb, 
                  { backgroundColor: '#3b82f6', marginRight: isWeb ? 6 : 10 }
                ]}
                onPress={onRefresh}
                disabled={refreshing}
                accessibilityLabel="Recargar pedidos"
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color="#fff" style={isMobileWeb ? undefined : { marginRight: 3 }} />
                ) : (
                  <Ionicons name="refresh" size={isMobileWeb ? 15 : 14} color="#fff" />
                )}
                {!isMobileWeb && (
                  <RNText style={styles.refreshBtnTextWeb}>
                    {refreshing ? '...' : 'Recargar'}
                  </RNText>
                )}
              </TouchableOpacity>
            )}
            {canCreateVenta && (
              <TouchableOpacity
                style={[styles.newSaleBtn, isWeb && styles.newSaleBtnWeb]}
                onPress={() => {
                  useCartStore.getState().clearCart();
                  navigation.navigate('Sales' as any);
                }}
              >
                <Ionicons name="add" size={isWeb ? 16 : 20} color="#fff" />
                <RNText style={[styles.newSaleBtnText, isWeb && styles.newSaleBtnTextWeb]}>Nueva Venta</RNText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>

      <View style={[styles.tabsContainer, isWeb && styles.tabsContainerWeb]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.tabsContent, isWeb && styles.tabsContentWeb]}>
          {tabsWithCounts.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab, 
                isWeb && styles.tabWeb,
                activeTab === tab.key && { backgroundColor: tab.color },
                { flexDirection: 'row', alignItems: 'center' }
              ]}
              onPress={() => setActiveTab(tab.key)}
            >
              <RNText style={[styles.tabText, isWeb && styles.tabTextWeb, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </RNText>
              
              {/* Badge Counter */}
              {tab.count > 0 && (
                <View 
                  style={{
                    backgroundColor: activeTab === tab.key ? 'rgba(255,255,255,0.3)' : `${tab.color}20`,
                    paddingHorizontal: isWeb ? 5 : 6,
                    paddingVertical: isWeb ? 1 : 2,
                    borderRadius: 10,
                    marginLeft: isWeb ? 4 : 6
                  }}
                >
                  <RNText
                    style={{
                      color: activeTab === tab.key ? '#fff' : tab.color,
                      fontWeight: 'bold',
                      fontSize: isWeb ? 9 : 10
                    }}
                  >
                    {tab.count}
                  </RNText>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Sub-pestañas operativas de Domicilios (Píldoras compactas) */}
      {activeTab === 'DOMIS' && (
        <View style={[styles.domisSubTabsContainer, isWeb && styles.domisSubTabsContainerWeb]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.domisSubTabsContent, isWeb && styles.domisSubTabsContentWeb]}
          >
            {domisSubTabsWithCounts.map((subTab) => {
              const isActive = domisSubTab === subTab.key;
              return (
                <TouchableOpacity
                  key={subTab.key}
                  style={[
                    styles.domisSubTabPill,
                    isWeb && styles.domisSubTabPillWeb,
                    isActive && { backgroundColor: subTab.color, borderColor: subTab.color },
                  ]}
                  onPress={() => setDomisSubTab(subTab.key as any)}
                  activeOpacity={0.7}
                >
                  <RNText
                    style={[
                      styles.domisSubTabText,
                      isWeb && styles.domisSubTabTextWeb,
                      isActive && styles.domisSubTabTextActive,
                    ]}
                  >
                    {subTab.label}
                  </RNText>
                  {subTab.count > 0 && (
                    <View
                      style={[
                        styles.domisSubTabBadge,
                        isWeb && styles.domisSubTabBadgeWeb,
                        isActive
                          ? { backgroundColor: 'rgba(255,255,255,0.28)' }
                          : { backgroundColor: `${subTab.color}18` },
                      ]}
                    >
                      <RNText
                        style={[
                          styles.domisSubTabBadgeText,
                          isWeb && styles.domisSubTabBadgeTextWeb,
                          { color: isActive ? '#ffffff' : subTab.color },
                        ]}
                      >
                        {subTab.count}
                      </RNText>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Sub-barra operativa para ENTREGADO: Alternar activos/despejados y despejar vista */}
      {activeTab === 'ENTREGADO' && (
        <View style={[styles.entregadosToolbar, isWeb && styles.entregadosToolbarWeb]}>
          <View style={[styles.entregadosSegmentGroup, isWeb && styles.entregadosSegmentGroupWeb]}>
            <TouchableOpacity
              style={[
                styles.entregadosSegmentBtn,
                isWeb && styles.entregadosSegmentBtnWeb,
                !showDespejados && styles.entregadosSegmentBtnActive,
              ]}
              onPress={() => setShowDespejados(false)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: !showDespejados }}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={isWeb ? 13 : 13}
                color={!showDespejados ? '#ffffff' : '#059669'}
              />
              <RNText
                style={[
                  styles.entregadosSegmentText,
                  isWeb && styles.entregadosSegmentTextWeb,
                  !showDespejados && styles.entregadosSegmentTextActive,
                ]}
              >
                Activos
              </RNText>
              <View
                style={[
                  styles.entregadosBadgePill,
                  isWeb && styles.entregadosBadgePillWeb,
                  !showDespejados ? { backgroundColor: 'rgba(255,255,255,0.28)' } : { backgroundColor: '#dcfce7' },
                ]}
              >
                <RNText
                  style={[
                    styles.entregadosBadgePillText,
                    isWeb && styles.entregadosBadgePillTextWeb,
                    { color: !showDespejados ? '#ffffff' : '#059669' },
                  ]}
                >
                  {entregadosActivosCount}
                </RNText>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.entregadosSegmentBtn,
                isWeb && styles.entregadosSegmentBtnWeb,
                showDespejados && styles.entregadosSegmentBtnActiveDespejados,
              ]}
              onPress={() => setShowDespejados(true)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: showDespejados }}
            >
              <Ionicons
                name="archive-outline"
                size={isWeb ? 13 : 13}
                color={showDespejados ? '#ffffff' : '#64748b'}
              />
              <RNText
                style={[
                  styles.entregadosSegmentText,
                  isWeb && styles.entregadosSegmentTextWeb,
                  showDespejados && styles.entregadosSegmentTextActive,
                ]}
              >
                Despejados
              </RNText>
              <View
                style={[
                  styles.entregadosBadgePill,
                  isWeb && styles.entregadosBadgePillWeb,
                  showDespejados ? { backgroundColor: 'rgba(255,255,255,0.28)' } : { backgroundColor: '#f1f5f9' },
                ]}
              >
                <RNText
                  style={[
                    styles.entregadosBadgePillText,
                    isWeb && styles.entregadosBadgePillTextWeb,
                    { color: showDespejados ? '#ffffff' : '#64748b' },
                  ]}
                >
                  {entregadosDespejadosCount}
                </RNText>
              </View>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: isWeb ? 4 : 4 }}>
            {!isSelectionMode && (
              <TouchableOpacity
                style={[styles.entregadosActionBtn, isWeb && styles.entregadosActionBtnWeb]}
                onPress={() => {
                  setIsSelectionMode(true);
                  setSelectedToDelete([]);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Seleccionar pedidos"
              >
                <Ionicons name="checkbox-outline" size={13} color="#475569" />
                <RNText style={[styles.entregadosActionBtnText, isWeb && styles.entregadosActionBtnTextWeb]}>
                  {isWeb ? 'Seleccionar' : 'Elegir'}
                </RNText>
              </TouchableOpacity>
            )}

            {!showDespejados ? (
              <TouchableOpacity
                style={[styles.entregadosActionBtn, styles.entregadosClearBtn, isWeb && styles.entregadosActionBtnWeb]}
                onPress={() => handleDespejarBulk()}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Despejar todo"
              >
                <Ionicons name="eye-off-outline" size={13} color="#059669" />
                <RNText style={[styles.entregadosActionBtnText, isWeb && styles.entregadosActionBtnTextWeb, { color: '#059669', fontWeight: '700' }]}>
                  Despejar
                </RNText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.entregadosActionBtn, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }, isWeb && styles.entregadosActionBtnWeb]}
                onPress={() => handleRestaurarBulk()}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Restaurar todo"
              >
                <Ionicons name="refresh-outline" size={13} color="#2563eb" />
                <RNText style={[styles.entregadosActionBtnText, isWeb && styles.entregadosActionBtnTextWeb, { color: '#2563eb', fontWeight: '700' }]}>
                  Restaurar
                </RNText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <View style={[styles.filterBar, isWeb && styles.filterBarWeb]}>
        <View style={[styles.searchBarContainer, isWeb && styles.searchBarContainerWeb]}>
          <Ionicons name="search" size={isWeb ? 15 : 18} color="#6b7280" />
          <TextInput
            style={[styles.searchBarInput, isWeb && styles.searchBarInputWeb]}
            placeholder="Buscar pedido, cliente..."
            placeholderTextColor="#9ca3af"
            value={filters.searchText}
            onChangeText={(text) => setFilters(prev => ({ ...prev, searchText: text }))}
          />
          {isSearchingRemote && <ActivityIndicator size="small" color="#6366f1" style={{ marginLeft: 6 }} />}
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, isWeb && styles.filterBtnWeb, activeFiltersCount > 0 && styles.filterBtnActive]}
          onPress={() => setFilterModalVisible(true)}
        >
          <Ionicons name="options-outline" size={isWeb ? 16 : 20} color={activeFiltersCount > 0 ? '#fff' : '#6b7280'} />
          {activeFiltersCount > 0 && (
            <View style={[styles.filterBadge, isWeb && styles.filterBadgeWeb]}>
              <RNText style={[styles.filterBadgeText, isWeb && styles.filterBadgeTextWeb]}>{activeFiltersCount}</RNText>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {isSelectionMode && (
        <View style={[styles.bulkActionContainer, isWeb && styles.bulkActionContainerWeb]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => { setIsSelectionMode(false); setSelectedToDelete([]); }}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
            <RNText style={{ fontSize: 13, fontWeight: '700', marginLeft: 8, color: '#374151' }}>
              {selectedToDelete.length} sel.
            </RNText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity 
              style={{ marginRight: 12 }}
              onPress={() => {
                if (selectedToDelete.length === filteredVentas.length) {
                  setSelectedToDelete([]);
                } else {
                  setSelectedToDelete(filteredVentas.map(v => v.IDventas));
                }
              }}
            >
              <RNText style={{ color: '#6366f1', fontWeight: '700', fontSize: 13 }}>
                {selectedToDelete.length === filteredVentas.length ? 'Ninguno' : 'Todos'}
              </RNText>
            </TouchableOpacity>
            {activeTab === 'ENTREGADO' && (
              <TouchableOpacity 
                style={[
                  styles.bulkDeleteBtn, 
                  isWeb && styles.bulkDeleteBtnWeb,
                  { backgroundColor: showDespejados ? '#2563eb' : '#059669', marginRight: 8 }, 
                  selectedToDelete.length === 0 && { opacity: 0.5 }
                ]}
                onPress={() => showDespejados ? handleRestaurarBulk(selectedToDelete) : handleDespejarBulk(selectedToDelete)}
                disabled={selectedToDelete.length === 0}
              >
                <Ionicons name={showDespejados ? "refresh-outline" : "eye-off-outline"} size={16} color="#fff" />
                <RNText style={{ color: '#fff', fontWeight: '700', marginLeft: 4, fontSize: 13 }}>
                  {showDespejados ? 'Restaurar' : 'Despejar'}
                </RNText>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={[styles.bulkDeleteBtn, isWeb && styles.bulkDeleteBtnWeb, selectedToDelete.length === 0 && { opacity: 0.5 }]}
              onPress={handleBulkDelete}
              disabled={selectedToDelete.length === 0}
            >
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <RNText style={{ color: '#fff', fontWeight: '700', marginLeft: 4, fontSize: 13 }}>Eliminar</RNText>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isFiltering && activeFiltersCount > 0 && (
        <View style={[styles.activeFiltersContainer, isWeb && styles.activeFiltersContainerWeb]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.activeFiltersContent, isWeb && styles.activeFiltersContentWeb]}>
            {filters.searchText && (
              <View style={[styles.activeFilterChip, isWeb && styles.activeFilterChipWeb]}>
                <RNText style={styles.activeFilterChipText}>"{filters.searchText}"</RNText>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, searchText: '' }))}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
            {filters.pedidoNumero && (
              <View style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>Pedido: {filters.pedidoNumero}</RNText>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, pedidoNumero: '' }))}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
            {filters.cliente && (
              <View style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>Cliente: {filters.cliente}</RNText>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, cliente: '' }))}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
            {filters.estados.map(estado => (
              <View key={estado} style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>{estado.replace(/_/g, ' ')}</RNText>
                <TouchableOpacity onPress={() => toggleEstado(estado)}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            ))}
            {filters.mediosDePago.map(medio => (
              <View key={medio} style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>{medio}</RNText>
                <TouchableOpacity onPress={() => toggleMedioDePago(medio)}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            ))}
            {filters.banco && filters.banco.map(b => (
              <View key={b} style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>{b}</RNText>
                <TouchableOpacity onPress={() => setFilters(prev => ({
                  ...prev,
                  banco: prev.banco?.filter(item => item !== b)
                }))}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            ))}
            {filters.fechaDesde && (
              <View style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>Desde: {filters.fechaDesde}</RNText>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, fechaDesde: '' }))}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
            {filters.fechaHasta && (
              <View style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>Hasta: {filters.fechaHasta}</RNText>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, fechaHasta: '' }))}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
            {filters.vendedor && (
              <View style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>Vendedor: {filters.vendedor}</RNText>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, vendedor: '' }))}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
            {(filters.minTotal || filters.maxTotal) && (
              <View style={styles.activeFilterChip}>
                <RNText style={styles.activeFilterChipText}>
                  Total: {filters.minTotal || '0'} - {filters.maxTotal || '∞'}
                </RNText>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, minTotal: '', maxTotal: '' }))}>
                  <Ionicons name="close-circle" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={styles.clearAllBtn} onPress={clearAllFilters}>
              <RNText style={styles.clearAllBtnText}>Limpiar Todo</RNText>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={flatListData}
          extraData={[selectedToDelete, isSelectionMode]}
          renderItem={renderListItem}
          keyExtractor={keyExtractor}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ padding: 20 }}>
                <ActivityIndicator size="small" color="#4CAF50" />
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons 
                name={activeTab === 'DOMIS' ? "bike-fast" : "clipboard-text-off-outline"} 
                size={64} 
                color="#d1d5db" 
              />
              <RNText style={styles.emptyText}>
                {activeTab === 'DOMIS'
                  ? (domisSubTab === 'NUEVOS' ? 'No hay domicilios nuevos pendientes'
                    : domisSubTab === 'TOMADOS' ? 'No hay domicilios en preparación'
                    : domisSubTab === 'PAGADOS' ? 'No hay domicilios pagados en este turno'
                    : 'No hay domicilios de WhatsApp registrados')
                  : 'No hay pedidos'}
              </RNText>
              {activeTab === 'DOMIS' && (
                <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: '#f59e0b' }]} onPress={fetchDomicilios}>
                  <Ionicons name="refresh" size={18} color="#fff" />
                  <RNText style={styles.emptyBtnText}>Actualizar DOMIS</RNText>
                </TouchableOpacity>
              )}
              {activeTab !== 'DOMIS' && isFiltering && (
                <TouchableOpacity style={styles.emptyBtn} onPress={clearAllFilters}>
                  <Ionicons name="close-circle" size={20} color="#fff" />
                  <RNText style={styles.emptyBtnText}>Limpiar filtros</RNText>
                </TouchableOpacity>
              )}
              {activeTab !== 'DOMIS' && !isFiltering && canCreateVenta && (
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => navigation.navigate('Sales' as any)}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <RNText style={styles.emptyBtnText}>Crear nueva venta</RNText>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Floating Scroll Buttons */}
      <FloatingScrollButtons
        showUp={showScrollUp}
        showDown={showScrollDown}
        onUp={scrollToTop}
        onDown={scrollToBottom}
        bottomOffset={isSelectionMode && selectedToDelete.length > 0 ? 210 : 160}
      />

      {isSelectionMode && selectedToDelete.length > 0 && (
        <View style={styles.bulkActionContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ backgroundColor: '#e0e7ff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, marginRight: 8 }}>
              <RNText style={{ color: '#4338ca', fontWeight: 'bold' }}>{selectedToDelete.length}</RNText>
            </View>
            <RNText style={{ fontWeight: 'bold', color: '#374151' }}>Seleccionados</RNText>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity 
              style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginRight: 8 }}
              onPress={() => { setIsSelectionMode(false); setSelectedToDelete([]); }}
            >
              <RNText style={{ fontWeight: '600', color: '#4b5563' }}>Cancelar</RNText>
            </TouchableOpacity>
            <TouchableOpacity 
              style={{ backgroundColor: '#ef4444', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }}
              onPress={handleBulkDelete}
            >
              <Ionicons name="trash" size={16} color="#fff" style={{ marginRight: 6 }} />
              <RNText style={{ color: '#fff', fontWeight: 'bold' }}>Eliminar</RNText>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {renderModal()}
      {renderFilterModal()}

      <PaymentModal
        visible={paymentModalVisible}
        onClose={() => {
          setPaymentModalVisible(false);
          setCobrarVenta(null);
          setCobrarCliente(null);
        }}
        onSave={handleSaveCobrar}
        onCobrar={handleCobrarConfirm}
        cliente={cobrarCliente}
        total={getVentaTotal(cobrarVenta)}
        editingPedidoId={cobrarVenta?.pedido || cobrarVenta?.IDventas || undefined}
        initialPaymentMethod={cobrarVenta?.medioDePago}
        initialEfectivo={
          cobrarVenta?.efectivoRecibido && Number(cobrarVenta.efectivoRecibido) > 0
            ? Number(cobrarVenta.efectivoRecibido)
            : (cobrarVenta?.medioDePago === 'EFECTIVO' && cobrarVenta?.totalInput ? Number(cobrarVenta.totalInput) : undefined)
        }
        initialTransferencia={
          cobrarVenta?.valorDeTransferencia ? Number(cobrarVenta.valorDeTransferencia) :
          (cobrarVenta?.transferencia ? Number(cobrarVenta.transferencia) :
          (cobrarVenta?.medioDePago === 'EFECTIVO Y OTROS' && cobrarVenta?.totalInput && cobrarVenta?.efectivoRecibido ?
            Math.max(0, Number(cobrarVenta.totalInput) - Number(cobrarVenta.efectivoRecibido)) : undefined))
        }
        initialBanco={cobrarVenta?.banco}
        initialEstado={(cobrarVenta?.estado as any) || 'PAGADO'}
        initialPorcentajePropina={cobrarVenta?.porcentajePropina}
        abonoPrevio={Number(cobrarVenta?.abono) || 0}
      />
      
      <PrintPreviewModal
        visible={printPreviewVisible}
        type={printPreviewType}
        ticketData={printPreviewData}
        onClose={() => {
          setPrintPreviewVisible(false);
          setPrintPreviewData(null);
          setPrintPreviewType(null);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  headerSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  newSaleBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  newSaleBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, marginLeft: 6 },
  tabsContainer: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tabsContent: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row' },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#f3f4f6', marginRight: 8 },
  tabText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#fff' },
  domisSubTabsContainer: {
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 8,
  },
  domisSubTabsContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  domisSubTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  domisSubTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  domisSubTabTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  domisSubTabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    marginLeft: 6,
  },
  domisSubTabBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  filterBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchBarContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 12, marginRight: 12 },
  searchBarInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 14, color: '#111827' },
  filterBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  filterBtnActive: { backgroundColor: '#6366f1' },
  filterBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#ef4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  filterBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  activeFiltersContainer: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  activeFiltersContent: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  activeFilterChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366f120', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, marginRight: 8 },
  activeFilterChipText: { fontSize: 12, color: '#6366f1', marginRight: 4 },
  clearAllBtn: { paddingVertical: 6, paddingHorizontal: 12, marginLeft: 4 },
  clearAllBtnText: { fontSize: 12, color: '#ef4444', fontWeight: '600' },
  bulkActionContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#bbf7d0' },
  bulkDeleteBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ef4444', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  cardContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  checkboxContainer: { padding: 12, justifyContent: 'center', alignItems: 'center' },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', justifyContent: 'center', alignItems: 'center' },
  checkboxSelected: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb', paddingVertical: 10, paddingHorizontal: 16, marginBottom: 8, marginTop: 4, borderRadius: 8 },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  sectionHeaderText: { fontSize: 14, fontWeight: '700', color: '#374151', marginLeft: 8, textTransform: 'capitalize' },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center' },
  sectionHeaderCount: { fontSize: 12, color: '#6b7280' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flex: 1,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTypeIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    flexShrink: 1,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  paymentBadgeSuccess: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  paymentBadgeSuccessText: {
    fontSize: 10.5,
    color: '#059669',
    fontWeight: '700',
  },
  paymentBadgePending: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  paymentBadgePendingText: {
    fontSize: 10.5,
    color: '#d97706',
    fontWeight: '700',
  },
  notesBadge: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notesBadgeText: {
    fontSize: 10.5,
    color: '#b45309',
    fontWeight: '700',
  },
  domiBadge: {
    backgroundColor: '#e0f2fe',
    borderColor: '#bae6fd',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  domiBadgeText: {
    fontSize: 10.5,
    color: '#0284c7',
    fontWeight: '700',
  },
  iaBadge: {
    backgroundColor: '#f5f3ff',
    borderColor: '#ddd6fe',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iaBadgeText: {
    fontSize: 10.5,
    color: '#7c3aed',
    fontWeight: '700',
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  productsPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  productChip: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  productChipQty: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    marginRight: 4,
  },
  productChipName: {
    fontSize: 12,
    color: '#475569',
    maxWidth: 160,
  },
  moreProductsChip: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreProductsText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  cardActionBtnComanda: {
    width: 36,
    height: 36,
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardActionBtnFactura: {
    width: 36,
    height: 36,
    backgroundColor: '#e0f2fe',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardActionBtnCobrar: {
    width: 36,
    height: 36,
    backgroundColor: '#dcfce7',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardDeliveryBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 8,
    marginBottom: 10,
    gap: 6,
  },
  cardDeliveryPhoneLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardDeliveryPhoneText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  cardDeliveryAddressLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardDeliveryAddressText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 17,
    flex: 1,
  },
  cardMiniCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  cardMiniCopyTextPhone: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  cardMiniCopyTextAddress: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284c7',
  },
  detailAddressCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
    padding: 12,
    marginVertical: 6,
  },
  detailAddressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailAddressLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7',
    letterSpacing: 0.5,
  },
  detailAddressValue: {
    fontSize: 14,
    color: '#0f172a',
    lineHeight: 20,
    fontWeight: '500',
  },
  detailCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  detailCopyBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  detailSmallCopyBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
  },
  timelineScroll: { paddingVertical: 10, paddingRight: 20 },
  timelineNodeRow: { flexDirection: 'row', alignItems: 'center' },
  timelineNodeBox: { alignItems: 'center', width: 80 },
  timelineTimeContainer: { alignItems: 'center', marginBottom: 4 },
  timelineDateText: { fontSize: 10, fontWeight: '600', color: '#6b7280' },
  timelineTimeText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  timelineDurText: { fontSize: 10, fontWeight: '800', color: '#f59e0b', marginBottom: 8, height: 14 },
  timelineDotHoriz: { width: 12, height: 12, borderRadius: 6, marginBottom: 8, borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1, elevation: 2 },
  timelineBadgeHoriz: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12 },
  timelineBadgeText: { fontSize: 9, fontWeight: '800', textAlign: 'center' },
  timelineLineHoriz: { width: 40, height: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginTop: -15 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyText: { fontSize: 16, color: '#9ca3af', marginTop: 16, marginBottom: 24 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginRight: 10 },
  timerBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  timerText: { fontSize: 12, fontWeight: '800', marginLeft: 4 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  modalScroll: { paddingHorizontal: 20 },
  modalSection: { marginTop: 24 },
  modalSectionTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5, marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  detailLabel: { fontSize: 14, color: '#6b7280' },
  detailValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  productItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  productImageContainer: { marginRight: 12 },
  productImage: { width: 48, height: 48, borderRadius: 10 },
  productImagePlaceholder: { backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  productDetails: { flex: 1 },
  productName: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 2 },
  productMeta: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  productTotal: { fontSize: 14, fontWeight: '700', color: '#111827' },
  totalSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb', padding: 16, borderRadius: 12 },
  totalSectionLabel: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  totalSectionAmount: { fontSize: 20, fontWeight: '800', color: '#111827' },
  messageBox: { flexDirection: 'row', backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, alignItems: 'flex-start' },
  messageText: { fontSize: 14, color: '#374151', flex: 1 },
  modalActionsSection: { marginTop: 24, marginBottom: 16 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, width: '48%', marginBottom: 10 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 8 },
  filterModalContainer: { flex: 1, backgroundColor: '#fff' },
  filterModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  filterModalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  filterModalScroll: { flex: 1, paddingHorizontal: 20 },
  filterSection: { marginTop: 24 },
  filterSectionTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5, marginBottom: 12 },
  filterInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 12 },
  filterInput: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontSize: 14, color: '#111827' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#f3f4f6', marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: '#6366f1' },
  chipText: { fontSize: 13, color: '#6b7280' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  dateRangeContainer: { flexDirection: 'row' },
  dateInputWrapper: { flex: 1, marginRight: 12 },
  dateLabel: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  filterModalFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  clearFiltersBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  clearFiltersBtnText: { color: '#ef4444', fontWeight: '600', fontSize: 14, marginLeft: 6 },
  applyFiltersBtn: { backgroundColor: '#4CAF50', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  applyFiltersBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  entregadosToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 2.5,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 4,
  },
  entregadosSegmentGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  entregadosSegmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    gap: 3,
  },
  entregadosSegmentBtnActive: {
    backgroundColor: '#059669',
  },
  entregadosSegmentBtnActiveDespejados: {
    backgroundColor: '#475569',
  },
  entregadosSegmentText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  entregadosSegmentTextActive: {
    color: '#ffffff',
  },
  entregadosBadgePill: {
    paddingHorizontal: 4,
    paddingVertical: 0.5,
    borderRadius: 6,
    marginLeft: 2,
  },
  entregadosBadgePillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  entregadosActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 3,
  },
  entregadosActionBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  entregadosClearBtn: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  // Web-optimized compact styles
  headerWeb: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitleGroupWeb: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  headerTitleWeb: {
    fontSize: 18,
    fontWeight: '800',
  },
  headerSubtitleWeb: {
    fontSize: 12,
    marginTop: 0,
  },
  newSaleBtnWeb: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  refreshBtnWeb: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  refreshBtnMobileWeb: {
    paddingVertical: 5,
    paddingHorizontal: 7,
    minWidth: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshBtnTextWeb: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 3,
  },
  newSaleBtnTextWeb: {
    fontSize: 12,
    marginLeft: 4,
  },
  tabsContainerWeb: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tabsContentWeb: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  tabWeb: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    marginRight: 6,
  },
  tabTextWeb: {
    fontSize: 11,
  },
  domisSubTabsContainerWeb: {
    paddingVertical: 4,
  },
  domisSubTabsContentWeb: {
    gap: 6,
  },
  domisSubTabPillWeb: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  domisSubTabTextWeb: {
    fontSize: 11,
  },
  domisSubTabBadgeWeb: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginLeft: 4,
  },
  domisSubTabBadgeTextWeb: {
    fontSize: 9,
  },
  entregadosToolbarWeb: {
    paddingVertical: 3,
    paddingHorizontal: 12,
  },
  entregadosSegmentGroupWeb: {
    padding: 2,
    borderRadius: 8,
  },
  entregadosSegmentBtnWeb: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  entregadosSegmentTextWeb: {
    fontSize: 11,
  },
  entregadosBadgePillWeb: {
    paddingHorizontal: 4,
    paddingVertical: 0.5,
  },
  entregadosBadgePillTextWeb: {
    fontSize: 9,
  },
  entregadosActionBtnWeb: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  entregadosActionBtnTextWeb: {
    fontSize: 11,
  },
  filterBarWeb: {
    paddingVertical: 4,
  },
  searchBarContainerWeb: {
    paddingHorizontal: 10,
    marginRight: 8,
    borderRadius: 8,
  },
  searchBarInputWeb: {
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 13,
  },
  filterBtnWeb: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  filterBadgeWeb: {
    minWidth: 16,
    height: 16,
    top: -3,
    right: -3,
  },
  filterBadgeTextWeb: {
    fontSize: 9,
  },
  bulkActionContainerWeb: {
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  bulkDeleteBtnWeb: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activeFiltersContainerWeb: {
    borderBottomWidth: 1,
  },
  activeFiltersContentWeb: {
    paddingVertical: 5,
  },
  activeFilterChipWeb: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
});

export default PedidosScreen;