import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecciones, SeccionCocina } from '../services/seccion-cocina';
import { PrinterDevice } from './usePrinterStore';

// Configuración de impresora por sección (guardada localmente en el dispositivo)
// Valores posibles:
//   'principal' → usa la impresora BT principal del dispositivo
//   'remota'    → delega por socket al servidor de impresión
//   PrinterDevice → impresora BT específica para esta sección
export type SeccionImpresora = 'principal' | 'remota' | PrinterDevice;

interface SeccionesState {
  secciones: SeccionCocina[];
  impresoras: Record<string, SeccionImpresora>; // seccionId → config de impresora
  pausaEntreTickets: number; // segundos entre tickets (default 2)
  loading: boolean;
  error: string | null;

  // Acciones
  fetchSecciones: () => Promise<void>;
  setSecciones: (secciones: SeccionCocina[]) => void;
  setImpresora: (seccionId: string, impresora: SeccionImpresora) => void;
  removeImpresora: (seccionId: string) => void;
  setPausa: (segundos: number) => void;

  // Helpers
  getImpresoraDeSeccion: (seccionId: string) => SeccionImpresora;
  getSeccionesActivas: () => SeccionCocina[];
}

const useSeccionesStore = create<SeccionesState>()(
  persist(
    (set, get) => ({
      secciones: [],
      impresoras: {},
      pausaEntreTickets: 2,
      loading: false,
      error: null,

      fetchSecciones: async () => {
        set({ loading: true, error: null });
        try {
          const data = await getSecciones();
          set({ secciones: data, loading: false });
        } catch (err: any) {
          set({ error: err.message || 'Error cargando secciones', loading: false });
        }
      },

      setSecciones: (secciones) => set({ secciones }),

      setImpresora: (seccionId, impresora) =>
        set((state) => ({
          impresoras: { ...state.impresoras, [seccionId]: impresora },
        })),

      removeImpresora: (seccionId) =>
        set((state) => {
          const { [seccionId]: _, ...rest } = state.impresoras;
          return { impresoras: rest };
        }),

      setPausa: (segundos) => set({ pausaEntreTickets: Math.max(0, Math.min(10, segundos)) }),

      getImpresoraDeSeccion: (seccionId) => {
        const imp = get().impresoras[seccionId];
        return imp ?? 'principal'; // Si no hay config → usa la principal
      },

      getSeccionesActivas: () => get().secciones.filter((s) => s.activa),
    }),
    {
      name: 'secciones-cocina-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Solo persistir config local (secciones se recargan del servidor)
      partialize: (state) => ({
        impresoras: state.impresoras,
        pausaEntreTickets: state.pausaEntreTickets,
      }),
    }
  )
);

export default useSeccionesStore;
export type { SeccionCocina };
