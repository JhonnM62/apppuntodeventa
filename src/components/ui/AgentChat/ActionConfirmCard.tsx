import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text as RNText } from 'react-native';
import { useAgentStore } from '../../../store/useAgentStore';
import axios from 'axios';

export default function ActionConfirmCard({ interruptData, messageId }: { interruptData: any, messageId: string }) {
  const { threadId, setProcessing, updateLastMessage, addMessage } = useAgentStore();

  const handleDecision = async (decision: 'approve' | 'reject') => {
    setProcessing(true);
    // Marcar como resuelto para ocular botones
    updateLastMessage({ interruptData: { ...interruptData, resolved: true } });

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
      const response = await axios.post(`${apiUrl}/agent/chat`, {
        threadId,
        resumeCommand: { approved: decision === 'approve' }
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
      addMessage({ id: Date.now().toString(), text: 'Hubo un error al procesar la decisión.', sender: 'agent' });
    } finally {
      setProcessing(false);
    }
  };

  if (interruptData.resolved) {
    return (
      <View style={styles.card}>
        <RNText style={styles.titleResolved}>Decisión registrada.</RNText>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <RNText style={styles.title}>{interruptData.message}</RNText>
      <RNText style={styles.subtitle}>Detalles a ejecutar:</RNText>
      <View style={styles.jsonContainer}>
        <RNText style={styles.json}>{JSON.stringify(interruptData.args, null, 2)}</RNText>
      </View>
      
      <View style={styles.buttons}>
        <TouchableOpacity style={[styles.btn, styles.rejectBtn]} onPress={() => handleDecision('reject')}>
          <RNText style={styles.btnText}>Cancelar</RNText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.approveBtn]} onPress={() => handleDecision('approve')}>
          <RNText style={styles.btnText}>Aprobar</RNText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#f3f4f6', padding: 12, borderRadius: 8, marginTop: 8 },
  title: { fontWeight: 'bold', marginBottom: 4, color: '#111827' },
  titleResolved: { fontWeight: 'bold', color: '#6b7280', fontStyle: 'italic' },
  subtitle: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  jsonContainer: { backgroundColor: '#fff', padding: 8, borderRadius: 4, borderWidth: 1, borderColor: '#e5e7eb' },
  json: { fontSize: 12, color: '#374151' }, // React Native doesn't support fontFamily monospace by default everywhere without custom fonts
  buttons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  btn: { padding: 10, borderRadius: 6, flex: 1, alignItems: 'center', marginHorizontal: 4 },
  rejectBtn: { backgroundColor: '#ef4444' },
  approveBtn: { backgroundColor: '#10b981' },
  btnText: { color: '#fff', fontWeight: 'bold' }
});
