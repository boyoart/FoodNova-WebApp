import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_theme.dart';
import 'routes/app_router.dart';

Future<void> main() async {
  await runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();
    FlutterError.onError = (details) {
      FlutterError.presentError(details);
      debugPrint('FLUTTER_ERROR ${details.exceptionAsString()}');
      debugPrint('${details.stack}');
    };
    PlatformDispatcher.instance.onError = (error, stack) {
      debugPrint('PLATFORM_ERROR $error');
      debugPrint('$stack');
      return true;
    };
    try {
      await Firebase.initializeApp();
    } catch (error, stack) {
      debugPrint('FIREBASE_INIT_SKIPPED $error');
      debugPrint('$stack');
      // The dispatch app must still open in local/dev builds without Firebase options.
    }
    runApp(const ProviderScope(child: FoodNovaDispatchApp()));
  }, (error, stack) {
    debugPrint('UNCAUGHT_ZONE_ERROR $error');
    debugPrint('$stack');
  });
}

class FoodNovaDispatchApp extends ConsumerWidget {
  const FoodNovaDispatchApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'FoodNova Dispatch',
      debugShowCheckedModeBanner: false,
      theme: FoodNovaAppTheme.light,
      darkTheme: FoodNovaAppTheme.dark,
      routerConfig: router,
    );
  }
}
