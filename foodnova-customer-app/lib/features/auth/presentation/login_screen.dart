import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
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

class _LoginScreenState extends ConsumerState<LoginScreen> with SingleTickerProviderStateMixin {
  final _email = TextEditingController();
  final _password = TextEditingController();
  late final AnimationController _shakeController;
  bool _loading = false;
  String _error = '';
  String _loadingLabel = 'Sign in';

  @override
  void initState() {
    super.initState();
    _shakeController = AnimationController(vsync: this, duration: const Duration(milliseconds: 360));
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
    setState(() {
      _loading = true;
      _loadingLabel = 'Checking FoodNova...';
      _error = '';
    });
    try {
      await ref.read(authRepositoryProvider).checkHealth();
      if (mounted) setState(() => _loadingLabel = 'Signing in...');
      await ref.read(authRepositoryProvider).login(email: _email.text, password: _password.text, preflight: false);
      if (mounted) context.go('/home');
    } catch (error) {
      _shakeController.forward(from: 0);
      final message = error.toString().replaceFirst('Exception: ', '');
      setState(() => _error = message);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(message), action: SnackBarAction(label: 'Retry', onPressed: _submit)),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return BrandAuthScaffold(
      footer: TextButton(onPressed: () => context.go('/signup'), child: const Text('New to FoodNova? Create account')),
      child: AnimatedBuilder(
        animation: _shakeController,
        builder: (context, child) {
          final phase = _shakeController.value;
          final dx = _error.isEmpty ? 0.0 : (1 - phase) * (phase < .5 ? 10 : -10);
          return Transform.translate(offset: Offset(dx, 0), child: child);
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Welcome back',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900, color: FoodNovaColors.heading),
            ),
            const SizedBox(height: 8),
            const Text(
              'Shop FoodNova essentials and track local delivery in one calm place.',
              textAlign: TextAlign.center,
              style: TextStyle(color: FoodNovaColors.muted),
            ),
            const SizedBox(height: 26),
            InputField(controller: _email, label: 'Email', icon: Icons.mail_outline_rounded, keyboardType: TextInputType.emailAddress),
            const SizedBox(height: 14),
            InputField(controller: _password, label: 'Password', icon: Icons.lock_outline_rounded, obscureText: true),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: FoodNovaColors.danger.withOpacity(.08), borderRadius: BorderRadius.circular(12)),
                child: Text(_error, style: const TextStyle(color: FoodNovaColors.danger, fontWeight: FontWeight.w800)),
              ),
            ],
            const SizedBox(height: 22),
            PrimaryButton(label: _loading ? _loadingLabel : 'Sign in', loading: _loading, onPressed: _loading ? null : _submit),
            const SizedBox(height: 10),
            SecondaryButton(label: 'Continue as guest', icon: Icons.storefront_rounded, onPressed: _loading ? null : () => context.go('/home')),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                TextButton(onPressed: _loading ? null : () => context.go('/otp'), child: const Text('OTP')),
                const Text('-', style: TextStyle(color: FoodNovaColors.muted)),
                TextButton(onPressed: _loading ? null : () => context.go('/forgot-password'), child: const Text('Forgot password?')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
