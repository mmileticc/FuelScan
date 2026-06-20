const CACHE_NAME = 'fuelscan-v1';
const CACHE_NAME = 'fuelscan-v2'; // Podigni verziju da poništiš stari keš

const ASSETS_TO_CACHE = [
  '/FuelScan/',
  '/FuelScan/index.html',
  '/FuelScan/style.css',
  '/FuelScan/manifest.json',
  
  // Glavne JS skripte na korenskom nivou js foldera
  '/FuelScan/js/main.js',
  '/FuelScan/js/auth.js',
  '/FuelScan/js/api.js',
  '/FuelScan/js/scanner.js',
  '/FuelScan/js/config.js',
  
  // Novi refaktorisani fajlovi unutar js foldera
  '/FuelScan/js/common.js',
  '/FuelScan/js/dashboard.js',
  '/FuelScan/js/history.js',
  '/FuelScan/js/scan.js',
  '/FuelScan/js/statistics.js',
  '/FuelScan/js/dateUtil.js', // pošto ga scan.js importuje iz roditeljskog foldera
  
  // Slike i ikonice (dodaj i ostale ako ih koristiš)
  '/FuelScan/assets/gallery-icon.svg',
  '/FuelScan/assets/icon-32x32.png',
  '/FuelScan/assets/icon-16x16.png',
  '/FuelScan/assets/icon-192x192.png',
  '/FuelScan/assets/icon-512x512.png'
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
 
  if (event.request.url.includes('supabase.co') || event.request.url.includes('onrender.com')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});