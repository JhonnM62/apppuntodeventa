import api from './api';

let cachedConfig: any = null;

export const getConfiguracion = async (forceRefresh = false) => {
  if (!forceRefresh && cachedConfig) {
    return Promise.resolve(cachedConfig);
  }
  const res = await api.get('/configuracion');
  cachedConfig = res;
  return res;
};

export const updateConfiguracion = async (data: { horaCorteDia?: string, modoOperacion?: string, nombreComercial?: string, nit?: string, direccion?: string, telefono?: string }) => {
  const res = await api.put('/configuracion', data);
  cachedConfig = null; // Invalidate cache
  return res;
};

export const getConfiguracionWhatsapp = () => api.get('/configuracion/whatsapp');
export const updateConfiguracionWhatsapp = (data: any) => api.put('/configuracion/whatsapp', data);
export const sendReportToWhatsapp = (urlPublica: string, fileName: string, caption: string) => api.post('/configuracion/whatsapp/send-report', { urlPublica, fileName, caption });

export const uploadAndSendCajaWhatsapp = async (pdfUri: string, fileName: string, caption: string, baseUrl: string) => {
  const formData = new FormData();
  formData.append('pdf', {
    uri: pdfUri,
    name: fileName,
    type: 'application/pdf',
  } as any);
  
  formData.append('fileName', fileName);
  formData.append('caption', caption);
  formData.append('baseUrl', baseUrl);

  const response = await api.post('/configuracion/whatsapp/upload-and-send', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const uploadLogo = async (imageUri: string, baseUrl: string) => {
  const formData = new FormData();
  
  // Extract filename from URI
  const filename = imageUri.split('/').pop() || 'logo.jpg';
  
  // Infer type
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';
  
  formData.append('logo', {
    uri: imageUri,
    name: filename,
    type,
  } as any);
  
  formData.append('baseUrl', baseUrl);

  const response = await api.post('/configuracion/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  
  cachedConfig = null; // Invalidate cache so next fetch gets new logo URL
  return response.data;
};
