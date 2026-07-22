import axios from "axios";

const RENDER_API_BASE_URL = "https://foodnova-webapp.onrender.com";
const normalizeApiBaseUrl = (value) => {
  const candidate = String(value || "").trim().replace(/\/+$/, "");
  if (!candidate) return RENDER_API_BASE_URL;
  const isFrontendHost = /^https:\/\/(www\.)?foodnova\.com\.ng$/i.test(candidate);
  if (isFrontendHost) {
    console.warn("Ignoring frontend domain as API base URL. Using Render backend instead.");
    return RENDER_API_BASE_URL;
  }
  return candidate;
};

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

const getTokenForRequest = (url = "") => {
  const path = String(url || "");
  if (path.startsWith("/admin")) {
    return localStorage.getItem("admin_token") || localStorage.getItem("token");
  }
  return localStorage.getItem("token") || localStorage.getItem("foodnova_token");
};

api.interceptors.request.use((config) => {
  const token = getTokenForRequest(config.url);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      console.warn("FoodNova API session expired or unauthorized", error.config?.url);
    }
    return Promise.reject(error);
  }
);

const normalizeList = (body, keys = []) => {
  if (Array.isArray(body)) return body;
  for (const key of keys) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.items)) return body.items;
  return [];
};

const logEndpointError = (endpoint, error) => {
  console.error(`${endpoint} failed`, error?.response?.status, error?.response?.data || error);
};

const toStockFormData = (payload = {}) => {
  const formData = new FormData();
  const entries = {
    name: payload.name || "",
    price: payload.price || 0,
    stock_qty: payload.stock_qty ?? payload.stock ?? 0,
    category: payload.category || payload.category_name || "",
    description: payload.description || "",
    is_active: payload.is_active !== false,
  };
  Object.entries(entries).forEach(([key, value]) => formData.append(key, value));
  if (payload.items !== undefined) formData.append("items", Array.isArray(payload.items) ? JSON.stringify(payload.items) : payload.items || "[]");
  if (payload.image_file) formData.append("image", payload.image_file);
  return formData;
};

const multipartConfig = { headers: { "Content-Type": "multipart/form-data" } };

export const resolveMediaUrl = (url) => {
  if (!url) return "";
  const value = String(url).trim();
  if (!value) return "";
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith("/uploads")) return `${API_BASE_URL}${value}`;
  if (value.startsWith("uploads/")) return `${API_BASE_URL}/${value}`;
  return value;
};

const getStoredUserEmail = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    return user?.email || "guest";
  } catch {
    return "guest";
  }
};

const localAddressKey = () => `foodnova_saved_addresses_${getStoredUserEmail()}`;

const getLocalAddresses = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(localAddressKey()) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const setLocalAddresses = (addresses) => {
  localStorage.setItem(localAddressKey(), JSON.stringify(Array.isArray(addresses) ? addresses : []));
};

const mergeAddresses = (remoteAddresses = []) => {
  const remote = Array.isArray(remoteAddresses) ? remoteAddresses : [];
  const local = getLocalAddresses();
  const seen = new Set(remote.map((address) => String(address.id)));
  const mergedLocal = local.filter((address) => !seen.has(String(address.id)));
  return [...remote, ...mergedLocal];
};

const createLocalAddress = (payload) => {
  const addresses = getLocalAddresses();
  const newAddress = {
    ...payload,
    id: payload.id || `local-${Date.now()}`,
    country: payload.country || "Nigeria",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const shouldBeDefault = Boolean(payload.is_default) || addresses.length === 0;
  const nextAddresses = shouldBeDefault
    ? addresses.map((address) => ({ ...address, is_default: false }))
    : addresses;

  newAddress.is_default = shouldBeDefault;
  nextAddresses.push(newAddress);
  setLocalAddresses(nextAddresses);
  return newAddress;
};

const updateLocalAddress = (id, payload) => {
  const addresses = getLocalAddresses();
  const next = addresses.map((address) =>
    String(address.id) === String(id)
      ? { ...address, ...payload, updated_at: new Date().toISOString() }
      : address
  );
  setLocalAddresses(next);
  return next.find((address) => String(address.id) === String(id));
};

const deleteLocalAddress = (id) => {
  const addresses = getLocalAddresses();
  const removed = addresses.find((address) => String(address.id) === String(id));
  setLocalAddresses(addresses.filter((address) => String(address.id) !== String(id)));
  return removed;
};

const setLocalDefaultAddress = (id) => {
  const addresses = getLocalAddresses().map((address) => ({
    ...address,
    is_default: String(address.id) === String(id),
  }));
  setLocalAddresses(addresses);
  return addresses.find((address) => String(address.id) === String(id));
};

export const productsAPI = {
  getAll: async () => {
    try {
      const response = await api.get("/products");
      return { data: normalizeList(response.data, ["products"]), raw: response.data };
    } catch (error) {
      logEndpointError("GET /products", error);
      throw error;
    }
  },
  getById: async (id) => await api.get(`/products/${id}`),
};

export const packsAPI = {
  getAll: async () => {
    try {
      const response = await api.get("/packs");
      return { data: normalizeList(response.data, ["packs"]), raw: response.data };
    } catch (error) {
      logEndpointError("GET /packs", error);
      throw error;
    }
  },
  getById: async (id) => await api.get(`/packs/${id}`),
};

export const categoriesAPI = {
  getAll: async () => await api.get("/categories"),
};

export const authAPI = {
  login: async (payload) => await api.post("/auth/login", payload),
  adminLogin: async (payload) => await api.post("/auth/admin/login", payload),
  register: async (payload) => await api.post("/auth/register", payload),
  me: async () => await api.get("/auth/me"),
  changePassword: async (payload) => {
    const endpoints = [
      { method: "post", url: "/auth/change-password" },
      { method: "patch", url: "/profile/password" },
      { method: "post", url: "/profile/change-password" },
    ];

    let lastError;
    for (const endpoint of endpoints) {
      try {
        return await api[endpoint.method](endpoint.url, payload);
      } catch (error) {
        lastError = error;
        const status = error?.response?.status;
        if (status !== 404 && status !== 405) {
          throw error;
        }
      }
    }

    throw lastError;
  },
};

export const ordersAPI = {
  create: async (payload) => {
    const response = await api.post("/orders", payload);
    return response.data;
  },
  getMine: async () => (await api.get("/orders/my")).data,
  getCustomerOrders: async () => {
    try {
      const response = await api.get("/orders/my");
      const orders = normalizeList(response.data, ["orders"]);
      return { data: orders, raw: response.data };
    } catch (error) {
      logEndpointError("GET /orders/my", error);
      throw error;
    }
  },
  getById: async (id) => (await api.get(`/orders/${id}`)).data,
  refreshOrder: async (id) => (await api.get(`/orders/${id}`)).data,
  uploadReceipt: async (orderId, fileOrFormData) => {
    const formData = fileOrFormData instanceof FormData ? fileOrFormData : new FormData();
    if (!(fileOrFormData instanceof FormData)) formData.append("file", fileOrFormData);
    const headers = {};
    const token = getTokenForRequest(`/orders/${orderId}/receipt`);
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}/receipt`, { method: "POST", headers, body: formData });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw { response: { status: response.status, data }, message: data?.detail || "Receipt upload failed" };
    return data;
  },
  confirmDelivery: async (orderId, code) => (await api.post(`/orders/${orderId}/confirm-delivery`, { delivery_code: code })).data,
};

export const adminAPI = {
  getOrders: async (params = {}) => {
    try {
      const response = await api.get("/admin/orders", { params });
      const orders = normalizeList(response.data, ["orders"]);
      return { data: orders, raw: response.data };
    } catch (error) {
      logEndpointError("GET /admin/orders", error);
      throw error;
    }
  },
  getOrder: async (id) => (await api.get(`/admin/orders/${id}`)).data,
  updateOrder: async (id, payload) => (await api.patch(`/admin/orders/${id}`, payload)).data,
  deleteOrder: async (id) => (await api.delete(`/admin/orders/${id}`)).data,
  updateOrderStatus: async (id, payload = {}) => {
    const status = payload.status || payload.order_status || payload.fulfillment_status;
    const response = await api.patch(`/admin/orders/${id}`, { ...payload, ...(status ? { status, order_status: status, fulfillment_status: status } : {}) });
    return response.data;
  },
  updatePaymentStatus: async (id, payload = {}) => {
    const paymentStatus = payload.payment_status || payload.status;
    const response = await api.patch(`/admin/orders/${id}`, { ...payload, ...(paymentStatus ? { payment_status: paymentStatus, status: paymentStatus } : {}) });
    return response.data;
  },
  updateFulfillmentStatus: async (id, payload = {}) => {
    const status = payload.fulfillment_status || payload.order_status || payload.status;
    const response = await api.patch(`/admin/orders/${id}`, { ...payload, ...(status ? { fulfillment_status: status, order_status: status, status } : {}) });
    return response.data;
  },
  getProducts: async () => {
    try {
      const response = await api.get("/admin/products");
      const products = normalizeList(response.data, ["products"]);
      return { data: products, raw: response.data };
    } catch (error) {
      logEndpointError("GET /admin/products", error);
      throw error;
    }
  },
  getStock: async () => {
    try {
      const response = await api.get("/admin/products");
      const products = normalizeList(response.data, ["products"]);
      return { data: products, raw: response.data };
    } catch (error) {
      logEndpointError("GET /admin/products", error);
      throw error;
    }
  },
  createProduct: async (payload) => (await api.post("/admin/products", toStockFormData(payload), multipartConfig)).data,
  updateProduct: async (id, payload) => (await api.patch(`/admin/products/${id}`, toStockFormData(payload), multipartConfig)).data,
  updateStock: async (id, payload) => (await api.patch(`/admin/products/${id}`, toStockFormData(payload), multipartConfig)).data,
  deleteProduct: async (id) => (await api.delete(`/admin/products/${id}`)).data,
  getRiders: async () => {
    const response = await api.get("/admin/riders");
    const riders = normalizeList(response.data, ["riders"]);
    return { data: riders, raw: response.data };
  },
  createRider: async (payload) => (await api.post("/admin/riders", payload)).data,
  updateRider: async (id, payload) => (await api.patch(`/admin/riders/${id}`, payload)).data,
  deactivateRider: async (id) => (await api.delete(`/admin/riders/${id}`)).data,
  assignRider: async (orderId, payload) => (await api.patch(`/admin/orders/${orderId}/assign-rider`, payload)).data,
  getPacks: async () => {
    try {
      const response = await api.get("/admin/packs");
      const packs = normalizeList(response.data, ["packs"]);
      return { data: packs, raw: response.data };
    } catch (error) {
      logEndpointError("GET /admin/packs", error);
      throw error;
    }
  },
  createPack: async (payload) => (await api.post("/admin/packs", toStockFormData(payload), multipartConfig)).data,
  updatePack: async (id, payload) => (await api.patch(`/admin/packs/${id}`, toStockFormData(payload), multipartConfig)).data,
  deletePack: async (id) => (await api.delete(`/admin/packs/${id}`)).data,
  getDashboardStats: async () => {
    const fallback = { total_orders: 0, total_revenue: 0, total_products: 0, pending_payments: 0, receipt_submitted: 0, delivered_orders: 0, low_stock_products: 0, out_of_stock_products: 0 };
    try {
      const [ordersRes, productsRes] = await Promise.allSettled([api.get("/admin/orders"), api.get("/admin/products")]);
      const orders = ordersRes.status === "fulfilled" ? normalizeList(ordersRes.value.data, ["orders"]) : [];
      const products = productsRes.status === "fulfilled" ? normalizeList(productsRes.value.data, ["products"]) : [];
      const getPaymentStatus = (order) => String(order.payment_status || order.status || "").toLowerCase();
      const getOrderStatus = (order) => String(order.order_status || order.fulfillment_status || order.status || "").toLowerCase();
      const getStock = (product) => Number(product.stock_qty ?? product.stock ?? 0);
      const isLowStock = (product) => product.low_stock === true || (getStock(product) > 0 && getStock(product) <= Number(product.low_stock_threshold || 5));
      const isOutOfStock = (product) => product.is_out_of_stock === true || getStock(product) <= 0;
      return { data: { total_orders: orders.length, total_revenue: orders.reduce((sum, order) => sum + Number(order.total_amount || order.total || 0), 0), total_products: products.length, pending_payments: orders.filter((order) => getPaymentStatus(order) === "pending_payment").length, receipt_submitted: orders.filter((order) => getPaymentStatus(order) === "receipt_submitted").length, delivered_orders: orders.filter((order) => getOrderStatus(order) === "delivered").length, low_stock_products: products.filter(isLowStock).length, out_of_stock_products: products.filter(isOutOfStock).length } };
    } catch (error) {
      console.warn("Failed to calculate dashboard stats. Using fallback.", error);
      return { data: fallback };
    }
  },
  getPendingPayments: async () => {
    const response = await api.get("/admin/orders");
    const orders = normalizeList(response.data, ["orders"]);
    return { data: orders.filter((order) => String(order.payment_status || order.status || "").toLowerCase() === "receipt_submitted") };
  },
  getCustomers: async () => {
    try {
      const response = await api.get("/admin/customers");
      const customers = normalizeList(response.data, ["customers", "users"]);
      return { data: customers, raw: response.data };
    } catch (error) {
      logEndpointError("GET /admin/customers", error);
      const ordersResponse = await api.get("/admin/orders");
      const orders = normalizeList(ordersResponse.data, ["orders"]);
      const customersByEmail = new Map();
      orders.forEach((order) => {
        const email = order.customer_email || order.email || order.user_email || "unknown@customer";
        const current = customersByEmail.get(email) || {
          id: email,
          full_name: order.customer_name || "Customer",
          name: order.customer_name || "Customer",
          email,
          phone: order.customer_phone || order.phone || "",
          address: order.delivery_address || "",
          orders_count: 0,
          total_orders: 0,
          total_spent: 0,
          revenue: 0,
          last_order_at: order.created_at || "",
          last_order_code: "",
          orders: [],
        };
        current.orders_count += 1;
        current.total_orders += 1;
        current.total_spent += Number(order.total_amount || order.total || 0);
        current.revenue = current.total_spent;
        current.last_order_at = order.created_at || current.last_order_at;
        current.last_order_code = order.order_code || current.last_order_code;
        current.orders.push(order);
        customersByEmail.set(email, current);
      });
      return { data: Array.from(customersByEmail.values()), raw: { local_fallback: true } };
    }
  },
  approvePayment: async (id, payload = {}) => (await api.patch(`/admin/orders/${id}`, { ...payload, status: "payment_confirmed", payment_status: "payment_confirmed" })).data,
  rejectPayment: async (id, payload = {}) => (await api.patch(`/admin/orders/${id}`, { ...payload, status: "payment_rejected", payment_status: "payment_rejected" })).data,
  getOrderPaymentAudit: async (id) => {
    const response = await api.get(`/admin/orders/${id}/payment-audit`);
    return { data: normalizeList(response.data, ["logs"]), raw: response.data };
  },
  getPaymentAudit: async (params = {}) => {
    const response = await api.get("/admin/payment-audit", { params });
    return { data: normalizeList(response.data, ["logs"]), raw: response.data };
  },
  getBroadcasts: async () => {
    const response = await api.get("/admin/broadcasts");
    const broadcasts = normalizeList(response.data, ["broadcasts"]);
    return { data: broadcasts, raw: response.data };
  },
  getAuditLogs: async (params = {}) => {
    const response = await api.get("/admin/audit-logs", { params });
    const logs = normalizeList(response.data, ["logs"]);
    return { data: logs, raw: response.data };
  },
  getAdminUsers: async () => {
    const response = await api.get("/admin/users");
    const admins = normalizeList(response.data, ["admins", "users"]);
    return { data: admins, raw: response.data };
  },
  createAdminUser: async (payload) => (await api.post("/admin/users", payload)).data,
  updateAdminUser: async (id, payload) => (await api.patch(`/admin/users/${id}`, payload)).data,
  resetAdminPassword: async (id, payload) => (await api.patch(`/admin/users/${id}/password`, payload)).data,
  deactivateAdminUser: async (id) => (await api.delete(`/admin/users/${id}`)).data,
  createBroadcast: async (payload) => (await api.post("/admin/broadcasts", payload)).data,
  updateBroadcast: async (id, payload) => (await api.patch(`/admin/broadcasts/${id}`, payload)).data,
  deleteBroadcast: async (id) => (await api.delete(`/admin/broadcasts/${id}`)).data,
  getReports: async (params = {}) => (await api.get('/admin/reports/summary', { params })).data,
  exportReport: async (type) => (await api.get(`/admin/export/${type}`, { responseType: 'blob' })).data,
  getAnnouncements: async () => (await api.get('/admin/announcements')).data,
  createAnnouncement: async (payload) => (await api.post('/admin/announcements', payload)).data,
  updateAnnouncement: async (id, payload) => (await api.patch(`/admin/announcements/${id}`, payload)).data,
  deleteAnnouncement: async (id) => (await api.delete(`/admin/announcements/${id}`)).data,
  uploadAnnouncementImage: async (file) => {
    const body = new FormData(); body.append('file', file);
    return (await api.post('/admin/uploads/announcement-image', body, multipartConfig)).data;
  },
  getRiderVerificationQueue: async (params = {}) => (await api.get('/admin/rider-verification-queue', { params })).data,
  getRiderVerificationDetail: async (id) => (await api.get(`/admin/rider-verification-queue/${id}`)).data,
  reviewRiderVerification: async (id, action, payload = {}) => (await api.post(`/admin/rider-verification-queue/${id}/${action}`, payload)).data,
  getDeliveryZone: async () => (await api.get('/admin/delivery-zone')).data,
  updateDeliveryZone: async (payload) => (await api.patch('/admin/delivery-zone', payload)).data,
  getWebsiteSettings: async () => (await api.get('/admin/website-settings')).data,
  updateWebsiteSettings: async (payload) => (await api.patch('/admin/website-settings', payload)).data,
  getComingSoonSubscribers: async (params = {}) => (await api.get('/admin/coming-soon-subscribers', { params })).data,
  deleteComingSoonSubscriber: async (id) => (await api.delete(`/admin/coming-soon-subscribers/${id}`)).data,
  getCategories: async () => (await api.get('/admin/categories')).data,
  createCategory: async (payload) => (await api.post('/admin/categories', payload)).data,
  updateCategory: async (id, payload) => (await api.patch(`/admin/categories/${id}`, payload)).data,
  deleteCategory: async (id) => (await api.delete(`/admin/categories/${id}`)).data,
  uploadCategoryImage: async (file) => {
    const body = new FormData(); body.append('file', file);
    return (await api.post('/admin/uploads/category-image', body, multipartConfig)).data;
  },
};

export const getProducts = async () => (await productsAPI.getAll()).data;
export const getPacks = async () => (await packsAPI.getAll()).data;
export const getCategories = async () => (await categoriesAPI.getAll()).data;
export const loginUser = async (payload) => (await authAPI.login(payload)).data;
export const registerUser = async (payload) => (await authAPI.register(payload)).data;
export const createOrder = async (payload) => ordersAPI.create(payload);
export const getMyOrders = async () => ordersAPI.getMine();
export const uploadReceipt = async (orderId, formData) => ordersAPI.uploadReceipt(orderId, formData);

export default api;

export const profileAPI = {
  getProfile: async () => {
    try {
      const body = (await api.get('/profile')).data;
      const profile = body.profile || body.data?.profile || body || {};
      const remoteAddresses = body.addresses || body.data?.addresses || [];
      const addresses = mergeAddresses(remoteAddresses);
      return { ...body, profile, addresses, data: { ...(body.data || {}), profile, addresses } };
    } catch (error) {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const profile = { full_name: user.full_name || user.fullName || user.name || '', email: user.email || '', phone: user.phone || '', avatar_url: user.avatar_url || '' };
      const addresses = getLocalAddresses();
      return { success: true, profile, addresses, data: { profile, addresses }, local_fallback: true };
    }
  },
  updateProfile: async (payload) => {
    try { return (await api.patch('/profile', payload)).data; }
    catch (error) { const user = JSON.parse(localStorage.getItem('user') || '{}'); const nextUser = { ...user, ...payload, name: payload.full_name || user.name, full_name: payload.full_name || user.full_name }; localStorage.setItem('user', JSON.stringify(nextUser)); return { success: true, profile: nextUser, data: nextUser, local_fallback: true }; }
  },
  uploadAvatar: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post("/profile/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },
  getAddresses: async () => {
    try { const body = (await api.get('/profile/addresses')).data; const remoteAddresses = body.addresses || body.data || []; const addresses = mergeAddresses(remoteAddresses); return { ...body, addresses, data: addresses }; }
    catch (error) { const addresses = getLocalAddresses(); return { success: true, addresses, data: addresses, local_fallback: true }; }
  },
  createAddress: async (payload) => {
    try { const body = (await api.post('/profile/addresses', payload)).data; const savedAddress = body.address || body.data || body; if (savedAddress?.id) { const local = getLocalAddresses().filter((address) => String(address.id) !== String(savedAddress.id)); setLocalAddresses(local); } return body; }
    catch (error) { const address = createLocalAddress(payload); return { success: true, address, data: address, local_fallback: true }; }
  },
  updateAddress: async (id, payload) => {
    try { return (await api.patch(`/profile/addresses/${id}`, payload)).data; }
    catch (error) { const address = updateLocalAddress(id, payload); return { success: true, address, data: address, local_fallback: true }; }
  },
  deleteAddress: async (id) => {
    try { const body = (await api.delete(`/profile/addresses/${id}`)).data; deleteLocalAddress(id); return body; }
    catch (error) { const address = deleteLocalAddress(id); return { success: true, address, data: address, local_fallback: true }; }
  },
  setDefaultAddress: async (id) => {
    try { const body = (await api.patch(`/profile/addresses/${id}/default`)).data; setLocalDefaultAddress(id); return body; }
    catch (error) { const address = setLocalDefaultAddress(id); return { success: true, address, data: address, local_fallback: true }; }
  },
}

export const notificationsAPI = {
  getAll: async () => (await api.get('/notifications')).data,
  getUnreadCount: async () => (await api.get('/notifications/unread-count')).data,
  markRead: async (id) => (await api.patch(`/notifications/${id}/read`)).data,
  markAllRead: async () => (await api.patch('/notifications/read-all')).data,
  deleteNotification: async (id) => (await api.delete(`/notifications/${id}`)).data,
  clearAll: async () => (await api.delete('/notifications')).data,
}
