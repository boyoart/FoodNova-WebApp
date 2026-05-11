const CUSTOMER_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const LAST_ACTIVITY_KEY = 'foodnova_last_activity';

export function updateLastActivity() {
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

export function getLastActivity() {
  const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
  return raw ? Number(raw) : null;
}

export function getCurrentSessionRole() {
  const adminToken = localStorage.getItem('admin_token');
  const adminUser =
    localStorage.getItem('admin') ||
    localStorage.getItem('foodnova_admin');

  if (adminToken || adminUser) return 'admin';

  const customerToken =
    localStorage.getItem('token') ||
    localStorage.getItem('foodnova_token');

  const customerUser =
    localStorage.getItem('user') ||
    localStorage.getItem('foodnova_user');

  if (customerToken || customerUser) return 'customer';

  return null;
}

export function isSessionExpired() {
  const role = getCurrentSessionRole();
  if (!role) return false;

  const last = getLastActivity();
  if (!last) return false;

  const timeout = role === 'admin' ? ADMIN_TIMEOUT_MS : CUSTOMER_TIMEOUT_MS;

  return Date.now() - last > timeout;
}

export function clearActiveSessionOnly() {
  localStorage.removeItem('token');
  localStorage.removeItem('foodnova_token');
  localStorage.removeItem('user');
  localStorage.removeItem('foodnova_user');

  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin');
  localStorage.removeItem('foodnova_admin');

  // Do NOT remove:
  // foodnova_biometric_enabled
  // foodnova_biometric_user
  // NativeBiometric credentials
}

export function enforceSessionTimeout({ navigate, notify } = {}) {
  if (!isSessionExpired()) return false;

  clearActiveSessionOnly();

  if (typeof notify === 'function') {
    notify('Session expired. Please log in again.');
  }

  if (typeof navigate === 'function') {
    navigate('/login');
  } else {
    window.location.href = '/login';
  }

  return true;
}

export function startSessionWatcher({ navigate, notify } = {}) {
  // Important: check expiration first before updating activity.
  enforceSessionTimeout({ navigate, notify });

  const role = getCurrentSessionRole();

  if (role && !getLastActivity()) {
    updateLastActivity();
  }

  const activityEvents = ['click', 'touchstart', 'keydown', 'scroll'];

  const activityHandler = () => {
    if (getCurrentSessionRole()) {
      updateLastActivity();
    }
  };

  activityEvents.forEach((eventName) => {
    window.addEventListener(eventName, activityHandler, { passive: true });
  });

  const interval = window.setInterval(() => {
    enforceSessionTimeout({ navigate, notify });
  }, 60 * 1000);

  const focusHandler = () => {
    enforceSessionTimeout({ navigate, notify });
  };

  window.addEventListener('focus', focusHandler);

  return () => {
    activityEvents.forEach((eventName) => {
      window.removeEventListener(eventName, activityHandler);
    });

    window.removeEventListener('focus', focusHandler);
    window.clearInterval(interval);
  };
}

export function expireCustomerSessionForTesting() {
  localStorage.setItem(
    LAST_ACTIVITY_KEY,
    String(Date.now() - 31 * 24 * 60 * 60 * 1000)
  );
}

export function expireAdminSessionForTesting() {
  localStorage.setItem(
    LAST_ACTIVITY_KEY,
    String(Date.now() - 13 * 60 * 60 * 1000)
  );
}
