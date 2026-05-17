export type AdminRole = 'chief_admin' | 'admin' | 'moderator'

export function getAdminRoleLabel(role: string): string {
  switch (role) {
    case 'chief_admin':
      return 'главный администратор'
    case 'admin':
      return 'администратор'
    case 'moderator':
      return 'модератор'
    default:
      return role
  }
}

export function getAdminDisplayName(name: string, role: string): string {
  const normalizedName = name.trim().toLowerCase()
  if (role === 'chief_admin' && normalizedName === 'bootstrap chief admin') {
    return 'главный администратор'
  }
  return name
}
