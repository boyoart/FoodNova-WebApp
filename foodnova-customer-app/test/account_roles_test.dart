import 'package:flutter_test/flutter_test.dart';
import 'package:foodnova_customer_app/shared/auth/account_roles.dart';
import 'package:foodnova_customer_app/features/profile/data/profile_repository.dart';

void main() {
  group('customer app role access', () {
    test('allows customer, admin, and super_admin into the shopping app', () {
      expect(canUseCustomerApp('customer'), isTrue);
      expect(canUseCustomerApp('admin'), isTrue);
      expect(canUseCustomerApp('super_admin'), isTrue);
    });

    test('only admin and super_admin can use admin tools', () {
      expect(canUseAdminTools('customer'), isFalse);
      expect(canUseAdminTools('admin'), isTrue);
      expect(canUseAdminTools('super_admin'), isTrue);
    });

    test('normalizes backend role values before checking access', () {
      expect(normalizeAccountRole(' Super-Admin '), 'super_admin');
      expect(canUseAdminTools(' Super-Admin '), isTrue);
      expect(canUseCustomerApp(null), isTrue);
    });

    test('profile exposes admin tools only for elevated roles', () {
      expect(
        ProfileData(
          profile: const {'role': 'customer'},
          addresses: const [],
        ).isAdmin,
        isFalse,
      );
      expect(
        ProfileData(
          profile: const {'role': 'admin'},
          addresses: const [],
        ).isAdmin,
        isTrue,
      );
      expect(
        ProfileData(
          profile: const {'role': 'super_admin'},
          addresses: const [],
        ).isAdmin,
        isTrue,
      );
    });
  });
}
