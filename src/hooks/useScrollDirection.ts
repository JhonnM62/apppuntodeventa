import { useRef } from 'react';
import { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useDockStore } from '../store/useDockStore';

export const useScrollDirection = () => {
  const lastOffsetY = useRef(0);
  const { setVisible, isVisible } = useDockStore();

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentOffsetY = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const layoutHeight = event.nativeEvent.layoutMeasurement.height;
    
    // Ignore bounces at the top or negative scrolls
    if (currentOffsetY < 0) return;

    // Si el usuario llega al puro final del scroll, ocultamos el dock automáticamente
    // para que deje interactuar con los botones inferiores
    const isAtBottom = currentOffsetY + layoutHeight >= contentHeight - 20; // 20px de margen de error

    if (isAtBottom && isVisible) {
      setVisible(false);
      lastOffsetY.current = currentOffsetY;
      return;
    }

    const difference = currentOffsetY - lastOffsetY.current;
    
    // Use a small threshold (e.g., 10px) to avoid flickering on tiny scrolls
    if (Math.abs(difference) > 10) {
      if (difference > 0 && isVisible && !isAtBottom) {
        // Scrolling down -> Hide dock
        setVisible(false);
      } else if (difference < 0 && !isVisible) {
        // Scrolling up -> Show dock
        setVisible(true);
      }
      lastOffsetY.current = currentOffsetY;
    }
  };

  return handleScroll;
};
