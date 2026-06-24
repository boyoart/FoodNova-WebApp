import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/admin/presentation/admin_portal_screens.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/forgot_password_screen.dart';
import '../features/auth/presentation/otp_screen.dart';
import '../features/auth/presentation/signup_screen.dart';
import '../features/cart/presentation/cart_screen.dart';
import '../features/checkout/presentation/checkout_screen.dart';
import '../features/home/presentation/home_screen.dart';
import '../features/home/presentation/onboarding_screen.dart';
import '../features/home/presentation/splash_screen.dart';
import '../features/notifications/presentation/notifications_screen.dart';
import '../features/orders/presentation/orders_screen.dart';
import '../features/products/presentation/categories_screen.dart';
import '../features/products/presentation/product_detail_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../features/tracking/presentation/tracking_screen.dart';
import '../core/state/session_controller.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    redirect: (_, state) {
      final authenticated =
          ref.read(sessionControllerProvider).valueOrNull == true;
      final path = state.uri.path;
      final authRoute = path == '/login' ||
          path == '/signup' ||
          path == '/forgot-password' ||
          path == '/otp' ||
          path == '/onboarding';
      if (authenticated && authRoute) return '/home';
      if (!authenticated && _requiresSession(path)) return '/login';
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (_, __) => const SplashScreen()),
      GoRoute(
          path: '/onboarding', builder: (_, __) => const OnboardingScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/signup', builder: (_, __) => const SignUpScreen()),
      GoRoute(
          path: '/forgot-password',
          builder: (_, __) => const ForgotPasswordScreen()),
      GoRoute(path: '/otp', builder: (_, __) => const OtpScreen()),
      GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
      GoRoute(path: '/categories', redirect: (_, __) => '/discover'),
      GoRoute(path: '/discover', builder: (_, __) => const DiscoverScreen()),
      GoRoute(
        path: '/products/:id',
        builder: (_, state) => ProductDetailScreen(
            productId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0),
      ),
      GoRoute(
        path: '/packs/:id',
        builder: (_, state) => ProductDetailScreen(
            productId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
            isPack: true),
      ),
      GoRoute(path: '/cart', builder: (_, __) => const CartScreen()),
      GoRoute(path: '/checkout', builder: (_, __) => const CheckoutScreen()),
      GoRoute(path: '/orders', builder: (_, __) => const OrdersScreen()),
      GoRoute(
        path: '/tracking/:id',
        builder: (_, state) => TrackingScreen(
            orderId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0),
      ),
      GoRoute(
          path: '/notifications',
          builder: (_, __) => const NotificationsScreen()),
      GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
      GoRoute(
          path: '/admin/dashboard',
          builder: (_, __) => const AdminGuard(child: AdminDashboardScreen())),
      GoRoute(
          path: '/admin/orders',
          builder: (_, __) => const AdminGuard(child: AdminOrdersScreen())),
      GoRoute(
          path: '/admin/dispatch',
          builder: (_, __) => const AdminGuard(child: AdminDispatchScreen())),
      GoRoute(
          path: '/admin/inventory',
          builder: (_, __) => const AdminGuard(child: AdminInventoryScreen())),
      GoRoute(
          path: '/admin/announcements',
          builder: (_, __) =>
              const AdminGuard(child: AdminAnnouncementsScreen())),
      GoRoute(
          path: '/admin/customers',
          builder: (_, __) => const AdminGuard(child: AdminCustomersScreen())),
      GoRoute(
          path: '/admin/reports',
          builder: (_, __) => const AdminGuard(child: AdminReportsScreen())),
      GoRoute(
          path: '/admin/settings',
          builder: (_, __) => const AdminGuard(child: AdminSettingsScreen())),
    ],
  );
});

bool _requiresSession(String path) {
  return path == '/checkout' ||
      path == '/orders' ||
      path == '/notifications' ||
      path == '/profile' ||
      path.startsWith('/tracking/') ||
      path.startsWith('/admin/');
}
