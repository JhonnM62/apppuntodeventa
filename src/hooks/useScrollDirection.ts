import { useRef, useState } from 'react';
import { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useDockStore } from '../store/useDockStore';

interface ScrollDirectionResult {
  /** Handler para pasar al prop `onScroll` de ScrollView/FlashList */
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** true cuando el usuario está desplazándose hacia abajo */
  isScrollingDown: boolean;
  /** true cuando la lista está en la parte superior */
  isAtTop: boolean;
  /** true cuando la lista está en la parte inferior */
  isAtBottom: boolean;
}

export const useScrollDirection = (): ScrollDirectionResult => {
  const lastOffsetY = useRef(0);
  const { setVisible, isVisible } = useDockStore();
  const [isScrollingDown, setIsScrollingDown] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(false);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentOffsetY = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const layoutHeight = event.nativeEvent.layoutMeasurement.height;

    // Ignore bounces at the top or negative scrolls
    if (currentOffsetY < 0) return;

    const atTop = currentOffsetY <= 0;
    const atBottom = currentOffsetY + layoutHeight >= contentHeight - 20; // 20px tolerance

    setIsAtTop(atTop);
    setIsAtBottom(atBottom);

    // Si el usuario llega al fondo, ocultamos el dock automáticamente
    if (atBottom && isVisible) {
      setVisible(false);
      lastOffsetY.current = currentOffsetY;
      return;
    }

    const difference = currentOffsetY - lastOffsetY.current;

    // Use a small threshold (e.g., 10px) to avoid flickering on tiny scrolls
    if (Math.abs(difference) > 10) {
      const scrollingDown = difference > 0;
      setIsScrollingDown(scrollingDown);

      if (scrollingDown && isVisible && !atBottom) {
        setVisible(false);
      } else if (!scrollingDown && !isVisible) {
        setVisible(true);
      }
      lastOffsetY.current = currentOffsetY;
    }
  };

  return { handleScroll, isScrollingDown, isAtTop, isAtBottom };
};
