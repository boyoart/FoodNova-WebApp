import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../data/auth_repository.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final email = TextEditingController();
  String message = '';

  @override
  void dispose() {
    email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Forgot password')),
      body: ListView(
        padding: const EdgeInsets.all(22),
        children: [
          TextField(
            controller: email,
            decoration: const InputDecoration(labelText: 'Email address'),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _send,
            child: const Text('Send reset instructions'),
          ),
          if (message.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 14),
              child: Text(message),
            ),
        ],
      ),
    );
  }

  Future<void> _send() async {
    try {
      await ref.read(authRepositoryProvider).forgotPassword(email.text);
      if (!mounted) return;
      setState(
        () => message =
            'If this account exists, reset instructions will be sent.',
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => message = apiMessage(e));
    }
  }
}
