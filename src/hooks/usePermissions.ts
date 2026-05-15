import useAuthStore from '../store/useAuthStore';

/**
 * Hook para evaluar los permisos CRUD de un usuario en un módulo específico.
 * Retorna un objeto con booleanos listos para usar en renderizado condicional.
 * 
 * @param moduloKey La llave del módulo (ej. 'ventas', 'productos', 'caja')
 * @returns { canRead, canCreate, canEdit, canDelete }
 */
export function usePermissions(moduloKey: string) {
  const { user } = useAuthStore();

  // 1. Si no hay usuario, bloqueamos todo por seguridad
  if (!user) {
    return { canRead: false, canCreate: false, canEdit: false, canDelete: false };
  }

  // 2. Si el usuario es el super administrador maestro, le damos acceso total siempre
  if (user.rol === 'Admin app') {
    return { canRead: true, canCreate: true, canEdit: true, canDelete: true };
  }

  // 3. Para el resto de los roles, extraemos y evaluamos estrictamente su JSON de permisos
  const userPerms = user.permisos?.[moduloKey];

  if (!userPerms) {
    return { canRead: false, canCreate: false, canEdit: false, canDelete: false };
  }

  // Parseo robusto: soporta tanto booleanos primitivos como strings "true"/"false"
  return {
    canRead: userPerms.read === true || String(userPerms.read) === 'true',
    canCreate: userPerms.create === true || String(userPerms.create) === 'true',
    canEdit: userPerms.edit === true || String(userPerms.edit) === 'true',
    canDelete: userPerms.delete === true || String(userPerms.delete) === 'true',
  };
}
