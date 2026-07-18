import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/state/session_controller.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'firebase_options.dart';
import 'features/notifications/data/notifications_repository.dart';
import 'features/products/data/product_repository.dart';
import 'routes/app_router.dart';
import 'services/notification_service.dart';
import 'services/app_security_service.dart';

Future<void> main() async {
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();
    FlutterError.onError = (details) {
      FlutterError.presentError(details);
    };
    runApp(ProviderScope(
      overrides: const [],
      child: const _FoodNovaBootstrap(),
    ));
    unawaited(_initializeOptionalServices());
  }, (error, stack) {
    debugPrint('[FoodNova Uncaught] $error');
    debugPrintStack(stackTrace: stack);
  });
}

Future<void> _initializeOptionalServices() async {
  var firebaseReady = false;
  try {
    firebaseReady = await _initializeFirebase().timeout(
      const Duration(seconds: 5),
    );
  } catch (error) {
    debugPrint('[FoodNova Startup] optional Firebase timed out: $error');
  }
  try {
    await NotificationService.bootstrap(firebaseReady: firebaseReady).timeout(
      const Duration(seconds: 6),
    );
  } catch (error) {
    debugPrint('[FoodNova Startup] optional notifications skipped: $error');
  }
}

class _FoodNovaBootstrap extends ConsumerStatefulWidget {
  const _FoodNovaBootstrap();

  @override
  ConsumerState<_FoodNovaBootstrap> createState() => _FoodNovaBootstrapState();
}

class _FoodNovaBootstrapState extends ConsumerState<_FoodNovaBootstrap> {
  StreamSubscription<void>? _notificationRefreshSubscription;
  StreamSubscription<int>? _notificationReadSubscription;
  late final _NotificationLifecycleObserver _notificationLifecycleObserver;

  @override
  void initState() {
    super.initState();
    _notificationLifecycleObserver = _NotificationLifecycleObserver(
      onResume: _refreshNotificationsIfAuthenticated,
    );
    WidgetsBinding.instance.addObserver(_notificationLifecycleObserver);
    _notificationRefreshSubscription =
        NotificationService.refreshStream.listen((_) {
      _refreshNotificationsIfAuthenticated();
    });
    _notificationReadSubscription = NotificationService.readStream.listen(
      _markNotificationRead,
    );
    Future.microtask(() {
      ref.read(appSecurityServiceProvider).deleteLegacyPinStorage();
      _refreshStartupProductData();
      _consumePendingNotificationRefresh();
    });
  }

  @override
  void dispose() {
    _notificationRefreshSubscription?.cancel();
    _notificationReadSubscription?.cancel();
    WidgetsBinding.instance.removeObserver(_notificationLifecycleObserver);
    super.dispose();
  }

  Future<void> _refreshStartupProductData() async {
    try {
      final repository = ref.read(productRepositoryProvider);
      repository.clearCaches();
      await repository.listProducts(forceRefresh: true);
    } catch (error) {
      debugPrint('[FoodNova Products] startup product sync skipped: $error');
    } finally {
      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();
      debugPrint('[FoodNova Products] cleared Flutter image cache');
    }
  }

  Future<void> _consumePendingNotificationRefresh() async {
    final pending = await NotificationService.consumePendingRefresh();
    if (pending) {
      _refreshNotificationsIfAuthenticated();
    }
  }

  void _refreshNotificationsIfAuthenticated() {
    final authenticated =
        ref.read(sessionControllerProvider).valueOrNull == true;
    if (!authenticated) return;
    ref.invalidate(notificationsProvider);
    ref.invalidate(unreadNotificationsProvider);
  }

  Future<void> _markNotificationRead(int id) async {
    final authenticated =
        ref.read(sessionControllerProvider).valueOrNull == true;
    if (!authenticated) return;
    NotificationService.acknowledgePendingReadNotification(id);
    try {
      await ref.read(notificationsRepositoryProvider).markRead(id);
    } catch (error) {
      debugPrint('[FoodNova Push] mark-read deferred: $error');
    } finally {
      _refreshNotificationsIfAuthenticated();
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(sessionControllerProvider, (_, next) {
      if (next.valueOrNull != true) return;
      final pending = NotificationService.consumePendingReadNotificationId();
      if (pending != null) unawaited(_markNotificationRead(pending));
    });
    return const FoodNovaApp();
  }
}

class _NotificationLifecycleObserver extends WidgetsBindingObserver {
  _NotificationLifecycleObserver({required this.onResume});

  final VoidCallback onResume;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      onResume();
    }
  }
}

Future<bool> _initializeFirebase() async {
  try {
    if (Firebase.apps.isNotEmpty) return true;
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    debugPrint('FIREBASE_INITIALIZED');
    return true;
  } catch (error) {
    debugPrint('[FoodNova Firebase] initialization skipped: $error');
    return false;
  }
}

class FoodNovaApp extends ConsumerWidget {
  const FoodNovaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    final themeMode = ref.watch(themeControllerProvider);
    NotificationService.attachRouter(router);
    return MaterialApp.router(
      title: 'FoodNova',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
      themeAnimationDuration: const Duration(milliseconds: 280),
      themeAnimationCurve: Curves.easeOutCubic,
      routerConfig: router,
    );
  }
}
