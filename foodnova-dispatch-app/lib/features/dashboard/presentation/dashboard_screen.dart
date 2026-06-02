import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/colors.dart';
import '../../../core/utils/location_service.dart';
import '../../../core/widgets/fn_widgets.dart';
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
    final offers = ref.watch(deliveryOffersProvider);
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
              data: (rider) => _Header(
                rider: rider,
                onToggle: () => _toggleOnline(rider),
                loading: toggling,
              ),
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
            const SizedBox(height: 16),
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
                      children: items
                          .map((offer) => _OfferCard(offer: offer))
                          .toList(),
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
