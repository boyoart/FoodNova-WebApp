class OrderSummary {
  const OrderSummary({
    required this.id,
    required this.orderCode,
    required this.totalAmount,
    required this.status,
    required this.deliveryStatus,
  });

  final int id;
  final String orderCode;
  final double totalAmount;
  final String status;
  final String deliveryStatus;

  factory OrderSummary.fromJson(Map<String, dynamic> json) {
    return OrderSummary(
      id: int.tryParse('${json['id']}') ?? 0,
      orderCode: '${json['order_code'] ?? ''}',
      totalAmount: double.tryParse('${json['total_amount'] ?? 0}') ?? 0,
      status: '${json['order_status'] ?? json['status'] ?? ''}',
      deliveryStatus: '${json['delivery_status'] ?? ''}',
    );
  }
}
