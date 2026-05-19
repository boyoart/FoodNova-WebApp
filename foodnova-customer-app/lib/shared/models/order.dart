class OrderSummary {
  const OrderSummary({
    required this.id,
    required this.orderCode,
    required this.totalAmount,
    required this.status,
    required this.deliveryStatus,
    required this.paymentStatus,
    required this.deliveryAddress,
    required this.dispatcherName,
    required this.dispatcherType,
  });

  final int id;
  final String orderCode;
  final double totalAmount;
  final String status;
  final String deliveryStatus;
  final String paymentStatus;
  final String deliveryAddress;
  final String dispatcherName;
  final String dispatcherType;

  factory OrderSummary.fromJson(Map<String, dynamic> json) {
    return OrderSummary(
      id: int.tryParse('${json['id']}') ?? 0,
      orderCode: '${json['order_code'] ?? ''}',
      totalAmount: double.tryParse('${json['total_amount'] ?? 0}') ?? 0,
      status: '${json['order_status'] ?? json['status'] ?? ''}',
      deliveryStatus: '${json['delivery_status'] ?? json['fulfillment_status'] ?? ''}',
      paymentStatus: '${json['payment_status'] ?? ''}',
      deliveryAddress: '${json['delivery_address'] ?? ''}',
      dispatcherName: '${json['assigned_worker_name'] ?? json['rider_name'] ?? ''}',
      dispatcherType: '${json['assigned_worker_type'] ?? json['delivery_method'] ?? ''}',
    );
  }
}
