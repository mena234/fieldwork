/* Development placeholder. `npm run build` replaces this with a versioned precache. */
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.registration.unregister()); });
