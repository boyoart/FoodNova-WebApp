import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/colors.dart';
import '../../../widgets/brand_auth_scaffold.dart';
import '../../../widgets/primary_button.dart';
import '../data/auth_repository.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key, this.token = ''});
  final String token;

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _loading = false;
  bool _sent = false;
  bool _complete = false;
  bool _showPassword = false;
  bool _showConfirm = false;
  String _error = '';

  @override
  void dispose() { _email.dispose(); _password.dispose(); _confirm.dispose(); super.dispose(); }

  Future<void> _request() async {
    setState(() { _loading = true; _error = ''; });
    try { await ref.read(authRepositoryProvider).requestPasswordReset(_email.text); setState(() => _sent = true); }
    catch (_) { setState(() => _sent = true); }
    finally { if (mounted) setState(() => _loading = false); }
  }

  Future<void> _confirmReset() async {
    if (_password.text != _confirm.text) { setState(() => _error = 'Passwords do not match.'); return; }
    if (_password.text.length < 6) { setState(() => _error = 'Password must be at least 6 characters.'); return; }
    setState(() { _loading = true; _error = ''; });
    try { await ref.read(authRepositoryProvider).confirmPasswordReset(token: widget.token, password: _password.text, confirmPassword: _confirm.text); setState(() => _complete = true); }
    catch (_) { setState(() => _error = 'This reset link is invalid or expired.'); }
    finally { if (mounted) setState(() => _loading = false); }
  }

  Widget _passwordField(TextEditingController controller, String label, bool visible, VoidCallback toggle) => TextField(
    controller: controller, obscureText: !visible, enabled: !_loading,
    decoration: InputDecoration(labelText: label, prefixIcon: const Icon(Icons.lock_outline_rounded), suffixIcon: IconButton(onPressed: toggle, icon: Icon(visible ? Icons.visibility_off : Icons.visibility))),
  );
  @override
  Widget build(BuildContext context) {
    if (_complete) return BrandAuthScaffold(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Text('Password changed', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)), const SizedBox(height: 12), const Text('Your FoodNova password has been updated. Sign in again to continue.', textAlign: TextAlign.center), const SizedBox(height: 24), PrimaryButton(label: 'Return to Login', onPressed: () => context.go('/login'))]));
    if (widget.token.isNotEmpty) return BrandAuthScaffold(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Text('Create New Password', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)), const SizedBox(height: 22), _passwordField(_password, 'New password', _showPassword, () => setState(() => _showPassword = !_showPassword)), const SizedBox(height: 14), _passwordField(_confirm, 'Confirm password', _showConfirm, () => setState(() => _showConfirm = !_showConfirm)), if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error, style: const TextStyle(color: FoodNovaColors.danger))), const SizedBox(height: 22), PrimaryButton(label: _loading ? 'Saving...' : 'Change Password', loading: _loading, onPressed: _loading ? null : _confirmReset)]));
    if (_sent) return BrandAuthScaffold(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Text('Check your email', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)), const SizedBox(height: 12), const Text('If an account exists for this email, password reset instructions have been sent.', textAlign: TextAlign.center), const SizedBox(height: 24), PrimaryButton(label: 'Back to Login', onPressed: () => context.go('/login'))]));
    return BrandAuthScaffold(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Forgot Password?', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          const Text(
            'Enter your registered email to receive secure reset instructions.',
            textAlign: TextAlign.center,
            style: TextStyle(color: FoodNovaColors.muted),
          ),
          const SizedBox(height: 24),
          TextField(controller: _email, keyboardType: TextInputType.emailAddress, enabled: !_loading, decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline_rounded))),
          const SizedBox(height: 22),
          PrimaryButton(label: _loading ? 'Sending...' : 'Request Reset', loading: _loading, onPressed: _loading ? null : _request),
          const SizedBox(height: 8),
          TextButton(onPressed: () => context.go('/login'), child: const Text('Return to Login')),
        ],
      ),
    );
  }
}
