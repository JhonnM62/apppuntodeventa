import React from "react";
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Text,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";

let Print: any = null;
try { Print = require("expo-print"); } catch {}
let Sharing: any = null;
try { Sharing = require("expo-sharing"); } catch {}

interface Props {
  visible: boolean;
  html: string;
  title?: string;
  showSignButton?: boolean;
  onSign?: () => void;
  onClose: () => void;
}

export default function LiquidacionViewerModal({
  visible,
  html,
  title = "Comprobante de Liquidacion",
  showSignButton = false,
  onSign,
  onClose,
}: Props) {
  const [webLoading, setWebLoading] = React.useState(true);

  const handleDescargar = async () => {
    try {
      if (!Print) return;
      const { uri } = await Print.printToFileAsync({ html });
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, {
          UTI: "com.adobe.pdf",
          mimeType: "application/pdf",
          dialogTitle: title,
        });
      }
    } catch (e) {
      console.error("[LiquidacionViewerModal] Error al descargar:", e);
    }
  };

  if (Platform.OS === "web") {
    if (!visible) return null;
    return (
      <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          </View>
          <iframe
            srcDoc={html}
            style={{ flex: 1, border: "none", width: "100%", height: "100%" } as any}
            title={title}
          />
          <View style={styles.footer}>
            <TouchableOpacity style={styles.btnDescargar} onPress={handleDescargar}>
              <Ionicons name="download-outline" size={20} color="#2563eb" />
              <Text style={styles.btnDescargarText}>Descargar</Text>
            </TouchableOpacity>
            {showSignButton && onSign && (
              <TouchableOpacity style={styles.btnFirmar} onPress={onSign}>
                <Ionicons name="create-outline" size={20} color="#fff" />
                <Text style={styles.btnFirmarText}>Firmar</Text>
              </TouchableOpacity>
            )}
            {!showSignButton && (
              <TouchableOpacity style={styles.btnCerrar} onPress={onClose}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={styles.btnFirmarText}>Cerrar</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        </View>

        <View style={styles.webviewContainer}>
          {webLoading && (
            <View style={styles.loaderOverlay}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={styles.loaderText}>Cargando documento...</Text>
            </View>
          )}
          <WebView
            originWhitelist={["*"]}
            source={{ html, baseUrl: "" }}
            onLoadEnd={() => setWebLoading(false)}
            onLoadStart={() => setWebLoading(true)}
            style={styles.webview}
            showsVerticalScrollIndicator
            javaScriptEnabled
          />
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.btnDescargar} onPress={handleDescargar}>
            <Ionicons name="download-outline" size={20} color="#2563eb" />
            <Text style={styles.btnDescargarText}>Descargar</Text>
          </TouchableOpacity>
          {showSignButton && onSign ? (
            <TouchableOpacity style={styles.btnFirmar} onPress={onSign}>
              <Ionicons name="create-outline" size={20} color="#fff" />
              <Text style={styles.btnFirmarText}>Firmar</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.btnCerrar} onPress={onClose}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={styles.btnFirmarText}>Cerrar</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    gap: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: "#111827" },
  webviewContainer: { flex: 1, position: "relative" },
  webview: { flex: 1, backgroundColor: "#f9fafb" },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#f9fafb",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  loaderText: { marginTop: 12, fontSize: 14, color: "#6b7280" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 12,
  },
  btnDescargar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  btnDescargarText: { color: "#2563eb", fontWeight: "700", fontSize: 15 },
  btnFirmar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#2563eb",
  },
  btnCerrar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#10b981",
  },
  btnFirmarText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
