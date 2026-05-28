import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
import '../../../core/state/session_controller.dart';
import '../../../services/app_security_service.dart';
import '../../../widgets/brand_auth_scaffold.dart';
import '../../../widgets/input_field.dart';
import '../../../widgets/primary_button.dart';
import '../../../widgets/secondary_button.dart';
import '../data/auth_repository.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen>
    with SingleTickerProviderStateMixin {
  final _email = TextEditingController();
  final _password = TextEditingController();
  late final AnimationController _shakeController;
  bool _loading = false;
  String _error = '';
  String _loadingLabel = 'Sign in';
  late Future<bool> _biometricLoginAvailable;

  @override
  void initState() {
    super.initState();
    _shakeController = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 360));
    _biometricLoginAvailable = Future.microtask(
        () => ref.read(authRepositoryProvider).hasBiometricLogin());
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _shakeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!mounted) return;
    setState(() {
      _loading = true;
      _loadingLabel = 'Checking FoodNova...';
      _error = '';
    });
    try {
      final repository = ref.read(authRepositoryProvider);
      await repository.checkHealth();
      if (!mounted) return;
      if (mounted) setState(() => _loadingLabel = 'Signing in...');
      await repository.login(
          email: _email.text, password: _password.text, preflight: false);
      if (!mounted) return;
      await _maybePromptBiometricSetup();
      if (mounted) context.go('/home');
    } catch (error) {
      if (!mounted) return;
      _shakeController.forward(from: 0);
      final message = error.toString().replaceFirst('Exception: ', '');
      setState(() => _error = message);
      if (mounted && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(message),
              action: SnackBarAction(label: 'Retry', onPressed: _submit)),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _maybePromptBiometricSetup() async {
    final service = ref.read(appSecurityServiceProvider);
    final shouldPrompt = await service.biometricSetupChoice();
    if (!mounted || shouldPrompt != true) return;
    final enable = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Enable Face ID / Fingerprint?'),
        content: const Text(
          'Use your device biometrics to unlock FoodNova faster on this phone.',
        ),
        actions: [
          TextButton(
            onPressed: () {
              if (dialogContext.mounted) {
                Navigator.pop(dialogContext, false);
              }
            },
            child: const Text('Maybe Later'),
          ),
          FilledButton(
            onPressed: () {
              if (dialogContext.mounted) {
                Navigator.pop(dialogContext, true);
              }
            },
            child: const Text('Enable'),
          ),
        ],
      ),
    );
    if (!mounted || enable != true) return;
    await service.setBiometricEnabled(true);
  }

  Future<void> _submitBiometric() async {
    if (!mounted) return;
    FocusScope.of(context).unfocus();
    if (!mounted) return;
    setState(() {
      _loading = true;
      _loadingLabel = 'Checking fingerprint...';
      _error = '';
    });
    try {
      final ok = await ref.read(authRepositoryProvider).loginWithBiometrics();
      if (!mounted) return;
      if (ok) {
        context.go('/home');
        return;
      }
      setState(() => _error = 'Fingerprint sign in was not completed.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return BrandAuthScaffold(
      footer: TextButton(
          onPressed: () => context.go('/signup'),
          child: const Text('New to FoodNova? Create account')),
      child: AnimatedBuilder(
        animation: _shakeController,
        builder: (context, child) {
          final phase = _shakeController.value;
          final dx =
              _error.isEmpty ? 0.0 : (1 - phase) * (phase < .5 ? 10 : -10);
          return Transform.translate(offset: Offset(dx, 0), child: child);
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Welcome Back \u{1F44B}',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w900, color: FoodNovaColors.heading),
            ),
            const SizedBox(height: 8),
            const Text(
              'Login to continue shopping smarter.',
              textAlign: TextAlign.center,
              style: TextStyle(color: FoodNovaColors.muted),
            ),
            const SizedBox(height: 26),
            InputField(
                controller: _email,
                label: 'Email',
                icon: Icons.mail_outline_rounded,
                keyboardType: TextInputType.emailAddress),
            const SizedBox(height: 14),
            InputField(
                controller: _password,
                label: 'Password',
                icon: Icons.lock_outline_rounded,
                obscureText: true),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                    color: FoodNovaColors.danger.withValues(alpha: .08),
                    borderRadius: BorderRadius.circular(12)),
                child: Text(_error,
                    style: const TextStyle(
                        color: FoodNovaColors.danger,
                        fontWeight: FontWeight.w800)),
              ),
            ],
            const SizedBox(height: 22),
            PrimaryButton(
                label: _loading ? _loadingLabel : 'Sign in',
                loading: _loading,
                onPressed: _loading ? null : _submit),
            FutureBuilder<bool>(
              future: _biometricLoginAvailable,
              builder: (context, snapshot) {
                if (snapshot.data != true) return const SizedBox.shrink();
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: _loading ? null : _submitBiometric,
                      icon: const Icon(Icons.fingerprint_rounded),
                      label: const Text('Sign in with Fingerprint'),
                    ),
                  ],
                );
              },
            ),
            const SizedBox(height: 10),
            SecondaryButton(
                label: 'Continue as guest',
                icon: Icons.storefront_rounded,
                onPressed: _loading
                    ? null
                    : () async {
                        await ref
                            .read(sessionControllerProvider.notifier)
                            .continueAsGuest();
                        if (context.mounted) context.go('/home');
                      }),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                TextButton(
                    onPressed:
                        _loading ? null : () => context.go('/forgot-password'),
                    child: const Text('Forgot password?')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
