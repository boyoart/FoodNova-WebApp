import { useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { adminTools, isAdminToolAllowed } from './adminNavigation'
import './AdminLayout.css'

const normalizeRole = (role) => String(role || '').toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')

export default function AdminLayout() {
  const { isAdmin, admin, logout } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const role = normalizeRole(admin?.admin_role)
  const superAdmin = role === 'super_admin' || (admin?.role === 'admin' && (!role || permissions.length === 0))
  const can = (permission) => superAdmin || permissions.includes(permission)
  const visibleTools = adminTools.filter((tool) => isAdminToolAllowed(tool, can))
  const groupedTools = visibleTools.reduce((groups, tool) => {
    groups[tool.group] = [...(groups[tool.group] || []), tool]
    return groups
  }, {})
  const activeTool = adminTools.find((tool) => location.pathname === tool.path || location.pathname.startsWith(`${tool.path}/`))
  const pageTitle = activeTool?.title || 'Dashboard'
  const adminName = admin?.full_name || admin?.fullName || admin?.name || admin?.email || 'FoodNova Admin'
  const initials = adminName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

  if (!isAdmin) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />

  const handleLogout = () => {
    logout()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className={`admin-shell${collapsed ? ' is-collapsed' : ''}`} data-collapsed={collapsed}>
      {mobileOpen && <button className="admin-sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`admin-sidebar${mobileOpen ? ' is-mobile-open' : ''}`} aria-label="Admin navigation">
        <div className="admin-brand-row">
          <NavLink to="/admin/dashboard" className="admin-brand" onClick={() => setMobileOpen(false)} aria-label="FoodNova Admin dashboard">
            <img src="/foodnova-logo.png" alt="" onError={(event) => { event.currentTarget.hidden = true }} />
            <span>FoodNova <small>OPERATIONS</small></span>
          </NavLink>
          <button type="button" className="admin-icon-button admin-mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={19} /></button>
        </div>

        <nav className="admin-nav" aria-label="Admin sections">
          <NavLink to="/admin/dashboard" className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`} title={collapsed ? 'Dashboard' : undefined} onClick={() => setMobileOpen(false)}>
            <LayoutDashboard size={19} /><span>Dashboard</span>
          </NavLink>
          {Object.entries(groupedTools).map(([group, tools]) => (
            <section className="admin-nav-group" key={group}>
              <h2>{group}</h2>
              {tools.map((tool) => (
                <NavLink
                  key={tool.path}
                  to={tool.path}
                  title={collapsed ? tool.title : undefined}
                  className={({ isActive }) => `admin-nav-link${isActive || location.pathname.startsWith(`${tool.path}/`) ? ' active' : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <tool.icon size={19} /><span>{tool.title}</span>
                </NavLink>
              ))}
            </section>
          ))}
        </nav>

        <div className="admin-sidebar-bottom">
          <div className="admin-sidebar-account"><span className="admin-avatar">{initials || 'FN'}</span><span className="admin-account-copy"><strong>{adminName}</strong><small>{admin?.admin_role || 'Administrator'}</small></span></div>
          <button type="button" className="admin-nav-link admin-logout" onClick={handleLogout} title={collapsed ? 'Log out' : undefined}><LogOut size={18} /><span>Log out</span></button>
          <button type="button" className="admin-collapse-button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}<span>Collapse menu</span>
          </button>
        </div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <button type="button" className="admin-icon-button admin-mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={21} /></button>
          <div className="admin-page-context">
            <p><span>FoodNova</span><ChevronRight size={14} /><span>Admin</span><ChevronRight size={14} /><strong>{pageTitle}</strong></p>
            <h1>{pageTitle}</h1>
          </div>
          <div className="admin-topbar-account"><span className="admin-avatar">{initials || 'FN'}</span><span><strong>{adminName}</strong><small>{admin?.admin_role || 'Administrator'}</small></span></div>
        </header>

        <main className="admin-content">
          {activeTool && !isAdminToolAllowed(activeTool, can)
            ? <div className="admin-access-denied" role="alert"><strong>Access restricted</strong><p>You do not have permission to access this module.</p><NavLink to="/admin/dashboard">Return to dashboard</NavLink></div>
            : <Outlet />}
        </main>
      </div>
    </div>
  )
}