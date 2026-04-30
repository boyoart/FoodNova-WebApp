import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  const adminToken = localStorage.getItem('admin_token')
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  } else if (adminToken) {
    config.headers.Authorization = `Bearer ${adminToken}`
  }
  
  return config
})

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('admin_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth endpoints
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  adminLogin: (data) => api.post('/auth/admin-login', data),
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('admin_token')
  },
}

// Products endpoints
export const productsAPI = {
  getAll: (params) => api.get('/products', { params }),
  getById: (id) => api.get(`/products/${id}`),
}

// Food Packs endpoints
export const packsAPI = {
  getAll: (params) => api.get('/packs', { params }),
  getById: (id) => api.get(`/packs/${id}`),
}

// Cart endpoints
export const cartAPI = {
  getCart: () => api.get('/cart'),
  addItem: (data) => api.post('/cart/items', data),
  updateItem: (itemId, data) => api.put(`/cart/items/${itemId}`, data),
  removeItem: (itemId) => api.delete(`/cart/items/${itemId}`),
  clearCart: () => api.delete('/cart'),
}

// Orders endpoints
export const ordersAPI = {
  create: (data) => api.post('/orders', data),
  getCustomerOrders: () => api.get('/orders/customer'),
  getOrderById: (id) => api.get(`/orders/${id}`),
  uploadReceipt: (orderId, file) => {
    const formData = new FormData()
    formData.append('receipt', file)
    return api.post(`/orders/${orderId}/receipt`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
}

// Admin endpoints
export const adminAPI = {
  getOrders: (params) => api.get('/admin/orders', { params }),
  getOrderById: (id) => api.get(`/admin/orders/${id}`),
  updateOrderStatus: (id, data) => api.put(`/admin/orders/${id}`, data),
  approvePayment: (id) => api.post(`/admin/orders/${id}/approve-payment`),
  rejectPayment: (id, data) => api.post(`/admin/orders/${id}/reject-payment`, data),
  getStock: () => api.get('/admin/stock'),
  updateStock: (productId, data) => api.put(`/admin/stock/${productId}`, data),
  getPendingPayments: () => api.get('/admin/payments/pending'),
  getDashboardStats: () => api.get('/admin/stats'),
}

export default api
