import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface OfflineAction {
  id: string;
  type: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  payload?: any;
  timestamp: number;
  retries: number;
}

interface SyncState {
  queue: OfflineAction[];
  isSyncing: boolean;
  enqueueAction: (action: Omit<OfflineAction, 'id' | 'timestamp' | 'retries'>) => void;
  dequeueAction: (id: string) => void;
  incrementRetry: (id: string) => void;
  setSyncing: (status: boolean) => void;
  clearQueue: () => void;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      queue: [],
      isSyncing: false,
      enqueueAction: (action) =>
        set((state) => ({
          queue: [
            ...state.queue,
            {
              ...action,
              id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
              timestamp: Date.now(),
              retries: 0,
            },
          ],
        })),
      dequeueAction: (id) =>
        set((state) => ({
          queue: state.queue.filter((a) => a.id !== id),
        })),
      incrementRetry: (id) =>
        set((state) => ({
          queue: state.queue.map((a) =>
            a.id === id ? { ...a, retries: a.retries + 1 } : a
          ),
        })),
      setSyncing: (status) => set({ isSyncing: status }),
      clearQueue: () => set({ queue: [] }),
    }),
    {
      name: 'sync-queue-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
