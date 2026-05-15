import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPrinterConfigs } from '../services/printer-config';

export type PrinterPaperSize = 58 | 80;

export interface PrinterDevice {
  device_name: string;
  inner_mac_address: string;
}

export interface PrinterConfig {
  estadoOrden: string;
  imprimir: boolean;
}

interface PrinterState {
  currentPrinter: PrinterDevice | null;
  paperSize: PrinterPaperSize;
  isConnected: boolean;
  configs: PrinterConfig[];
  setPrinter: (printer: PrinterDevice | null) => void;
  setPaperSize: (size: PrinterPaperSize) => void;
  setConnected: (status: boolean) => void;
  setConfigs: (configs: PrinterConfig[]) => void;
  fetchConfigs: () => Promise<void>;
  shouldPrint: (estadoOrden: string) => boolean;
  printTicket: (ticketData: any) => Promise<void>;
}

import { executePrint } from '../utils/printer';
import Toast from 'react-native-toast-message';

const usePrinterStore = create<PrinterState>()(
  persist(
    (set, get) => ({
      currentPrinter: null,
      paperSize: 58,
      isConnected: false,
      configs: [],
      setPrinter: (printer) => set({ currentPrinter: printer }),
      setPaperSize: (size) => set({ paperSize: size }),
      setConnected: (status) => set({ isConnected: status }),
      setConfigs: (configs) => set({ configs }),
      fetchConfigs: async () => {
        try {
          const configs = await getPrinterConfigs();
          set({ configs });
        } catch (error) {
          console.error('Error fetching printer configs:', error);
        }
      },
      shouldPrint: (estadoOrden: string) => {
        const config = get().configs.find((c) => c.estadoOrden === estadoOrden);
        return config ? config.imprimir : false;
      },
      printTicket: async (ticketData: any) => {
        const state = get();
        if (!state.isConnected || !state.currentPrinter) {
          Toast.show({ type: 'warning', text1: 'Impresión Fallida', text2: 'No hay impresora conectada', position: 'top' });
          return;
        }
        const success = await executePrint(ticketData, state.paperSize, state.currentPrinter.inner_mac_address);
        if (!success) {
          Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo imprimir el ticket', position: 'top' });
        }
      }
    }),
    {
      name: 'printer-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ currentPrinter: state.currentPrinter, paperSize: state.paperSize, configs: state.configs }),
    }
  )
);

export default usePrinterStore;
