import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/widgets/fn_widgets.dart';
import '../../auth/data/auth_repository.dart';
import '../../../core/state/session_controller.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool darkModeReady = true;
  bool push = true;
  bool biometrics = true;
  bool location = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _Switch(
            label: 'Dark Mode Ready',
            value: darkModeReady,
            onChanged: (v) => setState(() => darkModeReady = v),
          ),
          _Switch(
            label: 'Notification Preferences',
            value: push,
            onChanged: (v) => setState(() => push = v),
          ),
          _Switch(
            label: 'Biometric Login',
            value: biometrics,
            onChanged: (v) => setState(() => biometrics = v),
          ),
          _Switch(
            label: 'Location Permissions',
            value: location,
            onChanged: (v) => setState(() => location = v),
          ),
          const SizedBox(height: 10),
          FnCard(
            child: ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.bug_report_outlined),
              title: const Text('Diagnostics'),
              subtitle: const Text('Rider auth and profile diagnostics'),
              onTap: () => context.go('/debug'),
            ),
          ),
          const SizedBox(height: 10),
          FnCard(
            child: ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.delete_sweep_outlined),
              title: const Text('Clear Local Storage'),
              subtitle:
                  const Text('Reset local rider token and onboarding keys'),
              onTap: () async {
                await ref
                    .read(sessionControllerProvider.notifier)
                    .logoutAndReset();
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content: Text('Local rider storage cleared')),
                  );
                  context.go('/onboarding');
                }
              },
            ),
          ),
          const SizedBox(height: 10),
          FnCard(
            child: ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.support_agent),
              title: const Text('Support'),
              subtitle: const Text('support@foodnova.com.ng'),
              onTap: () {},
            ),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: () async {
              debugPrint(
                  'ROUTE_REDIRECT reason=user_logout destination=/login');
              await ref.read(authRepositoryProvider).logout();
              if (context.mounted) context.go('/login');
            },
            icon: const Icon(Icons.logout),
            label: const Text('Logout'),
          ),
        ],
      ),
    );
  }
}

class _Switch extends StatelessWidget {
  const _Switch({
    required this.label,
    required this.value,
    required this.onChanged,
  });
  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FnCard(
        child: SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: value,
          onChanged: onChanged,
          title: Text(label),
        ),
      ),
    );
  }
}
