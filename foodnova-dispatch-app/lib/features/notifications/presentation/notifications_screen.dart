import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/widgets/fn_widgets.dart';
import '../data/notifications_repository.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(notificationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(notificationsProvider),
        child: notifications.when(
          data: (items) => items.isEmpty
              ? ListView(
                  padding: const EdgeInsets.all(16),
                  children: const [
                    FnCard(child: Text('No notifications yet.')),
                  ],
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, index) {
                    final item = items[index];
                    return FnCard(
                      child: ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text('${item['title'] ?? 'FoodNova update'}'),
                        subtitle: Text('${item['message'] ?? ''}'),
                        trailing: item['is_read'] == true
                            ? null
                            : const Icon(Icons.circle, size: 10),
                        onTap: () {
                          final id = int.tryParse('${item['id'] ?? ''}');
                          if (id != null) {
                            ref
                                .read(notificationsRepositoryProvider)
                                .markRead(id)
                                .then((_) {
                              ref.invalidate(notificationsProvider);
                              ref.invalidate(unreadCountProvider);
                            });
                          }
                        },
                      ),
                    );
                  },
                ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(16),
            children: [FnCard(child: Text(apiMessage(e)))],
          ),
        ),
      ),
    );
  }
}
