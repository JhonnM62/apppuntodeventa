import React, { useState, useRef, useEffect } from 'react';
import { View, KeyboardAvoidingView, Platform, Animated, TouchableOpacity, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHeader, CardContent, CardFooter } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Text } from '../../components/ui/text';
import { Button } from '../../components/ui/button';
import { Link } from '../../components/ui/link';
import useAuthStore from '../../store/useAuthStore';

interface LoginFormData {
  email: string;
  password: string;
}

const schema = yup.object({
  email: yup
    .string()
    .email('Ingresa un correo electrónico válido')
    .required('El correo electrónico es requerido'),
  password: yup
    .string()
    .min(6, 'La contraseña debe tener al menos 6 caracteres')
    .required('La contraseña es requerida'),
});

interface LoginScreenProps {
  navigation: any;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { login, isLoading, error, clearError } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const { control, handleSubmit, formState: { errors, isValid } } = useForm<LoginFormData>({
    resolver: yupResolver(schema) as any,
    mode: 'onChange',
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (error) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [error, fadeAnim]);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const onSubmit = async (data: LoginFormData) => {
    clearError();
    const success = await login(data.email, data.password);
    if (!success) {
      triggerShake();
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-background"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ flexGrow: 1, paddingVertical: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 justify-center">
          <View className="items-center px-6 mb-6">
            <View className="w-20 h-20 rounded-3xl bg-primary justify-center items-center shadow-md shadow-primary/30">
              <Text className="text-primary-foreground font-extrabold text-4xl">Q</Text>
            </View>
            <Text className="text-2xl font-bold mt-5 text-center text-foreground">Q'hubo Mor</Text>
            <Text className="mt-1 text-center uppercase tracking-widest text-xs text-muted-foreground">
              Sistema de Punto de Venta
            </Text>
          </View>

          <Animated.View className="w-full" style={{ transform: [{ translateX: shakeAnim }] }}>
            <Card className="mx-4 border-border bg-card">
              <CardHeader className="pb-2">
                <View className="items-center">
                  <Text className="text-xl font-bold mb-1 text-foreground">¡Bienvenido!</Text>
                  <Text className="text-sm text-center text-muted-foreground">
                    Ingresa tus credenciales para continuar
                  </Text>
                </View>
              </CardHeader>

              <CardContent className="gap-4">
                {error ? (
                  <Animated.View style={{ opacity: fadeAnim }} className="flex-row items-center bg-destructive p-3 rounded-xl">
                    <Ionicons name="alert-circle" size={20} color="#FFF" />
                    <Text className="text-destructive-foreground text-sm font-semibold flex-1 ml-2">{error}</Text>
                    <TouchableOpacity onPress={clearError} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="close" size={18} color="#FFF" />
                    </TouchableOpacity>
                  </Animated.View>
                ) : null}

                <Controller
                  control={control}
                  name="email"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View>
                      <Input
                        label="Correo electrónico"
                        placeholder="admin@ejemplo.com"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        onBlur={onBlur}
                        onChangeText={(text) => {
                          onChange(text);
                          clearError();
                        }}
                        value={value}
                        error={errors.email?.message}
                        rightIcon={
                          value.length > 0 && !errors.email ? (
                            <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                          ) : null
                        }
                      />
                    </View>
                  )}
                />

                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View>
                      <Input
                        label="Contraseña"
                        placeholder="••••••••"
                        secureTextEntry={!showPassword}
                        onBlur={onBlur}
                        onChangeText={(text) => {
                          onChange(text);
                          clearError();
                        }}
                        value={value}
                        error={errors.password?.message}
                        rightIcon={
                          <TouchableOpacity
                            onPress={() => setShowPassword(!showPassword)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          >
                            <Ionicons
                              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                              size={20}
                              color="#757575"
                            />
                          </TouchableOpacity>
                        }
                      />
                    </View>
                  )}
                />

                <View className="flex-row justify-end">
                  <Link onPress={() => console.log('Forgot password pressed')}>
                    ¿Olvidaste tu contraseña?
                  </Link>
                </View>
              </CardContent>

              <CardFooter className="flex-col gap-3">
                <Button
                  onPress={handleSubmit(onSubmit) as any}
                  disabled={isLoading || !isValid}
                  loading={isLoading}
                  className="w-full h-12 rounded-xl"
                  size="lg"
                >
                  {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                </Button>
              </CardFooter>
            </Card>
          </Animated.View>

          <Text className="text-center mt-10 mb-4 text-muted-foreground text-xs">
            © 2026 Q'hubo Mor. Todos los derechos reservados.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;
