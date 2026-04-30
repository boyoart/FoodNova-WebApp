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

/* =========================
   PRODUCTS API
   Returns full Axios response because ProductsPage uses response.data
========================= */
export const productsAPI = {
  getAll: async () => {
    return await api.get("/products");
  },

  getById: async (id) => {
    return await api.get(`/products/${id}`);
  },
};

/* =========================
   PACKS API
   Returns full Axios response because ProductsPage uses response.data
========================= */
export const packsAPI = {
  getAll: async () => {
    return await api.get("/packs");
  },

  getById: async (id) => {
    return await api.get(`/packs/${id}`);
  },
};

/* =========================
   CATEGORIES API
========================= */
export const categoriesAPI = {
  getAll: async () => {
    return await api.get("/categories");
  },
};

/* =========================
   AUTH API
   Returns full Axios response because Login/Register pages use res.data
========================= */
export const authAPI = {
  login: async (payload) => {
    return await api.post("/auth/login", payload);
  },

  adminLogin: async (payload) => {
    return await api.post("/auth/login", payload);
  },

  register: async (payload) => {
    return await api.post("/auth/register", payload);
  },

  me: async () => {
    return await api.get("/auth/me");
  },
};

/* =========================
   ORDERS API
========================= */
export const ordersAPI = {
  create: async (payload) => {
    const response = await api.post("/orders", payload);
    return response.data;
  },

  getMine: async () => {
    const response = await api.get("/orders/my");
    return response.data;
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

    // IMPORTANT: use fetch instead of the axios instance here.
    // The axios instance has JSON defaults, and manually setting
    // multipart/form-data causes FastAPI to throw: Missing boundary in multipart.
    // fetch lets the browser set Content-Type with the required boundary.
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}/receipt`, {
      method: "POST",
      headers,
      body: formData,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw {
        response: {
          status: response.status,
          data,
        },
        message: data?.detail || "Receipt upload failed",
      };
    }

    return data;
  },
};

/* =========================
   ADMIN API
========================= */
export const adminAPI = {
  getOrders: async () => {
    const response = await api.get("/admin/orders");
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

  getProducts: async () => {
    const response = await api.get("/admin/products");
    return response.data;
  },

  createProduct: async (payload) => {
    const response = await api.post("/admin/products", payload);
    return response.data;
  },

  updateProduct: async (id, payload) => {
    const response = await api.patch(`/admin/products/${id}`, payload);
    return response.data;
  },
};

/* =========================
   BACKWARD-COMPATIBLE HELPERS
========================= */
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
export const uploadReceipt = async (orderId, formData) =>
  ordersAPI.uploadReceipt(orderId, formData);

export default api;
