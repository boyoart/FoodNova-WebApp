import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/colors.dart';
import '../../../core/utils/location_service.dart';
import '../../../core/widgets/fn_widgets.dart';
import '../data/dispatch_repository.dart';
import '../domain/dispatch_models.dart';

class ActiveDeliveryScreen extends ConsumerStatefulWidget {
  const ActiveDeliveryScreen({super.key, this.extra});
  final Object? extra;

  @override
  ConsumerState<ActiveDeliveryScreen> createState() =>
      _ActiveDeliveryScreenState();
}

class _ActiveDeliveryScreenState extends ConsumerState<ActiveDeliveryScreen> {
  late final DeliveryOffer offer = DeliveryOffer(
    Map<String, dynamic>.from((widget.extra as Map?) ?? {}),
  );
  DeliveryStage stage = DeliveryStage.accepted;
  Timer? timer;
  String message = '';

  @override
  void initState() {
    super.initState();
    _ping();
    timer = Timer.periodic(const Duration(seconds: 5), (_) => _ping());
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/dashboard');
      },
      child: Scaffold(
        appBar: AppBar(title: Text(offer.orderCode)),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SizedBox(
              height: 220,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: GoogleMap(
                  initialCameraPosition: const CameraPosition(
                    target: LatLng(6.5244, 3.3792),
                    zoom: 12,
                  ),
                  myLocationEnabled: true,
                  myLocationButtonEnabled: true,
                ),
              ),
            ),
            const SizedBox(height: 14),
            FnCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    stage.label,
                    style: Theme.of(
                      context,
                    )
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 8),
                  Text('Pickup: ${offer.pickup}'),
                  Text('Customer: ${offer.customerName}'),
                  if (offer.customerPhone.isNotEmpty)
                    Text('Phone: ${offer.customerPhone}'),
                  Text('Dropoff: ${offer.dropoff}'),
                  if (offer.instructions.isNotEmpty)
                    Text('Instructions: ${offer.instructions}'),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      OutlinedButton.icon(
                        onPressed: _openGoogleMaps,
                        icon: const Icon(Icons.navigation_outlined),
                        label: const Text('Google Maps'),
                      ),
                      OutlinedButton.icon(
                        onPressed: _openWaze,
                        icon: const Icon(Icons.alt_route),
                        label: const Text('Waze'),
                      ),
                      FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: FoodNovaColors.danger,
                        ),
                        onPressed: _panic,
                        icon: const Icon(Icons.sos),
                        label: const Text('Panic'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            for (final item in DeliveryStage.values)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  item.index <= stage.index
                      ? Icons.check_circle
                      : Icons.radio_button_unchecked,
                  color: item.index <= stage.index
                      ? FoodNovaColors.success
                      : FoodNovaColors.border,
                ),
                title: Text(
                  item == DeliveryStage.delivered
                      ? 'Complete Delivery'
                      : item.label,
                ),
                onTap: item == DeliveryStage.delivered
                    ? _openVerificationScreen
                    : () => _setStage(item),
              ),
            if (message.isNotEmpty) FnCard(child: Text(message)),
          ],
        ),
      ),
    );
  }

  Future<void> _setStage(DeliveryStage next) async {
    setState(() {
      stage = next;
      message = '';
    });
    if (next == DeliveryStage.delivered) {
      timer?.cancel();
      timer = null;
    }
    try {
      await ref
          .read(dispatchRepositoryProvider)
          .updateDeliveryStage(offer.orderId, next);
    } catch (e) {
      if (!mounted) return;
      setState(
        () => message =
            'Status saved locally. Backend sync pending: ${apiMessage(e)}',
      );
    }
  }

  Future<void> _openVerificationScreen() async {
    final completed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => _DeliveryPinVerificationScreen(order: offer),
      ),
    );
    if (completed == true && mounted) {
      timer?.cancel();
      timer = null;
      setState(() {
        stage = DeliveryStage.delivered;
        message = 'Delivery completed successfully.';
      });
      ref.invalidate(deliveryOrdersProvider);
      ref.invalidate(dashboardStatsProvider);
    }
  }

  Future<void> _ping() async {
    if (stage == DeliveryStage.delivered) return;
    try {
      final pos = await LocationService().current(requestBackground: true);
      final payload = locationPayload(pos);
      debugPrint(
        'DISPATCH_ACTIVE_GPS latitude=${payload['latitude']} '
        'longitude=${payload['longitude']} accuracy=${payload['accuracy']} '
        'timestamp=${payload['timestamp']}',
      );
      await ref.read(dispatchRepositoryProvider).pingLocation(payload);
    } catch (error) {
      debugPrint('DISPATCH_ACTIVE_GPS_ERROR $error');
    }
  }

  Future<void> _panic() async {
    try {
      final pos = await LocationService().current();
      await ref.read(dispatchRepositoryProvider).panic(locationPayload(pos));
      if (!mounted) return;
      setState(() => message = 'Emergency alert sent to FoodNova admin.');
    } catch (e) {
      if (!mounted) return;
      setState(() => message = apiMessage(e));
    }
  }

  Future<void> _openGoogleMaps() => launchUrl(
        Uri.parse(
          'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(offer.dropoff)}',
        ),
        mode: LaunchMode.externalApplication,
      );
  Future<void> _openWaze() => launchUrl(
        Uri.parse(
          'https://waze.com/ul?q=${Uri.encodeComponent(offer.dropoff)}&navigate=yes',
        ),
        mode: LaunchMode.externalApplication,
      );
}

class _DeliveryPinVerificationScreen extends ConsumerStatefulWidget {
  const _DeliveryPinVerificationScreen({required this.order});

  final DeliveryOffer order;

  @override
  ConsumerState<_DeliveryPinVerificationScreen> createState() =>
      _DeliveryPinVerificationScreenState();
}

class _DeliveryPinVerificationScreenState
    extends ConsumerState<_DeliveryPinVerificationScreen> {
  final _pin = TextEditingController();
  final _focusNode = FocusNode();
  bool _loading = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _pin.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final code = _pin.text.trim();
    if (!RegExp(r'^\d{4}$').hasMatch(code)) {
      setState(() => _error = 'Ask the customer for their 4-digit PIN.');
      return;
    }
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      await ref
          .read(dispatchRepositoryProvider)
          .confirmDeliveryOtp(widget.order.orderId, code);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Delivery completed successfully.')),
      );
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = apiMessage(error);
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Complete Delivery')),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          FnCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(
                  Icons.verified_user_outlined,
                  size: 44,
                  color: FoodNovaColors.primary,
                ),
                const SizedBox(height: 12),
                Text(
                  'Customer Verification PIN',
                  textAlign: TextAlign.center,
                  style: Theme.of(context)
                      .textTheme
                      .headlineSmall
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                Text(
                  'Ask the customer for their 4-digit PIN.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 22),
                TextField(
                  controller: _pin,
                  focusNode: _focusNode,
                  enabled: !_loading,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.done,
                  maxLength: 4,
                  obscureText: true,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 1,
                    color: Colors.transparent,
                  ),
                  cursorColor: Colors.transparent,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(4),
                  ],
                  decoration: const InputDecoration(
                    counterText: '',
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.zero,
                  ),
                  onChanged: (_) => setState(() => _error = ''),
                  onSubmitted: (_) => _loading ? null : _verify(),
                ),
                GestureDetector(
                  onTap: () => _focusNode.requestFocus(),
                  child: AnimatedBuilder(
                    animation: _pin,
                    builder: (context, _) => _PinBoxes(
                        value: _pin.text, hasError: _error.isNotEmpty),
                  ),
                ),
                if (_error.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: scheme.error,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
                const SizedBox(height: 22),
                FilledButton.icon(
                  onPressed: _loading ? null : _verify,
                  icon: _loading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check_circle_outline),
                  label: Text(
                    _loading ? 'Verifying...' : 'Verify & Complete Delivery',
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

class _PinBoxes extends StatelessWidget {
  const _PinBoxes({required this.value, required this.hasError});

  final String value;
  final bool hasError;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: 'PIN Entry',
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (var i = 0; i < 4; i++) ...[
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: 54,
              height: 58,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: hasError
                      ? scheme.error
                      : i < value.length
                          ? FoodNovaColors.primary
                          : FoodNovaColors.border,
                  width: i < value.length ? 1.8 : 1,
                ),
              ),
              child: Text(
                i < value.length ? value[i] : '_',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: i < value.length
                          ? scheme.onSurface
                          : scheme.onSurfaceVariant,
                    ),
              ),
            ),
            if (i != 3) const SizedBox(width: 10),
          ],
        ],
      ),
    );
  }
}
