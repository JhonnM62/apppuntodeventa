import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { colors } from '../theme/colors';

const Button = ({ title, onPress, type = 'primary', loading = false, disabled = false, style, textStyle }) => {
  const isPrimary = type === 'primary';
  
  return (
    <TouchableOpacity
      style={[
        styles.button,
        isPrimary ? styles.primary : styles.secondary,
        disabled && styles.disabled,
        style
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#FFF' : colors.primary} />
      ) : (
        <Text style={[
          styles.text,
          isPrimary ? styles.textPrimary : styles.textSecondary,
          textStyle
        ]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12, // Modern, slightly rounded corners
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3, // Subtle shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    minHeight: 52,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 0,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  textPrimary: {
    color: '#FFF',
  },
  textSecondary: {
    color: colors.text,
  },
});

export default Button;
