import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
import '../../../widgets/fn_button.dart';

class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(),
              Container(
                height: 280,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(32),
                  gradient: const LinearGradient(colors: [FoodNovaColors.deepGreen, FoodNovaColors.leafGreen]),
                ),
                child: const Center(
                  child: Icon(Icons.storefront_rounded, size: 112, color: FoodNovaColors.warmGold),
                ),
              ),
              const SizedBox(height: 32),
              Text(
                'Premium neighborhood commerce, delivered smartly.',
                style: Theme.of(context).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 12),
              const Text('Shop daily food essentials with local fulfillment, walking-distance delivery, and rider logistics where it matters.'),
              const Spacer(),
              FnButton(label: 'Start shopping', onPressed: () => context.go('/login')),
            ],
          ),
        ),
      ),
    );
  }
}

