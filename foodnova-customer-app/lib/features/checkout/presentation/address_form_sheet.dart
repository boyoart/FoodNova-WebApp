import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/colors.dart';
import '../../../shared/models/address.dart';
import '../../../widgets/input_field.dart';
import '../../../widgets/primary_button.dart';
import '../../profile/data/profile_repository.dart';
import '../data/places_repository.dart';

Future<CustomerAddress?> showAddressFormSheet(
  BuildContext context,
  WidgetRef ref, {
  CustomerAddress? initial,
  String? fallbackName,
  String? fallbackPhone,
}) {
  if (!context.mounted) return Future.value();
  return showModalBottomSheet<CustomerAddress>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => _AddressFormSheet(
      initial: initial,
      fallbackName: fallbackName,
      fallbackPhone: fallbackPhone,
    ),
  );
}

class _AddressFormSheet extends ConsumerStatefulWidget {
  const _AddressFormSheet(
      {this.initial, this.fallbackName, this.fallbackPhone});

  final CustomerAddress? initial;
  final String? fallbackName;
  final String? fallbackPhone;

  @override
  ConsumerState<_AddressFormSheet> createState() => _AddressFormSheetState();
}

class _AddressFormSheetState extends ConsumerState<_AddressFormSheet> {
  late CustomerAddress _address;
  final _search = TextEditingController();
  final _label = TextEditingController();
  final _recipient = TextEditingController();
  final _phone = TextEditingController();
  final _line = TextEditingController();
  final _street = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _postalCode = TextEditingController();
  final _landmark = TextEditingController();
  Timer? _debounce;
  List<PlacePrediction> _predictions = const [];
  bool _searching = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _address = widget.initial ??
        CustomerAddress(
          id: 0,
          label: 'Home',
          recipientName: widget.fallbackName ?? '',
          phone: widget.fallbackPhone ?? '',
          addressLine: '',
          street: '',
          area: '',
          city: 'Lagos',
          lga: '',
          state: 'Lagos',
          country: 'Nigeria',
          landmark: '',
          postalCode: '',
          googlePlaceId: '',
          latitude: null,
          longitude: null,
          isDefault: false,
        );
    _syncControllers();
  }

  void _syncControllers() {
    _label.text = _address.label;
    _recipient.text = _address.recipientName;
    _phone.text = _address.phone;
    _line.text = _address.addressLine;
    _street.text = _address.street;
    _city.text = _address.city;
    _state.text = _address.state;
    _postalCode.text = _address.postalCode;
    _landmark.text = _address.landmark;
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _label.dispose();
    _recipient.dispose();
    _phone.dispose();
    _line.dispose();
    _street.dispose();
    _city.dispose();
    _state.dispose();
    _postalCode.dispose();
    _landmark.dispose();
    super.dispose();
  }

  Future<void> _searchPlaces(String value) async {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 360), () async {
      if (!mounted) return;
      setState(() => _searching = true);
      try {
        final items =
            await ref.read(placesRepositoryProvider).autocomplete(value);
        if (mounted) setState(() => _predictions = items);
      } catch (error) {
        if (mounted) setState(() => _predictions = const []);
      } finally {
        if (mounted) setState(() => _searching = false);
      }
    });
  }

  Future<void> _selectPrediction(PlacePrediction prediction) async {
    FocusScope.of(context).unfocus();
    if (!mounted) return;
    setState(() {
      _searching = true;
      _predictions = const [];
      _search.text = prediction.description;
    });
    try {
      final place =
          await ref.read(placesRepositoryProvider).resolve(prediction);
      if (!mounted) return;
      _address = _address.copyWith(
        addressLine: place.fullAddress,
        street: place.street,
        area: place.area,
        city: place.city,
        lga: place.lga,
        state: place.state,
        country: place.country,
        postalCode: place.postalCode,
        googlePlaceId: place.googlePlaceId,
        latitude: place.latitude,
        longitude: place.longitude,
      );
      _syncControllers();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _save() async {
    final next = _address.copyWith(
      label: _label.text.trim().isEmpty ? 'Home' : _label.text.trim(),
      recipientName: _recipient.text.trim(),
      phone: _phone.text.trim(),
      addressLine: _line.text.trim(),
      street: _street.text.trim(),
      city: _city.text.trim(),
      state: _state.text.trim(),
      postalCode: _postalCode.text.trim(),
      landmark: _landmark.text.trim(),
    );
    if (next.recipientName.isEmpty ||
        next.phone.isEmpty ||
        next.addressLine.isEmpty ||
        next.city.isEmpty ||
        next.state.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content:
              Text('Complete recipient, phone, address, city, and state.')));
      return;
    }
    if (!mounted) return;
    setState(() => _saving = true);
    try {
      final saved = await ref.read(profileRepositoryProvider).saveAddress(next);
      if (!mounted || !context.mounted) return;
      Navigator.pop(context, saved);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final places = ref.read(placesRepositoryProvider);
    final scheme = Theme.of(context).colorScheme;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .9,
      minChildSize: .55,
      maxChildSize: .95,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: EdgeInsets.fromLTRB(
            20, 4, 20, MediaQuery.of(context).viewInsets.bottom + 24),
        children: [
          Text(
              widget.initial == null
                  ? 'Add delivery address'
                  : 'Edit delivery address',
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 14),
          TextField(
            controller: _search,
            onChanged: _searchPlaces,
            decoration: InputDecoration(
              labelText: 'Search delivery address',
              helperText: places.usesGooglePlaces
                  ? 'Powered by Google Places'
                  : 'Search enabled for international delivery addresses',
              prefixIcon: const Icon(Icons.place_outlined),
              suffixIcon: _searching
                  ? const Padding(
                      padding: EdgeInsets.all(14),
                      child: SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2)))
                  : null,
            ),
          ),
          if (_predictions.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 8),
              decoration: BoxDecoration(
                  color: scheme.surface,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: scheme.outlineVariant)),
              child: Column(
                children: [
                  for (final prediction in _predictions.take(5))
                    ListTile(
                      dense: true,
                      leading: const Icon(Icons.location_on_outlined,
                          color: FoodNovaColors.primary),
                      title: Text(prediction.description,
                          maxLines: 2, overflow: TextOverflow.ellipsis),
                      onTap: () => _selectPrediction(prediction),
                    ),
                ],
              ),
            ),
          const SizedBox(height: 14),
          InputField(
              controller: _label, label: 'Label', icon: Icons.home_outlined),
          const SizedBox(height: 10),
          InputField(
              controller: _recipient,
              label: 'Recipient name',
              icon: Icons.person_outline_rounded),
          const SizedBox(height: 10),
          InputField(
              controller: _phone,
              label: 'Phone number',
              icon: Icons.phone_outlined,
              keyboardType: TextInputType.phone),
          const SizedBox(height: 10),
          InputField(
              controller: _line,
              label: 'Full address',
              icon: Icons.location_on_outlined),
          const SizedBox(height: 10),
          InputField(
              controller: _street, label: 'Street', icon: Icons.route_outlined),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                  child: InputField(
                      controller: _city,
                      label: 'City',
                      icon: Icons.location_city_outlined)),
              const SizedBox(width: 10),
              Expanded(
                  child: InputField(
                      controller: _state,
                      label: 'State',
                      icon: Icons.map_outlined)),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                  child: InputField(
                      controller: _postalCode,
                      label: 'Postal code',
                      icon: Icons.markunread_mailbox_outlined)),
              const SizedBox(width: 10),
              Expanded(
                  child: InputField(
                      controller: _landmark,
                      label: 'Landmark',
                      icon: Icons.flag_outlined)),
            ],
          ),
          const SizedBox(height: 18),
          PrimaryButton(
              label: _saving ? 'Saving...' : 'Save address',
              loading: _saving,
              icon: Icons.check_rounded,
              onPressed: _saving ? null : _save),
        ],
      ),
    );
  }
}
