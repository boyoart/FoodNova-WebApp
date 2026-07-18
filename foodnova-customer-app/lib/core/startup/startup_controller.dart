import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/data/auth_repository.dart';
import '../../shared/auth/account_roles.dart';
import '../state/session_controller.dart';

enum StartupPhase { idle, restoringSession, ready, failed }

class StartupState {
  const StartupState({
    required this.phase,
    this.destination,
    this.error,
  });

  const StartupState.idle() : this(phase: StartupPhase.idle);

  final StartupPhase phase;
  final String? destination;
  final String? error;

  bool get isTerminal =>
      phase == StartupPhase.ready || phase == StartupPhase.failed;
}

String startupDestination({
  Map<String, dynamic>? authenticatedUser,
  required bool hadSavedSession,
  required bool guestMode,
}) {
  if (authenticatedUser != null) {
    final role = normalizeAccountRole(
      authenticatedUser['role'] ?? authenticatedUser['admin_role'],
    );
    return canUseAdminTools(role) ? '/admin/dashboard' : '/home';
  }
  if (hadSavedSession) return '/login';
  return guestMode ? '/home' : '/onboarding';
}

final startupControllerProvider =
    StateNotifierProvider<StartupController, StartupState>((ref) {
  return StartupController(ref);
});

class StartupController extends StateNotifier<StartupState> {
  StartupController(this._ref) : super(const StartupState.idle());

  static const _sessionTimeout = Duration(seconds: 12);
  static const _storageTimeout = Duration(seconds: 4);

  final Ref _ref;
  Future<void>? _activeResolution;

  Future<void> resolve({bool retry = false}) {
    if (!retry && state.isTerminal) return Future.value();
    final active = _activeResolution;
    if (active != null) return active;
    final resolution = _resolve();
    _activeResolution = resolution;
    return resolution.whenComplete(() => _activeResolution = null);
  }

  Future<void> _resolve() async {
    state = const StartupState(phase: StartupPhase.restoringSession);
    debugPrint('CUSTOMER_STARTUP_PHASE=restoring_session');
    try {
      final session = _ref.read(sessionControllerProvider.notifier);
      final savedToken = await session.token().timeout(_storageTimeout);
      final hadSavedSession = savedToken != null && savedToken.isNotEmpty;

      Map<String, dynamic>? user;
      try {
        user = await _ref
            .read(authRepositoryProvider)
            .restoreSession()
            .timeout(_sessionTimeout);
      } on TimeoutException {
        debugPrint('CUSTOMER_STARTUP_SESSION=timeout');
      }

      if (user == null && hadSavedSession) {
        await session.clear().timeout(_storageTimeout);
      }
      final guest = hadSavedSession
          ? false
          : await session.isGuest().timeout(
                _storageTimeout,
                onTimeout: () => false,
              );
      final destination = startupDestination(
        authenticatedUser: user,
        hadSavedSession: hadSavedSession,
        guestMode: guest,
      );
      debugPrint(
        'CUSTOMER_STARTUP_SESSION=${user != null ? 'authenticated' : hadSavedSession ? 'invalid_or_unavailable' : guest ? 'guest' : 'none'}',
      );
      debugPrint('CUSTOMER_STARTUP_DESTINATION=$destination');
      state = StartupState(
        phase: StartupPhase.ready,
        destination: destination,
      );
    } catch (error, stack) {
      debugPrint('CUSTOMER_STARTUP_FAILED=$error');
      debugPrintStack(stackTrace: stack);
      state = const StartupState(
        phase: StartupPhase.failed,
        error: 'FoodNova could not restore this device session.',
      );
    }
  }
}
