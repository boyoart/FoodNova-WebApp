import { BarChart3, BellRing, ClipboardList, CreditCard, FileBarChart, Image, Mail, MapPin, Megaphone, Package, Settings, ShieldCheck, Tags, Truck, Users } from 'lucide-react'

export const adminTools = [
  { group: 'Operations', path: '/admin/orders', title: 'Manage Orders', description: 'View and update customer orders.', icon: ClipboardList, permission: 'orders:view' },
  { group: 'Operations', path: '/admin/payments', title: 'Payment Approvals', description: 'Review customer payment receipts.', icon: CreditCard, permissions: ['payments:view', 'payments:approve'] },
  { group: 'Operations', path: '/admin/riders', title: 'Delivery Riders', description: 'Review KYC, approve riders, and manage deliveries.', icon: Truck, permissions: ['rider_kyc:view', 'rider_kyc:review', 'orders:delivery', 'delivery:manage', 'riders:manage', 'workforce:view', 'workforce:manage'] },
  { group: 'Operations', path: '/admin/customers', title: 'Customers', description: 'View customer data and order history.', icon: Users, permission: 'customers:view' },
  { group: 'Catalog', path: '/admin/stock', title: 'Stock Management', description: 'Add, edit, and manage products and food packs.', icon: Package, permission: 'stock:view' },
  { group: 'Catalog', path: '/admin/categories', title: 'Categories', description: 'Organize the public product catalog.', icon: Tags, permissions: ['categories:view', 'stock:view'] },
  { group: 'Communications', path: '/admin/broadcasts', title: 'Broadcasts', description: 'Send direct notifications to customers.', icon: BellRing, permission: 'broadcasts:view' },
  { group: 'Communications', path: '/admin/announcements', title: 'Announcements', description: 'Publish persistent website and app notices.', icon: Megaphone, permissions: ['announcements:view', 'announcements:manage'] },
  { group: 'Website & CMS', path: '/admin/banners', title: 'Homepage Banners', description: 'Manage homepage hero content and ordering.', icon: Image, permissions: ['announcements:view', 'announcements:manage'] },
  { group: 'Website & CMS', path: '/admin/website-settings', title: 'Website Settings', description: 'Manage safe public and launch settings.', icon: Settings, permissions: ['website_settings:view', 'announcements:manage'] },
  { group: 'Website & CMS', path: '/admin/coming-soon-subscribers', title: 'Coming Soon Subscribers', description: 'Review and export the launch list.', icon: Mail, permissions: ['subscribers:view', 'announcements:view'] },
  { group: 'Website & CMS', path: '/admin/delivery-zones', title: 'Delivery Zones', description: 'Configure the operational delivery radius.', icon: MapPin, permissions: ['delivery_zones:view', 'workforce:view', 'delivery:manage'] },
  { group: 'Insights', path: '/admin/reports', title: 'Reports', description: 'Analyze orders, revenue, payments, and products.', icon: FileBarChart, permission: 'reports:view' },
  { group: 'Administration', path: '/admin/audit-logs', title: 'Activity Logs', description: 'Track admin actions and system changes.', icon: BarChart3, permission: 'audit:view' },
  { group: 'Administration', path: '/admin/users', title: 'Admin Users', description: 'Create and manage admin accounts.', icon: ShieldCheck, permissions: ['admins:view', 'admins:manage'] },
]

export const isAdminToolAllowed = (tool, can) => (
  tool.permissions ? tool.permissions.some(can) : can(tool.permission)
)