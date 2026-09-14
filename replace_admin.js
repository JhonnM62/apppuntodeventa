const fs = require('fs');
const path = 'c:/APIS_v2.3/puntodeventafront/src/screens/nomina/AdminNominaScreen.tsx';
let f = fs.readFileSync(path, 'utf8');

// 1. Import Image
f = f.replace(/import \{ View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Switch, Platform, Alert \} from 'react-native';/, "import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Switch, Platform, Alert, Image } from 'react-native';");

// 2. Modify DescansoStatusAdmin signature
f = f.replace(/const DescansoStatusAdmin = \(\{ turno \}: \{ turno: any \}\) => \{/, "const DescansoStatusAdmin = ({ turno, onViewPhoto }: { turno: any, onViewPhoto?: (url: string) => void }) => {");

// 3. DescansoStatusAdmin - Completed
const replaceCompletedHeader = `
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name={isOvertime ? "warning" : "checkmark-circle"} size={14} color={isOvertime ? "#dc2626" : "#15803d"} />
            <Text style={{ color: isOvertime ? "#dc2626" : "#15803d", fontSize: 12, marginLeft: 4, fontWeight: 'bold' }}>
              Descanso completado {isOvertime && \`(+\${formatMinSec(extraTime)})\`}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {turno.fotoInicioDescanso && (
              <TouchableOpacity onPress={() => onViewPhoto?.(turno.fotoInicioDescanso)} style={{ backgroundColor: '#e2e8f0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 10, color: '#475569' }}>📸 Inicio</Text>
              </TouchableOpacity>
            )}
            {turno.fotoFinDescanso && (
              <TouchableOpacity onPress={() => onViewPhoto?.(turno.fotoFinDescanso)} style={{ backgroundColor: '#e2e8f0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 10, color: '#475569' }}>📸 Fin</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
`;
f = f.replace(/<View style=\{\{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 \}\}>\s*<Ionicons name=\{isOvertime \? "warning" : "checkmark-circle"\} size=\{14\} color=\{isOvertime \? "#dc2626" : "#15803d"\} \/>\s*<Text style=\{\{ color: isOvertime \? "#dc2626" : "#15803d", fontSize: 12, marginLeft: 4, fontWeight: 'bold' \}\}>\s*Descanso completado \{isOvertime && \`\(\+\$\{formatMinSec\(extraTime\)\}\)\`\}\s*<\/Text>\s*<\/View>/m, replaceCompletedHeader.trim());

// 4. DescansoStatusAdmin - In progress
const replaceInProgressHeader = `
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="cafe" size={14} color={textColor} />
            <Text style={{ color: textColor, fontSize: 12, marginLeft: 4, fontWeight: 'bold' }}>
              EN DESCANSO
            </Text>
          </View>
          {turno.fotoInicioDescanso && (
            <TouchableOpacity onPress={() => onViewPhoto?.(turno.fotoInicioDescanso)} style={{ backgroundColor: 'rgba(0,0,0,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ fontSize: 10, color: textColor }}>📸 Inicio</Text>
            </TouchableOpacity>
          )}
        </View>
`;
f = f.replace(/<View style=\{\{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 \}\}>\s*<Ionicons name="cafe" size=\{14\} color=\{textColor\} \/>\s*<Text style=\{\{ color: textColor, fontSize: 12, marginLeft: 4, fontWeight: 'bold' \}\}>\s*EN DESCANSO\s*<\/Text>\s*<\/View>/m, replaceInProgressHeader.trim());

// 5. Add state photoViewerUrl
f = f.replace(/const \[guardandoDescuentoExtra, setGuardandoDescuentoExtra\] = useState\(false\);/, "const [guardandoDescuentoExtra, setGuardandoDescuentoExtra] = useState(false);\n  const [photoViewerUrl, setPhotoViewerUrl] = useState<string | null>(null);");

// 6. Update DescansoStatusAdmin usages
f = f.replace(/<DescansoStatusAdmin turno=\{turnoActivo\} \/>/g, "<DescansoStatusAdmin turno={turnoActivo} onViewPhoto={setPhotoViewerUrl} />");
f = f.replace(/<DescansoStatusAdmin turno=\{turno\} \/>/g, "<DescansoStatusAdmin turno={turno} onViewPhoto={setPhotoViewerUrl} />");

// 7. Add Modal at the end of return
const modalJSX = `
      {/* PHOTO VIEWER MODAL */}
      <Modal visible={!!photoViewerUrl} transparent animationType="fade" onRequestClose={() => setPhotoViewerUrl(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={{ position: 'absolute', top: 40, right: 20, padding: 15, zIndex: 10 }} onPress={() => setPhotoViewerUrl(null)}>
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          {photoViewerUrl && (
            <Image source={{ uri: photoViewerUrl.startsWith('http') ? photoViewerUrl : \`\${api.defaults.baseURL?.replace('/api', '')}\${photoViewerUrl}\` }} style={{ width: '90%', height: '80%', resizeMode: 'contain' }} />
          )}
        </View>
      </Modal>
    </SafeAreaView>
`;
f = f.replace(/<\/SafeAreaView>/, modalJSX.trim());

fs.writeFileSync(path, f);
console.log("Done");
