const customerRole = 'customer';
const adminRole = 'admin';
const superAdminRole = 'super_admin';

const shoppingAppRoles = {
  customerRole,
  adminRole,
  superAdminRole,
};

const adminToolRoles = {
  adminRole,
  superAdminRole,
};

String normalizeAccountRole(Object? value) {
  if (value == null) return customerRole;
  final role = '$value'.trim().toLowerCase().replaceAll('-', '_');
  return role.isEmpty ? customerRole : role;
}

bool canUseCustomerApp(Object? role) {
  return shoppingAppRoles.contains(normalizeAccountRole(role));
}

bool canUseAdminTools(Object? role) {
  return adminToolRoles.contains(normalizeAccountRole(role));
}
