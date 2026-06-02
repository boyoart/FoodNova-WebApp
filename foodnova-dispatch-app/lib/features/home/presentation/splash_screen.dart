import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_client.dart';
import '../../../core/state/session_controller.dart';
import '../../../core/theme/colors.dart';
import '../../../core/widgets/fn_widgets.dart';
import '../../delivery/data/dispatch_repository.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  Timer? timer;
  String message = '';

  @override
  void initState() {
    super.initState();
    timer = Timer(const Duration(milliseconds: 900), _routeFromBackend);
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> _routeFromBackend() async {
    if (!mounted) return;
    final session = ref.read(sessionControllerProvider.notifier);
    final startupDiagnostics = await session.diagnostics();
    print('AUTH TOKEN: ${startupDiagnostics['token_preview']}');
    print('RIDER ID: ${startupDiagnostics['rider_id']}');
    print('ONBOARDING COMPLETE: ${startupDiagnostics['onboarding_complete']}');
    print('PROFILE EXISTS: ${startupDiagnostics['profile_exists']}');
    print('PROFILE SOURCE: ${startupDiagnostics['profile_source']}');
    print('APPROVAL STATUS: ${startupDiagnostics['approval_status']}');
    final hasToken = await session.token();
    if (!mounted) return;
    if (hasToken == null || hasToken.isEmpty) {
      final completed = await session.onboardingCompleted();
      if (!mounted) return;
      final destination = completed ? '/login' : '/onboarding';
      print('RIDER_STARTUP_REDIRECT $destination');
      context.go(destination);
      return;
    }
    try {
      final rider = await ref.read(dispatchRepositoryProvider).me();
      if (!mounted) return;
      print('RIDER ID: ${rider.id ?? ''}');
      print('PROFILE EXISTS: true');
      print('PROFILE SOURCE: backend');
      print('APPROVAL STATUS: ${rider.kycStatus}');
      if (rider.isDeleted || rider.isSuspended) {
        await ref.read(sessionControllerProvider.notifier).clear();
        print('RIDER_STARTUP_REDIRECT login_blocked');
        context.go('/login');
        return;
      }
      print('RIDER_STARTUP_REDIRECT dashboard');
      context.go('/dashboard');
    } catch (error) {
      if (!mounted) return;
      final friendlyMessage = apiMessage(error);
      setState(() => message = friendlyMessage);
      print('PROFILE EXISTS: false');
      print('PROFILE SOURCE: backend');
      print('RIDER_STARTUP_REDIRECT login_profile_fetch_failed');
      await session.clear();
      if (!mounted) return;
      context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: FoodNovaColors.primary,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const BrandLogo(width: 230, height: 112, darkSurface: true),
            const SizedBox(height: 18),
            const Text(
              'FoodNova Dispatch',
              style: TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.w800,
              ),
            ),
            if (message.isNotEmpty) ...[
              const SizedBox(height: 14),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Text(
                  message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
