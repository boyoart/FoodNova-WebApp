import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://foodnova-webapp.onrender.com";

export const resolveMediaUrl = (value = "") => {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  const base = API_BASE_URL.replace(/\/+$/, "");
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

const isAdminRequest = (url = "") => /^\/(?:api\/)?admin(?:\/|$)/.test(url);

const getAuthToken = (url = "") => {
  if (isAdminRequest(url)) {
    return localStorage.getItem("admin_token");
  }

  return (
    localStorage.getItem("foodnova_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("admin_token")
  );
};

api.interceptors.request.use((config) => {
  const token = getAuthToken(config.url);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

const normalizeList = (body, keys = []) => {
  if (Array.isArray(body)) return body;
  for (const key of keys) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.items)) return body.items;
  return [];
};

export const productsAPI = {
  getAll: async (params = {}) => await api.get("/products", { params }),
  getById: async (id) => await api.get(`/products/${id}`),
};

export const packsAPI = {
  getAll: async (params = {}) => await api.get("/packs", { params }),
  getById: async (id) => await api.get(`/packs/${id}`),
};

export const categoriesAPI = {
  getAll: async () => await api.get("/categories"),
};

export const announcementsAPI = {
  getActive: async () => await api.get("/announcements/active"),
};

export const websiteSettingsAPI = {
  get: async () => {
    const response = await api.get("/website-settings");
    return response.data?.settings || response.data?.data || response.data || {};
  },
  getAdmin: async () => {
    const response = await api.get("/admin/website-settings");
    return response.data?.settings || response.data?.data || response.data || {};
  },
  update: async (payload) => {
    const response = await api.patch("/admin/website-settings", payload);
    return response.data?.settings || response.data?.data || response.data || {};
  },
  subscribe: async (email) => {
    const response = await api.post("/coming-soon/subscribe", { email });
    return response.data;
  },
};

export const authAPI = {
  login: async (payload) => await api.post("/auth/login", payload),
  adminLogin: async (payload) => await api.post("/api/admin/login", payload),
  register: async (payload) => await api.post("/auth/register", payload),
  me: async () => await api.get("/auth/me"),
};

export const profileAPI = {
  getProfile: async () => {
    const response = await api.get('/profile')
    return response.data
  },
  updateProfile: async (payload) => {
    const response = await api.patch('/profile', payload)
    return response.data
  },
  getAddresses: async () => {
    const response = await api.get('/profile/addresses')
    return response.data
  },
  createAddress: async (payload) => {
    const response = await api.post('/profile/addresses', payload)
    return response.data
  },
  updateAddress: async (id, payload) => {
    const response = await api.patch(`/profile/addresses/${id}`, payload)
    return response.data
  },
  deleteAddress: async (id) => {
    const response = await api.delete(`/profile/addresses/${id}`)
    return response.data
  },
  setDefaultAddress: async (id) => {
    const response = await api.patch(`/profile/addresses/${id}/default`)
    return response.data
  },
}

export const ordersAPI = {
  create: async (payload) => {
    const response = await api.post("/orders", payload);
    return response.data;
  },

  getMine: async () => {
    const response = await api.get("/orders/my");
    return response.data;
  },

  getCustomerOrders: async () => {
    const response = await api.get("/orders/my");
    const orders = normalizeList(response.data, ["orders"]);
    return { data: orders };
  },

  getById: async (id) => {
    const response = await api.get(`/orders/${id}`);
    return response.data;
  },

  uploadReceipt: async (orderId, fileOrFormData) => {
    const formData = fileOrFormData instanceof FormData
      ? fileOrFormData
      : new FormData();

    if (!(fileOrFormData instanceof FormData)) {
      formData.append("file", fileOrFormData);
    }

    const headers = {};
    const token = getAuthToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/orders/${orderId}/receipt`, {
      method: "POST",
      headers,
      body: formData,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw {
        response: { status: response.status, data },
        message: data?.detail || "Receipt upload failed",
      };
    }

    return data;
  },

  confirmDelivery: async (orderId, code) => {
    const response = await api.post(`/orders/${orderId}/confirm-delivery`, {
      delivery_code: code,
    });
    return response.data;
  },
};

export const trackingAPI = {
  trackOrder: async (payload) => {
    const response = await api.post("/track-order", payload);
    return response.data;
  },
};

export const adminAPI = {
  getOrders: async (params = {}) => {
    const response = await api.get("/admin/orders", { params });
    return response.data;
  },

  getOrder: async (id) => {
    const response = await api.get(`/admin/orders/${id}`);
    return response.data;
  },

  updateOrder: async (id, payload) => {
    const response = await api.patch(`/admin/orders/${id}`, payload);
    return response.data;
  },

  updateOrderStatus: async (id, payload) => {
    const status = payload.status;
    const response = await api.patch(`/admin/orders/${id}`, {
      ...payload,
      status,
      order_status: status,
      fulfillment_status: status,
    });
    return response.data;
  },

  updatePaymentStatus: async (id, payload) => {
    const response = await api.patch(`/admin/orders/${id}`, {
      ...payload,
      payment_status: payload.payment_status || payload.status,
      status: payload.status || payload.payment_status,
    });
    return response.data;
  },

  updateFulfillmentStatus: async (id, payload) => {
    const response = await api.patch(`/admin/orders/${id}`, {
      ...payload,
      order_status: payload.order_status || payload.status,
      fulfillment_status: payload.fulfillment_status || payload.status,
      status: payload.status || payload.order_status || payload.fulfillment_status,
    });
    return response.data;
  },

  assignRider: async (id, payload) => {
    const response = await api.patch(`/admin/orders/${id}/assign-rider`, payload);
    return response.data;
  },

  getProducts: async () => {
    const response = await api.get("/admin/products");
    const products = normalizeList(response.data, ["products"]);
    return { data: products, raw: response.data };
  },

  getStock: async () => {
    const response = await api.get("/admin/products");
    const products = normalizeList(response.data, ["products"]);
    return { data: products, raw: response.data };
  },

  createProduct: async (payload) => {
    const response = await api.post("/admin/products", payload);
    return response.data;
  },

  updateProduct: async (id, payload) => {
    const response = await api.patch(`/admin/products/${id}`, payload);
    return response.data;
  },

  updateStock: async (id, payload) => {
    const response = await api.patch(`/admin/products/${id}`, payload);
    return response.data;
  },

  deleteProduct: async (id) => {
    const response = await api.delete(`/admin/products/${id}`);
    return response.data;
  },

  getPacks: async () => {
    const response = await api.get("/admin/packs");
    const packs = normalizeList(response.data, ["packs"]);
    return { data: packs, raw: response.data };
  },

  createPack: async (payload) => {
    const response = await api.post("/admin/packs", payload);
    return response.data;
  },

  updatePack: async (id, payload) => {
    const response = await api.patch(`/admin/packs/${id}`, payload);
    return response.data;
  },

  deletePack: async (id) => {
    const response = await api.delete(`/admin/packs/${id}`);
    return response.data;
  },

  getDashboardStats: async () => {
    const fallback = {
      total_orders: 0,
      total_revenue: 0,
      total_products: 0,
      pending_payments: 0,
      receipt_submitted: 0,
      delivered_orders: 0,
    };

    try {
      const [ordersRes, productsRes] = await Promise.allSettled([
        api.get("/admin/orders"),
        api.get("/admin/products"),
      ]);

      const orders = ordersRes.status === "fulfilled"
        ? normalizeList(ordersRes.value.data, ["orders"])
        : [];
      const products = productsRes.status === "fulfilled"
        ? normalizeList(productsRes.value.data, ["products"])
        : [];

      const getPaymentStatus = (order) => String(order.payment_status || order.status || "").toLowerCase();
      const getOrderStatus = (order) => String(order.order_status || order.fulfillment_status || order.status || "").toLowerCase();

      return {
        data: {
          total_orders: orders.length,
          total_revenue: orders.reduce((sum, order) => sum + Number(order.total_amount || order.total || 0), 0),
          total_products: products.length,
          pending_payments: orders.filter((order) => getPaymentStatus(order) === "pending_payment").length,
          receipt_submitted: orders.filter((order) => getPaymentStatus(order) === "receipt_submitted").length,
          delivered_orders: orders.filter((order) => getOrderStatus(order) === "delivered").length,
        },
      };
    } catch (error) {
      console.warn("Failed to calculate dashboard stats. Using fallback.", error);
      return { data: fallback };
    }
  },

  getPendingPayments: async () => {
    const response = await api.get("/admin/orders");
    const orders = normalizeList(response.data, ["orders"]);
    return {
      data: orders.filter((order) =>
        String(order.payment_status || order.status || "").toLowerCase() === "receipt_submitted"
      ),
    };
  },

  approvePayment: async (id) => {
    const response = await api.patch(`/admin/orders/${id}`, {
      status: "payment_confirmed",
      payment_status: "payment_confirmed",
    });
    return response.data;
  },

  rejectPayment: async (id, payload = {}) => {
    const response = await api.patch(`/admin/orders/${id}`, {
      ...payload,
      status: "payment_rejected",
      payment_status: "payment_rejected",
    });
    return response.data;
  },

  getBroadcasts: async () => {
    const response = await api.get("/admin/broadcasts");
    return response.data;
  },

  createBroadcast: async (payload) => {
    const response = await api.post("/admin/broadcasts", payload);
    return response.data;
  },

  updateBroadcast: async (id, payload) => {
    const response = await api.patch(`/admin/broadcasts/${id}`, payload);
    return response.data;
  },

  deleteBroadcast: async (id) => {
    const response = await api.delete(`/admin/broadcasts/${id}`);
    return response.data;
  },

  // Delivery Rider Management (from delivery_workers table)
  getRiders: async (params = {}) => {
    const response = await api.get("/admin/riders", { params });
    const riders = normalizeList(response.data, ["riders", "workers", "data"]);
    return { data: riders, raw: response.data };
  },

  createRider: async (payload) => {
    const response = await api.post("/admin/riders", payload);
    return response.data;
  },

  updateRider: async (id, payload) => {
    const response = await api.patch(`/admin/riders/${id}`, payload);
    return response.data;
  },

  deactivateRider: async (id) => {
    const response = await api.delete(`/admin/riders/${id}`);
    return response.data;
  },

  deleteRider: async (id) => {
    const response = await api.delete(`/admin/riders/${id}`);
    return response.data;
  },

  getRiderVerificationQueue: async (params = {}) => {
    const response = await api.get("/admin/rider-verification-queue", { params });
    const riders = normalizeList(response.data, ["riders", "data"]);
    return { data: riders, counts: response.data?.counts || {}, raw: response.data };
  },

  reviewRiderVerification: async (id, action, payload = {}) => {
    const response = await api.post(`/admin/rider-verification-queue/${id}/${action}`, payload);
    return response.data;
  },

  permanentlyDeleteRiderVerification: async (id) => {
    const response = await api.delete(`/admin/rider-verification-queue/${id}`);
    return response.data;
  },

  getNinProviderStatus: async () => {
    const response = await api.get("/admin/nin-provider-status");
    return response.data;
  },

  testNinProvider: async () => {
    const response = await api.get("/admin/nin-provider-status");
    return response.data;
  },

  checkNinProviderBalance: async () => {
    const response = await api.get("/admin/diagnostics/nin-provider/balance");
    return response.data;
  },

  runTestNinVerification: async () => {
    const response = await api.post("/admin/nin-provider-test-verification");
    return response.data;
  },

  getWorkforce: async (params = {}) => {
    const response = await api.get("/admin/workforce", { params });
    const workers = normalizeList(response.data, ["workers", "data"]);
    return { data: workers, raw: response.data };
  },

  updateWorkerStatus: async (id, payload) => {
    const response = await api.patch(`/admin/workforce/${id}/status`, payload);
    return response.data;
  },

  deleteWorker: async (id) => {
    const response = await api.delete(`/admin/rider-verification-queue/${id}`);
    return response.data;
  },

  getDeliveryOffers: async (params = {}) => {
    const response = await api.get("/admin/delivery-offers", { params });
    const offers = normalizeList(response.data, ["offers", "data"]);
    return { data: offers, raw: response.data };
  },

  assignDeliveryOffer: async (id) => {
    const response = await api.post(`/admin/delivery-offers/${id}/assign`);
    return response.data;
  },

  rejectDeliveryOffer: async (id, payload = {}) => {
    const response = await api.post(`/admin/delivery-offers/${id}/reject`, payload);
    return response.data;
  },

  getDeliveryAssignmentMode: async () => {
    const response = await api.get("/admin/delivery-assignment-mode");
    return response.data;
  },

  updateDeliveryAssignmentMode: async (mode) => {
    const response = await api.patch("/admin/delivery-assignment-mode", { mode });
    return response.data;
  },

  getDispatchBoard: async () => {
    const response = await api.get("/admin/dispatch-board");
    return response.data;
  },

  autoAssignDispatchOrder: async (id) => {
    const response = await api.post(`/admin/dispatch-board/orders/${id}/auto-assign`);
    return response.data;
  },

  cancelDispatchOrder: async (id, payload = {}) => {
    const response = await api.patch(`/admin/dispatch-board/orders/${id}/cancel`, payload);
    return response.data;
  },
};

export const notificationsAPI = {
  getAll: async () => {
    const response = await api.get("/notifications");
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await api.get("/notifications/unread-count");
    return response.data;
  },

  markRead: async (id) => {
    const response = await api.patch(`/notifications/${id}/read`);
    return response.data;
  },

  markAllRead: async () => {
    const response = await api.patch("/notifications/read-all");
    return response.data;
  },
};

export const getProducts = async () => {
  const response = await productsAPI.getAll();
  return response.data;
};

export const getPacks = async () => {
  const response = await packsAPI.getAll();
  return response.data;
};

export const getCategories = async () => {
  const response = await categoriesAPI.getAll();
  return response.data;
};

export const loginUser = async (payload) => {
  const response = await authAPI.login(payload);
  return response.data;
};

export const registerUser = async (payload) => {
  const response = await authAPI.register(payload);
  return response.data;
};

export const createOrder = async (payload) => ordersAPI.create(payload);
export const getMyOrders = async () => ordersAPI.getMine();
export const uploadReceipt = async (orderId, formData) => ordersAPI.uploadReceipt(orderId, formData);

export default api;
