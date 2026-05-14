importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js')

const params = new URLSearchParams(self.location.search)
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
}

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig)
  const messaging = firebase.messaging()

  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {}
    self.registration.showNotification(notification.title || 'New Delivery Request', {
      body: notification.body || 'You have a new FoodNova delivery offer.',
      data: payload.data || {},
      icon: '/android-chrome-192x192.png',
      badge: '/android-chrome-192x192.png',
    })
  })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const targetUrl = data.click_action || (data.worker_type === 'messenger' ? '/messenger/dashboard' : '/rider/dashboard')
  event.waitUntil(clients.openWindow(targetUrl))
})

