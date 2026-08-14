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
  imprimirComanda: boolean;
  imprimirFactura: boolean;
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
  shouldPrintComanda: (estadoOrden: string) => boolean;
  shouldPrintFactura: (estadoOrden: string) => boolean;
  printTicket: (ticketData: any) => Promise<void>;
  manualPreviewEnabled: boolean;
  manualAutoPrintEnabled: boolean;
  manualAutoPrintSeconds: number;
  setManualPrintConfigs: (preview: boolean, autoPrint: boolean, seconds: number) => void;
  printManual: (ticketData: any, type: 'comanda' | 'factura') => Promise<boolean>;
}

import { executePrint } from '../utils/printer';
import Toast from 'react-native-toast-message';
import { Platform } from 'react-native';

const usePrinterStore = create<PrinterState>()(
  persist(
    (set, get) => ({
      currentPrinter: null,
      paperSize: 58,
      isConnected: false,
      configs: [],
      manualPreviewEnabled: true,
      manualAutoPrintEnabled: false,
      manualAutoPrintSeconds: 3,
      setManualPrintConfigs: (preview, autoPrint, seconds) => set({ 
        manualPreviewEnabled: preview, 
        manualAutoPrintEnabled: autoPrint, 
        manualAutoPrintSeconds: seconds 
      }),
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
      shouldPrintComanda: (estadoOrden: string) => {
        const config = get().configs.find((c) => c.estadoOrden === estadoOrden);
        return config ? config.imprimirComanda : false;
      },
      shouldPrintFactura: (estadoOrden: string) => {
        const config = get().configs.find((c) => c.estadoOrden === estadoOrden);
        return config ? config.imprimirFactura : false;
      },
      printTicket: async (ticketData: any) => {
        const state = get();
        if (Platform.OS !== 'web' && !state.currentPrinter) {
          Toast.show({ type: 'warning', text1: 'Impresión Fallida', text2: 'No hay impresora configurada', position: 'top' });
          return;
        }

        const printComanda = state.shouldPrintComanda(ticketData.estado);
        const printFactura = state.shouldPrintFactura(ticketData.estado);

        if (!printComanda && !printFactura) return;

        let errorCount = 0;
        let errorMessage = 'Fallo de conexión o impresión';
        if (printComanda) {
          try {
            await executePrint(ticketData, state.paperSize, state.currentPrinter?.inner_mac_address || '', 'comanda');
            set({ isConnected: true });
          } catch(err: any) {
            errorCount++;
            errorMessage = err.message;
            set({ isConnected: false });
          }
        }

        if (printFactura) {
          if (printComanda) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
          try {
            await executePrint(ticketData, state.paperSize, state.currentPrinter?.inner_mac_address || '', 'factura');
            set({ isConnected: true });
          } catch(err: any) {
            errorCount++;
            errorMessage = err.message;
            set({ isConnected: false });
          }
        }

        if (errorCount > 0) {
          Toast.show({ type: 'error', text1: 'Error', text2: errorMessage, position: 'top' });
        }
      },
      printManual: async (ticketData: any, type: 'comanda' | 'factura') => {
        const state = get();
        if (Platform.OS !== 'web' && !state.currentPrinter) {
          Toast.show({ type: 'warning', text1: 'Impresión Fallida', text2: 'No hay impresora configurada', position: 'top' });
          return false;
        }

        try {
          await executePrint(ticketData, state.paperSize, state.currentPrinter?.inner_mac_address || '', type);
          set({ isConnected: true });
          return true;
        } catch (error: any) {
          set({ isConnected: false });
          Toast.show({ type: 'error', text1: 'Error', text2: error.message || `Error al imprimir la ${type}`, position: 'top' });
          return false;
        }
      }
    }),
    {
      name: 'printer-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ 
        currentPrinter: state.currentPrinter, 
        paperSize: state.paperSize, 
        configs: state.configs,
        manualPreviewEnabled: state.manualPreviewEnabled,
        manualAutoPrintEnabled: state.manualAutoPrintEnabled,
        manualAutoPrintSeconds: state.manualAutoPrintSeconds
      }),
    }
  )
);

export default usePrinterStore;
