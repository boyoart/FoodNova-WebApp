import 'package:flutter_test/flutter_test.dart';
import 'package:foodnova_customer_app/core/startup/startup_controller.dart';

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
}
