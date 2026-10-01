import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPrinterConfigs } from '../services/printer-config';
import { executePrint, executeWebPrintBatch } from '../utils/printer';
import { splitComandaPorSeccion } from '../utils/splitComanda';
import useSeccionesStore from './useSeccionesStore';
import Toast from 'react-native-toast-message';
import { Platform } from 'react-native';

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

// Referencia al socket para printRemote — se inicializa desde el contexto
let _socket: any = null;
let _negocioId: string = 'default';
export const setPrinterSocket = (socket: any, negocioId: string) => {
  _socket = socket;
  _negocioId = negocioId;
};

const generateUUID = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

interface PrinterState {
  currentPrinter: PrinterDevice | null;
  paperSize: PrinterPaperSize;
  isConnected: boolean;
  configs: PrinterConfig[];
  // Modo servidor (actúa como receptor de print:job)
  servidorActivo: boolean;
  setPrinter: (printer: PrinterDevice | null) => void;
  setPaperSize: (size: PrinterPaperSize) => void;
  setConnected: (status: boolean) => void;
  setConfigs: (configs: PrinterConfig[]) => void;
  setServidorActivo: (activo: boolean) => void;
  fetchConfigs: () => Promise<void>;
  shouldPrintComanda: (estadoOrden: string) => boolean;
  shouldPrintFactura: (estadoOrden: string) => boolean;
  // Impresión local directa (comportamiento original)
  printTicket: (ticketData: any) => Promise<void>;
  // Impresión manual (desde vista previa)
  manualPreviewEnabled: boolean;
  manualAutoPrintEnabled: boolean;
  manualAutoPrintSeconds: number;
  setManualPrintConfigs: (preview: boolean, autoPrint: boolean, seconds: number) => void;
  printManual: (ticketData: any, type: 'comanda' | 'factura') => Promise<boolean>;
  // Impresión remota vía socket (delegada a otro dispositivo con BT)
  printRemote: (ticketData: any, type: 'comanda' | 'factura') => Promise<boolean>;
  // Impresión inteligente: local si hay BT, remota si no
  printSmart: (ticketData: any, type: 'comanda' | 'factura') => Promise<boolean>;
  // Impresión con secciones: imprime N tickets sequencialmente
  printTicketConSecciones: (ticketData: any) => Promise<void>;
  
  webPrintMode: 'native' | 'remote';
  setWebPrintMode: (mode: 'native' | 'remote') => void;
}

const usePrinterStore = create<PrinterState>()(
  persist(
    (set, get) => ({
      currentPrinter: null,
      paperSize: 58,
      isConnected: false,
      configs: [],
      servidorActivo: false,
      manualPreviewEnabled: true,
      manualAutoPrintEnabled: false,
      manualAutoPrintSeconds: 3,
      webPrintMode: 'native',

      setWebPrintMode: (mode) => set({ webPrintMode: mode }),

      setPrinter: (printer) => set({ currentPrinter: printer }),
      setPaperSize: (size) => set({ paperSize: size }),
      setConnected: (status) => set({ isConnected: status }),
      setConfigs: (configs) => set({ configs }),
      setServidorActivo: (activo) => set({ servidorActivo: activo }),

      setManualPrintConfigs: (preview, autoPrint, seconds) =>
        set({ manualPreviewEnabled: preview, manualAutoPrintEnabled: autoPrint, manualAutoPrintSeconds: seconds }),

      fetchConfigs: async () => {
        try {
          const configs = await getPrinterConfigs();
          set({ configs });
        } catch (error: any) {
          if (error?.message === 'No token stored' || error?.message?.includes('No token')) {
            // Ignore token missing errors (e.g. during logout)
            return;
          }
          console.error('Error fetching printer configs:', error);
        }
      },

      shouldPrintComanda: (estadoOrden) => {
        if (!estadoOrden) return false;
        const config = get().configs.find((c) => c.estadoOrden?.toUpperCase() === estadoOrden.toUpperCase());
        return config ? config.imprimirComanda : false;
      },

      shouldPrintFactura: (estadoOrden) => {
        if (!estadoOrden) return false;
        const config = get().configs.find((c) => c.estadoOrden?.toUpperCase() === estadoOrden.toUpperCase());
        return config ? config.imprimirFactura : false;
      },

      // ─────────────────────────────────────────────────────────────────
      // printRemote — delegar impresión a otro dispositivo por Socket
      // ─────────────────────────────────────────────────────────────────
      printRemote: async (ticketData, type) => {
        if (!_socket) {
          Toast.show({ type: 'warning', text1: 'Sin servidor de impresión', text2: 'No hay dispositivo con impresora disponible', position: 'top' });
          return false;
        }

        const jobId = generateUUID();
        const state = get();

        _socket.emit('print:request', {
          jobId,
          negocioId: _negocioId,
          ticketData,
          type,
          paperSize: state.paperSize,
        });

        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => {
            _socket?.off(`print:ack:${jobId}`);
            Toast.show({ type: 'warning', text1: 'Sin respuesta', text2: 'El servidor de impresión no respondió', position: 'top' });
            resolve(false);
          }, 10_000);

          _socket.once(`print:ack:${jobId}`, ({ success, error }: any) => {
            clearTimeout(timeout);
            if (!success) {
              Toast.show({ type: 'error', text1: 'Error remoto', text2: error || 'Error al imprimir remotamente', position: 'top' });
            }
            resolve(success);
          });
        });
      },

      // ─────────────────────────────────────────────────────────────────
      // printSmart — intenta local, si no → remoto
      // ─────────────────────────────────────────────────────────────────
      printSmart: async (ticketData, type) => {
        const state = get();
        if (Platform.OS === 'web' && state.webPrintMode !== 'remote') {
          executeWebPrintBatch([{ data: ticketData, type }], state.paperSize);
          return true;
        }

        if (state.isConnected && state.currentPrinter) {
          // Impresión local directa
          try {
            await executePrint(ticketData, state.paperSize, state.currentPrinter.inner_mac_address, type);
            set({ isConnected: true });
            return true;
          } catch (err: any) {
            set({ isConnected: false });
            Toast.show({ type: 'error', text1: 'Error BT local', text2: err.message, position: 'top' });
            return false;
          }
        } else {
          // Sin BT local → delegar por socket
          return get().printRemote(ticketData, type);
        }
      },

      // ─────────────────────────────────────────────────────────────────
      // printTicket — impresión automática según estado de la orden
      // Ahora con soporte de secciones de cocina
      // ─────────────────────────────────────────────────────────────────
      printTicket: async (ticketData: any) => {
        const state = get();
        const printComanda = state.shouldPrintComanda(ticketData.estado);
        const printFactura = state.shouldPrintFactura(ticketData.estado);

        if (!printComanda && !printFactura) return;

        if (Platform.OS === 'web' && state.webPrintMode !== 'remote') {
          const webTickets: { data: any; type: 'comanda' | 'factura' }[] = [];
          
          if (printComanda) {
            const seccionesState = useSeccionesStore.getState();
            const secciones = seccionesState.getSeccionesActivas();
            
            if (secciones.length === 0) {
              webTickets.push({ data: ticketData, type: 'comanda' });
            } else {
              const grupos = splitComandaPorSeccion(ticketData.productos ?? [], secciones, true);
              if (grupos.length === 0) {
                webTickets.push({ data: ticketData, type: 'comanda' });
              } else {
                grupos.forEach((g) => {
                  webTickets.push({
                    data: {
                      ...ticketData,
                      productos: g.productos,
                      seccionNombre: g.seccion.IDseccion === '__general__' ? null : g.seccion.nombre,
                      seccionColor: g.seccion.color,
                      seccionIcono: g.seccion.icono,
                    },
                    type: 'comanda'
                  });
                });
              }
            }
          }
          
          if (printFactura) {
            webTickets.push({ data: ticketData, type: 'factura' });
          }
          
          if (webTickets.length > 0) {
            executeWebPrintBatch(webTickets, state.paperSize);
          }
          return;
        }

        // Verificar si hay impresora disponible (local o remota) para App Móvil
        const hayImpresora = (state.isConnected && state.currentPrinter) || !!_socket;
        if (!hayImpresora) {
          Toast.show({ type: 'warning', text1: 'Sin impresora', text2: 'No hay impresora BT local ni servidor disponible', position: 'top' });
          return;
        }

        if (printComanda) {
          await get().printTicketConSecciones(ticketData);
        }

        if (printFactura) {
          if (printComanda) {
            await new Promise((r) => setTimeout(r, 1500));
          }
          await get().printSmart(ticketData, 'factura');
        }
      },

      // ─────────────────────────────────────────────────────────────────
      // printTicketConSecciones — divide la comanda y la imprime por sección
      // ─────────────────────────────────────────────────────────────────
      printTicketConSecciones: async (ticketData: any) => {
        const seccionesState = useSeccionesStore.getState();
        const secciones = seccionesState.getSeccionesActivas();
        const pausaMs = (seccionesState.pausaEntreTickets ?? 2) * 1000;
        const state = get();

        if (secciones.length === 0) {
          // Sin secciones → un solo ticket (comportamiento original)
          await get().printSmart(ticketData, 'comanda');
          return;
        }

        // Dividir productos por sección
        const grupos = splitComandaPorSeccion(ticketData.productos ?? [], secciones, true);
        console.log(`[DEBUG-PRINTER] printTicketConSecciones - grupos generados: ${grupos.length}`, JSON.stringify(grupos.map(g => ({ s: g.seccion.IDseccion, p: g.productos.length }))));

        if (grupos.length === 0) {
          // Todos los productos sin sección y sin GENERAL → ticket único
          console.log('[DEBUG-PRINTER] printTicketConSecciones - sin grupos (0 productos), enviando ticket general.');
          await get().printSmart(ticketData, 'comanda');
          return;
        }

        if (Platform.OS === 'web' && state.webPrintMode !== 'remote') {
          const ticketsParaImprimir = grupos.map((g) => ({
            data: {
              ...ticketData,
              productos: g.productos,
              seccionNombre: g.seccion.IDseccion === '__general__' ? null : g.seccion.nombre,
              seccionColor: g.seccion.color,
              seccionIcono: g.seccion.icono,
            },
            type: 'comanda' as const,
          }));
          executeWebPrintBatch(ticketsParaImprimir, state.paperSize);
          return;
        }

        // Imprimir un ticket por sección en orden
        for (let i = 0; i < grupos.length; i++) {
          const { seccion, productos } = grupos[i];
          console.log(`[DEBUG-PRINTER] printTicketConSecciones - Imprimiendo grupo ${i+1}/${grupos.length} para sección: ${seccion.IDseccion}`);

          const ticketSeccion = {
            ...ticketData,
            productos,
            seccionNombre: seccion.IDseccion === '__general__' ? null : seccion.nombre,
            seccionColor: seccion.color,
            seccionIcono: seccion.icono,
          };

          // Determinar impresora para esta sección
          const configImpresora = seccionesState.getImpresoraDeSeccion(seccion.IDseccion);

          if (configImpresora === 'remota') {
            // Siempre delegar por socket para esta sección
            await get().printRemote(ticketSeccion, 'comanda');
          } else if (configImpresora === 'principal') {
            // Usar impresora principal del dispositivo
            await get().printSmart(ticketSeccion, 'comanda');
          } else {
            // Impresora BT específica para esta sección
            const printer = configImpresora as any;
            try {
              await executePrint(ticketSeccion, state.paperSize, printer.inner_mac_address, 'comanda');
              set({ isConnected: true });
            } catch (err: any) {
              set({ isConnected: false });
              // Fallback a impresora principal si falla la específica
              await get().printSmart(ticketSeccion, 'comanda');
            }
          }

          // Pausa entre tickets (excepto el último)
          if (i < grupos.length - 1) {
            await new Promise((r) => setTimeout(r, pausaMs));
          }
        }
      },

      // ─────────────────────────────────────────────────────────────────
      // printManual — impresión manual desde vista previa
      // ─────────────────────────────────────────────────────────────────
      printManual: async (ticketData: any, type: 'comanda' | 'factura') => {
        if (type === 'comanda') {
          await get().printTicketConSecciones(ticketData);
          return true;
        }
        return get().printSmart(ticketData, type);
      },
    }),
    {
      name: 'printer-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        currentPrinter: state.currentPrinter,
        paperSize: state.paperSize,
        configs: state.configs,
        servidorActivo: state.servidorActivo,
        manualPreviewEnabled: state.manualPreviewEnabled,
        manualAutoPrintEnabled: state.manualAutoPrintEnabled,
        manualAutoPrintSeconds: state.manualAutoPrintSeconds,
      }),
    }
  )
);

export default usePrinterStore;
