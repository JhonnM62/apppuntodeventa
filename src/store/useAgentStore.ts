import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AgentMessage {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  interruptData?: any;
  imageUrl?: string;
}

interface AgentState {
  isOpen: boolean;
  messages: AgentMessage[];
  threadId: string;
  isProcessing: boolean;
  openChat: () => void;
  closeChat: () => void;
  addMessage: (msg: AgentMessage) => void;
  updateLastMessage: (msg: Partial<AgentMessage>) => void;
  setProcessing: (status: boolean) => void;
  setThreadId: (id: string) => void;
  clearChat: () => void;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
      isOpen: false,
      messages: [{ id: 'welcome', text: '¡Hola, Mor! ¿En qué te puedo ayudar hoy?', sender: 'agent' }],
      threadId: `session-${Date.now()}`, // Simple unique session per launch
      isProcessing: false,
      openChat: () => set({ isOpen: true }),
      closeChat: () => set({ isOpen: false }),
      addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
      updateLastMessage: (msgUpdates) => set((state) => {
        if (state.messages.length === 0) return state;
        const newMsgs = [...state.messages];
        newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], ...msgUpdates };
        return { messages: newMsgs };
      }),
      setProcessing: (status) => set({ isProcessing: status }),
      setThreadId: (id) => set({ threadId: id }),
      clearChat: () => set({ 
        messages: [{ id: 'welcome', text: '¡Hola, Mor! ¿En qué te puedo ayudar hoy?', sender: 'agent' }],
        threadId: `session-${Date.now()}`
      }),
    }),
    {
      name: 'agent-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ messages: state.messages, threadId: state.threadId }),
    }
  )
);
