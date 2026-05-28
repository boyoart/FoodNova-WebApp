import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'firebase_options.dart';
import 'routes/app_router.dart';
import 'services/notification_service.dart';
import 'services/app_security_service.dart';

Future<void> main() async {
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();
    FlutterError.onError = (details) {
      FlutterError.presentError(details);
    };
    final firebaseReady = await _initializeFirebase();
    await NotificationService.bootstrap(firebaseReady: firebaseReady);
    runApp(ProviderScope(
      overrides: const [],
      child: const _FoodNovaBootstrap(),
    ));
  }, (error, stack) {
    debugPrint('[FoodNova Uncaught] $error');
    debugPrintStack(stackTrace: stack);
  });
}

class _FoodNovaBootstrap extends ConsumerStatefulWidget {
  const _FoodNovaBootstrap();

  @override
  ConsumerState<_FoodNovaBootstrap> createState() => _FoodNovaBootstrapState();
}

class _FoodNovaBootstrapState extends ConsumerState<_FoodNovaBootstrap> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(appSecurityServiceProvider).deleteLegacyPinStorage();
    });
  }

  @override
  Widget build(BuildContext context) => const FoodNovaApp();
}

Future<bool> _initializeFirebase() async {
  try {
    if (Firebase.apps.isNotEmpty) return true;
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
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
