import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, useWindowDimensions, TextInput, Platform, PanResponder, Modal, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEstadisticasStore } from '../../store/useEstadisticasStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { InsumoPrecioItem } from '../../services/estadisticas';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// Dynamic import for LineChart from react-native-gifted-charts to avoid crashes
let LineChart: any = null;
try {
  LineChart = require('react-native-gifted-charts').LineChart;
} catch (e) {
  LineChart = null;
}

// Optional import for PDF printing
let Print: any = null;
let Sharing: any = null;
try {
  Print = require('expo-print');
  Sharing = require('expo-sharing');
} catch (e) {
  console.warn('expo-print o expo-sharing no disponibles');
}

interface Props {
  startDate: Date;
  endDate: Date;
  nombreNegocio?: string;
}

interface SelectedPointDetail {
  insumoId: string;
  dateKey?: string;
  insumoNombre: string;
  insumoColor: string;
  categoria: string;
  unidad: string;
  fechaLabel: string;
  precio: number;
  proveedor: string;
  cantidad: number;
  variacion: number;
}

const EXTENDED_PALETTE = [
  '#2563eb', // Azul real
  '#10b981', // Verde esmeralda
  '#f59e0b', // Ámbar cálido
  '#8b5cf6', // Púrpura brillante
  '#ef4444', // Rojo coral
  '#06b6d4', // Cian brillante
  '#ec4899', // Rosa vibrante
  '#84cc16', // Lima eléctrico
  '#6366f1', // Índigo moderno
  '#14b8a6', // Teal tropical
  '#f97316', // Naranja fuego
  '#a855f7', // Violeta intenso
  '#0284c7', // Celeste cielo
  '#059669', // Verde profundo
  '#d97706', // Ocre tostado
  '#7c3aed', // Violeta eléctrico
  '#dc2626', // Carmesí vivo
  '#0891b2', // Azul petróleo
  '#db2777', // Magenta oscuro
  '#65a30d', // Oliva brillante
  '#4f46e5', // Azul cobalto
  '#0d9488', // Verde azulado
  '#ea580c', // Naranja quemado
  '#9333ea', // Morado real
  '#e11d48', // Rubí carmín
  '#16a34a', // Verde bosque
  '#b45309', // Canela dorado
  '#6d28d9', // Púrpura noche
  '#b91c1c', // Rojo borgoña
  '#0e7490', // Océano profundo
  '#be185d', // Fucsia silvestre
  '#4d7c0f', // Musgo oscuro
  '#4338ca', // Añil medianoche
  '#0f766e', // Turquesa oscuro
  '#c2410c', // Ladrillo óxido
  '#7e22ce', // Amatista oscura
  '#1d4ed8', // Azul zafiro
  '#15803d', // Jade esmeralda
  '#a16207', // Mostaza oro
  '#581c87', // Púrpura berenjena
  '#991b1b', // Vino tinto
  '#155e75', // Marino mineral
  '#9d174d', // Rosa granate
  '#3f6212', // Pino militar
  '#3730a3', // Índigo oscuro
  '#115e59', // Pavo real
  '#9a3412', // Terracota cálido
  '#6b21a8', // Ciruela intenso
];

const hslToHex = (h: number, s: number, l: number): string => {
  const lNorm = l / 100;
  const a = (s * Math.min(lNorm, 1 - lNorm)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

export const getInsumoColor = (index: number): string => {
  if (index < EXTENDED_PALETTE.length) {
    return EXTENDED_PALETTE[index];
  }
  const hue = Math.round((index * 137.508) % 360);
  const saturation = 75 + (index % 3) * 8;
  const lightness = 38 + (index % 4) * 4;
  return hslToHex(hue, saturation, lightness);
};

export default function VariacionPreciosInsumosView({ startDate, endDate, nombreNegocio }: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const chartWidth = Math.max(windowWidth - 48, 320);
  const chartCardRef = useRef<any>(null);
  const fullScreenChartCardRef = useRef<any>(null);
  const chartScrollRef = useRef<any>(null);
  const fullScreenChartScrollRef = useRef<any>(null);
  const scrollPositionRef = useRef<number>(0);
  const fullScreenScrollPositionRef = useRef<number>(0);

  const { preciosData, isLoading, fetchPreciosData } = useEstadisticasStore();
  const { primaryColor } = useSettingsStore();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<'todos' | 'aumento' | 'limpio' | 'custom'>('custom');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODAS');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [selectedPointDetail, setSelectedPointDetail] = useState<SelectedPointDetail | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Control de orientación al entrar o salir del modo horizontal ampliado
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const applyOrientation = async () => {
      try {
        if (isFullScreen) {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
        } else {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        }
      } catch (_e) {
        // Ignorar si el dispositivo no soporta lock de orientación
      }
    };

    applyOrientation();

    return () => {
      if (Platform.OS !== 'web') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      }
    };
  }, [isFullScreen]);

  const mainColor = primaryColor || '#3b82f6';

  // Cargar datos al cambiar fechas
  useEffect(() => {
    const s = format(startDate, 'yyyy-MM-dd');
    const e = format(endDate, 'yyyy-MM-dd');
    fetchPreciosData(s, e);
  }, [startDate, endDate, fetchPreciosData]);

  // Asignar colores únicos y de alto contraste a cada insumo del catálogo
  const insumosList = useMemo(() => {
    const raw = preciosData?.insumos || [];
    return raw.map((ins, idx) => ({
      ...ins,
      color: getInsumoColor(idx),
    }));
  }, [preciosData]);

  // Extraer categorías dinámicas con conteo de insumos
  const categoriesList = useMemo(() => {
    const counts = new Map<string, number>();
    insumosList.forEach(i => {
      const cat = (i.categoria || 'General').trim();
      counts.set(cat, (counts.get(cat) || 0) + 1);
    });
    const sorted = Array.from(counts.entries())
      .map(([nombre, count]) => ({ nombre, count }))
      .sort((a, b) => b.count - a.count);
    return [{ nombre: 'TODAS', count: insumosList.length }, ...sorted];
  }, [insumosList]);

  // Al cargar datos iniciales, preseleccionar los primeros con compras si la gráfica está vacía
  useEffect(() => {
    if (insumosList.length > 0 && selectedIds.size === 0 && filterMode !== 'limpio') {
      const conCompras = insumosList.filter(i => i.comprasRegistradas > 0);
      const preselect = (conCompras.length > 0 ? conCompras : insumosList).slice(0, 5).map(i => i.id);
      setSelectedIds(new Set(preselect));
      setFilterMode('custom');
    }
  }, [insumosList, filterMode]);

  const formatCOP = (val: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  // Insumos filtrados por categoría activa y término de búsqueda
  const categoryFilteredInsumos = useMemo(() => {
    if (selectedCategory === 'TODAS') return insumosList;
    return insumosList.filter(i => (i.categoria || 'General').trim().toUpperCase() === selectedCategory.toUpperCase());
  }, [insumosList, selectedCategory]);

  const searchFilteredInsumos = useMemo(() => {
    if (!searchTerm.trim()) return categoryFilteredInsumos;
    const term = searchTerm.toLowerCase().trim();
    return categoryFilteredInsumos.filter(i =>
      i.nombre.toLowerCase().includes(term) ||
      i.categoria.toLowerCase().includes(term) ||
      i.ultimoProveedor.toLowerCase().includes(term)
    );
  }, [categoryFilteredInsumos, searchTerm]);

  // Acciones Rápidas con indicación de estado activo
  const handleSelectAll = useCallback(() => {
    // Si hay una categoría seleccionada, seleccionar todos los de esa categoría; si es 'TODAS', todos los que tienen compras o todos
    const pool = selectedCategory === 'TODAS'
      ? insumosList.filter(i => i.comprasRegistradas > 0)
      : categoryFilteredInsumos;

    const toSelect = pool.length > 0 ? pool.map(i => i.id) : insumosList.map(i => i.id);
    setSelectedIds(new Set(toSelect));
    setFilterMode('todos');
  }, [insumosList, selectedCategory, categoryFilteredInsumos]);

  const handleOnlyIncreases = useCallback(() => {
    const pool = selectedCategory === 'TODAS' ? insumosList : categoryFilteredInsumos;
    const increases = pool.filter(i => i.variacionPorcentual > 0).map(i => i.id);
    setSelectedIds(new Set(increases));
    setFilterMode('aumento');
  }, [insumosList, selectedCategory, categoryFilteredInsumos]);

  const handleClearAll = useCallback(() => {
    setSelectedIds(new Set());
    setFilterMode('limpio');
    setSelectedPointDetail(null);
  }, []);

  const toggleInsumo = useCallback((id: string) => {
    setFilterMode('custom');
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectCategoryAndActivate = useCallback((catName: string) => {
    setSelectedCategory(catName);
    if (catName !== 'TODAS') {
      const catInsumos = insumosList.filter(i => (i.categoria || 'General').trim().toUpperCase() === catName.toUpperCase());
      setSelectedIds(new Set(catInsumos.map(i => i.id)));
      setFilterMode('custom');
    }
  }, [insumosList]);

  // Insumos activos en la gráfica
  const activeInsumos = useMemo(() => {
    return insumosList.filter(i => selectedIds.has(i.id));
  }, [insumosList, selectedIds]);

  // Auto-seleccionar primer insumo activo si no hay detalle seleccionado o si el insumo seleccionado fue deseleccionado
  useEffect(() => {
    if (activeInsumos.length > 0) {
      const isStillActive = activeInsumos.some(i => i.id === selectedPointDetail?.insumoId);
      if (!isStillActive) {
        const first = activeInsumos[0];
        const lastPoint = first.seriePuntos[first.seriePuntos.length - 1];
        const d = lastPoint ? new Date(lastPoint.date + 'T12:00:00') : new Date();
        setSelectedPointDetail({
          insumoId: first.id,
          insumoNombre: first.nombre,
          insumoColor: first.color,
          categoria: first.categoria,
          unidad: first.unidad,
          fechaLabel: lastPoint ? format(d, "d 'de' MMMM, yyyy", { locale: es }) : 'Vigente en catálogo',
          precio: first.precioActual,
          proveedor: first.ultimoProveedor,
          cantidad: lastPoint?.cantidad || 0,
          variacion: first.variacionPorcentual,
        });
      }
    } else {
      setSelectedPointDetail(null);
    }
  }, [activeInsumos, selectedPointDetail?.insumoId]);

  // Preparar dataSet para Gifted Charts LineChart con interacción táctil (onPress)
  const { chartDataSet, allDatesLabels } = useMemo(() => {
    if (activeInsumos.length === 0) {
      return { chartDataSet: [], allDatesLabels: [] };
    }

    // Unificar todas las fechas únicas de los insumos seleccionados
    const dateSet = new Set<string>();
    activeInsumos.forEach(ins => {
      ins.seriePuntos.forEach(p => dateSet.add(p.date));
    });

    const sortedDates = Array.from(dateSet).sort();
    if (sortedDates.length === 0) {
      const sDateStr = format(startDate, 'yyyy-MM-dd');
      const eDateStr = format(endDate, 'yyyy-MM-dd');
      sortedDates.push(sDateStr, eDateStr);
    }

    const dataSet = activeInsumos.map(ins => {
      const isLineSelected = selectedPointDetail?.insumoId === ins.id;
      const pointsMap = new Map<string, number>();
      const pointsObjMap = new Map<string, any>();
      ins.seriePuntos.forEach(p => {
        pointsMap.set(p.date, p.value);
        pointsObjMap.set(p.date, p);
      });

      // Para fechas antes de la primera compra registrada en este período, usamos el primer precio real registrado
      // Esto evita que un precioAnterior desproporcionado (ej. $10.880) dispare la línea fuera del eje Y antes de la compra
      const firstRecordedPrice = ins.seriePuntos.length > 0
        ? ins.seriePuntos[0].value
        : (ins.precioActual > 0 ? ins.precioActual : (ins.precioInicial > 0 ? ins.precioInicial : 0));
      let lastKnownPrice = firstRecordedPrice;

      const lineData = sortedDates.map(dateKey => {
        if (pointsMap.has(dateKey)) {
          lastKnownPrice = pointsMap.get(dateKey)!;
        }
        const pointData = pointsObjMap.get(dateKey);
        const d = new Date(dateKey + 'T12:00:00');
        const label = format(d, 'd MMM', { locale: es });
        const currentPrice = lastKnownPrice;
        const isPointSelected =
          selectedPointDetail?.insumoId === ins.id &&
          selectedPointDetail?.dateKey === dateKey;

        return {
          value: currentPrice,
          label: label,
          labelTextStyle: isPointSelected
            ? { color: ins.color, fontWeight: '900', fontSize: 10 }
            : { color: '#4b5563', fontSize: 9, fontWeight: 'bold' },
          dataPointRadius: isPointSelected ? 12 : (isLineSelected ? 6 : 4),
          dataPointsRadius: isPointSelected ? 12 : (isLineSelected ? 6 : 4),
          dataPointColor: ins.color,
          dataPointsColor: ins.color,
          showVerticalLine: isPointSelected,
          verticalLineColor: ins.color,
          verticalLineThickness: 2,
          verticalLineStrokeDashArray: [4, 4],
          verticalLineUptoDataPoint: true,
          // Solo mostrar valor flotante en el punto seleccionado para evitar amontonamiento de números entre líneas
          dataPointText: isPointSelected
            ? `$${Math.round(currentPrice).toLocaleString('es-CO')}`
            : undefined,
          textColor: '#0f172a',
          textFontSize: 12,
          textShiftY: -16,
          onPress: () => {
            setSelectedPointDetail({
              insumoId: ins.id,
              dateKey: dateKey,
              insumoNombre: ins.nombre,
              insumoColor: ins.color,
              categoria: ins.categoria,
              unidad: ins.unidad,
              fechaLabel: format(d, "d 'de' MMMM, yyyy", { locale: es }),
              precio: currentPrice,
              proveedor: pointData?.proveedor || ins.ultimoProveedor,
              cantidad: pointData?.cantidad || 0,
              variacion: ins.variacionPorcentual,
            });
          },
        };
      });

      return {
        id: ins.id,
        data: lineData,
        color: ins.color,
        thickness: isLineSelected ? 4 : 2,
        dataPointsColor: ins.color,
        dataPointsRadius: isLineSelected ? 6 : 4,
        textColor: '#374151',
        textFontSize: 9,
        curved: true,
        curvature: 0.12,
      };
    });

    // Ordenar para que el insumo seleccionado se dibuje de ÚLTIMO (encima de todas las demás líneas en SVG)
    dataSet.sort((a, b) => {
      const aSelected = a.id === selectedPointDetail?.insumoId;
      const bSelected = b.id === selectedPointDetail?.insumoId;
      if (aSelected && !bSelected) return 1;
      if (!aSelected && bSelected) return -1;
      return 0;
    });

    return { chartDataSet: dataSet, allDatesLabels: sortedDates };
  }, [activeInsumos, startDate, endDate, selectedPointDetail?.insumoId, selectedPointDetail?.dateKey]);

  // Espaciado dinámico horizontal entre puntos según el nivel de zoom
  const chartSpacing = useMemo(() => {
    const minSpacing = 54;
    const count = allDatesLabels.length > 0 ? allDatesLabels.length : 1;
    const baseSpacing = Math.max(minSpacing, Math.round((chartWidth - 80) / count));
    return Math.max(36, Math.round(baseSpacing * zoomLevel));
  }, [chartWidth, allDatesLabels.length, zoomLevel]);

  // Altura dinámica de la gráfica según el nivel de zoom
  const chartHeight = useMemo(() => {
    const baseHeight = 230;
    return Math.round(baseHeight * (1 + (zoomLevel - 1) * 0.38));
  }, [zoomLevel]);

  // Dimensiones para modo horizontal ampliado
  const fullScreenVisibleWidth = useMemo(() => {
    if (Platform.OS === 'web') {
      return Math.max(windowWidth - 48, 750);
    }
    return Math.max(windowWidth, windowHeight) - 32;
  }, [windowWidth, windowHeight]);

  const fullScreenChartHeight = useMemo(() => {
    const screenShortSide = Math.min(windowWidth, windowHeight);
    // En horizontal, reservamos ~82px para barra superior + chips, dejando todo el resto a la gráfica
    const baseHeight = Math.max(220, screenShortSide - 82);
    return Math.round(baseHeight * (1 + (zoomLevel - 1) * 0.25));
  }, [windowWidth, windowHeight, zoomLevel]);

  const fullScreenSpacing = useMemo(() => {
    const minSpacing = 68;
    const count = allDatesLabels.length > 1 ? allDatesLabels.length - 1 : 1;
    const baseSpacing = Math.max(minSpacing, Math.round((fullScreenVisibleWidth - 90) / count));
    return Math.max(48, Math.round(baseSpacing * zoomLevel));
  }, [fullScreenVisibleWidth, allDatesLabels.length, zoomLevel]);

  // Configuración dinámica inteligente del eje Y para máxima precisión en variaciones pequeñas ($100, $200, $500)
  const chartYConfig = useMemo(() => {
    if (activeInsumos.length === 0) {
      return {
        yAxisOffset: 0,
        maxValue: 10000,
        noOfSections: 4,
        stepValue: 2500,
      };
    }

    const allPrices: number[] = [];
    activeInsumos.forEach(ins => {
      ins.seriePuntos.forEach(p => {
        if (typeof p.value === 'number' && !isNaN(p.value) && p.value > 0) {
          allPrices.push(p.value);
        }
      });
      if (ins.precioActual > 0) allPrices.push(ins.precioActual);
    });

    if (allPrices.length === 0) {
      return {
        yAxisOffset: 0,
        maxValue: 10000,
        noOfSections: 4,
        stepValue: 2500,
      };
    }

    const rawMin = Math.min(...allPrices);
    const rawMax = Math.max(...allPrices);
    const priceDiff = rawMax - rawMin;

    // Activamos escala ajustada al rango si los precios no empiezan en 0 o si hay zoom
    // Esto evita comprimir variaciones de $100, $200, $500 y elimina espacios vacíos gigantes
    const shouldOffset = rawMin >= 500 && (priceDiff < rawMax * 0.85 || zoomLevel >= 1.3);

    if (shouldOffset) {
      const effectiveDiff = Math.max(priceDiff, 200);
      let step = 100;
      if (effectiveDiff > 100000) step = 20000;
      else if (effectiveDiff > 50000) step = 10000;
      else if (effectiveDiff > 20000) step = 5000;
      else if (effectiveDiff > 10000) step = 2000;
      else if (effectiveDiff > 4000) step = 1000;
      else if (effectiveDiff > 1500) step = 500;
      else if (effectiveDiff > 600) step = 200;
      else if (effectiveDiff > 200) step = 100;
      else step = 50;

      // Base inferior con holgura por debajo del mínimo pero >= 0
      let baseMin = Math.max(0, Math.floor((rawMin - step * 0.5) / step) * step);
      // Tope superior con holgura por encima del máximo
      let topMax = Math.ceil((rawMax + step * 0.5) / step) * step;
      let targetSpan = topMax - baseMin;

      let numSections = Math.round(targetSpan / step);
      if (numSections < 4) {
        numSections = 4;
        targetSpan = step * 4;
      } else if (numSections > 6) {
        step = Math.ceil(targetSpan / 5 / step) * step;
        numSections = Math.ceil(targetSpan / step);
        targetSpan = step * numSections;
      }

      return {
        yAxisOffset: baseMin,
        maxValue: targetSpan,
        noOfSections: numSections,
        stepValue: step,
      };
    } else {
      let step = 500;
      if (rawMax > 1000000) step = 200000;
      else if (rawMax > 500000) step = 100000;
      else if (rawMax > 200000) step = 50000;
      else if (rawMax > 100000) step = 20000;
      else if (rawMax > 50000) step = 10000;
      else if (rawMax > 20000) step = 5000;
      else if (rawMax > 10000) step = 2000;
      else if (rawMax > 4000) step = 1000;
      else if (rawMax > 1500) step = 500;
      else step = 200;

      let numSections = Math.ceil(rawMax / step);
      if (numSections < 4) numSections = 4;
      if (numSections > 6) {
        step = Math.ceil(rawMax / 5 / 100) * 100;
        numSections = 5;
      }
      const finalMax = step * numSections;

      return {
        yAxisOffset: 0,
        maxValue: finalMax,
        noOfSections: numSections,
        stepValue: step,
      };
    }
  }, [activeInsumos, zoomLevel]);

  // Formato exacto y legible para etiquetas del eje Y (sin redondear falsamente a 4k cuando es 3.600)
  const formatYAxisLabel = useCallback((val: string) => {
    const n = Math.round(Number(val));
    if (isNaN(n)) return val;
    if (n === 0) return '$0';

    if (n >= 1000000) {
      const m = n / 1000000;
      return m % 1 === 0 ? `$${m}M` : `$${m.toFixed(1)}M`;
    }

    // Si los números están por debajo de 10.000 o tienen cientos (ej: $3.200, $3.400, $3.600, $3.800):
    if (n % 1000 !== 0 || n < 10000) {
      return `$${n.toLocaleString('es-CO')}`;
    }

    // Múltiplos exactos de 10k o superiores (ej: $10k, $20k, $50k)
    return `$${n / 1000}k`;
  }, []);

  // Desplazamiento horizontal de la gráfica (para botones, arrastre y rueda del ratón)
  const scrollChartHorizontally = useCallback((direction: 'left' | 'right', amount: number = 240) => {
    const isFs = isFullScreen;
    const currentRef = isFs ? fullScreenChartScrollRef : chartScrollRef;
    const currentPosRef = isFs ? fullScreenScrollPositionRef : scrollPositionRef;
    const cardRef = isFs ? fullScreenChartCardRef : chartCardRef;

    // 1. Desplazamiento mediante ref de ScrollView
    const nextX = Math.max(0, currentPosRef.current + (direction === 'right' ? amount : -amount));
    currentPosRef.current = nextX;
    if (currentRef.current?.scrollTo) {
      currentRef.current.scrollTo({ x: nextX, animated: true });
    }

    // 2. En Web, también desplazar el contenedor DOM directamente
    if (Platform.OS === 'web' && cardRef.current) {
      const root = cardRef.current.nodeType ? cardRef.current : (cardRef.current.getScrollableNode?.() || cardRef.current);
      if (root) {
        const candidates = [root, ...Array.from(root.querySelectorAll('*'))];
        const scrollable: any = candidates.find((el: any) => el.scrollWidth > el.clientWidth && el.clientWidth > 0);
        if (scrollable) {
          scrollable.scrollBy({
            left: direction === 'right' ? amount : -amount,
            behavior: 'smooth',
          });
        }
      }
    }
  }, [isFullScreen]);

  // Listener nativo para Desktop Web: Zoom con rueda, Desplazamiento Horizontal (Drag o Shift+Wheel)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const setupWebInteractions = (cardRef: any) => {
      if (!cardRef.current) return null;
      const root = cardRef.current.nodeType ? cardRef.current : (cardRef.current.getScrollableNode?.() || cardRef.current);
      if (!root || !root.addEventListener) return null;

      const findScrollable = (): HTMLElement | null => {
        const candidates = [root, ...Array.from(root.querySelectorAll('*'))];
        return (candidates.find((el: any) => el.scrollWidth > el.clientWidth && el.clientWidth > 0) as HTMLElement) || null;
      };

      // 1. Manejo de rueda del ratón (Shift + rueda o trackpad = scroll horizontal; rueda vertical sola = zoom)
      const onWheelHandler = (e: WheelEvent) => {
        const targetScrollable = findScrollable();

        // Si es desplazamiento horizontal (Shift + rueda o movimiento horizontal de trackpad)
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          if (targetScrollable) {
            e.preventDefault();
            e.stopPropagation();
            const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
            targetScrollable.scrollLeft += delta;
            return;
          }
        }

        // Si es rueda vertical estándar: Zoom
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY < 0) {
          setZoomLevel(prev => Math.min(Number((prev + 0.15).toFixed(2)), 3.5));
        } else if (e.deltaY > 0) {
          setZoomLevel(prev => Math.max(Number((prev - 0.15).toFixed(2)), 0.6));
        }
      };

      // 2. Arrastre con clic izquierdo del ratón (Drag to Scroll / Pan)
      let isDown = false;
      let startX = 0;
      let scrollLeft = 0;
      let targetScrollable: HTMLElement | null = null;

      const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return; // Solo clic primario
        const target = e.target as HTMLElement;
        if (target && (target.closest('button') || target.closest('[role="button"]'))) return;

        targetScrollable = findScrollable();
        if (!targetScrollable) return;

        isDown = true;
        startX = e.pageX - targetScrollable.offsetLeft;
        scrollLeft = targetScrollable.scrollLeft;
        root.style.cursor = 'grabbing';
      };

      const onMouseMove = (e: MouseEvent) => {
        if (!isDown || !targetScrollable) return;
        e.preventDefault();
        const x = e.pageX - targetScrollable.offsetLeft;
        const walk = (x - startX) * 1.5;
        targetScrollable.scrollLeft = scrollLeft - walk;
      };

      const onMouseUp = () => {
        if (isDown) {
          isDown = false;
          root.style.cursor = 'grab';
        }
      };

      root.style.cursor = 'grab';
      root.addEventListener('wheel', onWheelHandler, { passive: false });
      root.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      return () => {
        root.removeEventListener('wheel', onWheelHandler);
        root.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
    };

    const cleanup1 = setupWebInteractions(chartCardRef);
    const cleanup2 = setupWebInteractions(fullScreenChartCardRef);

    return () => {
      if (cleanup1) cleanup1();
      if (cleanup2) cleanup2();
    };
  }, [isFullScreen, activeInsumos, zoomLevel]);

  // PanResponder para gesto de pellizco (pinch-to-zoom) en móvil (Android / iOS) sin bloquear scroll
  const panResponder = useMemo(() => {
    let initialDistance = 0;
    let initialZoom = 1;

    return PanResponder.create({
      onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          initialDistance = Math.hypot(
            touches[0].pageX - touches[1].pageX,
            touches[0].pageY - touches[1].pageY
          );
          initialZoom = zoomLevel;
        }
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2 && initialDistance > 0) {
          const currentDistance = Math.hypot(
            touches[0].pageX - touches[1].pageX,
            touches[0].pageY - touches[1].pageY
          );
          const scale = currentDistance / initialDistance;
          const nextZoom = Math.max(0.6, Math.min(3.5, Number((initialZoom * scale).toFixed(2))));
          setZoomLevel(nextZoom);
        }
      },
      onPanResponderRelease: () => {
        initialDistance = 0;
      },
      onPanResponderTerminate: () => {
        initialDistance = 0;
      },
    });
  }, [zoomLevel]);

  // Exportar reporte a PDF
  const handleExportPDF = async () => {
    if (!Print || !Sharing) return;
    setIsExportingPdf(true);
    try {
      const startStr = format(startDate, "d 'de' MMMM, yyyy", { locale: es });
      const endStr = format(endDate, "d 'de' MMMM, yyyy", { locale: es });

      const rowsHtml = searchFilteredInsumos.map((ins, i) => {
        const varColor = ins.variacionPorcentual > 0 ? '#dc2626' : ins.variacionPorcentual < 0 ? '#16a34a' : '#6b7280';
        const varSign = ins.variacionPorcentual > 0 ? '+' : '';
        return `
          <tr style="border-bottom: 1px solid #e5e7eb; background-color: ${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
            <td style="padding: 8px; font-weight: bold; color: #1f2937;">${ins.nombre}</td>
            <td style="padding: 8px; color: #4b5563;">${ins.categoria}</td>
            <td style="padding: 8px; text-align: right; font-weight: bold;">${formatCOP(ins.precioActual)}</td>
            <td style="padding: 8px; text-align: right;">${formatCOP(ins.precioPromedio)}</td>
            <td style="padding: 8px; text-align: center; color: ${varColor}; font-weight: bold;">
              ${varSign}${ins.variacionPorcentual}%
            </td>
            <td style="padding: 8px; color: #6b7280;">${ins.ultimoProveedor}</td>
            <td style="padding: 8px; text-align: right;">${ins.totalComprado} ${ins.unidad}</td>
          </tr>
        `;
      }).join('');

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>Variación de Precios de Insumos</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { font-size: 20px; margin-bottom: 4px; color: #1f2937; }
            .subtitle { font-size: 13px; color: #6b7280; margin-bottom: 20px; }
            .kpis { display: flex; gap: 12px; margin-bottom: 20px; }
            .kpi-card { flex: 1; padding: 12px; border-radius: 8px; background-color: #f3f4f6; border: 1px solid #e5e7eb; }
            .kpi-title { font-size: 10px; text-transform: uppercase; color: #6b7280; font-weight: bold; }
            .kpi-value { font-size: 18px; font-weight: bold; margin-top: 4px; color: #111827; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { background-color: #1f2937; color: white; padding: 8px; text-align: left; }
            th.right { text-align: right; }
            th.center { text-align: center; }
          </style>
        </head>
        <body>
          <h1>${nombreNegocio || 'Q\'hubo Mor POS'} — Reporte de Variación de Precios de Insumos</h1>
          <div class="subtitle">Período auditado: <strong>${startStr}</strong> hasta <strong>${endStr}</strong></div>

          <div class="kpis">
            <div class="kpi-card">
              <div class="kpi-title">Insumos Auditados</div>
              <div class="kpi-value">${preciosData?.resumen.totalInsumosAuditados || 0}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">Con Aumento de Costo</div>
              <div class="kpi-value" style="color: #dc2626;">${preciosData?.resumen.insumosConAumento || 0} 📈</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">Con Reducción de Costo</div>
              <div class="kpi-value" style="color: #16a34a;">${preciosData?.resumen.insumosConBaja || 0} 📉</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">Precios Estables</div>
              <div class="kpi-value" style="color: #4b5563;">${preciosData?.resumen.insumosEstables || 0}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Insumo</th>
                <th>Categoría</th>
                <th class="right">Precio Actual</th>
                <th class="right">Precio Promedio</th>
                <th class="center">Variación %</th>
                <th>Último Proveedor</th>
                <th class="right">Total Comprado</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (err) {
      console.error('Error generando PDF de precios:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (isLoading && (!preciosData || insumosList.length === 0)) {
    return (
      <View className="flex-1 justify-center items-center py-20">
        <ActivityIndicator size="large" color={mainColor} />
        <Text className="mt-4 text-gray-500 font-medium">Analizando variación de precios de insumos...</Text>
      </View>
    );
  }

  if (!isLoading && insumosList.length === 0) {
    return (
      <View className="flex-1 justify-center items-center py-20 px-6">
        <Ionicons name="pricetags-outline" size={64} color="#d1d5db" />
        <Text className="mt-4 text-gray-500 font-bold text-center text-lg">No hay insumos registrados</Text>
        <Text className="mt-2 text-gray-400 text-center text-sm">
          Añade insumos o registra compras en el inventario para visualizar el historial comparativo de precios.
        </Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 110 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* 1. KPIs Rápidos */}
      {preciosData?.resumen && (
        <View className="flex-row bg-white rounded-2xl p-3 mb-3 shadow-sm border border-gray-100 justify-between items-center">
          <View className="items-center flex-1">
            <Text className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Auditados</Text>
            <Text className="text-base font-black text-gray-800">{preciosData.resumen.totalInsumosAuditados}</Text>
          </View>
          <View className="w-[1px] h-8 bg-gray-200" />
          <View className="items-center flex-1">
            <Text className="text-[10px] text-red-500 font-bold uppercase tracking-wider">Aumento</Text>
            <Text className="text-base font-black text-red-600">+{preciosData.resumen.insumosConAumento}</Text>
          </View>
          <View className="w-[1px] h-8 bg-gray-200" />
          <View className="items-center flex-1">
            <Text className="text-[10px] text-green-600 font-bold uppercase tracking-wider">Baja</Text>
            <Text className="text-base font-black text-green-600">-{preciosData.resumen.insumosConBaja}</Text>
          </View>
          <View className="w-[1px] h-8 bg-gray-200" />
          <View className="items-center flex-1">
            <Text className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Estables</Text>
            <Text className="text-base font-black text-gray-600">{preciosData.resumen.insumosEstables}</Text>
          </View>
        </View>
      )}

      {/* 2. Barra de Control Rápido con Estado Activo Claro */}
      <View className="bg-white rounded-2xl p-2 mb-3 shadow-sm border border-gray-100">
        <View className="flex-row items-center justify-between gap-1.5">
          <TouchableOpacity
            onPress={handleSelectAll}
            className={`flex-1 py-2 px-2 rounded-xl flex-row items-center justify-center border ${
              filterMode === 'todos'
                ? 'bg-blue-600 border-blue-600 shadow-sm'
                : 'bg-gray-50 border-gray-200'
            }`}
          >
            <Ionicons
              name={filterMode === 'todos' ? 'checkmark-circle' : 'eye-outline'}
              size={14}
              color={filterMode === 'todos' ? '#ffffff' : '#4b5563'}
              style={{ marginRight: 4 }}
            />
            <Text
              className={`text-xs font-bold ${
                filterMode === 'todos' ? 'text-white font-black' : 'text-gray-700'
              }`}
            >
              Ver Todos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleOnlyIncreases}
            className={`flex-1 py-2 px-2 rounded-xl flex-row items-center justify-center border ${
              filterMode === 'aumento'
                ? 'bg-red-600 border-red-600 shadow-sm'
                : 'bg-red-50 border-red-200'
            }`}
          >
            <Ionicons
              name="trending-up"
              size={14}
              color={filterMode === 'aumento' ? '#ffffff' : '#dc2626'}
              style={{ marginRight: 4 }}
            />
            <Text
              className={`text-xs font-bold ${
                filterMode === 'aumento' ? 'text-white font-black' : 'text-red-700'
              }`}
            >
              Solo Aumento
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClearAll}
            className={`flex-1 py-2 px-2 rounded-xl flex-row items-center justify-center border ${
              filterMode === 'limpio'
                ? 'bg-gray-800 border-gray-800 shadow-sm'
                : 'bg-gray-50 border-gray-200'
            }`}
          >
            <Ionicons
              name="close-circle-outline"
              size={14}
              color={filterMode === 'limpio' ? '#ffffff' : '#6b7280'}
              style={{ marginRight: 4 }}
            />
            <Text
              className={`text-xs font-bold ${
                filterMode === 'limpio' ? 'text-white font-black' : 'text-gray-600'
              }`}
            >
              Limpiar
            </Text>
          </TouchableOpacity>

          {Print && Sharing && (
            <TouchableOpacity
              onPress={handleExportPDF}
              disabled={isExportingPdf}
              className="py-2 px-3 bg-blue-50 border border-blue-200 rounded-xl flex-row items-center justify-center"
            >
              {isExportingPdf ? (
                <ActivityIndicator size="small" color="#2563eb" />
              ) : (
                <Ionicons name="document-text-outline" size={16} color="#2563eb" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 3. Filtro Horizontal por Categoría */}
      <View className="mb-3">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="py-0.5" style={{ flexGrow: 0, maxHeight: 44 }}>
          {categoriesList.map(cat => {
            const isCatActive = selectedCategory.toUpperCase() === cat.nombre.toUpperCase();
            return (
              <TouchableOpacity
                key={cat.nombre}
                onPress={() => selectCategoryAndActivate(cat.nombre)}
                className={`px-3 py-1.5 rounded-full mr-2 flex-row items-center border ${
                  isCatActive
                    ? 'bg-blue-600 border-blue-600 shadow-sm'
                    : 'bg-white border-gray-200'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    isCatActive ? 'text-white' : 'text-gray-700'
                  }`}
                >
                  {cat.nombre}
                </Text>
                <View
                  className={`ml-1.5 px-1.5 py-0.2 rounded-full ${
                    isCatActive ? 'bg-blue-700' : 'bg-gray-100'
                  }`}
                >
                  <Text
                    className={`text-[10px] font-bold ${
                      isCatActive ? 'text-white' : 'text-gray-500'
                    }`}
                  >
                    {cat.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 4. Chips de Insumos Activos en la Gráfica */}
      {activeInsumos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 py-1" style={{ flexGrow: 0, maxHeight: 44 }}>
          {activeInsumos.map(ins => {
            const isHighlighted = selectedPointDetail?.insumoId === ins.id;
            return (
              <View
                key={ins.id}
                className={`flex-row items-center rounded-full mr-2 shadow-sm border ${
                  isHighlighted ? 'bg-blue-50 border-blue-400' : 'bg-white border-gray-200'
                }`}
              >
                <TouchableOpacity
                  onPress={() => {
                    const lastPoint = ins.seriePuntos[ins.seriePuntos.length - 1];
                    const d = lastPoint ? new Date(lastPoint.date + 'T12:00:00') : new Date();
                    const dateKey = lastPoint ? lastPoint.date : (allDatesLabels[allDatesLabels.length - 1] || '');
                    setSelectedPointDetail({
                      insumoId: ins.id,
                      dateKey: dateKey,
                      insumoNombre: ins.nombre,
                      insumoColor: ins.color,
                      categoria: ins.categoria,
                      unidad: ins.unidad,
                      fechaLabel: lastPoint ? format(d, "d 'de' MMMM, yyyy", { locale: es }) : 'Vigente en catálogo',
                      precio: ins.precioActual,
                      proveedor: ins.ultimoProveedor,
                      cantidad: lastPoint?.cantidad || 0,
                      variacion: ins.variacionPorcentual,
                    });
                  }}
                  className="flex-row items-center pl-3 py-1.5 pr-1.5"
                >
                  <View
                    style={{
                      backgroundColor: ins.color,
                      width: isHighlighted ? 10 : 8,
                      height: isHighlighted ? 10 : 8,
                      borderRadius: 5,
                      marginRight: 6,
                    }}
                  />
                  <Text className={`text-xs font-bold mr-1 ${isHighlighted ? 'text-blue-900 font-black' : 'text-gray-800'}`}>
                    {ins.nombre}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => toggleInsumo(ins.id)}
                  className="pr-2.5 py-1.5 pl-1"
                >
                  <Ionicons name="close" size={14} color="#9ca3af" />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 mb-3 flex-row items-center">
          <Ionicons name="information-circle-outline" size={18} color="#d97706" className="mr-2" />
          <Text className="text-xs text-amber-800 font-medium flex-1">
            Gráfica limpia. Toca el botón de ojo (👁) en la lista o pulsa "Ver Todos" para comparar curvas de precios.
          </Text>
        </View>
      )}

      {/* 5. Gráfica Multilínea con Soporte de Zoom (Pellizcar en móvil / Ruedita en Desktop) */}
      <View
        ref={chartCardRef}
        className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 mb-3"
        {...(Platform.OS === 'web' ? {} : panResponder.panHandlers)}
      >
        <View className="flex-row justify-between items-center mb-3 flex-wrap gap-2">
          <View className="flex-1 min-w-[160px] mr-2">
            <Text className="text-sm font-black text-gray-800">Evolución Comparativa de Precios</Text>
            <Text className="text-[10px] text-gray-400 font-medium">
              {Platform.OS === 'web'
                ? 'Arrastra con el ratón o usa ◀ ▶ para explorar • Ruedita para zoom'
                : 'Pellizca para zoom • Toca puntos para detalle'}
            </Text>
          </View>

          {/* Botones de Control de Zoom y Desplazamiento (Desktop y Móvil) */}
          <View className="flex-row items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {/* Botones de Desplazamiento Horizontal (Izquierda / Derecha) */}
            <View className="flex-row items-center gap-0.5 bg-white p-0.5 rounded-lg border border-gray-200 mr-1 shadow-xs">
              <TouchableOpacity
                onPress={() => scrollChartHorizontally('left')}
                className="w-7 h-7 bg-gray-50 rounded-md items-center justify-center"
                accessibilityLabel="Desplazar gráfica a la izquierda"
              >
                <Ionicons name="chevron-back" size={15} color="#374151" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => scrollChartHorizontally('right')}
                className="w-7 h-7 bg-gray-50 rounded-md items-center justify-center"
                accessibilityLabel="Desplazar gráfica a la derecha"
              >
                <Ionicons name="chevron-forward" size={15} color="#374151" />
              </TouchableOpacity>
            </View>

            {/* Botón para expandir a pantalla completa horizontal */}
            <TouchableOpacity
              onPress={() => setIsFullScreen(true)}
              className="px-2.5 h-7 bg-blue-600 rounded-lg flex-row items-center justify-center shadow-xs mr-1"
              accessibilityLabel="Ver en pantalla completa horizontal"
            >
              <Ionicons name="scan-outline" size={13} color="#ffffff" style={{ marginRight: 3 }} />
              <Text className="text-[10px] font-black text-white">Horizontal</Text>
            </TouchableOpacity>

            {/* Presets rápidos para Desktop */}
            {(Platform.OS === 'web' || windowWidth >= 768) && (
              <View className="flex-row items-center mr-1">
                {[0.8, 1, 1.5, 2].map((preset) => {
                  const isActive = Math.abs(zoomLevel - preset) < 0.05;
                  return (
                    <TouchableOpacity
                      key={preset}
                      onPress={() => setZoomLevel(preset)}
                      className={`px-2 py-1 rounded-lg mr-1 ${
                        isActive ? 'bg-blue-600 shadow-xs' : 'bg-white'
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-bold ${
                          isActive ? 'text-white font-black' : 'text-gray-600'
                        }`}
                      >
                        {Math.round(preset * 100)}%
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <View className="w-[1px] h-4 bg-gray-300 mx-1" />
              </View>
            )}

            <TouchableOpacity
              onPress={() => setZoomLevel(prev => Math.max(Number((prev - 0.25).toFixed(2)), 0.6))}
              className="w-7 h-7 bg-white rounded-lg items-center justify-center shadow-xs"
              accessibilityLabel="Alejar zoom"
            >
              <Ionicons name="remove" size={14} color="#374151" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setZoomLevel(1)}
              className="px-2 h-7 bg-white rounded-lg items-center justify-center shadow-xs"
              accessibilityLabel="Restablecer al 100%"
            >
              <Text className="text-[10px] font-bold text-gray-700">{Math.round(zoomLevel * 100)}%</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setZoomLevel(prev => Math.min(Number((prev + 0.25).toFixed(2)), 3.5))}
              className="w-7 h-7 bg-white rounded-lg items-center justify-center shadow-xs"
              accessibilityLabel="Acercar zoom"
            >
              <Ionicons name="add" size={14} color="#374151" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setZoomLevel(1)}
              className="w-7 h-7 bg-white rounded-lg items-center justify-center shadow-xs"
              accessibilityLabel="Restablecer vista inicial"
            >
              <Ionicons name="refresh-outline" size={13} color="#6b7280" />
            </TouchableOpacity>
          </View>
        </View>

        {activeInsumos.length > 0 && LineChart && chartDataSet.length > 0 ? (
          <View style={{ alignItems: 'center', overflow: 'hidden' }}>
            <LineChart
              scrollRef={chartScrollRef}
              onScroll={(e: any) => {
                if (e?.nativeEvent?.contentOffset?.x !== undefined) {
                  scrollPositionRef.current = e.nativeEvent.contentOffset.x;
                }
              }}
              dataSet={chartDataSet}
              width={chartWidth - 56}
              height={chartHeight}
              spacing={chartSpacing}
              initialSpacing={24}
              endSpacing={24}
              yAxisOffset={chartYConfig.yAxisOffset}
              maxValue={chartYConfig.maxValue}
              noOfSections={chartYConfig.noOfSections}
              stepValue={chartYConfig.stepValue}
              yAxisLabelWidth={56}
              color1={activeInsumos[0]?.color || mainColor}
              textColor1="#374151"
              dataPointsColor1={activeInsumos[0]?.color || mainColor}
              startFillColor1={activeInsumos[0]?.color || mainColor}
              endFillColor1="transparent"
              startOpacity={0.15}
              endOpacity={0.0}
              yAxisColor="#e5e7eb"
              xAxisColor="#e5e7eb"
              yAxisTextStyle={{ color: '#64748b', fontSize: 9, fontWeight: '700' }}
              xAxisLabelTextStyle={{ color: '#4b5563', fontSize: 9, fontWeight: 'bold' }}
              xAxisLabelsHeight={24}
              rulesType="solid"
              rulesColor="#f3f4f6"
              showScrollIndicator={chartSpacing * allDatesLabels.length > chartWidth - 56}
              indicatorColor="#d1d5db"
              formatYLabel={formatYAxisLabel}
              curved
              curvature={0.12}
              isAnimated={false}
              renderDataPointsAfterAnimationEnds={true}
              onPress={(item: any) => {
                if (item && item.onPress) {
                  item.onPress();
                }
              }}
            />
          </View>
        ) : (
          <View className="py-12 items-center justify-center">
            <Ionicons name="analytics-outline" size={48} color="#d1d5db" />
            <Text className="mt-2 text-xs font-bold text-gray-400 text-center">
              Selecciona uno o más insumos para visualizar las curvas de precio
            </Text>
          </View>
        )}
      </View>

      {/* 6. Tarjeta Interactiva de Detalle de Insumo y Fecha (Al tocar punto o línea) */}
      {selectedPointDetail && (
        <View
          className="bg-white rounded-2xl p-3.5 mb-3 shadow-md"
          style={{
            borderColor: selectedPointDetail.insumoColor,
            borderWidth: 1.5,
          }}
        >
          <View className="flex-row items-center justify-between pb-2 border-b border-gray-100 mb-2">
            <View className="flex-row items-center flex-1 mr-2">
              <View
                style={{
                  backgroundColor: selectedPointDetail.insumoColor,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  marginRight: 8,
                }}
              />
              <Text className="text-sm font-black text-gray-900" numberOfLines={1}>
                {selectedPointDetail.insumoNombre}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="px-2 py-0.5 rounded-full bg-gray-100">
                <Text className="text-[10px] font-bold text-gray-600 uppercase">{selectedPointDetail.categoria}</Text>
              </View>
              {selectedPointDetail.variacion !== 0 && (
                <View className={`px-2 py-0.5 rounded-full ${selectedPointDetail.variacion > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                  <Text className={`text-[10px] font-bold ${selectedPointDetail.variacion > 0 ? 'text-red-700' : 'text-green-700'}`}>
                    {selectedPointDetail.variacion > 0 ? '+' : ''}{selectedPointDetail.variacion}%
                  </Text>
                </View>
              )}
              <TouchableOpacity onPress={() => setSelectedPointDetail(null)} className="p-1">
                <Ionicons name="close-circle" size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>
          </View>

          <View className="flex-row flex-wrap justify-between items-center gap-2">
            <View>
              <Text className="text-[10px] text-gray-400 font-bold uppercase">Fecha de Compra</Text>
              <Text className="text-xs font-bold text-gray-800">{selectedPointDetail.fechaLabel}</Text>
            </View>

            <View className="items-end">
              <Text className="text-[10px] text-gray-400 font-bold uppercase">Precio Unitario</Text>
              <Text className="text-base font-black text-blue-600">
                {formatCOP(selectedPointDetail.precio)}
              </Text>
            </View>
          </View>

          <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-gray-100">
            <View className="flex-row items-center flex-1 mr-2">
              <Ionicons name="storefront-outline" size={14} color="#6b7280" style={{ marginRight: 4 }} />
              <Text className="text-xs text-gray-600" numberOfLines={1}>
                {selectedPointDetail.proveedor}
              </Text>
            </View>

            {selectedPointDetail.cantidad > 0 && (
              <Text className="text-xs font-bold text-gray-700">
                Cant: {selectedPointDetail.cantidad} {selectedPointDetail.unidad}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* 7. Buscador de Insumos */}
      <View className="bg-white rounded-2xl px-3 py-2 flex-row items-center mb-3 shadow-sm border border-gray-100">
        <Ionicons name="search-outline" size={18} color="#9ca3af" className="mr-2" />
        <TextInput
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder={`Buscar en ${selectedCategory === 'TODAS' ? 'todos los insumos' : selectedCategory}...`}
          placeholderTextColor="#9ca3af"
          className="flex-1 text-sm text-gray-800"
        />
        {searchTerm.length > 0 && (
          <TouchableOpacity onPress={() => setSearchTerm('')}>
            <Ionicons name="close-circle" size={16} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* 8. Lista Consolidada de Insumos */}
      <View className="bg-white rounded-3xl p-3 shadow-sm border border-gray-100">
        <View className="flex-row justify-between items-center px-2 py-2 border-b border-gray-100 mb-2">
          <Text className="text-xs font-black text-gray-700 uppercase tracking-wider">
            Insumos ({searchFilteredInsumos.length})
          </Text>
          <Text className="text-[10px] text-gray-400 font-bold uppercase">Toca 👁 para alternar</Text>
        </View>

        {searchFilteredInsumos.length === 0 ? (
          <View className="py-8 items-center">
            <Text className="text-xs text-gray-400 font-medium">No se encontraron insumos con esos filtros</Text>
          </View>
        ) : (
          searchFilteredInsumos.map((item: InsumoPrecioItem) => {
            const isSelected = selectedIds.has(item.id);
            const varColor =
              item.variacionPorcentual > 0
                ? 'text-red-600 bg-red-50 border-red-200'
                : item.variacionPorcentual < 0
                ? 'text-green-600 bg-green-50 border-green-200'
                : 'text-gray-500 bg-gray-50 border-gray-200';

            const varSign = item.variacionPorcentual > 0 ? '+' : '';

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  toggleInsumo(item.id);
                  // Mostrar detalle de este insumo al tocar la fila
                  const lastPoint = item.seriePuntos[item.seriePuntos.length - 1];
                  const d = lastPoint ? new Date(lastPoint.date + 'T12:00:00') : new Date();
                  const dateKey = lastPoint ? lastPoint.date : (allDatesLabels[allDatesLabels.length - 1] || '');
                  setSelectedPointDetail({
                    insumoId: item.id,
                    dateKey: dateKey,
                    insumoNombre: item.nombre,
                    insumoColor: item.color,
                    categoria: item.categoria,
                    unidad: item.unidad,
                    fechaLabel: lastPoint ? format(d, "d 'de' MMMM, yyyy", { locale: es }) : 'Vigente en catálogo',
                    precio: item.precioActual,
                    proveedor: item.ultimoProveedor,
                    cantidad: lastPoint?.cantidad || 0,
                    variacion: item.variacionPorcentual,
                  });
                }}
                activeOpacity={0.7}
                className={`flex-row items-center justify-between p-3 rounded-2xl mb-2 border ${
                  isSelected ? 'bg-blue-50/40 border-blue-200' : 'bg-white border-gray-100'
                }`}
              >
                {/* Indicador de Color y Botón de Ojo */}
                <View className="flex-row items-center flex-1 mr-2">
                  <TouchableOpacity
                    onPress={() => toggleInsumo(item.id)}
                    className={`w-8 h-8 rounded-full items-center justify-center mr-2.5 ${
                      isSelected ? 'bg-white shadow-sm border border-gray-200' : 'bg-gray-100'
                    }`}
                  >
                    <Ionicons
                      name={isSelected ? 'eye' : 'eye-off-outline'}
                      size={16}
                      color={isSelected ? item.color : '#9ca3af'}
                    />
                  </TouchableOpacity>

                  <View
                    style={{
                      backgroundColor: item.color,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      marginRight: 8,
                    }}
                  />

                  <View className="flex-1">
                    <Text className="text-sm font-bold text-gray-800" numberOfLines={1}>
                      {item.nombre}
                    </Text>
                    <View className="flex-row items-center gap-1.5 mt-0.5">
                      <Text className="text-[10px] text-gray-400 font-bold uppercase">{item.categoria}</Text>
                      <Text className="text-[10px] text-gray-300">•</Text>
                      <Text className="text-[10px] text-gray-500 font-medium" numberOfLines={1}>
                        {item.ultimoProveedor}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Precios y Badge de Variación */}
                <View className="items-end">
                  <Text className="text-sm font-black text-gray-900">{formatCOP(item.precioActual)}</Text>
                  <View className="flex-row items-center gap-1 mt-0.5">
                    <View className={`px-2 py-0.5 rounded-full border ${varColor}`}>
                      <Text
                        className={`text-[10px] font-bold ${
                          item.variacionPorcentual > 0
                            ? 'text-red-700'
                            : item.variacionPorcentual < 0
                            ? 'text-green-700'
                            : 'text-gray-600'
                        }`}
                      >
                        {varSign}
                        {item.variacionPorcentual}%
                      </Text>
                    </View>
                    {item.totalComprado > 0 && (
                      <Text className="text-[9px] text-gray-400 font-medium">
                        ({item.totalComprado} {item.unidad})
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>

    {/* 9. Modal de Visualización Horizontal en Pantalla Completa */}
    <Modal
      visible={isFullScreen}
      animationType="fade"
      supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={() => setIsFullScreen(false)}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar hidden={isFullScreen} />

        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, backgroundColor: '#ffffff' }}>
          {/* Barra superior de la vista horizontal */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
              paddingBottom: 6,
              borderBottomWidth: 1,
              borderColor: '#f1f5f9',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: '#eff6ff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 8,
                }}
              >
                <Ionicons name="trending-up" size={18} color="#2563eb" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '900', color: '#0f172a' }}>
                  Evolución de Precios (Vista Horizontal)
                </Text>
                <Text style={{ fontSize: 10, color: '#64748b', fontWeight: '500' }}>
                  {Platform.OS === 'web'
                    ? 'Ruedita para zoom • Toca puntos para detalle'
                    : 'Pellizca para zoom • Toca puntos para detalle'}
                </Text>
              </View>
            </View>

            {/* Controles de Zoom y Botón Salir */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#f1f5f9',
                  padding: 2,
                  borderRadius: 8,
                  gap: 2,
                }}
              >
                <TouchableOpacity
                  onPress={() => setZoomLevel(prev => Math.max(Number((prev - 0.25).toFixed(2)), 0.6))}
                  style={{
                    width: 26,
                    height: 26,
                    backgroundColor: '#ffffff',
                    borderRadius: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="remove" size={13} color="#374151" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setZoomLevel(1)}
                  style={{
                    paddingHorizontal: 6,
                    height: 26,
                    backgroundColor: '#ffffff',
                    borderRadius: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#1e293b' }}>
                    {Math.round(zoomLevel * 100)}%
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setZoomLevel(prev => Math.min(Number((prev + 0.25).toFixed(2)), 3.5))}
                  style={{
                    width: 26,
                    height: 26,
                    backgroundColor: '#ffffff',
                    borderRadius: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="add" size={13} color="#374151" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setZoomLevel(1)}
                  style={{
                    width: 26,
                    height: 26,
                    backgroundColor: '#ffffff',
                    borderRadius: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="refresh-outline" size={12} color="#6b7280" />
                </TouchableOpacity>
              </View>

              {/* Botones Desplazamiento Horizontal en Fullscreen */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: 6 }}>
                <TouchableOpacity
                  onPress={() => scrollChartHorizontally('left')}
                  style={{
                    width: 26,
                    height: 26,
                    backgroundColor: '#ffffff',
                    borderRadius: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  accessibilityLabel="Desplazar a la izquierda"
                >
                  <Ionicons name="chevron-back" size={14} color="#374151" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => scrollChartHorizontally('right')}
                  style={{
                    width: 26,
                    height: 26,
                    backgroundColor: '#ffffff',
                    borderRadius: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  accessibilityLabel="Desplazar a la derecha"
                >
                  <Ionicons name="chevron-forward" size={14} color="#374151" />
                </TouchableOpacity>
              </View>

              {/* Botón Salir de Horizontal */}
              <TouchableOpacity
                onPress={() => setIsFullScreen(false)}
                style={{
                  backgroundColor: '#2563eb',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  shadowColor: '#2563eb',
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                  elevation: 3,
                }}
              >
                <Ionicons name="contract-outline" size={14} color="#ffffff" style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 11, fontWeight: '900', color: '#ffffff' }}>Salir</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Insumos Activos (Chips horizontales compactos) */}
          {activeInsumos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 32, marginBottom: 6 }}>
              {activeInsumos.map(ins => {
                const isHighlighted = selectedPointDetail?.insumoId === ins.id;
                return (
                  <TouchableOpacity
                    key={`fs-${ins.id}`}
                    onPress={() => {
                      const lastPoint = ins.seriePuntos[ins.seriePuntos.length - 1];
                      const d = lastPoint ? new Date(lastPoint.date + 'T12:00:00') : new Date();
                      const dateKey = lastPoint ? lastPoint.date : (allDatesLabels[allDatesLabels.length - 1] || '');
                      setSelectedPointDetail({
                        insumoId: ins.id,
                        dateKey: dateKey,
                        insumoNombre: ins.nombre,
                        insumoColor: ins.color,
                        categoria: ins.categoria,
                        unidad: ins.unidad,
                        fechaLabel: lastPoint ? format(d, "d 'de' MMMM, yyyy", { locale: es }) : 'Vigente en catálogo',
                        precio: ins.precioActual,
                        proveedor: ins.ultimoProveedor,
                        cantidad: lastPoint?.cantidad || 0,
                        variacion: ins.variacionPorcentual,
                      });
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 14,
                      marginRight: 6,
                      backgroundColor: isHighlighted ? '#eff6ff' : '#f8fafc',
                      borderWidth: 1,
                      borderColor: isHighlighted ? '#3b82f6' : '#e2e8f0',
                    }}
                  >
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ins.color, marginRight: 5 }} />
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: isHighlighted ? '900' : '700',
                        color: isHighlighted ? '#1e40af' : '#334155',
                      }}
                    >
                      {ins.nombre}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Gráfica Horizontal Fullscreen - Ocupa todo el espacio vertical disponible sin cajas redundantes */}
          <View
            ref={fullScreenChartCardRef}
            style={{ flex: 1, width: '100%', justifyContent: 'center' }}
          >
            {activeInsumos.length > 0 && LineChart && chartDataSet.length > 0 ? (
              <LineChart
                scrollRef={fullScreenChartScrollRef}
                onScroll={(e: any) => {
                  if (e?.nativeEvent?.contentOffset?.x !== undefined) {
                    fullScreenScrollPositionRef.current = e.nativeEvent.contentOffset.x;
                  }
                }}
                dataSet={chartDataSet}
                width={fullScreenVisibleWidth}
                height={fullScreenChartHeight}
                spacing={fullScreenSpacing}
                initialSpacing={30}
                endSpacing={30}
                yAxisOffset={chartYConfig.yAxisOffset}
                maxValue={chartYConfig.maxValue}
                noOfSections={chartYConfig.noOfSections}
                stepValue={chartYConfig.stepValue}
                yAxisLabelWidth={56}
                color1={activeInsumos[0]?.color || mainColor}
                textColor1="#374151"
                dataPointsColor1={activeInsumos[0]?.color || mainColor}
                startFillColor1={activeInsumos[0]?.color || mainColor}
                endFillColor1="transparent"
                startOpacity={0.15}
                endOpacity={0.0}
                yAxisColor="#e5e7eb"
                xAxisColor="#e5e7eb"
                yAxisTextStyle={{ color: '#64748b', fontSize: 9, fontWeight: '700' }}
                xAxisLabelTextStyle={{ color: '#4b5563', fontSize: 9, fontWeight: 'bold' }}
                xAxisLabelsHeight={24}
                rulesType="solid"
                rulesColor="#f3f4f6"
                showScrollIndicator={fullScreenSpacing * allDatesLabels.length > fullScreenVisibleWidth}
                indicatorColor="#d1d5db"
                formatYLabel={formatYAxisLabel}
                curved
                curvature={0.12}
                isAnimated={false}
                renderDataPointsAfterAnimationEnds={true}
                onPress={(item: any) => {
                  if (item && item.onPress) {
                    item.onPress();
                  }
                }}
              />
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  </>
  );
}
