import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, ScrollView, Platform, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import Toast from 'react-native-toast-message';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getConfiguracion, updateConfiguracion } from '../../services/configuracion';
import { getConfiguracionIA, updateConfiguracionIA } from '../../services/api';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ConfiguracionNegocio'>;
};

export default function ConfiguracionNegocioScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [horaCorteDia, setHoraCorteDia] = useState('00:00');
  
  // Estados para IA
  const [iaConfig, setIaConfig] = useState({
    apiKey: '',
    modeloDefecto: 'gemini-1.5-flash',
    temperatura: '0.4',
    maxTokens: '2048',
    isActive: true
  });
  
  // Para el Time Picker
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  // Helper para mostrar la hora en formato 12h AM/PM
  const format12Hour = (time24: string) => {
    if (!time24) return '';
    const [h, m] = time24.split(':');
    let hours = parseInt(h, 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // la hora '0' debe ser '12'
    return `${hours.toString().padStart(2, '0')}:${m} ${ampm}`;
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const [resNegocio, resIA] = await Promise.all([
        getConfiguracion(),
        getConfiguracionIA()
      ]);

      const dataNegocio = resNegocio.data ? resNegocio.data : resNegocio;
      if (dataNegocio && dataNegocio.horaCorteDia) {
        setHoraCorteDia(dataNegocio.horaCorteDia);
        const [h, m] = dataNegocio.horaCorteDia.split(':');
        const d = new Date();
        d.setHours(parseInt(h, 10), parseInt(m, 10), 0);
        setTempDate(d);
      }

      const dataIA = resIA.data ? resIA.data : resIA;
      if (dataIA) {
        setIaConfig({
          apiKey: dataIA.apiKey || '',
          modeloDefecto: dataIA.modeloDefecto || 'gemini-1.5-flash',
          temperatura: (dataIA.temperatura ?? 0.4).toString(),
          maxTokens: (dataIA.maxTokens ?? 2048).toString(),
          isActive: dataIA.isActive ?? true
        });
      }
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cargar la configuración' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await Promise.all([
        updateConfiguracion({ horaCorteDia }),
        updateConfiguracionIA({
          apiKey: iaConfig.apiKey,
          modeloDefecto: iaConfig.modeloDefecto,
          temperatura: parseFloat(iaConfig.temperatura),
          maxTokens: parseInt(iaConfig.maxTokens, 10),
          isActive: iaConfig.isActive
        })
      ]);
      Toast.show({ type: 'success', text1: 'Éxito', text2: 'Configuración guardada correctamente' });
      navigation.goBack();
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: error?.response?.data?.message || 'Error al guardar la configuración' });
    } finally {
      setSaving(false);
    }
  };

  const onChangeTime = (event: any, selectedDate?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setTempDate(selectedDate);
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      setHoraCorteDia(`${hours}:${minutes}`);
    }
  };

  const openTimePicker = () => {
    setShowTimePicker(true);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configuración del Sistema</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ padding: 20 }}>
        
        {/* NEGOCIO */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="briefcase-outline" size={20} /> Negocio
          </Text>
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color="#3b82f6" />
            <Text style={styles.infoText}>
              La Hora de Corte define en qué momento termina el "Día Comercial".
            </Text>
          </View>

          <Text style={styles.label}>Hora de Corte del Día</Text>
          <TouchableOpacity style={styles.timePickerButton} onPress={openTimePicker}>
            <Ionicons name="time-outline" size={24} color="#4f46e5" style={{ marginRight: 10 }} />
            <Text style={styles.timePickerText}>{format12Hour(horaCorteDia)}</Text>
          </TouchableOpacity>

          {showTimePicker && (
            <DateTimePicker
              value={tempDate}
              mode="time"
              is24Hour={false}
              display="default"
              onChange={onChangeTime}
            />
          )}
        </View>

        {/* INTELIGENCIA ARTIFICIAL */}
        <View style={[styles.card, { marginTop: 20 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="sparkles-outline" size={20} /> Inteligencia Artificial
            </Text>
            <Switch
              value={iaConfig.isActive}
              onValueChange={(val) => setIaConfig({...iaConfig, isActive: val})}
              trackColor={{ false: '#d1d5db', true: '#c7d2fe' }}
              thumbColor={iaConfig.isActive ? '#4f46e5' : '#f3f4f6'}
            />
          </View>
          
          <Text style={styles.label}>API Key (Gemini)</Text>
          <TextInput
            style={styles.input}
            value={iaConfig.apiKey}
            onChangeText={(text) => setIaConfig({...iaConfig, apiKey: text})}
            placeholder="AIzaSy..."
            secureTextEntry={true}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Modelo</Text>
          <View style={styles.modelButtons}>
            {['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-3-flash-preview'].map((modelo) => (
              <TouchableOpacity
                key={modelo}
                style={[styles.modelBtn, iaConfig.modeloDefecto === modelo && styles.modelBtnActive]}
                onPress={() => setIaConfig({...iaConfig, modeloDefecto: modelo})}
              >
                <Text style={[styles.modelBtnText, iaConfig.modeloDefecto === modelo && styles.modelBtnTextActive]}>
                  {modelo.replace('gemini-', '')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Temperatura</Text>
              <TextInput
                style={styles.input}
                value={iaConfig.temperatura}
                onChangeText={(text) => setIaConfig({...iaConfig, temperatura: text.replace(/[^0-9.]/g, '')})}
                keyboardType="numeric"
                placeholder="0.4"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Max Tokens</Text>
              <TextInput
                style={styles.input}
                value={iaConfig.maxTokens}
                onChangeText={(text) => setIaConfig({...iaConfig, maxTokens: text.replace(/[^0-9]/g, '')})}
                keyboardType="numeric"
                placeholder="2048"
              />
            </View>
          </View>

        </View>

      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 85, 85) }]}>
        <TouchableOpacity 
          style={[styles.saveButton, saving && { opacity: 0.7 }]} 
          onPress={handleSave} 
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.saveButtonText}>Guardar Configuración</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: { padding: 8, marginRight: 8 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  content: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937', marginBottom: 12 },
  infoCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe'
  },
  infoText: { flex: 1, marginLeft: 12, fontSize: 13, color: '#1e40af', lineHeight: 18 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 8 },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#111827',
  },
  timePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c7d2fe'
  },
  timePickerText: { fontSize: 24, fontWeight: 'bold', color: '#4f46e5' },
  modelButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  modelBtnActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  modelBtnText: { fontSize: 13, color: '#4b5563', fontWeight: '500' },
  modelBtnTextActive: { color: '#ffffff' },
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  saveButton: {
    backgroundColor: '#4f46e5',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 12,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});