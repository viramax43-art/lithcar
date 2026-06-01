export type AdminRole = 'chief_admin' | 'admin' | 'moderator'

export function getAdminRoleLabel(role: string, translate?: (key: string, defaultValue: string) => string): string {
  const t = translate ?? ((_: string, defaultValue: string) => defaultValue)
  switch (role) {
    case 'chief_admin':
      return t('admin.roles.chiefAdmin', 'chief administrator')
    case 'admin':
      return t('admin.roles.admin', 'administrator')
    case 'moderator':
      return t('admin.roles.moderator', 'moderator')
    default:
      return role
  }
}

export function getAdminDisplayName(
  name: string,
  role: string,
  translate?: (key: string, defaultValue: string) => string,
): string {
  const t = translate ?? ((_: string, defaultValue: string) => defaultValue)
  const normalizedName = name.trim().toLowerCase()
  if (role === 'chief_admin' && normalizedName === 'bootstrap chief admin') {
    return t('admin.roles.chiefAdmin', 'chief administrator')
  }
  return name
}
