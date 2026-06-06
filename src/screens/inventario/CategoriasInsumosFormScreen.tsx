import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import Toast from 'react-native-toast-message';

import { Text } from '../../components/ui/text';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { categoriasInsumosService } from '../../services/categoriasInsumos';
import { usePermissions } from '../../hooks/usePermissions';

const schema = yup.object().shape({
  nombre: yup.string().required('El nombre es obligatorio').min(3, 'Mínimo 3 caracteres'),
  imagen: yup.string().optional(),
});

export default function CategoriasInsumosFormScreen({ route, navigation }: any) {
  const { id } = route.params || {};
  const isNew = !id;
  const { canEdit, canDelete, canCreate } = usePermissions('inventario');
  const isReadOnly = isNew ? !canCreate : !canEdit;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { control, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      nombre: '',
      imagen: '',
    }
  });

  useEffect(() => {
    if (!isNew) {
      loadData();
    }
  }, [id, isNew]);

  const loadData = async () => {
    try {
      const data = await categoriasInsumosService.getById(id);
      reset({
        nombre: data.nombre,
        imagen: data.imagen || '',
      });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo cargar la categoría' });
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      const payload = {
        nombre: data.nombre,
        imagen: data.imagen || undefined,
      };

      if (isNew) {
        await categoriasInsumosService.create(payload);
        Toast.show({ type: 'success', text1: 'Éxito', text2: 'Categoría creada correctamente' });
      } else {
        await categoriasInsumosService.update(id, payload);
        Toast.show({ type: 'success', text1: 'Éxito', text2: 'Categoría actualizada correctamente' });
      }
      navigation.goBack();
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Error al guardar';
      Toast.show({ type: 'error', text1: 'Error', text2: Array.isArray(msg) ? msg.join(', ') : msg });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Eliminar Categoría',
      '¿Estás seguro de que deseas eliminar esta categoría? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Eliminar', 
          style: 'destructive',
          onPress: handleDelete
        }
      ]
    );
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await categoriasInsumosService.remove(id);
      Toast.show({ type: 'success', text1: 'Éxito', text2: 'Categoría eliminada' });
      navigation.goBack();
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Error al eliminar';
      Toast.show({ type: 'error', text1: 'Error', text2: Array.isArray(msg) ? msg.join(', ') : msg });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isNew ? 'Nueva Categoría' : 'Editar Categoría'}</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          <View style={styles.card}>
            <Controller
              control={control}
              name="nombre"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Nombre de Categoría"
                  placeholder="Ej. Salsas, Frutas, Licores"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  error={errors.nombre?.message}
                  editable={!isReadOnly && !saving}
                  containerStyle={styles.inputContainer}
                />
              )}
            />

            <Controller
              control={control}
              name="imagen"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="URL de la Imagen (Opcional)"
                  placeholder="https://ejemplo.com/imagen.jpg"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  error={errors.imagen?.message}
                  editable={!isReadOnly && !saving}
                  containerStyle={styles.inputContainer}
                />
              )}
            />
          </View>

        </ScrollView>

        {/* Bottom Actions */}
        {!isReadOnly && (
          <View style={styles.footer}>
            <Button
              onPress={handleSubmit(onSubmit)}
              loading={saving}
              disabled={saving || deleting}
              className="w-full bg-emerald-500 hover:bg-emerald-600"
            >
              {isNew ? 'Crear Categoría' : 'Guardar Cambios'}
            </Button>
            {!isNew && canDelete && (
              <Button
                onPress={confirmDelete}
                loading={deleting}
                disabled={saving || deleting}
                variant="outline"
                className="w-full mt-3 border-red-500 text-red-500"
              >
                Eliminar Categoría
              </Button>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  inputContainer: {
    marginBottom: 16,
  },
  footer: {
    padding: 16,
    paddingBottom: 100,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
});
