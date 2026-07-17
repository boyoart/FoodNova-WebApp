export type NotificationDestination = {
  route: string;
  offerId?: string;
  notificationId?: string;
};

function explicit(source: any, keys: string[]): string {
  for (const key of keys) {
    const value = source?.[key] ?? source?.data?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return "";
}

export function notificationIdFrom(source: any): string {
  return explicit(source, ["notification_id"]);
}

export function notificationOrderId(source: any): string {
  return explicit(source, ["order_id", "orderId", "delivery_order_id", "deliveryOrderId"]);
}

export function notificationOfferId(source: any): string {
  return explicit(source, ["offer_id", "offerId"]);
}

export function resolveNotificationDestination(source: any): NotificationDestination {
  const type = explicit(source, ["notification_type", "type", "category"]).toLowerCase();
  const screen = explicit(source, ["screen"]).toLowerCase();
  const destination = explicit(source, ["destination"]);
  const orderId = notificationOrderId(source);
  const offerId = notificationOfferId(source);
  const notificationId = notificationIdFrom(source) || undefined;

  if (offerId || type.includes("offer") || screen === "offers") {
    return { route: "/(tabs)", offerId: offerId || undefined, notificationId };
  }
  if (orderId && (screen === "active_delivery" || destination.includes("/delivery/") || type.includes("assign") || type.includes("pickup") || type.includes("arriv"))) {
    return { route: `/delivery/${orderId}`, notificationId };
  }
  if (type.includes("complete") || type.includes("delivered") || screen === "history") {
    return { route: "/(tabs)/deliveries", notificationId };
  }
  if (type.includes("approv") || type.includes("reject") || screen.includes("approval")) {
    return { route: "/", notificationId };
  }
  if (destination === "/notifications" || screen === "notifications") return { route: "/notifications", notificationId };
  return { route: "/notifications", notificationId };
}
