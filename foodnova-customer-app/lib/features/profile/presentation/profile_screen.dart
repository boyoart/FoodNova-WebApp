import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/state/session_controller.dart';
import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../widgets/mobile_app_scaffold.dart';
import '../../../widgets/primary_button.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MobileAppScaffold(
      selectedIndex: 4,
      title: 'Profile',
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
            _SettingsSection(
              title: 'Shopping',
              children: [
                _ProfileTile(icon: Icons.location_on_outlined, title: 'Saved addresses', subtitle: 'Manage delivery addresses'),
                _ProfileTile(icon: Icons.receipt_long_rounded, title: 'Orders', subtitle: 'History, receipts, and tracking', onTap: () => context.go('/orders')),
                _ProfileTile(icon: Icons.notifications_none_rounded, title: 'Notifications', subtitle: 'Payment, order, and promo updates', onTap: () => context.go('/notifications')),
              ],
            ),
            const SizedBox(height: 14),
            _SettingsSection(
              title: 'Account',
              children: [
                _ProfileTile(icon: Icons.person_outline_rounded, title: 'Edit profile', subtitle: 'Update your name and phone'),
                _ProfileTile(icon: Icons.lock_outline_rounded, title: 'Password', subtitle: 'Update account password'),
                _ProfileTile(icon: Icons.help_outline_rounded, title: 'Support', subtitle: 'Get help with orders and payments'),
                _ProfileTile(icon: Icons.info_outline_rounded, title: 'About FoodNova', subtitle: 'Policies, contact, and app information'),
              ],
            ),
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
    );
  }
}

class _SettingsSection extends StatelessWidget {
  const _SettingsSection({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: FoodNovaColors.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: FoodNovaColors.border),
        boxShadow: FoodNovaShadows.soft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
            child: Text(title, style: const TextStyle(color: FoodNovaColors.muted, fontWeight: FontWeight.w900, fontSize: 12)),
          ),
          ...children,
        ],
      ),
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
