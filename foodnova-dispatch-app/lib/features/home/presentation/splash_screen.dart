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
    final hasToken = await ref.read(sessionControllerProvider.notifier).token();
    if (!mounted) return;
    if (hasToken == null || hasToken.isEmpty) {
      print('RIDER_STARTUP_REDIRECT onboarding');
      context.go('/onboarding');
      return;
    }
    try {
      final rider = await ref.read(dispatchRepositoryProvider).me();
      if (!mounted) return;
      if (rider.isDeleted || rider.isSuspended) {
        await ref.read(sessionControllerProvider.notifier).clear();
        print('RIDER_STARTUP_REDIRECT login_blocked');
        context.go('/login');
        return;
      }
      print('RIDER_STARTUP_REDIRECT dashboard');
      context.go('/dashboard');
    } catch (error) {
      await ref.read(sessionControllerProvider.notifier).clear();
      if (!mounted) return;
      setState(() => message = apiMessage(error));
      print('RIDER_STARTUP_REDIRECT login_profile_missing');
      timer = Timer(const Duration(milliseconds: 900), () {
        if (mounted) context.go('/login');
      });
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
