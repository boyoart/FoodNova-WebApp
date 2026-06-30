import 'dart:async';
import 'dart:math' as math;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:open_filex/open_filex.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/app_config.dart';
import '../../../core/network/api_client.dart';
import '../../../shared/models/order.dart';
import '../../../services/notification_service.dart';
import '../../../services/realtime_service.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/primary_button.dart';
import '../../../widgets/skeleton_box.dart';
import '../../orders/data/orders_repository.dart';

final orderDetailProvider = FutureProvider.family<OrderSummary, int>((ref, id) {
  return ref.watch(ordersRepositoryProvider).order(id);
});

final riderLocationProvider =
    FutureProvider.family<RiderLocation?, int>((ref, id) {
  return ref.watch(ordersRepositoryProvider).riderLocation(id);
});

class TrackingScreen extends ConsumerStatefulWidget {
  const TrackingScreen({required this.orderId, super.key});

  final int orderId;

  @override
  ConsumerState<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends ConsumerState<TrackingScreen> {
  _ReceiptFile? _selectedReceipt;
  bool _uploading = false;
  double _progress = 0;
  Timer? _refreshTimer;
  StreamSubscription<void>? _pushRefreshSubscription;
  bool _subscribedRealtime = false;
  DateTime _lastSyncedAt = DateTime.now();

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_subscribeRealtime);
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 10),
      (_) => _refreshLiveOrder(),
    );
    _pushRefreshSubscription = NotificationService.refreshStream.listen((_) {
      _refreshLiveOrder();
    });
  }

  Future<void> _subscribeRealtime() async {
    if (_subscribedRealtime) return;
    _subscribedRealtime = true;
    await ref.read(realtimeServiceProvider).subscribeToOrder(widget.orderId,
        (_) {
      _refreshLiveOrder();
    });
  }

  void _refreshLiveOrder() {
    final order = ref.read(orderDetailProvider(widget.orderId)).valueOrNull;
    if (order?.isDelivered == true) {
      _refreshTimer?.cancel();
      ref.invalidate(orderDetailProvider(widget.orderId));
      ref.invalidate(ordersProvider);
      return;
    }
    ref.invalidate(orderDetailProvider(widget.orderId));
    if (order == null || order.isDeliveryTrackingVisible) {
      ref.invalidate(riderLocationProvider(widget.orderId));
    }
    ref.invalidate(ordersProvider);
    if (mounted) setState(() => _lastSyncedAt = DateTime.now());
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _pushRefreshSubscription?.cancel();
    super.dispose();
  }

  Future<void> _pickImage(ImageSource source) async {
    final file = await ImagePicker()
        .pickImage(source: source, imageQuality: 88, maxWidth: 1800);
    if (!mounted) return;
    if (file == null) return;
    setState(() {
      _selectedReceipt = _ReceiptFile(path: file.path, name: file.name);
      _progress = 0;
    });
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
      withData: false,
    );
    final file = result?.files.single;
    if (!mounted) return;
    if (file?.path == null) return;
    setState(() {
      _selectedReceipt = _ReceiptFile(path: file!.path!, name: file.name);
      _progress = 0;
    });
  }

  Future<void> _uploadReceipt() async {
    final receipt = _selectedReceipt;
    if (receipt == null) {
      _toast('Choose a receipt image or PDF first.');
      return;
    }
    if (!mounted) return;
    setState(() {
      _uploading = true;
      _progress = .18;
    });
    try {
      await Future<void>.delayed(const Duration(milliseconds: 160));
      if (!mounted) return;
      setState(() => _progress = .62);
      final repository = ref.read(ordersRepositoryProvider);
      await repository.uploadReceipt(widget.orderId, receipt.path);
      if (!mounted) return;
      setState(() {
        _progress = 1;
        _selectedReceipt = null;
      });
      ref.invalidate(orderDetailProvider(widget.orderId));
      ref.invalidate(ordersProvider);
      _toast('Receipt uploaded. FoodNova will review your payment.');
    } catch (error) {
      _toast('Receipt upload failed: $error');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _callRider(OrderSummary order) async {
    final phone = order.riderPhone.trim();
    if (phone.isEmpty) return;
    await launchUrl(Uri(scheme: 'tel', path: phone));
  }

  Future<void> _messageRider(OrderSummary order) async {
    final digits = order.riderPhone.replaceAll(RegExp(r'[^0-9+]'), '');
    if (digits.isEmpty) return;
    final appUri = Uri.parse('whatsapp://send?phone=$digits');
    if (await canLaunchUrl(appUri)) {
      await launchUrl(appUri, mode: LaunchMode.externalApplication);
      return;
    }
    final webDigits = digits.startsWith('+') ? digits.substring(1) : digits;
    await launchUrl(
      Uri.parse('https://wa.me/$webDigits'),
      mode: LaunchMode.externalApplication,
    );
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(orderDetailProvider(widget.orderId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Order details'),
      ),
      bottomNavigationBar: state.maybeWhen(
        data: (order) => _BottomActionBar(
          order: order,
          onCallRider: () => _callRider(order),
          onMessageRider: () => _messageRider(order),
          onTrackOrder: _refreshLiveOrder,
        ),
        orElse: () => null,
      ),
      body: state.when(
        loading: () => const _OrderSkeleton(),
        error: (error, _) => Padding(
          padding: const EdgeInsets.all(24),
          child: EmptyState(
            title: 'Order unavailable',
            message: error.toString(),
            icon: Icons.wifi_off_rounded,
          ),
        ),
        data: (order) {
          final riderLocation = ref.watch(riderLocationProvider(order.id));
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(orderDetailProvider(order.id));
              ref.invalidate(riderLocationProvider(order.id));
            },
            child: _OrderDetailsView(
              order: order,
              riderLocation: riderLocation,
              selectedReceipt: _selectedReceipt,
              uploading: _uploading,
              uploadProgress: _progress,
              lastSyncedAt: _lastSyncedAt,
              onPickCamera: () => _pickImage(ImageSource.camera),
              onPickGallery: () => _pickImage(ImageSource.gallery),
              onPickFile: _pickFile,
              onUpload: _uploadReceipt,
              onCancel: () => _showCancelRequestSheet(context, ref, order),
              onCallRider: () => _callRider(order),
              onMessageRider: () => _messageRider(order),
            ),
          );
        },
      ),
    );
  }
}

class _ReceiptFile {
  const _ReceiptFile({required this.path, required this.name});

  final String path;
  final String name;
}

class _OrderSkeleton extends StatelessWidget {
  const _OrderSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.all(20),
      child: Column(
        children: [
          SkeletonBox(height: 132, radius: 24),
          SizedBox(height: 14),
          SkeletonBox(height: 240, radius: 24),
          SizedBox(height: 14),
          SkeletonBox(height: 180, radius: 24),
        ],
      ),
    );
  }
}

class _OrderDetailsView extends StatelessWidget {
  const _OrderDetailsView({
    required this.order,
    required this.riderLocation,
    required this.selectedReceipt,
    required this.uploading,
    required this.uploadProgress,
    required this.lastSyncedAt,
    required this.onPickCamera,
    required this.onPickGallery,
    required this.onPickFile,
    required this.onUpload,
    required this.onCancel,
    required this.onCallRider,
    required this.onMessageRider,
  });

  final OrderSummary order;
  final AsyncValue<RiderLocation?> riderLocation;
  final _ReceiptFile? selectedReceipt;
  final bool uploading;
  final double uploadProgress;
  final DateTime lastSyncedAt;
  final VoidCallback onPickCamera;
  final VoidCallback onPickGallery;
  final VoidCallback onPickFile;
  final VoidCallback onUpload;
  final VoidCallback onCancel;
  final VoidCallback onCallRider;
  final VoidCallback onMessageRider;

  @override
  Widget build(BuildContext context) {
    final currency = NumberFormat.currency(
      locale: 'en_NG',
      symbol: 'NGN ',
      decimalDigits: 0,
    );
    final showTracking = order.isDeliveryTrackingVisible;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 118),
      children: [
        _HeroSummaryCard(
          order: order,
          amount: currency.format(order.totalAmount),
          lastSyncedAt: lastSyncedAt,
        ),
        const SizedBox(height: 14),
        _ProgressTrackerCard(order: order),
        const SizedBox(height: 14),
        _PaymentCard(order: order),
        const SizedBox(height: 14),
        _ProductListCard(order: order, currency: currency),
        const SizedBox(height: 14),
        _ReceiptCard(
          selectedReceipt: selectedReceipt,
          uploading: uploading,
          progress: uploadProgress,
          onPickCamera: onPickCamera,
          onPickGallery: onPickGallery,
          onPickFile: onPickFile,
          onUpload: onUpload,
        ),
        const SizedBox(height: 14),
        _RiderInformationCard(
          order: order,
          onCallRider: onCallRider,
          onMessageRider: onMessageRider,
        ),
        if (showTracking) ...[
          const SizedBox(height: 14),
          _RiderTrackingCard(
            order: order,
            location: riderLocation,
          ),
        ],
        const SizedBox(height: 14),
        _VerificationCard(
          order: order,
          highlight: order.riderArrived,
        ),
        const SizedBox(height: 14),
        _InvoiceCard(order: order),
        const SizedBox(height: 14),
        _CancellationCard(order: order, onCancel: onCancel),
      ],
    );
  }
}

class _HeroSummaryCard extends StatefulWidget {
  const _HeroSummaryCard({
    required this.order,
    required this.amount,
    required this.lastSyncedAt,
  });

  final OrderSummary order;
  final String amount;
  final DateTime lastSyncedAt;

  @override
  State<_HeroSummaryCard> createState() => _HeroSummaryCardState();
}

class _HeroSummaryCardState extends State<_HeroSummaryCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final order = widget.order;
    final address = order.deliveryAddress.trim();
    final status = _dispatchStatusLabel(order);
    return Semantics(
      container: true,
      label: 'Order summary for ${order.orderCode}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  scheme.primary,
                  Color.lerp(scheme.primary, scheme.tertiary, .35)!,
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(28),
              boxShadow: [
                BoxShadow(
                  color: scheme.primary.withValues(alpha: .22),
                  blurRadius: 28,
                  offset: const Offset(0, 14),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        order.orderCode.isEmpty
                            ? 'FoodNova order'
                            : order.orderCode,
                        style:
                            Theme.of(context).textTheme.headlineSmall?.copyWith(
                                  color: scheme.onPrimary,
                                  fontWeight: FontWeight.w900,
                                ),
                      ),
                    ),
                    _SyncPill(lastSyncedAt: widget.lastSyncedAt),
                  ],
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _HeroPill(label: status, icon: Icons.local_shipping),
                    _HeroPill(
                      label: order.estimatedDeliveryTime.trim().isEmpty
                          ? 'ETA updating'
                          : 'ETA ${order.estimatedDeliveryTime}',
                      icon: Icons.schedule_rounded,
                    ),
                    _HeroPill(label: widget.amount, icon: Icons.payments),
                  ],
                ),
                const SizedBox(height: 18),
                InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: address.isEmpty
                      ? null
                      : () => setState(() => _expanded = !_expanded),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: scheme.onPrimary.withValues(alpha: .12),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: scheme.onPrimary.withValues(alpha: .18),
                      ),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.location_on_rounded,
                            color: scheme.onPrimary, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: AnimatedSize(
                            duration: const Duration(milliseconds: 220),
                            curve: Curves.easeOutCubic,
                            child: Text(
                              address.isEmpty
                                  ? 'Delivery address syncing'
                                  : address,
                              maxLines: _expanded ? null : 2,
                              overflow: _expanded
                                  ? TextOverflow.visible
                                  : TextOverflow.ellipsis,
                              style: TextStyle(
                                color: scheme.onPrimary,
                                fontWeight: FontWeight.w800,
                                height: 1.35,
                              ),
                            ),
                          ),
                        ),
                        if (address.isNotEmpty)
                          Icon(
                            _expanded
                                ? Icons.expand_less_rounded
                                : Icons.expand_more_rounded,
                            color: scheme.onPrimary,
                          ),
                      ],
                    ),
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

class _ProgressTrackerCard extends StatelessWidget {
  const _ProgressTrackerCard({required this.order});

  final OrderSummary order;

  @override
  Widget build(BuildContext context) {
    final steps = [
      _Step('Placed', Icons.receipt_long_rounded, order.createdAt),
      _Step('Confirmed', Icons.verified_rounded, order.confirmedAt),
      _Step('Preparing', Icons.restaurant_rounded, order.preparingAt),
      _Step(
        'Picked Up',
        Icons.shopping_bag_rounded,
        order.pickedUpAt.isEmpty ? order.readyForPickupAt : order.pickedUpAt,
      ),
      _Step(
        'Out for Delivery',
        Icons.delivery_dining_rounded,
        order.outForDeliveryAt,
      ),
      _Step('Delivered', Icons.check_circle_rounded, order.deliveryConfirmedAt),
    ];
    final active = _activeIndex(order);
    return _Card(
      title: 'Delivery progress',
      icon: Icons.timeline_rounded,
      trailing: AnimatedSwitcher(
        duration: const Duration(milliseconds: 240),
        child: _Chip(
          key: ValueKey(active),
          label: steps[active.clamp(0, steps.length - 1)].label,
          compact: true,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (var i = 0; i < steps.length; i++)
                  _ProgressStep(
                    step: steps[i],
                    completed: i <= active,
                    current: i == active,
                    showLine: i != steps.length - 1,
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const _MutedText(
            'Timestamps appear as each delivery milestone is confirmed.',
          ),
        ],
      ),
    );
  }
}

class _ProgressStep extends StatelessWidget {
  const _ProgressStep({
    required this.step,
    required this.completed,
    required this.current,
    required this.showLine,
  });

  final _Step step;
  final bool completed;
  final bool current;
  final bool showLine;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      width: showLine ? 136 : 92,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              TweenAnimationBuilder<double>(
                tween: Tween(begin: .96, end: current ? 1.08 : 1),
                duration: const Duration(milliseconds: 620),
                curve: Curves.easeInOut,
                builder: (context, scale, child) =>
                    Transform.scale(scale: scale, child: child),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 320),
                  curve: Curves.easeOutCubic,
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: completed
                        ? scheme.primary
                        : scheme.surfaceContainerHighest,
                    boxShadow: current
                        ? [
                            BoxShadow(
                              color: scheme.primary.withValues(alpha: .28),
                              blurRadius: 18,
                              spreadRadius: 2,
                            ),
                          ]
                        : null,
                  ),
                  child: Icon(
                    completed ? step.icon : Icons.circle_outlined,
                    color:
                        completed ? scheme.onPrimary : scheme.onSurfaceVariant,
                    size: 20,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: 84,
                child: Text(
                  step.label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color:
                        completed ? scheme.onSurface : scheme.onSurfaceVariant,
                    fontWeight: completed ? FontWeight.w900 : FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
              const SizedBox(height: 4),
              SizedBox(
                width: 84,
                child: Text(
                  completed
                      ? _timelineTimeLabel(step.timestamp, current)
                      : 'Pending',
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          if (showLine)
            Expanded(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 320),
                curve: Curves.easeOutCubic,
                margin: const EdgeInsets.only(top: 20),
                height: 4,
                decoration: BoxDecoration(
                  color: completed ? scheme.primary : scheme.outlineVariant,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PaymentCard extends StatelessWidget {
  const _PaymentCard({required this.order});

  final OrderSummary order;

  @override
  Widget build(BuildContext context) {
    final currency = NumberFormat.currency(
      locale: 'en_NG',
      symbol: 'NGN ',
      decimalDigits: 0,
    );
    return _Card(
      title: order.paymentConfirmed ? 'Payment summary' : 'Bank transfer',
      icon: Icons.account_balance_rounded,
      trailing: _Chip(label: _labelize(order.paymentStatus), compact: true),
      child: Column(
        children: [
          if (order.paymentConfirmed) ...[
            _InfoRow(
                label: 'Amount paid',
                value: currency.format(order.totalAmount)),
            const SizedBox(height: 8),
            _InfoRow(label: 'Reference', value: order.orderCode),
            const SizedBox(height: 8),
            const _InfoRow(label: 'Method', value: 'Bank transfer'),
            const SizedBox(height: 12),
            const _MutedText(
              'Payment is confirmed. Bank account details are hidden for this completed payment step.',
            ),
          ] else ...[
            _CopyRow(label: 'Account number', value: '6427173992'),
            const SizedBox(height: 8),
            const _InfoRow(label: 'Bank', value: 'OPay'),
            const SizedBox(height: 8),
            const _InfoRow(label: 'Account name', value: 'FOODNOVA LIMITED'),
            const SizedBox(height: 8),
            _CopyRow(label: 'Reference', value: order.orderCode),
            const SizedBox(height: 12),
            const _MutedText(
              'Transfer the order amount, use your order code as reference, then upload your receipt for admin verification.',
            ),
          ],
        ],
      ),
    );
  }
}

class _ProductListCard extends StatelessWidget {
  const _ProductListCard({required this.order, required this.currency});

  final OrderSummary order;
  final NumberFormat currency;

  @override
  Widget build(BuildContext context) {
    final items = order.items;
    return _Card(
      title: 'Products',
      icon: Icons.shopping_bag_rounded,
      child: Column(
        children: [
          if (items.isEmpty)
            const _MutedText('Product details are syncing for this order.')
          else
            for (var i = 0; i < items.length; i++) ...[
              _ProductTile(item: items[i], currency: currency),
              if (i != items.length - 1) const SizedBox(height: 10),
            ],
        ],
      ),
    );
  }
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({required this.item, required this.currency});

  final Map<String, dynamic> item;
  final NumberFormat currency;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final name = '${item['name'] ?? item['product_name'] ?? 'FoodNova Item'}';
    final quantity =
        int.tryParse('${item['quantity'] ?? item['qty'] ?? 1}') ?? 1;
    final price =
        double.tryParse('${item['unit_price'] ?? item['price'] ?? 0}') ?? 0;
    final subtotal = double.tryParse(
            '${item['line_total'] ?? item['subtotal'] ?? price * quantity}') ??
        price * quantity;
    final imageUrl =
        '${item['image_url'] ?? item['image'] ?? item['thumbnail'] ?? item['photo_url'] ?? ''}'
            .trim();
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: SizedBox(
              width: 58,
              height: 58,
              child: imageUrl.isEmpty
                  ? Image.asset('assets/images/product_placeholder.png',
                      fit: BoxFit.cover)
                  : Image.network(
                      imageUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Image.asset(
                        'assets/images/product_placeholder.png',
                        fit: BoxFit.cover,
                      ),
                    ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 5),
                Text(
                  '$quantity x ${currency.format(price)}',
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            currency.format(subtotal),
            textAlign: TextAlign.right,
            style: TextStyle(
              color: scheme.primary,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _ReceiptCard extends StatelessWidget {
  const _ReceiptCard({
    required this.selectedReceipt,
    required this.uploading,
    required this.progress,
    required this.onPickCamera,
    required this.onPickGallery,
    required this.onPickFile,
    required this.onUpload,
  });

  final _ReceiptFile? selectedReceipt;
  final bool uploading;
  final double progress;
  final VoidCallback onPickCamera;
  final VoidCallback onPickGallery;
  final VoidCallback onPickFile;
  final VoidCallback onUpload;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return _Card(
      title: 'Upload receipt',
      icon: Icons.upload_file_rounded,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: scheme.outlineVariant),
            ),
            child: Column(
              children: [
                Icon(Icons.cloud_upload_rounded,
                    color: scheme.primary, size: 34),
                const SizedBox(height: 8),
                Text(
                  selectedReceipt?.name ??
                      'Choose a clear JPG, PNG, WEBP, or PDF receipt',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: scheme.onSurface,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                _MutedText('Camera, gallery, and PDF files are supported.'),
              ],
            ),
          ),
          if (uploading) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: progress.clamp(0, 1),
                minHeight: 8,
              ),
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: uploading ? null : onPickCamera,
                  icon: const Icon(Icons.photo_camera_rounded),
                  label: const Text('Camera'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: uploading ? null : onPickGallery,
                  icon: const Icon(Icons.photo_library_rounded),
                  label: const Text('Gallery'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: uploading ? null : onPickFile,
            icon: const Icon(Icons.picture_as_pdf_rounded),
            label: const Text('Choose PDF / image'),
          ),
          const SizedBox(height: 12),
          PrimaryButton(
            label: uploading ? 'Uploading...' : 'Submit receipt',
            icon: Icons.upload_file_rounded,
            loading: uploading,
            onPressed: uploading ? null : onUpload,
          ),
        ],
      ),
    );
  }
}

class _RiderInformationCard extends StatelessWidget {
  const _RiderInformationCard({
    required this.order,
    required this.onCallRider,
    required this.onMessageRider,
  });

  final OrderSummary order;
  final VoidCallback onCallRider;
  final VoidCallback onMessageRider;

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: 'Rider information',
      icon: Icons.delivery_dining_rounded,
      child: Column(
        children: [
          if (order.hasAssignedRider)
            _RiderProfileTile(
              name: order.riderName,
              phone: order.riderPhone,
              photoUrl: order.riderPhotoUrl,
              vehicleType: order.riderVehicleType,
              riderId: order.riderDisplayId,
              rating: order.riderRatingText,
              onCallRider: onCallRider,
              onMessageRider: onMessageRider,
            )
          else
            const _MutedText(
              'Rider details will appear here once FoodNova assigns your delivery partner.',
            ),
          if (order.deliveryNotes.isNotEmpty) ...[
            const SizedBox(height: 10),
            _InfoRow(label: 'Notes', value: order.deliveryNotes),
          ],
        ],
      ),
    );
  }
}

class _RiderTrackingCard extends StatelessWidget {
  const _RiderTrackingCard({
    required this.order,
    required this.location,
  });

  final OrderSummary order;
  final AsyncValue<RiderLocation?> location;

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: order.riderArrived ? 'Rider has arrived' : 'Track Rider',
      icon: order.riderArrived
          ? Icons.delivery_dining_rounded
          : Icons.map_rounded,
      child: location.when(
        loading: () => const SizedBox(
          height: 220,
          child: Center(child: CircularProgressIndicator()),
        ),
        error: (error, _) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: const [
            _MutedText('Rider tracking temporarily unavailable.'),
          ],
        ),
        data: (data) {
          if (data == null || !data.trackingVisible) {
            return const _MutedText(
              'Tracking will appear when your rider picks up the order.',
            );
          }
          if (!data.trackingAvailable ||
              !data.hasRiderCoordinates ||
              !data.hasCustomerCoordinates) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: const [
                _MutedText(
                  'Live map will appear when rider and destination coordinates are available.',
                ),
              ],
            );
          }
          final riderPoint = data.hasRiderCoordinates
              ? LatLng(data.riderLatitude!, data.riderLongitude!)
              : null;
          final customerPoint = data.hasCustomerCoordinates
              ? LatLng(data.customerLatitude!, data.customerLongitude!)
              : null;
          final routePoints = data.routePolyline
              .map((point) => LatLng(point['latitude']!, point['longitude']!))
              .toList();
          if (routePoints.length < 2) {
            routePoints
              ..clear()
              ..add(riderPoint!)
              ..add(customerPoint!);
          }
          debugPrint(
            'TRACK_RIDER_RENDER rider=${data.riderLatitude},${data.riderLongitude} '
            'customer=${data.customerLatitude},${data.customerLongitude} '
            'distance=${data.distanceMeters} eta=${data.etaMinutes}',
          );

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (order.riderArrived) ...[
                Text(
                  'Rider has arrived',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                const _MutedText(
                  'Meet your rider and use the delivery PIN card below to confirm delivery.',
                ),
                const SizedBox(height: 12),
              ],
              _RiderProfileTile(
                name: data.riderName.isEmpty ? order.riderName : data.riderName,
                phone: data.riderPhone.isEmpty
                    ? order.riderPhone
                    : data.riderPhone,
                photoUrl: data.riderPhotoUrl.isEmpty
                    ? order.riderPhotoUrl
                    : data.riderPhotoUrl,
                vehicleType: data.vehicleType.isEmpty
                    ? order.riderVehicleType
                    : data.vehicleType,
                riderId: order.riderDisplayId,
                rating: order.riderRatingText,
                onCallRider: null,
                onMessageRider: null,
              ),
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(18),
                child: SizedBox(
                  height: 240,
                  child: _TrackingMap(
                    riderPoint: riderPoint!,
                    customerPoint: customerPoint!,
                    routePoints: routePoints,
                    riderName: data.riderName,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              _InfoRow(
                label: 'Distance remaining',
                value: _formatDistance(data.distanceMeters),
              ),
              const SizedBox(height: 8),
              _InfoRow(
                label: 'ETA',
                value: data.etaMinutes == null &&
                        order.estimatedDeliveryTime.trim().isNotEmpty
                    ? order.estimatedDeliveryTime
                    : _formatEta(data.etaMinutes),
              ),
              const SizedBox(height: 8),
              _InfoRow(
                label: 'Last updated',
                value: _formatRelativeTime(data.lastUpdatedAt),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _RiderProfileTile extends StatelessWidget {
  const _RiderProfileTile({
    required this.name,
    required this.phone,
    required this.photoUrl,
    required this.vehicleType,
    required this.riderId,
    required this.rating,
    required this.onCallRider,
    required this.onMessageRider,
  });

  final String name;
  final String phone;
  final String photoUrl;
  final String vehicleType;
  final String riderId;
  final String rating;
  final VoidCallback? onCallRider;
  final VoidCallback? onMessageRider;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final displayName = name.trim().isEmpty ? 'FoodNova rider' : name.trim();
    final displayPhone = phone.trim().isEmpty ? 'Phone pending' : phone.trim();
    final displayVehicle = vehicleType.trim().isEmpty
        ? 'Delivery partner'
        : _labelize(vehicleType);
    final canContact = phone.trim().isNotEmpty;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: .5)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: .05),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _RiderAvatar(photoUrl: photoUrl, name: displayName),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: scheme.onSurface,
                              fontWeight: FontWeight.w900,
                              fontSize: 16,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        _RatingChip(rating: rating),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      'Rider ID: $riderId',
                      style: TextStyle(
                        color: scheme.onSurfaceVariant,
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        _WorkerBadge(displayVehicle),
                        if (displayPhone != 'Phone pending')
                          Text(
                            displayPhone,
                            style: TextStyle(
                              color: scheme.onSurfaceVariant,
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (onCallRider != null || onMessageRider != null) ...[
            const SizedBox(height: 14),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _RiderActionButton(
                  icon: Icons.phone_rounded,
                  label: 'Call',
                  onPressed: canContact ? onCallRider : null,
                ),
                const SizedBox(width: 18),
                _RiderActionButton(
                  icon: Icons.chat_bubble_outline_rounded,
                  label: 'Message',
                  onPressed: canContact ? onMessageRider : null,
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _RatingChip extends StatelessWidget {
  const _RatingChip({required this.rating});

  final String rating;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.star_rounded, color: scheme.primary, size: 17),
        const SizedBox(width: 3),
        Text(
          rating,
          style: TextStyle(
            color: scheme.onSurface,
            fontWeight: FontWeight.w900,
            fontSize: 13,
          ),
        ),
      ],
    );
  }
}

class _WorkerBadge extends StatelessWidget {
  const _WorkerBadge(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: scheme.primaryContainer.withValues(alpha: .6),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: scheme.primary,
          fontSize: 11,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _RiderActionButton extends StatelessWidget {
  const _RiderActionButton({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        IconButton.filledTonal(
          onPressed: onPressed,
          icon: Icon(icon),
          style: IconButton.styleFrom(
            fixedSize: const Size(48, 48),
            backgroundColor: scheme.primaryContainer.withValues(alpha: .42),
            foregroundColor: scheme.primary,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(
            color: scheme.onSurface,
            fontSize: 12,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

class _RiderAvatar extends StatelessWidget {
  const _RiderAvatar({required this.photoUrl, required this.name});

  final String photoUrl;
  final String name;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final initials = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .take(2)
        .map((part) => part[0].toUpperCase())
        .join();
    return CircleAvatar(
      radius: 30,
      backgroundColor: scheme.primary,
      foregroundColor: scheme.onPrimary,
      backgroundImage: photoUrl.trim().isEmpty
          ? null
          : NetworkImage(AppConfig.resolveMediaUrl(photoUrl.trim())),
      child: photoUrl.trim().isEmpty
          ? Text(
              initials.isEmpty ? 'FN' : initials,
              style: const TextStyle(fontWeight: FontWeight.w900),
            )
          : null,
    );
  }
}

class _TrackingMap extends StatefulWidget {
  const _TrackingMap({
    required this.riderPoint,
    required this.customerPoint,
    required this.routePoints,
    required this.riderName,
  });

  final LatLng riderPoint;
  final LatLng customerPoint;
  final List<LatLng> routePoints;
  final String riderName;

  @override
  State<_TrackingMap> createState() => _TrackingMapState();
}

class _TrackingMapState extends State<_TrackingMap> {
  GoogleMapController? _controller;

  @override
  void didUpdateWidget(covariant _TrackingMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.riderPoint != widget.riderPoint ||
        oldWidget.customerPoint != widget.customerPoint) {
      _fitBounds();
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _fitBounds() async {
    final controller = _controller;
    if (controller == null) return;
    final south =
        math.min(widget.riderPoint.latitude, widget.customerPoint.latitude);
    final west =
        math.min(widget.riderPoint.longitude, widget.customerPoint.longitude);
    final north =
        math.max(widget.riderPoint.latitude, widget.customerPoint.latitude);
    final east =
        math.max(widget.riderPoint.longitude, widget.customerPoint.longitude);
    await Future<void>.delayed(const Duration(milliseconds: 150));
    if (!mounted) return;
    try {
      if ((north - south).abs() < 0.0001 && (east - west).abs() < 0.0001) {
        await controller.animateCamera(
          CameraUpdate.newCameraPosition(
            CameraPosition(target: widget.riderPoint, zoom: 16),
          ),
        );
        return;
      }
      await controller.animateCamera(
        CameraUpdate.newLatLngBounds(
          LatLngBounds(
            southwest: LatLng(south, west),
            northeast: LatLng(north, east),
          ),
          56,
        ),
      );
    } catch (error) {
      debugPrint('TRACK_RIDER_MAP_FIT_ERROR $error');
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final markers = {
      Marker(
        markerId: const MarkerId('rider'),
        position: widget.riderPoint,
        infoWindow: InfoWindow(
          title: widget.riderName.isEmpty ? 'Rider' : widget.riderName,
        ),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
      ),
      Marker(
        markerId: const MarkerId('customer'),
        position: widget.customerPoint,
        infoWindow: const InfoWindow(title: 'Delivery address'),
      ),
    };
    final polylines = {
      Polyline(
        polylineId: const PolylineId('route'),
        points: widget.routePoints,
        width: 5,
        color: scheme.primary,
      ),
    };
    return GoogleMap(
      initialCameraPosition:
          CameraPosition(target: widget.riderPoint, zoom: 13),
      markers: markers,
      polylines: polylines,
      zoomControlsEnabled: false,
      myLocationButtonEnabled: false,
      onMapCreated: (controller) {
        _controller = controller;
        _fitBounds();
      },
    );
  }
}

class _VerificationCard extends StatelessWidget {
  const _VerificationCard({
    required this.order,
    required this.highlight,
  });

  final OrderSummary order;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final delivered = order.isDelivered;
    final arrived = order.riderArrived;
    return _Card(
      title: delivered ? 'Delivered' : 'Delivery Verification',
      icon: delivered ? Icons.verified_rounded : Icons.password_rounded,
      highlighted: highlight && !delivered,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (delivered) ...[
            const _SuccessBurst(),
            const SizedBox(height: 12),
            Text(
              'Delivered',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 6),
            const _MutedText(
              'Rate your delivery and leave optional feedback to help us improve the experience.',
            ),
            const SizedBox(height: 14),
            const _RatingPrompt(),
            if ((order.deliveryConfirmedAt.isNotEmpty ||
                order.deliveryCompletedAt.isNotEmpty)) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: scheme.primaryContainer,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  'Delivered on: ${_timelineTimeLabel(order.deliveryConfirmedAt.isNotEmpty ? order.deliveryConfirmedAt : order.deliveryCompletedAt, false)}',
                  style: TextStyle(
                    color: scheme.onPrimaryContainer,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ] else if (arrived) ...[
            Text(
              'Your rider has arrived.',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            const _MutedText(
              'After you have received your items, tell your rider the PIN below.',
            ),
            const SizedBox(height: 8),
            Text(
              'Never share this PIN before receiving your order.',
              style: TextStyle(
                color: scheme.error,
                fontWeight: FontWeight.w900,
              ),
            ),
            if (order.deliveryPin.trim().isNotEmpty) ...[
              const SizedBox(height: 14),
              _PinDisplay(pin: order.deliveryPin.trim()),
              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: order.deliveryPin));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Delivery PIN copied')),
                  );
                },
                icon: const Icon(Icons.copy_rounded),
                label: const Text('Copy PIN'),
              ),
            ] else ...[
              const SizedBox(height: 12),
              const _MutedText('PIN is being generated. Please wait a moment.'),
            ],
          ] else ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_rounded, color: scheme.primary),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: _MutedText(
                      'Your delivery PIN will become available once your rider arrives.',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _PinDisplay extends StatelessWidget {
  const _PinDisplay({required this.pin});

  final String pin;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: 'Delivery PIN is $pin',
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (final digit in pin.split('').take(4)) ...[
            Container(
              width: 46,
              height: 52,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: scheme.primaryContainer,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: scheme.primary.withValues(alpha: .2)),
              ),
              child: Text(
                digit,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: scheme.onPrimaryContainer,
                      fontWeight: FontWeight.w900,
                    ),
              ),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _SuccessBurst extends StatelessWidget {
  const _SuccessBurst();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: .75, end: 1),
      duration: const Duration(milliseconds: 620),
      curve: Curves.elasticOut,
      builder: (context, value, child) =>
          Transform.scale(scale: value, child: child),
      child: Container(
        width: 82,
        height: 82,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: scheme.primaryContainer,
          boxShadow: [
            BoxShadow(
              color: scheme.primary.withValues(alpha: .25),
              blurRadius: 24,
              spreadRadius: 4,
            ),
          ],
        ),
        child: Icon(Icons.check_rounded, color: scheme.primary, size: 46),
      ),
    );
  }
}

class _RatingPrompt extends StatefulWidget {
  const _RatingPrompt();

  @override
  State<_RatingPrompt> createState() => _RatingPromptState();
}

class _RatingPromptState extends State<_RatingPrompt> {
  int _rating = 0;
  final _feedback = TextEditingController();

  @override
  void dispose() {
    _feedback.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var i = 1; i <= 5; i++)
              IconButton(
                tooltip: '$i star${i == 1 ? '' : 's'}',
                onPressed: () => setState(() => _rating = i),
                icon: Icon(
                  i <= _rating ? Icons.star_rounded : Icons.star_border_rounded,
                  color: scheme.primary,
                ),
              ),
          ],
        ),
        TextField(
          controller: _feedback,
          minLines: 2,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Optional feedback',
            hintText: 'Tell us how the delivery went',
          ),
        ),
      ],
    );
  }
}

class _InvoiceCard extends ConsumerStatefulWidget {
  const _InvoiceCard({required this.order});

  final OrderSummary order;

  @override
  ConsumerState<_InvoiceCard> createState() => _InvoiceCardState();
}

class _InvoiceCardState extends ConsumerState<_InvoiceCard> {
  bool _viewing = false;
  bool _downloading = false;
  bool _sharing = false;

  Future<InvoiceFile> _download({required bool forceRefresh}) {
    return ref
        .read(ordersRepositoryProvider)
        .invoicePdf(widget.order, forceRefresh: forceRefresh);
  }

  Future<void> _viewInvoice() async {
    setState(() => _viewing = true);
    try {
      final invoice = await _download(forceRefresh: false);
      final result = await OpenFilex.open(
        invoice.path,
        type: 'application/pdf',
      );
      if (!mounted) return;
      if (result.type != ResultType.done) {
        _showInvoiceMessage(result.message);
      }
    } catch (error) {
      if (!mounted) return;
      _showInvoiceMessage(apiMessage(error));
    } finally {
      if (mounted) setState(() => _viewing = false);
    }
  }

  Future<void> _downloadInvoice() async {
    setState(() => _downloading = true);
    try {
      final invoice = await _download(forceRefresh: true);
      if (!mounted) return;
      _showInvoiceMessage(
        invoice.fromCache
            ? 'Offline invoice is ready.'
            : 'Invoice downloaded for offline viewing.',
      );
    } catch (error) {
      if (!mounted) return;
      _showInvoiceMessage(apiMessage(error));
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  Future<void> _shareInvoice() async {
    setState(() => _sharing = true);
    try {
      final invoice = await _download(forceRefresh: false);
      await Share.shareXFiles(
        [XFile(invoice.path, mimeType: 'application/pdf')],
        subject: 'FoodNova invoice ${widget.order.orderCode}',
        text: 'FoodNova invoice ${widget.order.orderCode}',
      );
    } catch (error) {
      if (!mounted) return;
      _showInvoiceMessage(apiMessage(error));
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  void _showInvoiceMessage(String message) {
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final busy = _viewing || _downloading || _sharing;
    return _Card(
      title: 'Invoice',
      icon: Icons.description_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PrimaryButton(
            label: _viewing ? 'Opening...' : 'View Invoice',
            icon: Icons.picture_as_pdf_rounded,
            loading: _viewing,
            onPressed: busy ? null : _viewInvoice,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: busy ? null : _downloadInvoice,
                  icon: _downloading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.download_rounded),
                  label: const Text('Download'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: busy ? null : _shareInvoice,
                  icon: _sharing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.ios_share_rounded),
                  label: const Text('Share'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const _MutedText(
            'Invoices open from the app using your current secure session and are saved for offline viewing.',
          ),
        ],
      ),
    );
  }
}

class _CancellationCard extends StatelessWidget {
  const _CancellationCard({required this.order, required this.onCancel});

  final OrderSummary order;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final eligible = _canRequestCancellation(order);
    final hasStatus =
        order.cancellationStatus != 'none' || order.refundStatus != 'none';
    return _Card(
      title: 'Cancellation / refund',
      icon: Icons.assignment_return_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (hasStatus) ...[
            _InfoRow(
                label: 'Cancellation',
                value: _labelize(order.cancellationStatus)),
            const SizedBox(height: 8),
            _InfoRow(label: 'Refund', value: _labelize(order.refundStatus)),
            const SizedBox(height: 12),
          ],
          if (eligible)
            PrimaryButton(
              label: 'Request cancellation / refund',
              icon: Icons.assignment_return_outlined,
              onPressed: onCancel,
            )
          else
            _MutedText(
              'Cancellation is unavailable for this order status. Contact FoodNova support for help.',
            ),
        ],
      ),
    );
  }
}

class _HeroPill extends StatelessWidget {
  const _HeroPill({required this.label, required this.icon});

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
      decoration: BoxDecoration(
        color: scheme.onPrimary.withValues(alpha: .14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: scheme.onPrimary.withValues(alpha: .18)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: scheme.onPrimary),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: scheme.onPrimary,
              fontWeight: FontWeight.w900,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class _SyncPill extends StatelessWidget {
  const _SyncPill({required this.lastSyncedAt});

  final DateTime lastSyncedAt;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: scheme.onPrimary.withValues(alpha: .13),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 12,
            height: 12,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              valueColor: AlwaysStoppedAnimation<Color>(scheme.onPrimary),
            ),
          ),
          const SizedBox(width: 7),
          Text(
            _formatSyncLabel(lastSyncedAt),
            style: TextStyle(
              color: scheme.onPrimary,
              fontWeight: FontWeight.w900,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

class _BottomActionBar extends StatelessWidget {
  const _BottomActionBar({
    required this.order,
    required this.onCallRider,
    required this.onMessageRider,
    required this.onTrackOrder,
  });

  final OrderSummary order;
  final VoidCallback onCallRider;
  final VoidCallback onMessageRider;
  final VoidCallback onTrackOrder;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final canContact = order.riderPhone.trim().isNotEmpty;
    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: scheme.outlineVariant),
          boxShadow: [
            BoxShadow(
              color: scheme.shadow.withValues(alpha: .12),
              blurRadius: 24,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: canContact ? onCallRider : null,
                icon: const Icon(Icons.call_rounded),
                label: const FittedBox(child: Text('Call Rider')),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: canContact ? onMessageRider : null,
                icon: const Icon(Icons.chat_rounded),
                label: const FittedBox(child: Text('WhatsApp')),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton.icon(
                onPressed: onTrackOrder,
                icon: const Icon(Icons.near_me_rounded),
                label: const FittedBox(child: Text('Track Order')),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({
    this.title,
    this.icon,
    this.trailing,
    this.highlighted = false,
    required this.child,
  });

  final String? title;
  final IconData? icon;
  final Widget? trailing;
  final bool highlighted;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: highlighted
            ? scheme.primaryContainer.withValues(alpha: .28)
            : scheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: highlighted ? scheme.primary : scheme.outlineVariant,
          width: highlighted ? 1.4 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: scheme.shadow.withValues(alpha: .08),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Row(
              children: [
                if (icon != null) ...[
                  Icon(icon, color: scheme.primary),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: Text(
                    title!,
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w900),
                  ),
                ),
                if (trailing != null) trailing!,
              ],
            ),
            const SizedBox(height: 14),
          ],
          child,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value, this.trailing});

  final String label;
  final String value;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: scheme.onSurfaceVariant,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: scheme.onSurface,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class _CopyRow extends StatelessWidget {
  const _CopyRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return _InfoRow(
      label: label,
      value: value,
      trailing: IconButton(
        tooltip: 'Copy',
        onPressed: () {
          Clipboard.setData(ClipboardData(text: value));
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('$label copied')));
        },
        icon: const Icon(Icons.copy_rounded, size: 18),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    super.key,
    required this.label,
    this.compact = false,
  });

  final String label;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 9 : 11,
        vertical: compact ? 6 : 8,
      ),
      decoration: BoxDecoration(
        color: scheme.primaryContainer,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label.isEmpty ? 'Pending' : label,
            style: TextStyle(
              color: scheme.onPrimaryContainer,
              fontWeight: FontWeight.w900,
              fontSize: compact ? 11 : 12,
            ),
          ),
        ],
      ),
    );
  }
}

class _MutedText extends StatelessWidget {
  const _MutedText(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        color: Theme.of(context).colorScheme.onSurfaceVariant,
        height: 1.4,
      ),
    );
  }
}

class _Step {
  const _Step(this.label, this.icon, this.timestamp);

  final String label;
  final IconData icon;
  final String timestamp;
}

int _activeIndex(OrderSummary order) {
  switch (order.canonicalDeliveryStatus) {
    case 'DELIVERED':
      return 5;
    case 'ARRIVED':
    case 'IN_TRANSIT':
      return 4;
    case 'PICKED_UP':
      return 3;
    case 'ASSIGNED':
    case 'ACCEPTED':
      return 1;
  }
  final value = '${order.status} ${order.paymentStatus}'.toLowerCase();
  if (value.contains('delivered')) return 5;
  if (value.contains('out_for_delivery') ||
      value.contains('out for delivery')) {
    return 4;
  }
  if (value.contains('ready_for_pickup') ||
      value.contains('ready for pickup') ||
      value.contains('ready')) {
    return 3;
  }
  if (value.contains('preparing') ||
      value.contains('processing') ||
      value.contains('packing')) {
    return 2;
  }
  if (value.contains('confirmed') ||
      value.contains('payment_confirmed') ||
      value.contains('paid')) {
    return 1;
  }
  return 0;
}

String _dispatchStatusLabel(OrderSummary order) {
  switch (order.canonicalDeliveryStatus) {
    case 'DELIVERED':
      return 'Delivered';
    case 'ARRIVED':
      return 'Arrived';
    case 'IN_TRANSIT':
      return 'Out for Delivery';
    case 'PICKED_UP':
      return 'Picked Up';
    case 'ASSIGNED':
      return 'Confirmed';
    case 'ACCEPTED':
      return 'Confirmed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return _labelize(
          order.status.isEmpty ? order.paymentStatus : order.status);
  }
}

String _timelineTimeLabel(String value, bool current) {
  if (value.trim().isEmpty) {
    return current ? 'In progress' : 'Completed';
  }
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return value;
  return DateFormat('MMM d, h:mm a').format(parsed.toLocal());
}

String _formatDistance(double? meters) {
  if (meters == null) return 'Waiting for rider location...';
  if (meters >= 1000) return '${(meters / 1000).toStringAsFixed(1)} km';
  return '${math.max(0, meters).round()} m';
}

String _formatEta(int? minutes) {
  if (minutes == null) return 'Waiting for rider location...';
  return '$minutes min';
}

String _formatRelativeTime(String value) {
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return 'Waiting for update';
  final diff = DateTime.now().difference(parsed.toLocal());
  if (diff.inSeconds < 45) return 'Just now';
  if (diff.inMinutes < 60) {
    final minutes = diff.inMinutes;
    return '$minutes min${minutes == 1 ? '' : 's'} ago';
  }
  if (diff.inHours < 24) {
    final hours = diff.inHours;
    return '$hours hour${hours == 1 ? '' : 's'} ago';
  }
  final days = diff.inDays;
  return '$days day${days == 1 ? '' : 's'} ago';
}

String _formatSyncLabel(DateTime value) {
  final diff = DateTime.now().difference(value);
  if (diff.inSeconds < 45) return 'Updated just now';
  if (diff.inMinutes < 60) return 'Updated ${diff.inMinutes}m ago';
  return 'Updated ${diff.inHours}h ago';
}

String _labelize(String value) {
  final cleaned = value.replaceAll('_', ' ').trim();
  if (cleaned.isEmpty) return 'Pending';
  return cleaned
      .split(' ')
      .map((part) =>
          part.isEmpty ? part : '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}

bool _canRequestCancellation(OrderSummary order) {
  final status = '${order.status} ${order.deliveryStatus}'.toLowerCase();
  final payment = order.paymentStatus.toLowerCase();
  final cancellation = order.cancellationStatus.toLowerCase();
  final refund = order.refundStatus.toLowerCase();
  if (cancellation == 'pending' || cancellation == 'approved') return false;
  if (refund == 'pending' || refund == 'approved' || refund == 'processed') {
    return false;
  }
  if (status.contains('out_for_delivery') ||
      status.contains('delivered') ||
      status.contains('cancelled')) {
    return false;
  }
  const eligible = {
    '',
    'order_placed',
    'pending_payment',
    'receipt_submitted',
    'payment_confirmed',
    'confirmed',
    'processing',
  };
  return eligible.contains(order.status) || eligible.contains(payment);
}

Future<void> _showCancelRequestSheet(
    BuildContext context, WidgetRef ref, OrderSummary order) async {
  if (!context.mounted) return;
  final submitted = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => _CancelRequestSheet(order: order),
  );
  if (submitted == true && context.mounted) {
    ref.invalidate(orderDetailProvider(order.id));
    ref.invalidate(ordersProvider);
    ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Cancellation request submitted.')));
  }
}

class _CancelRequestSheet extends ConsumerStatefulWidget {
  const _CancelRequestSheet({required this.order});

  final OrderSummary order;

  @override
  ConsumerState<_CancelRequestSheet> createState() =>
      _CancelRequestSheetState();
}

class _CancelRequestSheetState extends ConsumerState<_CancelRequestSheet> {
  final _reason = TextEditingController();
  String _requestType = 'cancellation';
  bool _loading = false;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_reason.text.trim().length < 10) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Enter a reason with at least 10 characters.')));
      return;
    }
    if (!mounted) return;
    setState(() => _loading = true);
    try {
      final repository = ref.read(ordersRepositoryProvider);
      await repository.requestCancellation(
        orderId: widget.order.id,
        requestType: _requestType,
        reason: _reason.text.trim(),
      );
      if (!mounted || !context.mounted) return;
      Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('$error')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
          20, 6, 20, MediaQuery.of(context).viewInsets.bottom + 28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Request cancellation / refund',
            style: Theme.of(context)
                .textTheme
                .titleLarge
                ?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 14),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'cancellation', label: Text('Cancellation')),
              ButtonSegment(value: 'refund', label: Text('Refund')),
            ],
            selected: {_requestType},
            onSelectionChanged: (value) =>
                setState(() => _requestType = value.first),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _reason,
            minLines: 4,
            maxLines: 6,
            decoration: const InputDecoration(
              labelText: 'Reason',
              hintText:
                  'Please explain why you want to cancel or request a refund.',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 18),
          PrimaryButton(
            label: _loading ? 'Submitting...' : 'Submit request',
            loading: _loading,
            icon: Icons.send_rounded,
            onPressed: _loading ? null : _submit,
          ),
        ],
      ),
    );
  }
}
