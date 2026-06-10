import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:local_auth/local_auth.dart';

import '../../../core/network/api_client.dart';
import '../../../core/state/session_controller.dart';
import '../../../core/widgets/fn_widgets.dart';
import '../data/auth_repository.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final emailOrPhone = TextEditingController();
  final password = TextEditingController();
  bool remember = true;
  bool loading = false;
  String error = '';

  @override
  void dispose() {
    emailOrPhone.dispose();
    password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(22),
          children: [
            const SizedBox(height: 10),
            const Center(child: BrandLogo(width: 220, height: 88)),
            const SizedBox(height: 30),
            Text(
              'Welcome Back',
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 6),
            const Text('Login to continue dispatching FoodNova orders.'),
            const SizedBox(height: 24),
            TextField(
              controller: emailOrPhone,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                labelText: 'Phone number or email',
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: password,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password'),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Checkbox(
                  value: remember,
                  onChanged: (value) =>
                      setState(() => remember = value ?? true),
                ),
                const Text('Remember me'),
                const Spacer(),
                TextButton(
                  onPressed: () => context.go('/forgot-password'),
                  child: const Text('Forgot password?'),
                ),
              ],
            ),
            if (error.isNotEmpty)
              Text(
                error,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: loading ? null : _login,
              child: Text(loading ? 'Signing in...' : 'Login'),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _biometricLogin,
              icon: const Icon(Icons.fingerprint),
              label: const Text('Fingerprint or Face Login'),
            ),
            TextButton(
              onPressed: () => context.go('/signup'),
              child: const Text('Create rider account'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _login() async {
    setState(() {
      loading = true;
      error = '';
    });
    try {
      await ref.read(authRepositoryProvider).login(
            emailOrPhone: emailOrPhone.text,
            password: password.text,
            remember: remember,
          );
      if (!mounted) return;
      final diagnostics =
          await ref.read(sessionControllerProvider.notifier).diagnostics();
      final status = '${diagnostics['approval_status'] ?? ''}'.toUpperCase();
      final step = int.tryParse('${diagnostics['current_step'] ?? 1}') ?? 1;
      final incomplete = status == 'ONBOARDING' || step < 7;
      final destination = incomplete
          ? '/signup'
          : status == 'PENDING_REVIEW'
              ? '/pending-review'
              : '/dashboard';
      debugPrint(
          'RIDER_LOGIN_SUCCESS route_redirect=$destination current_step=$step status=$status');
      if (mounted) context.go(destination);
    } catch (e) {
      if (!mounted) return;
      debugPrint('RIDER_LOGIN_FAILURE error=$e');
      setState(() => error = apiMessage(e));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _biometricLogin() async {
    final auth = LocalAuthentication();
    final available =
        await auth.canCheckBiometrics || await auth.isDeviceSupported();
    if (!mounted) return;
    if (!available) {
      setState(
        () => error = 'Biometric login is not available on this device.',
      );
      return;
    }
    final ok = await auth.authenticate(
      localizedReason: 'Unlock FoodNova Dispatch',
    );
    if (!mounted) return;
    if (ok) {
      setState(
        () => error = 'Enter credentials once to bind this secure session.',
      );
    }
  }
}
