import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
import '../../../core/state/session_controller.dart';
import '../../../shared/auth/account_roles.dart';
import '../../../services/notification_service.dart';
import '../../../widgets/brand_logo.dart';
import '../../auth/data/auth_repository.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _fade;
  Timer? _navigationTimer;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 900))
      ..forward();
    _fade = CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic);
    _navigationTimer = Timer(const Duration(milliseconds: 1200), () async {
      final authenticatedUser =
          await ref.read(authRepositoryProvider).restoreSession();
      final guest =
          await ref.read(sessionControllerProvider.notifier).isGuest();
      if (!mounted) return;
      if (authenticatedUser != null) {
        if (NotificationService.consumePendingNotificationNavigation()) {
          context.go('/notifications');
          return;
        }
        context.go(_dashboardPathFor(authenticatedUser));
        return;
      }
      if (await ref.read(authRepositoryProvider).hasBiometricLogin()) {
        if (!mounted) return;
        final wantsBiometric = await _askForBiometricLogin(context);
        if (!mounted) return;
        if (wantsBiometric == true) {
          final user =
              await ref.read(authRepositoryProvider).loginWithBiometrics();
          if (!mounted) return;
          if (user != null) {
            if (NotificationService.consumePendingNotificationNavigation()) {
              context.go('/notifications');
              return;
            }
            context.go(_dashboardPathFor(user));
            return;
          }
        }
        if (wantsBiometric == false) {
          context.go('/login');
          return;
        }
      }
      if (!mounted) return;
      context.go(guest ? '/home' : '/onboarding');
    });
  }

  @override
  void dispose() {
    _navigationTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: FoodNovaColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 28),
          child: Column(
            children: [
              const Spacer(),
              FadeTransition(
                opacity: _fade,
                child: ScaleTransition(
                  scale: Tween(begin: .94, end: 1.0).animate(_fade),
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final logoWidth =
                          constraints.maxWidth.clamp(180.0, 240.0);
                      return FoodNovaLogo(
                        width: logoWidth,
                        height: 104,
                        tightCrop: true,
                      );
                    },
                  ),
                ),
              ),
              const Spacer(),
              Text(
                'Fresh food at your doorstep',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: FoodNovaColors.heading,
                      fontWeight: FontWeight.w900,
                    ),
              ),
              const SizedBox(height: 18),
              const SizedBox(
                width: 26,
                height: 26,
                child: CircularProgressIndicator(strokeWidth: 2.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _dashboardPathFor(Map<String, dynamic> user) {
  final role = normalizeAccountRole(user['role'] ?? user['admin_role']);
  if (canUseAdminTools(role)) {
    debugPrint('ADMIN_DASHBOARD_LOADING');
    return '/admin/dashboard';
  }
  debugPrint('CUSTOMER_DASHBOARD_LOADING');
  return '/home';
}

Future<bool?> _askForBiometricLogin(BuildContext context) {
  return showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (context) => AlertDialog(
      title: const Text('Continue with Fingerprint?'),
      content: const Text('Use your saved FoodNova login on this device.'),
      actions: [
        TextButton(
          onPressed: () {
            if (context.mounted) Navigator.pop(context, false);
          },
          child: const Text('Use Password Instead'),
        ),
        FilledButton.icon(
          onPressed: () {
            if (context.mounted) Navigator.pop(context, true);
          },
          icon: const Icon(Icons.fingerprint_rounded),
          label: const Text('Use Fingerprint'),
        ),
      ],
    ),
  );
}
