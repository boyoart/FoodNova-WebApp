import 'package:geolocator/geolocator.dart';

class DispatchLocationException implements Exception {
  const DispatchLocationException(this.message);
  final String message;

  @override
  String toString() => message;
}

class LocationService {
  Future<Position> current({bool requestBackground = false}) async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw const DispatchLocationException(
        'Enable location services to go online.',
      );
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      throw const DispatchLocationException(
        'Allow location permission to go online.',
      );
    }
    if (requestBackground && permission == LocationPermission.whileInUse) {
      final backgroundPermission = await Geolocator.requestPermission();
      if (backgroundPermission == LocationPermission.denied ||
          backgroundPermission == LocationPermission.deniedForever) {
        throw const DispatchLocationException(
          'Allow background location so FoodNova can track active deliveries.',
        );
      }
    }
    final position = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 20),
      ),
    );
    if (!isValidPosition(position)) {
      throw const DispatchLocationException(
        'Unable to read a valid GPS location. Move to an open area and try again.',
      );
    }
    return position;
  }

  bool isValidPosition(Position position) {
    final latitude = position.latitude;
    final longitude = position.longitude;
    if (latitude == 0 && longitude == 0) return false;
    if (latitude.isNaN || longitude.isNaN) return false;
    if (latitude < -90 || latitude > 90) return false;
    if (longitude < -180 || longitude > 180) return false;
    return true;
  }
}

Map<String, dynamic> locationPayload(Position position) {
  final timestamp = position.timestamp.toUtc().toIso8601String();
  return {
    'latitude': position.latitude,
    'longitude': position.longitude,
    'accuracy': position.accuracy,
    'heading': position.heading,
    'speed': position.speed,
    'timestamp': timestamp,
    'updatedAt': timestamp,
  };
}
