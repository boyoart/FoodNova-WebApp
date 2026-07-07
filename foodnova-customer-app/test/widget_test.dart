import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:foodnova_customer_app/main.dart';

void main() {
  testWidgets('FoodNova app boots into branded shell',
      (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: FoodNovaApp()));
    await tester.pump();

    expect(find.text('Fresh food at your doorstep'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
