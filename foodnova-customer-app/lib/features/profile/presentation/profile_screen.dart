import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/state/session_controller.dart';
import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../widgets/floating_nav_bar.dart';
import '../../../widgets/primary_button.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 112),
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: FoodNovaColors.surface,
                borderRadius: BorderRadius.circular(26),
                border: Border.all(color: FoodNovaColors.border),
                boxShadow: FoodNovaShadows.soft,
              ),
              child: Row(
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(colors: [FoodNovaColors.primary, FoodNovaColors.success]),
                    ),
                    child: const Icon(Icons.person_rounded, color: Colors.white, size: 34),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('FoodNova customer', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
                        const SizedBox(height: 4),
                        const Text('Saved addresses, support, and preferences', style: TextStyle(color: FoodNovaColors.muted)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            _ProfileTile(icon: Icons.location_on_outlined, title: 'Delivery addresses', subtitle: 'Manage home and work drop-off points'),
            _ProfileTile(icon: Icons.notifications_none_rounded, title: 'Notifications', subtitle: 'Order updates, offers, and rider alerts', onTap: () => context.go('/notifications')),
            _ProfileTile(icon: Icons.help_outline_rounded, title: 'Support', subtitle: 'Get help with orders and payments'),
            const SizedBox(height: 24),
            PrimaryButton(
              label: 'Sign out',
              icon: Icons.logout_rounded,
              onPressed: () async {
                await ref.read(sessionControllerProvider.notifier).clear();
                if (context.mounted) context.go('/login');
              },
            ),
          ],
        ),
      ),
      bottomNavigationBar: const FloatingNavBar(selectedIndex: 3),
    );
  }
}

class _ProfileTile extends StatelessWidget {
  const _ProfileTile({required this.icon, required this.title, required this.subtitle, this.onTap});

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      leading: CircleAvatar(backgroundColor: FoodNovaColors.surface2, child: Icon(icon, color: FoodNovaColors.primary)),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }
}
