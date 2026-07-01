import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from, throwError, timer } from 'rxjs';
import { catchError, delay, map, retry, switchMap } from 'rxjs/operators';

import { CORS_PROXY_URL, SUF_ALLOWED_HOST, TAX_AUTHORITY_SPECIFICATIONS_URL } from '../config/app-config';
import {
  FUEL_KEYWORDS,
  FuelReceiptRow,
  ParsedReceipt,
  RECEIPT_META_SELECTORS,
  ReceiptMetadata,
  ReceiptTokenData,
  SpecificationsApiResponse,
} from '../models/receipt.model';
import { supabaseClient } from '../supabase/supabase-client';
import { cleanStationName, normalizeText, parseLocalReceiptDate, parseNumber } from '../utils/receipt-parsing.utils';

/**
 * Novi tok parsiranja fiskalnog računa (zamena za `old-backend` Playwright parser).
 *
 * Stari tok (`main.py` + `parser.py`):
 *   1. Backend prima URL sa QR koda preko POST /parse-receipt.
 *   2. Playwright otvara pravi headless Chromium, čeka DOM, čupa meta polja
 *      preko ID selektora (#invoiceNumberLabel, #sdcDateTimeLabel, ...),
 *      zatim KLIKĆE na `a[href="#collapse-specs"]` da se otvori specifikacija
 *      i čupa `#collapse-specs tbody tr` (7 kolona po redu).
 *
 * Novi tok (ovaj servis):
 *   1. HttpClient dovlači isti HTML preko CORS proxy-ja (suf.purs.gov.rs nema
 *      Access-Control-Allow-Origin zaglavlje za browser fetch sa drugog origin-a).
 *   2. DOMParser parsira HTML u Document i:
 *        - iz inline <script> bloka regex-om izvlači `viewModel.Token(...)`
 *          i `viewModel.InvoiceNumber(...)` (isti podaci koje je stranica
 *          koristila da sama pozove specifikaciju klikom),
 *        - preko ISTIH ID selektora kao stari backend čita meta polja.
 *   3. switchMap odmah poziva POST https://suf.purs.gov.rs/specifications
 *      sa { invoiceNumber, token } - to je isti zahtev koji stranica
 *      interno šalje na klik, samo pozvan direktno (preko proxy-ja), bez
 *      potrebe za headless browserom.
 *   4. Rezultat se mapira u ParsedReceipt (ista polja kao stari /parse-receipt
 *      odgovor) i vraća korisniku NA PREGLED - upis u Supabase NIJE
 *      automatski. Isto kao stari `window.__pendingReceipt` tok
 *      (`old-vanilla/js/scanner.js` + `main.js`): korisnik mora da klikne
 *      "Sačuvaj" (`btn-save-result`) da bi se račun upisao, ili "Odbaci"
 *      (`btn-discard-result`) da ga baci.
 */
@Injectable({ providedIn: 'root' })
export class ReceiptService {
  private readonly http = inject(HttpClient);

  /**
   * Glavna ulazna tačka - poziva se sa URL-om dekodovanim iz QR koda.
   * Vraća potpuno parsiran račun (JOŠ NIJE sačuvan u bazi).
   */
  scanReceipt$(receiptUrl: string): Observable<ParsedReceipt> {
    if (!receiptUrl || !receiptUrl.includes(SUF_ALLOWED_HOST)) {
      return throwError(() => new Error(`Nevažeći URL računa: ${receiptUrl}`));
    }

    return this.fetchReceiptHtml$(receiptUrl).pipe(
      map((html) => this.parseTokenAndMetadata(html)),
      // Kratka pauza pre POST /specifications: sesijski kolačić koji je proxy
      // upravo prepisao ume da "legne" na suf.purs.gov.rs strani sa malim
      // kašnjenjem - POST odmah nakon GET-a povremeno naleti na trenutak kad
      // server još ne prepoznaje sesiju kao validnu, pa vrati praznu specifikaciju.
      delay(400),
      switchMap(({ tokenData, metadata }) =>
        this.fetchSpecifications$(tokenData).pipe(
          map((specs) => this.buildParsedReceipt(metadata, specs, receiptUrl)),
          // Retry politika: ako Poreska uprava povremeno ne vrati stavke
          // (`specs.success === false` / prazna specifikacija) ili mrežni
          // poziv pukne, probaj još 2 puta sa rastućom pauzom (2s pa 4s) pre
          // nego što se korisniku prijavi greška - upravo ovo je najčešći
          // uzrok povremenog "Poreska uprava nije vratila stavke računa.".
          retry({
            count: 2,
            delay: (_error, retryCount) => timer(2000 * retryCount),
          }),
        ),
      ),
      catchError((err) => throwError(() => (err instanceof Error ? err : new Error(String(err))))),
    );
  }

  /**
   * Poziva se tek kad korisnik eksplicitno klikne "Sačuvaj" na kartici
   * rezultata (isti trenutak kao stari `btn-save-result` handler u
   * `main.js`, koji je zvao `saveReceiptToSupabase(window.__pendingReceipt)`).
   */
  saveReceipt$(receipt: ParsedReceipt): Observable<true> {
    return this.saveReceiptToSupabase$(receipt);
  }

  /**
   * 1. Fetch HTML-a preko proxy-ja (HttpClient, ne direktan poziv zbog CORS-a).
   *
   * `withCredentials: true` je OBAVEZNO ovde: proxy vraća session cookie sa
   * suf.purs.gov.rs (rewrite-ovan za cross-site upotrebu), a bez ovog flega
   * browser bi taj Set-Cookie ignorisao i sledeći POST /specifications bi
   * pao (suf.purs.gov.rs vraća `success:false` bez validne sesije).
   */
  private fetchReceiptHtml$(receiptUrl: string): Observable<string> {
    const proxiedUrl = `${CORS_PROXY_URL}${encodeURIComponent(receiptUrl)}`;
    return this.http.get(proxiedUrl, { responseType: 'text', withCredentials: true });
  }

  /**
   * 2. DOMParser ekstrakcija:
   *    - token/invoiceNumber iz inline <script> sadržaja
   *    - meta polja preko istih ID selektora kao stari Playwright parser
   */
  private parseTokenAndMetadata(html: string): {
    tokenData: ReceiptTokenData;
    metadata: ReceiptMetadata;
  } {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Token i broj računa žive u inline <script> bloku stranice, npr:
    //   viewModel.InvoiceNumber('Z9BR74H2-Z9BR74H2-7281');
    //   viewModel.Token('a1b2c3d4-...');
    const scriptText = Array.from(doc.querySelectorAll('script'))
      .map((scriptEl) => scriptEl.textContent ?? '')
      .join('\n');

    const invoiceNumberMatch = scriptText.match(/viewModel\.InvoiceNumber\(['"]([^'"]+)['"]\)/);
    const tokenMatch = scriptText.match(/viewModel\.Token\(['"]([^'"]+)['"]\)/);

    const invoiceNumber = invoiceNumberMatch?.[1];
    const token = tokenMatch?.[1];

    if (!invoiceNumber || !token) {
      throw new Error('Nije moguće izvući token/invoiceNumber sa stranice računa.');
    }

    const getById = (id: string): string | null => {
      const el = doc.querySelector(`#${id}`);
      const text = el?.textContent?.trim();
      return text ? text : null;
    };

    const metadata: ReceiptMetadata = {
      invoiceNumber,
      date: normalizeText(getById(RECEIPT_META_SELECTORS.date)),
      total: parseNumber(getById(RECEIPT_META_SELECTORS.total)),
      station: cleanStationName(getById(RECEIPT_META_SELECTORS.station)),
      address: normalizeText(getById(RECEIPT_META_SELECTORS.address)),
      city: normalizeText(getById(RECEIPT_META_SELECTORS.city)),
      municipality: normalizeText(getById(RECEIPT_META_SELECTORS.municipality)),
    };

    return { tokenData: { invoiceNumber, token }, metadata };
  }

  /**
   * 3. switchMap logika: odmah nakon dobijanja token/invoiceNumber-a,
   *    direktan POST poziv ka Poreskoj upravi (preko proxy-ja, bez Playwright klika).
   */
  private fetchSpecifications$({ invoiceNumber, token }: ReceiptTokenData): Observable<SpecificationsApiResponse> {
    const body = new URLSearchParams({ invoiceNumber, token }).toString();

    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    });

    // I POST /specifications ide preko istog proxy-ja kao i GET HTML-a -
    // suf.purs.gov.rs ne šalje CORS zaglavlja ni ovde, pa direktan poziv iz
    // browsera sa drugog origin-a biva blokiran identično kao GET.
    const proxiedUrl = `${CORS_PROXY_URL}${encodeURIComponent(TAX_AUTHORITY_SPECIFICATIONS_URL)}`;

    // withCredentials: true - šalje nazad kolačić koji je proxy postavio u
    // koraku 1 (fetchReceiptHtml$), da bi ga proxy prosledio suf.purs.gov.rs-u.
    return this.http.post<SpecificationsApiResponse>(proxiedUrl, body, {
      headers,
      withCredentials: true,
    });
  }

  /**
   * 4. Mapiranje u ParsedReceipt - identična logika prepoznavanja goriva
   *    kao `fuel_keywords` petlja u starom `main.py`.
   */
  private buildParsedReceipt(
    metadata: ReceiptMetadata,
    specs: SpecificationsApiResponse,
    receiptUrl: string,
  ): ParsedReceipt {
    if (!specs.success || !specs.items) {
      throw new Error(specs.message || 'Poreska uprava nije vratila stavke računa.');
    }

    let fuelType: string | null = null;
    let liters: number | null = null;
    let pricePerL: number | null = null;

    for (const item of specs.items) {
      const nameUpper = item.name.toUpperCase();
      if (FUEL_KEYWORDS.some((keyword) => nameUpper.includes(keyword))) {
        fuelType = item.name.trim();
        liters = item.quantity;
        pricePerL = item.unitPrice;
        break;
      }
    }

    return {
      status: 'success',
      station: metadata.station,
      address: metadata.address,
      city: metadata.city,
      municipality: metadata.municipality,
      fuel_type: fuelType,
      liters,
      price_per_l: pricePerL,
      total: metadata.total,
      date: metadata.date,
      invoice_number: metadata.invoiceNumber,
      raw_url: receiptUrl,
    };
  }

  /**
   * 5. Upis u Supabase `fuel_receipts` tabelu NA ZAHTEV korisnika (dugme
   *    "Sačuvaj"), isti red kao `saveReceiptToSupabase` iz `old-vanilla/js/api.js`.
   */
  private saveReceiptToSupabase$(receipt: ParsedReceipt): Observable<true> {
    return from(supabaseClient.auth.getUser()).pipe(
      switchMap(({ data, error: authError }) => {
        if (authError || !data.user) {
          return throwError(() => new Error('Korisnik nije prijavljen.'));
        }

        const row: FuelReceiptRow = {
          user_id: data.user.id,
          station: receipt.station,
          fuel_type: receipt.fuel_type,
          liters: receipt.liters,
          price_per_l: receipt.price_per_l,
          total: receipt.total,
          date: parseLocalReceiptDate(receipt.date),
          raw_url: receipt.raw_url,
          address: receipt.address,
          city: receipt.city,
          municipality: receipt.municipality,
        };

        return from(supabaseClient.from('fuel_receipts').insert([row]));
      }),
      map(({ error: insertError }) => {
        if (insertError) {
          throw insertError;
        }
        return true as const;
      }),
    );
  }
}
