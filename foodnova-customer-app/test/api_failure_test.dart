import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodnova_customer_app/core/network/api_client.dart';

void main() {
  DioException error(DioExceptionType type, {int? status}) => DioException(
        requestOptions: RequestOptions(path: '/auth/me'),
        type: type,
        response: status == null
            ? null
            : Response(
                requestOptions: RequestOptions(path: '/auth/me'),
                statusCode: status),
      );

  test('401 and 403 are invalid saved credentials', () {
    expect(apiFailure(error(DioExceptionType.badResponse, status: 401)).kind,
        ApiFailureKind.unauthorized);
    expect(apiFailure(error(DioExceptionType.badResponse, status: 403)).kind,
        ApiFailureKind.forbidden);
  });

  test('network, timeout, and server restoration failures stay distinct', () {
    expect(apiFailure(error(DioExceptionType.connectionError)).kind,
        ApiFailureKind.network);
    expect(apiFailure(error(DioExceptionType.receiveTimeout)).kind,
        ApiFailureKind.timeout);
    expect(apiFailure(error(DioExceptionType.badResponse, status: 503)).kind,
        ApiFailureKind.server);
  });
}
