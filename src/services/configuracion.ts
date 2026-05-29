import api from './api';

export const getConfiguracion = () => api.get('/configuracion');
export const updateConfiguracion = (data: { horaCorteDia?: string, modoOperacion?: string }) => api.put('/configuracion', data);

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
