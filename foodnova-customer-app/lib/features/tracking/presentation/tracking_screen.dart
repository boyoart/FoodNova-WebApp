import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/colors.dart';
import '../../../core/theme/shadows.dart';
import '../../../shared/models/order.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/primary_button.dart';
import '../../../widgets/skeleton_box.dart';
import '../../../widgets/status_badge.dart';
import '../../orders/data/orders_repository.dart';

final orderDetailProvider = FutureProvider.family<OrderSummary, int>((ref, id) {
  return ref.watch(ordersRepositoryProvider).order(id);
});

class TrackingScreen extends ConsumerStatefulWidget {
  const TrackingScreen({required this.orderId, super.key});

  final int orderId;

  @override
  ConsumerState<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends ConsumerState<TrackingScreen> {
  bool _uploading = false;
  double _progress = 0;
  XFile? _selectedReceipt;

  Future<void> _pickReceipt(ImageSource source) async {
    final file = await ImagePicker().pickImage(source: source, imageQuality: 88, maxWidth: 1800);
    if (file == null) return;
    setState(() {
      _selectedReceipt = file;
      _progress = 0;
    });
  }

  Future<void> _uploadReceipt() async {
    final file = _selectedReceipt;
    if (file == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Choose a receipt image first.')));
      return;
    }
    setState(() {
      _uploading = true;
      _progress = .18;
    });
    try {
      await Future<void>.delayed(const Duration(milliseconds: 180));
      setState(() => _progress = .62);
      await ref.read(ordersRepositoryProvider).uploadReceipt(widget.orderId, file.path);
      setState(() => _progress = 1);
      ref.invalidate(orderDetailProvider(widget.orderId));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Receipt uploaded. FoodNova will review your payment.')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Receipt upload failed: $error')));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final orderState = ref.watch(orderDetailProvider(widget.orderId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Order details'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => ref.invalidate(orderDetailProvider(widget.orderId)),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: orderState.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(20),
          child: Column(
            children: [
              SkeletonBox(height: 150, radius: 26),
              SizedBox(height: 16),
              SkeletonBox(height: 300, radius: 26),
            ],
          ),
        ),
        error: (error, _) => Padding(
          padding: const EdgeInsets.all(24),
          child: EmptyState(title: 'Order unavailable', message: error.toString(), icon: Icons.wifi_off_rounded),
        ),
        data: (order) => _OrderDetailBody(
          order: order,
          selectedReceipt: _selectedReceipt,
          uploading: _uploading,
          progress: _progress,
          onPickCamera: () => _pickReceipt(ImageSource.camera),
          onPickGallery: () => _pickReceipt(ImageSource.gallery),
          onUpload: _uploadReceipt,
          onRefresh: () => ref.invalidate(orderDetailProvider(widget.orderId)),
        ),
      ),
    );
  }
}

class _OrderDetailBody extends StatelessWidget {
  const _OrderDetailBody({
    required this.order,
    required this.selectedReceipt,
    required this.uploading,
    required this.progress,
    required this.onPickCamera,
    required this.onPickGallery,
    required this.onUpload,
    required this.onRefresh,
  });

  final OrderSummary order;
  final XFile? selectedReceipt;
  final bool uploading;
  final double progress;
  final VoidCallback onPickCamera;
  final VoidCallback onPickGallery;
  final VoidCallback onUpload;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final currency = NumberFormat.currency(locale: 'en_NG', symbol: 'NGN ', decimalDigits: 0);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 118),
      children: [
        _OrderHero(order: order, amount: currency.format(order.totalAmount)),
        const SizedBox(height: 16),
        _TrackingTimeline(status: order.status, paymentStatus: order.paymentStatus),
        const SizedBox(height: 16),
        _PaymentCard(order: order),
        const SizedBox(height: 16),
        _ReceiptUploadCard(
          selectedReceipt: selectedReceipt,
          uploading: uploading,
          progress: progress,
          onPickCamera: onPickCamera,
          onPickGallery: onPickGallery,
          onUpload: onUpload,
        ),
        const SizedBox(height: 16),
        _ActionGrid(onRefresh: onRefresh),
      ],
    );
  }
}

class _OrderHero extends StatelessWidget {
  const _OrderHero({required this.order, required this.amount});

  final OrderSummary order;
  final String amount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [FoodNovaColors.primaryDark, FoodNovaColors.primary, FoodNovaColors.success],
        ),
        borderRadius: BorderRadius.circular(28),
        boxShadow: FoodNovaShadows.nav,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(order.orderCode, style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w900)),
              ),
              StatusBadge(label: _labelize(order.paymentStatus), tone: FoodNovaColors.accent),
            ],
          ),
          const SizedBox(height: 12),
          Text(amount, style: Theme.of(context).textTheme.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          Text(
            order.deliveryAddress.isEmpty ? 'Delivery details will appear after checkout syncs.' : order.deliveryAddress,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, height: 1.35),
          ),
        ],
      ),
    );
  }
}

class _TrackingTimeline extends StatelessWidget {
  const _TrackingTimeline({required this.status, required this.paymentStatus});

  final String status;
  final String paymentStatus;

  @override
  Widget build(BuildContext context) {
    final activeIndex = _activeIndex(status, paymentStatus);
    final steps = [
      _Step('Order placed', Icons.receipt_long_rounded),
      _Step('Payment confirmed', Icons.verified_rounded),
      _Step('Processing', Icons.inventory_2_rounded),
      _Step('Out for delivery', Icons.local_shipping_rounded),
      _Step('Delivered', Icons.check_circle_rounded),
    ];
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Order progress', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 16),
          for (var i = 0; i < steps.length; i++)
            _TimelineRow(
              step: steps[i],
              active: i <= activeIndex,
              current: i == activeIndex,
              showLine: i != steps.length - 1,
            ),
        ],
      ),
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.step, required this.active, required this.current, required this.showLine});

  final _Step step;
  final bool active;
  final bool current;
  final bool showLine;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 260),
              width: current ? 42 : 36,
              height: current ? 42 : 36,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: active ? FoodNovaColors.primary : FoodNovaColors.surface2,
                boxShadow: current ? FoodNovaShadows.soft : null,
              ),
              child: Icon(step.icon, color: active ? Colors.white : FoodNovaColors.muted, size: current ? 23 : 20),
            ),
            if (showLine)
              AnimatedContainer(
                duration: const Duration(milliseconds: 260),
                width: 3,
                height: 34,
                color: active ? FoodNovaColors.primary.withOpacity(.55) : FoodNovaColors.border,
              ),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(top: current ? 8 : 7),
            child: Text(
              step.label,
              style: TextStyle(
                color: active ? FoodNovaColors.text : FoodNovaColors.muted,
                fontWeight: active ? FontWeight.w900 : FontWeight.w700,
              ),
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
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.account_balance_rounded, color: FoodNovaColors.primary),
              const SizedBox(width: 8),
              Expanded(child: Text('Bank transfer', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900))),
            ],
          ),
          const SizedBox(height: 12),
          _CopyRow(label: 'Account number', value: '6427173992'),
          const SizedBox(height: 8),
          const _InfoRow(label: 'Bank', value: 'OPay'),
          const SizedBox(height: 8),
          const _InfoRow(label: 'Account name', value: 'FOODNOVA LIMITED'),
          const SizedBox(height: 8),
          _CopyRow(label: 'Reference', value: order.orderCode),
          const SizedBox(height: 12),
          const Text(
            'Transfer the order amount, use your order code as reference, then upload your receipt for admin verification.',
            style: TextStyle(color: FoodNovaColors.muted, height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _ReceiptUploadCard extends StatelessWidget {
  const _ReceiptUploadCard({
    required this.selectedReceipt,
    required this.uploading,
    required this.progress,
    required this.onPickCamera,
    required this.onPickGallery,
    required this.onUpload,
  });

  final XFile? selectedReceipt;
  final bool uploading;
  final double progress;
  final VoidCallback onPickCamera;
  final VoidCallback onPickGallery;
  final VoidCallback onUpload;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Upload receipt', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          const Text('Take a photo or choose a receipt image from your gallery.', style: TextStyle(color: FoodNovaColors.muted)),
          const SizedBox(height: 14),
          if (selectedReceipt != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: FoodNovaColors.surface2, borderRadius: BorderRadius.circular(18)),
              child: Row(
                children: [
                  const Icon(Icons.image_rounded, color: FoodNovaColors.primary),
                  const SizedBox(width: 10),
                  Expanded(child: Text(selectedReceipt!.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800))),
                ],
              ),
            ),
          if (uploading) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(value: progress.clamp(0, 1), minHeight: 8),
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: OutlinedButton.icon(onPressed: uploading ? null : onPickCamera, icon: const Icon(Icons.photo_camera_rounded), label: const Text('Camera'))),
              const SizedBox(width: 10),
              Expanded(child: OutlinedButton.icon(onPressed: uploading ? null : onPickGallery, icon: const Icon(Icons.photo_library_rounded), label: const Text('Gallery'))),
            ],
          ),
          const SizedBox(height: 12),
          PrimaryButton(label: uploading ? 'Uploading...' : 'Submit receipt', icon: Icons.upload_file_rounded, loading: uploading, onPressed: uploading ? null : onUpload),
        ],
      ),
    );
  }
}

class _ActionGrid extends StatelessWidget {
  const _ActionGrid({required this.onRefresh});

  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _ActionCard(icon: Icons.refresh_rounded, title: 'Refresh', onTap: onRefresh)),
        const SizedBox(width: 10),
        Expanded(child: _ActionCard(icon: Icons.description_outlined, title: 'Invoice', onTap: () => _showInfo(context, 'Invoice viewing will use the existing backend order data.'))),
        const SizedBox(width: 10),
        Expanded(child: _ActionCard(icon: Icons.support_agent_rounded, title: 'Support', onTap: () => _showInfo(context, 'FoodNova support can help with payment, delivery, and order changes.'))),
      ],
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({required this.icon, required this.title, required this.onTap});

  final IconData icon;
  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
        decoration: BoxDecoration(
          color: FoodNovaColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: FoodNovaColors.border),
        ),
        child: Column(
          children: [
            Icon(icon, color: FoodNovaColors.primary),
            const SizedBox(height: 6),
            Text(title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 12)),
          ],
        ),
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
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$label copied')));
        },
        icon: const Icon(Icons.copy_rounded, size: 18),
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
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: FoodNovaColors.surface2, borderRadius: BorderRadius.circular(16)),
      child: Row(
        children: [
          Expanded(child: Text(label, style: const TextStyle(color: FoodNovaColors.muted, fontWeight: FontWeight.w800))),
          Flexible(child: Text(value, textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w900))),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class _Step {
  const _Step(this.label, this.icon);

  final String label;
  final IconData icon;
}

BoxDecoration _cardDecoration() {
  return BoxDecoration(
    color: FoodNovaColors.surface,
    borderRadius: BorderRadius.circular(26),
    border: Border.all(color: FoodNovaColors.border),
    boxShadow: FoodNovaShadows.soft,
  );
}

int _activeIndex(String status, String paymentStatus) {
  final value = '$status $paymentStatus'.toLowerCase();
  if (value.contains('delivered')) return 4;
  if (value.contains('out_for_delivery')) return 3;
  if (value.contains('processing')) return 2;
  if (value.contains('payment_confirmed') || value.contains('confirmed')) return 1;
  return 0;
}

String _labelize(String value) {
  final cleaned = value.replaceAll('_', ' ').trim();
  if (cleaned.isEmpty) return 'Pending payment';
  return cleaned.split(' ').map((part) => part.isEmpty ? part : '${part[0].toUpperCase()}${part.substring(1)}').join(' ');
}

void _showInfo(BuildContext context, String message) {
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (context) => Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      child: Text(message, style: const TextStyle(fontWeight: FontWeight.w700, height: 1.4)),
    ),
  );
}
