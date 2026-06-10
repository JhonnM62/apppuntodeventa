import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Text } from '../../components/ui/text';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTurnoActivo, registrarEntrada, registrarSalida, Turno } from '../../services/nomina.service';
import { useCustomAlert } from '../../context/CustomAlertContext';
let ImagePicker: any;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {
  console.warn('expo-image-picker no está disponible de forma nativa aún');
}

let Location: any;
try {
  Location = require('expo-location');
} catch (e) {
  console.warn('expo-location no está disponible de forma nativa aún');
}

export default function CheckInScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { showAlert } = useCustomAlert();
  const [loading, setLoading] = useState(true);
  const [turnoActivo, setTurnoActivo] = useState<Turno | null>(null);
  
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitud: number, longitud: number } | null>(null);
  const [ceno, setCeno] = useState<boolean | null>(null); // Only used when checking out
  const [gettingLocation, setGettingLocation] = useState(false);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTurno();
  }, []);

  const loadTurno = async () => {
    try {
      setLoading(true);
      const res = await getTurnoActivo();
      setTurnoActivo(res.data);
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudo cargar el estado del turno' });
    } finally {
      setLoading(false);
    }
  };

  const takePhoto = async () => {
    if (!ImagePicker) {
      return showAlert({ type: 'error', title: 'Módulo no disponible', message: 'La cámara requiere una recompilación de la app para funcionar.' });
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      return showAlert({ type: 'error', title: 'Permiso Denegado', message: 'Se necesita acceso a la cámara para el registro facial' });
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.5,
        cameraType: ImagePicker.CameraType.front,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setFotoUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error Cámara', message: 'Hubo un problema al usar la cámara.' });
    }
  };

  const getLocation = async () => {
    if (!Location) {
      showAlert({ type: 'error', title: 'Módulo no disponible', message: 'El GPS requiere una recompilación de la app para funcionar.' });
      return null;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return showAlert({ type: 'error', title: 'Permiso Denegado', message: 'Se necesita ubicación para el check-in' });
    }

    setGettingLocation(true);
    try {
      // Intentamos con precisión alta
      let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation({
        latitud: loc.coords.latitude,
        longitud: loc.coords.longitude
      });
      return { latitud: loc.coords.latitude, longitud: loc.coords.longitude };
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error GPS', message: 'No se pudo obtener la ubicación actual. Verifica que el GPS esté activo.' });
      return null;
    } finally {
      setGettingLocation(false);
    }
  };

  const handleAction = async () => {
    if (!fotoUri) {
      return showAlert({ type: 'error', title: 'Foto Requerida', message: 'Debes tomarte una foto para registrar tu asistencia (tanto al iniciar como al finalizar el turno).' });
    }

    if (turnoActivo && ceno === null) {
      return showAlert({ type: 'error', title: 'Falta Información', message: 'Debes indicar si cenaste o consumiste alimentos' });
    }

    setSaving(true);
    try {
      const currentLoc = location || await getLocation();
      
      if (!turnoActivo) {
        // INICIO TURNO
        await registrarEntrada({
          latitud: currentLoc?.latitud,
          longitud: currentLoc?.longitud,
          fotoUri: fotoUri || undefined
        });
        showAlert({ type: 'success', title: 'Éxito', message: 'Turno iniciado correctamente' });
      } else {
        // FIN TURNO
        const res = await registrarSalida(turnoActivo.IDturno, {
          latitud: currentLoc?.latitud,
          longitud: currentLoc?.longitud,
          ceno: ceno!,
          fotoUri: fotoUri
        });
        
        if (res?.alertaGeocerca) {
          showAlert({ type: 'warning', title: 'Atención: Ubicación', message: res.alertaGeocerca });
        } else {
          showAlert({ type: 'success', title: 'Éxito', message: 'Turno finalizado correctamente' });
        }
      }
      
      setFotoUri(null);
      setCeno(null);
      loadTurno();
    } catch (error: any) {
      console.error(error);
      const msg = error?.response?.data?.message || 'Hubo un error procesando la solicitud';
      showAlert({ type: 'error', title: 'Error', message: Array.isArray(msg) ? msg[0] : msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Registro de Asistencia</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 180 }}>
          <Card style={styles.statusCard}>
            <View style={styles.statusIconContainer}>
              <Ionicons 
                name={turnoActivo ? "briefcase" : "moon"} 
                size={40} 
                color={turnoActivo ? "#4CAF50" : "#6b7280"} 
              />
            </View>
            <Text style={styles.statusTitle}>
              {turnoActivo ? '¡Estás en turno!' : 'No estás en turno'}
            </Text>
            {turnoActivo && (
              <Text style={styles.statusSubtitle}>
                Hora de entrada: {turnoActivo.horaEntrada}
              </Text>
            )}
          </Card>

          <View style={styles.actionSection}>
            <Text style={styles.sectionTitle}>PASO 1: FOTO OBLIGATORIA</Text>
            <Text style={styles.instruction}>Obligatorio para iniciar y cerrar turno. Muestra tu rostro claramente.</Text>
            
            <TouchableOpacity style={styles.photoBox} onPress={takePhoto}>
              {fotoUri ? (
                <Image source={{ uri: fotoUri }} style={styles.photoImage} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera" size={32} color="#9ca3af" />
                  <Text style={{ marginTop: 8, color: '#6b7280' }}>Tocar para tomar foto</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={{ marginTop: 24 }} />
            <Text style={styles.sectionTitle}>PASO 2: UBICACIÓN</Text>
            <TouchableOpacity 
              style={[styles.locationBtn, (saving || gettingLocation) && { opacity: 0.7 }]} 
              onPress={getLocation} 
              disabled={saving || gettingLocation}
            >
              {gettingLocation ? (
                <ActivityIndicator size="small" color="#3b82f6" />
              ) : (
                <Ionicons name="location" size={20} color="#3b82f6" />
              )}
              <Text style={{ color: '#3b82f6', marginLeft: 8, fontWeight: '600' }}>
                {location ? `Ubicación: ${location.latitud.toFixed(5)}, ${location.longitud.toFixed(5)}` : 'Obtener ubicación actual'}
              </Text>
            </TouchableOpacity>

            {turnoActivo && (
              <>
                <View style={{ marginTop: 24 }} />
                <Text style={styles.sectionTitle}>PASO 3: CONSUMO ALIMENTOS</Text>
                <Text style={styles.instruction}>¿Cenaste o consumiste alimentos del negocio durante tu turno?</Text>
                <View style={styles.cenoContainer}>
                  <TouchableOpacity 
                    style={[styles.cenoBtn, ceno === true && styles.cenoBtnActive]} 
                    onPress={() => setCeno(true)}
                  >
                    <Text style={[styles.cenoText, ceno === true && styles.cenoTextActive]}>SÍ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.cenoBtn, ceno === false && styles.cenoBtnActiveError]} 
                    onPress={() => setCeno(false)}
                  >
                    <Text style={[styles.cenoText, ceno === false && styles.cenoTextActive]}>NO</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <TouchableOpacity 
              style={[
                styles.mainActionBtn, 
                { backgroundColor: turnoActivo ? '#ef4444' : '#4CAF50' },
                (!fotoUri || !location || (turnoActivo && ceno === null)) && { opacity: 0.5 },
                { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }
              ]} 
              onPress={handleAction} 
              disabled={!fotoUri || !location || (turnoActivo ? ceno === null : false) || saving}
            >
              {saving && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />}
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', includeFontPadding: false }}>
                {turnoActivo ? 'FINALIZAR TURNO' : 'INICIAR TURNO'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn: { padding: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  content: { padding: 16 },
  statusCard: { alignItems: 'center', padding: 24, marginBottom: 24, borderRadius: 16 },
  statusIconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  statusTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 4 },
  statusSubtitle: { fontSize: 14, color: '#4b5563' },
  
  actionSection: { backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 4 },
  instruction: { fontSize: 12, color: '#6b7280', marginBottom: 12 },
  
  photoBox: { width: '100%', aspectRatio: 4/3, borderRadius: 12, overflow: 'hidden', backgroundColor: '#f9fafb', borderWidth: 2, borderColor: '#e5e7eb', borderStyle: 'dashed' },
  photoImage: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  locationBtn: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  
  cenoContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  cenoBtn: { flex: 1, paddingVertical: 12, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, alignItems: 'center', marginHorizontal: 4 },
  cenoBtnActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  cenoBtnActiveError: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  cenoText: { fontSize: 16, fontWeight: '700', color: '#374151' },
  cenoTextActive: { color: '#fff' },
  
  mainActionBtn: { marginTop: 32, paddingVertical: 16, borderRadius: 12 }
});
