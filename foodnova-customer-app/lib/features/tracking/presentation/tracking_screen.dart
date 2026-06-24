import 'dart:async';
import 'dart:math' as math;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

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
  final _deliveryCode = TextEditingController();
  _ReceiptFile? _selectedReceipt;
  bool _uploading = false;
  bool _verifying = false;
  bool _verified = false;
  double _progress = 0;
  Timer? _refreshTimer;
  StreamSubscription<void>? _pushRefreshSubscription;
  bool _subscribedRealtime = false;

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
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _pushRefreshSubscription?.cancel();
    _deliveryCode.dispose();
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

  Future<void> _verifyDelivery() async {
    final code = _deliveryCode.text.trim();
    if (!RegExp(r'^\d{4}$').hasMatch(code)) {
      _toast('Enter the 4-digit PIN from your rider to confirm delivery.');
      return;
    }
    if (!mounted) return;
    setState(() => _verifying = true);
    try {
      final repository = ref.read(ordersRepositoryProvider);
      await repository.confirmDelivery(orderId: widget.orderId, code: code);
      if (!mounted) return;
      _deliveryCode.clear();
      setState(() => _verified = true);
      ref.invalidate(orderDetailProvider(widget.orderId));
      ref.invalidate(ordersProvider);
      _toast('Delivery verified. Your order is now delivered.');
    } catch (error) {
      _toast('Delivery confirmation failed: $error');
    } finally {
      if (mounted) setState(() => _verifying = false);
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
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () {
              ref.invalidate(orderDetailProvider(widget.orderId));
              ref.invalidate(riderLocationProvider(widget.orderId));
            },
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
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
              deliveryCode: _deliveryCode,
              verifying: _verifying,
              verified: _verified,
              onPickCamera: () => _pickImage(ImageSource.camera),
              onPickGallery: () => _pickImage(ImageSource.gallery),
              onPickFile: _pickFile,
              onUpload: _uploadReceipt,
              onVerifyDelivery: _verifyDelivery,
              onCallRider: () => _callRider(order),
              onMessageRider: () => _messageRider(order),
              onRefresh: () {
                ref.invalidate(orderDetailProvider(order.id));
                ref.invalidate(riderLocationProvider(order.id));
              },
              onCancel: () => _showCancelRequestSheet(context, ref, order),
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
    required this.deliveryCode,
    required this.verifying,
    required this.verified,
    required this.onPickCamera,
    required this.onPickGallery,
    required this.onPickFile,
    required this.onUpload,
    required this.onVerifyDelivery,
    required this.onCallRider,
    required this.onMessageRider,
    required this.onRefresh,
    required this.onCancel,
  });

  final OrderSummary order;
  final AsyncValue<RiderLocation?> riderLocation;
  final _ReceiptFile? selectedReceipt;
  final bool uploading;
  final double uploadProgress;
  final TextEditingController deliveryCode;
  final bool verifying;
  final bool verified;
  final VoidCallback onPickCamera;
  final VoidCallback onPickGallery;
  final VoidCallback onPickFile;
  final VoidCallback onUpload;
  final VoidCallback onVerifyDelivery;
  final VoidCallback onCallRider;
  final VoidCallback onMessageRider;
  final VoidCallback onRefresh;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final currency = NumberFormat.currency(
      locale: 'en_NG',
      symbol: 'NGN ',
      decimalDigits: 0,
    );
    final showVerification = order.isOutForDelivery ||
        order.riderArrived ||
        order.isDelivered ||
        verified;
    final showTracking = order.isDeliveryTrackingVisible;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 118),
      children: [
        _OrderHeaderCard(
          order: order,
          amount: currency.format(order.totalAmount),
          onRefresh: onRefresh,
        ),
        const SizedBox(height: 14),
        _TimelineCard(order: order),
        const SizedBox(height: 14),
        _PaymentCard(order: order),
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
        _DeliveryCard(
          order: order,
          onCallRider: onCallRider,
          onMessageRider: onMessageRider,
        ),
        if (showTracking) ...[
          const SizedBox(height: 14),
          _RiderTrackingCard(
            order: order,
            location: riderLocation,
            onCallRider: onCallRider,
            onMessageRider: onMessageRider,
          ),
        ],
        if (showVerification) ...[
          const SizedBox(height: 14),
          _VerificationCard(
            order: order,
            controller: deliveryCode,
            loading: verifying,
            verified: verified || order.isDelivered,
            highlight: order.riderArrived,
            onVerify: onVerifyDelivery,
          ),
        ],
        const SizedBox(height: 14),
        _InvoiceCard(order: order),
        const SizedBox(height: 14),
        _CancellationCard(order: order, onCancel: onCancel),
      ],
    );
  }
}

class _OrderHeaderCard extends StatelessWidget {
  const _OrderHeaderCard({
    required this.order,
    required this.amount,
    required this.onRefresh,
  });

  final OrderSummary order;
  final String amount;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final status =
        _labelize(order.status.isEmpty ? order.paymentStatus : order.status);
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  order.orderCode.isEmpty ? 'FoodNova order' : order.orderCode,
                  style: Theme.of(context)
                      .textTheme
                      .headlineSmall
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
              ),
              IconButton.filledTonal(
                tooltip: 'Refresh',
                onPressed: onRefresh,
                icon: const Icon(Icons.refresh_rounded),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Chip(label: status, icon: Icons.local_shipping_rounded),
              _Chip(label: amount, icon: Icons.payments_rounded),
              _Chip(
                label: order.estimatedDeliveryTime.trim().isEmpty
                    ? 'ETA updating'
                    : 'ETA ${order.estimatedDeliveryTime}',
                icon: Icons.schedule_rounded,
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            order.deliveryAddress.isEmpty
                ? 'Delivery details will appear after checkout syncs.'
                : order.deliveryAddress,
            style: TextStyle(color: scheme.onSurfaceVariant, height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _TimelineCard extends StatelessWidget {
  const _TimelineCard({required this.order});

  final OrderSummary order;

  @override
  Widget build(BuildContext context) {
    final steps = [
      _Step('Order Placed', Icons.receipt_long_rounded, order.createdAt),
      _Step('Confirmed', Icons.verified_rounded, order.confirmedAt),
      _Step('Preparing', Icons.restaurant_rounded, order.preparingAt),
      _Step(
        'Ready for Pickup',
        Icons.shopping_bag_rounded,
        order.readyForPickupAt,
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
      title: 'Order timeline',
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
        children: [
          for (var i = 0; i < steps.length; i++)
            _TimelineRow(
              step: steps[i],
              active: i <= active,
              current: i == active,
              showLine: i != steps.length - 1,
            ),
        ],
      ),
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({
    required this.step,
    required this.active,
    required this.current,
    required this.showLine,
  });

  final _Step step;
  final bool active;
  final bool current;
  final bool showLine;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 320),
              curve: Curves.easeOutCubic,
              width: current ? 46 : 38,
              height: current ? 46 : 38,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: active ? scheme.primary : scheme.surfaceContainerHighest,
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
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 180),
                child: Icon(
                  active ? step.icon : Icons.circle_outlined,
                  key: ValueKey('$active-${step.label}'),
                  color: active ? scheme.onPrimary : scheme.onSurfaceVariant,
                  size: current ? 24 : 19,
                ),
              ),
            ),
            if (showLine)
              AnimatedContainer(
                duration: const Duration(milliseconds: 320),
                curve: Curves.easeOutCubic,
                width: 3,
                height: 42,
                color: active ? scheme.primary : scheme.outlineVariant,
              ),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            margin: EdgeInsets.only(top: current ? 1 : 4, bottom: 10),
            padding: EdgeInsets.symmetric(
              horizontal: current ? 12 : 0,
              vertical: current ? 10 : 5,
            ),
            decoration: BoxDecoration(
              color: current
                  ? scheme.primaryContainer.withValues(alpha: .42)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  step.label,
                  style: TextStyle(
                    color: active ? scheme.onSurface : scheme.onSurfaceVariant,
                    fontWeight: active ? FontWeight.w900 : FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  active
                      ? _timelineTimeLabel(step.timestamp, current)
                      : 'Pending',
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _PaymentCard extends StatelessWidget {
  const _PaymentCard({required this.order});

  final OrderSummary order;

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: 'Bank transfer',
      icon: Icons.account_balance_rounded,
      trailing: _Chip(label: _labelize(order.paymentStatus), compact: true),
      child: Column(
        children: [
          _CopyRow(label: 'Account number', value: '6427173992'),
          const SizedBox(height: 8),
          const _InfoRow(label: 'Bank', value: 'OPay'),
          const SizedBox(height: 8),
          const _InfoRow(label: 'Account name', value: 'FOODNOVA LIMITED'),
          const SizedBox(height: 8),
          _CopyRow(label: 'Reference', value: order.orderCode),
          const SizedBox(height: 12),
          _MutedText(
            'Transfer the order amount, use your order code as reference, then upload your receipt for admin verification.',
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

class _DeliveryCard extends StatelessWidget {
  const _DeliveryCard({
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
      title: 'Delivery information',
      icon: Icons.delivery_dining_rounded,
      child: Column(
        children: [
          _InfoRow(
            label: 'Address',
            value: order.deliveryAddress.isEmpty
                ? 'Not available'
                : order.deliveryAddress,
          ),
          const SizedBox(height: 8),
          _InfoRow(
            label: 'Receiver',
            value: order.customerName.isEmpty
                ? 'FoodNova customer'
                : order.customerName,
          ),
          const SizedBox(height: 8),
          _InfoRow(
            label: 'Phone',
            value: order.customerPhone.isEmpty
                ? 'Not available'
                : order.customerPhone,
          ),
          if (order.hasAssignedRider) ...[
            const SizedBox(height: 12),
            _RiderProfileTile(
              name: order.riderName,
              phone: order.riderPhone,
              photoUrl: order.riderPhotoUrl,
              vehicleType: order.riderVehicleType,
            ),
            const SizedBox(height: 8),
            _InfoRow(
              label: 'Delivery Status',
              value: _labelize(order.deliveryStatus.isEmpty
                  ? order.status
                  : order.deliveryStatus),
            ),
            if (order.riderPhone.trim().isNotEmpty) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: onCallRider,
                      icon: const Icon(Icons.call_rounded),
                      label: const Text('Contact Rider'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: onMessageRider,
                      icon: const Icon(Icons.chat_rounded),
                      label: const Text('WhatsApp'),
                    ),
                  ),
                ],
              ),
            ],
          ],
          if (order.deliveryNotes.isNotEmpty) ...[
            const SizedBox(height: 8),
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
    required this.onCallRider,
    required this.onMessageRider,
  });

  final OrderSummary order;
  final AsyncValue<RiderLocation?> location;
  final VoidCallback onCallRider;
  final VoidCallback onMessageRider;

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
          children: [
            const _MutedText('Rider tracking temporarily unavailable.'),
            if (order.riderPhone.trim().isNotEmpty) ...[
              const SizedBox(height: 12),
              _RiderContactButtons(
                onCallRider: onCallRider,
                onMessageRider: onMessageRider,
              ),
            ],
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
              children: [
                const _MutedText('Waiting for rider location...'),
                if (order.riderPhone.trim().isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _RiderContactButtons(
                    onCallRider: onCallRider,
                    onMessageRider: onMessageRider,
                  ),
                ],
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
              if (order.riderPhone.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                _RiderContactButtons(
                  onCallRider: onCallRider,
                  onMessageRider: onMessageRider,
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _RiderContactButtons extends StatelessWidget {
  const _RiderContactButtons({
    required this.onCallRider,
    required this.onMessageRider,
  });

  final VoidCallback onCallRider;
  final VoidCallback onMessageRider;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: onCallRider,
            icon: const Icon(Icons.call_rounded),
            label: const Text('Contact Rider'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: onMessageRider,
            icon: const Icon(Icons.chat_rounded),
            label: const Text('WhatsApp'),
          ),
        ),
      ],
    );
  }
}

class _RiderProfileTile extends StatelessWidget {
  const _RiderProfileTile({
    required this.name,
    required this.phone,
    required this.photoUrl,
    required this.vehicleType,
  });

  final String name;
  final String phone;
  final String photoUrl;
  final String vehicleType;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final displayName = name.trim().isEmpty ? 'FoodNova rider' : name.trim();
    final displayPhone = phone.trim().isEmpty ? 'Phone pending' : phone.trim();
    final displayVehicle = vehicleType.trim().isEmpty
        ? 'Delivery partner'
        : _labelize(vehicleType);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.primaryContainer.withValues(alpha: .36),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: scheme.primary.withValues(alpha: .18)),
      ),
      child: Row(
        children: [
          _RiderAvatar(photoUrl: photoUrl, name: displayName),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  displayName,
                  style: TextStyle(
                    color: scheme.onSurface,
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  displayPhone,
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 5),
                Row(
                  children: [
                    Icon(Icons.two_wheeler_rounded,
                        size: 16, color: scheme.primary),
                    const SizedBox(width: 5),
                    Expanded(
                      child: Text(
                        displayVehicle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: scheme.primary,
                          fontWeight: FontWeight.w900,
                          fontSize: 12,
                        ),
                      ),
                    ),
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
      backgroundImage:
          photoUrl.trim().isEmpty ? null : NetworkImage(photoUrl.trim()),
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
    required this.controller,
    required this.loading,
    required this.verified,
    required this.highlight,
    required this.onVerify,
  });

  final OrderSummary order;
  final TextEditingController controller;
  final bool loading;
  final bool verified;
  final bool highlight;
  final VoidCallback onVerify;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return _Card(
      title: verified ? 'Delivery verified' : 'Confirm Delivery',
      icon: verified ? Icons.verified_rounded : Icons.password_rounded,
      highlighted: highlight && !verified,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _MutedText(
            verified
                ? 'This order has been securely confirmed as delivered.'
                : 'Your order is out for delivery. Enter the 4-digit PIN from your rider to confirm delivery.',
          ),
          if (!verified) ...[
            const SizedBox(height: 14),
            TextField(
              controller: controller,
              enabled: !loading,
              maxLength: 4,
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.done,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(4),
              ],
              decoration: const InputDecoration(
                hintText: '4-digit PIN',
                counterText: '',
                prefixIcon: Icon(Icons.pin_rounded),
              ),
            ),
            const SizedBox(height: 12),
            PrimaryButton(
              label: loading ? 'Verifying...' : 'Verify delivery',
              icon: Icons.verified_user_rounded,
              loading: loading,
              onPressed: loading ? null : onVerify,
            ),
          ] else if (order.deliveryConfirmedAt.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: scheme.primaryContainer,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                'Confirmed ${order.deliveryConfirmedAt}',
                style: TextStyle(
                  color: scheme.onPrimaryContainer,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.order});

  final OrderSummary order;

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: 'Invoice',
      icon: Icons.description_outlined,
      child: Row(
        children: [
          Expanded(
            child: PrimaryButton(
              label: 'Preview',
              icon: Icons.open_in_new_rounded,
              onPressed: () => _openInvoice(order),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _openInvoice(order),
              icon: const Icon(Icons.download_rounded),
              label: const Text('Download'),
            ),
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
    this.icon,
    this.compact = false,
  });

  final String label;
  final IconData? icon;
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
          if (icon != null) ...[
            Icon(icon, size: 15, color: scheme.onPrimaryContainer),
            const SizedBox(width: 5),
          ],
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
  final value = '${order.status} ${order.deliveryStatus} '
          '${order.paymentStatus}'
      .toLowerCase();
  if (order.isDelivered || value.contains('delivered')) return 5;
  if (value.contains('out_for_delivery') ||
      value.contains('out for delivery') ||
      value.contains('in_transit') ||
      value.contains('in transit') ||
      value.contains('picked_up') ||
      value.contains('picked up') ||
      value.contains('arrived')) {
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

Future<void> _openInvoice(OrderSummary order) async {
  await launchUrl(
    Uri.parse('https://www.foodnova.com.ng/orders/${order.id}/invoice'),
    mode: LaunchMode.externalApplication,
  );
}
