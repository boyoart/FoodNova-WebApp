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

export const getProducts = async () => {
  const response = await api.get("/products");
  return response.data;
};

export const getPacks = async () => {
  const response = await api.get("/packs");
  return response.data;
};

export const getCategories = async () => {
  const response = await api.get("/categories");
  return response.data;
};

export const loginUser = async (payload) => {
  const response = await api.post("/auth/login", payload);
  return response.data;
};

export const registerUser = async (payload) => {
  const response = await api.post("/auth/register", payload);
  return response.data;
};

export const createOrder = async (payload) => {
  const response = await api.post("/orders", payload);
  return response.data;
};

export const getMyOrders = async () => {
  const response = await api.get("/orders/my");
  return response.data;
};

export const uploadReceipt = async (orderId, formData) => {
  const response = await api.post(`/orders/${orderId}/receipt`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

export default api;