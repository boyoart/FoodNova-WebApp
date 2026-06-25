import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/state/session_controller.dart';
import '../domain/dispatch_models.dart';

final dispatchRepositoryProvider = Provider(DispatchRepository.new);

final riderProfileProvider = FutureProvider.autoDispose<RiderProfile>((ref) {
  return ref.read(dispatchRepositoryProvider).me();
});

final deliveryOffersProvider = FutureProvider.autoDispose<List<DeliveryOffer>>((
  ref,
) {
  return ref.read(dispatchRepositoryProvider).offers();
});

final deliveryOrdersProvider = FutureProvider.autoDispose<List<DeliveryOrder>>((
  ref,
) {
  return ref.read(dispatchRepositoryProvider).orders();
});

final dashboardStatsProvider =
    FutureProvider.autoDispose<DashboardStats>((ref) {
  return ref.read(dispatchRepositoryProvider).dashboardStats();
});

class DashboardStats {
  const DashboardStats({
    required this.todayDeliveries,
    required this.completed,
    required this.acceptanceRate,
    required this.averageRating,
  });

  final int todayDeliveries;
  final int completed;
  final num acceptanceRate;
  final num averageRating;

  factory DashboardStats.fromJson(Map<String, dynamic> json) {
    return DashboardStats(
      todayDeliveries: int.tryParse(
              '${json['today_deliveries'] ?? json['todayDeliveries'] ?? 0}') ??
          0,
      completed: int.tryParse('${json['completed'] ?? 0}') ?? 0,
      acceptanceRate: num.tryParse(
              '${json['acceptance_rate'] ?? json['acceptanceRate'] ?? 0}') ??
          0,
      averageRating: num.tryParse(
              '${json['average_rating'] ?? json['averageRating'] ?? 0}') ??
          0,
    );
  }
}

class DispatchRepository {
  DispatchRepository(this.ref);
  final Ref ref;
  Dio get _dio => ref.read(dioProvider);

  Future<RiderProfile> me() async {
    debugPrint('RIDER_PROFILE_FETCH');
    Response<dynamic> response;
    try {
      response = await _dio.get('/delivery/me');
    } on DioException catch (error) {
      final exact = jsonEncode({
        'status': error.response?.statusCode,
        'data': error.response?.data,
        'message': error.message,
      });
      await ref
          .read(sessionControllerProvider.notifier)
          .recordLastApiResponse(exact);
      debugPrint('RIDER_PROFILE_NOT_FOUND $exact');
      throw Exception(exact);
    }
    await ref
        .read(sessionControllerProvider.notifier)
        .recordLastApiResponse(jsonEncode(response.data));
    final data = response.data as Map;
    final raw = Map<String, dynamic>.from(data['worker'] ?? data['data'] ?? {});
    if (raw.isEmpty || raw['id'] == null) {
      final exact = jsonEncode(response.data);
      await ref
          .read(sessionControllerProvider.notifier)
          .markProfileMissing(profileSource: 'backend');
      debugPrint('RIDER_PROFILE_NOT_FOUND $exact');
      throw Exception(exact);
    }
    final profile = RiderProfile(raw);
    await ref.read(sessionControllerProvider.notifier).saveRiderState(
          riderId: '${profile.id ?? ''}',
          approvalStatus: profile.kycStatus,
          onboardingCompleted: profile.isApproved ||
              profile.normalizedKycStatus == 'PENDING_REVIEW',
          profileExists: true,
          profileSource: 'backend',
          currentStep: profile.currentStep,
        );
    debugPrint('RIDER_APPROVAL_STATUS ${profile.kycStatus}');
    return profile;
  }

  Future<RiderProfile> goOnline(Map<String, dynamic> location) async {
    debugPrint('ONLINE_REQUEST $location');
    final response = await _dio.post('/rider/go-online', data: location);
    debugPrint('ONLINE_RESPONSE ${response.data}');
    return RiderProfile(
      Map<String, dynamic>.from(
        response.data['worker'] ?? response.data['data'] ?? {},
      ),
    );
  }

  Future<RiderProfile> goOffline() async {
    debugPrint('OFFLINE_REQUEST');
    final response = await _dio.post('/delivery/go-offline');
    debugPrint('OFFLINE_RESPONSE ${response.data}');
    return RiderProfile(
      Map<String, dynamic>.from(
        response.data['worker'] ?? response.data['data'] ?? {},
      ),
    );
  }

  Future<void> pingLocation(Map<String, dynamic> location) {
    debugPrint('LOCATION_PING $location');
    return _dio
        .post('/delivery/location-ping', data: location)
        .then((response) {
      debugPrint('LOCATION_RESPONSE ${response.data}');
    });
  }

  Future<void> panic(Map<String, dynamic> location) {
    return _dio.post('/delivery/panic-alert', data: location).then((_) {});
  }

  Future<DashboardStats> dashboardStats() async {
    final response = await _dio.get('/delivery/stats');
    final body = response.data as Map;
    return DashboardStats.fromJson(
      Map<String, dynamic>.from(body['stats'] ?? body['data'] ?? {}),
    );
  }

  Future<List<DeliveryOffer>> offers() async {
    final response = await _dio.get('/delivery/offers');
    final body = response.data as Map;
    final items = (body['offers'] ?? body['data'] ?? []) as List;
    return items
        .map((item) => DeliveryOffer(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<List<DeliveryOrder>> orders() async {
    final response = await _dio.get('/delivery/orders');
    final body = response.data as Map;
    final items = (body['orders'] ?? body['data'] ?? []) as List;
    return items
        .map((item) => DeliveryOrder(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<DeliveryOffer> accept(int offerId) async {
    final response = await _dio.post('/delivery/offers/$offerId/accept');
    return DeliveryOffer(
      Map<String, dynamic>.from(
        response.data['offer'] ?? response.data['data'] ?? {},
      ),
    );
  }

  Future<void> decline(int offerId) async {
    await _dio.post('/delivery/offers/$offerId/decline');
  }

  Future<void> confirmDeliveryOtp(int orderId, String otp) async {
    await submitProof(orderId, {'delivery_code': otp});
  }

  Future<void> updateDeliveryStage(int orderId, DeliveryStage stage) async {
    await _dio.patch(
      '/delivery/orders/$orderId/status',
      data: {'delivery_status': stage.apiValue, 'status': stage.apiValue},
    );
  }

  Future<void> submitProof(int orderId, Map<String, dynamic> proof) async {
    await _dio.post('/delivery/orders/$orderId/proof', data: proof);
  }
}
