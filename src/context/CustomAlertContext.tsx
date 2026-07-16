import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { Modal, TouchableOpacity, Text, StyleSheet, Animated, Dimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type AlertType = 'info' | 'success' | 'error' | 'warning' | 'confirm';

interface AlertOptions {
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

interface CustomAlertContextValue {
  showAlert: (options: AlertOptions) => void;
  hideAlert: () => void;
}

const CustomAlertContext = createContext<CustomAlertContextValue>({ showAlert: () => {}, hideAlert: () => {} });

export const useCustomAlert = () => useContext(CustomAlertContext);

const COLORS: Record<AlertType, { primary: string; icon: string; iconColor: string }> = {
  info: { primary: '#3b82f6', icon: 'information-circle', iconColor: '#3b82f6' },
  success: { primary: '#22c55e', icon: 'checkmark-circle', iconColor: '#22c55e' },
  error: { primary: '#ef4444', icon: 'alert-circle', iconColor: '#ef4444' },
  warning: { primary: '#f59e0b', icon: 'warning', iconColor: '#f59e0b' },
  confirm: { primary: '#6366f1', icon: 'help-circle', iconColor: '#6366f1' },
};

const { width } = Dimensions.get('window');

export const CustomAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alertState, setAlertState] = useState<AlertOptions & { visible: boolean }>({ visible: false, title: '' });
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const showAlert = useCallback((options: AlertOptions) => {
    setAlertState({ ...options, visible: true });
  }, []);

  const hideAlert = useCallback(() => {
    setAlertState(prev => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    if (alertState.visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
    }
  }, [alertState.visible]);

  useEffect(() => {
    if (alertState.visible && alertState.autoDismiss && alertState.onConfirm) {
      const timer = setTimeout(() => {
        hideAlert();
        alertState.onConfirm();
      }, alertState.autoDismissTime || 3000);
      return () => clearTimeout(timer);
    }
  }, [alertState.visible, alertState.autoDismiss, alertState.autoDismissTime, alertState.onConfirm, hideAlert]);

  const { visible, type = 'info', title, message, confirmText = 'Aceptar', cancelText = 'Cancelar', onConfirm, onCancel, autoDismiss, autoDismissTime } = alertState;
  const colorScheme = COLORS[type];
  const isConfirmType = type === 'confirm';

  return (
    <CustomAlertContext.Provider value={{ showAlert, hideAlert }}>
      {children}
      {visible && (
        <Modal
          visible={true}
          transparent
          animationType="none"
          onRequestClose={hideAlert}
          statusBarTranslucent
        >
          <Animated.View style={[styles.overlay, { opacity: opacityAnim, zIndex: 999999, elevation: 999999 }]}>
            <TouchableOpacity style={styles.overlayTouch} activeOpacity={1} onPress={() => { if (isConfirmType) { hideAlert(); } else { onCancel ? onCancel() : hideAlert(); } }} />
            <Animated.View
              style={[
                styles.container,
                { transform: [{ scale: scaleAnim }], borderTopColor: colorScheme.primary },
              ]}
            >
              <View style={[styles.iconBadge, { backgroundColor: `${colorScheme.primary}15` }]}>
                <Ionicons name={colorScheme.icon as any} size={32} color={colorScheme.iconColor} />
              </View>
              <Text style={[styles.title, { color: colorScheme.primary }]}>{title}</Text>
              {message && <Text style={styles.message}>{message}</Text>}
              <View style={styles.buttonRow}>
                {isConfirmType && (
                  <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => { hideAlert(); onCancel?.(); }} activeOpacity={0.7}>
                    <Text style={styles.cancelText}>{cancelText}</Text>
                  </TouchableOpacity>
                )}
                {onConfirm && (
                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: colorScheme.primary }, isConfirmType && onCancel ? styles.confirmButtonFlex : { flex: 1 }]}
                    onPress={() => { hideAlert(); onConfirm(); }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.confirmText}>{confirmText}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>
          </Animated.View>
        </Modal>
      )}
    </CustomAlertContext.Provider>
  );
};

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
  confirmButtonFlex: {
    flex: 1,
  },
  confirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default CustomAlertProvider;