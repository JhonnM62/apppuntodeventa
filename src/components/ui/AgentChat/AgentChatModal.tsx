import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Text as RNText, Keyboard, SafeAreaView } from 'react-native';
import Voice from '@react-native-voice/voice';
import { useAgentStore } from '../../../store/useAgentStore';
import ActionConfirmCard from './ActionConfirmCard';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';

export default function AgentChatModal() {
  const { isOpen, closeChat, messages, isProcessing, setProcessing, addMessage, threadId } = useAgentStore();
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    Voice.onSpeechResults = (e) => {
      if (e.value && e.value.length > 0) {
        setInputText(e.value[0]);
      }
    };
    Voice.onSpeechEnd = () => setIsListening(false);
    Voice.onSpeechError = () => setIsListening(false);

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const toggleListening = async () => {
    if (isListening) {
      await Voice.stop();
      setIsListening(false);
    } else {
      setInputText('');
      await Voice.start('es-CO'); // Defaulting to Spanish Colombia based on previous context
      setIsListening(true);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    const userMsg = inputText;
    setInputText('');
    if (isListening) {
       await Voice.stop();
       setIsListening(false);
    }

    addMessage({ id: Date.now().toString(), text: userMsg, sender: 'user' });
    setProcessing(true);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
      const response = await axios.post(`${apiUrl}/agent/chat`, {
        threadId,
        message: userMsg
      });
      
      const resData = response.data.data;
      if (resData.status === 'completed') {
        addMessage({ id: Date.now().toString(), text: resData.message, sender: 'agent' });
      } else if (resData.status === 'interrupted') {
        addMessage({ 
          id: Date.now().toString(), 
          text: resData.interruptData.message, 
          sender: 'agent', 
          interruptData: resData.interruptData 
        });
      }
    } catch (error) {
      console.error(error);
      addMessage({ id: Date.now().toString(), text: 'Hubo un error al conectar con el agente.', sender: 'agent' });
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

  return (
    <Modal visible={isOpen} animationType="slide" transparent>
      <View style={styles.container}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, paddingBottom: Platform.OS === 'android' ? keyboardHeight : 0 }}
        >
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.header}>
              <RNText style={styles.headerTitle}>Agente IA 🤖</RNText>
              <TouchableOpacity onPress={closeChat} style={styles.closeBtn}>
                 <Ionicons name="close" size={24} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.chatArea} contentContainerStyle={{ flexGrow: 1, paddingBottom: 32, padding: 16 }}>
              {messages.map((m, i) => (
                <View key={i} style={[styles.messageBubble, m.sender === 'user' ? styles.userBubble : styles.agentBubble]}>
                  {m.text ? <RNText style={[styles.messageText, m.sender === 'user' ? styles.userText : styles.agentText]}>{m.text}</RNText> : null}
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

            <View style={styles.inputArea}>
              <TouchableOpacity onPress={toggleListening} style={[styles.micBtn, isListening && styles.micActive]}>
                 <Ionicons name="mic" size={20} color={isListening ? "#ef4444" : "#4b5563"} />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="Habla o escribe aquí..."
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={sendMessage}
              />
              <TouchableOpacity onPress={sendMessage} style={styles.sendBtn} disabled={!inputText.trim() || isProcessing}>
                 <Ionicons name="send" size={20} color={(!inputText.trim() || isProcessing) ? "#9ca3af" : "#6366f1"} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', marginTop: Platform.OS === 'ios' ? 40 : 0 },
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
  inputArea: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  micBtn: { padding: 10, backgroundColor: '#f3f4f6', borderRadius: 20, marginRight: 8 },
  micActive: { backgroundColor: '#fee2e2' },
  input: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 },
  sendBtn: { padding: 10, marginLeft: 8 }
});
