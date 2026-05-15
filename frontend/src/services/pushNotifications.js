import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const firebaseVapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY

function hasFirebaseWebConfig() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId && firebaseVapidKey)
}

function serviceWorkerConfigUrl() {
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey || '',
    authDomain: firebaseConfig.authDomain || '',
    projectId: firebaseConfig.projectId || '',
    storageBucket: firebaseConfig.storageBucket || '',
    messagingSenderId: firebaseConfig.messagingSenderId || '',
    appId: firebaseConfig.appId || '',
  })
  return `/firebase-messaging-sw.js?${params.toString()}`
}

export async function requestDeliveryPushToken() {
  if (Capacitor.isNativePlatform?.()) {
    PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
      const data = event.notification?.data || {}
      const target = data.click_action || '/delivery-app-coming-soon'
      window.location.assign(target)
    })
    const permission = await PushNotifications.requestPermissions()
    if (permission.receive !== 'granted') {
      return { status: 'denied', token: '' }
    }
    const token = await new Promise((resolve, reject) => {
      let resolved = false
      const finish = (value, isError = false) => {
        if (resolved) return
        resolved = true
        if (isError) reject(value)
        else resolve(value)
      }
      PushNotifications.addListener('registration', (registration) => finish(registration.value || ''))
      PushNotifications.addListener('registrationError', (error) => finish(error, true))
      PushNotifications.register()
      window.setTimeout(() => finish(''), 15000)
    })
    return { status: token ? 'granted' : 'prompt', token, platform: 'android' }
  }

  if (!('Notification' in window)) return { status: 'unsupported', token: '' }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { status: permission, token: '' }
  if (!hasFirebaseWebConfig()) return { status: 'configured_missing', token: '' }

  const [{ initializeApp }, { getMessaging, getToken, isSupported }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js'),
  ])
  if (!(await isSupported())) return { status: 'unsupported', token: '' }
  const app = initializeApp(firebaseConfig)
  const messaging = getMessaging(app)
  const registration = await navigator.serviceWorker.register(serviceWorkerConfigUrl())
  const token = await getToken(messaging, { vapidKey: firebaseVapidKey, serviceWorkerRegistration: registration })
  return { status: token ? 'granted' : 'prompt', token, platform: 'web' }
}
