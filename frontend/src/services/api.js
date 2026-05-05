import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://foodnova-webapp.onrender.com";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

const getAuthToken = () =>
  localStorage.getItem("foodnova_token") ||
  localStorage.getItem("token") ||
  localStorage.getItem("admin_token");

api.interceptors.request.use((config) => {
  const token = getAuthToken();

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
  getAll: async () => await api.get("/products"),
  getById: async (id) => await api.get(`/products/${id}`),
};

export const packsAPI = {
  getAll: async () => await api.get("/packs"),
  getById: async (id) => await api.get(`/packs/${id}`),
};

export const categoriesAPI = {
  getAll: async () => await api.get("/categories"),
};

export const authAPI = {
  login: async (payload) => await api.post("/auth/login", payload),
  adminLogin: async (payload) => await api.post("/auth/login", payload),
  register: async (payload) => await api.post("/auth/register", payload),
  me: async () => await api.get("/auth/me"),
};

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

export const adminAPI = {
  getOrders: async (params = {}) => {
    const response = await api.get("/admin/orders", { params });
<<<<<<< HEAD
    const orders = normalizeList(response.data, ["orders"]);
    return { data: orders, raw: response.data };
=======
    return response.data;
>>>>>>> 89e45b6 (Fix admin order management and delivery code workflow)
  },

  getOrder: async (id) => {
    const response = await api.get(`/admin/orders/${id}`);
    return response.data;
  },

  updateOrder: async (id, payload) => {
    const response = await api.patch(`/admin/orders/${id}`, payload);
    return response.data;
  },

<<<<<<< HEAD
  updateOrderStatus: async (id, payload = {}) => {
    const status = payload.status || payload.order_status || payload.fulfillment_status;
    const response = await api.patch(`/admin/orders/${id}`, {
      ...payload,
      ...(status ? { status, order_status: status, fulfillment_status: status } : {}),
=======
  updateOrderStatus: async (id, payload) => {
    const status = payload.status;
    const response = await api.patch(`/admin/orders/${id}`, {
      ...payload,
      status,
      order_status: status,
      fulfillment_status: status,
>>>>>>> 89e45b6 (Fix admin order management and delivery code workflow)
    });
    return response.data;
  },

<<<<<<< HEAD
  updatePaymentStatus: async (id, payload = {}) => {
    const paymentStatus = payload.payment_status || payload.status;
    const response = await api.patch(`/admin/orders/${id}`, {
      ...payload,
      ...(paymentStatus ? { payment_status: paymentStatus, status: paymentStatus } : {}),
=======
  updatePaymentStatus: async (id, payload) => {
    const response = await api.patch(`/admin/orders/${id}`, {
      ...payload,
      payment_status: payload.payment_status || payload.status,
      status: payload.status || payload.payment_status,
>>>>>>> 89e45b6 (Fix admin order management and delivery code workflow)
    });
    return response.data;
  },

<<<<<<< HEAD
  updateFulfillmentStatus: async (id, payload = {}) => {
    const status = payload.fulfillment_status || payload.order_status || payload.status;
    const response = await api.patch(`/admin/orders/${id}`, {
      ...payload,
      ...(status ? { fulfillment_status: status, order_status: status, status } : {}),
=======
  updateFulfillmentStatus: async (id, payload) => {
    const response = await api.patch(`/admin/orders/${id}`, {
      ...payload,
      order_status: payload.order_status || payload.status,
      fulfillment_status: payload.fulfillment_status || payload.status,
      status: payload.status || payload.order_status || payload.fulfillment_status,
>>>>>>> 89e45b6 (Fix admin order management and delivery code workflow)
    });
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
