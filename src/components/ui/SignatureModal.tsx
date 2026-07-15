import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  Text,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SignatureCanvas from './SignatureCanvas';

interface Props {
  visible: boolean;
  title?: string;
  loading?: boolean;
  onClose: () => void;
  onSave: (signature: string) => void;
}

export default function SignatureModal({ visible, title = 'Firmar Documento', loading = false, onClose, onSave }: Props) {
  const ref = useRef<any>(null);
  const [signed, setSigned] = useState(false);

  const handleOK = (signature: string) => {
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
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={24} color="#374151" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>Dibuja tu firma en el área de abajo</Text>
          </View>

          {/* Live status dot */}
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

        {/* ── Signature Canvas ──
            On web  → SignatureCanvas.web.tsx  (HTML5 <canvas> + Pointer Events)
            On native → SignatureCanvas.tsx     (react-native-signature-canvas)
        */}
        <View style={styles.canvasWrapper}>
          <SignatureCanvas
            ref={ref}
            onOK={handleOK}
            onBegin={handleBegin}
            backgroundColor="#ffffff"
            penColor="#1e293b"
            minWidth={1.5}
            maxWidth={3.5}
          />
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
            style={[styles.btnSave, (!signed || loading) && styles.btnSaveDisabled]}
            onPress={handleConfirm}
            activeOpacity={0.85}
            disabled={!signed || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
            )}
            <Text style={styles.btnSaveText}>{loading ? 'Guardando...' : 'Guardar Firma'}</Text>
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
