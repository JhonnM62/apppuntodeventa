import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, ScrollView, Platform, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import Toast from 'react-native-toast-message';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getConfiguracion, updateConfiguracion, getConfiguracionWhatsapp, updateConfiguracionWhatsapp } from '../../services/configuracion';
import { getConfiguracionIA, updateConfiguracionIA } from '../../services/api';

let Location: any;
try {
  Location = require('expo-location');
} catch (e) {
  console.warn('expo-location no está disponible de forma nativa aún');
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ConfiguracionNegocio'>;
};

export default function ConfiguracionNegocioScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [horaCorteDia, setHoraCorteDia] = useState('00:00');
  const [modoOperacion, setModoOperacion] = useState('GENERAL');
  
  // Datos comerciales
  const [nombreComercial, setNombreComercial] = useState('Q HUBO MOR');
  const [nit, setNit] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [latitudNegocio, setLatitudNegocio] = useState('');
  const [longitudNegocio, setLongitudNegocio] = useState('');
  const [radioGeocercaM, setRadioGeocercaM] = useState('100');
  const [minutosGraciaLlegadaTarde, setMinutosGraciaLlegadaTarde] = useState('5');
  
  // Estados para IA
  const [iaConfig, setIaConfig] = useState({
    apiKey: '',
    modeloDefecto: 'gemini-3.5-flash',
    temperatura: '0.4',
    maxTokens: '2048',
    isActive: true,
    usarRazonamiento: false
  });

  // Estados para Whatsapp
  const [whatsappConfig, setWhatsappConfig] = useState({
    enabled: false,
    urlBase: '',
    sessionId: '',
    token: '',
    receiver: '',
    isGroup: false,
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
      const [resNegocio, resIA, resWhatsapp] = await Promise.all([
        getConfiguracion(),
        getConfiguracionIA(),
        getConfiguracionWhatsapp()
      ]);

      const dataNegocio = resNegocio.data ? resNegocio.data : resNegocio;
      if (dataNegocio) {
        if (dataNegocio.horaCorteDia) {
          setHoraCorteDia(dataNegocio.horaCorteDia);
          const [h, m] = dataNegocio.horaCorteDia.split(':');
          const d = new Date();
          d.setHours(parseInt(h, 10), parseInt(m, 10), 0);
          setTempDate(d);
        }
        if (dataNegocio.modoOperacion) {
          setModoOperacion(dataNegocio.modoOperacion);
        }
        if (dataNegocio.nombreComercial) setNombreComercial(dataNegocio.nombreComercial);
        if (dataNegocio.nit) setNit(dataNegocio.nit);
        if (dataNegocio.direccion) setDireccion(dataNegocio.direccion);
        if (dataNegocio.telefono) setTelefono(dataNegocio.telefono);
        if (dataNegocio.latitudNegocio !== null && dataNegocio.latitudNegocio !== undefined) setLatitudNegocio(String(dataNegocio.latitudNegocio));
        if (dataNegocio.longitudNegocio !== null && dataNegocio.longitudNegocio !== undefined) setLongitudNegocio(String(dataNegocio.longitudNegocio));
        if (dataNegocio.radioGeocercaM !== null && dataNegocio.radioGeocercaM !== undefined) setRadioGeocercaM(String(dataNegocio.radioGeocercaM));
        if (dataNegocio.minutosGraciaLlegadaTarde !== null && dataNegocio.minutosGraciaLlegadaTarde !== undefined) setMinutosGraciaLlegadaTarde(String(dataNegocio.minutosGraciaLlegadaTarde));
      }

      const dataIA = resIA.data ? resIA.data : resIA;
      if (dataIA) {
        setIaConfig({
          apiKey: dataIA.apiKey || '',
          modeloDefecto: dataIA.modeloDefecto || 'gemini-3.5-flash',
          temperatura: (dataIA.temperatura ?? 0.4).toString(),
          maxTokens: (dataIA.maxTokens ?? 2048).toString(),
          isActive: dataIA.isActive ?? true,
          usarRazonamiento: dataIA.usarRazonamiento ?? false
        });
      }

      const dataWhatsapp = resWhatsapp.data ? resWhatsapp.data : resWhatsapp;
      if (dataWhatsapp) {
        setWhatsappConfig({
          enabled: dataWhatsapp.enabled ?? false,
          urlBase: dataWhatsapp.urlBase || '',
          sessionId: dataWhatsapp.sessionId || '',
          token: dataWhatsapp.token || '',
          receiver: dataWhatsapp.receiver || '',
          isGroup: dataWhatsapp.isGroup ?? false,
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
        updateConfiguracion({ 
          horaCorteDia, modoOperacion, nombreComercial, nit, direccion, telefono,
          latitudNegocio: latitudNegocio ? parseFloat(latitudNegocio) : undefined,
          longitudNegocio: longitudNegocio ? parseFloat(longitudNegocio) : undefined,
          radioGeocercaM: radioGeocercaM ? parseInt(radioGeocercaM, 10) : 100,
          minutosGraciaLlegadaTarde: minutosGraciaLlegadaTarde ? parseInt(minutosGraciaLlegadaTarde, 10) : 5
        } as any),
        updateConfiguracionIA({
          apiKey: iaConfig.apiKey,
          modeloDefecto: iaConfig.modeloDefecto,
          temperatura: parseFloat(iaConfig.temperatura) || 0.4,
          maxTokens: parseInt(iaConfig.maxTokens, 10) || 2048,
          isActive: iaConfig.isActive,
          usarRazonamiento: iaConfig.usarRazonamiento
        }),
        updateConfiguracionWhatsapp({
          enabled: whatsappConfig.enabled,
          urlBase: whatsappConfig.urlBase,
          sessionId: whatsappConfig.sessionId,
          token: whatsappConfig.token,
          receiver: whatsappConfig.receiver,
          isGroup: whatsappConfig.isGroup,
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

  const getLocation = async () => {
    if (!Location) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Módulo de ubicación no disponible' });
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return Toast.show({ type: 'error', text1: 'Error', text2: 'Permiso de ubicación denegado' });
    }
    try {
      const loc = await Location.getCurrentPositionAsync({});
      setLatitudNegocio(String(loc.coords.latitude));
      setLongitudNegocio(String(loc.coords.longitude));
      Toast.show({ type: 'success', text1: 'Ubicación obtenida', text2: 'Coordenadas actualizadas' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo obtener la ubicación' });
    }
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
              La Hora de Corte define en qué momento termina el "Día Comercial". Los datos comerciales se imprimirán en la cabecera de las facturas (estilo remisión).
            </Text>
          </View>

          <Text style={styles.label}>Nombre Comercial</Text>
          <TextInput
            style={styles.input}
            value={nombreComercial}
            onChangeText={setNombreComercial}
            placeholder="Ej. Q HUBO MOR"
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>NIT / RUT</Text>
              <TextInput
                style={styles.input}
                value={nit}
                onChangeText={setNit}
                placeholder="Ej. 901234567-8"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                style={styles.input}
                value={telefono}
                onChangeText={setTelefono}
                keyboardType="phone-pad"
                placeholder="Ej. 300 123 4567"
              />
            </View>
          </View>

          <Text style={styles.label}>Dirección</Text>
          <TextInput
            style={styles.input}
            value={direccion}
            onChangeText={setDireccion}
            placeholder="Ej. Calle 123 #45-67"
          />

          <Text style={[styles.label, { marginTop: 20 }]}>Hora de Corte del Día</Text>
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

          <Text style={[styles.label, { marginTop: 20 }]}>Modo de Operación</Text>
          <View style={styles.modelButtons}>
            <TouchableOpacity
              style={[styles.modelBtn, { flex: 1, alignItems: 'center' }, modoOperacion === 'GENERAL' && styles.modelBtnActive]}
              onPress={() => setModoOperacion('GENERAL')}
            >
              <Ionicons name="storefront-outline" size={20} color={modoOperacion === 'GENERAL' ? '#fff' : '#4b5563'} style={{ marginBottom: 4 }} />
              <Text style={[styles.modelBtnText, modoOperacion === 'GENERAL' && styles.modelBtnTextActive]}>
                General
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.modelBtn, { flex: 1, alignItems: 'center' }, modoOperacion === 'RESTAURANTE' && styles.modelBtnActive]}
              onPress={() => setModoOperacion('RESTAURANTE')}
            >
              <Ionicons name="restaurant-outline" size={20} color={modoOperacion === 'RESTAURANTE' ? '#fff' : '#4b5563'} style={{ marginBottom: 4 }} />
              <Text style={[styles.modelBtnText, modoOperacion === 'RESTAURANTE' && styles.modelBtnTextActive]}>
                Restaurante
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
            El modo Restaurante habilita el control de insumos por plato en los reportes de caja.
          </Text>
        </View>

        {/* GEOCERCA NÓMINA */}
        <View style={[styles.card, { marginTop: 20, borderColor: '#fef08a', borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={[styles.iaIconContainer, { backgroundColor: '#fef9c3' }]}>
              <Ionicons name="location" size={20} color="#ca8a04" />
            </View>
            <Text style={[styles.sectionTitleIA, { color: '#ca8a04' }]}>
              Geocerca de Nómina
            </Text>
          </View>
          
          <View style={[styles.infoCardIA, { backgroundColor: '#fefce8' }]}>
            <Ionicons name="information-circle" size={24} color="#ca8a04" />
            <Text style={[styles.infoTextIA, { color: '#a16207' }]}>
              Configura las coordenadas del negocio para validar que los empleados estén en el sitio al momento de registrar su asistencia (Check-In / Check-Out).
            </Text>
          </View>

          <TouchableOpacity style={[styles.timePickerButton, { backgroundColor: '#fef9c3', borderColor: '#fde047', marginBottom: 16 }]} onPress={getLocation}>
            <Ionicons name="locate" size={24} color="#ca8a04" style={{ marginRight: 10 }} />
            <Text style={[styles.timePickerText, { color: '#ca8a04', fontSize: 16 }]}>Fijar con mi ubicación actual</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Latitud</Text>
              <TextInput
                style={styles.input}
                value={latitudNegocio}
                onChangeText={setLatitudNegocio}
                placeholder="Ej. 6.2442"
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Longitud</Text>
              <TextInput
                style={styles.input}
                value={longitudNegocio}
                onChangeText={setLongitudNegocio}
                placeholder="Ej. -75.5812"
                keyboardType="numeric"
              />
            </View>
          </View>
          
          <Text style={[styles.label, { marginTop: 12 }]}>Radio de tolerancia (Metros)</Text>
          <TextInput
            style={styles.input}
            value={radioGeocercaM}
            onChangeText={(text) => setRadioGeocercaM(text.replace(/[^0-9]/g, ''))}
            placeholder="Ej. 100"
            keyboardType="numeric"
          />

          <Text style={[styles.label, { marginTop: 12 }]}>Minutos de gracia para llegadas tarde</Text>
          <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
            Tiempo límite (en minutos) después de la hora de entrada antes de generar descuento.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity 
              style={[styles.timeBtn, { marginRight: 8 }]}
              onPress={() => setMinutosGraciaLlegadaTarde(String(Math.max(0, parseInt(minutosGraciaLlegadaTarde || '0', 10) - 1)))}
            >
              <Ionicons name="remove" size={20} color="#374151" />
            </TouchableOpacity>
            <TextInput
              style={[styles.input, { flex: 1, textAlign: 'center', marginBottom: 0 }]}
              value={minutosGraciaLlegadaTarde}
              onChangeText={(text) => setMinutosGraciaLlegadaTarde(text.replace(/[^0-9]/g, ''))}
              placeholder="Ej. 5"
              keyboardType="numeric"
            />
            <TouchableOpacity 
              style={[styles.timeBtn, { marginLeft: 8 }]}
              onPress={() => setMinutosGraciaLlegadaTarde(String(parseInt(minutosGraciaLlegadaTarde || '0', 10) + 1))}
            >
              <Ionicons name="add" size={20} color="#374151" />
            </TouchableOpacity>
          </View>
        </View>

        {/* INTELIGENCIA ARTIFICIAL */}
        <View style={[styles.card, { marginTop: 20, borderColor: '#e0e7ff', borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.iaIconContainer}>
                <Ionicons name="sparkles" size={20} color="#4f46e5" />
              </View>
              <Text style={styles.sectionTitleIA}>
                Inteligencia Artificial
              </Text>
            </View>
            <Switch
              value={iaConfig.isActive}
              onValueChange={(val) => setIaConfig({...iaConfig, isActive: val})}
              trackColor={{ false: '#d1d5db', true: '#c7d2fe' }}
              thumbColor={iaConfig.isActive ? '#4f46e5' : '#f3f4f6'}
            />
          </View>
          
          <View style={styles.infoCardIA}>
            <Ionicons name="bulb" size={24} color="#4f46e5" />
            <Text style={styles.infoTextIA}>
              Activa la IA para autocompletar formularios leyendo fotos de recibos o facturas automáticamente usando Gemini.
            </Text>
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

          <Text style={styles.label}>Modelo de Visión</Text>
          <View style={styles.modelButtons}>
            {['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview'].map((modelo) => (
              <TouchableOpacity
                key={modelo}
                style={[styles.modelBtn, iaConfig.modeloDefecto === modelo && styles.modelBtnActive]}
                onPress={() => setIaConfig({...iaConfig, modeloDefecto: modelo})}
              >
                <Text style={[styles.modelBtnText, iaConfig.modeloDefecto === modelo && styles.modelBtnTextActive]}>
                  {modelo}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={styles.label}>Usar Modelo de Razonamiento</Text>
              <Text style={[styles.infoTextIA, { marginTop: 0, fontSize: 12 }]}>Activa el "Thinking Level" para mayor precisión (aumenta el tiempo de espera a 10-30s).</Text>
            </View>
            <Switch
              value={iaConfig.usarRazonamiento}
              onValueChange={(val) => setIaConfig({...iaConfig, usarRazonamiento: val})}
              trackColor={{ false: '#d1d5db', true: '#c7d2fe' }}
              thumbColor={iaConfig.usarRazonamiento ? '#4f46e5' : '#f3f4f6'}
            />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Creatividad (Temp)</Text>
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

        {/* NOTIFICACIONES WHATSAPP */}
        <View style={[styles.card, { marginTop: 20, borderColor: '#dcfce7', borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.iaIconContainer, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="logo-whatsapp" size={20} color="#16a34a" />
              </View>
              <Text style={[styles.sectionTitleIA, { color: '#16a34a' }]}>
                Notificaciones WhatsApp
              </Text>
            </View>
            <Switch
              value={whatsappConfig.enabled}
              onValueChange={(val) => setWhatsappConfig({...whatsappConfig, enabled: val})}
              trackColor={{ false: '#d1d5db', true: '#bbf7d0' }}
              thumbColor={whatsappConfig.enabled ? '#16a34a' : '#f3f4f6'}
            />
          </View>

          <View style={[styles.infoCardIA, { backgroundColor: '#f0fdf4' }]}>
            <Ionicons name="information-circle" size={24} color="#16a34a" />
            <Text style={[styles.infoTextIA, { color: '#15803d' }]}>
              Activa esta opción para que al generar un reporte de caja, se envíe automáticamente en PDF vía WhatsApp usando la API configurada (Ej. Evolution API).
            </Text>
          </View>

          <Text style={styles.label}>URL Base de la API</Text>
          <TextInput
            style={styles.input}
            value={whatsappConfig.urlBase}
            onChangeText={(text) => setWhatsappConfig({...whatsappConfig, urlBase: text})}
            placeholder="http://192.168.1.100:8080"
            autoCapitalize="none"
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Session ID</Text>
              <TextInput
                style={styles.input}
                value={whatsappConfig.sessionId}
                onChangeText={(text) => setWhatsappConfig({...whatsappConfig, sessionId: text})}
                placeholder="default"
                autoCapitalize="none"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Teléfono Destino</Text>
              <TextInput
                style={styles.input}
                value={whatsappConfig.receiver}
                onChangeText={(text) => setWhatsappConfig({...whatsappConfig, receiver: text.replace(/[^0-9@g.us]/g, '')})}
                keyboardType="default"
                placeholder="573001234567"
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 8 }}>
            <Text style={[styles.label, { flex: 1, marginTop: 0 }]}>¿El destino es un Grupo?</Text>
            <Switch
              value={whatsappConfig.isGroup}
              onValueChange={(val) => setWhatsappConfig({...whatsappConfig, isGroup: val})}
              trackColor={{ false: '#d1d5db', true: '#bbf7d0' }}
              thumbColor={whatsappConfig.isGroup ? '#16a34a' : '#f3f4f6'}
            />
          </View>

          <Text style={styles.label}>Token (x-access-token)</Text>
          <TextInput
            style={styles.input}
            value={whatsappConfig.token}
            onChangeText={(text) => setWhatsappConfig({...whatsappConfig, token: text})}
            placeholder="eyJhbGciOiJIUzI1NiIs..."
            secureTextEntry={true}
            autoCapitalize="none"
          />
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
  infoText: { flex: 1, marginLeft: 12, fontSize: 13, color: '#1e40af', lineHeight: 20 },
  infoCardIA: {
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    marginBottom: 16,
  },
  infoTextIA: { flex: 1, marginLeft: 12, fontSize: 13, color: '#4338ca', lineHeight: 20 },
  iaIconContainer: {
    backgroundColor: '#e0e7ff',
    padding: 8,
    borderRadius: 8,
    marginRight: 10
  },
  sectionTitleIA: { fontSize: 18, fontWeight: 'bold', color: '#4f46e5' },
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
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', marginBottom: 12 },
  timeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  modelButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
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