import { pick } from "@/src/lib/normalize";

const ORDER_ID_KEYS = [
  "order_id",
  "orderId",
  "delivery_order_id",
  "deliveryOrderId",
  "dispatch_order_id",
  "dispatchOrderId",
  "order.id",
  "order.order_id",
  "order.orderId",
  "order._id",
  "assignment.order_id",
  "assignment.orderId",
  "data.order_id",
  "data.orderId",
  "metadata.order_id",
  "metadata.orderId",
  "id",
  "_id",
];

const OFFER_ID_KEYS = ["offer_id", "offerId", "id", "_id"];

export function deliveryOrderId(source: any): string {
  return String(pick(source, ORDER_ID_KEYS, "") || "");
}

export function deliveryOfferId(source: any): string {
  return String(pick(source, OFFER_ID_KEYS, "") || "");
}
