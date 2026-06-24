export const CUSTOMER_ROLE = 'customer'
export const ADMIN_ROLE = 'admin'
export const SUPER_ADMIN_ROLE = 'super_admin'

export const normalizeAccountRole = (value) => {
  const role = String(value || '').trim().toLowerCase().replaceAll('-', '_')
  return role || CUSTOMER_ROLE
}

export const canUseCustomerApp = (role) =>
  [CUSTOMER_ROLE, ADMIN_ROLE, SUPER_ADMIN_ROLE].includes(normalizeAccountRole(role))

export const canUseAdminTools = (account = {}) => {
  const role = normalizeAccountRole(account.role)
  const adminRole = normalizeAccountRole(account.admin_role)
  return role === ADMIN_ROLE || role === SUPER_ADMIN_ROLE || adminRole === SUPER_ADMIN_ROLE
}
