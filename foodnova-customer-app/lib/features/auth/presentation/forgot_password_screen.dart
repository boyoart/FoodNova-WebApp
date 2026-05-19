import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
import '../../../widgets/brand_auth_scaffold.dart';
import '../../../widgets/input_field.dart';
import '../../../widgets/primary_button.dart';
import '../../../widgets/secondary_button.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _email = TextEditingController();
  bool _sent = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BrandAuthScaffold(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Reset password', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Text(
            _sent ? 'If the email exists, FoodNova will send reset instructions.' : 'Enter the email attached to your FoodNova account.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: FoodNovaColors.muted),
          ),
          const SizedBox(height: 24),
          InputField(controller: _email, label: 'Email', icon: Icons.mail_outline_rounded, keyboardType: TextInputType.emailAddress),
          const SizedBox(height: 22),
          PrimaryButton(label: _sent ? 'Sent' : 'Send reset link', icon: Icons.mark_email_read_rounded, onPressed: () => setState(() => _sent = true)),
          const SizedBox(height: 10),
          SecondaryButton(label: 'Back to sign in', icon: Icons.arrow_back_rounded, onPressed: () => context.go('/login')),
        ],
      ),
    );
  }
}
