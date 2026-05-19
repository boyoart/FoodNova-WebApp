import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../widgets/brand_logo.dart';
import '../../../widgets/primary_button.dart';
import '../../../widgets/secondary_button.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pages = const [
      _OnboardingPage(
        icon: Icons.shopping_basket_rounded,
        title: 'Premium groceries from trusted neighborhood sources.',
        body: 'FoodNova brings daily essentials, market staples, and curated packs into one calm shopping experience.',
      ),
      _OnboardingPage(
        icon: Icons.location_on_rounded,
        title: 'Local fulfillment that understands walking-distance delivery.',
        body: 'Order from nearby stock points and get better delivery visibility, ETAs, and rider coordination.',
      ),
      _OnboardingPage(
        icon: Icons.verified_rounded,
        title: 'A modern African commerce app built for real households.',
        body: 'Clean checkout, thoughtful order tracking, and a brand experience that feels unmistakably FoodNova.',
      ),
    ];

    return Scaffold(
      backgroundColor: FoodNovaColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 18, 22, 24),
          child: Column(
            children: [
              Row(
                children: [
                  const BrandLogo(height: 48),
                  const Spacer(),
                  TextButton(onPressed: () => context.go('/home'), child: const Text('Guest')),
                ],
              ),
              const SizedBox(height: 18),
              Expanded(
                child: PageView.builder(
                  controller: _controller,
                  onPageChanged: (value) => setState(() => _index = value),
                  itemCount: pages.length,
                  itemBuilder: (_, index) => pages[index],
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  pages.length,
                  (index) => AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    width: _index == index ? 26 : 8,
                    height: 8,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      color: _index == index ? FoodNovaColors.primary : FoodNovaColors.border,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 22),
              PrimaryButton(
                label: _index == pages.length - 1 ? 'Create your FoodNova account' : 'Continue',
                icon: Icons.arrow_forward_rounded,
                onPressed: () {
                  if (_index == pages.length - 1) {
                    context.go('/signup');
                  } else {
                    _controller.nextPage(duration: const Duration(milliseconds: 280), curve: Curves.easeOutCubic);
                  }
                },
              ),
              const SizedBox(height: 10),
              SecondaryButton(label: 'Sign in', icon: Icons.login_rounded, onPressed: () => context.go('/login')),
            ],
          ),
        ),
      ),
    );
  }
}

class _OnboardingPage extends StatelessWidget {
  const _OnboardingPage({required this.icon, required this.title, required this.body});

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: Center(
            child: Container(
              width: double.infinity,
              constraints: const BoxConstraints(maxHeight: 360),
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(34),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [FoodNovaColors.primaryDark, FoodNovaColors.primary, FoodNovaColors.success],
                ),
                boxShadow: FoodNovaShadows.nav,
              ),
              child: Stack(
                children: [
                  Positioned(
                    right: -8,
                    top: -10,
                    child: Icon(Icons.grain_rounded, size: 120, color: Colors.white.withOpacity(.08)),
                  ),
                  Positioned(
                    left: 0,
                    bottom: 0,
                    child: Container(
                      width: 126,
                      height: 126,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(.12),
                        borderRadius: BorderRadius.circular(32),
                      ),
                      child: Icon(icon, size: 66, color: FoodNovaColors.accent),
                    ),
                  ),
                  const Positioned(
                    right: 8,
                    bottom: 8,
                    child: Text(
                      'Fresh\nLocal\nFast',
                      textAlign: TextAlign.right,
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 28, height: .95),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 28),
        Text(
          title,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: FoodNovaColors.heading, fontWeight: FontWeight.w900, height: 1.05),
        ),
        const SizedBox(height: 12),
        Text(
          body,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: FoodNovaColors.muted, height: 1.45),
        ),
      ],
    );
  }
}
