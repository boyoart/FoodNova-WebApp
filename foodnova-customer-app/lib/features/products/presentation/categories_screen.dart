import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../widgets/fn_shell.dart';
import '../data/product_repository.dart';

class CategoriesScreen extends ConsumerWidget {
  const CategoriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = ref.watch(categoriesProvider);
    return FnShell(
      title: 'Categories',
      child: categories.when(
        data: (items) => ListView.separated(
          itemBuilder: (_, index) => ListTile(
            leading: const Icon(Icons.spa_rounded),
            title: Text(items[index]),
            trailing: const Icon(Icons.chevron_right_rounded),
          ),
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemCount: items.length,
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Text(error.toString()),
      ),
    );
  }
}
