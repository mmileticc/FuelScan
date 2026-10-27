/**
 * TypeScript interfejsi za tok parsiranja fiskalnog računa sa suf.purs.gov.rs.
 *
 * Napomena o migraciji: stari backend (Playwright) je otvarao pravi browser,
 * klikom otvarao specifikaciju (`a[href="#collapse-specs"]`) i čupao redove
 * tabele (`#collapse-specs tbody tr`, 7 kolona: name, quantity, unit_price,
 * total, tax_base, vat, label). U novom toku isti podaci se dobijaju
 * direktno pozivom POST https://suf.purs.gov.rs/specifications
 * (isti zahtev koji stranica interno šalje kad se klikne "Specifikacija"),
 * pa `RawSpecificationItem` odgovara JSON shape-u tog odgovora.
 */

/** Selektori identični onima iz `old-backend/parser.py` (meta_selectors). */
export const RECEIPT_META_SELECTORS = {
  invoiceNumber: 'invoiceNumberLabel',
  date: 'sdcDateTimeLabel',
  total: 'totalAmountLabel',
  station: 'shopFullNameLabel',
  address: 'addressLabel',
  city: 'cityLabel',
  municipality: 'administrativeUnitLabel',
} as const;

/** Token + broj računa izvučeni iz inline `<script>` bloka (viewModel.Token / viewModel.InvoiceNumber). */
export interface ReceiptTokenData {
  invoiceNumber: string;
  token: string;
}

/** Meta podaci izvučeni preko ID selektora (isti selektori kao u starom backend-u). */
export interface ReceiptMetadata {
  invoiceNumber: string | null;
  date: string | null;
  total: number | null;
  station: string | null;
  address: string | null;
  city: string | null;
  municipality: string | null;
}

/** Jedna stavka iz JSON odgovora POST /specifications endpointa Poreske uprave. */
export interface RawSpecificationItem {
  gtin?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  label: string;
  labelRate?: number;
  taxBaseAmount?: number;
  vatAmount?: number;
}

/** Sirov odgovor POST https://suf.purs.gov.rs/specifications */
export interface SpecificationsApiResponse {
  success: boolean;
  items?: RawSpecificationItem[];
  message?: string;
}

/**
 * Finalni, očišćen objekat koji šaljemo u UI / Supabase.
 * Nazivi polja su zadržani identični starom `/parse-receipt` odgovoru
 * (main.py) radi kompatibilnosti sa `fuel_receipts` tabelom.
 */
export interface ParsedReceipt {
  status: 'success' | 'error';
  station: string | null;
  address: string | null;
  city: string | null;
  municipality: string | null;
  fuel_type: string | null;
  liters: number | null;
  price_per_l: number | null;
  total: number | null;
  date: string | null;
  invoice_number: string | null;
  raw_url: string | null;
  /** Unosi korisnik na kartici za pregled (opciono). */
  odometer_km?: number | null;
}

/** Red za upis u Supabase tabelu `fuel_receipts`. */
export interface FuelReceiptRow {
  user_id: string;
  /** Broj fiskalnog računa - (user_id, invoice_number) je UNIQUE u bazi; `null` za ručni unos. */
  invoice_number: string | null;
  /** Stanje kilometar-sata pri točenju (opciono) - koristi se za L/100km. */
  odometer_km: number | null;
  station: string | null;
  fuel_type: string | null;
  liters: number | null;
  price_per_l: number | null;
  total: number | null;
  date: string | null;
  raw_url: string | null;
  address: string | null;
  city: string | null;
  municipality: string | null;
}

/** Red pročitan iz Supabase-a (ima `id` i `created_at` koje insert nema). */
export interface FuelReceiptRecord extends FuelReceiptRow {
  id: string;
  created_at?: string;
}

/**
 * Kategorija greške pri skeniranju - koristi se u UI-ju da se odluči ton i
 * ponašanje (da li retry ima smisla, koja boja/poruka):
 *   - `invalid-url` - skeniran kod uopšte ne vodi na suf.purs.gov.rs (nema smisla
 *     ponavljati isti pokušaj, korisnik mora da skenira nešto drugo).
 *   - `parse-failed` - stranica računa se učitala, ali token/invoiceNumber nisu
 *      pronađeni (obično prolazna stvar sa strane Poreske uprave).
 *   - `tax-authority-empty` - POST /specifications je prošao, ali server nije
 *      vratio stavke (najčešći slučaj - "hladan" prvi pristup tom računu).
 *   - `rate-limited` - CORS proxy je vratio 429 (previše pokušaja u kratkom roku).
 *   - `network` - CORS proxy / mreža / bilo šta neočekivano.
 */
export type ReceiptErrorKind = 'invalid-url' | 'parse-failed' | 'tax-authority-empty' | 'rate-limited' | 'network';

export class ReceiptScanError extends Error {
  constructor(
    message: string,
    readonly kind: ReceiptErrorKind,
  ) {
    super(message);
    this.name = 'ReceiptScanError';
  }
}
