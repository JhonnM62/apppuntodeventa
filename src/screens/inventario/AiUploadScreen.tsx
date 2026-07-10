import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Image, Alert, KeyboardAvoidingView, Platform, Keyboard, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import api, { extractDataWithIA } from '../../services/api';
import { RootStackParamList } from '../../navigation/RootNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'AiUpload'>;
type AiUploadRouteProp = RouteProp<RootStackParamList, 'AiUpload'>;

const AiUploadScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<AiUploadRouteProp>();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'image' | 'text'>('image');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const pickImage = async (useCamera: boolean = false) => {
    try {
      let result;
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara para tomar fotos.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.4,
        });
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permiso denegado', 'Necesitamos acceso a la galería.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.4,
        });
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error al seleccionar imagen:', error);
      Alert.alert('Error', 'No se pudo cargar la imagen.');
    }
  };

  const processImage = async () => {
    if (!imageUri) {
      Alert.alert('Error', 'Debes seleccionar o tomar una foto primero.');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      const filename = imageUri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image`;

      formData.append('file', {
        uri: imageUri,
        name: filename,
        type,
      } as any);
      formData.append('context', 'inventario');

      const response = await extractDataWithIA(formData);

      navigation.replace('AiReview', { extractedData: response.data, type: 'image', targetInventarioId: route.params?.targetInventarioId });
    } catch (error: any) {
      console.error('Error procesando imagen con IA:', error);
      const errorMsg = typeof error === 'string' ? error : (error.response?.data?.message || 'No se pudo procesar la imagen.');
      Alert.alert('Error IA', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const processText = async () => {
    if (!textInput.trim()) {
      Alert.alert('Error', 'Debes pegar el texto (ej. mensaje de WhatsApp) primero.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/ai/extract-text', {
        text: textInput,
        context: 'inventario'
      }, { timeout: 60000 });

      navigation.replace('AiReview', { extractedData: response.data, rawSource: textInput, type: 'text', targetInventarioId: route.params?.targetInventarioId });
    } catch (error: any) {
      console.error('Error procesando texto con IA:', error);
      const errorMsg = typeof error === 'string' ? error : (error.response?.data?.message || 'No se pudo procesar el texto.');
      Alert.alert('Error IA', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, paddingBottom: Platform.OS === 'android' ? keyboardHeight : 0 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
        {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1f2937' }}>Carga Masiva con IA ✨</Text>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: '#ffffff', marginHorizontal: 16, marginTop: 16, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' }}>
        <TouchableOpacity
          style={{ flex: 1, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', backgroundColor: activeTab === 'image' ? '#22c55e' : '#ffffff' }}
          onPress={() => setActiveTab('image')}
        >
          <Ionicons name="camera-outline" size={20} color={activeTab === 'image' ? '#ffffff' : '#4b5563'} />
          <Text style={{ marginLeft: 8, fontWeight: 'bold', color: activeTab === 'image' ? '#ffffff' : '#4b5563' }}>Foto / Factura</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', backgroundColor: activeTab === 'text' ? '#22c55e' : '#ffffff' }}
          onPress={() => setActiveTab('text')}
        >
          <Ionicons name="document-text-outline" size={20} color={activeTab === 'text' ? '#ffffff' : '#4b5563'} />
          <Text style={{ marginLeft: 8, fontWeight: 'bold', color: activeTab === 'text' ? '#ffffff' : '#4b5563' }}>Pegar Texto</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === 'image' ? (
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: '#4b5563', textAlign: 'center', marginBottom: 24, paddingHorizontal: 16, fontSize: 14 }}>
              Toma una foto de la factura o selecciona una imagen de tu galería. La IA extraerá los nombres, cantidades y precios.
            </Text>

            {imageUri ? (
              <View style={{ width: '100%', aspectRatio: 3/4, backgroundColor: '#e5e7eb', borderRadius: 16, overflow: 'hidden', marginBottom: 24, borderWidth: 2, borderColor: '#22c55e' }}>
                <Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                <TouchableOpacity
                  onPress={() => setImageUri(null)}
                  style={{ position: 'absolute', top: 12, right: 12, backgroundColor: '#ef4444', borderRadius: 20, padding: 8 }}
                >
                  <Ionicons name="close" size={20} color="#ffffff" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 2, borderStyle: 'dashed', borderColor: '#d1d5db', borderRadius: 16, padding: 24, alignItems: 'center', marginRight: 8, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 }}
                  onPress={() => pickImage(true)}
                >
                  <Ionicons name="camera" size={48} color="#22c55e" />
                  <Text style={{ color: '#1f2937', fontWeight: 'bold', marginTop: 12, fontSize: 16 }}>Cámara</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 2, borderStyle: 'dashed', borderColor: '#d1d5db', borderRadius: 16, padding: 24, alignItems: 'center', marginLeft: 8, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 }}
                  onPress={() => pickImage(false)}
                >
                  <Ionicons name="images" size={48} color="#3b82f6" />
                  <Text style={{ color: '#1f2937', fontWeight: 'bold', marginTop: 12, fontSize: 16 }}>Galería</Text>
                </TouchableOpacity>
              </View>
            )}

            {imageUri && (
              <TouchableOpacity
                style={{ width: '100%', backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 'auto', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 }}
                onPress={processImage}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 16 }}>Analizar Imagen ✨</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#4b5563', marginBottom: 8, fontWeight: 'bold', fontSize: 14 }}>Pega aquí el mensaje (Ej: WhatsApp):</Text>
            <View style={{ flex: 1, minHeight: 200, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, padding: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 }}>
              <TextInput
                style={{ flex: 1, fontSize: 16, color: '#1f2937' }}
                multiline
                textAlignVertical="top"
                placeholder="Ejemplo: Llegaron 5 libras de tomate chonto a 2000 y 1 paca de vasos a 5000..."
                placeholderTextColor="#9ca3af"
                value={textInput}
                onChangeText={setTextInput}
              />
            </View>
            <TouchableOpacity
              style={{ width: '100%', backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 16, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 }}
              onPress={processText}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 16 }}>Analizar Texto ✨</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      
      {/* Overlay loading state to block interaction */}
      <Modal transparent={true} visible={loading} animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#ffffff', padding: 24, borderRadius: 16, alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }}>
            <ActivityIndicator size="large" color="#22c55e" />
            <Text style={{ color: '#1f2937', fontWeight: 'bold', marginTop: 16, fontSize: 18 }}>Procesando con IA...</Text>
            <Text style={{ color: '#6b7280', marginTop: 8, textAlign: 'center' }}>Esto tomará unos segundos.</Text>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

export default AiUploadScreen;
