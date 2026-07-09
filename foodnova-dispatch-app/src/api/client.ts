// Low-level HTTP client for the EXISTING FoodNova production backend.
// Base URL comes from EXPO_PUBLIC_FOODNOVA_API. Rider routes are un-prefixed
// (e.g. /delivery/*, /notifications/*). Backend responses use a
// { success, detail|message, ...data } envelope.

import { storage } from "@/src/utils/storage";

export const TOKEN_KEY = "fn_dispatch_token";

const BASE_URL =
  process.env.EXPO_PUBLIC_FOODNOVA_API ?? "https://foodnova-webapp.onrender.com";

let inMemoryToken: string | null = null;

export async function setToken(token: string | null) {
  inMemoryToken = token;
  if (token) await storage.secureSet(TOKEN_KEY, token);
  else await storage.secureRemove(TOKEN_KEY);
}

export async function loadToken(): Promise<string | null> {
  if (inMemoryToken) return inMemoryToken;
  const t = await storage.secureGet<string>(TOKEN_KEY, "");
  inMemoryToken = t && t.length > 0 ? t : null;
  return inMemoryToken;
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

type Options = {
  method?: string;
  body?: any;
  auth?: boolean;
  isForm?: boolean;
  signal?: AbortSignal;
};

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const { method = "GET", body, auth = true, isForm = false, signal } = opts;
  const headers: Record<string, string> = { Accept: "application/json" };

  if (auth) {
    const token = await loadToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let payload: any = undefined;
  if (body !== undefined) {
    if (isForm) {
      payload = body; // FormData
    } else {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload, signal });
  } catch (e: any) {
    throw new ApiError(e?.message || "Network error. Check your connection.", 0, null);
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      (data && (data.detail || data.message || data.error)) ||
      `Request failed (${res.status})`;
    throw new ApiError(typeof msg === "string" ? msg : "Request failed", res.status, data);
  }

  return data as T;
}

export function extractToken(data: any): string | null {
  if (!data) return null;
  return (
    data.access_token ||
    data.token ||
    data.jwt ||
    data.accessToken ||
    (data.data && (data.data.access_token || data.data.token)) ||
    null
  );
}

export { BASE_URL };
