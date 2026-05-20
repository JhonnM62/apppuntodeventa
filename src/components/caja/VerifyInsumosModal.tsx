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
} from '../../services/caja';

interface VerifyInsumosModalProps {
  visible: boolean;
  cajaId: string;
  onVerified: () => void;
  onCancel: () => void;
}

interface InsumoState {
  id: string;
  nombre: string;
  unidadDeMedida: string;
  disponibleEnSistema: number;
  cantContada: number;
  diferenciaDetectada: boolean;
  razonDiferencia: string;
  pinConfirmacion: string;
  checked: boolean;
}

type ModalState = 'CHECKING' | 'PENDING_VERIFICATION' | 'LOADING' | 'DIFFERENCE_DETECTED' | 'ERROR' | 'ALREADY_VERIFIED';

const estadoLabels: Record<ModalState, { titulo: string; icono: string; color: string }> = {
  CHECKING: { titulo: 'Verificando insumos...', icono: 'hourglass-outline', color: COLORS.info },
  PENDING_VERIFICATION: { titulo: 'Verificación de Insumos', icono: 'alert-circle', color: COLORS.warning },
  LOADING: { titulo: 'Guardando conteo...', icono: 'hourglass-outline', color: COLORS.info },
  DIFFERENCE_DETECTED: { titulo: 'Diferencia Detectada', icono: 'warning', color: COLORS.error },
  ERROR: { titulo: 'Error', icono: 'close-circle', color: COLORS.error },
  ALREADY_VERIFIED: { titulo: 'Insumos Verificados', icono: 'checkmark-circle', color: COLORS.success },
};

export default function VerifyInsumosModal({
  visible,
  cajaId,
  onVerified,
  onCancel,
}: VerifyInsumosModalProps) {
  const [modalState, setModalState] = useState<ModalState>('CHECKING');
  const [insumos, setInsumos] = useState<InsumoState[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const loadVerificacion = useCallback(async () => {
    if (!visible || !cajaId) return;
    
    setModalState('CHECKING');
    setErrorMessage('');
    setInsumos([]);
    
    try {
      const response = await getVerificacionPendiente(cajaId);
      const pendientes = response?.pendientes ?? [];
      const todasVerificadas = response?.todasVerificadas ?? false;
      
      const insumosPendientes = pendientes.filter((p: InsumoVerificacion) => !p.conteoVerificadoHoy);
      
      if (insumosPendientes.length === 0) {
        setInsumos([]);
        setModalState('ALREADY_VERIFIED');
        return;
      }
      
      const insumosInit = insumosPendientes
        .map((p: InsumoVerificacion): InsumoState => ({
          id: p.id,
          nombre: p.nombre,
          unidadDeMedida: p.unidadDeMedida,
          disponibleEnSistema: p.disponibleEnSistema,
          cantContada: p.cantApertura || p.disponibleEnSistema,
          diferenciaDetectada: false,
          razonDiferencia: '',
          pinConfirmacion: '',
          checked: false,
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
        const nuevaCant = Math.max(0, insumo.cantContada + delta);
        const diff = nuevaCant !== insumo.disponibleEnSistema;
        return {
          ...insumo,
          cantContada: nuevaCant,
          diferenciaDetectada: diff,
          checked: false,
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
        const nuevaCant = isNaN(numValue) ? 0 : Math.max(0, numValue);
        const diff = nuevaCant !== insumo.disponibleEnSistema;
        return {
          ...insumo,
          cantContada: nuevaCant,
          diferenciaDetectada: diff,
          checked: false,
        };
      })
    );
  };

  const handleCheckedChange = (id: string, checked: boolean) => {
    setInsumos(prev =>
      prev.map(insumo => {
        if (insumo.id !== id) return insumo;
        return { ...insumo, checked };
      })
    );
  };

  const handleConfirmar = async () => {
    const todosChecked = insumos.filter(i => i.diferenciaDetectada).every(i => i.checked);
    if (!todosChecked && insumos.some(i => i.diferenciaDetectada)) {
      Alert.alert(
        'Confirmación requerida',
        'Debes marcar cada insumo con diferencia para confirmar que haz verificado el conteo físico.',
        [{ text: 'Entendido', style: 'default' }]
      );
      return;
    }

    setModalState('LOADING');

    try {
      const insumosConDiferencia = insumos
        .filter(i => i.diferenciaDetectada && i.checked)
        .map(i => ({
          idcierreyapertura: i.id,
          cantContada: i.cantContada,
          diferenciaDetectada: i.diferenciaDetectada,
          razonDiferencia: i.razonDiferencia || undefined,
          pinConfirmacion: i.pinConfirmacion || undefined,
        }));

      const insumosSinDiferencia = insumos
        .filter(i => !i.diferenciaDetectada)
        .map(i => ({
          idcierreyapertura: i.id,
          cantContada: i.cantContada,
          diferenciaDetectada: false,
        }));

      await registrarConteo(cajaId, [...insumosSinDiferencia, ...insumosConDiferencia]);
      onVerified();
    } catch (error: any) {
      console.error('Error registrando conteo:', error);
      setErrorMessage(error?.response?.data?.message || 'Error al guardar el conteo');
      setModalState('ERROR');
    }
  };

  const handleCancel = () => {
    if (modalState === 'LOADING') return;
    onCancel();
  };

  const { titulo, icono, color } = estadoLabels[modalState];
  const hasDiferencias = insumos.some(i => i.diferenciaDetectada);

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
                  {modalState === 'DIFFERENCE_DETECTED' && (
                    <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: `${COLORS.error}10` }}>
                      <Text className="text-sm text-gray-700 text-center">
                        Se detectaron diferencias entre el stock del sistema y el conteo físico.
                        Revisa cada insumo y confirma con tu PIN.
                      </Text>
                    </View>
                  )}

                  {hasDiferencias && (
                    <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: `${COLORS.warning}10` }}>
                      <Text className="text-sm text-gray-700 text-center">
                        Los insumos marcados en rojo tienen diferencia. Debes marcar cada uno
                        para confirmar que verificaste el conteo físico.
                      </Text>
                    </View>
                  )}

                  <Text className="text-sm font-medium text-gray-700 mb-3">
                    Insumos que requieren verificación:
                  </Text>

                  {insumos.map(insumo => (
                    <View
                      key={insumo.id}
                      className={cn(
                        'mb-3 p-4 rounded-xl border',
                        insumo.diferenciaDetectada && insumo.checked
                          ? 'border-green-300 bg-green-50'
                          : insumo.diferenciaDetectada
                          ? 'border-red-200 bg-red-50'
                          : 'border-gray-200 bg-gray-50'
                      )}
                    >
                      <View className="flex-row justify-between items-center mb-2">
                        <Text className="text-base font-semibold text-gray-900 flex-1">
                          {insumo.nombre}
                        </Text>
                        {insumo.diferenciaDetectada ? (
                          <View className="flex-row items-center">
                            <Ionicons name="warning" size={16} color={COLORS.error} />
                            <Text className="text-xs font-medium text-red-500 ml-1">Diferencia</Text>
                          </View>
                        ) : (
                          <View className="flex-row items-center">
                            <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                            <Text className="text-xs font-medium text-green-500 ml-1">Sin diferencia</Text>
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

                      {/* Cantidad input con botones */}
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
                            borderColor: insumo.diferenciaDetectada ? COLORS.error : COLORS.primary,
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

                      {/* Checkbox para confirmar */}
                      {insumo.diferenciaDetectada && (
                        <Pressable
                          onPress={() => handleCheckedChange(insumo.id, !insumo.checked)}
                          className={cn(
                            'mt-3 flex-row items-center p-3 rounded-xl border',
                            insumo.checked
                              ? 'border-green-300 bg-green-100'
                              : 'border-gray-200 bg-white'
                          )}
                        >
                          <View
                            className={cn(
                              'w-5 h-5 rounded-md items-center justify-center mr-3',
                              insumo.checked ? 'bg-green-500' : 'bg-gray-200'
                            )}
                          >
                            {insumo.checked && (
                              <Ionicons name="checkmark" size={14} color="white" />
                            )}
                          </View>
                          <Text className="text-sm text-gray-700 flex-1">
                            Declaro que la cantidad física conteida es correcta según mi conteo
                          </Text>
                        </Pressable>
                      )}
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