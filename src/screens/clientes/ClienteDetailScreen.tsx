import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getClienteById, deleteCliente, getVentasByCliente, Cliente } from '../../services/clientes.service';
import { usePermissions } from '../../hooks/usePermissions';
import Toast from 'react-native-toast-message';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import { useCustomAlert } from '../../context/CustomAlertContext';

const formatCurrency = (value: number | string | null | undefined): string => {
  if (value == null) return '$0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(num);
};

const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'Sin fecha';
  try {
    return format(new Date(dateStr), "d 'de' MMM yyyy, h:mm a", { locale: es });
  } catch {
    return dateStr;
  }
};

const ESTADO_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  PAGADO:            { bg: '#dcfce7', text: '#16a34a', label: 'Pagado' },
  ENTREGADO:         { bg: '#dbeafe', text: '#2563eb', label: 'Entregado' },
  EN_EL_CARRITO:     { bg: '#fef9c3', text: '#ca8a04', label: 'En carrito' },
  TOMADO:            { bg: '#fef3c7', text: '#d97706', label: 'Tomado' },
  LISTO_PARA_ENTREGA:{ bg: '#e0f2fe', text: '#0284c7', label: 'Listo' },
  DEUDOR:            { bg: '#fee2e2', text: '#dc2626', label: 'Deudor' },
};

function LoyaltyBar({ contador }: { contador: number }) {
  const filled = Math.min(Math.max(contador, 0), 10);
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 8,
            borderRadius: 4,
            backgroundColor: i < filled ? '#3b82f6' : '#e5e7eb',
          }}
        />
      ))}
    </View>
  );
}

function VentaCard({ venta }: { venta: any }) {
  const [expanded, setExpanded] = useState(false);
  const estado = ESTADO_COLORS[venta.estado] ?? { bg: '#f3f4f6', text: '#6b7280', label: venta.estado ?? '-' };
  const productos: any[] = venta.ordenVentas ?? [];

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        overflow: 'hidden',
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
      }}
    >
      {/* Header de la venta */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setExpanded(!expanded)}
        style={{ padding: 14 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontWeight: '700', color: '#111827', fontSize: 15 }}>
                {venta.pedido ?? 'Sin pedido'}
              </Text>
              <View
                style={{
                  backgroundColor: estado.bg,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 20,
                }}
              >
                <Text style={{ color: estado.text, fontSize: 11, fontWeight: '600' }}>
                  {estado.label}
                </Text>
              </View>
            </View>
            <Text style={{ color: '#6b7280', fontSize: 12 }}>
              <Ionicons name="time-outline" size={11} color="#9ca3af" />{' '}
              {formatDateTime(venta.fechaYHora)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={{ fontWeight: '800', color: '#111827', fontSize: 16 }}>
              {formatCurrency(venta.totalInput)}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#9ca3af"
            />
          </View>
        </View>

        {/* Resumen de productos (siempre visible) */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {productos.slice(0, 3).map((p: any, idx: number) => (
            <View
              key={idx}
              style={{
                backgroundColor: '#f3f4f6',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 20,
              }}
            >
              <Text style={{ color: '#374151', fontSize: 11 }}>
                {p.cantidad}× {p.nombreProducto ?? p.nombre ?? 'Producto'}
              </Text>
            </View>
          ))}
          {productos.length > 3 && (
            <View
              style={{
                backgroundColor: '#eff6ff',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 20,
              }}
            >
              <Text style={{ color: '#3b82f6', fontSize: 11 }}>
                +{productos.length - 3} más
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Detalle expandido */}
      {expanded && (
        <View style={{ borderTopWidth: 1, borderColor: '#f3f4f6', paddingHorizontal: 14, paddingBottom: 14 }}>
          <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '700', marginTop: 10, marginBottom: 6, letterSpacing: 0.5 }}>
            PRODUCTOS
          </Text>
          {productos.map((p: any, idx: number) => (
            <View
              key={idx}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: 6,
                borderBottomWidth: idx < productos.length - 1 ? 1 : 0,
                borderColor: '#f3f4f6',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#111827', fontSize: 13, fontWeight: '600' }}>
                  {p.nombreProducto ?? p.nombre ?? 'Producto'}
                </Text>
                {p.categoriaProducto && (
                  <Text style={{ color: '#9ca3af', fontSize: 11 }}>{p.categoriaProducto}</Text>
                )}
                {(p.comentarios || p.salsa || p.helado || p.topings) && (
                  <Text style={{ color: '#6b7280', fontSize: 11, fontStyle: 'italic' }}>
                    {[p.comentarios, p.salsa, p.helado, p.topings].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
                <Text style={{ color: '#374151', fontSize: 13, fontWeight: '600' }}>
                  {formatCurrency(p.precioTotal ?? p.precio)}
                </Text>
                <Text style={{ color: '#9ca3af', fontSize: 11 }}>
                  {p.cantidad} × {formatCurrency(p.precio)}
                </Text>
              </View>
            </View>
          ))}

          {/* Medio de pago */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderColor: '#f3f4f6' }}>
            <Text style={{ color: '#6b7280', fontSize: 12 }}>
              <Ionicons name="wallet-outline" size={12} color="#9ca3af" />{' '}
              {venta.medioDePago ?? 'N/A'}
              {venta.banco ? ` · ${venta.banco}` : ''}
            </Text>
            <Text style={{ color: '#111827', fontSize: 13, fontWeight: '700' }}>
              Total: {formatCurrency(venta.totalInput)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

export default function ClienteDetailScreen({ route, navigation }: any) {
  const { showAlert } = useCustomAlert();
  const { id } = route.params;
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);

  const [ventas, setVentas] = useState<any[]>([]);
  const [ventasMeta, setVentasMeta] = useState<any>(null);
  const [ventasPage, setVentasPage] = useState(1);
  const [ventasLoading, setVentasLoading] = useState(false);
  const [ventasLoadingMore, setVentasLoadingMore] = useState(false);

  const { canEdit, canDelete } = usePermissions('clientes');
  const handleScroll = useScrollDirection();

  const fetchCliente = async () => {
    try {
      const data = await getClienteById(id);
      setCliente(data);
    } catch {
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cargar el cliente' });
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const fetchVentas = useCallback(async (page = 1, append = false) => {
    if (page === 1) setVentasLoading(true);
    else setVentasLoadingMore(true);
    try {
      const res = await getVentasByCliente(id, page, 8);
      const items = res?.data ?? [];
      setVentas(prev => append ? [...prev, ...items] : items);
      setVentasMeta(res?.meta ?? null);
      setVentasPage(page);
    } catch {
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudieron cargar las compras' });
    } finally {
      setVentasLoading(false);
      setVentasLoadingMore(false);
    }
  }, [id]);

  useEffect(() => { fetchCliente(); fetchVentas(1); }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchCliente();
      fetchVentas(1);
    });
    return unsubscribe;
  }, [navigation, id]);

  const handleLoadMore = () => {
    if (ventasLoadingMore || !ventasMeta?.hasNextPage) return;
    fetchVentas(ventasPage + 1, true);
  };

  const handleDelete = () => {
    showAlert({
      type: 'confirm',
      title: 'Eliminar Cliente',
      message: '¿Estás seguro de que deseas eliminar este cliente? Se mantendrá el historial de ventas.',
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          await deleteCliente(id);
          Toast.show({ type: 'success', text1: 'Cliente eliminado' });
          navigation.goBack();
        } catch {
          Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo eliminar el cliente' });
        }
      },
      onCancel: () => {},
    });
  };

  if (loading || !cliente) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </SafeAreaView>
    );
  }

  const contadorActual = cliente.contador ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      {/* Header */}
      <View className="px-4 py-3 bg-white border-b border-gray-200 flex-row items-center justify-between shadow-sm z-10">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3">
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-900">Detalle de Cliente</Text>
        </View>
        <View className="flex-row">
          {canDelete && (
            <TouchableOpacity onPress={handleDelete} className="bg-red-50 p-2 rounded-lg mr-2 border border-red-100">
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          )}
          {canEdit && (
            <TouchableOpacity
              onPress={() => navigation.navigate('ClienteForm', { id: cliente.IDcliente })}
              className="bg-blue-50 p-2 rounded-lg border border-blue-100"
            >
              <Ionicons name="pencil" size={20} color="#3b82f6" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
        className="p-4"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Info Card */}
        <View className="bg-white rounded-2xl p-5 border border-gray-100 mb-4" style={{ elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
          <View className="items-center mb-6">
            <View className="w-20 h-20 bg-blue-100 rounded-full items-center justify-center mb-3">
              <Text className="text-blue-600 font-bold text-3xl">
                {cliente.nombre ? cliente.nombre.charAt(0).toUpperCase() : 'C'}
              </Text>
            </View>
            <Text className="text-2xl font-bold text-gray-900 text-center">{cliente.nombre}</Text>
            <Text className="text-gray-500 mt-1">ID: #{cliente.IDcliente}</Text>
          </View>

          <View className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-4">
            <View className="flex-row items-center mb-4">
              <Ionicons name="logo-whatsapp" size={20} color="#16a34a" />
              <View className="ml-3 flex-1">
                <Text className="text-xs text-gray-500 font-bold">WHATSAPP</Text>
                <Text className="text-gray-900 font-medium text-base">{cliente.whatsapp || 'No registrado'}</Text>
              </View>
            </View>

            <View className="flex-row items-center mb-4">
              <Ionicons name="card-outline" size={20} color="#6b7280" />
              <View className="ml-3 flex-1">
                <Text className="text-xs text-gray-500 font-bold">CÉDULA</Text>
                <Text className="text-gray-900 font-medium text-base">{cliente.cedula || 'No registrada'}</Text>
              </View>
            </View>

            <View className="flex-row items-center">
              <Ionicons name="calendar-outline" size={20} color="#6b7280" />
              <View className="ml-3 flex-1">
                <Text className="text-xs text-gray-500 font-bold">FECHA REGISTRO</Text>
                <Text className="text-gray-900 font-medium text-base">
                  {cliente.fecha_y_hora_creacion
                    ? new Date(cliente.fecha_y_hora_creacion).toLocaleDateString('es-CO')
                    : 'Desconocida'}
                </Text>
              </View>
            </View>
          </View>

          {/* Loyalty Card */}
          <View className="bg-blue-50 rounded-xl p-4 border border-blue-100 mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <View>
                <Text className="text-xs text-blue-600 font-bold mb-1">TARJETA DE FIDELIDAD</Text>
                <Text className="text-blue-900 font-black text-2xl">{contadorActual} / 10</Text>
                <Text className="text-blue-500 text-xs mt-1">
                  {contadorActual >= 10 ? '🎉 ¡Ciclo completado! Próxima compra reinicia.' : `${10 - contadorActual} compra(s) para completar el ciclo`}
                </Text>
              </View>
              <View className="items-center">
                <Ionicons name="star" size={36} color={contadorActual >= 10 ? '#f59e0b' : '#93c5fd'} />
                <Text className="text-xs text-blue-400 mt-1 font-medium">
                  Total items: {cliente.compras || 0}
                </Text>
              </View>
            </View>
            <LoyaltyBar contador={contadorActual} />
          </View>

          {/* Observaciones */}
          {cliente.observaciones && (
            <View className="mb-2">
              <Text className="text-xs text-gray-500 font-bold mb-2 uppercase">Observaciones</Text>
              <View className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <Text className="text-gray-700 leading-relaxed">{cliente.observaciones}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Historial de Compras */}
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 20,
            padding: 20,
            borderWidth: 1,
            borderColor: '#e5e7eb',
            marginBottom: 8,
            elevation: 2,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827' }}>Historial de Compras</Text>
              {ventasMeta && (
                <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                  {ventasMeta.total} compra(s) registrada(s)
                </Text>
              )}
            </View>
            <Ionicons name="receipt-outline" size={22} color="#3b82f6" />
          </View>

          {ventasLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <ActivityIndicator color="#3b82f6" />
              <Text style={{ color: '#9ca3af', marginTop: 8, fontSize: 13 }}>Cargando compras...</Text>
            </View>
          ) : ventas.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Ionicons name="bag-outline" size={40} color="#d1d5db" />
              <Text style={{ color: '#9ca3af', marginTop: 8, fontSize: 14 }}>Sin compras registradas</Text>
            </View>
          ) : (
            <>
              {ventas.map((v, i) => <VentaCard key={v.IDventas ?? i} venta={v} />)}

              {ventasMeta?.hasNextPage && (
                <TouchableOpacity
                  onPress={handleLoadMore}
                  disabled={ventasLoadingMore}
                  style={{
                    backgroundColor: '#eff6ff',
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: 'center',
                    marginTop: 4,
                    borderWidth: 1,
                    borderColor: '#bfdbfe',
                  }}
                >
                  {ventasLoadingMore ? (
                    <ActivityIndicator size="small" color="#3b82f6" />
                  ) : (
                    <Text style={{ color: '#3b82f6', fontWeight: '600', fontSize: 14 }}>
                      Ver más compras
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
