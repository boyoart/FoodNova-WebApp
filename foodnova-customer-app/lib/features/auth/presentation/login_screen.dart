import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../widgets/brand_logo.dart';
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
          SnackBar(
            content: Text(message),
            action: SnackBarAction(label: 'Retry', onPressed: _submit),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [FoodNovaColors.surface2, FoodNovaColors.bg],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(22),
              child: AnimatedBuilder(
                animation: _shakeController,
                builder: (context, child) {
                  final phase = _shakeController.value;
                  final dx = _error.isEmpty ? 0.0 : (1 - phase) * (phase < .5 ? 10 : -10);
                  return Transform.translate(offset: Offset(dx, 0), child: child);
                },
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 460),
                  padding: const EdgeInsets.all(22),
                  decoration: BoxDecoration(
                    color: FoodNovaColors.surface,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: FoodNovaColors.border),
                    boxShadow: FoodNovaShadows.soft,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Center(child: BrandLogo(height: 76)),
                      const SizedBox(height: 26),
                      Text(
                        'Welcome back',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                              fontWeight: FontWeight.w900,
                              color: FoodNovaColors.heading,
                            ),
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
                          decoration: BoxDecoration(
                            color: FoodNovaColors.danger.withOpacity(.08),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(_error, style: const TextStyle(color: FoodNovaColors.danger, fontWeight: FontWeight.w800)),
                        ),
                      ],
                      const SizedBox(height: 22),
                      PrimaryButton(label: _loading ? _loadingLabel : 'Sign in', loading: _loading, onPressed: _loading ? null : _submit),
                      const SizedBox(height: 10),
                      SecondaryButton(label: 'Retry', icon: Icons.refresh_rounded, onPressed: _loading ? null : _submit),
                      TextButton(onPressed: _loading ? null : () => context.go('/otp'), child: const Text('Continue with OTP')),
                      TextButton(onPressed: _loading ? null : () {}, child: const Text('Forgot password?')),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
