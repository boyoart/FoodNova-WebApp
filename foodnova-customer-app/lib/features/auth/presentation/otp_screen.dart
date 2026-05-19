import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../widgets/fn_button.dart';
import '../../../widgets/fn_shell.dart';

class OtpScreen extends StatelessWidget {
  const OtpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return FnShell(
      title: 'OTP verification',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Enter your verification code', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          const Text('OTP delivery will be connected to the production auth provider in the next backend pass.'),
          const SizedBox(height: 24),
          const TextField(keyboardType: TextInputType.number, maxLength: 6, decoration: InputDecoration(labelText: '6-digit code')),
          const Spacer(),
          FnButton(label: 'Continue', onPressed: () => context.go('/home')),
        ],
      ),
    );
  }
}
