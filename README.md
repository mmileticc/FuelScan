# FuelScan

Aplikacija za skeniranje QR koda sa fiskalnog računa za gorivo, automatsko izvlačenje podataka (stanica, količina, cena, ukupno) sa portala Poreske uprave (`suf.purs.gov.rs`) i čuvanje istorije punjenja u ličnom nalogu.

Projekat je migriran sa Vanilla JS + Python/FastAPI backend-a na samostalnu Angular 20 (standalone) aplikaciju koja radi bez sopstvenog backend servera.

## Struktura repozitorijuma

```
angular/         Angular 20+ aplikacija (standalone komponente) - AKTIVNI kod
cors-proxy/      Cloudflare Worker koji rešava CORS problem ka suf.purs.gov.rs
supabase/        SQL migracije za bazu (pokreću se ručno u Supabase SQL Editoru)
.github/         GitHub Actions workflow: testovi + build + deploy na GitHub Pages
```

Stari Python/FastAPI backend i Vanilla JS frontend su uklonjeni iz repozitorijuma (ostali su u git istoriji).

## Kako aplikacija radi (arhitektura)

Stari tok je izgledao ovako: browser šalje URL sa QR koda na sopstveni FastAPI backend, backend otvara headless Chromium (Playwright), učitava stranicu računa, klikće na "Specifikacija" i čupa podatke iz DOM-a.

Novi tok radi sve u browseru, bez ikakvog sopstvenog backend servera:

1. Korisnik skenira QR kod - dobija se URL računa (vidi „Skener“ ispod).
2. Angular (`ReceiptService`) GET-uje HTML te stranice preko CORS proxy-ja (Cloudflare Worker u `cors-proxy/`), jer `suf.purs.gov.rs` ne šalje CORS zaglavlja potrebna za direktan poziv iz browsera.
3. `DOMParser` u browseru parsira taj HTML: iz inline `<script>` bloka regex-om izvlači `token`/`invoiceNumber`, a meta podatke (stanica, adresa, datum, ukupno) čita preko istih ID selektora koje je koristio stari Playwright parser.
4. Angular odmah POST-uje (opet preko istog proxy-ja) na `https://suf.purs.gov.rs/specifications` sa `{ invoiceNumber, token }` - isti zahtev koji stranica interno šalje na klik.
5. Rezultat se prikazuje korisniku NA PREGLED u formi koja se može menjati (stanica, gorivo, litri, cena, ukupno, datum) - korisnik bira **Sačuvaj** (upisuje se u Supabase, uz proveru duplikata) ili **Odbaci**.
6. Nakon prijave (Google OAuth preko Supabase), istorija, statistika i dashboard čitaju podatke direktno iz Supabase baze (`fuel_receipts` tabela).

### Zašto proxy postoji i kako čuva sesiju

`suf.purs.gov.rs` zahteva da POST `/specifications` nosi isti sesijski kolačić koji je server izdao na inicijalnom GET-u stranice računa. Pošto browser ne dozvoljava JS-u da čita `Set-Cookie` direktno sa drugog domena, Cloudflare Worker (`cors-proxy/src/index.js`):

- na GET odgovoru prepisuje `Set-Cookie` sa `SameSite=None; Secure` i vraća ga nazad (browser ga tad čuva vezano za origin Worker-a);
- Angular poziva Worker sa `withCredentials: true`, pa browser na sledeći poziv istom Worker-u sam pošalje taj kolačić nazad;
- Worker ga prosledi dalje ka `suf.purs.gov.rs` kao pravi `Cookie` header.

Bez ovoga, `/specifications` vraća `success: false` i korisnik vidi grešku "Poreska uprava nije vratila stavke računa."

Worker takođe prosleđuje **stvarni** `User-Agent`/`Accept-Language`/`Accept` iz browsera korisnika (umesto fiksnog, hardkodovanog otiska za svakoga), da bi zahtevi ličili što više na organski saobraćaj pravog korisnika, a ne na jedan automatizovan izvor.

### Skener

- Živa kamera skenira **kontinualno** (nema okidanja): ~8 puta u sekundi dekodira se deo kadra unutar okvira-vodiča u punoj rezoluciji kamere. Dekoder je nativni `BarcodeDetector` (Android Chrome) ili, gde ga nema, ZXing WASM iz paketa `barcode-detector` (`.wasm` se služi lokalno iz `assets/zxing/`). Kod je u `angular/src/app/core/scanner/qr-detector.ts`.
- Blic i zum se prikazuju kad ih kamera podržava.
- **Fotografiši** otvara sistemsku kameru telefona (`capture="environment"`) - rezervni put sa pravim autofokusom; slika se dekodira lokalno u više varijanti (ceo kadar, umanjen, isečen).
- **Galerija** i **Ručni unos** (bez QR koda).
- Bez interneta skenirani URL ide u lokalni red **Na čekanju** i obrađuje se kasnije, uz pregled pre čuvanja.

### Prepoznavanje goriva

`detectFuel()` u `receipt-parsing.utils.ts` - naziv stavke se transliteruje (ćirilica -> latinica) i poredi regex-ima sa granicama reči (Dizel/Diesel, BMB/Benzin, brendovi G-Drive, V-Power, MaxxMotion, EVO, Optipur..., TNG/LPG, CNG). AdBlue, ulja i aditivi se isključuju. Račun bez goriva se ne može sačuvati dok korisnik ručno ne upiše gorivo i litre.

## Baza (Supabase)

Pre prvog deploy-a ove verzije pokreni `supabase/migration-2026-10.sql` u **Supabase → SQL Editor**. Migracija:

- dodaje kolonu `invoice_number` (i `odometer_km`, koja se više ne koristi - praćenje potrošnje L/100km je uklonjeno jer ne može da bude tačno),
- dodaje UNIQUE indeks `(user_id, invoice_number)` - isti račun se ne može sačuvati dvaput,
- uključuje **Row Level Security** sa politikama „samo svoji redovi“ (select/insert/update/delete).

Za nadimke stanica pokreni i `supabase/migration-2026-10-nicknames.sql` (tabela `station_nicknames`, sa istim RLS pravilima). Nadimak je vezan za stanicu (normalizovan naziv + adresa), pa ga dobijaju svi njeni računi; postavlja se na pregledu posle skeniranja, pri izmeni računa u Istoriji ili na ekranu Stanice. Bez ove tabele aplikacija radi normalno, samo bez nadimaka.

Na kraju prva migracija ispisuje sve politike na tabeli - ako postoji neka stara politika sa uslovom `true`, obriši je (Authentication → Policies).

## Lokalni development

```
cd angular
npm install
npm start          # ng serve, http://localhost:4200
npx ng test --watch=false --browsers=ChromeHeadless   # unit testovi
```

Napomena: OAuth login preko Google-a radi samo ako je `http://localhost:4200` (ili koji god port koristiš) dodat u **Redirect URLs** liste u Supabase projektu (Authentication → URL Configuration), inače će te Supabase posle prijave vratiti na produkcioni URL umesto na localhost.

## Konfiguracija

Vrednosti po okruženju su u `angular/src/environments/environment.ts` (produkcija) i `environment.development.ts` (`ng serve`); `app-config.ts` ih izlaže kao konstante.

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

Zaštita od zloupotrebe:

- cilj je isključivo `suf.purs.gov.rs` (domain allowlist),
- pozivi su dozvoljeni samo sa origin-a aplikacije (`ALLOWED_ORIGINS` u `src/index.js` - GitHub Pages + localhost); ako se aplikacija preseli na drugi domen, dodaj ga tu,
- rate limit 30 zahteva / 60s po IP adresi + User-Agent-u (binding `SCAN_LIMITER`; User-Agent zato što mobilni operateri dele jednu IP adresu na mnogo korisnika) i gornja granica 300 / 60s samo po IP adresi (`IP_LIMITER`, da se limit ne zaobiđe menjanjem User-Agent-a) - preko toga Worker vraća 429.

## Deploy na GitHub Pages

`.github/workflows/deploy.yml` na svaki push na `main` automatski:

1. instalira zavisnosti u `angular/`,
2. pokreće unit testove (ChromeHeadless) - ako padnu, deploy se ne radi,
3. builduje produkcionu verziju sa `--base-href /FuelScan/` (mora da odgovara imenu repozitorijuma - `https://<user>.github.io/<repo>/`),
4. push-uje `angular/dist/frontend/browser` na granu `gh-pages` (`peaceiris/actions-gh-pages`).

Preduslov (radi se samo jednom, ručno): u repozitorijumu na GitHub-u, **Settings → Pages → Source: Deploy from a branch → `gh-pages` / `(root)`**.

Ruter koristi hash-based routing (`withHashLocation()`) jer GitHub Pages ne ume da radi server-side rewrite za SPA rute - URL-ovi u produkciji izgledaju kao `.../FuelScan/#/dashboard`.

## PWA

Aplikacija je instalabilan PWA (`ng add @angular/pwa`): `manifest.webmanifest` (ikonice, ime, boje - preneto iz starog `manifest.json`) i service worker (`ngsw-config.json`, registrovan u `app.config.ts` preko `provideServiceWorker`, samo u produkciji).

## Poznata ograničenja / oprez

- Ovo koristi javni portal za verifikaciju fiskalnih računa (`suf.purs.gov.rs`) preko neslužbenog puta (nema zvaničan javni API za ovo) - namerno se izbegava agresivno ponašanje (najviše 2 ponovna pokušaja sa pauzom, nema pollinga, headeri liče na pravi browser) da se smanji rizik od blokiranja.
- Cloudflare Worker jeste zajednička tačka kroz koju prolazi sav saobraćaj aplikacije, ali izlazi kroz deljen, rotirajući IP opseg Cloudflare-a (ne kroz jednu fiksnu dedicated adresu kao stari backend), što ga čini fundamentalno drugačijim od starog rešenja.
- `CORS_PROXY_URL` i Supabase anon key su javno vidljivi u frontend build-u (to je normalno za Supabase anon key) - podatke štiti Row Level Security iz `supabase/migration-2026-10.sql`.

## Tech stack

Angular 20 (standalone komponente, signals, novi `@if`/`@for` control-flow), RxJS, Supabase (`@supabase/supabase-js` - auth + Postgres), nativni `BarcodeDetector` + `barcode-detector` (ZXing WASM) za QR, Chart.js (statistika), Tailwind 3 (build-time, PostCSS), Cloudflare Workers (Wrangler CLI).
