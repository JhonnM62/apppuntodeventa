import { create } from 'zustand';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import usePrinterStore from '../src/store/usePrinterStore';

describe('Printer Store & Auto-print Logic', () => {
  it('evaluates shouldPrint correctly based on configs', () => {
    // Set initial state
    usePrinterStore.setState({
      configs: [
        { estadoOrden: 'PAGADO', imprimir: true } as any,
        { estadoOrden: 'TOMADO', imprimir: false } as any,
      ]
    });

    const state = usePrinterStore.getState() as any;
    
    // Check behavior
    expect(state.shouldPrint('PAGADO')).toBe(true);
    expect(state.shouldPrint('TOMADO')).toBe(false);
    expect(state.shouldPrint('ENTREGADO')).toBe(false); // Default false if not found
  });
});
