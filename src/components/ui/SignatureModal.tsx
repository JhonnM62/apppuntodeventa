import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  Text,
  Platform,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

let SignatureScreen: any = null;
try {
  SignatureScreen = require('react-native-signature-canvas').default;
} catch (e) {
  console.warn('react-native-signature-canvas no está disponible o requiere recompilación');
}

interface Props {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onSave: (signature: string) => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function SignatureModal({ visible, title = 'Firmar Documento', onClose, onSave }: Props) {
  const ref = useRef<any>(null);
  const [signed, setSigned] = useState(false);

  const handleOK = (signature: string) => {
    setSigned(false);
    onSave(signature);
  };

  const handleBegin = () => {
    setSigned(true);
  };

  const handleClear = () => {
    ref.current?.clearSignature();
    setSigned(false);
  };

  const handleConfirm = () => {
    ref.current?.readSignature();
  };

  // Minimal webview style — hide built-in footer, maximize canvas
  const webStyle = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #ffffff; }
    .m-signature-pad {
      box-shadow: none;
      border: none;
      width: 100%;
      height: 100%;
      min-height: 100vh;
    }
    .m-signature-pad--body {
      border: none;
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
    }
    .m-signature-pad--footer { display: none !important; }
    canvas {
      width: 100% !important;
      height: 100% !important;
    }
  `;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <SafeAreaView style={styles.container}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={24} color="#374151" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>Dibuja tu firma en el área de abajo</Text>
          </View>

          {/* Status dot */}
          <View style={[styles.statusDot, { backgroundColor: signed ? '#22c55e' : '#d1d5db' }]} />
        </View>

        {/* ── Hint bar ── */}
        <View style={styles.hintBar}>
          <Ionicons name="pencil-outline" size={14} color="#6b7280" style={{ marginRight: 6 }} />
          <Text style={styles.hintText}>Usa tu dedo o el ratón para firmar</Text>
          {signed && (
            <Text style={[styles.hintText, { color: '#22c55e', marginLeft: 8, fontWeight: '700' }]}>
              ✓ Firma detectada
            </Text>
          )}
        </View>

        {/* ── Canvas ── */}
        <View style={styles.canvasWrapper}>
          {SignatureScreen ? (
            <SignatureScreen
              ref={ref}
              onOK={handleOK}
              onBegin={handleBegin}
              webStyle={webStyle}
              backgroundColor="#ffffff"
              penColor="#1e293b"
              minWidth={2}
              maxWidth={4}
              style={{ flex: 1 }}
            />
          ) : (
            <View style={styles.unavailableContainer}>
              <Ionicons name="warning-outline" size={56} color="#f59e0b" style={{ marginBottom: 16 }} />
              <Text style={styles.unavailableTitle}>Módulo de firma no disponible</Text>
              <Text style={styles.unavailableSubtitle}>
                Esta función requiere recompilación de la app nativa.{'\n'}
                Usa <Text style={{ fontWeight: '700' }}>npx expo run:android</Text> para habilitarla.
              </Text>
            </View>
          )}
        </View>

        {/* ── Divider ── */}
        <View style={styles.divider} />

        {/* ── Actions ── */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.btnClear} onPress={handleClear} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
            <Text style={styles.btnClearText}>Limpiar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnSave, !signed && styles.btnSaveDisabled]}
            onPress={handleConfirm}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.btnSaveText}>Guardar Firma</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#ffffff',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerCenter: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 1,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: 12,
  },

  /* Hint bar */
  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  hintText: {
    fontSize: 13,
    color: '#6b7280',
  },

  /* Canvas */
  canvasWrapper: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  unavailableContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  unavailableTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
    textAlign: 'center',
  },
  unavailableSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
  },

  /* Divider */
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
  },

  /* Action buttons */
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: '#ffffff',
  },
  btnClear: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
    minWidth: 120,
  },
  btnClearText: {
    color: '#ef4444',
    fontWeight: '700',
    fontSize: 15,
  },
  btnSave: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2563eb',
  },
  btnSaveDisabled: {
    backgroundColor: '#93c5fd',
  },
  btnSaveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
