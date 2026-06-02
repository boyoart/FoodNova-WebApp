import 'package:flutter/material.dart';

import '../../../core/widgets/fn_widgets.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  String filter = 'All';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Delivery history')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const TextField(
            decoration: InputDecoration(
              prefixIcon: Icon(Icons.search),
              labelText: 'Search by customer, date, amount',
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: ['All', 'Date', 'Status', 'Customer', 'Amount']
                .map(
                  (item) => ChoiceChip(
                    label: Text(item),
                    selected: filter == item,
                    onSelected: (_) => setState(() => filter = item),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 18),
          const FnCard(
            child: Text(
              'No delivery history returned yet. This view is prepared for the existing delivery history endpoint once available.',
            ),
          ),
        ],
      ),
    );
  }
}
