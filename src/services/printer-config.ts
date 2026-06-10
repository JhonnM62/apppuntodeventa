import api from './api';

export interface PrinterConfig {
  estadoOrden: string;
  imprimirComanda: boolean;
  imprimirFactura: boolean;
}

export const getPrinterConfigs = async (): Promise<PrinterConfig[]> => {
  const response = await api.get('/printer-config');
  return response.data;
};

export const updatePrinterConfigs = async (configs: PrinterConfig[]): Promise<PrinterConfig[]> => {
  const response = await api.put('/printer-config', configs);
  return response.data;
};
