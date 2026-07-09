// Backend responses vary between raw arrays, { data: [] }, { items: [] },
// { offers: [] }, etc. These helpers read them defensively.

export function asList(data: any, ...keys: string[]): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const k of [...keys, "data", "items", "results", "offers", "orders", "notifications"]) {
    if (Array.isArray(data[k])) return data[k];
  }
  return [];
}

export function asObject(data: any, ...keys: string[]): Record<string, any> {
  if (!data || typeof data !== "object") return {};
  for (const k of keys) {
    if (data[k] && typeof data[k] === "object") return data[k];
  }
  return data;
}

export function pick(o: any, keys: string[], fallback: any = null) {
  if (!o) return fallback;
  for (const k of keys) {
    const parts = k.split(".");
    let v: any = o;
    for (const p of parts) v = v?.[p];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return fallback;
}
