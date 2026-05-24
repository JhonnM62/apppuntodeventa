import React, { useEffect, useRef } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type AlertType = 'info' | 'success' | 'error' | 'warning' | 'confirm';

interface CustomAlertProps {
  visible: boolean;
  type?: AlertType;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  autoDismiss?: boolean;
  autoDismissTime?: number;
}

const COLORS: Record<AlertType, { primary: string; icon: string; iconColor: string }> = {
  info: { primary: '#3b82f6', icon: 'information-circle', iconColor: '#3b82f6' },
  success: { primary: '#22c55e', icon: 'checkmark-circle', iconColor: '#22c55e' },
  error: { primary: '#ef4444', icon: 'alert-circle', iconColor: '#ef4444' },
  warning: { primary: '#f59e0b', icon: 'warning', iconColor: '#f59e0b' },
  confirm: { primary: '#6366f1', icon: 'help-circle', iconColor: '#6366f1' },
};

export const CustomAlert = ({
  visible,
  type = 'info',
  title,
  message,
  confirmText = 'Aceptar',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel,
  autoDismiss,
  autoDismissTime = 3000,
}: CustomAlertProps) => {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const colorScheme = COLORS[type];

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      if (autoDismiss && onConfirm) {
        const timer = setTimeout(() => {
          onConfirm();
        }, autoDismissTime);
        return () => clearTimeout(timer);
      }
    } else {
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const isConfirmType = type === 'confirm';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
        <TouchableOpacity
          style={styles.overlayTouch}
          activeOpacity={1}
          onPress={onCancel}
        />
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ scale: scaleAnim }],
              borderTopColor: colorScheme.primary,
            },
          ]}
        >
          <View style={[styles.iconBadge, { backgroundColor: `${colorScheme.primary}15` }]}>
            <Ionicons name={colorScheme.icon as any} size={32} color={colorScheme.iconColor} />
          </View>

          <Text style={[styles.title, { color: colorScheme.primary }]}>{title}</Text>

          {message && <Text style={styles.message}>{message}</Text>}

          <View style={styles.buttonRow}>
            {isConfirmType && onCancel && (
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onCancel}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelText}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            {onConfirm && (
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.confirmButton,
                  { backgroundColor: colorScheme.primary },
                  isConfirmType && onCancel && styles.confirmButtonFlex,
                ]}
                onPress={onConfirm}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmText}>{confirmText}</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  overlayTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  container: {
    width: width * 0.85,
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderTopWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
  },
  cancelText: {
    color: '#4b5563',
    fontSize: 15,
    fontWeight: '700',
  },
  confirmButton: {
    paddingVertical: 14,
  },
  confirmButtonFlex: {
    flex: 1,
  },
  confirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default CustomAlert;