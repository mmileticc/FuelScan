/**
 * Konfiguracione konstante prenete iz `old-vanilla/js/config.js`.
 *
 * NAPOMENA: u produkciji ovo treba premestiti u Angular `environment.ts`
 * (environment.production / environment.development) i injektovati preko
 * InjectionToken-a, ali su ovde ostavljene kao proste konstante radi
 * jednostavnosti migracije - isto kao u starom vanilla projektu.
 */

export const SUPABASE_URL = 'https://jybatqpvokssutompyto.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5YmF0cXB2b2tzc3V0b21weXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTUwMjIsImV4cCI6MjA5NjU5MTAyMn0.W-zZN3dLJDn18m3qoL0EP8s4g2K32vFO7tyIWD-oN_Q';

/**
 * Poreska uprava (suf.purs.gov.rs) ne šalje permisivna CORS zaglavlja ni na
 * GET (stranica računa) ni na POST (/specifications), pa oba zahteva moraju
 * ići preko proxy-ja koji radi na serveru (gde CORS ne važi) i doda
 * `Access-Control-Allow-Origin: *` na odgovor.
 *
 * Gotov Cloudflare Worker za ovo se nalazi u `cors-proxy/` u korenu
 * repozitorijuma (Wrangler CLI projekat - `cors-proxy/src/index.js`).
 * Deploy: `cd cors-proxy && npm install && npx wrangler deploy` (uputstvo je
 * u komentaru na vrhu `src/index.js`).
 *
 * Očekivani format: `${CORS_PROXY_URL}${encodeURIComponent(targetUrl)}`
 */
export const CORS_PROXY_URL = 'https://fuelscan-proxy.fuelscan.workers.dev/?url=';

/**
 * POST endpoint Poreske uprave koji stranica sama poziva kad korisnik
 * klikne "Specifikacija" (isti zahtev, samo pozvan direktno, bez potrebe
 * za headless browserom / Playwright-om kao u starom backend-u).
 */
export const TAX_AUTHORITY_SPECIFICATIONS_URL = 'https://suf.purs.gov.rs/specifications';

export const SUF_ALLOWED_HOST = 'suf.purs.gov.rs';
