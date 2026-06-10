const CACHE_NAME = 'fuelscan-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json'
];

// Instalacija
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

// Fetching (hvatanje zahteva)
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('127.0.0.1:8000')) {
    return; 
  }
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});