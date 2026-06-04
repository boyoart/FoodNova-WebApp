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
    debugPrint('AUTH TOKEN: ${startupDiagnostics['token_preview']}');
    debugPrint('RIDER ID: ${startupDiagnostics['rider_id']}');
    debugPrint(
        'ONBOARDING COMPLETE: ${startupDiagnostics['onboarding_complete']}');
    debugPrint('PROFILE EXISTS: ${startupDiagnostics['profile_exists']}');
    debugPrint('PROFILE SOURCE: ${startupDiagnostics['profile_source']}');
    debugPrint('APPROVAL STATUS: ${startupDiagnostics['approval_status']}');
    final hasToken = await session.token();
    if (!mounted) return;
    if (hasToken == null || hasToken.isEmpty) {
      final completed = await session.onboardingCompleted();
      if (!mounted) return;
      final destination = completed ? '/login' : '/onboarding';
      debugPrint('ROUTE_REDIRECT reason=no_token destination=$destination');
      context.go(destination);
      return;
    }
    try {
      debugPrint('TOKEN_RESTORED token_length=${hasToken.length}');
      final rider = await ref.read(dispatchRepositoryProvider).me();
      if (!mounted) return;
      debugPrint('RIDER ID: ${rider.id ?? ''}');
      debugPrint('PROFILE EXISTS: true');
      debugPrint('PROFILE SOURCE: backend');
      debugPrint('APPROVAL STATUS: ${rider.kycStatus}');
      if (rider.isDeleted || rider.isSuspended) {
        debugPrint('TOKEN_INVALID reason=rider_deleted_or_suspended');
        await ref.read(sessionControllerProvider.notifier).clear();
        if (!mounted) return;
        debugPrint('ROUTE_REDIRECT reason=rider_blocked destination=/login');
        context.go('/login');
        return;
      }
      debugPrint(
          'ROUTE_REDIRECT reason=authenticated_and_valid destination=/dashboard');
      context.go('/dashboard');
    } catch (error) {
      if (!mounted) return;
      final friendlyMessage = apiMessage(error);
      setState(() => message = friendlyMessage);
      debugPrint('PROFILE EXISTS: false');
      debugPrint('PROFILE SOURCE: backend');
      debugPrint('TOKEN_INVALID reason=profile_fetch_failed error=$error');
      debugPrint(
          'ROUTE_REDIRECT reason=profile_fetch_failed destination=/login');
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
