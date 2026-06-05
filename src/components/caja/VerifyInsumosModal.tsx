import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { cn } from '../../lib/utils';
import { COLORS, SHADOWS, ANIMATION, SPACING, RADIUS, FONT_SIZE } from '../../lib/theme';
import { Button } from '../ui/button';
import { TextInput } from '../ui/input';
import {
  InsumoVerificacion,
  getVerificacionPendiente,
  registrarConteo,
  posponerVerificacion,
} from '../../services/caja';

interface VerifyInsumosModalProps {
  visible: boolean;
  cajaId: string;
  onVerified: () => void;
  onPostponed?: () => void;
  onCancel: () => void;
}

interface InsumoState {
  id: string;
  nombre: string;
  unidadDeMedida: string;
  disponibleEnSistema: number;
  cantContada: number | string;
  diferencia: number;
}

type ModalState = 'CHECKING' | 'PENDING_VERIFICATION' | 'LOADING' | 'ERROR' | 'ALREADY_VERIFIED';

const estadoLabels: Record<ModalState, { titulo: string; icono: string; color: string }> = {
  CHECKING: { titulo: 'Verificando insumos...', icono: 'hourglass-outline', color: COLORS.info },
  PENDING_VERIFICATION: { titulo: 'Verificación de Insumos', icono: 'alert-circle', color: COLORS.warning },
  LOADING: { titulo: 'Guardando conteo...', icono: 'hourglass-outline', color: COLORS.info },
  ERROR: { titulo: 'Error', icono: 'close-circle', color: COLORS.error },
  ALREADY_VERIFIED: { titulo: 'Insumos Verificados', icono: 'checkmark-circle', color: COLORS.success },
};

export default function VerifyInsumosModal({
  visible,
  cajaId,
  onVerified,
  onPostponed,
  onCancel,
}: VerifyInsumosModalProps) {
  const [modalState, setModalState] = useState<ModalState>('CHECKING');
  const [insumos, setInsumos] = useState<InsumoState[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [puedePosponer, setPuedePosponer] = useState(false);
  const [posposicionesRestantes, setPosposicionesRestantes] = useState(0);

  const loadVerificacion = useCallback(async () => {
    if (!visible || !cajaId) return;
    
    setModalState('CHECKING');
    setErrorMessage('');
    setInsumos([]);
    
    try {
      const response = await getVerificacionPendiente(cajaId);
      console.log('[VerifyInsumosModal] Response:', JSON.stringify(response, null, 2));
      
      const pendientes = response?.pendientes ?? [];
      console.log('[VerifyInsumosModal] Pendientes:', pendientes.length, pendientes.map(p => ({ nombre: p.nombre, conteoVerificado: p.conteoVerificado })));
      
      const todasVerificadas = response?.todasVerificadas ?? false;
      console.log('[VerifyInsumosModal] TodasVerificadas:', todasVerificadas);
      
      setPuedePosponer(response?.puedePosponer ?? false);
      setPosposicionesRestantes(response?.posposicionesRestantes ?? 0);
      
      const insumosPendientes = pendientes.filter((p: InsumoVerificacion) => !p.conteoVerificado);
      
      if (insumosPendientes.length === 0) {
        setInsumos([]);
        setModalState('ALREADY_VERIFIED');
        if (todasVerificadas) {
          onVerified();
        } else {
          onVerified();
        }
        return;
      }
      
      const insumosInit = insumosPendientes
        .map((p: InsumoVerificacion): InsumoState => ({
          id: p.id,
          nombre: p.nombre,
          unidadDeMedida: p.unidadDeMedida,
          disponibleEnSistema: p.disponibleEnSistema,
          cantContada: '',
          diferencia: 0,
        }));
      
      setInsumos(insumosInit);
      setModalState('PENDING_VERIFICATION');
    } catch (error: any) {
      console.error('Error cargando verificación:', error);
      setErrorMessage(error?.response?.data?.message || 'Error al cargar verificación');
      setModalState('ERROR');
    }
  }, [visible, cajaId, onVerified]);

  React.useEffect(() => {
    if (visible) {
      loadVerificacion();
    }
  }, [visible]);

  const handleCantidadChange = (id: string, delta: number) => {
    setInsumos(prev =>
      prev.map(insumo => {
        if (insumo.id !== id) return insumo;
        const actualCant = typeof insumo.cantContada === 'number' ? insumo.cantContada : 0;
        const nuevaCant = Math.max(0, actualCant + delta);
        const diff = nuevaCant - insumo.disponibleEnSistema;
        return {
          ...insumo,
          cantContada: nuevaCant,
          diferencia: diff,
        };
      })
    );
  };

  const handleInputChange = (id: string, value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) && value !== '') return;
    
    setInsumos(prev =>
      prev.map(insumo => {
        if (insumo.id !== id) return insumo;
        const nuevaCant = value === '' ? '' : (isNaN(numValue) ? 0 : Math.max(0, numValue));
        const diff = typeof nuevaCant === 'number' ? nuevaCant - insumo.disponibleEnSistema : 0;
        return {
          ...insumo,
          cantContada: nuevaCant,
          diferencia: diff,
        };
      })
    );
  };

  const handleConfirmar = async () => {
    if (insumos.some(i => i.cantContada === '')) {
      Alert.alert('Error', 'Debes ingresar el conteo para todos los insumos listados.');
      return;
    }
    setModalState('LOADING');

    try {
      const payload = insumos.map(i => ({
        idInsumo: i.id,
        cantContada: i.cantContada,
        disponibleEnSistema: i.disponibleEnSistema,
      }));

      await registrarConteo(cajaId, payload);
      onVerified();
    } catch (error: any) {
      console.error('Error registrando conteo:', error);
      setErrorMessage(error?.response?.data?.message || 'Error al guardar el conteo');
      setModalState('ERROR');
    }
  };

  const handlePosponer = async () => {
    if (!puedePosponer) return;
    setModalState('LOADING');
    try {
      await posponerVerificacion(cajaId);
      if (onPostponed) {
        onPostponed();
      } else {
        onCancel();
      }
    } catch (error: any) {
      console.error('Error posponiendo verificación:', error);
      setErrorMessage(error?.response?.data?.message || 'Error al posponer la verificación');
      setModalState('ERROR');
    }
  };

  const handleCancel = () => {
    if (modalState === 'LOADING') return;
    onCancel();
  };

  const { titulo, icono, color } = estadoLabels[modalState];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleCancel}>
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
                  style={{ backgroundColor: `${color}15` }}
                >
                  <Ionicons name={icono as any} size={22} color={color} />
                </View>
                <Text className="text-lg font-bold text-gray-900">{titulo}</Text>
              </View>
              {modalState !== 'LOADING' && modalState !== 'CHECKING' && (
                <Pressable onPress={handleCancel} className="p-2 rounded-full">
                  <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                </Pressable>
              )}
            </View>

            {/* Content */}
            {(modalState === 'CHECKING' || modalState === 'LOADING') ? (
              <View className="items-center justify-center py-12 px-5">
                <ActivityIndicator size="large" color={color} />
                <Text className="text-sm text-gray-500 mt-3 text-center">
                  {modalState === 'CHECKING'
                    ? 'Verificando estado de insumos...'
                    : 'Guardando conteo...'}
                </Text>
              </View>
            ) : modalState === 'ERROR' ? (
              <View className="items-center justify-center py-12 px-5">
                <Ionicons name="close-circle" size={48} color={COLORS.error} />
                <Text className="text-sm text-gray-500 mt-3 text-center">{errorMessage}</Text>
                <View className="mt-4">
                  <Button variant="outline" onPress={loadVerificacion}>
                    Reintentar
                  </Button>
                </View>
              </View>
            ) : modalState === 'ALREADY_VERIFIED' ? (
              <View className="items-center justify-center py-12 px-5">
                <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
                <Text className="text-lg font-bold text-gray-900 mt-4 text-center">
                  ¡Todos los insumos verificados!
                </Text>
                <Text className="text-sm text-gray-500 mt-2 text-center">
                  No hay insumos pendientes de conteo para esta caja.
                </Text>
                <View className="mt-6">
                  <Button onPress={onVerified}>
                    Continuar
                  </Button>
                </View>
              </View>
            ) : (
              <ScrollView
                className="max-h-96"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View className="px-5 py-4">
                  <Text className="text-sm font-medium text-gray-700 mb-3">
                    Insumos que requieren verificación:
                  </Text>

                  {insumos.map(insumo => (
                    <View
                      key={insumo.id}
                      className={cn(
                        'mb-3 p-4 rounded-xl border',
                        insumo.diferencia !== 0
                          ? 'border-red-200 bg-red-50'
                          : 'border-gray-200 bg-gray-50'
                      )}
                    >
                      <View className="flex-row justify-between items-center mb-2">
                        <Text className="text-base font-semibold text-gray-900 flex-1">
                          {insumo.nombre}
                        </Text>
                        {insumo.diferencia !== 0 ? (
                          <View className="flex-row items-center">
                            <Ionicons name="warning" size={16} color={COLORS.error} />
                            <Text className="text-xs font-medium text-red-500 ml-1">
                              {insumo.diferencia > 0 ? '+' : ''}{insumo.diferencia}
                            </Text>
                          </View>
                        ) : (
                          <View className="flex-row items-center">
                            <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                            <Text className="text-xs font-medium text-green-500 ml-1">Cuadrado</Text>
                          </View>
                        )}
                      </View>

                      <View className="flex-row items-center justify-between mb-3">
                        <Text className="text-sm text-gray-500">
                          Sistema: <Text className="font-semibold">{insumo.disponibleEnSistema}</Text>
                        </Text>
                        <Text className="text-sm text-gray-400">
                          {insumo.unidadDeMedida}
                        </Text>
                      </View>

                      <View className="flex-row items-center justify-center">
                        <Pressable
                          onPress={() => handleCantidadChange(insumo.id, -1)}
                          className="w-12 h-12 rounded-xl items-center justify-center"
                          style={{ backgroundColor: `${COLORS.primary}15` }}
                        >
                          <Ionicons name="remove" size={22} color={COLORS.primary} />
                        </Pressable>

                        <TextInput
                          value={String(insumo.cantContada)}
                          onChangeText={(v) => handleInputChange(insumo.id, v)}
                          keyboardType="number-pad"
                          className="mx-3 w-20 h-12 text-center text-lg font-bold"
                          style={{
                            backgroundColor: COLORS.surface,
                            borderColor: insumo.diferencia !== 0 ? COLORS.error : COLORS.primary,
                            borderWidth: 2,
                          }}
                        />

                        <Pressable
                          onPress={() => handleCantidadChange(insumo.id, 1)}
                          className="w-12 h-12 rounded-xl items-center justify-center"
                          style={{ backgroundColor: `${COLORS.primary}15` }}
                        >
                          <Ionicons name="add" size={22} color={COLORS.primary} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}

            {/* Footer */}
            {modalState === 'PENDING_VERIFICATION' && (
              <View className="px-5 pb-5 pt-2 border-t border-gray-100">
                <Button onPress={handleConfirmar} className="w-full">
                  Confirmar Conteo
                </Button>
                
                {puedePosponer && (
                  <Button 
                    onPress={handlePosponer} 
                    variant="outline" 
                    className="w-full mt-3"
                    style={{ borderColor: COLORS.warning }}
                  >
                    <Text style={{ color: COLORS.warning, fontWeight: 'bold' }}>
                      {posposicionesRestantes === -1 
                        ? 'Posponer (Ilimitado)' 
                        : `Posponer (${posposicionesRestantes} restante${posposicionesRestantes !== 1 ? 's' : ''})`
                      }
                    </Text>
                  </Button>
                )}

                <Pressable onPress={handleCancel} className="mt-3 py-3">
                  <Text className="text-sm text-gray-500 text-center">
                    Cancelar y volver
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