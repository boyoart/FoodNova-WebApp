import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/colors.dart';
import '../../../core/utils/location_service.dart';
import '../../../core/widgets/fn_widgets.dart';
import '../../../services/realtime_service.dart';
import '../../auth/presentation/onboarding_progress_stepper.dart';
import '../../delivery/data/dispatch_repository.dart';
import '../../delivery/domain/dispatch_models.dart';
import '../../notifications/data/notifications_repository.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  bool toggling = false;
  String error = '';
  Timer? onlineGpsTimer;
  StreamSubscription<Map<String, dynamic>>? realtimeSubscription;
  bool onlineGpsPingInFlight = false;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(() async {
      final realtime = ref.read(realtimeServiceProvider);
      realtimeSubscription = realtime.events.listen((_) {
        ref.invalidate(deliveryOffersProvider);
        ref.invalidate(deliveryOrdersProvider);
        ref.invalidate(dashboardStatsProvider);
        ref.invalidate(riderProfileProvider);
      });
    });
  }

  @override
  void dispose() {
    onlineGpsTimer?.cancel();
    realtimeSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(notificationRefreshProvider, (_, __) {
      ref.invalidate(deliveryOffersProvider);
      ref.invalidate(deliveryOrdersProvider);
      ref.invalidate(dashboardStatsProvider);
      ref.invalidate(riderProfileProvider);
    });
    final profile = ref.watch(riderProfileProvider);
    final riderForNavigation = profile.valueOrNull;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (!context.mounted) return;
        final exit = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Exit FoodNova Dispatch?'),
            content: const Text('You are on the dashboard. Exit the app?'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Stay'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Exit'),
              ),
            ],
          ),
        );
        if (exit == true) await SystemNavigator.pop();
      },
      child: Scaffold(
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
                  if (!rider.dashboardAccessAllowed) {
                    _syncOnlineGpsLoop(false);
                    return _AccessLockedCard(rider: rider);
                  }
                  _syncOnlineGpsLoop(rider.isOnline);
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Header(
                        rider: rider,
                        onToggle: () => _toggleOnline(rider),
                        loading: toggling,
                      ),
                      const SizedBox(height: 16),
                      const _ApprovedDashboardBody(),
                    ],
                  );
                },
                loading: () => const LinearProgressIndicator(),
                error: (e, _) => Text(apiOperationMessage(e, 'Load dashboard')),
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
            if (riderForNavigation != null &&
                !riderForNavigation.dashboardAccessAllowed) {
              final blocked = i == 1 || i == 2;
              if (blocked) {
                setState(() {
                  error = riderForNavigation.applicationSubmitted
                      ? 'Dashboard tools unlock after admin approval.'
                      : 'Complete onboarding before using dispatch tools.';
                });
                return;
              }
            }
            if (i == 1) {
              context.go('/orders');
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
              icon: Icon(Icons.assignment_outlined),
              label: 'Orders',
            ),
            NavigationDestination(
              icon: Icon(Icons.history_outlined),
              label: 'History',
            ),
            NavigationDestination(
              icon: Icon(Icons.settings_outlined),
              label: 'Settings',
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _toggleOnline(RiderProfile rider) async {
    if (!rider.dashboardAccessAllowed) {
      setState(() {
        error = rider.isRejected
            ? 'Your rider account was rejected.${rider.rejectionReason.isEmpty ? '' : ' ${rider.rejectionReason}'}'
            : 'Complete onboarding requirements before going online.';
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
        _syncOnlineGpsLoop(false);
      } else {
        final pos = await LocationService().current(requestBackground: true);
        final payload = locationPayload(pos);
        debugPrint(
          'DISPATCH_GO_ONLINE_GPS latitude=${payload['latitude']} '
          'longitude=${payload['longitude']} accuracy=${payload['accuracy']} '
          'timestamp=${payload['timestamp']}',
        );
        await repo.goOnline(payload);
        _syncOnlineGpsLoop(true);
      }
      ref.invalidate(riderProfileProvider);
      ref.invalidate(dashboardStatsProvider);
    } catch (e) {
      if (!mounted) return;
      final operation = rider.isOnline ? 'Go offline' : 'Go online';
      final message = e is DispatchLocationException
          ? '$operation failed: ${e.message}'
          : apiOperationMessage(e, operation);
      setState(() => error = message);
    } finally {
      if (mounted) setState(() => toggling = false);
    }
  }

  void _syncOnlineGpsLoop(bool shouldRun) {
    if (!mounted) return;
    if (!shouldRun) {
      onlineGpsTimer?.cancel();
      onlineGpsTimer = null;
      ref.read(realtimeServiceProvider).disconnect();
      return;
    }
    if (onlineGpsTimer != null) return;
    Future<void>.microtask(() => ref.read(realtimeServiceProvider).connect());
    _sendOnlineGpsPing();
    onlineGpsTimer =
        Timer.periodic(const Duration(seconds: 5), (_) => _sendOnlineGpsPing());
  }

  Future<void> _sendOnlineGpsPing() async {
    if (onlineGpsPingInFlight) return;
    onlineGpsPingInFlight = true;
    try {
      final pos = await LocationService().current(requestBackground: true);
      final payload = locationPayload(pos);
      debugPrint(
        'DISPATCH_ONLINE_GPS latitude=${payload['latitude']} '
        'longitude=${payload['longitude']} accuracy=${payload['accuracy']} '
        'timestamp=${payload['timestamp']}',
      );
      await ref.read(dispatchRepositoryProvider).pingLocation(payload);
    } catch (error) {
      debugPrint('DISPATCH_ONLINE_GPS_ERROR $error');
    } finally {
      onlineGpsPingInFlight = false;
    }
  }
}

class _ApprovedDashboardBody extends ConsumerWidget {
  const _ApprovedDashboardBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offers = ref.watch(deliveryOffersProvider);
    final stats = ref.watch(dashboardStatsProvider);
    final statValues = stats.valueOrNull;
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
              label: 'Acceptance Rate',
              value: stats.isLoading
                  ? '...'
                  : '${statValues?.acceptanceRate.round() ?? 0}%',
              icon: Icons.trending_up_outlined,
            ),
            StatTile(
              label: 'Today\'s Deliveries',
              value: stats.isLoading
                  ? '...'
                  : '${statValues?.todayDeliveries ?? 0}',
              icon: Icons.local_shipping_outlined,
            ),
            StatTile(
              label: 'Completed',
              value: stats.isLoading ? '...' : '${statValues?.completed ?? 0}',
              icon: Icons.check_circle_outline,
            ),
            StatTile(
              label: 'Average Rating',
              value: stats.isLoading
                  ? '...'
                  : (statValues?.averageRating ?? 0).toStringAsFixed(1),
              icon: Icons.star_outline,
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
          error: (e, _) => FnCard(
              child: Text(apiOperationMessage(e, 'Load incoming orders'))),
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
    final isSubmitted =
        rider.applicationSubmitted && !rider.shouldContinueOnboarding;
    final displayStatus = rider.kycStatus == 'PENDING_REVIEW'
        ? 'Pending Review'
        : rider.kycStatus.replaceAll('_', ' ');
    final continueOnboarding = rider.shouldContinueOnboarding;
    final title = isRejected
        ? 'Application rejected'
        : isSuspended
            ? 'Account suspended'
            : isSubmitted
                ? 'Application Submitted'
                : 'Continue Onboarding';
    final detail = isRejected
        ? (rider.rejectionReason.isEmpty
            ? 'FoodNova admin rejected this application. Update your documents and resubmit when requested.'
            : rider.rejectionReason)
        : isSuspended
            ? 'FoodNova has temporarily blocked dashboard access. Contact support for the next step.'
            : isSubmitted
                ? 'Awaiting Admin Review. FoodNova operations will review your application in 24-72 hours.'
                : 'Your rider setup is saved. Continue onboarding to submit your application for FoodNova admin review.';
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
          if (isSubmitted) ...[
            const SizedBox(height: 10),
            _ReviewStatusRow(
              label: 'Submission Date',
              value: rider.submittedAt.isEmpty
                  ? 'Saved by backend'
                  : rider.submittedAt,
            ),
            const _ReviewStatusRow(
              label: 'Estimated Review Time',
              value: '24-72 hours',
            ),
          ],
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
      'Order completion disabled',
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

class _ReviewStatusRow extends StatelessWidget {
  const _ReviewStatusRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          SizedBox(
            width: 150,
            child: Text(
              label,
              style: const TextStyle(
                color: FoodNovaColors.secondaryText,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
        ],
      ),
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
            onPressed:
                loading || !rider.dashboardAccessAllowed ? null : onToggle,
            icon: Icon(online ? Icons.toggle_on : Icons.toggle_off),
            label: Text(
              loading
                  ? 'Updating...'
                  : !rider.dashboardAccessAllowed
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

class _OfferCard extends ConsumerStatefulWidget {
  const _OfferCard({required this.offer});
  final DeliveryOffer offer;

  @override
  ConsumerState<_OfferCard> createState() => _OfferCardState();
}

class _OfferCardState extends ConsumerState<_OfferCard> {
  bool _accepting = false;
  bool _declining = false;

  DeliveryOffer get offer => widget.offer;

  Future<void> _accept() async {
    if (_accepting || _declining) return;
    setState(() => _accepting = true);
    try {
      final accepted =
          await ref.read(dispatchRepositoryProvider).accept(offer.id);
      if (!mounted) return;
      ref.invalidate(deliveryOffersProvider);
      ref.invalidate(deliveryOrdersProvider);
      context.go('/active-delivery', extra: accepted.raw);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(apiMessage(error))),
      );
    } finally {
      if (mounted) setState(() => _accepting = false);
    }
  }

  Future<void> _decline() async {
    if (_accepting || _declining) return;
    setState(() => _declining = true);
    try {
      await ref.read(dispatchRepositoryProvider).decline(offer.id);
      ref.invalidate(deliveryOffersProvider);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(apiMessage(error))),
      );
    } finally {
      if (mounted) setState(() => _declining = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final busy = _accepting || _declining;
    debugPrint(
      'DELIVERY_OFFER_RENDERED offerId=${offer.id} '
      'orderId=${offer.orderId} status=${offer.status}',
    );
    debugPrint('DELIVERY_ACCEPT_BUTTON_RENDERED offerId=${offer.id}');
    debugPrint('DELIVERY_DECLINE_BUTTON_RENDERED offerId=${offer.id}');
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
            Text('${offer.distance} / ${offer.eta}'),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: busy ? null : _accept,
                    child: _accepting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Accept'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy ? null : _decline,
                    child: _declining
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Decline'),
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
