import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/services.dart';
import 'package:foodnova_customer_app/core/state/session_controller.dart';
import 'package:foodnova_customer_app/core/startup/startup_controller.dart';
import 'package:foodnova_customer_app/features/auth/data/auth_repository.dart';

void main() {
  test('valid customer session exits splash to home', () {
    expect(
      startupDestination(
        authenticatedUser: const {'role': 'customer'},
        hadSavedSession: true,
        guestMode: false,
      ),
      '/home',
    );
  });

  test('valid admin session exits splash to admin dashboard', () {
    expect(
      startupDestination(
        authenticatedUser: const {'role': 'admin'},
        hadSavedSession: true,
        guestMode: false,
      ),
      '/admin/dashboard',
    );
  });

  test('expired or unavailable saved session exits splash to login', () {
    expect(
      startupDestination(
        authenticatedUser: null,
        hadSavedSession: true,
        guestMode: false,
      ),
      '/login',
    );
  });

  test('guest session exits splash to home', () {
    expect(
      startupDestination(
        authenticatedUser: null,
        hadSavedSession: false,
        guestMode: true,
      ),
      '/home',
    );
  });

  test('new device exits splash to onboarding', () {
    expect(
      startupDestination(
        authenticatedUser: null,
        hadSavedSession: false,
        guestMode: false,
      ),
      '/onboarding',
    );
  });

  test('restoration outcomes remain distinct', () {
    expect(
        SessionRestorationStatus.values,
        containsAll(<SessionRestorationStatus>[
          SessionRestorationStatus.valid,
          SessionRestorationStatus.invalid,
          SessionRestorationStatus.networkFailure,
          SessionRestorationStatus.serverFailure,
          SessionRestorationStatus.timeout,
        ]));
    expect(StartupSessionState.values, hasLength(6));
  });

  test('BadPaddingException is recognized as secure-storage corruption', () {
    expect(
      isSecureStorageCorruption(PlatformException(
        code: 'Exception encountered, read',
        message: 'javax.crypto.BadPaddingException',
      )),
      isTrue,
    );
  });

  test('OpenSSL BAD_DECRYPT is recognized as secure-storage corruption', () {
    expect(
      isSecureStorageCorruption(PlatformException(
        code: 'read',
        message: 'OPENSSL_internal:BAD_DECRYPT',
      )),
      isTrue,
    );
  });

  test('unrelated platform exceptions are not treated as corruption', () {
    expect(
      isSecureStorageCorruption(PlatformException(
        code: 'permission_denied',
        message: 'Device policy denied access',
      )),
      isFalse,
    );
  });

  test('corruption recovery targets only known auth-secure values', () {
    expect(SessionController.corruptedAuthKeys, contains('access_token'));
    expect(SessionController.corruptedAuthKeys, contains('foodnova_user'));
    expect(SessionController.corruptedAuthKeys,
        contains('foodnova_biometric_token'));
    expect(
        SessionController.corruptedAuthKeys, isNot(contains('foodnova_cart')));
  });
}
