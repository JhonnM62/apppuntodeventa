import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text as RNText, StyleSheet, ScrollView, ActivityIndicator, Modal, TextInput, Platform, Switch } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import useAuthStore from '../../store/useAuthStore';
import { Text } from '../../components/ui/text';
import api from '../../services/api';
import { useCustomAlert } from '../../context/CustomAlertContext';
import { getCargos, Cargo } from '../../services/cargos.service';

const ROLES_DISPONIBLES = [
  { key: 'Admin app', label: 'Admin App', description: 'Administrador de la aplicación' },
  { key: 'Cajero', label: 'Cajero', description: 'Encargado de caja y cobros' },
  { key: 'Mesero', label: 'Mesero', description: 'Toma pedidos y atiende mesas' },
  { key: 'Cocina', label: 'Cocina', description: 'Prepara los pedidos' },
  { key: 'Proveedor', label: 'Proveedor', description: 'Gestiona proveedores' },
  { key: 'Domiciliario', label: 'Domiciliario', description: 'Entrega pedidos a domicilio' },
  { key: 'Jefe', label: 'Jefe', description: 'Supervisa operaciones' },
  { key: 'Admin negocio', label: 'Admin Negocio', description: 'Administrador del negocio' },
  { key: 'Inventarista', label: 'Inventarista', description: 'Gestiona el inventario' },
];

const MODULOS_SISTEMA = [
  {
    grupo: "Ventas y Pedidos",
    modulos: [
      { key: 'ventas', label: 'Ventas (Nueva Venta)' },
      { key: 'pedidos', label: 'Pedidos (Cocina)' },
      { key: 'historial_ventas', label: 'Historial de Ventas' },
      { key: 'caja', label: 'Caja (Apertura y Cierre)' },
      { key: 'clientes', label: 'Clientes (Directorio)' },
    ]
  },
  {
    grupo: "Inventario Avanzado",
    modulos: [
      { key: 'insumos', label: 'Insumos (Directorio)' },
      { key: 'productos', label: 'Productos (Recetas)' },
      { key: 'entradas_inventario', label: 'Entradas Inventario' },
      { key: 'salidas_inventario', label: 'Salidas Inventario' },
      { key: 'registros_inventario', label: 'Registros Inventario', soloLectura: true },
    ]
  },
  {
    grupo: "Administración",
    modulos: [
      { key: 'gastos', label: 'Gastos' },
      { key: 'reportes', label: 'Reportes y Estadísticas' },
      { key: 'reportes_guardado', label: 'Reportes de Dinero Guardado' },
    ]
  },
  {
    grupo: "Configuración",
    modulos: [
      { key: 'config_impresora', label: 'Impresora POS (Bluetooth)' },
      { key: 'config_usuarios', label: 'Usuarios y Permisos' },
      { key: 'config_comentarios', label: 'Comentarios y Precios Extra' },
    ]
  }
];

type UsuarioItem = {
  IDusuarios: string;
  nombre: string;
  email: string;
  telefono?: string;
  cedula?: number;
  direccion?: string;
  rol: string;
  isActive: boolean;
  cargoId?: string;
  permisos?: Record<string, ModuloPermissions>;
  createdAt?: string;
};

type ModuloPermissions = {
  read: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
};

type EditFormData = {
  nombre: string;
  email: string;
  telefono: string;
  cedula: string;
  direccion: string;
  rol: string;
  isActive: boolean;
  cargoId?: string;
  modulos: Record<string, ModuloPermissions>;
};

const UsersScreen = ({ navigation }: any) => {
  const { user, logout } = useAuthStore();
  const { showAlert } = useCustomAlert();
  const isAdminApp = user?.rol === 'Admin app';

  const [users, setUsers] = useState<UsuarioItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UsuarioItem | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; passwordTemporal: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    password: '',
    telefono: '',
    rol: '',
    cargoId: '',
  });

  const [editFormData, setEditFormData] = useState<EditFormData>({
    nombre: '',
    email: '',
    telefono: '',
    cedula: '',
    direccion: '',
    rol: '',
    isActive: true,
    cargoId: '',
    modulos: {},
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>({});
  const [selectedRol, setSelectedRol] = useState<string | null>(null);
  const [showRolDropdown, setShowRolDropdown] = useState(false);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [showCargoDropdown, setShowCargoDropdown] = useState(false);
  const [showEditCargoDropdown, setShowEditCargoDropdown] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (isAdminApp) {
      fetchUsers();
      fetchCargos();
    }
  }, [isAdminApp]);

  const fetchCargos = async () => {
    try {
      const res = await getCargos();
      setCargos(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const resp = await api.get('/usuarios?limit=100&page=1');
      let usersData: any[] = [];

      if (Array.isArray(resp)) {
        usersData = resp;
      } else if (resp && typeof resp === 'object') {
        if (Array.isArray((resp as any).data?.data)) {
          usersData = (resp as any).data.data;
        } else if (Array.isArray((resp as any).data)) {
          usersData = (resp as any).data;
        }
      }

      setUsers(usersData);
    } catch (error: any) {
      console.error('Error fetching users:', error?.message || error);
    } finally {
      setLoading(false);
    }
  };

  const validateCreateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.nombre.trim()) {
      errors.nombre = 'El nombre es obligatorio';
    }

    if (!formData.email.trim()) {
      errors.email = 'El correo electrónico es obligatorio';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'El correo electrónico no es válido';
    }

    if (!formData.password) {
      errors.password = 'La contraseña es obligatoria';
    } else if (formData.password.length < 8) {
      errors.password = 'La contraseña debe tener al menos 8 caracteres';
    } else if (!/(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(formData.password)) {
      errors.password = 'Debe contener al menos una mayúscula, un número y un carácter especial';
    }

    if (!formData.rol) {
      errors.rol = 'Debe seleccionar un rol';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateEditForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!editFormData.nombre.trim()) {
      errors.nombre = 'El nombre es obligatorio';
    }

    if (!editFormData.email.trim()) {
      errors.email = 'El correo electrónico es obligatorio';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editFormData.email)) {
      errors.email = 'El correo electrónico no es válido';
    }

    if (!editFormData.rol) {
      errors.rol = 'Debe seleccionar un rol';
    }

    setEditFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const getErrorMessage = (error: any, defaultMsg: string) => {
    const msg = error?.response?.data?.message || error?.message || defaultMsg;
    if (Array.isArray(msg)) return msg.join('\n');
    if (typeof msg === 'object') return JSON.stringify(msg);
    return String(msg);
  };

  const handleCreateUser = async () => {
    if (!validateCreateForm()) return;

    setLoading(true);
    try {
      const response = await api.post('/usuarios', {
        nombre: formData.nombre.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        telefono: formData.telefono.trim() || undefined,
        rol: formData.rol,
        cargoId: formData.cargoId || undefined,
      });

      if (response?.data?.success || (response as any)?.success) {
        setCreatedCredentials({
          email: formData.email.trim().toLowerCase(),
          passwordTemporal: formData.password,
        });
        setShowCreateModal(false);
        setShowCredentialsModal(true);
        resetCreateForm();
        fetchUsers();
      }
    } catch (error: any) {
      showAlert({ type: 'error', title: 'Error', message: getErrorMessage(error, 'Error al crear usuario') });
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = async () => {
    if (!validateEditForm()) return;

    showAlert({
      type: 'confirm',
      title: 'Confirmar cambios',
      message: '¿Estás seguro de que deseas guardar los cambios realizados a este usuario?',
      confirmText: 'Guardar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        setLoading(true);
        try {
          await api.patch(`/usuarios/${selectedUser?.IDusuarios}`, {
            nombre: editFormData.nombre.trim(),
            email: editFormData.email.trim().toLowerCase(),
            telefono: editFormData.telefono.trim() || undefined,
            cedula: editFormData.cedula ? parseInt(editFormData.cedula) : undefined,
            direccion: editFormData.direccion.trim() || undefined,
            rol: editFormData.rol,
            isActive: editFormData.isActive,
            cargoId: editFormData.cargoId || undefined,
            permisos: editFormData.modulos,
          });

          showAlert({ type: 'success', title: 'Éxito', message: 'Usuario actualizado correctamente' });
          setShowEditModal(false);
          setSelectedUser(null);
          resetEditForm();
          fetchUsers();
        } catch (error: any) {
          showAlert({ type: 'error', title: 'Error', message: getErrorMessage(error, 'Error al actualizar usuario') });
        } finally {
          setLoading(false);
        }
      },
      onCancel: () => {}
    });
  };

  const handleDeleteUser = async (userToDelete: UsuarioItem) => {
    if (userToDelete.IDusuarios === user?.IDusuarios) {
      showAlert({ type: 'error', title: 'Error', message: 'No puedes eliminar tu propio usuario' });
      return;
    }

    showAlert({
      type: 'confirm',
      title: 'Eliminar Usuario',
      message: `¿Estás seguro de que deseas eliminar al usuario "${userToDelete.nombre}"? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        setLoading(true);
        try {
          await api.delete(`/usuarios/${userToDelete.IDusuarios}`);
          showAlert({ type: 'success', title: 'Éxito', message: 'Usuario eliminado correctamente' });
          setShowEditModal(false);
          setSelectedUser(null);
          fetchUsers();
        } catch (error: any) {
          showAlert({ type: 'error', title: 'Error', message: getErrorMessage(error, 'Error al eliminar usuario') });
        } finally {
          setLoading(false);
        }
      },
      onCancel: () => {}
    });
  };

  const openEditModal = (userItem: UsuarioItem) => {
    setSelectedUser(userItem);
    setEditFormData({
      nombre: userItem.nombre || '',
      email: userItem.email || '',
      telefono: userItem.telefono || '',
      cedula: userItem.cedula?.toString() || '',
      direccion: userItem.direccion || '',
      rol: userItem.rol || '',
      isActive: userItem.isActive !== false,
      cargoId: userItem.cargoId || '',
      modulos: userItem.permisos || {},
    });
    setEditFormErrors({});
    setShowEditModal(true);
  };

  const openCurrentUserEdit = () => {
    if (!user) return;

    const currentUserItem: UsuarioItem = {
      IDusuarios: user.IDusuarios || '',
      nombre: user.nombre || '',
      email: user.email || '',
      telefono: user.telefono || undefined,
      rol: user.rol || '',
      isActive: true,
      cargoId: (user as any).cargoId || '',
    };

    openEditModal(currentUserItem);
  };

  const resetCreateForm = () => {
    setFormData({
      nombre: '',
      email: '',
      password: '',
      telefono: '',
      rol: '',
      cargoId: '',
    });
    setSelectedRol(null);
    setFormErrors({});
    setShowPassword(false);
    setShowCargoDropdown(false);
  };

  const generateRandomPassword = () => {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const nums = '0123456789';
    const special = '!@#$%^&*()_+~|}{[]:;?><,./-=';
    
    let pass = '';
    pass += upper[Math.floor(Math.random() * upper.length)];
    pass += nums[Math.floor(Math.random() * nums.length)];
    pass += special[Math.floor(Math.random() * special.length)];
    
    for (let i = 0; i < 6; i++) {
      const all = upper + lower + nums + special;
      pass += all[Math.floor(Math.random() * all.length)];
    }
    
    // Shuffle password
    pass = pass.split('').sort(() => 0.5 - Math.random()).join('');
    setFormData(prev => ({ ...prev, password: pass }));
    setShowPassword(true); // Mostrar para que el usuario la vea
  };

  const resetEditForm = () => {
    setEditFormData({
      nombre: '',
      email: '',
      telefono: '',
      cedula: '',
      direccion: '',
      rol: '',
      isActive: true,
      cargoId: '',
      modulos: {},
    });
    setEditFormErrors({});
    setShowEditCargoDropdown(false);
  };

  const handleLogout = () => {
    showAlert({
      type: 'confirm',
      title: 'Cerrar Sesión',
      message: '¿Estás seguro de que deseas cerrar sesión?',
      confirmText: 'Cerrar Sesión',
      cancelText: 'Cancelar',
      onConfirm: logout,
      onCancel: () => {}
    });
  };

  const copyToClipboard = async (text: string) => {
    try {
      const Clipboard = require('react-native').Clipboard;
      if (Clipboard) {
        Clipboard.setString(text);
      }
      showAlert({ type: 'success', title: 'Copiado', message: `Credenciales copiadas al portapapeles:\n${text}` });
    } catch (e) {
      showAlert({ type: 'success', title: 'Copiado', message: `Credenciales copiadas al portapapeles:\n${text}` });
    }
  };

  const toggleModulo = (moduloKey: string, action: keyof ModuloPermissions) => {
    setEditFormData(prev => {
      const currentModule = prev.modulos[moduloKey] || { read: false, create: false, edit: false, delete: false };
      return {
        ...prev,
        modulos: {
          ...prev.modulos,
          [moduloKey]: {
            ...currentModule,
            [action]: !currentModule[action]
          }
        }
      };
    });
  };

  const getRoleColor = (rol: string) => {
    const colors: Record<string, string> = {
      'Admin app': '#8b5cf6',
      'Cajero': '#22c55e',
      'Mesero': '#3b82f6',
      'Cocina': '#f59e0b',
      'Proveedor': '#6366f1',
      'Domiciliario': '#ec4899',
      'Jefe': '#ef4444',
      'Admin negocio': '#14b8a6',
      'Inventarista': '#84cc16',
    };
    return colors[rol] || '#6b7280';
  };

  const renderUserItem = ({ item }: { item: UsuarioItem }) => (
    <TouchableOpacity
      style={[styles.userItem, !item.isActive && styles.userItemInactive]}
      onPress={() => openEditModal(item)}
      activeOpacity={0.7}
    >
      <View style={styles.userAvatar}>
        <RNText style={styles.userAvatarText}>
          {item.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
        </RNText>
      </View>
      <View style={styles.userInfo}>
        <RNText style={styles.userName}>{item.nombre}</RNText>
        <RNText style={styles.userEmail}>{item.email}</RNText>
        <View style={styles.userMeta}>
          <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.rol) + '20' }]}>
            <RNText style={[styles.roleBadgeText, { color: getRoleColor(item.rol) }]}>
              {item.rol}
            </RNText>
          </View>
          {!item.isActive && (
            <View style={[styles.statusBadge, styles.statusBadgeInactive]}>
              <RNText style={[styles.statusBadgeText, { color: '#ef4444' }]}>Inactivo</RNText>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
    </TouchableOpacity>
  );

  const selectedRolLabel = ROLES_DISPONIBLES.find(r => r.key === selectedRol)?.label || 'Seleccionar rol';

  return (
    <View style={styles.container}>
      <View style={{ backgroundColor: '#fff', paddingTop: insets.top }}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <RNText style={styles.headerTitle}>Usuarios App</RNText>
          <View style={{ width: 44 }} />
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isAdminApp ? (
          <View style={styles.adminSection}>
            <View style={styles.sectionHeader}>
              <RNText style={styles.sectionTitle}>GESTIÓN DE USUARIOS</RNText>
              <TouchableOpacity
                style={styles.addUserBtn}
                onPress={() => setShowCreateModal(true)}
              >
                <Ionicons name="person-add" size={18} color="#fff" />
                <RNText style={styles.addUserBtnText}>Agregar</RNText>
              </TouchableOpacity>
            </View>

            {loading && users.length === 0 ? (
              <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
            ) : (
              <View style={styles.usersList}>
                {users.map(userItem => (
                  <View key={userItem.IDusuarios} style={styles.userItemWrapper}>
                    {renderUserItem({ item: userItem })}
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.noAccessSection}>
            <MaterialCommunityIcons name="shield-lock-outline" size={64} color="#d1d5db" />
            <RNText style={styles.noAccessTitle}>Sin acceso</RNText>
            <RNText style={styles.noAccessText}>
              No tienes permisos para gestionar usuarios. Solo el rol "Admin App" puede acceder a esta sección.
            </RNText>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <Modal
        visible={showCreateModal}
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
        presentationStyle="pageSheet"
      >
        <View style={[styles.modalContainer, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
          <View style={styles.modalHeader}>
            <RNText style={styles.modalTitle}>Agregar Usuario</RNText>
            <TouchableOpacity onPress={() => setShowCreateModal(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>Nombre completo *</RNText>
              <View style={[styles.inputContainer, formErrors.nombre && styles.inputError]}>
                <Ionicons name="person-outline" size={18} color="#6b7280" />
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Juan Pérez"
                  placeholderTextColor="#9ca3af"
                  value={formData.nombre}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, nombre: text }))}
                />
              </View>
              {formErrors.nombre && <RNText style={styles.errorText}>{formErrors.nombre}</RNText>}
            </View>

            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>Correo electrónico *</RNText>
              <View style={[styles.inputContainer, formErrors.email && styles.inputError]}>
                <Ionicons name="mail-outline" size={18} color="#6b7280" />
                <TextInput
                  style={styles.input}
                  placeholder="Ej: juan@correo.com"
                  placeholderTextColor="#9ca3af"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={formData.email}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, email: text }))}
                />
              </View>
              {formErrors.email && <RNText style={styles.errorText}>{formErrors.email}</RNText>}
            </View>

            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>Contraseña temporal *</RNText>
              <View style={[styles.inputContainer, formErrors.password && styles.inputError]}>
                <Ionicons name="lock-closed-outline" size={18} color="#6b7280" />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Mínimo 8 caracteres"
                  placeholderTextColor="#9ca3af"
                  secureTextEntry={!showPassword}
                  value={formData.password}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, password: text }))}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={generateRandomPassword} style={{ alignSelf: 'flex-start', marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="flash-outline" size={16} color="#10b981" />
                <RNText style={{ color: '#10b981', fontWeight: 'bold', marginLeft: 4, fontSize: 13 }}>Generar Contraseña Segura</RNText>
              </TouchableOpacity>
              <View style={[styles.passwordRequirements, { marginTop: 8 }]}>
                <RNText style={styles.passwordReqText}>
                  Requisitos: 8+ caracteres, 1 mayúscula, 1 número, 1 carácter especial
                </RNText>
              </View>
              {formErrors.password && <RNText style={styles.errorText}>{formErrors.password}</RNText>}
            </View>

            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>Teléfono</RNText>
              <View style={styles.inputContainer}>
                <Ionicons name="call-outline" size={18} color="#6b7280" />
                <TextInput
                  style={styles.input}
                  placeholder="Ej: 3001234567"
                  placeholderTextColor="#9ca3af"
                  keyboardType="phone-pad"
                  value={formData.telefono}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, telefono: text }))}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>Rol *</RNText>
              <TouchableOpacity
                style={[styles.inputContainer, formErrors.rol && styles.inputError]}
                onPress={() => setShowRolDropdown(!showRolDropdown)}
              >
                <Ionicons name="briefcase-outline" size={18} color="#6b7280" />
                <RNText style={[styles.dropdownText, !selectedRol && styles.dropdownPlaceholder]}>
                  {selectedRolLabel}
                </RNText>
                <Ionicons name="chevron-down" size={18} color="#6b7280" />
              </TouchableOpacity>
              {formErrors.rol && <RNText style={styles.errorText}>{formErrors.rol}</RNText>}

              {showRolDropdown && (
                <View style={styles.dropdownMenu}>
                  {ROLES_DISPONIBLES.map(rol => (
                    <TouchableOpacity
                      key={rol.key}
                      style={[styles.dropdownItem, selectedRol === rol.key && styles.dropdownItemActive]}
                      onPress={() => {
                        setSelectedRol(rol.key);
                        setFormData(prev => ({ ...prev, rol: rol.key }));
                        setShowRolDropdown(false);
                        setFormErrors(prev => ({ ...prev, rol: '' }));
                      }}
                    >
                      <RNText style={[styles.dropdownItemText, selectedRol === rol.key && styles.dropdownItemTextActive]}>
                        {rol.label}
                      </RNText>
                      <RNText style={styles.dropdownItemDesc}>{rol.description}</RNText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>Cargo (Nómina) - Opcional</RNText>
              <TouchableOpacity
                style={styles.inputContainer}
                onPress={() => setShowCargoDropdown(!showCargoDropdown)}
              >
                <Ionicons name="card-outline" size={18} color="#6b7280" />
                <RNText style={[styles.dropdownText, !formData.cargoId && styles.dropdownPlaceholder]}>
                  {cargos.find(c => c.IDcargo === formData.cargoId)?.nombre || 'Sin cargo asignado'}
                </RNText>
                <Ionicons name="chevron-down" size={18} color="#6b7280" />
              </TouchableOpacity>

              {showCargoDropdown && (
                <View style={styles.dropdownMenu}>
                  <TouchableOpacity
                    style={[styles.dropdownItem, !formData.cargoId && styles.dropdownItemActive]}
                    onPress={() => {
                      setFormData(prev => ({ ...prev, cargoId: '' }));
                      setShowCargoDropdown(false);
                    }}
                  >
                    <RNText style={[styles.dropdownItemText, !formData.cargoId && styles.dropdownItemTextActive]}>Sin cargo asignado</RNText>
                  </TouchableOpacity>
                  {cargos.map(cargo => (
                    <TouchableOpacity
                      key={cargo.IDcargo}
                      style={[styles.dropdownItem, formData.cargoId === cargo.IDcargo && styles.dropdownItemActive]}
                      onPress={() => {
                        setFormData(prev => ({ ...prev, cargoId: cargo.IDcargo }));
                        setShowCargoDropdown(false);
                      }}
                    >
                      <RNText style={[styles.dropdownItemText, formData.cargoId === cargo.IDcargo && styles.dropdownItemTextActive]}>
                        {cargo.nombre}
                      </RNText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={{ height: 120 }} />
          </ScrollView>

          <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { resetCreateForm(); setShowCreateModal(false); }}>
              <RNText style={styles.cancelBtnText}>Cancelar</RNText>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.submitBtn, loading && styles.submitBtnDisabled]} onPress={handleCreateUser} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <RNText style={styles.submitBtnText}>Crear Usuario</RNText>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEditModal}
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
        presentationStyle="pageSheet"
      >
        <View style={[styles.modalContainer, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
          <View style={styles.modalHeader}>
            <RNText style={styles.modalTitle}>Editar Usuario</RNText>
            <TouchableOpacity onPress={() => setShowEditModal(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.userDetailHeader}>
              <View style={styles.userDetailAvatar}>
                <RNText style={styles.userDetailAvatarText}>
                  {editFormData.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U'}
                </RNText>
              </View>
              <View style={styles.userDetailInfo}>
                <RNText style={styles.userDetailName}>{editFormData.nombre || 'Usuario'}</RNText>
                <View style={[styles.roleBadge, { backgroundColor: getRoleColor(editFormData.rol) + '20' }]}>
                  <RNText style={[styles.roleBadgeText, { color: getRoleColor(editFormData.rol) }]}>
                    {editFormData.rol || 'Sin rol'}
                  </RNText>
                </View>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>Nombre completo *</RNText>
              <View style={[styles.inputContainer, editFormErrors.nombre && styles.inputError]}>
                <Ionicons name="person-outline" size={18} color="#6b7280" />
                <TextInput
                  style={styles.input}
                  placeholder="Nombre completo"
                  placeholderTextColor="#9ca3af"
                  value={editFormData.nombre}
                  onChangeText={(text) => setEditFormData(prev => ({ ...prev, nombre: text }))}
                />
              </View>
              {editFormErrors.nombre && <RNText style={styles.errorText}>{editFormErrors.nombre}</RNText>}
            </View>

            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>Correo electrónico *</RNText>
              <View style={[styles.inputContainer, editFormErrors.email && styles.inputError]}>
                <Ionicons name="mail-outline" size={18} color="#6b7280" />
                <TextInput
                  style={styles.input}
                  placeholder="correo@ejemplo.com"
                  placeholderTextColor="#9ca3af"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={editFormData.email}
                  onChangeText={(text) => setEditFormData(prev => ({ ...prev, email: text }))}
                />
              </View>
              {editFormErrors.email && <RNText style={styles.errorText}>{editFormErrors.email}</RNText>}
            </View>

            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>Teléfono</RNText>
              <View style={styles.inputContainer}>
                <Ionicons name="call-outline" size={18} color="#6b7280" />
                <TextInput
                  style={styles.input}
                  placeholder="3001234567"
                  placeholderTextColor="#9ca3af"
                  keyboardType="phone-pad"
                  value={editFormData.telefono}
                  onChangeText={(text) => setEditFormData(prev => ({ ...prev, telefono: text }))}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>Cédula</RNText>
              <View style={styles.inputContainer}>
                <Ionicons name="card-outline" size={18} color="#6b7280" />
                <TextInput
                  style={styles.input}
                  placeholder="12345678"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  value={editFormData.cedula}
                  onChangeText={(text) => setEditFormData(prev => ({ ...prev, cedula: text }))}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>Dirección</RNText>
              <View style={styles.inputContainer}>
                <Ionicons name="location-outline" size={18} color="#6b7280" />
                <TextInput
                  style={styles.input}
                  placeholder="Dirección"
                  placeholderTextColor="#9ca3af"
                  value={editFormData.direccion}
                  onChangeText={(text) => setEditFormData(prev => ({ ...prev, direccion: text }))}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>Rol *</RNText>
              <TouchableOpacity
                style={[styles.inputContainer, editFormErrors.rol && styles.inputError]}
                onPress={() => setShowRolDropdown(!showRolDropdown)}
              >
                <Ionicons name="briefcase-outline" size={18} color="#6b7280" />
                <RNText style={[styles.dropdownText, !editFormData.rol && styles.dropdownPlaceholder]}>
                  {ROLES_DISPONIBLES.find(r => r.key === editFormData.rol)?.label || 'Seleccionar rol'}
                </RNText>
                <Ionicons name="chevron-down" size={18} color="#6b7280" />
              </TouchableOpacity>
              {editFormErrors.rol && <RNText style={styles.errorText}>{editFormErrors.rol}</RNText>}

              {showRolDropdown && (
                <View style={styles.dropdownMenu}>
                  {ROLES_DISPONIBLES.map(rol => (
                    <TouchableOpacity
                      key={rol.key}
                      style={[styles.dropdownItem, editFormData.rol === rol.key && styles.dropdownItemActive]}
                      onPress={() => {
                        setEditFormData(prev => ({ ...prev, rol: rol.key }));
                        setShowRolDropdown(false);
                        setEditFormErrors(prev => ({ ...prev, rol: '' }));
                      }}
                    >
                      <RNText style={[styles.dropdownItemText, editFormData.rol === rol.key && styles.dropdownItemTextActive]}>
                        {rol.label}
                      </RNText>
                      <RNText style={styles.dropdownItemDesc}>{rol.description}</RNText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>Cargo (Nómina) - Opcional</RNText>
              <TouchableOpacity
                style={styles.inputContainer}
                onPress={() => setShowEditCargoDropdown(!showEditCargoDropdown)}
              >
                <Ionicons name="card-outline" size={18} color="#6b7280" />
                <RNText style={[styles.dropdownText, !editFormData.cargoId && styles.dropdownPlaceholder]}>
                  {cargos.find(c => c.IDcargo === editFormData.cargoId)?.nombre || 'Sin cargo asignado'}
                </RNText>
                <Ionicons name="chevron-down" size={18} color="#6b7280" />
              </TouchableOpacity>

              {showEditCargoDropdown && (
                <View style={styles.dropdownMenu}>
                  <TouchableOpacity
                    style={[styles.dropdownItem, !editFormData.cargoId && styles.dropdownItemActive]}
                    onPress={() => {
                      setEditFormData(prev => ({ ...prev, cargoId: '' }));
                      setShowEditCargoDropdown(false);
                    }}
                  >
                    <RNText style={[styles.dropdownItemText, !editFormData.cargoId && styles.dropdownItemTextActive]}>Sin cargo asignado</RNText>
                  </TouchableOpacity>
                  {cargos.map(cargo => (
                    <TouchableOpacity
                      key={cargo.IDcargo}
                      style={[styles.dropdownItem, editFormData.cargoId === cargo.IDcargo && styles.dropdownItemActive]}
                      onPress={() => {
                        setEditFormData(prev => ({ ...prev, cargoId: cargo.IDcargo }));
                        setShowEditCargoDropdown(false);
                      }}
                    >
                      <RNText style={[styles.dropdownItemText, editFormData.cargoId === cargo.IDcargo && styles.dropdownItemTextActive]}>
                        {cargo.nombre}
                      </RNText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.switchRow}>
                <View style={styles.switchLabel}>
                  <RNText style={styles.inputLabel}>Usuario Activo</RNText>
                  <RNText style={styles.switchDescription}>
                    {editFormData.isActive ? 'El usuario puede iniciar sesión' : 'El usuario no puede iniciar sesión'}
                  </RNText>
                </View>
                <Switch
                  value={editFormData.isActive}
                  onValueChange={(value) => setEditFormData(prev => ({ ...prev, isActive: value }))}
                  trackColor={{ false: '#d1d5db', true: '#86efac' }}
                  thumbColor={editFormData.isActive ? '#22c55e' : '#9ca3af'}
                />
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.inputGroup}>
              <RNText style={styles.inputLabel}>PERMISOS DE OPERACIÓN (CRUD)</RNText>
              <RNText style={styles.modulesDescription}>
                Configura qué acciones puede realizar este usuario en cada módulo. (Proximamente vinculado al backend)
              </RNText>
              
              <View style={styles.crudGridHeader}>
                <RNText style={[styles.crudGridCol, { flex: 2, textAlign: 'left' }]}>Módulo</RNText>
                <RNText style={styles.crudGridCol}>Ver</RNText>
                <RNText style={styles.crudGridCol}>Crear</RNText>
                <RNText style={styles.crudGridCol}>Editar</RNText>
                <RNText style={styles.crudGridCol}>Eliminar</RNText>
              </View>

              {MODULOS_SISTEMA.map((grupo, gIndex) => (
                <View key={`grupo-${gIndex}`} style={{ marginBottom: 16 }}>
                  <View style={{ backgroundColor: '#f3f4f6', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, marginBottom: 4 }}>
                    <RNText style={{ fontSize: 13, fontWeight: '700', color: '#4b5563' }}>{grupo.grupo}</RNText>
                  </View>
                  {grupo.modulos.map(modulo => {
                    const modulePerms = editFormData.modulos[modulo.key] || { read: false, create: false, edit: false, delete: false };
                    
                    return (
                      <View key={modulo.key} style={styles.crudRow}>
                        <View style={[styles.crudGridCol, { flex: 2, alignItems: 'flex-start' }]}>
                          <RNText style={styles.crudModuleLabel}>{modulo.label}</RNText>
                        </View>
                        
                        <TouchableOpacity 
                          style={styles.crudGridCol} 
                          onPress={() => toggleModulo(modulo.key, 'read')}
                        >
                          <View style={[styles.crudCheckbox, modulePerms.read && styles.crudCheckboxChecked]}>
                            {modulePerms.read && <Ionicons name="checkmark" size={12} color="#fff" />}
                          </View>
                        </TouchableOpacity>
                        
                        {!modulo.soloLectura ? (
                          <>
                            <TouchableOpacity style={styles.crudGridCol} onPress={() => toggleModulo(modulo.key, 'create')}>
                              <View style={[styles.crudCheckbox, modulePerms.create && styles.crudCheckboxChecked]}>
                                {modulePerms.create && <Ionicons name="checkmark" size={12} color="#fff" />}
                              </View>
                            </TouchableOpacity>
                            
                            <TouchableOpacity style={styles.crudGridCol} onPress={() => toggleModulo(modulo.key, 'edit')}>
                              <View style={[styles.crudCheckbox, modulePerms.edit && styles.crudCheckboxChecked]}>
                                {modulePerms.edit && <Ionicons name="checkmark" size={12} color="#fff" />}
                              </View>
                            </TouchableOpacity>
                            
                            <TouchableOpacity style={styles.crudGridCol} onPress={() => toggleModulo(modulo.key, 'delete')}>
                              <View style={[styles.crudCheckbox, modulePerms.delete && styles.crudCheckboxChecked]}>
                                {modulePerms.delete && <Ionicons name="checkmark" size={12} color="#fff" />}
                              </View>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <>
                            <View style={styles.crudGridCol}>
                              <RNText style={{ color: '#d1d5db', fontSize: 10 }}>N/A</RNText>
                            </View>
                            <View style={styles.crudGridCol}>
                              <RNText style={{ color: '#d1d5db', fontSize: 10 }}>N/A</RNText>
                            </View>
                            <View style={styles.crudGridCol}>
                              <RNText style={{ color: '#d1d5db', fontSize: 10 }}>N/A</RNText>
                            </View>
                          </>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>

            <View style={{ height: 120 }} />
          </ScrollView>

          <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => selectedUser && handleDeleteUser(selectedUser)}
            >
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowEditModal(false); setSelectedUser(null); }}>
              <RNText style={styles.cancelBtnText}>Cancelar</RNText>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.submitBtn, loading && styles.submitBtnDisabled]} onPress={handleEditUser} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <RNText style={styles.submitBtnText}>Guardar</RNText>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCredentialsModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCredentialsModal(false)}
      >
        <View style={styles.credentialsOverlay}>
          <View style={styles.credentialsModal}>
            <View style={styles.credentialsIcon}>
              <Ionicons name="checkmark-circle" size={64} color="#22c55e" />
            </View>
            <RNText style={styles.credentialsTitle}>¡Usuario creado exitosamente!</RNText>
            <RNText style={styles.credentialsSubtitle}>
              Comparte las siguientes credenciales con el nuevo usuario:
            </RNText>

            <View style={styles.credentialsBox}>
              <View style={styles.credentialRow}>
                <RNText style={styles.credentialLabel}>Correo:</RNText>
                <TouchableOpacity onPress={() => copyToClipboard(createdCredentials?.email || '')}>
                  <RNText style={styles.credentialValue}>{createdCredentials?.email}</RNText>
                </TouchableOpacity>
              </View>
              <View style={styles.credentialRow}>
                <RNText style={styles.credentialLabel}>Contraseña:</RNText>
                <TouchableOpacity onPress={() => copyToClipboard(createdCredentials?.passwordTemporal || '')}>
                  <RNText style={styles.credentialValue}>{createdCredentials?.passwordTemporal}</RNText>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.copyAllBtn} onPress={() => {
              const text = `Correo: ${createdCredentials?.email}\nContraseña: ${createdCredentials?.passwordTemporal}`;
              copyToClipboard(text);
            }}>
              <Ionicons name="copy" size={18} color="#fff" />
              <RNText style={styles.copyAllBtnText}>Copiar Todo</RNText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeCredentialsBtn} onPress={() => setShowCredentialsModal(false)}>
              <RNText style={styles.closeCredentialsBtnText}>Cerrar</RNText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  logoutBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fef2f2', justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, paddingHorizontal: 20 },
  profileSection: { alignItems: 'center', paddingVertical: 32 },
  profileAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  profileAvatarText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  profileName: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 4 },
  profileEmail: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  profileRoleBadge: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16 },
  profileRoleBadgeText: { fontSize: 12, fontWeight: '700' },
  editProfileHint: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  editProfileHintText: { fontSize: 12, color: '#6b7280', marginLeft: 4 },
  adminSection: { marginTop: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5 },
  addUserBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  addUserBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 6 },
  usersList: {},
  userItemWrapper: { marginBottom: 12 },
  userItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  userItemInactive: { opacity: 0.6 },
  userAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  userAvatarText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 2 },
  userEmail: { fontSize: 13, color: '#6b7280', marginBottom: 6 },
  userMeta: { flexDirection: 'row', alignItems: 'center' },
  roleBadge: { alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8 },
  roleBadgeText: { fontSize: 10, fontWeight: '700' },
  statusBadge: { alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8, marginLeft: 6 },
  statusBadgeInactive: { backgroundColor: '#fef2f2' },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  loader: { paddingVertical: 40 },
  noAccessSection: { alignItems: 'center', paddingVertical: 60 },
  noAccessTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 16, marginBottom: 8 },
  noAccessText: { fontSize: 14, color: '#6b7280', textAlign: 'center', paddingHorizontal: 40, lineHeight: 22 },
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  modalScroll: { flex: 1, paddingHorizontal: 20 },
  userDetailHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', marginBottom: 8 },
  userDetailAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  userDetailAvatarText: { fontSize: 20, fontWeight: '700', color: '#fff' },
  userDetailInfo: { flex: 1 },
  userDetailName: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 6 },
  inputGroup: { marginTop: 20 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: 'transparent' },
  inputError: { borderColor: '#ef4444' },
  input: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: '#111827' },
  passwordRequirements: { marginTop: 6 },
  passwordReqText: { fontSize: 11, color: '#9ca3af' },
  errorText: { fontSize: 12, color: '#ef4444', marginTop: 4 },
  dropdownText: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: '#111827' },
  dropdownPlaceholder: { color: '#9ca3af' },
  dropdownMenu: { backgroundColor: '#fff', borderRadius: 12, marginTop: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4, borderWidth: 1, borderColor: '#e5e7eb' },
  dropdownItem: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dropdownItemActive: { backgroundColor: '#f0fdf4' },
  dropdownItemText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  dropdownItemTextActive: { color: '#22c55e' },
  dropdownItemDesc: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb', padding: 16, borderRadius: 12 },
  switchLabel: { flex: 1, marginRight: 16 },
  switchDescription: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 24 },
  modulesDescription: { fontSize: 12, color: '#6b7280', marginBottom: 16, marginTop: -4 },
  moduleItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, backgroundColor: '#f9fafb', borderRadius: 10, marginBottom: 10 },
  moduleInfo: { flex: 1 },
  moduleLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  moduleDescription: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  crudGridHeader: { flexDirection: 'row', backgroundColor: '#f3f4f6', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginBottom: 8 },
  crudGridCol: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#6b7280', justifyContent: 'center', alignItems: 'center' },
  crudRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', alignItems: 'center' },
  crudModuleLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  crudCheckbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: '#d1d5db', justifyContent: 'center', alignItems: 'center' },
  crudCheckboxChecked: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', padding: 20, borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 12 },
  deleteBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#ef4444', justifyContent: 'center', alignItems: 'center', marginRight: 'auto' },
  cancelBtn: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  submitBtn: { paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12, backgroundColor: '#4CAF50', minWidth: 120, alignItems: 'center' },
  submitBtnDisabled: { backgroundColor: '#9ca3af' },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  credentialsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  credentialsModal: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center' },
  credentialsIcon: { marginBottom: 16 },
  credentialsTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' },
  credentialsSubtitle: { fontSize: 14, color: '#6b7280', marginBottom: 20, textAlign: 'center' },
  credentialsBox: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, width: '100%', marginBottom: 20 },
  credentialRow: { marginBottom: 12 },
  credentialLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  credentialValue: { fontSize: 15, fontWeight: '600', color: '#111827' },
  copyAllBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366f1', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, marginBottom: 12 },
  copyAllBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, marginLeft: 8 },
  closeCredentialsBtn: { paddingVertical: 12 },
  closeCredentialsBtnText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
});

export default UsersScreen;