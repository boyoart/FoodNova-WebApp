// Typed-ish endpoint wrappers for the FoodNova rider (delivery) API.
// All calls hit the existing production backend. Responses are loosely typed
// because the backend OpenAPI marks them as `any`; screens defensively read fields.

import { api, extractToken, setToken } from "./client";

export type Coords = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp?: string | null;
};

// ---------- AUTH ----------
export const AuthApi = {
  checkEmail: (email: string) =>
    api("/delivery/auth/check-email", { method: "POST", auth: false, body: { email } }),

  checkPhone: (phone_number: string) =>
    api("/delivery/auth/check-phone", { method: "POST", auth: false, body: { phone_number } }),

  sendOtp: (email: string) =>
    api("/delivery/auth/send-otp", { method: "POST", auth: false, body: { email } }),

  verifyOtp: (email: string, otp: string) =>
    api("/delivery/auth/verify-otp", { method: "POST", auth: false, body: { email, otp } }),

  register: (payload: {
    full_name: string;
    email: string;
    phone_number: string;
    country_code?: string;
    password: string;
    otp?: string;
    worker_type?: string;
  }) =>
    api("/delivery/auth/register", {
      method: "POST",
      auth: false,
      body: { country_code: "+234", worker_type: "rider", ...payload },
    }),

  login: async (phone_number: string, password: string) => {
    const data = await api("/delivery/auth/login", {
      method: "POST",
      auth: false,
      body: { phone_number, password },
    });
    const token = extractToken(data);
    if (token) await setToken(token);
    return { data, token };
  },

  // Smart login: accepts email OR phone.
  // - phone  -> dedicated rider login /delivery/auth/login (phone-only backend)
  // - email  -> unified /auth/login; caller must verify it grants a rider session
  smartLogin: async (identifier: string, password: string) => {
    const isEmail = identifier.includes("@");
    const data = isEmail
      ? await api("/auth/login", { method: "POST", auth: false, body: { email: identifier, password } })
      : await api("/delivery/auth/login", {
          method: "POST",
          auth: false,
          body: { phone_number: identifier, password },
        });
    const token = extractToken(data);
    if (token) await setToken(token);
    return { data, token, isEmail };
  },

  logout: async () => {
    try {
      await api("/delivery/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    await setToken(null);
  },

  changePassword: (current_password: string, new_password: string) =>
    api("/auth/change-password", {
      method: "POST",
      body: { current_password, new_password },
    }),
};

// ---------- PROFILE / STATUS ----------
export const RiderApi = {
  me: () => api("/delivery/me"),
  profile: () => api("/delivery/profile/me"),
  verificationStatus: () => api("/delivery/verification-status"),
  onboardingProgress: () => api("/delivery/onboarding/progress"),
  stats: () => api("/delivery/stats"),

  updateProfile: (payload: Record<string, any>) =>
    api("/delivery/profile", { method: "PATCH", body: payload }),

  verifyNin: (nin: string) =>
    api("/delivery/verify-nin", {
      method: "POST",
      body: {
        nin,
        consent: true,
        consentAccepted: true,
        consentTimestamp: new Date().toISOString(),
      },
    }),

  emergencyContact: (payload: {
    full_name: string;
    relationship: string;
    phone_number: string;
    alternate_phone?: string | null;
  }) => api("/delivery/emergency-contact", { method: "POST", body: payload }),

  submitOnboarding: () => api("/delivery/submit-onboarding", { method: "POST", body: { submit: true } }),

  uploadSelfie: (form: FormData) =>
    api("/delivery/upload-selfie", { method: "POST", body: form, isForm: true }),

  uploadDocument: (form: FormData) =>
    api("/delivery/upload-document", { method: "POST", body: form, isForm: true }),

  // ---------- DISPATCH ----------
  goOnline: (coords?: Coords | null) =>
    api("/delivery/go-online", { method: "POST", body: coords ?? null }),

  goOffline: () => api("/delivery/go-offline", { method: "POST" }),

  offers: () => api("/delivery/offers"),
  acceptOffer: (offerId: string) => api(`/delivery/offers/${offerId}/accept`, { method: "POST" }),
  declineOffer: (offerId: string, reason?: string) =>
    api(`/delivery/offers/${offerId}/decline`, { method: "POST", body: { reason: reason ?? null } }),

  orders: (status?: string) =>
    api(`/delivery/orders${status ? `?status=${encodeURIComponent(status)}` : ""}`),

  updateOrderStatus: (orderId: string, status: string, note?: string) =>
    api(`/delivery/orders/${orderId}/status`, {
      method: "PATCH",
      body: { delivery_status: status, status, note: note ?? null },
    }),

  submitProof: (
    orderId: string,
    payload: { delivery_code?: string; photo_url?: string; note?: string }
  ) => api(`/delivery/orders/${orderId}/proof`, { method: "POST", body: payload }),

  locationPing: (coords: Coords) =>
    api("/delivery/location-ping", { method: "POST", body: coords }),

  panicAlert: (coords: Coords) =>
    api("/delivery/panic-alert", { method: "POST", body: coords }),
};

// ---------- NOTIFICATIONS ----------
export const NotifApi = {
  list: () => api("/notifications"),
  unreadCount: () => api("/notifications/unread-count"),
  markRead: (id: string) => api(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () => api("/notifications/read-all", { method: "PATCH" }),
  registerFcmToken: (token: string, platform: string) =>
    api("/delivery-workers/register-fcm-token", {
      method: "POST",
      body: { token, platform },
    }),
};
