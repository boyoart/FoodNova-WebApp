import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:signature/signature.dart';
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
  final otp = TextEditingController();
  final signature = SignatureController(
    penStrokeWidth: 3,
    penColor: FoodNovaColors.primary,
  );
  XFile? photo;

  @override
  void initState() {
    super.initState();
    _ping();
    timer = Timer.periodic(const Duration(seconds: 10), (_) => _ping());
  }

  @override
  void dispose() {
    timer?.cancel();
    signature.dispose();
    otp.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
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
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                Text('Pickup: ${offer.pickup}'),
                Text('Customer: ${offer.customerName}'),
                if (offer.customerPhone.isNotEmpty)
                  Text('Phone: ${offer.customerPhone}'),
                Text('Dropoff: ${offer.dropoff}'),
                if (offer.instructions.isNotEmpty)
                  Text('Instructions: ${offer.instructions}'),
                if (offer.deliveryPin.isNotEmpty)
                  Text('Delivery PIN: ${offer.deliveryPin}'),
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
              title: Text(item.label),
              onTap: item == DeliveryStage.delivered
                  ? _showProofSheet
                  : () => _setStage(item),
            ),
          if (message.isNotEmpty) FnCard(child: Text(message)),
        ],
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

  Future<void> _showProofSheet() async {
    if (!context.mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.fromLTRB(
          18,
          18,
          18,
          18 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Delivery proof',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: otp,
              decoration: const InputDecoration(
                labelText: 'Customer PIN',
                hintText: '4-digit PIN',
              ),
              keyboardType: TextInputType.number,
              maxLength: 4,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(4),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              height: 140,
              decoration: BoxDecoration(
                border: Border.all(color: FoodNovaColors.border),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Signature(
                controller: signature,
                backgroundColor: Colors.white,
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () async {
                photo = await ImagePicker().pickImage(
                  source: ImageSource.camera,
                  imageQuality: 80,
                );
                if (mounted) setState(() {});
              },
              icon: const Icon(Icons.camera_alt_outlined),
              label: Text(
                photo == null ? 'Add delivery photo' : 'Photo attached',
              ),
            ),
            FilledButton(
              onPressed: _completeDelivery,
              child: const Text('Mark delivered'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _completeDelivery() async {
    try {
      if (otp.text.trim().isNotEmpty) {
        if (!RegExp(r'^\d{4}$').hasMatch(otp.text.trim())) {
          setState(() => message = 'Enter the 4-digit PIN from the customer.');
          return;
        }
        await ref
            .read(dispatchRepositoryProvider)
            .confirmDeliveryOtp(offer.orderId, otp.text.trim());
      } else if (signature.isNotEmpty || photo != null) {
        await ref.read(dispatchRepositoryProvider).submitProof(offer.orderId, {
          'signature_present': signature.isNotEmpty,
          'photo_path': photo?.path,
        });
      } else {
        if (!mounted) return;
        setState(
          () => message =
              'Add PIN, signature, or delivery photo before marking delivered.',
        );
        return;
      }
      if (!mounted) return;
      Navigator.of(context).pop();
      await _setStage(DeliveryStage.delivered);
    } catch (e) {
      if (!mounted) return;
      setState(() => message = apiMessage(e));
    }
  }

  Future<void> _ping() async {
    if (stage == DeliveryStage.delivered) return;
    try {
      final pos = await LocationService().current();
      await ref
          .read(dispatchRepositoryProvider)
          .pingLocation(locationPayload(pos));
    } catch (_) {}
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
