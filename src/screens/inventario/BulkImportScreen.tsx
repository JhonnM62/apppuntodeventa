import React, { useState } from 'react';
import { View, TouchableOpacity, Text as RNText, StyleSheet, ScrollView, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Text } from '../../components/ui/text';
import { insumosService, CreateInsumoDto } from '../../services/insumos';

type BulkResult = {
  exitosos: any[];
  fallidos: { nombre: string; error: string }[];
};

type ParsedRow = {
  nombre: string;
  categoria?: string;
  cantidad?: number;
  precio?: number;
  observaciones: string;
  valido: boolean;
};

const BulkImportScreen = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BulkResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [pickingFile, setPickingFile] = useState(false);

  const [formData, setFormData] = useState({
    csvText: '',
    categoria: '',
    cantidad: '',
    precio: '',
  });

  const handlePickFile = async () => {
    setPickingFile(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        setPickingFile(false);
        return;
      }

      const file = result.assets[0];
      const content = await FileSystem.readAsStringAsync(file.uri);
      
      if (!content.trim()) {
        Alert.alert('Error', 'El archivo está vacío');
        setPickingFile(false);
        return;
      }

      setFormData(p => ({ ...p, csvText: content }));
      const parsed = parseCSV(content);
      setParsedData(parsed);
      
      if (parsed.length > 0) {
        const validCount = parsed.filter(p => p.valido).length;
        Alert.alert('Archivo cargado', `Se encontraron ${parsed.length} filas. ${validCount} válidas.`);
      }
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo leer el archivo: ' + (error?.message || 'Error desconocido'));
    } finally {
      setPickingFile(false);
    }
  };

  const parseCSV = (text: string): ParsedRow[] => {
    const lines = text.split('\n').filter(line => line.trim());
    const rows: ParsedRow[] = [];

    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      const nombre = parts[0] || '';
      const categoria = parts[1] || formData.categoria;
      const cantidad = parts[2] ? parseInt(parts[2]) : (formData.cantidad ? parseInt(formData.cantidad) : 0);
      const precio = parts[3] ? parseFloat(parts[3]) : (formData.precio ? parseFloat(formData.precio) : 0);

      rows.push({
        nombre,
        categoria,
        cantidad: isNaN(cantidad) ? 0 : cantidad,
        precio: isNaN(precio) ? 0 : precio,
        observaciones: '',
        valido: nombre.length > 0,
      });
    }

    return rows;
  };

  const handlePreview = () => {
    if (!formData.csvText.trim()) {
      Alert.alert('Error', 'Ingresa datos para previsualizar');
      return;
    }

    const parsed = parseCSV(formData.csvText);
    setParsedData(parsed);
    Alert.alert('Preview', `Se encontraron ${parsed.length} filas. ${parsed.filter(p => p.valido).length} válidas.`);
  };

  const handleImport = async () => {
    const validRows = parsedData.filter(r => r.valido);

    if (validRows.length === 0) {
      Alert.alert('Error', 'No hay filas válidas para importar');
      return;
    }

    const insumos: CreateInsumoDto[] = validRows.map(row => ({
      nombre: row.nombre,
      categoria: row.categoria || formData.categoria || undefined,
      cantidad: row.cantidad || (formData.cantidad ? parseInt(formData.cantidad) : 0),
      precio: row.precio || (formData.precio ? parseFloat(formData.precio) : 0),
      disponible: 'Si',
    }));

    setLoading(true);
    try {
      const response = await insumosService.bulkCreate(insumos);
      setResults(response.data);
      setShowResults(true);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Error al importar insumos');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ csvText: '', categoria: '', cantidad: '', precio: '' });
    setParsedData([]);
    setResults(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <RNText style={styles.headerTitle}>Importación Masiva</RNText>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="file-delimited" size={24} color="#3b82f6" />
          <RNText style={styles.infoText}>
            Ingresa los datos en formato CSV (una línea por insumo):{'\n'}
            <RNText style={styles.infoExample}>nombre,categoría,cantidad,precio</RNText>{'\n\n'}
            O simplemente nombres, uno por línea.
          </RNText>
        </View>

        <TouchableOpacity 
          style={[styles.filePickerBtn, pickingFile && styles.filePickerBtnDisabled]} 
          onPress={handlePickFile}
          disabled={pickingFile}
        >
          {pickingFile ? (
            <ActivityIndicator size="small" color="#3b82f6" />
          ) : (
            <Ionicons name="folder-open" size={22} color="#3b82f6" />
          )}
          <RNText style={styles.filePickerBtnText}>
            {pickingFile ? 'Cargando...' : 'Seleccionar archivo CSV/TXT'}
          </RNText>
        </TouchableOpacity>

        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <RNText style={styles.dividerText}>o ingresa manualmente</RNText>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.inputGroup}>
          <RNText style={styles.inputLabel}>Datos CSV *</RNText>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={"Leche descremada,Lácteos,100,2500\nHarina de trigo,Granos,50,1800\nAzúcar blanca,Granos,200,1200"}
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            value={formData.csvText}
            onChangeText={(t) => {
              setFormData(p => ({ ...p, csvText: t }));
              setParsedData([]);
            }}
          />
        </View>

        <TouchableOpacity style={styles.previewBtn} onPress={handlePreview}>
          <Ionicons name="eye" size={20} color="#3b82f6" />
          <RNText style={styles.previewBtnText}>Previsualizar</RNText>
        </TouchableOpacity>

        {parsedData.length > 0 && (
          <View style={styles.previewSection}>
            <RNText style={styles.previewTitle}>Previsualización ({parsedData.length} filas)</RNText>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={styles.previewHeader}>
                  <RNText style={[styles.previewCell, styles.previewCellHeader, { width: 150 }]}>Nombre</RNText>
                  <RNText style={[styles.previewCell, styles.previewCellHeader, { width: 100 }]}>Categoría</RNText>
                  <RNText style={[styles.previewCell, styles.previewCellHeader, { width: 80 }]}>Cantidad</RNText>
                  <RNText style={[styles.previewCell, styles.previewCellHeader, { width: 80 }]}>Precio</RNText>
                </View>
                {parsedData.slice(0, 10).map((row, index) => (
                  <View key={index} style={[styles.previewRow, !row.valido && styles.previewRowInvalid]}>
                    <RNText style={[styles.previewCell, { width: 150 }]} numberOfLines={1}>{row.nombre}</RNText>
                    <RNText style={[styles.previewCell, { width: 100 }]} numberOfLines={1}>{row.categoria || '-'}</RNText>
                    <RNText style={[styles.previewCell, { width: 80 }]}>{row.cantidad}</RNText>
                    <RNText style={[styles.previewCell, { width: 80 }]}>{row.precio}</RNText>
                  </View>
                ))}
              </View>
            </ScrollView>
            {parsedData.length > 10 && (
              <RNText style={styles.previewMore}>...y {parsedData.length - 10} más</RNText>
            )}
          </View>
        )}

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
            <RNText style={styles.inputLabel}>Categoría</RNText>
            <TextInput
              style={styles.input}
              placeholder="Todas las filas"
              placeholderTextColor="#9ca3af"
              value={formData.categoria}
              onChangeText={(t) => setFormData(p => ({ ...p, categoria: t }))}
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <RNText style={styles.inputLabel}>Cantidad por defecto</RNText>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              value={formData.cantidad}
              onChangeText={(t) => setFormData(p => ({ ...p, cantidad: t }))}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <RNText style={styles.inputLabel}>Precio por defecto</RNText>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
            value={formData.precio}
            onChangeText={(t) => setFormData(p => ({ ...p, precio: t }))}
          />
        </View>

        <TouchableOpacity
          style={[styles.importBtn, (parsedData.length === 0 || loading) && styles.importBtnDisabled]}
          onPress={handleImport}
          disabled={parsedData.length === 0 || loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload" size={22} color="#fff" />
              <RNText style={styles.importBtnText}>Importar {parsedData.filter(r => r.valido).length} Insumos</RNText>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.resetBtn} onPress={resetForm}>
          <RNText style={styles.resetBtnText}>Limpiar Todo</RNText>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={showResults && results !== null} animationType="slide" onRequestClose={() => setShowResults(false)} presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <RNText style={styles.modalTitle}>Resultados</RNText>
            <TouchableOpacity onPress={() => { setShowResults(false); resetForm(); }} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll}>
            <View style={styles.resultSummary}>
              <View style={[styles.resultCard, { backgroundColor: '#22c55e20' }]}>
                <RNText style={[styles.resultValue, { color: '#22c55e' }]}>{results?.exitosos.length || 0}</RNText>
                <RNText style={styles.resultLabel}>Exitosos</RNText>
              </View>
              <View style={[styles.resultCard, { backgroundColor: '#ef444420' }]}>
                <RNText style={[styles.resultValue, { color: '#ef4444' }]}>{results?.fallidos.length || 0}</RNText>
                <RNText style={styles.resultLabel}>Fallidos</RNText>
              </View>
            </View>

            {results?.exitosos.length ? (
              <View style={styles.resultSection}>
                <RNText style={styles.resultSectionTitle}>Creados</RNText>
                {results.exitosos.map((item: any, index: number) => (
                  <View key={index} style={styles.resultItem}>
                    <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                    <RNText style={styles.resultItemText}>{item.Nombre}</RNText>
                  </View>
                ))}
              </View>
            ) : null}

            {results?.fallidos.length ? (
              <View style={styles.resultSection}>
                <RNText style={styles.resultSectionTitle}>Errores</RNText>
                {results.fallidos.map((item: any, index: number) => (
                  <View key={index} style={styles.resultItem}>
                    <Ionicons name="close-circle" size={20} color="#ef4444" />
                    <View style={styles.resultItemError}>
                      <RNText style={styles.resultItemText}>{item.nombre}</RNText>
                      <RNText style={styles.resultItemErrorText}>{item.error}</RNText>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  content: { flex: 1, padding: 20 },
  infoBox: { flexDirection: 'row', backgroundColor: '#3b82f610', borderRadius: 12, padding: 14, alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: 13, color: '#3b82f6', marginLeft: 10, lineHeight: 20 },
  infoExample: { fontFamily: 'monospace', fontSize: 12 },
  filePickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, marginTop: 16, borderWidth: 2, borderColor: '#3b82f6', borderStyle: 'dashed' },
  filePickerBtnDisabled: { borderColor: '#9ca3af', backgroundColor: '#f9fafb' },
  filePickerBtnText: { color: '#3b82f6', fontWeight: '600', fontSize: 15, marginLeft: 10 },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#d1d5db' },
  dividerText: { color: '#9ca3af', fontSize: 12, marginHorizontal: 12 },
  inputGroup: { marginTop: 20 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb' },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  row: { flexDirection: 'row' },
  previewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginTop: 16 },
  previewBtnText: { color: '#3b82f6', fontWeight: '600', fontSize: 15, marginLeft: 8 },
  previewSection: { marginTop: 20, backgroundColor: '#fff', borderRadius: 12, padding: 14 },
  previewTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 12 },
  previewHeader: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 8, paddingVertical: 8 },
  previewRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  previewRowInvalid: { backgroundColor: '#fef2f2' },
  previewCell: { fontSize: 13, color: '#374151', paddingHorizontal: 4 },
  previewCellHeader: { fontWeight: '700', color: '#6b7280' },
  previewMore: { fontSize: 12, color: '#6b7280', marginTop: 8, textAlign: 'center' },
  importBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4CAF50', borderRadius: 12, paddingVertical: 16, marginTop: 24 },
  importBtnDisabled: { backgroundColor: '#9ca3af' },
  importBtnText: { color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 8 },
  resetBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 12 },
  resetBtnText: { color: '#6b7280', fontWeight: '600', fontSize: 15 },
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  modalScroll: { flex: 1, padding: 20 },
  resultSummary: { flexDirection: 'row', marginBottom: 24 },
  resultCard: { flex: 1, borderRadius: 12, padding: 16, alignItems: 'center', marginRight: 12 },
  resultValue: { fontSize: 32, fontWeight: '800' },
  resultLabel: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  resultSection: { marginTop: 16 },
  resultSectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 },
  resultItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  resultItemText: { fontSize: 14, color: '#111827', marginLeft: 10, flex: 1 },
  resultItemError: { flex: 1, marginLeft: 10 },
  resultItemErrorText: { fontSize: 12, color: '#ef4444', marginTop: 2 },
});

export default BulkImportScreen;