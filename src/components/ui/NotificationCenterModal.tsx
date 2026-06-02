import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, Animated } from 'react-native';
import { FlashList as OriginalFlashList } from '@shopify/flash-list';
const FlashList = OriginalFlashList as any;
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import useAuthStore from '../../store/useAuthStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { getNotificationHistory, markNotificationAsRead, NotificationHistoryItem } from '../../services/notifications';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface NotificationCenterModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function NotificationCenterModal({ visible, onClose }: NotificationCenterModalProps) {
  const { user } = useAuthStore();
  const { setUnreadCount, decrementUnread } = useNotificationStore();
  const [notifications, setNotifications] = useState<NotificationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (visible && user) {
      loadNotifications();
    }
  }, [visible, user]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const data = await getNotificationHistory(user?.id || user?.IDusuarios);
      setNotifications(data);
      setUnreadCount(data.filter(n => !n.read).length);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRead = async (id: string, read: boolean) => {
    if (read) return;
    
    // Optimistic UI
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    decrementUnread();
    
    try {
      await markNotificationAsRead(id);
    } catch (error) {
      // Revert
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: false } : n));
      useNotificationStore.getState().incrementUnread();
    }
  };

  const handleMarkAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;
    
    setMarkingAll(true);
    // Optimistic UI
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      await Promise.all(unread.map(n => markNotificationAsRead(n.id)));
    } catch (error) {
      console.error('Error marking all as read:', error);
      loadNotifications();
    } finally {
      setMarkingAll(false);
    }
  };

  const getIconForType = (type: string) => {
    if (type.includes('DELETED') || type.includes('MISMATCH') || type.includes('NEGATIVE') || type.includes('RETIRADO')) {
      return { name: 'alert-circle', color: '#ef4444', bg: '#fef2f2' };
    }
    if (type.includes('CREATED') || type.includes('POSITIVE') || type.includes('PERFECT')) {
      return { name: 'check-circle', color: '#10b981', bg: '#ecfdf5' };
    }
    return { name: 'information', color: '#3b82f6', bg: '#eff6ff' };
  };

  const renderItem = ({ item }: { item: NotificationHistoryItem }) => {
    const { name, color, bg } = getIconForType(item.type);
    
    return (
      <TouchableOpacity 
        onPress={() => handleRead(item.id, item.read)}
        activeOpacity={0.7}
        className={`flex-row p-4 border-b border-gray-100 ${item.read ? 'bg-white opacity-75' : 'bg-blue-50/30'}`}
      >
        <View className={`mr-3 mt-1 w-10 h-10 rounded-full items-center justify-center ${item.read ? 'opacity-50' : ''}`} style={{ backgroundColor: bg }}>
          <MaterialCommunityIcons name={name as any} size={22} color={color} />
        </View>
        <View className="flex-1">
          <View className="flex-row justify-between items-start mb-1">
            <Text className={`flex-1 text-sm ${item.read ? 'text-gray-500 font-medium' : 'text-gray-900 font-bold'}`}>
              {item.title}
            </Text>
            <Text className="text-xs text-gray-400 ml-2">
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: es })}
            </Text>
          </View>
          <Text className={`text-sm ${item.read ? 'text-gray-400' : 'text-gray-700'}`}>
            {item.body}
          </Text>
        </View>
        {!item.read && (
          <View className="w-2.5 h-2.5 bg-blue-600 rounded-full mt-2 ml-2" />
        )}
      </TouchableOpacity>
    );
  };

  const filteredNotifications = activeTab === 'all' ? notifications : notifications.filter(n => !n.read);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white w-full h-[85%] rounded-t-3xl overflow-hidden shadow-2xl">
          
          <View className="flex-row justify-between items-center px-5 pt-5 pb-3">
            <Text className="text-xl font-bold text-gray-900">Notificaciones</Text>
            <View className="flex-row items-center">
              {unreadCount > 0 && (
                <TouchableOpacity 
                  onPress={handleMarkAllAsRead} 
                  disabled={markingAll}
                  className="mr-4 flex-row items-center bg-gray-100 px-3 py-1.5 rounded-full"
                >
                  <Ionicons name="checkmark-done" size={16} color="#4b5563" />
                  <Text className="text-xs font-semibold text-gray-600 ml-1">Marcar todas</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} className="p-2 rounded-full bg-gray-100">
                <Ionicons name="close" size={20} color="#4b5563" />
              </TouchableOpacity>
            </View>
          </View>

          <View className="px-5 border-b border-gray-200 flex-row">
            <TouchableOpacity 
              className={`pb-3 px-2 mr-6 ${activeTab === 'all' ? 'border-b-2 border-blue-600' : ''}`}
              onPress={() => setActiveTab('all')}
            >
              <Text className={`font-bold ${activeTab === 'all' ? 'text-blue-600' : 'text-gray-400'}`}>Todas</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className={`pb-3 px-2 flex-row items-center ${activeTab === 'unread' ? 'border-b-2 border-blue-600' : ''}`}
              onPress={() => setActiveTab('unread')}
            >
              <Text className={`font-bold ${activeTab === 'unread' ? 'text-blue-600' : 'text-gray-400'}`}>No Leídas</Text>
              {unreadCount > 0 && (
                <View className="bg-red-500 rounded-full px-1.5 py-0.5 ml-1.5">
                  <Text className="text-[10px] text-white font-bold">{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {loading ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator size="large" color="#16a34a" />
            </View>
          ) : filteredNotifications.length === 0 ? (
            <View className="flex-1 justify-center items-center px-8">
              <Ionicons name="notifications-off-outline" size={64} color="#e5e7eb" />
              <Text className="text-gray-400 text-lg font-medium mt-4 text-center">
                {activeTab === 'unread' ? 'No tienes notificaciones sin leer.' : 'No tienes notificaciones recientes.'}
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1, minHeight: 2 }}>
              <FlashList
                data={filteredNotifications}
                renderItem={renderItem}
                estimatedItemSize={85}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: 20 }}
              />
            </View>
          )}

        </View>
      </View>
    </Modal>
  );
}
