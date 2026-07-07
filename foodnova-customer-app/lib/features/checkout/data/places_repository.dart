import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/app_config.dart';

final placesRepositoryProvider = Provider((ref) => PlacesRepository(Dio()));

class PlacesRepository {
  PlacesRepository(this._dio);

  final Dio _dio;

  bool get usesGooglePlaces => AppConfig.googlePlacesApiKey.trim().isNotEmpty;

  Future<List<PlacePrediction>> autocomplete(String input) async {
    final query = input.trim();
    if (query.length < 3) return const [];
    if (!usesGooglePlaces) return _fallbackAutocomplete(query);
    debugPrint('ADDRESS_AUTOCOMPLETE_QUERY query=$query provider=google');
    final response = await _dio.get(
      'https://maps.googleapis.com/maps/api/place/autocomplete/json',
      queryParameters: {
        'input': query,
        'key': AppConfig.googlePlacesApiKey,
        'types': 'address',
      },
    );
    final body = Map<String, dynamic>.from(response.data as Map);
    final items = body['predictions'] as List? ?? [];
    debugPrint(
        'ADDRESS_AUTOCOMPLETE_RESULTS query=$query provider=google count=${items.length} status=${body['status'] ?? ''}');
    return items
        .map(
            (item) => PlacePrediction.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<PlaceAddress> resolve(PlacePrediction prediction) async {
    if (prediction.resolvedAddress != null) return prediction.resolvedAddress!;
    return details(prediction.placeId);
  }

  Future<PlaceAddress> details(String placeId) async {
    final response = await _dio.get(
      'https://maps.googleapis.com/maps/api/place/details/json',
      queryParameters: {
        'place_id': placeId,
        'key': AppConfig.googlePlacesApiKey,
        'fields': 'address_components,formatted_address,geometry,place_id,name',
      },
    );
    final body = Map<String, dynamic>.from(response.data as Map);
    final result = Map<String, dynamic>.from(body['result'] ?? {});
    return PlaceAddress.fromJson(result);
  }

  Future<List<PlacePrediction>> _fallbackAutocomplete(String query) async {
    debugPrint('ADDRESS_AUTOCOMPLETE_QUERY query=$query provider=nominatim');
    final response = await _dio.get(
      'https://nominatim.openstreetmap.org/search',
      options: Options(headers: {
        'User-Agent': 'FoodNovaCustomerApp/1.0 support@foodnova.com.ng',
      }),
      queryParameters: {
        'q': query,
        'format': 'jsonv2',
        'addressdetails': '1',
        'limit': '6',
      },
    );
    final items = response.data as List? ?? [];
    debugPrint(
        'ADDRESS_AUTOCOMPLETE_RESULTS query=$query provider=nominatim count=${items.length}');
    return items.map((item) {
      final json = Map<String, dynamic>.from(item);
      final address = PlaceAddress.fromNominatim(json);
      return PlacePrediction(
        placeId: 'osm:${json['osm_type'] ?? ''}:${json['osm_id'] ?? ''}',
        description: address.fullAddress,
        resolvedAddress: address,
      );
    }).toList();
  }
}

class PlacePrediction {
  const PlacePrediction({
    required this.placeId,
    required this.description,
    this.resolvedAddress,
  });

  final String placeId;
  final String description;
  final PlaceAddress? resolvedAddress;

  factory PlacePrediction.fromJson(Map<String, dynamic> json) {
    return PlacePrediction(
      placeId: '${json['place_id'] ?? ''}',
      description: '${json['description'] ?? ''}',
    );
  }
}

class PlaceAddress {
  const PlaceAddress({
    required this.fullAddress,
    required this.street,
    required this.area,
    required this.city,
    required this.lga,
    required this.state,
    required this.country,
    required this.postalCode,
    required this.googlePlaceId,
    required this.latitude,
    required this.longitude,
  });

  final String fullAddress;
  final String street;
  final String area;
  final String city;
  final String lga;
  final String state;
  final String country;
  final String postalCode;
  final String googlePlaceId;
  final double? latitude;
  final double? longitude;

  factory PlaceAddress.fromJson(Map<String, dynamic> json) {
    final components = (json['address_components'] as List? ?? [])
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    String part(String type) {
      for (final item in components) {
        final types = item['types'] as List? ?? [];
        if (types.contains(type)) return '${item['long_name'] ?? ''}';
      }
      return '';
    }

    final streetNumber = part('street_number');
    final route = part('route');
    final locality = part('locality').isNotEmpty
        ? part('locality')
        : (part('postal_town').isNotEmpty
            ? part('postal_town')
            : part('administrative_area_level_2'));
    final sublocality = part('sublocality').isNotEmpty
        ? part('sublocality')
        : (part('sublocality_level_1').isNotEmpty
            ? part('sublocality_level_1')
            : part('neighborhood'));
    final geometry = Map<String, dynamic>.from(json['geometry'] ?? {});
    final location = Map<String, dynamic>.from(geometry['location'] ?? {});
    final street =
        [streetNumber, route].where((value) => value.isNotEmpty).join(' ');
    return PlaceAddress(
      fullAddress: '${json['formatted_address'] ?? ''}',
      street: street.isNotEmpty ? street : route,
      area: sublocality,
      city: locality.isNotEmpty ? locality : sublocality,
      lga: part('administrative_area_level_2'),
      state: part('administrative_area_level_1'),
      country: part('country').isEmpty ? 'Nigeria' : part('country'),
      postalCode: part('postal_code'),
      googlePlaceId: '${json['place_id'] ?? ''}',
      latitude: double.tryParse('${location['lat'] ?? ''}'),
      longitude: double.tryParse('${location['lng'] ?? ''}'),
    );
  }

  factory PlaceAddress.fromNominatim(Map<String, dynamic> json) {
    final address = Map<String, dynamic>.from(json['address'] ?? {});
    String value(String key) => '${address[key] ?? ''}'.trim();
    final city = [
      value('city'),
      value('town'),
      value('village'),
      value('municipality'),
      value('county'),
    ].firstWhere((item) => item.isNotEmpty, orElse: () => 'Lagos');
    final area = [
      value('suburb'),
      value('neighbourhood'),
      value('city_district'),
      value('quarter'),
    ].firstWhere((item) => item.isNotEmpty, orElse: () => '');
    final road = value('road');
    final houseNumber = value('house_number');
    final street =
        [houseNumber, road].where((item) => item.isNotEmpty).join(' ');
    final fullAddress = '${json['display_name'] ?? ''}'.trim();
    return PlaceAddress(
      fullAddress: fullAddress,
      street: street,
      area: area,
      city: city,
      lga: value('county'),
      state: value('state').isEmpty ? 'Lagos' : value('state'),
      country: value('country').isEmpty ? 'Nigeria' : value('country'),
      postalCode: value('postcode'),
      googlePlaceId: '',
      latitude: double.tryParse('${json['lat'] ?? ''}'),
      longitude: double.tryParse('${json['lon'] ?? ''}'),
    );
  }
}
