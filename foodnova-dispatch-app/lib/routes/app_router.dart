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
import '../features/earnings/presentation/earnings_screen.dart';
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
      final completedAuthRoute = [
        '/login',
        '/forgot-password',
        '/onboarding',
      ].contains(path);
      if (authenticated && completedAuthRoute) return '/dashboard';
      if (!authenticated && _requiresSession(path)) return '/login';
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
      GoRoute(path: '/earnings', builder: (_, __) => const EarningsScreen()),
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
      '/forgot-password',
    ].contains(path);
