export const NGN = "NGN ";

export function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (n === null || n === undefined || isNaN(n as number)) return `${NGN}0`;
  return `${NGN}${(n as number).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function formatDistanceKm(km: number | null | undefined): string {
  if (km === null || km === undefined || isNaN(km)) return "--";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (isNaN(d)) return "";
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Normalise a status string into a friendly label + palette key.
export function statusMeta(status?: string | null): {
  label: string;
  tone: "brand" | "success" | "warning" | "error" | "muted";
} {
  const s = (status || "").toLowerCase();
  if (["delivered", "completed", "complete", "approved", "online", "active"].includes(s))
    return { label: pretty(s), tone: "success" };
  if (["pending", "in_review", "review", "submitted", "processing", "assigned"].includes(s))
    return { label: pretty(s), tone: "warning" };
  if (["rejected", "failed", "cancelled", "canceled", "declined", "offline"].includes(s))
    return { label: pretty(s), tone: s === "offline" ? "muted" : "error" };
  if (["picked_up", "en_route", "enroute", "arrived", "accepted", "out_for_delivery"].includes(s))
    return { label: pretty(s), tone: "brand" };
  return { label: pretty(s || "unknown"), tone: "muted" };
}

function pretty(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// The backend does not filter /delivery/orders by ?status=, so we bucket client-side.
export function orderBucket(status?: string | null): "active" | "completed" | "cancelled" {
  const s = (status || "").toLowerCase();
  if (["delivered", "completed", "complete", "fulfilled", "confirmed_delivery"].includes(s))
    return "completed";
  if (["cancelled", "canceled", "failed", "rejected", "returned"].includes(s)) return "cancelled";
  return "active";
}

export function orderStatus(o: any): string {
  return (o?.delivery_status || o?.status || o?.order_status || "").toString();
}
