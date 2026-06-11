import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/app_config.dart';
import '../../../core/network/api_client.dart';
import '../../../core/state/profile_avatar_controller.dart';
import '../../../core/state/session_controller.dart';
import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../core/theme/theme_controller.dart';
import '../../../services/app_security_service.dart';
import '../../../shared/models/address.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/input_field.dart';
import '../../../widgets/mobile_app_scaffold.dart';
import '../../../widgets/primary_button.dart';
import '../../../widgets/skeleton_box.dart';
import '../data/profile_repository.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(profileProvider);
    return MobileAppScaffold(
      selectedIndex: 4,
      title: 'Profile',
      body: SafeArea(
        bottom: false,
        child: state.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(20),
            child: Column(
              children: [
                SkeletonBox(height: 120, radius: 26),
                SizedBox(height: 14),
                SkeletonBox(height: 240, radius: 24),
              ],
            ),
          ),
          error: (error, _) => Padding(
            padding: const EdgeInsets.all(24),
            child: EmptyState(
                title: 'Could not load profile',
                message: apiMessage(error),
                icon: Icons.person_off_outlined),
          ),
          data: (profile) => RefreshIndicator(
            onRefresh: () async => ref.invalidate(profileProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 112),
              children: [
                _ProfileHeader(profile: profile),
                const SizedBox(height: 18),
                _SettingsSection(
                  title: 'Shopping',
                  children: [
                    _ProfileTile(
                      icon: Icons.location_on_outlined,
                      title: 'Saved addresses',
                      subtitle: profile.addresses.isEmpty
                          ? 'No saved addresses yet'
                          : '${profile.addresses.length} saved address${profile.addresses.length == 1 ? '' : 'es'}',
                      onTap: () =>
                          _showAddressesSheet(context, profile.addresses),
                    ),
                    _ProfileTile(
                        icon: Icons.receipt_long_rounded,
                        title: 'Orders',
                        subtitle: 'History, receipts, and tracking',
                        onTap: () => context.push('/orders')),
                    _ProfileTile(
                        icon: Icons.notifications_none_rounded,
                        title: 'Notifications',
                        subtitle: 'Payment, order, and promo updates',
                        onTap: () => context.push('/notifications')),
                  ],
                ),
                const SizedBox(height: 14),
                const _SecuritySection(),
                const SizedBox(height: 14),
                _SettingsSection(
                  title: 'Account',
                  children: [
                    const _ThemePreferenceTile(),
                    _ProfileTile(
                        icon: Icons.person_outline_rounded,
                        title: 'Edit profile',
                        subtitle: 'Update name and phone',
                        onTap: () =>
                            _showEditProfileSheet(context, ref, profile)),
                    _ProfileTile(
                        icon: Icons.lock_outline_rounded,
                        title: 'Password',
                        subtitle: 'Change account password',
                        onTap: () => _showPasswordSheet(context, ref)),
                    _ProfileTile(
                        icon: Icons.help_outline_rounded,
                        title: 'Support',
                        subtitle: 'Use your order code for faster support',
                        onTap: () => _showSupportSheet(context)),
                    _ProfileTile(
                        icon: Icons.info_outline_rounded,
                        title: 'About FoodNova',
                        subtitle: 'Foodstuff shopping and essentials',
                        onTap: () => _showInfoSheet(context, 'About FoodNova',
                            'FoodNova is a foodstuff shopping platform for groceries, essentials, curated packs, receipt-based payment, and order tracking.')),
                  ],
                ),
                const SizedBox(height: 24),
                PrimaryButton(
                  label: 'Sign out',
                  icon: Icons.logout_rounded,
                  onPressed: () async {
                    await ref.read(sessionControllerProvider.notifier).clear();
                    if (!context.mounted) return;
                    ref.invalidate(profileProvider);
                    context.go('/login');
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SecuritySection extends ConsumerStatefulWidget {
  const _SecuritySection();

  @override
  ConsumerState<_SecuritySection> createState() => _SecuritySectionState();
}

class _SecuritySectionState extends ConsumerState<_SecuritySection> {
  int _refresh = 0;

  void _reload() {
    if (!mounted) return;
    setState(() => _refresh++);
  }

  @override
  Widget build(BuildContext context) {
    final service = ref.watch(appSecurityServiceProvider);
    return FutureBuilder<(bool, bool)>(
      key: ValueKey(_refresh),
      future: Future.wait([
        service.biometricsAvailable(),
        service.biometricEnabled,
      ]).then((values) => (values[0], values[1])),
      builder: (context, snapshot) {
        final data = snapshot.data ?? (false, false);
        final biometricsAvailable = data.$1;
        final biometricEnabled = data.$2;
        return _SettingsSection(
          title: 'Security',
          children: [
            SwitchListTile(
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
              secondary: CircleAvatar(
                backgroundColor:
                    Theme.of(context).colorScheme.surfaceContainerHighest,
                child: const Icon(Icons.fingerprint_rounded,
                    color: FoodNovaColors.primary),
              ),
              title: const Text('Face ID / Fingerprint',
                  style: TextStyle(fontWeight: FontWeight.w900)),
              subtitle: Text(biometricsAvailable
                  ? 'Unlock FoodNova with this device'
                  : 'No enrolled biometrics found'),
              value: biometricEnabled && biometricsAvailable,
              onChanged: biometricsAvailable
                  ? (enabled) async {
                      try {
                        await service.setBiometricEnabled(enabled);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                              content: Text(enabled
                                  ? 'Biometric login enabled.'
                                  : 'Biometric login disabled.')));
                        }
                      } catch (error) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(apiMessage(error))));
                        }
                      }
                      _reload();
                    }
                  : null,
            ),
          ],
        );
      },
    );
  }
}

class _ThemePreferenceTile extends ConsumerWidget {
  const _ThemePreferenceTile();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeControllerProvider);
    final scheme = Theme.of(context).colorScheme;
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      leading: CircleAvatar(
        backgroundColor: scheme.surfaceContainerHighest,
        child:
            const Icon(Icons.contrast_rounded, color: FoodNovaColors.primary),
      ),
      title: const Text('Appearance',
          style: TextStyle(fontWeight: FontWeight.w900)),
      subtitle: Text(_themeLabel(mode)),
      trailing: SegmentedButton<ThemeMode>(
        showSelectedIcon: false,
        segments: const [
          ButtonSegment(
              value: ThemeMode.light,
              icon: Icon(Icons.light_mode_rounded),
              tooltip: 'Light Mode'),
          ButtonSegment(
              value: ThemeMode.dark,
              icon: Icon(Icons.dark_mode_rounded),
              tooltip: 'Dark Mode'),
          ButtonSegment(
              value: ThemeMode.system,
              icon: Icon(Icons.settings_suggest_rounded),
              tooltip: 'System Default'),
        ],
        selected: {mode},
        onSelectionChanged: (value) =>
            ref.read(themeControllerProvider.notifier).setMode(value.first),
      ),
    );
  }
}

String _themeLabel(ThemeMode mode) {
  return switch (mode) {
    ThemeMode.light => 'Light Mode',
    ThemeMode.dark => 'Dark Mode',
    ThemeMode.system => 'System Default',
  };
}

class _ProfileHeader extends ConsumerWidget {
  const _ProfileHeader({required this.profile});

  final ProfileData profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final localAvatar = ref.watch(profileAvatarControllerProvider).valueOrNull;
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: .72)),
        boxShadow: [
          BoxShadow(
            color: scheme.shadow.withValues(alpha: .07),
            blurRadius: 28,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Row(
        children: [
          _EditableCustomerAvatar(
            profile: profile,
            localAvatarPath: localAvatar,
            radius: 42,
            onTap: () => _showAvatarPicker(context, ref, profile),
          ),
          const SizedBox(width: 18),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profile.fullName.isEmpty
                      ? 'FoodNova customer'
                      : profile.fullName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                        height: 1.08,
                      ),
                ),
                const SizedBox(height: 8),
                Text(profile.email.isEmpty ? profile.phone : profile.email,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: scheme.onSurfaceVariant,
                      fontWeight: FontWeight.w700,
                    )),
                if (profile.phone.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(profile.phone,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: scheme.onSurfaceVariant.withValues(alpha: .82),
                        fontWeight: FontWeight.w600,
                      )),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _EditableCustomerAvatar extends StatelessWidget {
  const _EditableCustomerAvatar({
    required this.profile,
    required this.localAvatarPath,
    required this.radius,
    required this.onTap,
  });

  final ProfileData profile;
  final String? localAvatarPath;
  final double radius;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      label: 'Update profile photo',
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            _CustomerAvatar(
              profile: profile,
              localAvatarPath: localAvatarPath,
              radius: radius,
            ),
            Positioned(
              right: -2,
              bottom: -2,
              child: Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: FoodNovaColors.primary,
                  shape: BoxShape.circle,
                  border: Border.all(color: scheme.surface, width: 3),
                  boxShadow: [
                    BoxShadow(
                      color: scheme.shadow.withValues(alpha: .18),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Icon(
                  Icons.photo_camera_rounded,
                  color: scheme.onPrimary,
                  size: 16,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CustomerAvatar extends StatelessWidget {
  const _CustomerAvatar({
    required this.profile,
    this.localAvatarPath,
    this.radius = 30,
  });

  final ProfileData profile;
  final String? localAvatarPath;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final avatarUrl = (localAvatarPath == null || localAvatarPath!.isEmpty)
        ? profile.avatarUrl
        : localAvatarPath!;
    final imageProvider = _avatarImageProvider(avatarUrl);
    return CircleAvatar(
      radius: radius,
      backgroundColor: FoodNovaColors.primary,
      foregroundImage: imageProvider,
      onForegroundImageError: imageProvider == null ? null : (_, __) {},
      child: Text(
        profile.initials,
        style: TextStyle(
          color: scheme.onPrimary,
          fontWeight: FontWeight.w900,
          fontSize: radius * .44,
        ),
      ),
    );
  }
}

Future<void> _showAvatarPicker(
    BuildContext context, WidgetRef ref, ProfileData profile) async {
  final messenger = ScaffoldMessenger.of(context);
  if (!context.mounted) return;
  final userKey = profile.email.isNotEmpty ? profile.email : profile.phone;
  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.photo_camera_rounded),
                title: const Text('Take photo'),
                onTap: () async {
                  if (sheetContext.mounted) Navigator.pop(sheetContext);
                  try {
                    await ref
                        .read(profileAvatarControllerProvider.notifier)
                        .pick(ImageSource.camera, userKey: userKey);
                  } catch (error) {
                    messenger.showSnackBar(
                      SnackBar(content: Text(apiMessage(error))),
                    );
                  }
                },
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_rounded),
                title: const Text('Choose from gallery'),
                onTap: () async {
                  if (sheetContext.mounted) Navigator.pop(sheetContext);
                  try {
                    await ref
                        .read(profileAvatarControllerProvider.notifier)
                        .pick(ImageSource.gallery, userKey: userKey);
                  } catch (error) {
                    messenger.showSnackBar(
                      SnackBar(content: Text(apiMessage(error))),
                    );
                  }
                },
              ),
              if (ref.read(profileAvatarControllerProvider).valueOrNull != null)
                ListTile(
                  leading: const Icon(Icons.delete_outline_rounded),
                  title: const Text('Remove local photo'),
                  onTap: () async {
                    if (sheetContext.mounted) Navigator.pop(sheetContext);
                    await ref
                        .read(profileAvatarControllerProvider.notifier)
                        .clear(userKey: userKey);
                  },
                ),
            ],
          ),
        ),
      );
    },
  );
}

ImageProvider<Object>? _avatarImageProvider(String avatarUrl) {
  final value = avatarUrl.trim();
  if (value.isEmpty) return null;
  final lower = value.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return CachedNetworkImageProvider(value);
  }
  if (lower.startsWith('file://')) {
    return FileImage(File(Uri.parse(value).toFilePath()));
  }
  if (value.startsWith('/') || RegExp(r'^[a-zA-Z]:[\\/]').hasMatch(value)) {
    return FileImage(File(value));
  }
  return NetworkImage(value);
}

Future<void> _showEditProfileSheet(
    BuildContext context, WidgetRef ref, ProfileData profile) async {
  final updated = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => _EditProfileSheet(profile: profile),
  );
  if (updated == true && context.mounted) {
    ref.invalidate(profileProvider);
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Profile updated.')));
  }
}

class _EditProfileSheet extends ConsumerStatefulWidget {
  const _EditProfileSheet({required this.profile});

  final ProfileData profile;

  @override
  ConsumerState<_EditProfileSheet> createState() => _EditProfileSheetState();
}

class _EditProfileSheetState extends ConsumerState<_EditProfileSheet> {
  late final TextEditingController _name =
      TextEditingController(text: widget.profile.fullName);
  late final TextEditingController _phone =
      TextEditingController(text: widget.profile.phone);
  bool _loading = false;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Enter your full name.')));
      return;
    }
    if (!mounted) return;
    setState(() => _loading = true);
    try {
      await ref.read(profileRepositoryProvider).updateProfile(
            fullName: _name.text.trim(),
            phone: _phone.text.trim(),
          );
      if (!mounted || !context.mounted) return;
      Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(apiMessage(error))));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .72,
      minChildSize: .45,
      maxChildSize: .94,
      builder: (context, scrollController) => ListView(
        controller: scrollController,
        padding: EdgeInsets.fromLTRB(
            20, 6, 20, MediaQuery.of(context).viewInsets.bottom + 28),
        children: [
          Text('Edit profile',
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 16),
          InputField(
              controller: _name,
              label: 'Full name',
              icon: Icons.person_outline_rounded),
          const SizedBox(height: 12),
          InputField(
              controller: _phone,
              label: 'Phone number',
              icon: Icons.phone_outlined,
              keyboardType: TextInputType.phone),
          const SizedBox(height: 18),
          PrimaryButton(
              label: _loading ? 'Saving...' : 'Save changes',
              loading: _loading,
              icon: Icons.check_rounded,
              onPressed: _loading ? null : _submit),
        ],
      ),
    );
  }
}

Future<void> _showPasswordSheet(BuildContext context, WidgetRef ref) async {
  await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => const _PasswordSheet(),
  );
}

class _PasswordSheet extends ConsumerStatefulWidget {
  const _PasswordSheet();

  @override
  ConsumerState<_PasswordSheet> createState() => _PasswordSheetState();
}

class _PasswordSheetState extends ConsumerState<_PasswordSheet> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_next.text.length < 6 || _next.text != _confirm.text) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Passwords must match and be at least 6 characters.')));
      return;
    }
    if (!mounted) return;
    setState(() => _loading = true);
    try {
      await ref.read(profileRepositoryProvider).changePassword(
          currentPassword: _current.text,
          newPassword: _next.text,
          confirmPassword: _confirm.text);
      if (!mounted || !context.mounted) return;
      Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(apiMessage(error))));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .72,
      minChildSize: .45,
      maxChildSize: .94,
      builder: (context, scrollController) => ListView(
        controller: scrollController,
        padding: EdgeInsets.fromLTRB(
            20, 6, 20, MediaQuery.of(context).viewInsets.bottom + 28),
        children: [
          Text('Change password',
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 16),
          InputField(
              controller: _current,
              label: 'Current password',
              icon: Icons.lock_outline_rounded,
              obscureText: true),
          const SizedBox(height: 12),
          InputField(
              controller: _next,
              label: 'New password',
              icon: Icons.lock_reset_rounded,
              obscureText: true),
          const SizedBox(height: 12),
          InputField(
              controller: _confirm,
              label: 'Confirm new password',
              icon: Icons.verified_user_outlined,
              obscureText: true),
          const SizedBox(height: 18),
          PrimaryButton(
              label: _loading ? 'Updating...' : 'Update password',
              loading: _loading,
              icon: Icons.check_rounded,
              onPressed: _loading ? null : _submit),
        ],
      ),
    );
  }
}

void _showAddressesSheet(
    BuildContext context, List<CustomerAddress> addresses) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (context) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: addresses.isEmpty ? .36 : .72,
      minChildSize: .32,
      maxChildSize: .94,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 6, 20, 28),
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Saved addresses',
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: 12),
              if (addresses.isEmpty)
                Text(
                    'No saved addresses yet. Add a delivery address during checkout.',
                    style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                        height: 1.45))
              else
                for (final address in addresses.take(4))
                  _AddressCard(address: address),
            ],
          ),
        ],
      ),
    ),
  );
}

void _showInfoSheet(BuildContext context, String title, String message) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (context) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: .42,
      minChildSize: .3,
      maxChildSize: .86,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 6, 20, 28),
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: 10),
              Text(message,
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      height: 1.45)),
            ],
          ),
        ],
      ),
    ),
  );
}

void _showSupportSheet(BuildContext context) {
  final phone = AppConfig.supportPhone;
  final email = AppConfig.supportEmail;
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (context) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: .84,
      minChildSize: .5,
      maxChildSize: .96,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        children: [
          Text('FoodNova support',
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Text(
            'For payment, receipt, delivery, or order issues, include your order code so FoodNova support can help faster.',
            style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                height: 1.45),
          ),
          const SizedBox(height: 18),
          _SupportAction(
            icon: Icons.chat_rounded,
            title: 'WhatsApp support',
            subtitle: phone,
            onTap: () => launchUrl(
              Uri.parse(
                  'https://wa.me/${phone.replaceAll(RegExp(r'[^0-9]'), '')}?text=${Uri.encodeComponent('Hello FoodNova, I need support with my order.')}'),
              mode: LaunchMode.externalApplication,
            ),
          ),
          _SupportAction(
            icon: Icons.phone_rounded,
            title: 'Call FoodNova',
            subtitle: phone,
            onTap: () => launchUrl(Uri.parse('tel:$phone')),
          ),
          _SupportAction(
            icon: Icons.mail_rounded,
            title: 'Email support',
            subtitle: email,
            onTap: () => launchUrl(Uri.parse('mailto:$email')),
          ),
          const SizedBox(height: 14),
          Text('FAQs',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          const _FaqTile(
            question: 'How do I confirm payment?',
            answer:
                'Transfer to the FoodNova OPay account, use your order code as reference, then upload a clear JPG, PNG, WEBP, or PDF receipt.',
          ),
          const _FaqTile(
            question: 'How do I confirm delivery?',
            answer:
                'When your order is out for delivery, enter the 4-digit PIN from your rider to confirm delivery.',
          ),
          const _FaqTile(
            question: 'Can I request a refund?',
            answer:
                'Cancellation and refund requests are available before out-for-delivery or delivered status and are reviewed by FoodNova.',
          ),
        ],
      ),
    ),
  );
}

class _SupportAction extends StatelessWidget {
  const _SupportAction({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: scheme.surfaceContainerHighest,
          child: Icon(icon, color: FoodNovaColors.primary),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right_rounded),
        onTap: onTap,
      ),
    );
  }
}

class _FaqTile extends StatelessWidget {
  const _FaqTile({required this.question, required this.answer});

  final String question;
  final String answer;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(question, style: const TextStyle(fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          Text(answer,
              style: TextStyle(color: scheme.onSurfaceVariant, height: 1.4)),
        ],
      ),
    );
  }
}

class _AddressCard extends StatelessWidget {
  const _AddressCard({required this.address});

  final CustomerAddress address;

  @override
  Widget build(BuildContext context) {
    final label = address.label;
    final line = address.formatted;
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                  child: Text(label.isEmpty ? 'Address' : label,
                      style: const TextStyle(fontWeight: FontWeight.w900))),
              if (address.isDefault)
                const Text('Default',
                    style: TextStyle(
                        color: FoodNovaColors.primary,
                        fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 4),
          Text(line.isEmpty ? 'Address details unavailable' : line,
              style: TextStyle(color: scheme.onSurfaceVariant, height: 1.35)),
        ],
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
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: FoodNovaShadows.soft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
            child: Text(title,
                style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontWeight: FontWeight.w900,
                    fontSize: 12)),
          ),
          ...children,
        ],
      ),
    );
  }
}

class _ProfileTile extends StatelessWidget {
  const _ProfileTile(
      {required this.icon,
      required this.title,
      required this.subtitle,
      this.onTap});

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      leading: CircleAvatar(
          backgroundColor: scheme.surfaceContainerHighest,
          child: Icon(icon, color: FoodNovaColors.primary)),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }
}
