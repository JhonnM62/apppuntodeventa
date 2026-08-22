import api from './api';

export interface NotificationSettings {
  userId: string;
  notifyVentaCreated: boolean;
  notifyVentaUpdated: boolean;
  notifyVentaDeleted: boolean;
  notifyVentaTrashEmpty: boolean;
  notifyProductoCreated: boolean;
  notifyProductoPriceChanged: boolean;
  notifyProductoRecipeChanged: boolean;
  notifyProductoDeleted: boolean;
  notifyInsumoCreated: boolean;
  notifyInsumoStockPositive: boolean;
  notifyInsumoStockNegative: boolean;
  notifyInsumoStockLow: boolean;
  notifyInsumoDeleted: boolean;
  notifyCajaOpened: boolean;
  notifyCajaClosedPerfect: boolean;
  notifyCajaClosedMismatch: boolean;
  notifyCajaDeleted: boolean;
  notifyOrderInventarioUpdated: boolean;
  notifyDineroRetirado: boolean;
  notifyGastoCreated: boolean;
  notifyGastoDeleted: boolean;
  notifyTurnoOpened: boolean;
  notifyTurnoClosed: boolean;
  notifyTurnoDescanso: boolean;
}

export interface NotificationHistoryItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  data: any;
  read: boolean;
  createdAt: string;
}

export const getNotificationSettings = async (userId: string): Promise<NotificationSettings> => {
  const response = await api.get(`/notifications/settings/${userId}`);
  return response.data;
};

export const updateNotificationSettings = async (userId: string, data: Partial<NotificationSettings>) => {
  const response = await api.patch(`/notifications/settings/${userId}`, data);
  return response.data;
};

export const getNotificationHistory = async (userId: string): Promise<NotificationHistoryItem[]> => {
  const response = await api.get(`/notifications/history/${userId}`);
  return response.data;
};

export const markNotificationAsRead = async (id: string) => {
  const response = await api.patch(`/notifications/history/${id}/read`);
  return response.data;
};
