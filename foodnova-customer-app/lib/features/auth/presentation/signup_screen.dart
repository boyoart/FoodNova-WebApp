import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
import '../../../widgets/brand_auth_scaffold.dart';
import '../../../widgets/input_field.dart';
import '../../../widgets/primary_button.dart';
import '../../../widgets/secondary_button.dart';
import '../data/auth_repository.dart';

class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String _error = '';

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      await ref.read(authRepositoryProvider).register(
            fullName: _name.text,
            email: _email.text,
            phone: _phone.text,
            password: _password.text,
          );
      if (mounted) context.go('/home');
    } catch (error) {
      setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return BrandAuthScaffold(
      footer: TextButton(onPressed: () => context.go('/login'), child: const Text('Already have an account? Sign in')),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Create your account', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          const Text(
            'Save addresses, track orders, and shop FoodNova faster.',
            textAlign: TextAlign.center,
            style: TextStyle(color: FoodNovaColors.muted),
          ),
          const SizedBox(height: 24),
          InputField(controller: _name, label: 'Full name', icon: Icons.person_outline_rounded),
          const SizedBox(height: 12),
          InputField(controller: _email, label: 'Email', icon: Icons.mail_outline_rounded, keyboardType: TextInputType.emailAddress),
          const SizedBox(height: 12),
          InputField(controller: _phone, label: 'Phone number', icon: Icons.phone_outlined, keyboardType: TextInputType.phone),
          const SizedBox(height: 12),
          InputField(controller: _password, label: 'Password', icon: Icons.lock_outline_rounded, obscureText: true),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(_error, style: const TextStyle(color: FoodNovaColors.danger, fontWeight: FontWeight.w800)),
          ],
          const SizedBox(height: 22),
          PrimaryButton(label: _loading ? 'Creating account...' : 'Create account', loading: _loading, onPressed: _loading ? null : _submit),
          const SizedBox(height: 10),
          SecondaryButton(label: 'Continue as guest', icon: Icons.storefront_rounded, onPressed: () => context.go('/home')),
        ],
      ),
    );
  }
}
