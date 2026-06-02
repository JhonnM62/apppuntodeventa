import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { Input } from '../../components/ui/input';
import { createCliente, updateCliente, getClienteById, Cliente } from '../../services/clientes.service';
import Toast from 'react-native-toast-message';

export default function ClienteFormScreen({ route, navigation }: any) {
  const { id } = route.params || {};
  const isEditing = !!id;
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [isEditingObservaciones, setIsEditingObservaciones] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    if (keyboardHeight > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [keyboardHeight]);

    const { control, handleSubmit, setValue, reset, formState: { errors } } = useForm({
    defaultValues: {
      IDcliente: '',
      nombre: '',
      cedula: '',
      whatsapp: '',
      compras: '',
      observaciones: '',
    }
  });

  useEffect(() => {
    if (isEditing) {
      const fetchCliente = async () => {
        try {
          const data = await getClienteById(id);
          reset({
            IDcliente: String(data.IDcliente),
            nombre: data.nombre || '',
            cedula: data.cedula ? String(data.cedula) : '',
            whatsapp: data.whatsapp || '',
            compras: data.compras ? String(data.compras) : (data.contador ? String(data.contador) : '0'),
            observaciones: data.observaciones || '',
          });
        } catch (error) {
          Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cargar el cliente' });
          navigation.goBack();
        } finally {
          setLoading(false);
        }
      };
      fetchCliente();
    } else {
      // Sugerir un ID aleatorio de 4-5 dígitos
      const randomId = Math.floor(1000 + Math.random() * 90000);
      setValue('IDcliente', String(randomId));
      setLoading(false);
    }
  }, [id, isEditing, reset, navigation, setValue]);

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      const payload: Partial<Cliente> = {
        nombre: data.nombre,
        whatsapp: data.whatsapp || null,
        observaciones: data.observaciones || null,
      };

      if (!isEditing && data.IDcliente && !isNaN(Number(data.IDcliente))) {
        payload.IDcliente = Number(data.IDcliente);
      }

      if (data.cedula && !isNaN(Number(data.cedula))) {
        payload.cedula = Number(data.cedula);
      }

      if (data.compras && !isNaN(Number(data.compras))) {
        const comprasNum = Number(data.compras);
        payload.compras = String(comprasNum);
        
        let nuevoContador = comprasNum;
        if (nuevoContador > 10) {
          nuevoContador = nuevoContador % 10;
          if (nuevoContador === 0) nuevoContador = 10;
        }
        payload.contador = nuevoContador;
      }

      if (isEditing) {
        await updateCliente(id, payload);
        Toast.show({ type: 'success', text1: 'Cliente actualizado' });
      } else {
        await createCliente(payload);
        Toast.show({ type: 'success', text1: 'Cliente creado' });
      }
      navigation.goBack();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo guardar el cliente' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#3b82f6" />
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, paddingBottom: Platform.OS === 'android' ? keyboardHeight : 0 }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top', 'left', 'right']}>
        {/* Header */}
        <View className="px-4 py-3 bg-white border-b border-gray-200 flex-row items-center justify-between z-10" style={{ elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
          <View className="flex-row items-center">
            <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3">
              <Ionicons name="arrow-back" size={24} color="#111827" />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-gray-900">{isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}</Text>
          </View>
          <TouchableOpacity 
            onPress={handleSubmit(onSubmit)} 
            disabled={saving}
            className="bg-green-600 px-4 py-2 rounded-lg flex-row items-center"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text className="text-white font-bold ml-1">Guardar</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView 
            ref={scrollRef}
            className="flex-1" 
            contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: 100 }} 
            keyboardShouldPersistTaps="handled"
          >
            <View className="bg-white rounded-2xl p-5 border border-gray-100 mb-8" style={{ elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
            
            <View className="mb-4">
              <Text className="text-xs font-bold text-gray-600 mb-1 uppercase">ID Cliente</Text>
              <Controller
                control={control}
                name="IDcliente"
                rules={{ required: 'El ID es obligatorio' }}
                render={({ field: { onChange, value } }) => (
                  <View>
                    <Input
                      value={value}
                      onChangeText={onChange}
                      editable={!isEditing} // No se puede editar el ID de un cliente existente
                      keyboardType="numeric"
                      placeholder="Ej: 12345"
                      className={`bg-gray-50 border ${errors.IDcliente ? 'border-red-500' : 'border-gray-200'} ${isEditing ? 'opacity-60' : ''}`}
                    />
                    {errors.IDcliente && <Text className="text-red-500 text-xs mt-1">{errors.IDcliente.message as string}</Text>}
                  </View>
                )}
              />
              {!isEditing && <Text className="text-xs text-gray-400 mt-1">Este es un ID sugerido. Puedes cambiarlo (4-5 dígitos).</Text>}
            </View>

            <View className="mb-4">
              <Text className="text-xs font-bold text-gray-600 mb-1 uppercase">Nombre Completo *</Text>
              <Controller
                control={control}
                name="nombre"
                rules={{ required: 'El nombre es requerido' }}
                render={({ field: { onChange, value } }) => (
                  <Input
                    value={value}
                    onChangeText={onChange}
                    placeholder="Ej: Juan Pérez"
                    className={`bg-gray-50 border ${errors.nombre ? 'border-red-500' : 'border-gray-200'}`}
                  />
                )}
              />
              {errors.nombre && <Text className="text-red-500 text-xs mt-1">{errors.nombre.message as string}</Text>}
            </View>

            <View className="mb-4">
              <Text className="text-xs font-bold text-gray-600 mb-1 uppercase">Cédula / NIT</Text>
              <Controller
                control={control}
                name="cedula"
                render={({ field: { onChange, value } }) => (
                  <Input
                    value={value}
                    onChangeText={onChange}
                    keyboardType="numeric"
                    placeholder="Número de documento"
                    className="bg-gray-50 border border-gray-200"
                  />
                )}
              />
            </View>

            <View className="mb-4">
              <Text className="text-xs font-bold text-gray-600 mb-1 uppercase">Teléfono (WhatsApp)</Text>
              <Controller
                control={control}
                name="whatsapp"
                render={({ field: { onChange, value } }) => (
                  <Input
                    value={value}
                    onChangeText={onChange}
                    keyboardType="phone-pad"
                    placeholder="Ej: 3001234567"
                    className="bg-gray-50 border border-gray-200"
                  />
                )}
              />
            </View>

            <View className="mb-4">
              <Text className="text-xs font-bold text-gray-600 mb-1 uppercase">Compras / Puntos Acumulados</Text>
              <Controller
                control={control}
                name="compras"
                render={({ field: { onChange, value } }) => (
                  <Input
                    value={value}
                    onChangeText={onChange}
                    keyboardType="numeric"
                    placeholder="Ej: 0"
                    className="bg-gray-50 border border-gray-200"
                  />
                )}
              />
            </View>

            {/* Observaciones with Tap-to-Edit optimization */}
            <View className="mb-2 relative">
              <Text className="text-gray-600 text-xs font-semibold mb-1 uppercase">Observaciones</Text>
              <Controller 
                control={control} 
                name="observaciones" 
                render={({ field: { onChange, value } }) => (
                  <View className="relative">
                    <Input 
                      editable={isEditingObservaciones}
                      multiline 
                      numberOfLines={6} 
                      value={value} 
                      onChangeText={onChange} 
                      onBlur={() => setIsEditingObservaciones(false)}
                      className={`bg-gray-50 border-gray-200 ${isEditingObservaciones ? 'text-gray-900 bg-white border-blue-400' : 'text-gray-700'}`} 
                      style={{ minHeight: 120, textAlignVertical: 'top' }}
                      placeholder={isEditingObservaciones ? "Escribe aquí..." : ""}
                    />
                    {!isEditingObservaciones && (
                      <TouchableOpacity 
                        className="absolute inset-0 z-10" 
                        activeOpacity={0.8}
                        onPress={() => setIsEditingObservaciones(true)}
                      >
                        {!value && (
                          <View className="absolute inset-0 justify-center items-center">
                            <Ionicons name="pencil-outline" size={24} color="#9ca3af" />
                            <Text className="text-gray-400 text-xs mt-2">Tocar para escribir observaciones</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
              )} />
            </View>

          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
