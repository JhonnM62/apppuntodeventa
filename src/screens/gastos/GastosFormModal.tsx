import React, { useState, useEffect, useRef } from 'react';
import { View, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Keyboard, ActivityIndicator, ScrollView, Image as RNImage, Animated } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/ui/text';

// Fallback seguro para expo-image
let ImageComponent: any = RNImage;
try {
  const ExpoImageModule = require('expo-image');
  if (ExpoImageModule && ExpoImageModule.Image) {
    ImageComponent = ExpoImageModule.Image;
  }
} catch (error) {
  console.log('expo-image native module no encontrado, usando Image de react-native como fallback');
}
import { Gasto, uploadGastoImage } from '../../services/gastos';
import { extractDataWithIA, getConfiguracionIA } from '../../services/api';
import { useGastosStore } from '../../store/useGastosStore';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../../../App';
import { useNavigation } from '@react-navigation/native';
import { useCustomAlert } from '../../context/CustomAlertContext';

// Carga dinámica de módulos nativos para evitar crasheos si no están en el Dev Client
let ImagePicker: any = null;
let DocumentPicker: any = null;
let FileSystem: any = null;

try {
  ImagePicker = require('expo-image-picker');
} catch (e) {
  console.log('expo-image-picker no está disponible en este Dev Client');
}

try {
  DocumentPicker = require('expo-document-picker');
} catch (e) {
  console.log('expo-document-picker no está disponible en este Dev Client');
}

try {
  FileSystem = require('expo-file-system');
} catch (e) {
  console.log('expo-file-system no está disponible en este Dev Client');
}

interface Props {
  visible: boolean;
  onClose: () => void;
  gastoToEdit?: Gasto | null;
}

export default function GastosFormModal({ visible, onClose, gastoToEdit }: Props) {
  const { addGasto, editGasto } = useGastosStore();
  const [tipo, setTipo] = useState<'NEGOCIO' | 'PERSONAL'>('NEGOCIO');
  const [concepto, setConcepto] = useState('');
  const [valor, setValor] = useState('');
  const [medioDePago, setMedioDePago] = useState('Efectivo');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [iaConfigured, setIaConfigured] = useState<boolean | null>(null);
  
  // Animación IA
  const [isScanningIA, setIsScanningIA] = useState(false);
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  const navigation = useNavigation<any>();
  const { showAlert } = useCustomAlert();

  useEffect(() => {
    if (visible) {
      checkIaConfig();
      if (gastoToEdit) {
        setTipo(gastoToEdit.tipo);
        setConcepto(gastoToEdit.concepto);
        setValor(gastoToEdit.valor ? gastoToEdit.valor.toString() : '');
        setMedioDePago(gastoToEdit.medioDePago || 'Efectivo');
        setFotoUri(gastoToEdit.fotos || null);
      } else {
        setTipo('NEGOCIO');
        setConcepto('');
        setValor('');
        setMedioDePago('Efectivo');
        setFotoUri(null);
      }
    }
  }, [visible, gastoToEdit]);

  const checkIaConfig = async () => {
    try {
      const res = await getConfiguracionIA();
      const data = res.data || res;
      setIaConfigured(data && data.isActive && data.apiKey ? true : false);
    } catch (error) {
      setIaConfigured(false);
    }
  };

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const formatValor = (text: string) => {
    const cleanText = text.replace(/[^0-9]/g, '');
    setValor(cleanText);
  };

  const handleSave = async () => {
    if (!concepto.trim()) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'El concepto es obligatorio' });
      return;
    }
    if (!valor) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'El monto es obligatorio' });
      return;
    }

    setLoading(true);
    try {
      let finalFotoUrl = fotoUri;
      if (fotoUri && !fotoUri.startsWith('http') && !fotoUri.startsWith('/uploads')) {
        try {
          const uploadedUrl = await uploadGastoImage(fotoUri);
          if (uploadedUrl) {
            finalFotoUrl = uploadedUrl;
          }
        } catch (uploadError) {
          console.error('[GastosFormModal] Error subiendo imagen:', uploadError);
          Toast.show({ type: 'info', text1: 'Aviso', text2: 'Se guardará el gasto, pero falló la subida de la imagen.' });
        }
      }

      const payload: Partial<Gasto> = {
        tipo,
        concepto,
        valor: Number(valor),
        medioDePago,
        fotos: finalFotoUrl || undefined,
      };

      if (gastoToEdit) {
        await editGasto(gastoToEdit.IDgastos, payload);
      } else {
        await addGasto(payload);
      }
      onClose();
      Toast.show({ type: 'success', text1: gastoToEdit ? 'Actualizado' : 'Creado', text2: gastoToEdit ? 'Gasto modificado correctamente' : 'Gasto registrado correctamente' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message || 'No se pudo guardar el gasto' });
    } finally {
      setLoading(false);
    }
  };

  const startScanningAnimation = () => {
    setIsScanningIA(true);
    scanLineAnim.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopScanningAnimation = () => {
    setIsScanningIA(false);
    scanLineAnim.stopAnimation();
  };

  const pickImage = async (useCamera: boolean, scanWithIA: boolean = false) => {
    if (!ImagePicker) {
      showAlert({ type: 'error', title: 'Módulo Faltante', message: 'La cámara/galería no está disponible. Debes recompilar la app (eas build).' });
      return;
    }
    
    try {
      let result;
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          showAlert({ type: 'warning', title: 'Permiso denegado', message: 'Se requiere acceso a la cámara' });
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.5,
        });
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          showAlert({ type: 'warning', title: 'Permiso denegado', message: 'Se requiere acceso a la galería' });
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.5,
        });
      }

      if (!result.canceled && result.assets[0].uri) {
        const uri = result.assets[0].uri;
        setFotoUri(uri);

        if (scanWithIA) {
          setIsScanningIA(true);
          Toast.show({ type: 'info', text1: '✨ Analizando con IA', text2: 'Extrayendo datos mágicamente...', toastVisibilityTime: 4000 });
          processImageWithIA(uri).finally(() => setIsScanningIA(false));
        }
      }
    } catch (error) {
      console.log(error);
    }
  };

  const handleIAScanPress = () => {
    if (iaConfigured === false) {
      showAlert({
        type: 'confirm',
        title: 'Inteligencia Artificial Inactiva',
        message: 'La IA no está configurada o está apagada. Por favor, configura tu API Key de Gemini en el módulo de Configuraciones.',
        confirmText: 'Ir a Configurar',
        cancelText: 'Cancelar',
        onConfirm: () => {
          onClose();
          navigation.navigate('ConfiguracionNegocio');
        },
        onCancel: () => {}
      });
      return;
    }

    setShowAttachmentOptions(false);
    pickImage(true, true);
  };

  const processImageWithIA = async (uri: string) => {
    try {
      startScanningAnimation();

      const formData = new FormData();
      const filename = uri.split('/').pop() || 'receipt.jpg';

      // Comprimir imagen antes de enviar si existe ImageManipulator
      let processedUri = uri;
      try {
        const ImageManipulator = require('expo-image-manipulator');
        if (ImageManipulator) {
          const manipResult = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 1024 } }],
            { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
          );
          processedUri = manipResult.uri;
        }
      } catch (manipErr) {
        console.log('ImageManipulator no disponible, usando imagen original:', manipErr);
      }

      const match = /\.(\w+)$/.exec(filename);
      const type = 'image/jpeg';

      formData.append('file', {
        uri: processedUri,
        name: 'receipt.jpg',
        type,
      } as any);
      formData.append('context', 'gastos');

      const response = await extractDataWithIA(formData);
      const data = response.data || response; // manejar si hay interceptor

      if (data) {
        if (data.concepto) setConcepto(data.concepto);
        if (data.valor) setValor(data.valor.toString());
        if (data.tipo && (data.tipo === 'NEGOCIO' || data.tipo === 'PERSONAL')) setTipo(data.tipo);
        if (data.medioDePago) setMedioDePago(data.medioDePago);

        Toast.show({ type: 'success', text1: '¡Magia completada!', text2: 'El recibo ha sido procesado.' });
      }
    } catch (error: any) {
      console.error('[IA Extract Error]', error);
      Toast.show({ type: 'error', text1: 'Oops...', text2: error?.response?.data?.message || error?.message || 'No se pudo leer el recibo.' });
    } finally {
      stopScanningAnimation();
    }
  };

  const pickDocument = async () => {
    if (!DocumentPicker || !FileSystem) {
      showAlert({ type: 'error', title: 'Módulo Faltante', message: 'La carga de documentos no está disponible. Debes recompilar la app (eas build).' });
      return;
    }
    
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        setFotoUri(result.assets[0].uri);
        Toast.show({ type: 'success', text1: 'Archivo cargado', text2: result.assets[0].name });
      }
    } catch (error) {
      console.log(error);
    }
  };

  const handleAttachment = () => {
    setShowAttachmentOptions(true);
  };

  const [showAttachmentOptions, setShowAttachmentOptions] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        activeOpacity={1}
        onPress={onClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ 
            width: '100%', 
            maxHeight: '90%', 
            paddingBottom: Platform.OS === 'android' ? keyboardHeight : 0 
          }}
        >
          <View
            style={{
              backgroundColor: 'white',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              flexShrink: 1,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.1,
              shadowRadius: 10,
              elevation: 10,
            }}
          >
            {/* Header Fijo */}
            <View className="flex-row justify-between items-center p-5 pb-2">
              <Text className="text-xl font-bold text-gray-800">
                {gastoToEdit ? 'Editar Gasto' : 'Nuevo Gasto'}
              </Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={28} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={{ padding: 20, flexGrow: 1, paddingBottom: 32 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <TouchableOpacity activeOpacity={1}>
                {/* Switch Tipo */}
                <View className="flex-row bg-gray-100 rounded-lg p-1 mb-5">
                  <TouchableOpacity
                    className={`flex-1 py-2 rounded-md items-center ${tipo === 'NEGOCIO' ? 'bg-blue-500 shadow-sm' : ''}`}
                    onPress={() => setTipo('NEGOCIO')}
                  >
                    <Text className={`font-bold ${tipo === 'NEGOCIO' ? 'text-white' : 'text-gray-500'}`}>Negocio</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className={`flex-1 py-2 rounded-md items-center ${tipo === 'PERSONAL' ? 'bg-purple-500 shadow-sm' : ''}`}
                    onPress={() => setTipo('PERSONAL')}
                  >
                    <Text className={`font-bold ${tipo === 'PERSONAL' ? 'text-white' : 'text-gray-500'}`}>Personal</Text>
                  </TouchableOpacity>
                </View>

                {/* Concepto */}
                <View className="mb-4">
                  <Text className="text-sm font-bold text-gray-600 mb-1 ml-1">Concepto</Text>
                  <TextInput
                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-800"
                    placeholder="Ej. Pago de arriendo, Almuerzo..."
                    value={concepto}
                    onChangeText={setConcepto}
                  />
                </View>

                {/* Valor */}
                <View className="mb-4">
                  <Text className="text-sm font-bold text-gray-600 mb-1 ml-1">Monto</Text>
                  <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                    <Text className="text-lg font-bold text-gray-500 mr-2">$</Text>
                    <TextInput
                      className="flex-1 text-lg text-gray-800 font-bold"
                      placeholder="0"
                      value={valor ? new Intl.NumberFormat('es-CO').format(Number(valor)) : ''}
                      onChangeText={formatValor}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* Medio de Pago y Adjunto */}
                <View className="flex-row mb-6">
                  <View className="flex-1 mr-2">
                    <Text className="text-sm font-bold text-gray-600 mb-1 ml-1">Medio de Pago</Text>
                    <View className="flex-row border border-gray-200 rounded-xl overflow-hidden">
                      <TouchableOpacity
                        className={`flex-1 py-3 items-center ${medioDePago === 'Efectivo' ? 'bg-green-100' : 'bg-gray-50'}`}
                        onPress={() => setMedioDePago('Efectivo')}
                      >
                        <Text className={`text-sm font-bold ${medioDePago === 'Efectivo' ? 'text-green-600' : 'text-gray-500'}`}>Efectivo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        className={`flex-1 py-3 items-center ${medioDePago === 'Transferencia' ? 'bg-green-100' : 'bg-gray-50'}`}
                        onPress={() => setMedioDePago('Transferencia')}
                      >
                        <Text className={`text-sm font-bold ${medioDePago === 'Transferencia' ? 'text-green-600' : 'text-gray-500'}`}>Transf.</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View className="w-1/3">
                    <Text className="text-sm font-bold text-gray-600 mb-1 ml-1">Soporte</Text>
                    <TouchableOpacity
                      className="bg-gray-50 border border-gray-200 rounded-xl py-3 items-center justify-center flex-row"
                      onPress={handleAttachment}
                    >
                      <Ionicons name={fotoUri ? "image" : "camera"} size={20} color={fotoUri ? "#10b981" : "#6b7280"} />
                      <Text className={`ml-1 text-sm font-bold ${fotoUri ? 'text-green-500' : 'text-gray-500'}`}>
                        {fotoUri ? 'Cambiar' : 'Adjuntar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Boton Escanear con IA */}
                {!gastoToEdit && !fotoUri && (
                  <TouchableOpacity
                    className="bg-indigo-50 border border-indigo-200 rounded-xl py-3 items-center justify-center flex-row mb-6 shadow-sm"
                    onPress={handleIAScanPress}
                  >
                    <Ionicons name="sparkles" size={20} color="#4f46e5" />
                    <Text className="ml-2 text-sm font-bold text-indigo-700">
                      Autocompletar con IA (Cámara)
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Vista Previa de Imagen */}
                {fotoUri && (
                  <View className="mb-6 items-center">
                    <TouchableOpacity 
                      activeOpacity={0.9} 
                      onPress={() => setIsFullScreen(true)}
                      className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 p-2 w-full items-center"
                    >
                      <ImageComponent 
                        source={{ uri: fotoUri }}
                        style={{ width: '100%', height: 180, borderRadius: 8 }} 
                      />
                      
                      {/* Animación de Escaneo IA */}
                      {isScanningIA && (
                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'hidden' }}>
                          <Animated.View
                            style={{
                              position: 'absolute',
                              left: 0,
                              right: 0,
                              height: 4,
                              backgroundColor: '#10b981',
                              shadowColor: '#10b981',
                              shadowOffset: { width: 0, height: 0 },
                              shadowOpacity: 1,
                              shadowRadius: 10,
                              elevation: 5,
                              transform: [{
                                translateY: scanLineAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0, 180]
                                })
                              }]
                            }}
                          />
                          <View style={{ position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center' }}>
                            <Text style={{ color: 'white', fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 }}>
                              Analizando con IA...
                            </Text>
                          </View>
                        </View>
                      )}

                      <View className="absolute bottom-4 right-4 bg-black/50 rounded-full p-2">
                        <Ionicons name="expand" size={16} color="white" />
                      </View>
                      <TouchableOpacity 
                        className="absolute top-3 right-3 bg-white rounded-full p-1.5 shadow-sm border border-gray-100"
                        onPress={() => setFotoUri(null)}
                        disabled={isScanningIA}
                      >
                        <Ionicons name="trash-outline" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Botón Guardar */}
                <TouchableOpacity
                  className="bg-green-600 rounded-xl py-4 items-center justify-center shadow-sm flex-row"
                  onPress={handleSave}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={22} color="white" />
                      <Text className="text-white font-bold text-lg ml-2">Guardar Gasto</Text>
                    </>
                  )}
                </TouchableOpacity>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </TouchableOpacity>

      {/* Modal de Opciones de Adjunto (UI-UX Pro Max) */}
      <Modal visible={showAttachmentOptions} transparent animationType="slide" onRequestClose={() => setShowAttachmentOptions(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setShowAttachmentOptions(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              backgroundColor: 'white',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: Platform.OS === 'ios' ? 40 : 24,
            }}
          >
            <View className="flex-row justify-between items-center mb-6">
              <View>
                <Text className="text-xl font-bold text-gray-800">Adjuntar Soporte</Text>
                <Text className="text-sm text-gray-500 mt-1">Selecciona el origen del archivo</Text>
              </View>
              <TouchableOpacity 
                onPress={() => setShowAttachmentOptions(false)}
                className="bg-gray-100 p-2 rounded-full"
              >
                <Ionicons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View className="flex-row justify-between mb-2">
              <TouchableOpacity 
                className="flex-1 items-center bg-gray-50 rounded-2xl py-4 mx-1 border border-gray-100"
                onPress={() => { setShowAttachmentOptions(false); setTimeout(() => pickImage(true), 300); }}
              >
                <View className="bg-blue-100 p-3 rounded-full mb-2">
                  <Ionicons name="camera" size={28} color="#3b82f6" />
                </View>
                <Text className="font-bold text-gray-700">Cámara</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                className="flex-1 items-center bg-gray-50 rounded-2xl py-4 mx-1 border border-gray-100"
                onPress={() => { setShowAttachmentOptions(false); setTimeout(() => pickImage(false), 300); }}
              >
                <View className="bg-purple-100 p-3 rounded-full mb-2">
                  <Ionicons name="images" size={28} color="#a855f7" />
                </View>
                <Text className="font-bold text-gray-700">Galería</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                className="flex-1 items-center bg-gray-50 rounded-2xl py-4 mx-1 border border-gray-100"
                onPress={() => { setShowAttachmentOptions(false); setTimeout(() => pickDocument(), 300); }}
              >
                <View className="bg-orange-100 p-3 rounded-full mb-2">
                  <Ionicons name="document-text" size={28} color="#f97316" />
                </View>
                <Text className="font-bold text-gray-700">Archivo</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modal Pantalla Completa y Zoom */}
      <Modal visible={isFullScreen} transparent animationType="fade" onRequestClose={() => setIsFullScreen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <SafeAreaView style={{ flex: 1 }}>
            <View className="flex-row justify-between items-center p-4">
              <Text className="text-white font-bold text-lg">Comprobante</Text>
              <TouchableOpacity 
                onPress={() => setIsFullScreen(false)}
                className="bg-white/20 p-2 rounded-full"
              >
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>
            <ScrollView 
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}
              maximumZoomScale={5}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              {fotoUri && (
                <ImageComponent 
                  source={{ uri: fotoUri }}
                  style={{ width: '100%', height: '100%' }} 
                  contentFit="contain"
                  resizeMode="contain" 
                  transition={200}
                />
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      <Toast config={toastConfig} />
    </Modal>
  );
}

