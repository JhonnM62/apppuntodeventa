const runtimeEnv: Record<string, string | undefined> | undefined =
  typeof globalThis !== 'undefined' && (globalThis as any).__ENV__
    ? (globalThis as any).__ENV__
    : undefined;

export const API_URL =
  runtimeEnv?.EXPO_PUBLIC_API_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  'http://localhost:3000/api/v1';

export const APP_VARIANT =
  runtimeEnv?.EXPO_PUBLIC_APP_VARIANT ||
  process.env.EXPO_PUBLIC_APP_VARIANT ||
  'restaurante1';

export const APP_CONFIG = {
  name: APP_VARIANT === 'fogata' ? 'Fogata POS' : "Q'hubo Mor",
  logoLetter: APP_VARIANT === 'fogata' ? 'F' : 'Q',
  ticketName: APP_VARIANT === 'fogata' ? 'FOGATA' : 'Q HUBO MOR',
};
