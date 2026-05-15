import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, Animated } from 'react-native';
import { FlashList } from '@shopify/flash-list';
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
        className={`flex-row p-4 border-b border-gray-100 ${item.read ? 'bg-white' : 'bg-blue-50/50'}`}
      >
        <View className="mr-3 mt-1 w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: bg }}>
          <MaterialCommunityIcons name={name as any} size={22} color={color} />
        </View>
        <View className="flex-1">
          <View className="flex-row justify-between items-start mb-1">
            <Text className={`flex-1 text-sm ${item.read ? 'text-gray-700 font-medium' : 'text-gray-900 font-bold'}`}>
              {item.title}
            </Text>
            <Text className="text-xs text-gray-400 ml-2">
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: es })}
            </Text>
          </View>
          <Text className={`text-sm ${item.read ? 'text-gray-500' : 'text-gray-800'}`}>
            {item.body}
          </Text>
        </View>
        {!item.read && (
          <View className="w-2.5 h-2.5 bg-blue-500 rounded-full mt-2 ml-2" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white w-full h-[85%] rounded-t-3xl overflow-hidden shadow-2xl">
          
          <View className="flex-row justify-between items-center p-5 border-b border-gray-100">
            <Text className="text-xl font-bold text-gray-800">Centro de Notificaciones</Text>
            <TouchableOpacity onPress={onClose} className="p-2 rounded-full bg-gray-100">
              <Ionicons name="close" size={20} color="#4b5563" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator size="large" color="#16a34a" />
            </View>
          ) : notifications.length === 0 ? (
            <View className="flex-1 justify-center items-center px-8">
              <Ionicons name="notifications-off-outline" size={64} color="#d1d5db" />
              <Text className="text-gray-500 text-lg font-medium mt-4 text-center">
                No tienes notificaciones recientes.
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1, minHeight: 2 }}>
              <FlashList
                data={notifications}
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
