import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
import '../../../core/widgets/fn_widgets.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final controller = PageController();
  int index = 0;

  final pages = const [
    (
      'Welcome to FoodNova Dispatch',
      'Earn money delivering groceries across your city.',
      Icons.delivery_dining,
    ),
    (
      'Track deliveries in real time',
      'Pickup, route, ETA, and customer dropoff stay in sync.',
      Icons.map,
    ),
    (
      'Work on your own schedule',
      'Go online when you are ready and complete fast onboarding.',
      Icons.schedule,
    ),
  ];

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(22),
          child: Column(
            children: [
              const Align(
                alignment: Alignment.center,
                child: BrandLogo(width: 210, height: 88),
              ),
              Expanded(
                child: PageView.builder(
                  controller: controller,
                  itemCount: pages.length,
                  onPageChanged: (value) => setState(() => index = value),
                  itemBuilder: (_, i) {
                    final page = pages[i];
                    return Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 138,
                          height: 138,
                          decoration: BoxDecoration(
                            color: FoodNovaColors.accent,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(
                            page.$3,
                            size: 68,
                            color: FoodNovaColors.primary,
                          ),
                        ),
                        const SizedBox(height: 28),
                        Text(
                          page.$1,
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .headlineSmall
                              ?.copyWith(fontWeight: FontWeight.w900),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          page.$2,
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .bodyLarge
                              ?.copyWith(color: FoodNovaColors.muted),
                        ),
                      ],
                    );
                  },
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  pages.length,
                  (i) => Container(
                    width: i == index ? 24 : 9,
                    height: 9,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      color: i == index
                          ? FoodNovaColors.primary
                          : FoodNovaColors.border,
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 22),
              FilledButton(
                onPressed: () => context.go(
                  index == pages.length - 1 ? '/login' : '/signup',
                ),
                child: Text(
                  index == pages.length - 1 ? 'Continue' : 'Start onboarding',
                ),
              ),
              TextButton(
                onPressed: () => context.go('/login'),
                child: const Text('I already have an account'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
