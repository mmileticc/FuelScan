const CACHE_NAME = 'fuelscan-v3'; 
const ASSETS_TO_CACHE = [
  '/FuelScan/',
  '/FuelScan/index.html',
  '/FuelScan/style.css',
  '/FuelScan/manifest.json',
  
  // Slike i ikonice (iz foldera assets)
  '/FuelScan/assets/apple-touch-icon.png',
  '/FuelScan/assets/favicon.ico',
  '/FuelScan/assets/gallery-icon.svg',
  '/FuelScan/assets/icon-16x16.png',
  '/FuelScan/assets/icon-32x32.png',
  '/FuelScan/assets/icon-192x192.png',
  '/FuelScan/assets/icon-512x512.png',
  
  // Glavne JS skripte (koren js foldera)
  '/FuelScan/js/api.js',
  '/FuelScan/js/auth.js',
  '/FuelScan/js/config.js',
  '/FuelScan/js/dateUtil.js',
  '/FuelScan/js/main.js',
  '/FuelScan/js/scanner.js',
  
  // UI JS skripte (iz ui foldera) - NAPOMENA: Ovde je sada index.js, a ne _index.js
  '/FuelScan/js/ui/index.js', 
  '/FuelScan/js/ui/common.js',
  '/FuelScan/js/ui/dashboard.js',
  '/FuelScan/js/ui/history.js',
  '/FuelScan/js/ui/scan.js',
  '/FuelScan/js/ui/statistics.js'
];


self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});


self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});


self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('supabase.co') || event.request.url.includes('onrender.com') || event.request.url.includes('huggingface.co')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});