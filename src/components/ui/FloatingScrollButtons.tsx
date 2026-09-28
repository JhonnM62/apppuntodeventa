import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Animated, Easing, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../../store/useSettingsStore';

interface FloatingScrollButtonsProps {
  showUp: boolean;
  showDown: boolean;
  onUp: () => void;
  onDown: () => void;
  bottomOffset?: number;
}

export const FloatingScrollButtons = ({ showUp, showDown, onUp, onDown, bottomOffset = 24 }: FloatingScrollButtonsProps) => {
  const { primaryColor } = useSettingsStore();
  const upAnim = useRef(new Animated.Value(0)).current;
  const downAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(upAnim, {
      toValue: showUp ? 1 : 0,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showUp]);

  useEffect(() => {
    Animated.timing(downAnim, {
      toValue: showDown ? 1 : 0,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showDown]);

  return (
    <View 
      className="absolute right-4 items-center justify-end" 
      style={{ zIndex: 999, bottom: bottomOffset }}
      pointerEvents="box-none"
    >
      <Animated.View
        style={{
          opacity: upAnim,
          transform: [
            { scale: upAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
            { translateY: upAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }
          ]
        }}
        pointerEvents={showUp ? "auto" : "none"}
        className="mb-3"
      >
        <TouchableOpacity
          onPress={onUp}
          activeOpacity={0.7}
          className="w-12 h-12 rounded-full items-center justify-center bg-white"
          style={{ 
            elevation: 4, 
            shadowColor: '#000', 
            shadowOpacity: 0.15, 
            shadowRadius: 8, 
            shadowOffset: { width: 0, height: 4 },
            borderWidth: 0.5,
            borderColor: 'rgba(0,0,0,0.05)'
          }}
        >
          <Ionicons name="arrow-up" size={24} color={primaryColor || '#10b981'} />
        </TouchableOpacity>
      </Animated.View>

      <Animated.View
        style={{
          opacity: downAnim,
          transform: [
            { scale: downAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
            { translateY: downAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }
          ]
        }}
        pointerEvents={showDown ? "auto" : "none"}
      >
        <TouchableOpacity
          onPress={onDown}
          activeOpacity={0.7}
          className="w-12 h-12 rounded-full items-center justify-center"
          style={{ 
            backgroundColor: primaryColor || '#10b981', 
            elevation: 6, 
            shadowColor: primaryColor || '#10b981', 
            shadowOpacity: 0.35, 
            shadowRadius: 10, 
            shadowOffset: { width: 0, height: 5 } 
          }}
        >
          <Ionicons name="arrow-down" size={24} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};
