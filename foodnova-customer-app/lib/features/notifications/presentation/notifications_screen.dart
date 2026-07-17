import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/fn_shell.dart';
import '../../../widgets/skeleton_box.dart';
import '../../../services/notification_destination.dart';
import '../data/notifications_repository.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(notificationRefreshProvider, (_, __) {
      if (!context.mounted) return;
      ref.invalidate(notificationsProvider);
      ref.invalidate(unreadNotificationsProvider);
    });
    final notifications = ref.watch(notificationsProvider);
    return FnShell(
      title: 'Notifications',
      actions: [
        IconButton(
          tooltip: 'Mark all read',
          onPressed: () async {
            try {
              final repository = ref.read(notificationsRepositoryProvider);
              await repository.markAllRead();
              if (!context.mounted) return;
              ref.invalidate(notificationsProvider);
              ref.invalidate(unreadNotificationsProvider);
            } catch (error) {
              if (context.mounted) {
                ScaffoldMessenger.of(context)
                    .showSnackBar(SnackBar(content: Text(apiMessage(error))));
              }
            }
          },
          icon: const Icon(Icons.done_all_rounded),
        ),
      ],
      child: notifications.when(
        data: (items) {
          if (items.isEmpty) {
            return const EmptyState(
              title: 'No notifications yet',
              message:
                  'Order, payment, and promotion updates from FoodNova will appear here.',
              icon: Icons.notifications_none_rounded,
            );
          }
          final unread =
              items.where((item) => item['is_read'] != true).toList();
          final read = items.where((item) => item['is_read'] == true).toList();
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(notificationsProvider);
              ref.invalidate(unreadNotificationsProvider);
              await Future.wait([
                ref.read(notificationsProvider.future),
                ref.read(unreadNotificationsProvider.future),
              ]);
            },
            child: ListView(
              children: [
                if (unread.isNotEmpty) ...[
                  _SectionLabel(label: 'Unread', count: unread.length),
                  const SizedBox(height: 10),
                  for (final item in unread) ...[
                    _NotificationCard(
                      item: item,
                      onTap: () => _open(context, ref, item),
                      onDelete: () => _delete(context, ref, item),
                    ),
                    const SizedBox(height: 10),
                  ],
                  const SizedBox(height: 8),
                ],
                if (read.isNotEmpty) ...[
                  _SectionLabel(label: 'Read', count: read.length),
                  const SizedBox(height: 10),
                  for (final item in read) ...[
                    _NotificationCard(
                      item: item,
                      onTap: () => _open(context, ref, item),
                      onDelete: () => _delete(context, ref, item),
                    ),
                    const SizedBox(height: 10),
                  ],
                ],
              ],
            ),
          );
        },
        loading: () => const Column(
          children: [
            SkeletonBox(height: 92, radius: 22),
            SizedBox(height: 10),
            SkeletonBox(height: 92, radius: 22),
          ],
        ),
        error: (error, _) => EmptyState(
            title: 'Could not load notifications',
            message: apiMessage(error),
            icon: Icons.wifi_off_rounded),
      ),
    );
  }

  Future<void> _markRead(
      BuildContext context, WidgetRef ref, Map<String, dynamic> item) async {
    final id = int.tryParse('${item['id']}') ?? 0;
    if (id == 0 || item['is_read'] == true) return;
    try {
      final repository = ref.read(notificationsRepositoryProvider);
      await repository.markRead(id);
      if (!context.mounted) return;
      ref.invalidate(notificationsProvider);
      ref.invalidate(unreadNotificationsProvider);
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiMessage(error))));
      }
    }
  }

  Future<void> _open(
      BuildContext context, WidgetRef ref, Map<String, dynamic> item) async {
    await _markRead(context, ref, item);
    if (!context.mounted) return;
    context.push(resolveCustomerNotification(item).route);
  }

  Future<void> _delete(
      BuildContext context, WidgetRef ref, Map<String, dynamic> item) async {
    final id = int.tryParse('${item['id']}') ?? 0;
    if (id == 0) return;
    try {
      await ref.read(notificationsRepositoryProvider).delete(id);
      if (!context.mounted) return;
      ref.invalidate(notificationsProvider);
      ref.invalidate(unreadNotificationsProvider);
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiMessage(error))));
      }
    }
  }
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({
    required this.item,
    required this.onTap,
    required this.onDelete,
  });

  final Map<String, dynamic> item;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final read = item['is_read'] == true;
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(22),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: read
              ? scheme.surface
              : FoodNovaColors.accent.withValues(alpha: .28),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
              color: read
                  ? scheme.outlineVariant
                  : FoodNovaColors.primary.withValues(alpha: .25)),
          boxShadow: read ? null : FoodNovaShadows.soft,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              backgroundColor: read
                  ? scheme.surfaceContainerHighest
                  : FoodNovaColors.primary,
              child: Icon(_iconFor('${item['category'] ?? item['type'] ?? ''}'),
                  color: read ? FoodNovaColors.primary : scheme.onPrimary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${item['title'] ?? 'FoodNova update'}',
                      style: const TextStyle(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 4),
                  Text('${item['message'] ?? ''}',
                      style: TextStyle(
                          color: scheme.onSurfaceVariant, height: 1.35)),
                  if ('${item['category'] ?? item['type'] ?? ''}'
                      .isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      '${item['category'] ?? item['type']}',
                      style: TextStyle(
                        color: FoodNovaColors.primary,
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                  if ('${item['created_at'] ?? ''}'.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text('${item['created_at']}',
                        style: TextStyle(
                            color: scheme.onSurfaceVariant,
                            fontSize: 12,
                            fontWeight: FontWeight.w700)),
                  ],
                ],
              ),
            ),
            IconButton(
              tooltip: 'Delete notification',
              onPressed: onDelete,
              icon: const Icon(Icons.delete_outline_rounded),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label, required this.count});

  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          label,
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(fontWeight: FontWeight.w900),
        ),
        const SizedBox(width: 8),
        Badge(label: Text('$count')),
      ],
    );
  }
}

IconData _iconFor(String value) {
  final normalized = value.toLowerCase();
  if (normalized.contains('payment')) {
    return Icons.payments_rounded;
  }
  if (normalized.contains('order')) {
    return Icons.receipt_long_rounded;
  }
  if (normalized.contains('promo') || normalized.contains('broadcast')) {
    return Icons.local_offer_rounded;
  }
  return Icons.notifications_rounded;
}
