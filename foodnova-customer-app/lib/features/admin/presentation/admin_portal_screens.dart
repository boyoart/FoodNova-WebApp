import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/app_config.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../shared/auth/account_roles.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/mobile_app_scaffold.dart';
import '../../products/presentation/product_image.dart';
import '../../profile/data/profile_repository.dart';
import '../data/admin_repository.dart';

bool isAdminProfile(ProfileData profile) {
  return canUseAdminTools(profile.role);
}

class AdminGuard extends ConsumerWidget {
  const AdminGuard({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    return profile.when(
      loading: () => const MobileAppScaffold(
        selectedIndex: 4,
        title: 'Admin Tools',
        floatingCart: false,
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (error, _) => MobileAppScaffold(
        selectedIndex: 4,
        title: 'Admin Tools',
        floatingCart: false,
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: EmptyState(
            title: 'Admin access unavailable',
            message: apiMessage(error),
            icon: Icons.admin_panel_settings_outlined,
          ),
        ),
      ),
      data: (data) => isAdminProfile(data)
          ? child
          : const MobileAppScaffold(
              selectedIndex: 4,
              title: 'Admin Tools',
              floatingCart: false,
              body: Padding(
                padding: EdgeInsets.all(24),
                child: EmptyState(
                  title: 'Admin access required',
                  message: 'This area is restricted to FoodNova admins.',
                  icon: Icons.lock_outline_rounded,
                ),
              ),
            ),
    );
  }
}

class AdminDashboardScreen extends ConsumerWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    debugPrint('ADMIN_DASHBOARD_LOADING');
    final state = ref.watch(adminDashboardProvider);
    return _AdminShell(
      title: 'Mobile Admin Mode',
      child: state.when(
        loading: _loading,
        error: _error,
        data: (data) {
          final orders = List<Map<String, dynamic>>.from(data['orders'] ?? []);
          final dispatch = _asMap(data['dispatch_stats']);
          final today = DateTime.now();
          final todayOrders = orders
              .where((order) => _sameDay(_date(order['created_at']), today))
              .toList();
          final cards = [
            _Metric('Today\'s Orders', todayOrders.length, Icons.today_rounded),
            _Metric(
                'Pending Orders',
                _countStatus(orders, ['pending_payment', 'order_placed']),
                Icons.pending_actions_rounded),
            _Metric('Processing Orders', _countStatus(orders, ['processing']),
                Icons.inventory_rounded),
            _Metric(
                'Out For Delivery',
                _countStatus(orders, ['out_for_delivery']) +
                    _num(dispatch['IN_TRANSIT']).toInt(),
                Icons.delivery_dining_rounded),
            _Metric('Delivered Orders', _countStatus(orders, ['delivered']),
                Icons.check_circle_rounded),
            _Metric('Revenue Today', _money(_sum(todayOrders)),
                Icons.payments_rounded,
                isText: true),
            _Metric(
                'Revenue This Week',
                _money(_sum(orders.where(
                    (order) => _isThisWeek(_date(order['created_at']))))),
                Icons.bar_chart_rounded,
                isText: true),
            _Metric(
                'Active Riders',
                _num(dispatch['available_riders']) +
                    _num(dispatch['busy_riders']),
                Icons.badge_rounded),
            _Metric('Online Riders', _num(dispatch['online_riders']),
                Icons.online_prediction_rounded),
          ];
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(adminDashboardProvider),
            child: ListView(
              padding: _pagePadding,
              children: [
                _AdminHero(
                  title: 'Mobile Admin Mode',
                  subtitle:
                      'Lightweight monitoring for orders, dispatch, stock, and announcements. Use the web admin portal for full management.',
                  icon: Icons.admin_panel_settings_rounded,
                ),
                const SizedBox(height: 14),
                _MetricGrid(cards: cards),
                const SizedBox(height: 14),
                _AdminModuleGrid(),
              ],
            ),
          );
        },
      ),
    );
  }
}

class AdminOrdersScreen extends ConsumerStatefulWidget {
  const AdminOrdersScreen({super.key});

  @override
  ConsumerState<AdminOrdersScreen> createState() => _AdminOrdersScreenState();
}

class _AdminOrdersScreenState extends ConsumerState<AdminOrdersScreen> {
  String _query = '';
  String _status = 'all';

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(adminOrdersProvider);
    return _AdminShell(
      title: 'Admin Orders',
      child: state.when(
        loading: _loading,
        error: _error,
        data: (orders) {
          final filtered = orders.where((order) {
            final text = [
              order['order_code'],
              order['customer_name'],
              order['customer_phone'],
              order['phone'],
              order['delivery_address'],
            ].join(' ').toLowerCase();
            final matchesQuery = _query.trim().isEmpty ||
                text.contains(_query.trim().toLowerCase());
            final orderStatus = _statusOf(order);
            final matchesStatus = _status == 'all' || orderStatus == _status;
            return matchesQuery && matchesStatus;
          }).toList();
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(adminOrdersProvider),
            child: ListView(
              padding: _pagePadding,
              children: [
                _SearchField(
                  hint: 'Search orders, customer, phone',
                  onChanged: (value) => setState(() => _query = value),
                ),
                const SizedBox(height: 10),
                _StatusChips(
                  selected: _status,
                  values: const [
                    'all',
                    'processing',
                    'ready',
                    'out_for_delivery',
                    'delivered',
                    'cancelled'
                  ],
                  onSelected: (value) => setState(() => _status = value),
                ),
                const SizedBox(height: 12),
                for (final order in filtered)
                  _OrderCard(
                    order: order,
                    onTap: () => _showOrderDetails(context, ref, order),
                  ),
                if (filtered.isEmpty)
                  const _InlineEmpty('No orders match this search.'),
              ],
            ),
          );
        },
      ),
    );
  }
}

class AdminDispatchScreen extends ConsumerWidget {
  const AdminDispatchScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(adminDispatchProvider);
    return _AdminShell(
      title: 'Dispatch',
      child: state.when(
        loading: _loading,
        error: _error,
        data: (data) {
          final riders = _list(data['riders']);
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(adminDispatchProvider),
            child: ListView(
              padding: _pagePadding,
              children: [
                _AdminHero(
                  title: 'Rider Operations',
                  subtitle: '${riders.length} riders and messengers',
                  icon: Icons.delivery_dining_rounded,
                ),
                const SizedBox(height: 12),
                for (final rider in riders) _RiderCard(rider: rider),
                if (riders.isEmpty) const _InlineEmpty('No riders found.'),
              ],
            ),
          );
        },
      ),
    );
  }
}

class AdminInventoryScreen extends ConsumerWidget {
  const AdminInventoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(adminInventoryProvider);
    return _AdminShell(
      title: 'Inventory',
      child: state.when(
        loading: _loading,
        error: _error,
        data: (products) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(adminInventoryProvider),
          child: ListView(
            padding: _pagePadding,
            children: [
              for (final product in products) _InventoryCard(product: product),
              if (products.isEmpty) const _InlineEmpty('No products found.'),
            ],
          ),
        ),
      ),
    );
  }
}

class AdminAnnouncementsScreen extends ConsumerWidget {
  const AdminAnnouncementsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(adminAnnouncementsProvider);
    return _AdminShell(
      title: 'Announcements',
      actions: [
        IconButton(
          tooltip: 'Create announcement',
          onPressed: () => _showAnnouncementEditor(context, ref),
          icon: const Icon(Icons.add_rounded),
        ),
      ],
      child: state.when(
        loading: _loading,
        error: _error,
        data: (items) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(adminAnnouncementsProvider),
          child: ListView(
            padding: _pagePadding,
            children: [
              _AdminHero(
                title: 'Campaign Center',
                subtitle: 'Hero banners, homepage announcements, promotions',
                icon: Icons.campaign_rounded,
              ),
              const SizedBox(height: 12),
              for (final item in items) _AnnouncementCard(item: item),
              if (items.isEmpty)
                const _InlineEmpty('No announcements created yet.'),
            ],
          ),
        ),
      ),
    );
  }
}

class AdminCustomersScreen extends ConsumerStatefulWidget {
  const AdminCustomersScreen({super.key});

  @override
  ConsumerState<AdminCustomersScreen> createState() =>
      _AdminCustomersScreenState();
}

class _AdminCustomersScreenState extends ConsumerState<AdminCustomersScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(adminCustomersProvider);
    return _AdminShell(
      title: 'Customers',
      child: state.when(
        loading: _loading,
        error: _error,
        data: (customers) {
          final filtered = customers.where((customer) {
            final text = [
              customer['name'],
              customer['full_name'],
              customer['phone'],
              customer['email'],
            ].join(' ').toLowerCase();
            return _query.isEmpty || text.contains(_query.toLowerCase());
          }).toList();
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(adminCustomersProvider),
            child: ListView(
              padding: _pagePadding,
              children: [
                _SearchField(
                  hint: 'Search customers',
                  onChanged: (value) => setState(() => _query = value),
                ),
                const SizedBox(height: 12),
                for (final customer in filtered)
                  _CustomerCard(customer: customer),
                if (filtered.isEmpty)
                  const _InlineEmpty('No customers match this search.'),
              ],
            ),
          );
        },
      ),
    );
  }
}

class AdminReportsScreen extends ConsumerWidget {
  const AdminReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(adminReportsProvider);
    return _AdminShell(
      title: 'Reports',
      child: state.when(
        loading: _loading,
        error: _error,
        data: (data) {
          final summary = _asMap(data['summary']);
          final revenueByDay = _list(data['revenue_by_day']);
          final topProducts = _list(data['top_products']);
          final recentOrders = _list(data['recent_orders']);
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(adminReportsProvider),
            child: ListView(
              padding: _pagePadding,
              children: [
                _MetricGrid(cards: [
                  _Metric('Revenue Today', _money(_todayRevenue(revenueByDay)),
                      Icons.today_rounded,
                      isText: true),
                  _Metric('Revenue Week', _money(_weekRevenue(revenueByDay)),
                      Icons.stacked_line_chart_rounded,
                      isText: true),
                  _Metric(
                      'Revenue Month',
                      _money(_num(summary['total_revenue'])),
                      Icons.calendar_month_rounded,
                      isText: true),
                ]),
                const SizedBox(height: 14),
                _SectionTitle('Top Products'),
                for (final item in topProducts)
                  _SimpleRow(
                    title: '${item['name'] ?? 'FoodNova Item'}',
                    subtitle: '${item['quantity_sold'] ?? 0} sold',
                    trailing: _money(_num(item['revenue'])),
                  ),
                const SizedBox(height: 14),
                _SectionTitle('Top Customers'),
                for (final order in recentOrders.take(5))
                  _SimpleRow(
                    title: '${order['customer_name'] ?? 'Customer'}',
                    subtitle: '${order['order_code'] ?? ''}',
                    trailing: _money(_num(order['total_amount'])),
                  ),
                const SizedBox(height: 14),
                _SectionTitle('Most Active Riders'),
                _SimpleRow(
                  title: 'Assigned deliveries',
                  subtitle: 'Current reporting period',
                  trailing: '${summary['assigned_deliveries'] ?? 0}',
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class AdminSettingsScreen extends StatelessWidget {
  const AdminSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _AdminShell(
      title: 'Mobile Settings',
      child: ListView(
        padding: _pagePadding,
        children: const [
          _AdminHero(
            title: 'Settings',
            subtitle:
                'Mobile admin mode is read-focused. Full configuration remains on the FoodNova web admin portal.',
            icon: Icons.settings_rounded,
          ),
          SizedBox(height: 14),
          _InfoNotice(
            title: 'Web admin portal',
            message:
                'Use the web dashboard for user management, deep product edits, payment settings, exports, and website configuration.',
          ),
        ],
      ),
    );
  }
}

class _AdminShell extends StatelessWidget {
  const _AdminShell(
      {required this.title, required this.child, this.actions = const []});

  final String title;
  final Widget child;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return MobileAppScaffold(
      selectedIndex: 4,
      title: title,
      floatingCart: false,
      actions: actions,
      body: SafeArea(bottom: false, child: child),
    );
  }
}

class _AdminModuleGrid extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final modules = [
      ('Products', Icons.storefront_rounded, '/admin/inventory'),
      ('Orders', Icons.receipt_long_rounded, '/admin/orders'),
      ('Customers', Icons.groups_rounded, '/admin/customers'),
      ('Dispatch', Icons.delivery_dining_rounded, '/admin/dispatch'),
      ('Announcements', Icons.campaign_rounded, '/admin/announcements'),
      ('Homepage Banners', Icons.web_stories_rounded, '/admin/announcements'),
      ('Stock Management', Icons.inventory_2_rounded, '/admin/inventory'),
      ('Notifications', Icons.notifications_active_rounded, '/notifications'),
      ('Reports', Icons.analytics_rounded, '/admin/reports'),
      ('Settings', Icons.settings_rounded, '/admin/settings'),
    ];
    return GridView.builder(
      itemCount: modules.length,
      physics: const NeverScrollableScrollPhysics(),
      shrinkWrap: true,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 1.42,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
      ),
      itemBuilder: (context, index) {
        final item = modules[index];
        return _ActionTile(
          title: item.$1,
          icon: item.$2,
          onTap: () => context.push(item.$3),
        );
      },
    );
  }
}

class _MetricGrid extends StatelessWidget {
  const _MetricGrid({required this.cards});
  final List<_Metric> cards;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      itemCount: cards.length,
      physics: const NeverScrollableScrollPhysics(),
      shrinkWrap: true,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 1.32,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
      ),
      itemBuilder: (context, index) => _MetricCard(metric: cards[index]),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.metric});
  final _Metric metric;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _cardDecoration(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            backgroundColor: scheme.secondary,
            foregroundColor: scheme.onSecondary,
            child: Icon(metric.icon, size: 20),
          ),
          const Spacer(),
          Text(
            metric.isText
                ? '${metric.value}'
                : NumberFormat.compact().format(metric.value),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: FoodNovaColors.primary,
                  fontWeight: FontWeight.w900,
                ),
          ),
          const SizedBox(height: 3),
          Text(metric.label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.onTap});
  final Map<String, dynamic> order;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _TapCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('${order['order_code'] ?? 'Order'}',
                    style: const TextStyle(fontWeight: FontWeight.w900)),
              ),
              _Pill(_label(_statusOf(order))),
            ],
          ),
          const SizedBox(height: 6),
          Text(
              '${order['customer_name'] ?? 'Customer'} • ${order['customer_phone'] ?? order['phone'] ?? ''}'),
          const SizedBox(height: 6),
          Text(_money(_num(order['total_amount'] ?? order['total'])),
              style: const TextStyle(
                  color: FoodNovaColors.primary, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}

class _RiderCard extends StatelessWidget {
  const _RiderCard({required this.rider});
  final Map<String, dynamic> rider;

  @override
  Widget build(BuildContext context) {
    final phone = '${rider['phone'] ?? ''}';
    final status =
        '${rider['operational_status'] ?? rider['status_label'] ?? 'OFFLINE'}'
            .toUpperCase();
    return _TapCard(
      onTap: () {},
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('${rider['full_name'] ?? rider['name'] ?? 'Rider'}',
                    style: const TextStyle(fontWeight: FontWeight.w900)),
              ),
              _Pill(status.contains('DELIVERY') || status.contains('BUSY')
                  ? 'ON DELIVERY'
                  : status.contains('ONLINE') || status.contains('AVAILABLE')
                      ? 'ONLINE'
                      : 'OFFLINE'),
            ],
          ),
          const SizedBox(height: 6),
          Text(phone.isEmpty ? 'No phone' : phone),
          Text(
              'Deliveries today: ${rider['deliveries_today'] ?? rider['completed_today'] ?? 0}'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              _MiniAction(
                  'Call', Icons.call_rounded, () => _launch('tel:$phone')),
              _MiniAction(
                  'WhatsApp',
                  Icons.chat_rounded,
                  () => _launch(
                      'https://wa.me/${phone.replaceAll(RegExp(r'[^0-9]'), '')}')),
              _MiniAction('Location', Icons.location_on_rounded, () {
                final location = _asMap(rider['current_location']);
                final lat = location['latitude'];
                final lng = location['longitude'];
                if (lat != null && lng != null) {
                  _launch('https://maps.google.com/?q=$lat,$lng');
                }
              }),
            ],
          ),
        ],
      ),
    );
  }
}

class _InventoryCard extends ConsumerWidget {
  const _InventoryCard({required this.product});
  final Map<String, dynamic> product;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final variants = _list(product['variants']);
    final stock = _num(product['stock_qty'] ?? product['stock']).toInt();
    return _TapCard(
      onTap: () {},
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('${product['name'] ?? 'Product'}',
                    style: const TextStyle(fontWeight: FontWeight.w900)),
              ),
              _Pill((product['is_active'] ?? true) == true
                  ? 'ACTIVE'
                  : 'INACTIVE'),
            ],
          ),
          const SizedBox(height: 6),
          if (variants.isEmpty)
            Text('Stock: $stock')
          else
            ...variants.map((variant) => Text(
                '${variant['weight'] ?? 'Default'} = ${variant['stock_qty'] ?? variant['stock'] ?? 0}')),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _MiniAction('Increase', Icons.add_rounded,
                  () => _adjustStock(context, ref, product, 1)),
              _MiniAction('Decrease', Icons.remove_rounded,
                  () => _adjustStock(context, ref, product, -1)),
              _MiniAction('Price', Icons.edit_rounded,
                  () => _editPrice(context, ref, product)),
              _MiniAction(
                  (product['is_active'] ?? true) == true ? 'Disable' : 'Enable',
                  Icons.power_settings_new_rounded,
                  () => _toggleProduct(context, ref, product)),
            ],
          ),
        ],
      ),
    );
  }
}

class _AnnouncementCard extends ConsumerWidget {
  const _AnnouncementCard({required this.item});
  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final imageUrl = AppConfig.resolveMediaUrl('${item['image_url'] ?? ''}');
    return _TapCard(
      onTap: () => _showAnnouncementEditor(context, ref, item: item),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 76,
            height: 76,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(16),
            ),
            child: imageUrl.isEmpty
                ? const ProductPlaceholderImage(icon: Icons.campaign_rounded)
                : CachedNetworkImage(
                    imageUrl: imageUrl,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => const ProductPlaceholderImage(
                        icon: Icons.campaign_rounded),
                    errorWidget: (_, __, ___) => const ProductPlaceholderImage(
                        icon: Icons.campaign_rounded),
                  ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${item['title'] ?? 'Announcement'}',
                    style: const TextStyle(fontWeight: FontWeight.w900)),
                Text('${item['display_type'] ?? 'top_bar'}'),
                Text('${item['message'] ?? ''}',
                    maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    _MiniAction(
                        (item['is_active'] ?? true) == true
                            ? 'Deactivate'
                            : 'Activate',
                        Icons.toggle_on_rounded,
                        () => _toggleAnnouncement(ref, item)),
                    _MiniAction('Delete', Icons.delete_outline_rounded,
                        () => _deleteAnnouncement(context, ref, item)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CustomerCard extends StatelessWidget {
  const _CustomerCard({required this.customer});
  final Map<String, dynamic> customer;

  @override
  Widget build(BuildContext context) {
    return _TapCard(
      onTap: () {},
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${customer['name'] ?? customer['full_name'] ?? 'Customer'}',
              style: const TextStyle(fontWeight: FontWeight.w900)),
          Text('${customer['phone'] ?? ''}'),
          Text('${customer['email'] ?? ''}'),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                  child: Text(
                      'Orders: ${customer['orders_count'] ?? customer['total_orders'] ?? 0}')),
              Text(_money(_num(customer['total_spent'] ?? customer['revenue'])),
                  style: const TextStyle(fontWeight: FontWeight.w900)),
            ],
          ),
        ],
      ),
    );
  }
}

class _SimpleRow extends StatelessWidget {
  const _SimpleRow(
      {required this.title, required this.subtitle, required this.trailing});
  final String title;
  final String subtitle;
  final String trailing;

  @override
  Widget build(BuildContext context) {
    return _TapCard(
      onTap: () {},
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(fontWeight: FontWeight.w900)),
                Text(subtitle),
              ],
            ),
          ),
          Text(trailing, style: const TextStyle(fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}

Future<void> _showOrderDetails(
    BuildContext context, WidgetRef ref, Map<String, dynamic> order) async {
  final items = _list(order['items']);
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: .86,
      maxChildSize: .96,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        children: [
          Text('${order['order_code'] ?? 'Order'}',
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          _InfoLine('Customer', '${order['customer_name'] ?? ''}'),
          _InfoLine(
              'Phone', '${order['customer_phone'] ?? order['phone'] ?? ''}'),
          _InfoLine('Address', '${order['delivery_address'] ?? ''}'),
          _InfoLine('Payment',
              _label('${order['payment_status'] ?? order['status'] ?? ''}')),
          _InfoLine(
              'Amount', _money(_num(order['total_amount'] ?? order['total']))),
          const SizedBox(height: 12),
          _SectionTitle('Items'),
          for (final item in items)
            _InfoLine(
              _orderItemName(item),
              '${item['quantity'] ?? item['qty'] ?? 1} × ${_money(_num(item['price'] ?? item['unit_price']))}',
            ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _MiniAction('Confirm Payment', Icons.payments_rounded, () async {
                await ref
                    .read(adminRepositoryProvider)
                    .updateOrderStatus(_id(order), 'payment_confirmed');
                ref.invalidate(adminOrdersProvider);
                ref.invalidate(adminDispatchProvider);
                if (context.mounted) Navigator.pop(context);
              }),
              for (final status in const [
                'processing',
                'ready',
                'out_for_delivery',
                'delivered',
                'cancelled'
              ])
                _MiniAction(_label(status), Icons.sync_alt_rounded, () async {
                  await ref
                      .read(adminRepositoryProvider)
                      .updateOrderStatus(_id(order), status);
                  ref.invalidate(adminOrdersProvider);
                  if (context.mounted) Navigator.pop(context);
                }),
              _MiniAction('Assign Rider', Icons.delivery_dining_rounded,
                  () => _showAssignRider(context, ref, order)),
              _MiniAction('Invoice', Icons.receipt_rounded,
                  () => context.push('/tracking/${_id(order)}')),
            ],
          ),
        ],
      ),
    ),
  );
}

Future<void> _showAssignRider(
    BuildContext context, WidgetRef ref, Map<String, dynamic> order) async {
  final riders = await ref.read(adminRepositoryProvider).riders();
  if (!context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        children: [
          Text('Assign Rider',
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 12),
          for (final rider in riders)
            ListTile(
              leading: const CircleAvatar(
                  child: Icon(Icons.delivery_dining_rounded)),
              title: Text('${rider['full_name'] ?? rider['name'] ?? 'Rider'}'),
              subtitle: Text('${rider['phone'] ?? ''}'),
              onTap: () async {
                await ref
                    .read(adminRepositoryProvider)
                    .assignRider(_id(order), _id(rider));
                ref.invalidate(adminOrdersProvider);
                if (sheetContext.mounted) Navigator.pop(sheetContext);
              },
            ),
        ],
      ),
    ),
  );
}

Future<void> _adjustStock(BuildContext context, WidgetRef ref,
    Map<String, dynamic> product, int delta) async {
  final variants = _list(product['variants']);
  if (variants.isNotEmpty) {
    final next = variants
        .map((variant) => {
              ...variant,
              'stock_qty':
                  (_num(variant['stock_qty'] ?? variant['stock']) + delta)
                      .clamp(0, 999999)
                      .toInt(),
              'stock': (_num(variant['stock_qty'] ?? variant['stock']) + delta)
                  .clamp(0, 999999)
                  .toInt(),
            })
        .toList();
    await ref
        .read(adminRepositoryProvider)
        .updateProduct(_id(product), {'variants': next});
  } else {
    final stock = (_num(product['stock_qty'] ?? product['stock']) + delta)
        .clamp(0, 999999)
        .toInt();
    await ref
        .read(adminRepositoryProvider)
        .updateProduct(_id(product), {'stock_qty': stock, 'stock': stock});
  }
  ref.invalidate(adminInventoryProvider);
}

Future<void> _editPrice(
    BuildContext context, WidgetRef ref, Map<String, dynamic> product) async {
  final controller = TextEditingController(text: '${product['price'] ?? ''}');
  final value = await showDialog<double>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text('Edit ${product['name'] ?? 'price'}'),
      content: TextField(
        controller: controller,
        keyboardType: TextInputType.number,
        decoration: const InputDecoration(labelText: 'Price'),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel')),
        FilledButton(
          onPressed: () => Navigator.pop(
              context, double.tryParse(controller.text.trim()) ?? 0),
          child: const Text('Save'),
        ),
      ],
    ),
  );
  if (value == null) return;
  await ref
      .read(adminRepositoryProvider)
      .updateProduct(_id(product), {'price': value});
  ref.invalidate(adminInventoryProvider);
}

Future<void> _toggleProduct(
    BuildContext context, WidgetRef ref, Map<String, dynamic> product) async {
  await ref.read(adminRepositoryProvider).updateProduct(_id(product), {
    'is_active': !(product['is_active'] ?? true),
  });
  ref.invalidate(adminInventoryProvider);
}

Future<void> _showAnnouncementEditor(BuildContext context, WidgetRef ref,
    {Map<String, dynamic>? item}) async {
  final title = TextEditingController(text: '${item?['title'] ?? ''}');
  final message = TextEditingController(text: '${item?['message'] ?? ''}');
  String displayType = '${item?['display_type'] ?? 'top_bar'}';
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 8, 20, MediaQuery.of(context).viewInsets.bottom + 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(item == null ? 'Create Announcement' : 'Edit Announcement',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w900)),
            TextField(
                controller: title,
                decoration: const InputDecoration(labelText: 'Title')),
            TextField(
                controller: message,
                decoration: const InputDecoration(labelText: 'Message')),
            DropdownButtonFormField<String>(
              initialValue: displayType,
              items: const [
                DropdownMenuItem(
                    value: 'hero_banner', child: Text('Hero Banner')),
                DropdownMenuItem(
                    value: 'top_bar', child: Text('Homepage Announcement')),
                DropdownMenuItem(value: 'popup', child: Text('Promotion')),
              ],
              onChanged: (value) =>
                  setState(() => displayType = value ?? displayType),
              decoration: const InputDecoration(labelText: 'Type'),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    ),
  );
  if (saved != true) return;
  final payload = {
    'title': title.text.trim(),
    'message': message.text.trim(),
    'display_type': displayType,
    'is_active': item?['is_active'] ?? true,
  };
  if (item == null) {
    await ref.read(adminRepositoryProvider).createAnnouncement(payload);
  } else {
    await ref
        .read(adminRepositoryProvider)
        .updateAnnouncement(_id(item), payload);
  }
  ref.invalidate(adminAnnouncementsProvider);
}

Future<void> _toggleAnnouncement(
    WidgetRef ref, Map<String, dynamic> item) async {
  await ref.read(adminRepositoryProvider).updateAnnouncement(_id(item), {
    'is_active': !(item['is_active'] ?? true),
  });
  ref.invalidate(adminAnnouncementsProvider);
}

Future<void> _deleteAnnouncement(
    BuildContext context, WidgetRef ref, Map<String, dynamic> item) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Delete announcement?'),
      content: Text('${item['title'] ?? ''}'),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel')),
        FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete')),
      ],
    ),
  );
  if (confirmed != true) return;
  await ref.read(adminRepositoryProvider).deleteAnnouncement(_id(item));
  ref.invalidate(adminAnnouncementsProvider);
}

class _SearchField extends StatelessWidget {
  const _SearchField({required this.hint, required this.onChanged});
  final String hint;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      onChanged: onChanged,
      decoration: InputDecoration(
        prefixIcon: const Icon(Icons.search_rounded),
        hintText: hint,
      ),
    );
  }
}

class _StatusChips extends StatelessWidget {
  const _StatusChips(
      {required this.selected, required this.values, required this.onSelected});
  final String selected;
  final List<String> values;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final value in values)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(_label(value)),
                selected: selected == value,
                onSelected: (_) => onSelected(value),
              ),
            ),
        ],
      ),
    );
  }
}

class _AdminHero extends StatelessWidget {
  const _AdminHero(
      {required this.title, required this.subtitle, required this.icon});
  final String title;
  final String subtitle;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: FoodNovaColors.primary,
        borderRadius: BorderRadius.circular(26),
        boxShadow: FoodNovaShadows.soft,
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: scheme.secondary,
            foregroundColor: scheme.onSecondary,
            child: Icon(icon),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w900)),
                Text(subtitle,
                    style:
                        TextStyle(color: Colors.white.withValues(alpha: .82))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile(
      {required this.title, required this.icon, required this.onTap});
  final String title;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _TapCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: FoodNovaColors.primary),
          const Spacer(),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}

class _TapCard extends StatelessWidget {
  const _TapCard({required this.child, required this.onTap});
  final Widget child;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: _cardDecoration(context),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Padding(padding: const EdgeInsets.all(14), child: child),
      ),
    );
  }
}

class _MiniAction extends StatelessWidget {
  const _MiniAction(this.label, this.icon, this.onTap);
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      avatar: Icon(icon, size: 16),
      label: Text(label),
      onPressed: onTap,
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: FoodNovaColors.accent.withValues(alpha: .42),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label,
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
    );
  }
}

class _InfoLine extends StatelessWidget {
  const _InfoLine(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
              width: 96,
              child: Text(label,
                  style: const TextStyle(fontWeight: FontWeight.w800))),
          Expanded(child: Text(value.isEmpty ? 'N/A' : value)),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text,
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w900)),
      );
}

class _InlineEmpty extends StatelessWidget {
  const _InlineEmpty(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Center(child: Text(text)),
      );
}

class _InfoNotice extends StatelessWidget {
  const _InfoNotice({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _cardDecoration(context),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded, color: FoodNovaColors.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(fontWeight: FontWeight.w900)),
                const SizedBox(height: 4),
                Text(
                  message,
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    height: 1.35,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Metric {
  const _Metric(this.label, this.value, this.icon, {this.isText = false});
  final String label;
  final Object value;
  final IconData icon;
  final bool isText;
}

const _pagePadding = EdgeInsets.fromLTRB(20, 10, 20, 112);

Widget _loading() => const Center(child: CircularProgressIndicator());

Widget _error(Object error, StackTrace stack) => Padding(
      padding: const EdgeInsets.all(24),
      child: EmptyState(
        title: 'Admin data unavailable',
        message: apiMessage(error),
        icon: Icons.cloud_off_rounded,
      ),
    );

BoxDecoration _cardDecoration(BuildContext context) {
  final scheme = Theme.of(context).colorScheme;
  return BoxDecoration(
    color: scheme.surface,
    borderRadius: BorderRadius.circular(22),
    border: Border.all(color: scheme.outlineVariant),
    boxShadow: FoodNovaShadows.soft,
  );
}

Map<String, dynamic> _asMap(dynamic value) {
  if (value is Map) return Map<String, dynamic>.from(value);
  return <String, dynamic>{};
}

List<Map<String, dynamic>> _list(dynamic value) {
  if (value is List) {
    return value
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }
  if (value is Map && value['data'] is List) return _list(value['data']);
  return const [];
}

int _id(Map<String, dynamic> item) =>
    int.tryParse(
      '${item['id'] ?? item['order_id'] ?? item['orderId'] ?? item['rider_id'] ?? item['delivery_worker_id'] ?? item['worker_id'] ?? 0}',
    ) ??
    0;
num _num(dynamic value) => num.tryParse('$value') ?? 0;
String _money(num value) =>
    NumberFormat.currency(locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0)
        .format(value);
String _orderItemName(Map<String, dynamic> item) {
  final name = '${item['product_name'] ?? item['name'] ?? 'Item'}';
  final weight = '${item['variant_weight'] ?? item['weight'] ?? ''}'.trim();
  return weight.isEmpty ? name : '$name - $weight';
}

String _label(String value) => value
    .replaceAll('_', ' ')
    .split(' ')
    .where((p) => p.isNotEmpty)
    .map((p) => '${p[0].toUpperCase()}${p.substring(1)}')
    .join(' ');
String _statusOf(Map<String, dynamic> order) =>
    '${order['order_status'] ?? order['fulfillment_status'] ?? order['status'] ?? ''}'
        .toLowerCase();
DateTime? _date(dynamic value) => DateTime.tryParse('$value');
bool _sameDay(DateTime? a, DateTime b) =>
    a != null && a.year == b.year && a.month == b.month && a.day == b.day;
bool _isThisWeek(DateTime? date) =>
    date != null && DateTime.now().difference(date).inDays < 7;
num _sum(Iterable<Map<String, dynamic>> orders) => orders.fold<num>(
    0, (sum, order) => sum + _num(order['total_amount'] ?? order['total']));
int _countStatus(List<Map<String, dynamic>> orders, List<String> statuses) =>
    orders.where((order) => statuses.contains(_statusOf(order))).length;
num _todayRevenue(List<Map<String, dynamic>> days) => days
    .where((item) => _sameDay(_date(item['date']), DateTime.now()))
    .fold<num>(
        0,
        (sum, item) =>
            sum + _num(item['revenue'] ?? item['confirmed_revenue']));
num _weekRevenue(List<Map<String, dynamic>> days) =>
    days.where((item) => _isThisWeek(_date(item['date']))).fold<num>(
        0,
        (sum, item) =>
            sum + _num(item['revenue'] ?? item['confirmed_revenue']));

Future<void> _launch(String uri) async {
  final parsed = Uri.tryParse(uri);
  if (parsed == null) return;
  await launchUrl(parsed, mode: LaunchMode.externalApplication);
}
