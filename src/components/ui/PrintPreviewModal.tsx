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
import { COLORS, SHADOWS } from '../../lib/theme';
import { Button } from '../ui/button';
import usePrinterStore from '../../store/usePrinterStore';
import { getCleanTicketPayload } from '../../utils/printer';

interface PrintPreviewModalProps {
  visible: boolean;
  ticketData: any;
  type: 'comanda' | 'factura' | null;
  onClose: () => void;
}

export default function PrintPreviewModal({
  visible,
  ticketData,
  type,
  onClose,
}: PrintPreviewModalProps) {
  const { manualAutoPrintEnabled, manualAutoPrintSeconds, printManual, paperSize } = usePrinterStore();
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const previewText = React.useMemo(() => {
    if (!ticketData || !type) return '';
    try {
      return getCleanTicketPayload(ticketData, paperSize, type);
    } catch (e) {
      console.log('Error previewing ticket', e);
      return '';
    }
  }, [ticketData, type, paperSize]);

  useEffect(() => {
    if (visible && manualAutoPrintEnabled) {
      setTimeLeft(manualAutoPrintSeconds);
    } else {
      setTimeLeft(null);
    }
    setIsPrinting(false);
  }, [visible, manualAutoPrintEnabled, manualAutoPrintSeconds]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (visible && timeLeft !== null && timeLeft > 0 && !isPrinting) {
      timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
    } else if (visible && timeLeft === 0 && !isPrinting) {
      handlePrint();
    }
    return () => clearTimeout(timer);
  }, [timeLeft, visible, isPrinting]);

  const handlePrint = async () => {
    if (!type || !ticketData) return;
    setIsPrinting(true);
    await printManual(ticketData, type);
    onClose();
  };

  const getTitle = () => {
    if (type === 'comanda') return 'Previsualización de Comanda';
    if (type === 'factura') return 'Previsualización de Ticket';
    return 'Previsualización';
  };

  const getIcon = () => {
    if (type === 'comanda') return 'restaurant-outline';
    if (type === 'factura') return 'receipt-outline';
    return 'print-outline';
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
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
                  <Ionicons name={getIcon() as any} size={22} color={COLORS.primary} />
                </View>
                <Text className="text-lg font-bold text-gray-900">{getTitle()}</Text>
              </View>
              {!isPrinting && (
                <Pressable onPress={onClose} className="p-2 rounded-full">
                  <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                </Pressable>
              )}
            </View>

            {/* Content */}
            {isPrinting ? (
              <View className="items-center justify-center py-12 px-5">
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text className="text-sm text-gray-500 mt-3 text-center">
                  Enviando a la impresora...
                </Text>
              </View>
            ) : (
              <ScrollView className="max-h-96" showsVerticalScrollIndicator={true}>
                <View className="px-5 py-6 w-full items-center">
                  <View style={{ backgroundColor: '#fff', padding: 16, borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'dashed', width: '100%', minHeight: 150 }}>
                    <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 11, color: '#000', lineHeight: 14 }}>
                      {previewText}
                    </Text>
                  </View>
                  
                  {timeLeft !== null && timeLeft > 0 && (
                    <View className="mt-6 bg-blue-50 px-4 py-2 rounded-full flex-row items-center">
                      <Ionicons name="timer-outline" size={16} color="#1d4ed8" />
                      <Text className="text-blue-700 ml-2 font-medium">
                        Auto-impresión en {timeLeft}s
                      </Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            )}

            {/* Footer */}
            {!isPrinting && (
              <View className="px-5 pb-5 pt-2 border-t border-gray-100">
                <Button onPress={handlePrint} className="w-full bg-indigo-600" style={{ backgroundColor: COLORS.primary }}>
                  Imprimir Ahora
                </Button>
                <Pressable onPress={onClose} className="mt-3 py-3">
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
