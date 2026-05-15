import api from './api';

export const getConfiguracion = () => api.get('/configuracion');
export const updateConfiguracion = (data: { horaCorteDia: string }) => api.put('/configuracion', data);
