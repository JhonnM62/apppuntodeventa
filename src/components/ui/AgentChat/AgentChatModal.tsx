import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Text as RNText, Keyboard, SafeAreaView, Alert, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAgentStore } from '../../../store/useAgentStore';
import ActionConfirmCard from './ActionConfirmCard';
import api from '../../../services/api';
import { Ionicons } from '@expo/vector-icons';

let expoSpeech: any = null;
try {
  expoSpeech = require('expo-speech-recognition');
} catch (e) {
  console.log("expo-speech-recognition native module not found, speech features will be disabled.");
}

function SpeechEvents({ isListening, setIsListening, setInputText }: any) {
  if (!expoSpeech) return null;
  const { useSpeechRecognitionEvent } = expoSpeech;

  useSpeechRecognitionEvent('start', () => setIsListening(true));
  useSpeechRecognitionEvent('end', () => setIsListening(false));
  useSpeechRecognitionEvent('result', (event: any) => {
    if (event.results && event.results.length > 0) {
      const transcript = event.results[0]?.transcript;
      if (transcript) setInputText(transcript);
    }
  });
  useSpeechRecognitionEvent('error', (event: any) => {
    console.error('Speech recognition error:', event.error, event.message);
    setIsListening(false);
  });

  return null;
}

export default function AgentChatModal() {
  const { isOpen, closeChat, messages, isProcessing, setProcessing, addMessage, threadId } = useAgentStore();
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const pickImage = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.warn('Error picking image:', error);
      Alert.alert('Error', 'No se pudo seleccionar la imagen.');
    }
  };

  const toggleListening = async () => {
    try {
      if (!expoSpeech || !expoSpeech.ExpoSpeechRecognitionModule) {
        Alert.alert('Funcionalidad no disponible', 'El dictado por voz requiere compilar e instalar el nuevo APK con los módulos nativos.');
        return;
      }
      const { ExpoSpeechRecognitionModule } = expoSpeech;

      if (isListening) {
        await ExpoSpeechRecognitionModule.stop();
        setIsListening(false);
      } else {
        const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!granted) {
          console.warn('Permiso de micrófono no concedido');
          return;
        }
        setInputText('');
        await ExpoSpeechRecognitionModule.start({ lang: 'es-CO', interimResults: true });
      }
    } catch (error) {
      console.warn('Error al iniciar micrófono:', error);
      Alert.alert('Error', 'No se pudo iniciar el micrófono. Asegúrate de tener la app compilada correctamente.');
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() && !selectedImage) return;
    const userMsg = inputText;
    const imgUri = selectedImage;
    setInputText('');
    setSelectedImage(null);

    if (isListening && expoSpeech && expoSpeech.ExpoSpeechRecognitionModule) {
       await expoSpeech.ExpoSpeechRecognitionModule.stop();
       setIsListening(false);
    }

    addMessage({ id: Date.now().toString(), text: userMsg, sender: 'user', imageUrl: imgUri || undefined });
    setProcessing(true);

    try {
      let response;
      if (imgUri) {
        const formData = new FormData();
        formData.append('threadId', threadId);
        if (userMsg) formData.append('message', userMsg);
        
        const filename = imgUri.split('/').pop() || 'image.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;

        formData.append('image', {
          uri: imgUri,
          name: filename,
          type
        } as any);

        response = await api.post(`/agent/chat`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000
        });
      } else {
        response = await api.post(`/agent/chat`, {
          threadId,
          message: userMsg
        }, {
          timeout: 60000
        });
      }
      
      const res = response.data;
      
      if (res?.success === false) {
        throw new Error(res.details || res.error || 'Error interno del agente');
      }

      const resDataAgent = res?.data || res; // Extraer la data interna de la respuesta de NestJS
      if (resDataAgent?.status === 'completed') {
        addMessage({ id: Date.now().toString(), text: resDataAgent.message, sender: 'agent' });
      } else if (resDataAgent?.status === 'interrupted') {
        addMessage({ 
          id: Date.now().toString(), 
          text: resDataAgent.interruptData.message, 
          sender: 'agent', 
          interruptData: resDataAgent.interruptData 
        });
      }
    } catch (error: any) {
      console.error(error);
      let errorMsg = 'Error desconocido';
      if (typeof error === 'string') {
        errorMsg = error;
      } else if (error?.response?.data?.details) {
        errorMsg = error.response.data.details;
      } else if (error?.response?.data?.message) {
        const msg = error.response.data.message;
        errorMsg = Array.isArray(msg) ? msg.join(', ') : msg;
      } else if (error?.message) {
        errorMsg = error.message;
      }
      
      // Si el error es por timeout, dar un mensaje más amigable
      if (errorMsg.includes('timeout')) {
        errorMsg = 'El agente tardó demasiado en responder. Si tienes el "Modelo de Razonamiento" activo, es normal que tome más tiempo. Por favor, intenta de nuevo.';
      }

      addMessage({ id: Date.now().toString(), text: `⚠️ Hubo un error al ejecutar la tarea:\n\n${errorMsg}`, sender: 'agent' });
    } finally {
      setProcessing(false);
    }
  };

  const [keyboardHeight, setKeyboardHeight] = useState(0);

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

  const cleanMarkdown = (text: string) => {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1') // remove bold asterisks
      .replace(/^\s*\*\s/gm, '• ')     // replace bullet points asterisks
      .replace(/\*(.*?)\*/g, '$1');    // remove italic asterisks
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent>
      <View style={styles.container}>
        <SpeechEvents isListening={isListening} setIsListening={setIsListening} setInputText={setInputText} />
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, paddingBottom: Platform.OS === 'android' ? keyboardHeight : 0 }}
        >
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.header}>
              <RNText style={styles.headerTitle}>Agente IA 🤖</RNText>
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity onPress={() => useAgentStore.getState().clearChat?.()} style={[styles.closeBtn, { marginRight: 16 }]}>
                   <Ionicons name="trash-outline" size={24} color="#ef4444" />
                </TouchableOpacity>
                <TouchableOpacity onPress={closeChat} style={styles.closeBtn}>
                   <Ionicons name="close" size={24} color="#111827" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.chatArea} contentContainerStyle={{ flexGrow: 1, paddingBottom: 32, padding: 16 }}>
              {messages.map((m, i) => (
                <View key={i} style={[styles.messageBubble, m.sender === 'user' ? styles.userBubble : styles.agentBubble]}>
                  {m.imageUrl && <Image source={{ uri: m.imageUrl }} style={{ width: 200, height: 200, borderRadius: 8, marginBottom: m.text ? 8 : 0 }} resizeMode="cover" />}
                  {m.text ? <RNText selectable={true} style={[styles.messageText, m.sender === 'user' ? styles.userText : styles.agentText]}>{cleanMarkdown(m.text)}</RNText> : null}
                  {m.interruptData && (
                    <ActionConfirmCard interruptData={m.interruptData} messageId={m.id} />
                  )}
                </View>
              ))}
              {isProcessing && (
                <View style={[styles.messageBubble, styles.agentBubble, { alignSelf: 'flex-start', paddingHorizontal: 16 }]}>
                  <ActivityIndicator size="small" color="#6366f1" />
                </View>
              )}
            </ScrollView>

            {selectedImage && (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: selectedImage }} style={styles.imagePreview} />
                <TouchableOpacity onPress={() => setSelectedImage(null)} style={styles.removeImageBtn}>
                  <Ionicons name="close-circle" size={24} color="#ef4444" />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputArea}>
              <TouchableOpacity onPress={pickImage} style={[styles.micBtn, { marginRight: 8 }]}>
                 <Ionicons name="image" size={20} color="#4b5563" />
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleListening} style={[styles.micBtn, isListening && styles.micActive, !expoSpeech && { opacity: 0.5 }]}>
                 <Ionicons name="mic" size={20} color={isListening ? "#ef4444" : "#4b5563"} />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="Habla o escribe aquí..."
                placeholderTextColor="#6b7280"
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={sendMessage}
              />
              <TouchableOpacity onPress={sendMessage} style={styles.sendBtn} disabled={(!inputText.trim() && !selectedImage) || isProcessing}>
                 <Ionicons name="send" size={20} color={((!inputText.trim() && !selectedImage) || isProcessing) ? "#9ca3af" : "#6366f1"} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', paddingTop: Platform.OS === 'android' ? 45 : 0, marginTop: Platform.OS === 'ios' ? 40 : 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  closeBtn: { padding: 4 },
  chatArea: { flex: 1 },
  messageBubble: { maxWidth: '85%', padding: 12, borderRadius: 12, marginBottom: 12 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#6366f1', borderBottomRightRadius: 4 },
  agentBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15 },
  userText: { color: '#fff' },
  agentText: { color: '#111827' },
  inputArea: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingBottom: Platform.OS === 'android' ? 24 : 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  micBtn: { padding: 10, backgroundColor: '#f3f4f6', borderRadius: 20, marginRight: 8 },
  micActive: { backgroundColor: '#fee2e2' },
  input: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 },
  sendBtn: { padding: 10, marginLeft: 8 },
  imagePreviewContainer: { padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', flexDirection: 'row' },
  imagePreview: { width: 80, height: 80, borderRadius: 8 },
  removeImageBtn: { position: 'absolute', top: 4, left: 76, backgroundColor: '#fff', borderRadius: 12 }
});
