import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/state/session_controller.dart';
import '../../../widgets/fn_button.dart';
import '../../../widgets/fn_shell.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FnShell(
      title: 'Profile',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('FoodNova customer', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          const Text('Profile, saved addresses, support, and notification preferences will be expanded against /api/users in the next pass.'),
          const Spacer(),
          FnButton(label: 'Sign out', icon: Icons.logout_rounded, onPressed: () => ref.read(sessionControllerProvider.notifier).clear()),
        ],
      ),
    );
  }
}
