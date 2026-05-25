import React, { useState, useEffect } from 'react';
import { View, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Keyboard, ActivityIndicator, ScrollView, Image as RNImage, Text, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

// Fallback seguro para expo-image
let ImageComponent: any = RNImage;
try {
  const ExpoImageModule = require('expo-image');
  if (ExpoImageModule && ExpoImageModule.Image) {
    ImageComponent = ExpoImageModule.Image;
  }
} catch (error) {
  console.log('expo-image native module no encontrado');
}

import { extractDataWithIA, getConfiguracionIA } from '../../services/api';
import { uploadGastoImage } from '../../services/gastos';
import { useGastosStore } from '../../store/useGastosStore';
import { useNavigation } from '@react-navigation/native';
import { useCustomAlert } from '../../context/CustomAlertContext';

let ImagePicker: any = null;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {
  console.log('expo-image-picker no disponible');
}

type TicketItem = {
  id: string;
  uri: string;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  error?: string;
  concepto: string;
  valor: string;
  tipo: 'NEGOCIO' | 'PERSONAL';
  medioDePago: string;
};

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function GastosBulkModal({ visible, onClose }: Props) {
  const { addBulkGastos } = useGastosStore();
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [iaConfigured, setIaConfigured] = useState<boolean | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  
  const navigation = useNavigation<any>();
  const { showAlert } = useCustomAlert();

  useEffect(() => {
    if (visible) {
      checkIaConfig();
      setTickets([]);
    }
  }, [visible]);

  const checkIaConfig = async () => {
    try {
      const res = await getConfiguracionIA();
      const data = res.data || res;
      setIaConfigured(data && data.isActive && data.apiKey ? true : false);
    } catch (error) {
      setIaConfigured(false);
    }
  };

  const pickImages = async (useCamera: boolean) => {
    if (!ImagePicker) {
      showAlert({ type: 'error', title: 'Módulo Faltante', message: 'La cámara/galería no está disponible.' });
      return;
    }
    
    if (iaConfigured === false) {
      showAlert({
        type: 'confirm',
        title: 'Inteligencia Artificial Inactiva',
        message: 'La IA no está configurada o está apagada. Configura Gemini en Configuraciones.',
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

    try {
      let result;
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return;
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.5,
        });
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) return;
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.5,
          allowsMultipleSelection: true,
          selectionLimit: 10,
        });
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newTickets: TicketItem[] = result.assets.map((asset: any) => ({
          id: Math.random().toString(36).substring(7),
          uri: asset.uri,
          status: 'pending',
          concepto: '',
          valor: '',
          tipo: 'NEGOCIO',
          medioDePago: 'Efectivo',
        }));
        
        setTickets(prev => [...prev, ...newTickets]);
        
        // Start processing immediately in background
        processTicketsWithIA(newTickets);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const processTicketsWithIA = async (ticketsToProcess: TicketItem[]) => {
    // Process all tickets in parallel
    await Promise.all(ticketsToProcess.map(async (ticket) => {
      try {
        updateTicketStatus(ticket.id, 'analyzing');

        const formData = new FormData();
        const type = 'image/jpeg';
        formData.append('file', {
          uri: ticket.uri,
          name: 'receipt.jpg',
          type,
        } as any);
        formData.append('context', 'gastos');

        const response = await extractDataWithIA(formData);
        const data = response.data || response;

        if (data) {
          setTickets(prev => prev.map(t => {
            if (t.id === ticket.id) {
              return {
                ...t,
                status: 'done',
                concepto: data.concepto || '',
                valor: data.valor ? data.valor.toString() : '',
                tipo: (data.tipo === 'NEGOCIO' || data.tipo === 'PERSONAL') ? data.tipo : 'NEGOCIO',
                medioDePago: data.medioDePago || 'Efectivo',
              };
            }
            return t;
          }));
        } else {
          throw new Error('Sin datos');
        }
      } catch (error: any) {
        updateTicketStatus(ticket.id, 'error', error.message || 'Error al analizar');
      }
    }));
  };

  const updateTicketStatus = (id: string, status: TicketItem['status'], error?: string) => {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status, error } : t));
  };

  const updateTicketField = (id: string, field: keyof TicketItem, value: any) => {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const handleSaveAll = async () => {
    const validTickets = tickets.filter(t => t.concepto.trim() !== '' && t.valor !== '');
    if (validTickets.length === 0) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'No hay gastos válidos para guardar' });
      return;
    }

    setLoading(true);
    try {
      // 1. Upload all images
      const uploadPromises = validTickets.map(async (t) => {
        let fotoUrl = undefined;
        try {
          if (t.uri && !t.uri.startsWith('http')) {
            fotoUrl = await uploadGastoImage(t.uri);
          }
        } catch (e) {
          console.error('Error uploading image', e);
        }
        return {
          tipo: t.tipo,
          concepto: t.concepto,
          valor: Number(t.valor),
          medioDePago: t.medioDePago,
          fotos: fotoUrl,
        };
      });

      const payload = await Promise.all(uploadPromises);

      // 2. Send bulk to API
      await addBulkGastos(payload);
      
      onClose();
      Toast.show({ type: 'success', text1: 'Éxito', text2: `${payload.length} gastos creados masivamente` });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message || 'Error al guardar los gastos' });
    } finally {
      setLoading(false);
    }
  };

  const formatValor = (text: string, id: string) => {
    const cleanText = text.replace(/[^0-9]/g, '');
    updateTicketField(id, 'valor', cleanText);
  };

  const totalMonto = tickets.reduce((sum, t) => sum + (Number(t.valor) || 0), 0);
  const isAllDoneOrError = tickets.every(t => t.status === 'done' || t.status === 'error');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f3f4f6' }}>
        {/* Header */}
        <View className="flex-row justify-between items-center bg-white p-4 border-b border-gray-200">
          <View>
            <Text className="text-xl font-bold text-gray-800">Carga Masiva IA</Text>
            <Text className="text-sm text-gray-500">Analiza múltiples recibos a la vez</Text>
          </View>
          <TouchableOpacity onPress={onClose} className="p-2 bg-gray-100 rounded-full">
            <Ionicons name="close" size={24} color="#4b5563" />
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <View className="flex-row p-4 space-x-3 bg-white">
          <TouchableOpacity 
            className="flex-1 flex-row items-center justify-center bg-indigo-50 border border-indigo-200 p-3 rounded-xl"
            onPress={() => pickImages(true)}
          >
            <Ionicons name="camera" size={20} color="#4f46e5" />
            <Text className="ml-2 font-bold text-indigo-700">Cámara</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            className="flex-1 flex-row items-center justify-center bg-indigo-50 border border-indigo-200 p-3 rounded-xl"
            onPress={() => pickImages(false)}
          >
            <Ionicons name="images" size={20} color="#4f46e5" />
            <Text className="ml-2 font-bold text-indigo-700">Galería</Text>
          </TouchableOpacity>
        </View>

        {/* List of Tickets */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
            {tickets.length === 0 ? (
              <View className="items-center justify-center py-20">
                <Ionicons name="receipt-outline" size={64} color="#d1d5db" />
                <Text className="text-gray-400 mt-4 text-center">Toma fotos de tus recibos{'\n'}para que la IA los analice.</Text>
              </View>
            ) : (
              tickets.map((ticket, index) => (
                <View key={ticket.id} className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
                  <View className="flex-row justify-between items-center mb-3">
                    <Text className="font-bold text-gray-500 text-xs">Ticket #{index + 1}</Text>
                    <TouchableOpacity onPress={() => setTickets(prev => prev.filter(t => t.id !== ticket.id))}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>

                  <View className="flex-row">
                    <TouchableOpacity onPress={() => setFullScreenImage(ticket.uri)} className="mr-3">
                      <ImageComponent source={{ uri: ticket.uri }} style={{ width: 80, height: 110, borderRadius: 8, backgroundColor: '#f3f4f6' }} />
                      
                      {ticket.status === 'analyzing' && (
                        <View className="absolute inset-0 bg-black/40 rounded-lg items-center justify-center">
                          <ActivityIndicator color="white" />
                        </View>
                      )}
                      {ticket.status === 'done' && (
                        <View className="absolute -top-2 -right-2 bg-green-500 rounded-full p-1 border-2 border-white">
                          <Ionicons name="checkmark" size={14} color="white" />
                        </View>
                      )}
                      {ticket.status === 'error' && (
                        <View className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 border-2 border-white">
                          <Ionicons name="warning" size={14} color="white" />
                        </View>
                      )}
                    </TouchableOpacity>

                    <View className="flex-1">
                      <TextInput
                        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 mb-2 font-bold"
                        placeholder="Concepto"
                        value={ticket.concepto}
                        onChangeText={(v) => updateTicketField(ticket.id, 'concepto', v)}
                      />
                      
                      <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-2">
                        <Text className="text-gray-500 mr-1 font-bold">$</Text>
                        <TextInput
                          className="flex-1 text-sm text-gray-800 font-bold"
                          placeholder="Monto"
                          value={ticket.valor ? new Intl.NumberFormat('es-CO').format(Number(ticket.valor)) : ''}
                          onChangeText={(v) => formatValor(v, ticket.id)}
                          keyboardType="numeric"
                        />
                      </View>

                      <View className="flex-row justify-between">
                        <TouchableOpacity 
                          className={`flex-1 py-1.5 items-center rounded-md border mr-1 ${ticket.tipo === 'NEGOCIO' ? 'bg-blue-100 border-blue-200' : 'bg-gray-50 border-gray-200'}`}
                          onPress={() => updateTicketField(ticket.id, 'tipo', 'NEGOCIO')}
                        >
                          <Text className={`text-xs font-bold ${ticket.tipo === 'NEGOCIO' ? 'text-blue-700' : 'text-gray-500'}`}>Negocio</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          className={`flex-1 py-1.5 items-center rounded-md border ml-1 ${ticket.tipo === 'PERSONAL' ? 'bg-purple-100 border-purple-200' : 'bg-gray-50 border-gray-200'}`}
                          onPress={() => updateTicketField(ticket.id, 'tipo', 'PERSONAL')}
                        >
                          <Text className={`text-xs font-bold ${ticket.tipo === 'PERSONAL' ? 'text-purple-700' : 'text-gray-500'}`}>Personal</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  {ticket.status === 'error' && (
                    <Text className="text-red-500 text-xs mt-2 italic">{ticket.error}</Text>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Footer actions */}
        {tickets.length > 0 && (
          <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 pb-8 shadow-lg">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-gray-500 font-bold">Total a guardar:</Text>
              <Text className="text-xl font-bold text-gray-800">${new Intl.NumberFormat('es-CO').format(totalMonto)}</Text>
            </View>
            <TouchableOpacity
              className={`py-4 rounded-xl items-center flex-row justify-center ${isAllDoneOrError && !loading ? 'bg-green-600' : 'bg-gray-400'}`}
              disabled={!isAllDoneOrError || loading}
              onPress={handleSaveAll}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={20} color="white" />
                  <Text className="text-white font-bold ml-2">Guardar {tickets.length} Gastos</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>

      {/* Image Preview Modal */}
      <Modal visible={!!fullScreenImage} transparent animationType="fade" onRequestClose={() => setFullScreenImage(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <SafeAreaView style={{ flex: 1 }}>
            <View className="flex-row justify-end p-4">
              <TouchableOpacity onPress={() => setFullScreenImage(null)} className="bg-white/20 p-2 rounded-full">
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }} maximumZoomScale={5} minimumZoomScale={1}>
              {fullScreenImage && <ImageComponent source={{ uri: fullScreenImage }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </Modal>
  );
}
