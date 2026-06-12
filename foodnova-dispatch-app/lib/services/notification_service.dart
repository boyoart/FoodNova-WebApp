import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';

@pragma('vm:entry-point')
Future<void> foodNovaDispatchFirebaseMessagingBackgroundHandler(
  RemoteMessage message,
) async {
  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp();
    }
  } catch (error) {
    debugPrint('[FoodNova Dispatch Push] background Firebase skipped: $error');
  }
}

class DispatchNotificationService {
  static bool _bootstrapped = false;
  static bool _firebaseReady = false;
  static bool _routerAttached = false;
  static bool _localNotificationsReady = false;
  static String? _pendingPayload;
  static GoRouter? _router;
  static final StreamController<void> _refreshController =
      StreamController<void>.broadcast();
  static final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  static const AndroidNotificationChannel _deliveryChannel =
      AndroidNotificationChannel(
    'foodnova_dispatch_delivery',
    'FoodNova dispatch alerts',
    description: 'Delivery assignments, updates, cancellations, and messages.',
    importance: Importance.max,
    playSound: true,
    sound: RawResourceAndroidNotificationSound('delivery_alert'),
    enableVibration: true,
  );

  static Future<void> bootstrap({required bool firebaseReady}) async {
    if (_bootstrapped) return;
    _bootstrapped = true;
    _firebaseReady = firebaseReady;
    try {
      await _localNotifications.initialize(
        const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(),
        ),
        onDidReceiveNotificationResponse: (response) {
          final router = _router;
          if (router == null) {
            _pendingPayload = response.payload;
            return;
          }
          _routeFromPayload(router, response.payload);
        },
      );
      _localNotificationsReady = true;
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(_deliveryChannel);
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();

      if (!_firebaseReady || Firebase.apps.isEmpty) {
        debugPrint(
          '[FoodNova Dispatch Push] Firebase not configured; push disabled.',
        );
        return;
      }
      FirebaseMessaging.onBackgroundMessage(
        foodNovaDispatchFirebaseMessagingBackgroundHandler,
      );
      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      await FirebaseMessaging.instance
          .setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
      FirebaseMessaging.onMessage.listen((message) {
        debugPrint('NOTIFICATION RECEIVED ${message.data}');
        _showForegroundNotification(message);
        _refreshController.add(null);
      });
    } catch (error) {
      debugPrint('[FoodNova Dispatch Push] bootstrap skipped: $error');
    }
  }

  static Future<String?> currentToken() async {
    if (!_firebaseReady || Firebase.apps.isEmpty) return null;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      debugPrint(
          'FCM TOKEN ${token == null || token.isEmpty ? 'missing' : token}');
      return token;
    } catch (error) {
      debugPrint('[FoodNova Dispatch Push] token unavailable: $error');
      return null;
    }
  }

  static Stream<String> get tokenRefreshStream {
    if (!_firebaseReady || Firebase.apps.isEmpty) return const Stream.empty();
    return FirebaseMessaging.instance.onTokenRefresh;
  }

  static Stream<void> get refreshStream => _refreshController.stream;

  static Future<void> showLocalDeliveryUpdate({
    required String title,
    required String body,
    String payload = '/orders',
  }) async {
    if (!_localNotificationsReady) return;
    await _localNotifications.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _deliveryChannel.id,
          _deliveryChannel.name,
          channelDescription: _deliveryChannel.description,
          importance: Importance.max,
          priority: Priority.max,
          playSound: true,
          sound: const RawResourceAndroidNotificationSound('delivery_alert'),
          enableVibration: true,
          visibility: NotificationVisibility.public,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentSound: true,
          presentBadge: true,
        ),
      ),
      payload: payload,
    );
  }

  static void attachRouter(GoRouter router) {
    _router = router;
    if (_routerAttached) return;
    _routerAttached = true;
    if (_pendingPayload != null) {
      _routeFromPayload(router, _pendingPayload);
      _pendingPayload = null;
    }
    if (!_firebaseReady || Firebase.apps.isEmpty) return;
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      _routeFromMessage(router, message);
    });
    FirebaseMessaging.instance.getInitialMessage().then((message) {
      if (message != null) _routeFromMessage(router, message);
    }).catchError((_) {});
  }

  static Future<void> _showForegroundNotification(RemoteMessage message) async {
    if (!_localNotificationsReady) return;
    final title =
        message.notification?.title ?? '${message.data['title'] ?? ''}';
    final body = message.notification?.body ??
        '${message.data['body'] ?? message.data['message'] ?? ''}';
    if (title.trim().isEmpty && body.trim().isEmpty) return;
    await _localNotifications.show(
      message.hashCode,
      title.trim().isEmpty ? 'FoodNova delivery update' : title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _deliveryChannel.id,
          _deliveryChannel.name,
          channelDescription: _deliveryChannel.description,
          importance: Importance.max,
          priority: Priority.max,
          playSound: true,
          sound: const RawResourceAndroidNotificationSound('delivery_alert'),
          enableVibration: true,
          visibility: NotificationVisibility.public,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentSound: true,
          presentBadge: true,
        ),
      ),
      payload: _targetFromData(message.data),
    );
    debugPrint('NOTIFICATION DISPLAYED ${message.data}');
  }

  static void _routeFromMessage(GoRouter router, RemoteMessage message) {
    _routeFromPayload(router, _targetFromData(message.data));
  }

  static String _targetFromData(Map<String, dynamic> data) {
    final orderId = '${data['order_id'] ?? ''}'.trim();
    final offerId = '${data['offer_id'] ?? ''}'.trim();
    if (orderId.isNotEmpty && orderId != 'null') return '/orders';
    if (offerId.isNotEmpty && offerId != 'null') return '/orders';
    return '/notifications';
  }

  static void _routeFromPayload(GoRouter router, String? payload) {
    final target = (payload == null || payload.trim().isEmpty)
        ? '/notifications'
        : payload.trim();
    Future<void>.microtask(() => router.go(target));
  }
}
