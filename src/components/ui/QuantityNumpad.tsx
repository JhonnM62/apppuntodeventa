import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  StyleSheet,
  Vibration,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface QuantityNumpadProps {
  visible: boolean;
  productName: string;
  unitPrice: number;
  currentQuantity: number;
  onConfirm: (quantity: number) => void;
  onCancel: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'];
const MAX_QTY = 9999;

const QuantityNumpad: React.FC<QuantityNumpadProps> = ({
  visible,
  productName,
  unitPrice,
  currentQuantity,
  onConfirm,
  onCancel,
}) => {
  const [input, setInput] = useState('');
  const slideAnim = useRef(new Animated.Value(400)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const displayScaleAnim = useRef(new Animated.Value(1)).current;

  // Reset input when opening
  useEffect(() => {
    if (visible) {
      setInput(String(currentQuantity));
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 80,
          friction: 12,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 400,
          duration: 200,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const animateDisplay = () => {
    Animated.sequence([
      Animated.timing(displayScaleAnim, {
        toValue: 1.08,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(displayScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleKey = (key: string) => {
    if (Platform.OS === 'android') Vibration.vibrate(18);
    animateDisplay();

    if (key === '⌫') {
      setInput((prev) => (prev.length <= 1 ? '' : prev.slice(0, -1)));
      return;
    }

    setInput((prev) => {
      const next = prev === '0' ? key : prev + key;
      // Guard: max 4 digits
      if (Number(next) > MAX_QTY) return prev;
      return next;
    });
  };

  const displayValue = input === '' ? '0' : input;
  const numValue = Number(displayValue);
  const previewTotal = numValue * unitPrice;

  const handleConfirm = () => {
    onConfirm(numValue);
  };

  const isConfirmDisabled = numValue === currentQuantity && numValue > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onCancel} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.productLabel} numberOfLines={1}>{productName}</Text>
            <Text style={styles.priceLabel}>${unitPrice.toLocaleString()} c/u</Text>
          </View>
          <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {/* Display */}
        <View style={styles.displayContainer}>
          <Animated.Text
            style={[styles.displayText, { transform: [{ scale: displayScaleAnim }] }]}
          >
            {displayValue}
          </Animated.Text>
          <View style={styles.totalPreview}>
            <Text style={styles.totalLabel}>Total </Text>
            <Text style={styles.totalValue}>
              {numValue > 0 ? `$${previewTotal.toLocaleString()}` : '—'}
            </Text>
          </View>
        </View>

        {/* Numpad Grid */}
        <View style={styles.numpad}>
          {KEYS.map((key) => {
            const isBackspace = key === '⌫';
            return (
              <TouchableOpacity
                key={key}
                style={[styles.key, isBackspace && styles.keyBackspace]}
                onPress={() => handleKey(key)}
                activeOpacity={0.65}
              >
                {isBackspace ? (
                  <Ionicons name="backspace-outline" size={22} color="#374151" />
                ) : (
                  <Text style={styles.keyText}>{key}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Confirm Button */}
        <TouchableOpacity
          style={[
            styles.confirmBtn,
            numValue === 0 && styles.confirmBtnDanger,
          ]}
          onPress={handleConfirm}
          activeOpacity={0.85}
        >
          {numValue === 0 ? (
            <>
              <Ionicons name="trash-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.confirmBtnText}>Eliminar del carrito</Text>
            </>
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.confirmBtnText}>
                Confirmar — {numValue}x ${previewTotal.toLocaleString()}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    marginBottom: 4,
  },
  headerInfo: {
    flex: 1,
    marginRight: 8,
  },
  productLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  priceLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  displayContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    marginVertical: 8,
    marginHorizontal: 4,
  },
  displayText: {
    fontSize: 52,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -2,
    lineHeight: 62,
  },
  totalPreview: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 13,
    color: '#9ca3af',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4CAF50',
  },
  numpad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 4,
    gap: 8,
  },
  key: {
    width: '30%',
    height: 56,
    backgroundColor: '#f3f4f6',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    // Compensate for gap
    flexGrow: 1,
  },
  keyBackspace: {
    backgroundColor: '#fee2e2',
  },
  keyText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
  },
  confirmBtn: {
    flexDirection: 'row',
    backgroundColor: '#4CAF50',
    borderRadius: 16,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    marginHorizontal: 4,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  confirmBtnDanger: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export default QuantityNumpad;
