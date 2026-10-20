/* Service Worker de mensajería de Firebase.
   Recibe las notificaciones push enviadas desde la nube cuando un
   residente reporta un pago. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCSMsOCU5ETx6YiuvMoYZv0DFIoWhC2GDk",
  authDomain: "yeison-app-84d5d.firebaseapp.com",
  projectId: "yeison-app-84d5d",
  storageBucket: "yeison-app-84d5d.firebasestorage.app",
  messagingSenderId: "1098979075278",
  appId: "1:1098979075278:web:3a0c3743e66dd925e0dc9f",
  measurementId: "G-5GYX1735H6"
});

const messaging = firebase.messaging();

// Notificación recibida en segundo plano (app cerrada o en otra pestaña)
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const notif = payload.notification || {};
  const titulo = notif.title || data.title || '💳 Nuevo pago reportado';
  const cuerpo = notif.body || data.body || 'Un residente reportó un pago de estacionamiento.';

  return self.registration.showNotification(titulo, {
    body: cuerpo,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: data.id || 'pago-nuevo',
    data: { url: './index.html?vista=admin' }
  });
});

// Al tocar la notificación, abrir la app en el panel del administrador
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || './index.html?vista=admin';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientes) => {
      for (const c of clientes) {
        if ('focus' in c) { c.focus(); return; }
      }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    })
  );
});
