import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/colors.dart';
import '../../../core/utils/location_service.dart';
import '../../../core/widgets/fn_widgets.dart';
import '../../auth/presentation/onboarding_progress_stepper.dart';
import '../../delivery/data/dispatch_repository.dart';
import '../../delivery/domain/dispatch_models.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  bool toggling = false;
  String error = '';
  final money = NumberFormat.currency(symbol: 'NGN ', decimalDigits: 0);

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(riderProfileProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dispatch'),
        actions: [
          IconButton(
            onPressed: () => context.go('/notifications'),
            icon: const Icon(Icons.notifications_outlined),
          ),
          IconButton(
            onPressed: () => context.go('/profile'),
            icon: const Icon(Icons.person_outline),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(riderProfileProvider);
          ref.invalidate(deliveryOffersProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            profile.when(
              data: (rider) {
                debugPrint('Dashboard loaded');
                debugPrint('Rider ID ${rider.id ?? ''}');
                debugPrint('Rider Name ${rider.name}');
                debugPrint('Data source backend');
                if (!rider.isApproved) {
                  return _AccessLockedCard(rider: rider);
                }
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Header(
                      rider: rider,
                      onToggle: () => _toggleOnline(rider),
                      loading: toggling,
                    ),
                    const SizedBox(height: 16),
                    _ApprovedDashboardBody(money: money),
                  ],
                );
              },
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => Text(apiMessage(e)),
            ),
            if (error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  error,
                  style: const TextStyle(color: FoodNovaColors.danger),
                ),
              ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        onDestinationSelected: (i) {
          if (i == 1) {
            context.go('/earnings');
          }
          if (i == 2) {
            context.go('/history');
          }
          if (i == 3) {
            context.go('/settings');
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.payments_outlined),
            label: 'Earnings',
          ),
          NavigationDestination(icon: Icon(Icons.history), label: 'History'),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            label: 'Settings',
          ),
        ],
      ),
    );
  }

  Future<void> _toggleOnline(RiderProfile rider) async {
    if (!rider.isApproved) {
      setState(() {
        error = rider.isRejected
            ? 'Your rider account was rejected.${rider.rejectionReason.isEmpty ? '' : ' ${rider.rejectionReason}'}'
            : 'Your rider account is still pending approval.';
      });
      return;
    }
    setState(() {
      toggling = true;
      error = '';
    });
    try {
      final repo = ref.read(dispatchRepositoryProvider);
      if (rider.isOnline) {
        await repo.goOffline();
      } else {
        final pos = await LocationService().current();
        await repo.goOnline(locationPayload(pos));
      }
      ref.invalidate(riderProfileProvider);
    } catch (e) {
      if (!mounted) return;
      setState(() => error = apiMessage(e));
    } finally {
      if (mounted) setState(() => toggling = false);
    }
  }
}

class _ApprovedDashboardBody extends ConsumerWidget {
  const _ApprovedDashboardBody({required this.money});
  final NumberFormat money;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offers = ref.watch(deliveryOffersProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GridView.count(
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 1.15,
          children: [
            StatTile(
              label: 'Today\'s Earnings',
              value: money.format(0),
              icon: Icons.payments_outlined,
            ),
            const StatTile(
              label: 'Today\'s Deliveries',
              value: '0',
              icon: Icons.local_shipping_outlined,
            ),
            const StatTile(
              label: 'Completed',
              value: '0',
              icon: Icons.check_circle_outline,
            ),
            const StatTile(
              label: 'Pending',
              value: '0',
              icon: Icons.pending_actions_outlined,
              color: FoodNovaColors.warning,
            ),
          ],
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            Text(
              'Incoming orders',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
            ),
            const Spacer(),
            IconButton(
              onPressed: () => ref.invalidate(deliveryOffersProvider),
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        offers.when(
          data: (items) => items.isEmpty
              ? const FnCard(
                  child: Text(
                    'No active assignments yet. Stay online to receive dispatch offers.',
                  ),
                )
              : Column(
                  children:
                      items.map((offer) => _OfferCard(offer: offer)).toList(),
                ),
          loading: () => const Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: CircularProgressIndicator(),
            ),
          ),
          error: (e, _) => FnCard(child: Text(apiMessage(e))),
        ),
      ],
    );
  }
}

class _AccessLockedCard extends StatelessWidget {
  const _AccessLockedCard({required this.rider});
  final RiderProfile rider;

  @override
  Widget build(BuildContext context) {
    final isRejected = rider.isRejected;
    final isSuspended = rider.isSuspended;
    final displayStatus = rider.kycStatus == 'PENDING_REVIEW'
        ? 'Pending Review'
        : rider.kycStatus.replaceAll('_', ' ');
    final continueOnboarding = rider.shouldContinueOnboarding;
    final title = continueOnboarding
        ? 'Pending Review'
        : isRejected
            ? 'Application rejected'
            : isSuspended
                ? 'Account suspended'
                : 'Pending Review';
    final detail = continueOnboarding
        ? 'Your rider setup is saved. Continue onboarding to submit your application for FoodNova admin review.'
        : isRejected
            ? (rider.rejectionReason.isEmpty
                ? 'FoodNova admin rejected this application. Update your documents and resubmit when requested.'
                : rider.rejectionReason)
            : isSuspended
                ? 'FoodNova has temporarily blocked dashboard access. Contact support for the next step.'
                : 'FoodNova admin is reviewing your verified NIN, selfie, and driver license before unlocking deliveries.';
    return FnCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isRejected || isSuspended
                    ? Icons.lock_outline
                    : Icons.hourglass_top_outlined,
                color: isRejected || isSuspended
                    ? FoodNovaColors.danger
                    : FoodNovaColors.warning,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          OnboardingProgressStepper(
            currentStep: rider.currentStep,
            status: rider.onboardingStage.isEmpty
                ? 'Awaiting FoodNova admin review'
                : rider.onboardingStage.replaceAll('_', ' '),
          ),
          const SizedBox(height: 14),
          Text(
            'Progress: ${rider.onboardingProgressPercent}%',
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),
          Text(
            'Current Step: ${rider.currentStep} of ${rider.onboardingStepTotal}',
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),
          Text(
            'Status: $displayStatus',
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),
          Text(detail),
          if (!isRejected && !isSuspended) ...[
            const SizedBox(height: 14),
            const _LockedCapabilities(),
          ],
          if (continueOnboarding) ...[
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: () => context.go('/signup'),
              icon: const Icon(Icons.play_arrow_rounded),
              label: const Text('Continue Onboarding'),
            ),
          ],
          if (isRejected) ...[
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: () => context.go('/signup'),
              icon: const Icon(Icons.upload_file_outlined),
              label: const Text('Update application'),
            ),
          ],
        ],
      ),
    );
  }
}

class _LockedCapabilities extends StatelessWidget {
  const _LockedCapabilities();

  @override
  Widget build(BuildContext context) {
    const items = [
      'Go Online disabled',
      'Accept Orders disabled',
      'Receive Deliveries disabled',
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final item in items)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                const Icon(
                  Icons.lock_outline,
                  size: 17,
                  color: FoodNovaColors.muted,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    item,
                    style: const TextStyle(
                      color: FoodNovaColors.muted,
                      fontWeight: FontWeight.w800,
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

class _Header extends StatelessWidget {
  const _Header({
    required this.rider,
    required this.onToggle,
    required this.loading,
  });
  final RiderProfile rider;
  final VoidCallback onToggle;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final online = rider.isOnline;
    return FnCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Hello, ${rider.name.isEmpty ? 'Rider' : rider.name}',
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text(
            'Rating ${rider.rating.toStringAsFixed(1)} / KYC ${rider.kycStatus}',
          ),
          if (rider.isRejected && rider.rejectionReason.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              rider.rejectionReason,
              style: const TextStyle(color: FoodNovaColors.danger),
            ),
          ],
          const SizedBox(height: 16),
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor:
                  online ? FoodNovaColors.success : FoodNovaColors.offline,
            ),
            onPressed: loading || !rider.isApproved ? null : onToggle,
            icon: Icon(online ? Icons.toggle_on : Icons.toggle_off),
            label: Text(
              loading
                  ? 'Updating...'
                  : !rider.isApproved
                      ? rider.isRejected
                          ? 'Rejected'
                          : 'Pending Approval'
                      : online
                          ? 'Online'
                          : 'Offline',
            ),
          ),
        ],
      ),
    );
  }
}

class _OfferCard extends ConsumerWidget {
  const _OfferCard({required this.offer});
  final DeliveryOffer offer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: FnCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    offer.orderCode,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w900,
                        ),
                  ),
                ),
                const Icon(Icons.timer_outlined),
              ],
            ),
            const SizedBox(height: 10),
            Text(offer.customerName),
            Text('Pickup: ${offer.pickup}'),
            Text('Dropoff: ${offer.dropoff}'),
            Text('${offer.distance} / ${offer.eta} / NGN ${offer.earnings}'),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: () async {
                      final accepted = await ref
                          .read(dispatchRepositoryProvider)
                          .accept(offer.id);
                      if (!context.mounted) return;
                      context.go('/active-delivery', extra: accepted.raw);
                    },
                    child: const Text('Accept'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async {
                      await ref
                          .read(dispatchRepositoryProvider)
                          .decline(offer.id);
                      if (!context.mounted) return;
                      ref.invalidate(deliveryOffersProvider);
                    },
                    child: const Text('Decline'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
