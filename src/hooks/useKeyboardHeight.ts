import { useEffect, useState } from 'react';
import { Keyboard, KeyboardEvent, Platform } from 'react-native';

export const useKeyboardHeight = () => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const vv = window.visualViewport;
      if (!vv) return;

      const onResize = () => {
        // En móviles, visualViewport.height disminuye cuando se abre el teclado
        // Asumimos que window.innerHeight representa el total (aunque a veces varía, vv es más confiable)
        const diff = window.innerHeight - vv.height;
        // Si la diferencia es significativa (ej. > 100), es el teclado
        setKeyboardHeight(diff > 100 ? diff : 0);
      };

      vv.addEventListener('resize', onResize);
      return () => vv.removeEventListener('resize', onResize);
    } else {
      const onKeyboardDidShow = (e: KeyboardEvent) => {
        setKeyboardHeight(e.endCoordinates.height);
      };

      const onKeyboardDidHide = () => {
        setKeyboardHeight(0);
      };

      const showSubscription = Keyboard.addListener('keyboardDidShow', onKeyboardDidShow);
      const hideSubscription = Keyboard.addListener('keyboardDidHide', onKeyboardDidHide);

      return () => {
        showSubscription.remove();
        hideSubscription.remove();
      };
    }
  }, []);

  return keyboardHeight;
};
