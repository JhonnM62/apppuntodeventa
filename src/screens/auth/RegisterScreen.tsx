import React, { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, TouchableOpacity, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import useAuthStore from '../../store/useAuthStore';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Text } from '../../components/ui/text';

interface RegisterFormData {
  nombre: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const schema = yup.object({
  nombre: yup.string().required('El nombre completo es requerido'),
  email: yup.string().email('Email inválido').required('El email es requerido'),
  password: yup.string().min(6, 'La contraseña debe tener al menos 6 caracteres').required('La contraseña es requerida'),
  confirmPassword: yup.string()
    .oneOf([yup.ref('password'), null], 'Las contraseñas no coinciden')
    .required('Debe confirmar su contraseña'),
});

interface RegisterScreenProps {
  navigation: any;
}

const RegisterScreen: React.FC<RegisterScreenProps> = ({ navigation }) => {
  const { register: registerUser, isLoading, error, clearError } = useAuthStore();
  const [successMsg, setSuccessMsg] = useState('');

  const { control, handleSubmit, formState: { errors } } = useForm<RegisterFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      nombre: '',
      email: '',
      password: '',
      confirmPassword: '',
    }
  });

  const onSubmit = async (data: RegisterFormData) => {
    clearError();
    setSuccessMsg('');
    const success = await registerUser(data.nombre, data.email, data.password);
    if (success) {
      setSuccessMsg('¡Cuenta creada exitosamente! Ahora puedes iniciar sesión.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-background"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingVertical: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 justify-center">
          <View className="items-center mb-8">
            <View className="w-16 h-16 bg-primary rounded-2xl justify-center items-center shadow-md shadow-primary/30">
              <Text className="text-primary-foreground font-extrabold text-3xl">Q</Text>
            </View>
            <Text className="text-2xl font-bold mt-4 text-foreground">Registrarse</Text>
            <Text className="mt-1 text-muted-foreground text-sm">Crea tu cuenta nueva</Text>
          </View>

          <View className="bg-card p-6 rounded-3xl shadow-lg border border-border">
            {error ? (
              <View className="bg-destructive p-3 rounded-xl mb-4">
                <Text className="text-destructive-foreground text-center font-semibold text-sm">{error}</Text>
              </View>
            ) : null}
            {successMsg ? (
              <View className="bg-success p-3 rounded-xl mb-4">
                <Text className="text-primary-foreground text-center font-semibold text-sm">{successMsg}</Text>
              </View>
            ) : null}

            <View className="gap-3">
              <Controller
                control={control}
                name="nombre"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Nombre Completo"
                    placeholder="Juan Pérez"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.nombre?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Correo Electrónico"
                    placeholder="ejemplo@correo.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.email?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Contraseña"
                    placeholder="******"
                    secureTextEntry
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.password?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="confirmPassword"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Confirmar Contraseña"
                    placeholder="******"
                    secureTextEntry
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.confirmPassword?.message}
                  />
                )}
              />
            </View>

            <Button
              onPress={handleSubmit(onSubmit) as any}
              loading={isLoading}
              className="mt-6"
              size="lg"
            >
              Crear Cuenta
            </Button>

            <View className="flex-row justify-center items-center mt-6">
              <Text className="text-muted-foreground text-sm">¿Ya tienes una cuenta?</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')} className="ml-1">
                <Text className="text-primary font-bold text-sm">Iniciar Sesión</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default RegisterScreen;
