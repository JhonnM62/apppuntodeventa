import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, ScrollView, TextInput } from 'react-native';
import { Text } from '../../components/ui/text';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTurnoActivo, registrarEntrada, registrarSalida, Turno } from '../../services/nomina.service';
import { getConfiguracion } from '../../services/configuracion';
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

function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function CheckInScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { showAlert } = useCustomAlert();
  const [loading, setLoading] = useState(true);
  const [turnoActivo, setTurnoActivo] = useState<Turno | null>(null);
  
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitud: number, longitud: number } | null>(null);
  const [ceno, setCeno] = useState<boolean | null>(null); // Only used when checking out
  const [observacion, setObservacion] = useState('');
  const [gettingLocation, setGettingLocation] = useState(false);
  
  const [configuracion, setConfiguracion] = useState<any>(null);
  const [distanciaMetros, setDistanciaMetros] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);

  // useEffect inicial eliminado — useFocusEffect ya maneja la carga inicial y los re-focos.

  useFocusEffect(
    useCallback(() => {
      // Limpiar SOLO los campos del formulario (foto, ubicación, ceno).
      // NO limpiamos turnoActivo de inmediato para evitar que la UI parpadee
      // mostrando 'iniciar turno' antes de que la API responda.
      setFotoUri(null);
      setLocation(null);
      setCeno(null);
      setObservacion('');
      setDistanciaMetros(null);
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const [resTurno, resConfig] = await Promise.all([
        getTurnoActivo(),
        getConfiguracion()
      ]);
      setTurnoActivo(resTurno.data);
      setConfiguracion(resConfig.data);
    } catch (error) {
      console.error(error);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudo cargar la información necesaria' });
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
      
      const newLat = loc.coords.latitude;
      const newLon = loc.coords.longitude;
      
      setLocation({
        latitud: newLat,
        longitud: newLon
      });
      
      if (configuracion?.latitudNegocio && configuracion?.longitudNegocio) {
        const dist = calcularDistancia(newLat, newLon, configuracion.latitudNegocio, configuracion.longitudNegocio);
        setDistanciaMetros(dist);
      }
      
      return { latitud: newLat, longitud: newLon };
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

    const radioPermitido = configuracion?.radioGeocercaM || 100;
    const isOutOfBounds = distanciaMetros !== null && distanciaMetros > radioPermitido;

    if (isOutOfBounds && !turnoActivo) {
      return showAlert({ type: 'error', title: 'Estás muy lejos', message: `Estás a ${Math.round(distanciaMetros)}m del negocio. El límite permitido es ${radioPermitido}m. No puedes iniciar tu turno desde aquí.` });
    }

    if (isOutOfBounds && turnoActivo && observacion.length < 10) {
      return showAlert({ type: 'error', title: 'Falta Justificación', message: 'Como estás fuera del límite permitido, debes ingresar una justificación (mínimo 10 caracteres) para cerrar el turno.' });
    }

    setSaving(true);
    try {
      const currentLoc = location || await getLocation();
      
      if (!currentLoc) {
        setSaving(false);
        return;
      }

      // Validar distancia nuevamente en caso de que getLocation se llamara aquí
      if (configuracion?.latitudNegocio && configuracion?.longitudNegocio) {
        const dist = calcularDistancia(currentLoc.latitud, currentLoc.longitud, configuracion.latitudNegocio, configuracion.longitudNegocio);
        if (dist > radioPermitido) {
          setDistanciaMetros(dist);
          
          if (!turnoActivo) {
            setSaving(false);
            return showAlert({ type: 'error', title: 'Estás muy lejos', message: `Estás a ${Math.round(dist)}m del negocio. El límite permitido es ${radioPermitido}m.` });
          } else if (observacion.length < 10) {
            setSaving(false);
            return showAlert({ type: 'error', title: 'Falta Justificación', message: 'Debes ingresar una justificación para cerrar el turno fuera de rango.' });
          }
        }
      }

      if (!turnoActivo) {
        // INICIO TURNO
        await registrarEntrada({
          latitud: currentLoc?.latitud,
          longitud: currentLoc?.longitud,
          fotoUri: fotoUri || undefined,
          observacion: observacion || undefined
        });
        showAlert({ type: 'success', title: 'Éxito', message: 'Turno iniciado correctamente' });
      } else {
        // FIN TURNO
        const res = await registrarSalida(turnoActivo.IDturno, {
          latitud: currentLoc?.latitud,
          longitud: currentLoc?.longitud,
          ceno: ceno!,
          observacion: observacion || undefined,
          fotoUri: fotoUri || undefined
        });
        
        if (res?.alertaGeocerca) {
          showAlert({ type: 'warning', title: 'Atención: Ubicación', message: res.alertaGeocerca });
        } else {
          showAlert({ type: 'success', title: 'Éxito', message: 'Turno finalizado correctamente' });
        }
      }
      
      setFotoUri(null);
      setCeno(null);
      setObservacion('');
      setLocation(null);
      setDistanciaMetros(null);
      
      // En vez de loadTurno, recargamos con loadData para actualizar configuraciones también si hubieran
      loadData();
    } catch (error: any) {
      console.error(error);
      let errorDetail = error.message || String(error);
      if (error?.response?.data) {
        errorDetail = JSON.stringify(error.response.data);
      }
      const msg = error?.response?.data?.message || `Error local: ${errorDetail}`;
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
                Hora de entrada: {new Date(turnoActivo.horaEntrada).toLocaleString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
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

            {distanciaMetros !== null && configuracion?.radioGeocercaM && distanciaMetros > configuracion.radioGeocercaM && (
              <View style={{ backgroundColor: '#fee2e2', padding: 12, borderRadius: 8, marginTop: 12, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="warning" size={24} color="#ef4444" />
                <Text style={{ color: '#b91c1c', marginLeft: 8, flex: 1, fontSize: 13, fontWeight: '500' }}>
                  {turnoActivo 
                    ? `Estás a ${Math.round(distanciaMetros)}m del local. Para poder cerrar el turno desde aquí, es OBLIGATORIO ingresar una justificación detallada a continuación.`
                    : `Estás a ${Math.round(distanciaMetros)}m del local. El límite es ${configuracion.radioGeocercaM}m. No puedes registrar turno desde aquí.`}
                </Text>
              </View>
            )}

            <View style={{ marginTop: 24 }} />
            {distanciaMetros !== null && configuracion?.radioGeocercaM && distanciaMetros > configuracion.radioGeocercaM ? (
              <>
                <Text style={[styles.sectionTitle, { color: '#ef4444' }]}>JUSTIFICACIÓN OBLIGATORIA</Text>
                <Text style={styles.instruction}>
                  Indica por qué estás {turnoActivo ? 'cerrando' : 'iniciando'} el turno fuera del establecimiento (Ej: Emergencia médica, olvido).
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>OBSERVACIÓN / NOTA (Opcional)</Text>
                <Text style={styles.instruction}>Añade algún comentario si lo necesitas (Ej: Olvidé registrar mi turno ayer).</Text>
              </>
            )}
            <TextInput
              style={styles.observacionInput}
              placeholder="Escribe tu comentario o justificación..."
              multiline
              numberOfLines={3}
              value={observacion}
              onChangeText={setObservacion}
              textAlignVertical="top"
            />

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
                (!fotoUri || !location || (turnoActivo && ceno === null) || (!turnoActivo && distanciaMetros !== null && configuracion?.radioGeocercaM && distanciaMetros > configuracion.radioGeocercaM) || (turnoActivo && distanciaMetros !== null && configuracion?.radioGeocercaM && distanciaMetros > configuracion.radioGeocercaM && observacion.length < 10)) && { opacity: 0.5 },
                { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }
              ]} 
              disabled={(!fotoUri || !location || (turnoActivo && ceno === null) || (!turnoActivo && distanciaMetros !== null && configuracion?.radioGeocercaM && distanciaMetros > configuracion.radioGeocercaM) || (turnoActivo && distanciaMetros !== null && configuracion?.radioGeocercaM && distanciaMetros > configuracion.radioGeocercaM && observacion.length < 10) || saving)}
              onPress={handleAction} 
            >
              {saving ? (
                <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
              ) : (
                <Ionicons name={turnoActivo ? "exit-outline" : "log-in-outline"} size={24} color="#fff" style={{ marginRight: 8 }} />
              )}
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
  
  observacionInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, minHeight: 80, fontSize: 15, color: '#111827' },
  
  mainActionBtn: { marginTop: 32, paddingVertical: 16, borderRadius: 12 }
});
