import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../config/app_config.dart';
import '../../auth/data/auth_repository.dart';
import '../../delivery/data/dispatch_repository.dart';
import '../../delivery/domain/dispatch_models.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final ImagePicker _picker = ImagePicker();
  bool _photoSaving = false;

  Future<void> _showPhotoActions(RiderProfile rider) async {
    if (_photoSaving) return;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Profile photo',
                  style: Theme.of(sheetContext)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                Text(
                  'This updates your public rider profile photo. Your verified onboarding selfie stays unchanged for KYC.',
                  style: Theme.of(sheetContext).textTheme.bodyMedium?.copyWith(
                        color:
                            Theme.of(sheetContext).colorScheme.onSurfaceVariant,
                      ),
                ),
                const SizedBox(height: 16),
                ListTile(
                  leading: const Icon(Icons.photo_camera_rounded),
                  title: const Text('Take Photo'),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _pickAndUploadPhoto(ImageSource.camera);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.photo_library_rounded),
                  title: const Text('Choose From Gallery'),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _pickAndUploadPhoto(ImageSource.gallery);
                  },
                ),
                if (rider.customProfilePhotoUrl.isNotEmpty)
                  ListTile(
                    leading: Icon(
                      Icons.delete_outline_rounded,
                      color: Theme.of(sheetContext).colorScheme.error,
                    ),
                    title: Text(
                      'Remove Photo',
                      style: TextStyle(
                        color: Theme.of(sheetContext).colorScheme.error,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    onTap: () {
                      Navigator.pop(sheetContext);
                      _removeProfilePhoto();
                    },
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _pickAndUploadPhoto(ImageSource source) async {
    try {
      final picked = await _picker.pickImage(
        source: source,
        imageQuality: 78,
        maxWidth: 1200,
        maxHeight: 1200,
      );
      if (picked == null) return;
      setState(() => _photoSaving = true);
      await ref
          .read(dispatchRepositoryProvider)
          .uploadProfilePhoto(picked.path);
      ref.invalidate(riderProfileProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile photo updated.')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$error')),
        );
      }
    } finally {
      if (mounted) setState(() => _photoSaving = false);
    }
  }

  Future<void> _removeProfilePhoto() async {
    try {
      setState(() => _photoSaving = true);
      await ref.read(dispatchRepositoryProvider).removeProfilePhoto();
      ref.invalidate(riderProfileProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile photo removed.')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$error')),
        );
      }
    } finally {
      if (mounted) setState(() => _photoSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(riderProfileProvider);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/dashboard');
      },
      child: Scaffold(
        backgroundColor: Theme.of(context).colorScheme.surface,
        bottomNavigationBar: const _ProfileTabBar(),
        body: profile.when(
          data: (rider) => _ProfileBody(
            rider: rider,
            photoSaving: _photoSaving,
            onEditPhoto: () => _showPhotoActions(rider),
            onLogout: () async {
              await ref.read(authRepositoryProvider).logout();
              if (context.mounted) context.go('/login');
            },
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
        ),
      ),
    );
  }
}

class _ProfileTabBar extends StatelessWidget {
  const _ProfileTabBar();

  @override
  Widget build(BuildContext context) {
    const routes = ['/dashboard', '/orders', '/history', '/profile'];
    return NavigationBar(
      selectedIndex: 3,
      onDestinationSelected: (index) {
        if (index != 3) context.go(routes[index]);
      },
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.home_outlined),
          selectedIcon: Icon(Icons.home_rounded),
          label: 'Home',
        ),
        NavigationDestination(
          icon: Icon(Icons.assignment_outlined),
          selectedIcon: Icon(Icons.assignment_rounded),
          label: 'Orders',
        ),
        NavigationDestination(
          icon: Icon(Icons.account_balance_wallet_outlined),
          selectedIcon: Icon(Icons.account_balance_wallet_rounded),
          label: 'Earnings',
        ),
        NavigationDestination(
          icon: Icon(Icons.person_outline_rounded),
          selectedIcon: Icon(Icons.person_rounded),
          label: 'Profile',
        ),
      ],
    );
  }
}

class _ProfileBody extends StatelessWidget {
  const _ProfileBody({
    required this.rider,
    required this.photoSaving,
    required this.onEditPhoto,
    required this.onLogout,
  });

  final RiderProfile rider;
  final bool photoSaving;
  final VoidCallback onEditPhoto;
  final Future<void> Function() onLogout;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final photo = AppConfig.resolveMediaUrl(rider.profilePhotoUrl);
    final status = _profileStatus(rider);
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: _ProfileHero(
            rider: rider,
            photoUrl: photo,
            status: status,
            photoSaving: photoSaving,
            onEditPhoto: onEditPhoto,
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
          sliver: SliverList.list(
            children: [
              Transform.translate(
                offset: const Offset(0, -28),
                child: _InfoCard(
                  title: 'Personal Information',
                  children: [
                    _InfoRow(
                      icon: Icons.mail_outline_rounded,
                      label: 'Email',
                      value: rider.email.isEmpty ? 'Not provided' : rider.email,
                    ),
                    _InfoRow(
                      icon: Icons.phone_outlined,
                      label: 'Phone Number',
                      value: rider.phone.isEmpty ? 'Not provided' : rider.phone,
                    ),
                    _InfoRow(
                      icon: Icons.badge_outlined,
                      label: 'Rider ID',
                      value: _riderId(rider),
                    ),
                    _InfoRow(
                      icon: Icons.delivery_dining_rounded,
                      label: 'Vehicle Type',
                      value: rider.vehicleType.isEmpty
                          ? 'Not provided'
                          : rider.vehicleType,
                    ),
                    _InfoRow(
                      icon: Icons.credit_card_rounded,
                      label: 'Plate Number',
                      value: rider.plateNumber.isEmpty
                          ? 'Not provided'
                          : rider.plateNumber,
                    ),
                    _InfoRow(
                      icon: Icons.person_pin_circle_outlined,
                      label: 'Worker Type',
                      value: _workerTypeLabel(rider.workerType),
                    ),
                    _InfoRow(
                      icon: Icons.verified_user_outlined,
                      label: 'Status',
                      value: status,
                      valueChip: true,
                    ),
                  ],
                ),
              ),
              Transform.translate(
                offset: const Offset(0, -16),
                child: _InfoCard(
                  title: 'Verification',
                  children: [
                    _InfoRow(
                      icon: Icons.fact_check_outlined,
                      label: 'NIN',
                      value: rider.raw['nin_verified'] == true
                          ? 'Verified'
                          : 'Pending',
                      valueChip: true,
                    ),
                    _InfoRow(
                      icon: Icons.camera_alt_outlined,
                      label: 'Selfie',
                      value: rider.selfieUrl.isEmpty ? 'Missing' : 'Verified',
                      valueChip: true,
                    ),
                    _InfoRow(
                      icon: Icons.assignment_ind_outlined,
                      label: 'Government ID',
                      value:
                          '${rider.raw['id_document_url'] ?? ''}'.trim().isEmpty
                              ? 'Missing'
                              : 'Verified',
                      valueChip: true,
                    ),
                    _InfoRow(
                      icon: Icons.support_agent_rounded,
                      label: 'Support',
                      value: AppConfig.supportEmail,
                    ),
                  ],
                ),
              ),
              FilledButton.icon(
                onPressed: onLogout,
                icon: const Icon(Icons.logout_rounded),
                label: const Text('Logout'),
                style: FilledButton.styleFrom(
                  backgroundColor: scheme.error,
                  foregroundColor: scheme.onError,
                  minimumSize: const Size.fromHeight(48),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ProfileHero extends StatelessWidget {
  const _ProfileHero({
    required this.rider,
    required this.photoUrl,
    required this.status,
    required this.photoSaving,
    required this.onEditPhoto,
  });

  final RiderProfile rider;
  final String photoUrl;
  final String status;
  final bool photoSaving;
  final VoidCallback onEditPhoto;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(
        20,
        MediaQuery.paddingOf(context).top + 12,
        20,
        52,
      ),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF058C45), Color(0xFF0A6B35), Color(0xFF094523)],
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(26)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              IconButton(
                onPressed: () => context.go('/dashboard'),
                icon: const Icon(Icons.arrow_back_rounded),
                color: Colors.white,
                tooltip: 'Back',
              ),
              const Expanded(
                child: Text(
                  'Profile',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 19,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              IconButton(
                onPressed: photoSaving ? null : onEditPhoto,
                icon: const Icon(Icons.edit_rounded),
                color: Colors.white,
                tooltip: 'Edit profile',
              ),
            ],
          ),
          const SizedBox(height: 18),
          Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 124,
                height: 124,
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.18),
                      blurRadius: 22,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: CircleAvatar(
                  backgroundColor: scheme.primaryContainer,
                  backgroundImage:
                      photoUrl.isEmpty ? null : NetworkImage(photoUrl),
                  child: photoUrl.isEmpty
                      ? Text(
                          _initials(rider.name),
                          style: TextStyle(
                            color: scheme.primary,
                            fontWeight: FontWeight.w900,
                            fontSize: 28,
                          ),
                        )
                      : null,
                ),
              ),
              Positioned(
                right: 2,
                bottom: 6,
                child: Tooltip(
                  message: 'Edit profile photo',
                  child: InkWell(
                    onTap: photoSaving ? null : onEditPhoto,
                    customBorder: const CircleBorder(),
                    child: Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        border: Border.all(color: const Color(0xFFE8F5EE)),
                      ),
                      child: photoSaving
                          ? const Padding(
                              padding: EdgeInsets.all(9),
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(
                              Icons.camera_alt_rounded,
                              color: Color(0xFF087A34),
                              size: 19,
                            ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text(
            rider.name.isEmpty ? 'FoodNova Rider' : rider.name,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 26,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: [
              _HeroBadge(_workerTypeLabel(rider.workerType)),
              _HeroBadge(status),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeroBadge extends StatelessWidget {
  const _HeroBadge(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: const TextStyle(
          color: Color(0xFF087A34),
          fontWeight: FontWeight.w900,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 26,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
            child: Text(
              title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
            ),
          ),
          ...children,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    this.valueChip = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool valueChip;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final displayValue = value.trim().isEmpty ? 'Not provided' : value.trim();
    final valueWidget = valueChip
        ? Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: scheme.primaryContainer.withValues(alpha: 0.55),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              displayValue,
              style: TextStyle(
                color: scheme.primary,
                fontWeight: FontWeight.w900,
                fontSize: 12,
              ),
            ),
          )
        : Text(
            displayValue,
            textAlign: TextAlign.right,
            style: TextStyle(
              color: scheme.onSurface,
              fontWeight: FontWeight.w800,
            ),
          );
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.55)),
        ),
      ),
      child: Row(
        children: [
          Icon(icon, color: scheme.primary, size: 20),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: scheme.onSurface,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Flexible(child: valueWidget),
        ],
      ),
    );
  }
}

String _workerTypeLabel(String value) {
  return value.toLowerCase().contains('messenger')
      ? 'Messenger'
      : 'Delivery Rider';
}

String _riderId(RiderProfile rider) {
  final raw = '${rider.raw['rider_id'] ?? rider.raw['id'] ?? ''}'.trim();
  if (raw.isEmpty) return 'Not assigned';
  if (raw.startsWith('FN-')) return raw;
  return 'FN-RDR-$raw';
}

String _profileStatus(RiderProfile rider) {
  final kyc = rider.normalizedKycStatus;
  if (rider.isOnline) return 'Online';
  if (kyc == 'ACTIVE' || kyc == 'APPROVED') {
    return rider.accountStatus.toUpperCase() == 'OFFLINE'
        ? 'Approved & Offline'
        : 'Approved & Active';
  }
  if (kyc == 'SUSPENDED') return 'Suspended';
  if (kyc == 'PENDING_REVIEW') return 'Pending Review';
  if (kyc == 'ONBOARDING') return 'Pending Review';
  return kyc.replaceAll('_', ' ');
}

String _initials(String value) {
  final parts = value
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .take(2)
      .map((part) => part[0].toUpperCase())
      .join();
  return parts.isEmpty ? 'FN' : parts;
}
