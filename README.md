# FuelScan

Aplikacija za skeniranje QR koda sa fiskalnog računa za gorivo, automatsko izvlačenje podataka (stanica, količina, cena, ukupno) sa portala Poreske uprave (`suf.purs.gov.rs`) i čuvanje istorije punjenja u ličnom nalogu.

Projekat je migriran sa Vanilla JS + Python/FastAPI backend-a na samostalnu Angular 20 (standalone) aplikaciju koja radi bez sopstvenog backend servera.

## Struktura repozitorijuma

```
angular/         Angular 20+ aplikacija (standalone komponente) - AKTIVNI kod
cors-proxy/      Cloudflare Worker koji rešava CORS problem ka suf.purs.gov.rs
legacy/old backend/     STARI Python/FastAPI + Playwright parser (referenca, više se ne koristi)
legacy/old vanilla/     STARI Vanilla JS frontend (referenca, više se ne koristi)
.github/         GitHub Actions workflow za automatski build + deploy na GitHub Pages
```

`legacy/old backend/` i `legacy/old vanilla/` su ostavljeni samo kao istorijska referenca - logika parsiranja i UI su prepisani u `angular/`, ništa iz ta dva foldera se više ne pokreće u produkciji.

## Kako aplikacija radi (arhitektura)

Stari tok je izgledao ovako: browser šalje URL sa QR koda na sopstveni FastAPI backend, backend otvara headless Chromium (Playwright), učitava stranicu računa, klikće na "Specifikacija" i čupa podatke iz DOM-a.

Novi tok radi sve u browseru, bez ikakvog sopstvenog backend servera:

1. Korisnik skenira QR kod (kamerom ili iz slike, preko `html5-qrcode` biblioteke) - dobija se URL računa.
2. Angular (`ReceiptService`) GET-uje HTML te stranice preko CORS proxy-ja (Cloudflare Worker u `cors-proxy/`), jer `suf.purs.gov.rs` ne šalje CORS zaglavlja potrebna za direktan poziv iz browsera.
3. `DOMParser` u browseru parsira taj HTML: iz inline `<script>` bloka regex-om izvlači `token`/`invoiceNumber`, a meta podatke (stanica, adresa, datum, ukupno) čita preko istih ID selektora koje je koristio stari Playwright parser.
4. Angular odmah POST-uje (opet preko istog proxy-ja) na `https://suf.purs.gov.rs/specifications` sa `{ invoiceNumber, token }` - isti zahtev koji stranica interno šalje na klik.
5. Rezultat se prikazuje korisniku NA PREGLED (stanica, gorivo, litri, cena, ukupno) - korisnik bira **Sačuvaj** (upisuje se u Supabase) ili **Odbaci** (podaci se bacaju, ništa se ne upisuje).
6. Nakon prijave (Google OAuth preko Supabase), istorija, statistika i dashboard čitaju podatke direktno iz Supabase baze (`fuel_receipts` tabela).

### Zašto proxy postoji i kako čuva sesiju

`suf.purs.gov.rs` zahteva da POST `/specifications` nosi isti sesijski kolačić koji je server izdao na inicijalnom GET-u stranice računa. Pošto browser ne dozvoljava JS-u da čita `Set-Cookie` direktno sa drugog domena, Cloudflare Worker (`cors-proxy/src/index.js`):

- na GET odgovoru prepisuje `Set-Cookie` sa `SameSite=None; Secure` i vraća ga nazad (browser ga tad čuva vezano za origin Worker-a);
- Angular poziva Worker sa `withCredentials: true`, pa browser na sledeći poziv istom Worker-u sam pošalje taj kolačić nazad;
- Worker ga prosledi dalje ka `suf.purs.gov.rs` kao pravi `Cookie` header.

Bez ovoga, `/specifications` vraća `success: false` i korisnik vidi grešku "Poreska uprava nije vratila stavke računa."

Worker takođe prosleđuje **stvarni** `User-Agent`/`Accept-Language`/`Accept` iz browsera korisnika (umesto fiksnog, hardkodovanog otiska za svakoga), da bi zahtevi ličili što više na organski saobraćaj pravog korisnika, a ne na jedan automatizovan izvor.

## Lokalni development

```
cd angular
npm install
npm start          # ng serve, http://localhost:4200
```

Napomena: OAuth login preko Google-a radi samo ako je `http://localhost:4200` (ili koji god port koristiš) dodat u **Redirect URLs** liste u Supabase projektu (Authentication → URL Configuration), inače će te Supabase posle prijave vratiti na produkcioni URL umesto na localhost.

## Konfiguracija (`angular/src/app/core/config/app-config.ts`)

| Konstanta | Šta je |
|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Kredencijali Supabase projekta (auth + baza) |
| `CORS_PROXY_URL` | URL deployed Cloudflare Worker-a, sa `?url=` na kraju |
| `TAX_AUTHORITY_SPECIFICATIONS_URL` | `https://suf.purs.gov.rs/specifications` |
| `SUF_ALLOWED_HOST` | `suf.purs.gov.rs` - validacija da skenirani URL zaista vodi tamo |

## CORS proxy (Cloudflare Worker)

Nalazi se u `cors-proxy/`. Deploy (besplatno, preko Wrangler CLI):

```
cd cors-proxy
npm install
npx wrangler deploy
```

Prvi put traži login na Cloudflare nalog (besplatan) i ispisuje URL oblika `https://fuelscan-proxy.<subdomain>.workers.dev`. Taj URL (+ `/?url=`) se upisuje u `CORS_PROXY_URL`. Svaka sledeća izmena `cors-proxy/src/index.js` zahteva samo ponovni `npx wrangler deploy` - URL ostaje isti.

Worker je ograničen isključivo na `suf.purs.gov.rs` (domain allowlist), da se ne može zloupotrebiti kao opšti proxy.

## Deploy na GitHub Pages

`.github/workflows/deploy.yml` na svaki push na `main` automatski:

1. instalira zavisnosti u `angular/`,
2. builduje produkcionu verziju sa `--base-href /FuelScan/` (mora da odgovara imenu repozitorijuma - `https://<user>.github.io/<repo>/`),
3. upload-uje i deploy-uje `angular/dist/frontend/browser` na GitHub Pages preko `actions/deploy-pages`.

Preduslov (radi se samo jednom, ručno): u repozitorijumu na GitHub-u, **Settings → Pages → Source: GitHub Actions**.

Ruter koristi hash-based routing (`withHashLocation()`) jer GitHub Pages ne ume da radi server-side rewrite za SPA rute - URL-ovi u produkciji izgledaju kao `.../FuelScan/#/dashboard`.

## PWA

Aplikacija je instalabilan PWA (`ng add @angular/pwa`): `manifest.webmanifest` (ikonice, ime, boje - preneto iz starog `manifest.json`) i service worker (`ngsw-config.json`, registrovan u `app.config.ts` preko `provideServiceWorker`, samo u produkciji).

## Poznata ograničenja / oprez

- Ovo koristi javni portal za verifikaciju fiskalnih računa (`suf.purs.gov.rs`) preko neslužbenog puta (nema zvaničan javni API za ovo) - namerno se izbegava agresivno ponašanje (nema automatskog retry-ja, nema pollinga, headeri liče na pravi browser) da se smanji rizik od blokiranja.
- Cloudflare Worker jeste zajednička tačka kroz koju prolazi sav saobraćaj aplikacije, ali izlazi kroz deljen, rotirajući IP opseg Cloudflare-a (ne kroz jednu fiksnu dedicated adresu kao stari backend), što ga čini fundamentalno drugačijim od starog rešenja.
- `CORS_PROXY_URL` i Supabase anon key su javno vidljivi u frontend build-u (to je normalno i očekivano za Supabase anon key uz odgovarajuća Row Level Security pravila u bazi - proveriti da su RLS pravila na `fuel_receipts` tabeli ispravno podešena da svaki korisnik vidi/menja samo svoje redove).

## Tech stack

Angular 20 (standalone komponente, signals, novi `@if`/`@for` control-flow), RxJS, Supabase (`@supabase/supabase-js` - auth + Postgres), `html5-qrcode` (QR dekodiranje u browseru), Chart.js (statistika), Tailwind (CDN), Cloudflare Workers (Wrangler CLI).
