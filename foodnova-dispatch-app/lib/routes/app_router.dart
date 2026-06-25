import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/state/session_controller.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/pending_review_screen.dart';
import '../features/auth/presentation/signup_screen.dart';
import '../features/auth/presentation/forgot_password_screen.dart';
import '../features/dashboard/presentation/dashboard_screen.dart';
import '../features/delivery/presentation/active_delivery_screen.dart';
import '../features/delivery/presentation/delivery_orders_screen.dart';
import '../features/history/presentation/history_screen.dart';
import '../features/home/presentation/onboarding_screen.dart';
import '../features/home/presentation/splash_screen.dart';
import '../features/notifications/presentation/notifications_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../features/settings/presentation/debug_screen.dart';
import '../features/settings/presentation/settings_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    redirect: (_, state) {
      final authenticated =
          ref.watch(sessionControllerProvider).valueOrNull == true;
      final path = state.uri.path;
      final diagnostics = ref
          .watch(sessionControllerProvider.notifier)
          .cachedDiagnosticsOrEmpty;
      final approvalStatus =
          '${diagnostics['approval_status'] ?? ''}'.toUpperCase();
      final currentStep =
          int.tryParse('${diagnostics['current_step'] ?? 1}') ?? 1;
      final onboardingComplete =
          diagnostics['onboarding_complete'] == true || currentStep >= 7;
      final completedAuthRoute = [
        '/login',
        '/forgot-password',
      ].contains(path);
      if (authenticated && completedAuthRoute) return '/dashboard';
      if (!authenticated && _requiresSession(path)) return '/login';
      if (authenticated && approvalStatus == 'SUSPENDED') {
        return path == '/suspended' ? null : '/suspended';
      }
      if (authenticated && approvalStatus == 'DEACTIVATED') {
        return path == '/deactivated' ? null : '/deactivated';
      }
      if (authenticated &&
          approvalStatus == 'ONBOARDING' &&
          !onboardingComplete &&
          path != '/signup') {
        return '/signup';
      }
      if (authenticated &&
          approvalStatus == 'PENDING_REVIEW' &&
          path == '/dashboard') {
        return null;
      }
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (_, __) => const SplashScreen()),
      GoRoute(
        path: '/onboarding',
        builder: (_, __) => const OnboardingScreen(),
      ),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/signup', builder: (_, __) => const SignUpScreen()),
      GoRoute(
        path: '/pending-review',
        builder: (_, __) => const PendingReviewScreen(),
      ),
      GoRoute(
        path: '/suspended',
        builder: (_, __) => const _BlockedDispatchScreen(
          title: 'Account Suspended',
          message:
              'Your FoodNova Dispatch account is suspended. Contact FoodNova support before accepting deliveries.',
        ),
      ),
      GoRoute(
        path: '/deactivated',
        builder: (_, __) => const _BlockedDispatchScreen(
          title: 'Account Deactivated',
          message:
              'Your FoodNova Dispatch account is deactivated and cannot receive deliveries.',
        ),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (_, __) => const ForgotPasswordScreen(),
      ),
      GoRoute(path: '/dashboard', builder: (_, __) => const DashboardScreen()),
      GoRoute(
        path: '/active-delivery',
        builder: (_, state) => ActiveDeliveryScreen(extra: state.extra),
      ),
      GoRoute(
        path: '/orders',
        builder: (_, __) => const DeliveryOrdersScreen(),
      ),
      GoRoute(path: '/history', builder: (_, __) => const HistoryScreen()),
      GoRoute(
        path: '/notifications',
        builder: (_, __) => const NotificationsScreen(),
      ),
      GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
      GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
      GoRoute(path: '/debug', builder: (_, __) => const DebugScreen()),
    ],
  );
});

bool _requiresSession(String path) => ![
      '/',
      '/onboarding',
      '/login',
      '/signup',
      '/pending-review',
      '/suspended',
      '/deactivated',
      '/forgot-password',
    ].contains(path);

class _BlockedDispatchScreen extends ConsumerWidget {
  const _BlockedDispatchScreen({
    required this.title,
    required this.message,
  });

  final String title;
  final String message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.block_rounded,
              size: 72,
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(height: 18),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context)
                  .textTheme
                  .headlineSmall
                  ?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () async {
                await ref.read(sessionControllerProvider.notifier).clear();
                if (context.mounted) context.go('/login');
              },
              child: const Text('Return to Login'),
            ),
          ],
        ),
      ),
    );
  }
}
