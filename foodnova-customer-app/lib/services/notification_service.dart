import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../firebase_options.dart';
import 'notification_destination.dart';

@pragma('vm:entry-point')
Future<void> foodNovaFirebaseMessagingBackgroundHandler(
    RemoteMessage message) async {
  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
    }
  } catch (error) {
    // Native Firebase config is injected per release environment.
    debugPrint('[FoodNova Push] background Firebase skipped: $error');
  }
  await NotificationService.markRefreshPending();
}

class NotificationService {
  static bool _bootstrapped = false;
  static bool _routerAttached = false;
  static bool _firebaseReady = false;
  static bool _localNotificationsReady = false;
  static bool _pendingNotificationNavigation = false;
  static String? _pendingNavigationTarget;
  static String? _pendingLocalPayload;
  static int? _pendingReadNotificationId;
  static GoRouter? _router;
  static final StreamController<void> _refreshController =
      StreamController<void>.broadcast();
  static final StreamController<int> _readController =
      StreamController<int>.broadcast();
  static final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();
  static const AndroidNotificationChannel _androidChannel =
      AndroidNotificationChannel(
    'foodnova_customer_updates',
    'FoodNova updates',
    description: 'Order, payment, promotion, and delivery updates.',
    importance: Importance.max,
    playSound: true,
    enableVibration: true,
  );

  static Future<void> bootstrap({required bool firebaseReady}) async {
    if (_bootstrapped) return;
    _bootstrapped = true;
    _firebaseReady = firebaseReady;
    try {
      await _localNotifications.initialize(
        InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(),
        ),
        onDidReceiveNotificationResponse: (response) {
          final payload = response.payload;
          _emitRefresh();
          final router = _router;
          if (router == null) {
            _pendingLocalPayload = payload;
            _pendingNotificationNavigation = true;
            return;
          }
          _routeFromPayload(router, payload);
        },
      );
      _localNotificationsReady = true;
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(_androidChannel);
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
      if (!_firebaseReady) {
        debugPrint(
            '[FoodNova Push] push notifications disabled for this build.');
        return;
      }
      FirebaseMessaging.onBackgroundMessage(
          foodNovaFirebaseMessagingBackgroundHandler);
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
        _emitRefresh();
      });
    } catch (error) {
      // Firebase options are environment-specific and will be wired during Android release setup.
      debugPrint('[FoodNova Push] bootstrap skipped: $error');
    }
  }

  static Future<String?> currentToken() async {
    if (!_firebaseReady || Firebase.apps.isEmpty) return null;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      debugPrint(
          'FCM_TOKEN: ${token == null || token.isEmpty ? 'missing' : token}');
      return token;
    } catch (error) {
      debugPrint('[FoodNova Push] token unavailable: $error');
      return null;
    }
  }

  static Stream<String> get tokenRefreshStream {
    if (!_firebaseReady || Firebase.apps.isEmpty) return const Stream.empty();
    return FirebaseMessaging.instance.onTokenRefresh;
  }

  static Stream<void> get refreshStream => _refreshController.stream;
  static Stream<int> get readStream => _readController.stream;

  static int? consumePendingReadNotificationId() {
    final id = _pendingReadNotificationId;
    _pendingReadNotificationId = null;
    return id;
  }

  static void acknowledgePendingReadNotification(int id) {
    if (_pendingReadNotificationId == id) _pendingReadNotificationId = null;
  }

  static bool consumePendingNotificationNavigation() {
    final pending = _pendingNotificationNavigation;
    _pendingNotificationNavigation = false;
    return pending;
  }

  static String? consumePendingNavigationTarget() {
    final target = _pendingNavigationTarget;
    _pendingNavigationTarget = null;
    _pendingNotificationNavigation = false;
    return target;
  }

  static Future<void> markRefreshPending() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool('foodnova_notification_refresh_pending', true);
    } catch (error) {
      debugPrint('[FoodNova Push] refresh marker skipped: $error');
    }
  }

  static Future<bool> consumePendingRefresh() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final pending =
          preferences.getBool('foodnova_notification_refresh_pending') ?? false;
      if (pending) {
        await preferences.remove('foodnova_notification_refresh_pending');
      }
      return pending;
    } catch (error) {
      debugPrint('[FoodNova Push] refresh marker read skipped: $error');
      return false;
    }
  }

  static void attachRouter(GoRouter router) {
    _router = router;
    if (_routerAttached) return;
    _routerAttached = true;
    if (_pendingLocalPayload != null) {
      final payload = _pendingLocalPayload;
      _pendingLocalPayload = null;
      _routeFromPayload(router, payload);
    }
    if (!_firebaseReady || Firebase.apps.isEmpty) return;
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      _emitRefresh();
      _routeFromMessage(router, message);
    });
    FirebaseMessaging.instance.getInitialMessage().then((message) {
      if (message != null) {
        _emitRefresh();
        _rememberDestination(resolveCustomerNotification(message.data));
      }
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
      title.trim().isEmpty ? 'FoodNova update' : title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _androidChannel.id,
          _androidChannel.name,
          channelDescription: _androidChannel.description,
          importance: Importance.high,
          priority: Priority.max,
          playSound: true,
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
      payload: jsonEncode(message.data),
    );
    debugPrint('NOTIFICATION DISPLAYED ${message.data}');
  }

  static void _routeFromMessage(GoRouter router, RemoteMessage message) {
    _routeToDestination(router, resolveCustomerNotification(message.data));
  }

  static void _routeFromPayload(GoRouter router, String? payload) {
    try {
      final decoded = jsonDecode(payload ?? '');
      if (decoded is Map) {
        _routeToDestination(router,
            resolveCustomerNotification(Map<String, dynamic>.from(decoded)));
        return;
      }
    } catch (_) {}
    _routeToTarget(router, payload);
  }

  static void _routeToDestination(
      GoRouter router, NotificationDestination destination) {
    _rememberDestination(destination);
    _emitRefresh();
    Future<void>.microtask(() => router.go(destination.route));
  }

  static void _routeToTarget(GoRouter router, String? target) {
    final route = _normalizeTarget(target);
    _rememberTarget(route);
    _emitRefresh();
    Future<void>.microtask(() => router.go(route));
  }

  static void _rememberTarget(String? target) {
    _pendingNotificationNavigation = true;
    _pendingNavigationTarget = _normalizeTarget(target);
  }

  static void _rememberDestination(NotificationDestination destination) {
    _rememberTarget(destination.route);
    final id = destination.notificationId;
    if (id != null && !_readController.isClosed) {
      _pendingReadNotificationId = id;
      _readController.add(id);
    }
  }

  static String _normalizeTarget(String? target) {
    final value = (target ?? '').trim();
    if (value.startsWith('/tracking/') || value == '/notifications') {
      return value;
    }
    return '/notifications';
  }

  static void _emitRefresh() {
    unawaited(markRefreshPending());
    _refreshController.add(null);
    Future<void>.delayed(const Duration(milliseconds: 1200), () {
      if (!_refreshController.isClosed) {
        _refreshController.add(null);
      }
    });
  }
}
