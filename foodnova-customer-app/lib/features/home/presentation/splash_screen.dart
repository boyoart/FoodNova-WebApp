import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/startup/startup_controller.dart';
import '../../../core/theme/colors.dart';
import '../../../services/notification_service.dart';
import '../../../widgets/brand_logo.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _fade;
  bool _navigationCommitted = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    )..forward();
    _fade = CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic);
    Future<void>.microtask(
      () => ref.read(startupControllerProvider.notifier).resolve(),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _commitNavigation(StartupState state) {
    if (_navigationCommitted || state.phase != StartupPhase.ready) return;
    final defaultDestination = state.destination;
    if (defaultDestination == null) return;
    _navigationCommitted = true;
    final authenticated = defaultDestination == '/home' ||
        defaultDestination.startsWith('/admin/');
    final pending = authenticated
        ? NotificationService.consumePendingNavigationTarget()
        : null;
    final destination = pending ?? defaultDestination;
    debugPrint('CUSTOMER_SPLASH_DISMISSED destination=$destination');
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.go(destination);
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(startupControllerProvider, (_, next) {
      _commitNavigation(next);
    });
    final startup = ref.watch(startupControllerProvider);
    if (startup.phase == StartupPhase.ready) {
      _commitNavigation(startup);
    }
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
                    builder: (context, constraints) => FoodNovaLogo(
                      width: constraints.maxWidth.clamp(180.0, 240.0),
                      height: 104,
                      tightCrop: true,
                    ),
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
              if (startup.phase == StartupPhase.failed)
                _StartupFailure(
                  message: startup.error ?? 'FoodNova could not start.',
                  onRetry: () {
                    _navigationCommitted = false;
                    ref
                        .read(startupControllerProvider.notifier)
                        .resolve(retry: true);
                  },
                )
              else
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

class _StartupFailure extends StatelessWidget {
  const _StartupFailure({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('Retry'),
        ),
      ],
    );
  }
}
