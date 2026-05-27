import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettingsStore } from '../../store/useSettingsStore';
import { ArrowLeft, Check } from 'lucide-react-native';
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
  const { primaryColor, fontScale, setPrimaryColor, setFontScale, resetSettings } = useSettingsStore();

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top', 'bottom']}>
      {/* Header */}
      <View style={{ backgroundColor: primaryColor }} className="px-4 py-4 flex-row items-center justify-between shadow-sm z-10">
        <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 -ml-2 rounded-full">
          <ArrowLeft size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-white">Configuración Avanzada</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 p-5">
        
        {/* Sección: Color Principal */}
        <View className="bg-white p-5 rounded-2xl shadow-sm mb-6">
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
        <View className="bg-white p-5 rounded-2xl shadow-sm mb-6">
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
