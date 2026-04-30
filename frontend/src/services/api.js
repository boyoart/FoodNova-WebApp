import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://foodnova-webapp.onrender.com";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("foodnova_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/* =========================
   PRODUCTS API
========================= */
export const productsAPI = {
  getAll: async () => {
    const response = await api.get("/products");
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/products/${id}`);
    return response.data;
  },
};

/* =========================
   PACKS API
========================= */
export const packsAPI = {
  getAll: async () => {
    const response = await api.get("/packs");
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/packs/${id}`);
    return response.data;
  },
};

/* =========================
   CATEGORIES API
========================= */
export const categoriesAPI = {
  getAll: async () => {
    const response = await api.get("/categories");
    return response.data;
  },
};

/* =========================
   AUTH API
========================= */
export const authAPI = {
  login: async (payload) => {
    const response = await api.post("/auth/login", payload);
    return response.data;
  },

  register: async (payload) => {
    const response = await api.post("/auth/register", payload);
    return response.data;
  },

  me: async () => {
    const response = await api.get("/auth/me");
    return response.data;
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

  uploadReceipt: async (orderId, formData) => {
    const response = await api.post(`/orders/${orderId}/receipt`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return response.data;
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
export const getProducts = async () => productsAPI.getAll();
export const getPacks = async () => packsAPI.getAll();
export const getCategories = async () => categoriesAPI.getAll();

export const loginUser = async (payload) => authAPI.login(payload);
export const registerUser = async (payload) => authAPI.register(payload);

export const createOrder = async (payload) => ordersAPI.create(payload);
export const getMyOrders = async () => ordersAPI.getMine();
export const uploadReceipt = async (orderId, formData) =>
  ordersAPI.uploadReceipt(orderId, formData);

export default api;