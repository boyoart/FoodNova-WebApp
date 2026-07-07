import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
import '../../../widgets/brand_auth_scaffold.dart';
import '../../../widgets/primary_button.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  @override
  Widget build(BuildContext context) {
    return BrandAuthScaffold(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Reset password', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          const Text(
            'Password reset is handled by FoodNova support for now so your shopping account stays protected.',
            textAlign: TextAlign.center,
            style: TextStyle(color: FoodNovaColors.muted),
          ),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: FoodNovaColors.surface2,
              borderRadius: BorderRadius.circular(18),
            ),
            child: const Text(
              'Contact FoodNova with your account email or phone number. Support will verify your identity before resetting access.',
              style: TextStyle(color: FoodNovaColors.muted, height: 1.45, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(height: 22),
          PrimaryButton(label: 'Back to sign in', icon: Icons.arrow_back_rounded, onPressed: () => context.go('/login')),
        ],
      ),
    );
  }
}
