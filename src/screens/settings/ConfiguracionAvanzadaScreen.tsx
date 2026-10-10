import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettingsStore } from '../../store/useSettingsStore';
import { ArrowLeft, Check, Volume2 } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

const PREDEFINED_COLORS = [
  '#16a34a', // Verde (Default)
  '#2563eb', // Azul
  '#dc2626', // Rojo
  '#d97706', // Naranja
  '#7c3aed', // Morado
  '#0d9488', // Teal
  '#475569', // Gris (Slate)
  '#000000', // Negro
];

export default function ConfiguracionAvanzadaScreen() {
  const navigation = useNavigation();
  const { 
    primaryColor, fontScale, enableSound, forceEarpiece,
    setPrimaryColor, setFontScale, setEnableSound, setForceEarpiece, resetSettings 
  } = useSettingsStore();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={{ backgroundColor: primaryColor }} className="px-4 py-4 flex-row items-center justify-between shadow-sm z-10">
        <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 -ml-2 rounded-full">
          <ArrowLeft size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-white">Configuración Avanzada</Text>
        <View className="w-10" />
      </View>

      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 100 }}
      >
        {/* Sección: Audio y Sonido */}
        <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 24 }}>
          <View className="flex-row items-center mb-1">
            <Volume2 size={20} color="#1f2937" style={{ marginRight: 8 }} />
            <Text className="text-lg font-bold text-gray-800">Audio y Sonidos</Text>
          </View>
          
          <View className="flex-row items-center justify-between mt-4 mb-4">
            <View className="flex-1 pr-4">
              <Text className="text-base font-bold text-gray-800">Habilitar Sonidos</Text>
              <Text className="text-sm text-gray-500 mt-1">Reproducir pitidos al realizar acciones como cobrar o agregar productos.</Text>
            </View>
            <Switch
              value={enableSound}
              onValueChange={(val) => setEnableSound(val)}
              trackColor={{ false: '#d1d5db', true: '#86efac' }}
              thumbColor={enableSound ? '#16a34a' : '#9ca3af'}
            />
          </View>

          {Platform.OS === 'android' && (
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-base font-bold text-gray-800">Forzar Sonido Interno</Text>
                <Text className="text-sm text-gray-500 mt-1">Intenta forzar que el sonido salga por el auricular de llamadas cuando hay audífonos o parlantes conectados al Jack o Bluetooth.</Text>
              </View>
              <Switch
                value={forceEarpiece}
                onValueChange={(val) => {
                  setForceEarpiece(val);
                  import('../../services/soundService').then((m) => m.soundService.loadSounds());
                }}
                trackColor={{ false: '#d1d5db', true: '#86efac' }}
                thumbColor={forceEarpiece ? '#16a34a' : '#9ca3af'}
                disabled={!enableSound}
              />
            </View>
          )}
        </View>

        {/* Sección: Color Principal */}
        <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 24 }}>
          <Text className="text-lg font-bold mb-1 text-gray-800">Color Principal</Text>
          <Text className="text-gray-500 mb-4 text-sm">Elige el color dominante para botones y cabeceras de la aplicación.</Text>
          
          <View className="flex-row flex-wrap gap-3">
            {PREDEFINED_COLORS.map((color) => {
              const isSelected = primaryColor === color;
              return (
                <TouchableOpacity
                  key={color}
                  onPress={() => setPrimaryColor(color)}
                  style={{ backgroundColor: color }}
                  className={`w-14 h-14 rounded-full items-center justify-center shadow-sm ${isSelected ? 'border-4 border-white' : ''}`}
                >
                  {isSelected && <Check size={24} color="white" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Sección: Tamaño de Fuente */}
        <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 24 }}>
          <Text className="text-lg font-bold mb-1 text-gray-800">Tamaño de Fuente (Escala)</Text>
          <Text className="text-gray-500 mb-4 text-sm">Ajusta el tamaño global de los textos.</Text>
          
          <View className="flex-row justify-between gap-3">
            {[0.8, 0.9, 1.0, 1.1, 1.2].map((scale) => {
              const isSelected = fontScale === scale;
              return (
                <TouchableOpacity
                  key={scale}
                  onPress={() => setFontScale(scale)}
                  style={{ backgroundColor: isSelected ? primaryColor : '#f3f4f6' }}
                  className={`flex-1 py-3 rounded-xl items-center justify-center`}
                >
                  <Text className={`font-bold ${isSelected ? 'text-white' : 'text-gray-700'}`}>
                    {scale}x
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Sección: Tamaño de Productos en Web */}
        <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 24 }}>
          <Text className="text-lg font-bold mb-1 text-gray-800">Cajas de Productos (Web)</Text>
          <Text className="text-gray-500 mb-4 text-sm">Configura cuántas columnas de productos se mostrarán en computadoras y pantallas anchas. (A mayor número, cajas más pequeñas).</Text>
          
          <View className="flex-row flex-wrap gap-3">
            {[4, 5, 6, 7, 8, 9, 10, 11, 12].map((cols) => {
              const isSelected = useSettingsStore(state => state.gridColumnsWeb) === cols;
              return (
                <TouchableOpacity
                  key={cols}
                  onPress={() => useSettingsStore.getState().setGridColumnsWeb(cols)}
                  style={{ backgroundColor: isSelected ? primaryColor : '#f3f4f6', minWidth: 50 }}
                  className={`py-3 px-4 rounded-xl items-center justify-center`}
                >
                  <Text className={`font-bold ${isSelected ? 'text-white' : 'text-gray-700'}`}>
                    {cols}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Sección: Tamaño de Productos en Móvil */}
        <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 24 }}>
          <Text className="text-lg font-bold mb-1 text-gray-800">Cajas de Productos (Móvil)</Text>
          <Text className="text-gray-500 mb-4 text-sm">Configura cuántas columnas de productos se mostrarán en celulares y dispositivos móviles.</Text>
          
          <View className="flex-row flex-wrap gap-3">
            {[2, 3, 4, 5, 6].map((cols) => {
              const isSelected = useSettingsStore(state => state.gridColumnsMobile) === cols;
              return (
                <TouchableOpacity
                  key={cols}
                  onPress={() => useSettingsStore.getState().setGridColumnsMobile(cols)}
                  style={{ backgroundColor: isSelected ? primaryColor : '#f3f4f6', minWidth: 50 }}
                  className={`py-3 px-4 rounded-xl items-center justify-center`}
                >
                  <Text className={`font-bold ${isSelected ? 'text-white' : 'text-gray-700'}`}>
                    {cols}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Reset */}
        <TouchableOpacity
          onPress={resetSettings}
          className="py-4 mt-4 border border-gray-300 rounded-xl items-center"
        >
          <Text className="text-gray-600 font-bold">Restaurar Valores por Defecto</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
