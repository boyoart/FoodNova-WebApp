class CustomerAddress {
  const CustomerAddress({
    required this.id,
    required this.label,
    required this.recipientName,
    required this.phone,
    required this.addressLine,
    required this.street,
    required this.area,
    required this.city,
    required this.lga,
    required this.state,
    required this.country,
    required this.landmark,
    required this.postalCode,
    required this.googlePlaceId,
    required this.latitude,
    required this.longitude,
    required this.isDefault,
  });

  final int id;
  final String label;
  final String recipientName;
  final String phone;
  final String addressLine;
  final String street;
  final String area;
  final String city;
  final String lga;
  final String state;
  final String country;
  final String landmark;
  final String postalCode;
  final String googlePlaceId;
  final double? latitude;
  final double? longitude;
  final bool isDefault;

  factory CustomerAddress.fromJson(Map<String, dynamic> json) {
    return CustomerAddress(
      id: int.tryParse('${json['id'] ?? 0}') ?? 0,
      label: '${json['label'] ?? ''}',
      recipientName: '${json['recipient_name'] ?? ''}',
      phone: '${json['phone'] ?? ''}',
      addressLine: '${json['address_line'] ?? ''}',
      street: '${json['street'] ?? ''}',
      area: '${json['area'] ?? ''}',
      city: '${json['city'] ?? ''}',
      lga: '${json['lga'] ?? ''}',
      state: '${json['state'] ?? ''}',
      country: '${json['country'] ?? 'Nigeria'}',
      landmark: '${json['landmark'] ?? ''}',
      postalCode: '${json['postal_code'] ?? ''}',
      googlePlaceId: '${json['google_place_id'] ?? ''}',
      latitude: double.tryParse('${json['latitude'] ?? ''}'),
      longitude: double.tryParse('${json['longitude'] ?? ''}'),
      isDefault: json['is_default'] == true,
    );
  }

  Map<String, dynamic> toPayload() {
    return {
      'label': label,
      'recipient_name': recipientName,
      'phone': phone,
      'address_line': addressLine,
      'street': street,
      'area': area,
      'city': city,
      'lga': lga,
      'state': state,
      'country': country.isEmpty ? 'Nigeria' : country,
      'landmark': landmark,
      'postal_code': postalCode,
      'google_place_id': googlePlaceId,
      'latitude': latitude,
      'longitude': longitude,
      'is_default': isDefault,
    };
  }

  String get formatted {
    return [addressLine, street, area, city, lga, state, country]
        .where((value) => value.trim().isNotEmpty)
        .join(', ');
  }

  CustomerAddress copyWith({
    int? id,
    String? label,
    String? recipientName,
    String? phone,
    String? addressLine,
    String? street,
    String? area,
    String? city,
    String? lga,
    String? state,
    String? country,
    String? landmark,
    String? postalCode,
    String? googlePlaceId,
    double? latitude,
    double? longitude,
    bool? isDefault,
  }) {
    return CustomerAddress(
      id: id ?? this.id,
      label: label ?? this.label,
      recipientName: recipientName ?? this.recipientName,
      phone: phone ?? this.phone,
      addressLine: addressLine ?? this.addressLine,
      street: street ?? this.street,
      area: area ?? this.area,
      city: city ?? this.city,
      lga: lga ?? this.lga,
      state: state ?? this.state,
      country: country ?? this.country,
      landmark: landmark ?? this.landmark,
      postalCode: postalCode ?? this.postalCode,
      googlePlaceId: googlePlaceId ?? this.googlePlaceId,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      isDefault: isDefault ?? this.isDefault,
    );
  }
}
