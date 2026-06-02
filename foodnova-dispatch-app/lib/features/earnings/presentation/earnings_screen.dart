import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/widgets/fn_widgets.dart';

class EarningsScreen extends StatelessWidget {
  const EarningsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(symbol: 'NGN ', decimalDigits: 0);
    return Scaffold(
      appBar: AppBar(title: const Text('Earnings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          StatTile(label: 'Today', value: money.format(0), icon: Icons.today),
          const SizedBox(height: 10),
          StatTile(
            label: 'This Week',
            value: money.format(0),
            icon: Icons.date_range,
          ),
          const SizedBox(height: 10),
          StatTile(
            label: 'This Month',
            value: money.format(0),
            icon: Icons.calendar_month,
          ),
          const SizedBox(height: 10),
          StatTile(
            label: 'Lifetime Earnings',
            value: money.format(0),
            icon: Icons.account_balance_wallet_outlined,
          ),
          const SizedBox(height: 10),
          const FnCard(
            child: Text(
              'Completed Deliveries: 0\nAverage Earnings: NGN 0\n\nEarnings API is not exposed yet in the current backend. This screen is ready to bind once admin rider earnings are available.',
            ),
          ),
        ],
      ),
    );
  }
}
