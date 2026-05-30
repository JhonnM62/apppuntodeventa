import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';
import { COLORS, SHADOWS } from '../../lib/theme';
import { Button } from '../ui/button';
import { getAutoCuadrePreview, executeAutoCuadre } from '../../services/caja';

interface AutoCuadrePreviewModalProps {
  visible: boolean;
  cajaId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

type ModalState = 'LOADING_PLAN' | 'REVIEW_PLAN' | 'EXECUTING' | 'SUCCESS' | 'ERROR';

export default function AutoCuadrePreviewModal({
  visible,
  cajaId,
  onSuccess,
  onCancel,
}: AutoCuadrePreviewModalProps) {
  const [modalState, setModalState] = useState<ModalState>('LOADING_PLAN');
  const [errorMessage, setErrorMessage] = useState('');
  const [planIA, setPlanIA] = useState<any>(null);

  useEffect(() => {
    if (visible && cajaId) {
      loadPlan();
    }
  }, [visible, cajaId]);

  const loadPlan = async () => {
    setModalState('LOADING_PLAN');
    setErrorMessage('');
    try {
      const response = await getAutoCuadrePreview(cajaId);
      // NestJS returns response.data natively if we destructured {data} in axios
      // Let's ensure we get the actual plan object
      const plan = response?.data || response;
      setPlanIA(plan);
      setModalState('REVIEW_PLAN');
    } catch (error: any) {
      console.error('Error cargando plan IA:', error);
      const msg = error?.response?.data?.message || 'Error al obtener plan de IA';
      setErrorMessage(msg);
      setModalState('ERROR');
    }
  };

  const handleExecute = async () => {
    setModalState('EXECUTING');
    try {
      await executeAutoCuadre(cajaId, planIA);
      setModalState('SUCCESS');
    } catch (error: any) {
      console.error('Error ejecutando plan IA:', error);
      setErrorMessage(error?.response?.data?.message || 'Error al ejecutar plan de IA');
      setModalState('ERROR');
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 justify-center items-center p-4" style={{ backgroundColor: COLORS.overlay }}>
          <View
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ backgroundColor: COLORS.surface, ...SHADOWS.xl }}
          >
            {/* Header */}
            <View className="flex-row items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <View className="flex-row items-center">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: `${COLORS.primary}15` }}
                >
                  <Ionicons name="sparkles" size={22} color={COLORS.primary} />
                </View>
                <Text className="text-lg font-bold text-gray-900">Auto-Cuadre IA</Text>
              </View>
              {modalState !== 'LOADING_PLAN' && modalState !== 'EXECUTING' && (
                <Pressable onPress={onCancel} className="p-2 rounded-full">
                  <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                </Pressable>
              )}
            </View>

            {/* Content */}
            {(modalState === 'LOADING_PLAN' || modalState === 'EXECUTING') ? (
              <View className="items-center justify-center py-12 px-5">
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text className="text-sm text-gray-500 mt-3 text-center">
                  {modalState === 'LOADING_PLAN'
                    ? 'La IA está analizando la caja y creando un plan...'
                    : 'Ejecutando correcciones en la base de datos...'}
                </Text>
              </View>
            ) : modalState === 'ERROR' ? (
              <View className="items-center justify-center py-12 px-5">
                <Ionicons name="close-circle" size={48} color={COLORS.error} />
                <Text className="text-sm text-gray-500 mt-3 text-center">{errorMessage}</Text>
                <View className="mt-4 flex-row gap-2">
                  <Button variant="outline" onPress={onCancel}>
                    Cancelar
                  </Button>
                  <Button onPress={loadPlan}>
                    Reintentar
                  </Button>
                </View>
              </View>
            ) : modalState === 'SUCCESS' ? (
              <View className="items-center justify-center py-12 px-5">
                <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
                <Text className="text-lg font-bold text-gray-900 mt-4 text-center">
                  ¡Caja Cuadrada con Éxito!
                </Text>
                <Text className="text-sm text-gray-500 mt-2 text-center">
                  Los pedidos y los totales han sido modificados según el plan.
                </Text>
                <View className="mt-6">
                  <Button onPress={() => { onSuccess(); onCancel(); }}>
                    Continuar
                  </Button>
                </View>
              </View>
            ) : (
              <ScrollView className="max-h-96" showsVerticalScrollIndicator={false}>
                <View className="px-5 py-4">
                  <View className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-4">
                    <Text className="text-sm font-semibold text-blue-900">Resumen del Plan:</Text>
                    <Text className="text-sm text-blue-800 mt-1">{planIA?.justificacionGeneral}</Text>
                  </View>

                  <Text className="text-sm font-medium text-gray-700 mb-2">Acciones a realizar:</Text>

                  {planIA?.acciones?.map((accion: any, index: number) => (
                    <View key={index} className="mb-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
                      <View className="flex-row items-center mb-1">
                        <Ionicons 
                          name={accion.action === 'remove_product' ? 'trash' : 'swap-horizontal'} 
                          size={16} 
                          color={COLORS.primary} 
                        />
                        <Text className="text-sm font-bold text-gray-800 ml-2">
                          {accion.action === 'remove_product' ? 'Reducir Producto' : 'Cambiar Método Pago'}
                        </Text>
                      </View>
                      <Text className="text-xs text-gray-600">
                        {accion.action === 'remove_product' 
                          ? `Quitar ${accion.cantidadARemover} unidad(es) de ${accion.nombreProducto || 'Producto'} en Orden #${accion.ordenId}`
                          : `Pasar Venta #${accion.ventaId} a ${accion.method}`}
                      </Text>
                      <Text className="text-xs text-gray-500 italic mt-1 font-medium text-amber-700">
                        Por qué: {accion.motivo || accion.reason}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}

            {/* Footer */}
            {modalState === 'REVIEW_PLAN' && (
              <View className="px-5 pb-5 pt-2 border-t border-gray-100">
                <Button onPress={handleExecute} className="w-full bg-indigo-600" style={{ backgroundColor: COLORS.primary }}>
                  Ejecutar Auto-Cuadre
                </Button>
                <Pressable onPress={onCancel} className="mt-3 py-3">
                  <Text className="text-sm text-gray-500 text-center font-medium">
                    Cancelar
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
