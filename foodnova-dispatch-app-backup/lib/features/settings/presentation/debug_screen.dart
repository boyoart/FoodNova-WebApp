import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/state/session_controller.dart';
import '../../../core/widgets/fn_widgets.dart';
import '../../auth/data/auth_repository.dart';
import '../../delivery/data/dispatch_repository.dart';

class DebugScreen extends ConsumerStatefulWidget {
  const DebugScreen({super.key});

  @override
  ConsumerState<DebugScreen> createState() => _DebugScreenState();
}

class _DebugScreenState extends ConsumerState<DebugScreen> {
  Map<String, dynamic> data = {};
  bool loading = true;
  bool testingNin = false;
  String testNin = '';
  String testNinMessage = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    final snapshot =
        await ref.read(sessionControllerProvider.notifier).diagnostics();
    if (!mounted) return;
    setState(() {
      data = snapshot;
      loading = false;
    });
  }

  Future<void> _fetchBackendProfile() async {
    setState(() => loading = true);
    try {
      await ref.read(dispatchRepositoryProvider).me();
    } catch (_) {
      // The last exact backend response is recorded by the repository.
    }
    await _load();
  }

  Future<void> _clearLocalStorage() async {
    await ref.read(sessionControllerProvider.notifier).logoutAndReset();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
          content: Text('Local rider session and onboarding state cleared')),
    );
    await _load();
  }

  Future<void> _forceLogout() async {
    await ref.read(authRepositoryProvider).logout();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Rider session cleared')),
    );
    await _load();
  }

  Future<void> _testNinVerification() async {
    final nin = await showDialog<String>(
      context: context,
      builder: (context) {
        final controller = TextEditingController(text: testNin);
        return AlertDialog(
          title: const Text('Test NIN Verification'),
          content: TextField(
            controller: controller,
            keyboardType: TextInputType.number,
            maxLength: 11,
            decoration: const InputDecoration(labelText: '11-digit NIN'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(controller.text),
              child: const Text('Test'),
            ),
          ],
        );
      },
    );
    final cleanNin = (nin ?? '').replaceAll(RegExp(r'\D'), '');
    if (cleanNin.length != 11) return;
    setState(() {
      testingNin = true;
      testNin = cleanNin;
      testNinMessage = '';
    });
    try {
      final result = await ref
          .read(authRepositoryProvider)
          .verifyNin(nin: cleanNin, consent: true);
      if (!mounted) return;
      setState(() {
        testNinMessage = result.verified
            ? 'NIN verified: ${result.fullName.isEmpty ? result.message : result.fullName}'
            : 'NIN failed: ${result.message}';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => testNinMessage = 'NIN test error: $error');
    } finally {
      if (mounted) setState(() => testingNin = false);
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Diagnostics')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              FilledButton.icon(
                onPressed: loading ? null : _fetchBackendProfile,
                icon: const Icon(Icons.refresh),
                label: Text(loading ? 'Loading...' : 'Refresh Profile'),
              ),
              OutlinedButton.icon(
                onPressed: loading ? null : _forceLogout,
                icon: const Icon(Icons.logout),
                label: const Text('Force Logout'),
              ),
              OutlinedButton.icon(
                onPressed: loading ? null : _clearLocalStorage,
                icon: const Icon(Icons.delete_sweep_outlined),
                label: const Text('Clear Local Storage'),
              ),
              OutlinedButton.icon(
                onPressed: testingNin ? null : _testNinVerification,
                icon: const Icon(Icons.verified_user_outlined),
                label:
                    Text(testingNin ? 'Testing...' : 'Test NIN Verification'),
              ),
            ],
          ),
          if (testNinMessage.isNotEmpty) ...[
            const SizedBox(height: 12),
            FnCard(child: SelectableText(testNinMessage)),
          ],
          const SizedBox(height: 12),
          FnCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Current Session Keys',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 10),
                _Row(label: 'Rider ID', value: '${data['rider_id'] ?? ''}'),
                _Row(label: 'Current Email', value: 'See backend response'),
                _Row(
                  label: 'Token present',
                  value: '${data['token_present'] ?? false}',
                ),
                _Row(
                  label: 'Token length',
                  value: '${data['token_length'] ?? 0}',
                ),
                _Row(
                  label: 'Onboarding complete',
                  value: '${data['onboarding_complete'] ?? false}',
                ),
                _Row(
                  label: 'Current KYC status',
                  value: '${data['approval_status'] ?? ''}',
                ),
                _Row(
                  label: 'Backend rider found',
                  value: '${data['profile_exists'] ?? false}',
                ),
                _Row(
                    label: 'Backend Rider ID',
                    value: '${data['rider_id'] ?? ''}'),
                _Row(
                  label: 'Profile source',
                  value: '${data['profile_source'] ?? ''}',
                ),
                _Row(
                  label: 'Current Auth State',
                  value: data['token_present'] == true
                      ? 'token_present'
                      : 'logged_out',
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          FnCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Last API response',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                SelectableText('${data['last_api_response'] ?? ''}'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 160,
            child: Text(label,
                style: const TextStyle(fontWeight: FontWeight.w800)),
          ),
          Expanded(child: SelectableText(value)),
        ],
      ),
    );
  }
}
