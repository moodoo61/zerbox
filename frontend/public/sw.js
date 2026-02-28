/* Service Worker for Push Notifications */

self.addEventListener('push', function(event) {
    if (!event.data) return;
    
    try {
        var data = event.data.json();
        var options = {
            body: data.body || '',
            icon: data.icon || '/logo192.png',
            badge: '/logo192.png',
            vibrate: [200, 100, 200],
            data: { url: data.url || '/' },
            dir: 'rtl',
            lang: 'ar',
            tag: 'notification-' + (data.id || Date.now()),
            renotify: true,
            actions: [
                { action: 'open', title: 'فتح' },
                { action: 'close', title: 'إغلاق' }
            ]
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'إشعار جديد', options)
        );
    } catch (e) {
        console.error('Push event error:', e);
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    if (event.action === 'close') return;
    
    var url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            for (var i = 0; i < windowClients.length; i++) {
                var client = windowClients[i];
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.navigate(url);
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

self.addEventListener('install', function(event) {
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(self.clients.claim());
});
