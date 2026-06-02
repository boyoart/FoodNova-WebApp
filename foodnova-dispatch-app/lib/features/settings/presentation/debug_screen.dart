import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/state/session_controller.dart';
import '../../../core/widgets/fn_widgets.dart';
import '../../delivery/data/dispatch_repository.dart';

class DebugScreen extends ConsumerStatefulWidget {
  const DebugScreen({super.key});

  @override
  ConsumerState<DebugScreen> createState() => _DebugScreenState();
}

class _DebugScreenState extends ConsumerState<DebugScreen> {
  Map<String, dynamic> data = {};
  bool loading = true;

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Debug')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          FilledButton(
            onPressed: loading ? null : _fetchBackendProfile,
            child: Text(loading ? 'Loading...' : 'Fetch Backend Profile'),
          ),
          const SizedBox(height: 12),
          FnCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Row(label: 'Rider ID', value: '${data['rider_id'] ?? ''}'),
                _Row(
                  label: 'Token present',
                  value: '${data['token_present'] ?? false}',
                ),
                _Row(
                  label: 'Onboarding complete',
                  value: '${data['onboarding_complete'] ?? false}',
                ),
                _Row(
                  label: 'Approval status',
                  value: '${data['approval_status'] ?? ''}',
                ),
                _Row(
                  label: 'Backend profile found',
                  value: '${data['profile_exists'] ?? false}',
                ),
                _Row(
                  label: 'Profile source',
                  value: '${data['profile_source'] ?? ''}',
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
