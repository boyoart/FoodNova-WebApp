import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_theme.dart';
import 'routes/app_router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
  };
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // The dispatch app must still open in local/dev builds without Firebase options.
  }
  runApp(const ProviderScope(child: FoodNovaDispatchApp()));
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
