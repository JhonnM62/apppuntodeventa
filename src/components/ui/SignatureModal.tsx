import React, { useRef } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, SafeAreaView } from 'react-native';
import { Text } from './text';
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

export default function SignatureModal({ visible, title = 'Firmar Documento', onClose, onSave }: Props) {
  const ref = useRef<any>(null);

  const handleOK = (signature: string) => {
    onSave(signature);
  };

  const handleClear = () => {
    ref.current?.clearSignature();
  };

  const handleConfirm = () => {
    ref.current?.readSignature();
  };

  // HTML content for webview to hide default buttons of the library if we want custom ones,
  // but the default ones are usually fine. We'll use the built-in webview buttons for simplicity, 
  // just custom styling the webview.
  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; }
    .m-signature-pad--body { border: 1px solid #e5e7eb; border-radius: 8px; }
    .m-signature-pad--footer { display: none; } 
  `;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.subtitle}>
            Usa tu dedo o el ratón para dibujar tu firma en el recuadro blanco.
          </Text>

          <View style={styles.canvasContainer}>
            {SignatureScreen ? (
              <SignatureScreen
                ref={ref}
                onOK={handleOK}
                webStyle={webStyle}
                backgroundColor="#f9fafb"
                penColor="#0f172a"
              />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <Ionicons name="warning" size={48} color="#f59e0b" style={{ marginBottom: 16 }} />
                <Text style={{ color: '#ef4444', textAlign: 'center', fontWeight: 'bold' }}>El módulo de firma no está disponible.</Text>
                <Text style={{ color: '#6b7280', textAlign: 'center', marginTop: 8 }}>Debes recompilar la aplicación nativa (APK/AAB) o correr `npx expo run:android` para instalar las librerías necesarias.</Text>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnClear]} onPress={handleClear}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <Text style={styles.btnClearText}>Limpiar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handleConfirm}>
              <Text style={styles.btnSaveText}>Guardar Firma</Text>
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    flex: 1,
    maxHeight: '80%',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  closeBtn: {
    padding: 4,
  },
  canvasContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f9fafb',
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  btnClear: {
    backgroundColor: '#fee2e2',
  },
  btnClearText: {
    color: '#ef4444',
    fontWeight: '600',
  },
  btnSave: {
    backgroundColor: '#2563eb',
  },
  btnSaveText: {
    color: '#fff',
    fontWeight: '600',
  },
});
