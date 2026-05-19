import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
import '../../../widgets/brand_auth_scaffold.dart';
import '../../../widgets/primary_button.dart';
import '../../../widgets/secondary_button.dart';

class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key});

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _code = List.generate(6, (_) => TextEditingController());
  final _nodes = List.generate(6, (_) => FocusNode());

  @override
  void dispose() {
    for (final controller in _code) {
      controller.dispose();
    }
    for (final node in _nodes) {
      node.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BrandAuthScaffold(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Verify your phone', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          const Text(
            'Enter the 6-digit code sent to your FoodNova phone number.',
            textAlign: TextAlign.center,
            style: TextStyle(color: FoodNovaColors.muted),
          ),
          const SizedBox(height: 26),
          Row(
            children: List.generate(
              6,
              (index) => Expanded(
                child: Padding(
                  padding: EdgeInsets.only(right: index == 5 ? 0 : 8),
                  child: TextField(
                    controller: _code[index],
                    focusNode: _nodes[index],
                    textAlign: TextAlign.center,
                    keyboardType: TextInputType.number,
                    maxLength: 1,
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                    decoration: const InputDecoration(counterText: ''),
                    onChanged: (value) {
                      if (value.isNotEmpty && index < 5) _nodes[index + 1].requestFocus();
                      if (value.isEmpty && index > 0) _nodes[index - 1].requestFocus();
                    },
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 22),
          PrimaryButton(label: 'Verify and continue', icon: Icons.verified_rounded, onPressed: () => context.go('/home')),
          const SizedBox(height: 10),
          SecondaryButton(label: 'Back to sign in', icon: Icons.arrow_back_rounded, onPressed: () => context.go('/login')),
        ],
      ),
    );
  }
}
