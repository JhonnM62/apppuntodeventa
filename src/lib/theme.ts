import { Platform } from 'react-native';

export const COLORS = {
  primary: '#22C55E',
  primaryDark: '#16A34A',
  primaryLight: '#86EFAC',
  secondary: '#EF4444',
  secondaryDark: '#DC2626',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#1E293B',
  textSecondary: '#64748B',
  textLight: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  error: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  info: '#3B82F6',
  inputBg: '#FFFFFF',
  inputBorder: '#CBD5E1',
  destructive: '#EF4444',
  muted: '#94A3B8',
  overlay: 'rgba(0,0,0,0.5)',
  shadow: '#000000',
};

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
};

export const FONT_SIZE = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  display: 40,
};

export const FONT_WEIGHT = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const SHADOWS = {
  sm: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  xl: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
};

export const NAV_THEME = {
  light: {
    background: COLORS.primary,
    border: 'transparent',
    card: COLORS.surface,
    text: '#FFFFFF',
    primary: COLORS.primary,
    notification: COLORS.secondary,
  },
  dark: {
    background: '#1E293B',
    border: '#334155',
    card: '#1E293B',
    text: '#FFFFFF',
    primary: COLORS.primary,
    notification: COLORS.secondary,
  },
};

export const ANIMATION = {
  fast: 150,
  normal: 250,
  slow: 400,
};

export const TOUCHABLE = {
  minHeight: 44,
  minWidth: 44,
};
