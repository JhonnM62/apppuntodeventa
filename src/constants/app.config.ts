export const APP_VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT || 'restaurante1';

export const APP_CONFIG = {
  name: APP_VARIANT === 'fogata' ? 'Fogata POS' : "Q'hubo Mor",
  logoLetter: APP_VARIANT === 'fogata' ? 'F' : 'Q',
  ticketName: APP_VARIANT === 'fogata' ? 'FOGATA' : 'Q HUBO MOR',
};
