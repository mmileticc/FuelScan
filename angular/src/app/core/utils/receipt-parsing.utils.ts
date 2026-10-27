/**
 * Čiste (pure) TypeScript funkcije prenete iz `old-backend/parser.py`.
 *
 * U starom Python backend-u (Playwright parser) korišćene su:
 *   - clean_station_name(name)
 *   - normalize_text(text)   (translit(text, 'sr', reversed=True) -> ćirilica u latinicu)
 *   - parse_number(val)
 *
 * Ove funkcije su 1:1 logički ekvivalent, prilagođene za rad u browseru (bez
 * spoljnih zavisnosti poput `transliterate` Python paketa).
 */

/**
 * Mapa srpske ćirilice u latinicu. Digrafi (Љ, Њ, Џ, Ђ) se obrađuju kao
 * posebni, dvoslovni entiteti da bi transliteracija bila identična onoj
 * koju je radio `transliterate` paket u starom backend-u.
 */
const CYRILLIC_TO_LATIN_MAP: ReadonlyArray<[string, string]> = [
  // Digrafi (moraju ići pre pojedinačnih slova)
  ['Љ', 'Lj'], ['љ', 'lj'],
  ['Њ', 'Nj'], ['њ', 'nj'],
  ['Џ', 'Dž'], ['џ', 'dž'],

  // Pojedinačna slova
  ['А', 'A'], ['а', 'a'],
  ['Б', 'B'], ['б', 'b'],
  ['В', 'V'], ['в', 'v'],
  ['Г', 'G'], ['г', 'g'],
  ['Д', 'D'], ['д', 'd'],
  ['Ђ', 'Đ'], ['ђ', 'đ'],
  ['Е', 'E'], ['е', 'e'],
  ['Ж', 'Ž'], ['ж', 'ž'],
  ['З', 'Z'], ['з', 'z'],
  ['И', 'I'], ['и', 'i'],
  ['Ј', 'J'], ['ј', 'j'],
  ['К', 'K'], ['к', 'k'],
  ['Л', 'L'], ['л', 'l'],
  ['М', 'M'], ['м', 'm'],
  ['Н', 'N'], ['н', 'n'],
  ['О', 'O'], ['о', 'o'],
  ['П', 'P'], ['п', 'p'],
  ['Р', 'R'], ['р', 'r'],
  ['С', 'S'], ['с', 's'],
  ['Т', 'T'], ['т', 't'],
  ['Ћ', 'Ć'], ['ћ', 'ć'],
  ['У', 'U'], ['у', 'u'],
  ['Ф', 'F'], ['ф', 'f'],
  ['Х', 'H'], ['х', 'h'],
  ['Ц', 'C'], ['ц', 'c'],
  ['Ч', 'Č'], ['ч', 'č'],
  ['Ш', 'Š'], ['ш', 'š'],
];

// Pretvaramo mapu u RegExp koji hvata i digrafe i pojedinačna slova u jednom prolazu.
const CYRILLIC_PATTERN = new RegExp(
  CYRILLIC_TO_LATIN_MAP.map(([cyr]) => cyr).join('|'),
  'g',
);
const CYRILLIC_LOOKUP = new Map(CYRILLIC_TO_LATIN_MAP);

/**
 * Ekvivalent `normalize_text` iz parser.py.
 * Proverava da li tekst sadrži ćirilicu i transliteruje ga u latinicu.
 * Ako je tekst već latinica (ili prazan), vraća ga nepromenjenog.
 */
export function normalizeText(text: string | null | undefined): string | null {
  if (!text) {
    return text ?? null;
  }

  try {
    return text.replace(CYRILLIC_PATTERN, (match) => CYRILLIC_LOOKUP.get(match) ?? match);
  } catch {
    // Ako nešto krene po zlu, vrati original (isto ponašanje kao u parser.py)
    return text;
  }
}

/**
 * Ekvivalent `clean_station_name` iz parser.py.
 * Uklanja vodeći broj stanice (npr. "1249582-CAMPER GALERIJA" -> "CAMPER GALERIJA")
 * i zatim primenjuje normalizaciju (translit + čišćenje).
 */
export function cleanStationName(name: string | null | undefined): string | null {
  if (!name) {
    return name ?? null;
  }

  // RegEx koji uklanja brojeve na početku stringa praćene crticom ili razmakom.
  const cleanName = name.replace(/^\d+[-\s]+/, '');
  return normalizeText(cleanName);
}

/**
 * Ekvivalent `parse_number` iz parser.py.
 * Pretvara srpski format broja (npr. "1.234,56") u čist JS `number`.
 * Ako je vrednost već broj, samo je vraća. Vraća `null` ako parsiranje ne uspe.
 */
export function parseNumber(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) {
    return null;
  }

  if (typeof val === 'number') {
    return val;
  }

  try {
    const cleanVal = String(val).trim().replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(cleanVal);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * Zaokružuje broj na 2 decimale (standardno za novac/litre u UI-ju).
 * Vraća `null` ako ulaz nije validan broj.
 */
export function roundTo2(val: number | null | undefined): number | null {
  if (val === null || val === undefined || Number.isNaN(val)) {
    return null;
  }
  return Math.round(val * 100) / 100;
}

/**
 * Vraća UTC offset za Europe/Belgrade (npr. "+02:00" leti, "+01:00" zimi) za
 * dati lokalni datum/vreme. Bez ovoga bi "2026-06-18T11:14:31" bez zone
 * Postgres (timestamptz) protumačio kao UTC i pomerio vreme za 1-2h - što na
 * prelazu meseca ume da prebaci točenje u pogrešan mesec.
 */
export function belgradeOffset(year: number, month: number, day: number, hour = 12): string {
  try {
    // Uzimamo trenutak "otprilike" tog lokalnog vremena (kao UTC) - razlika od
    // par sati ne menja offset osim tačno u noći promene vremena, što je prihvatljivo.
    const probe = new Date(Date.UTC(year, month - 1, day, hour));
    const part = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Belgrade', timeZoneName: 'longOffset' })
      .formatToParts(probe)
      .find((p) => p.type === 'timeZoneName')?.value;
    // "GMT+02:00" -> "+02:00"; "GMT" (offset 0) -> "+00:00"
    const match = part?.match(/GMT([+-]\d{2}:\d{2})/);
    return match ? match[1] : '+00:00';
  } catch {
    return '+01:00';
  }
}

/**
 * Ekvivalent `parseLocalReceiptDate` iz old-vanilla/js/dateUtil.js.
 * Pretvara "18.6.2026. 11:14:31" (SDC datum sa računa, lokalno vreme u Srbiji)
 * u ISO string SA zonom, npr. "2026-06-18T11:14:31+02:00".
 */
export function parseLocalReceiptDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return dateStr ?? null;
  }
  if (dateStr.includes('-')) {
    return dateStr; // Već je ISO format
  }

  try {
    const cleanStr = dateStr.trim();
    const parts = cleanStr.split(/\s+/);
    const datePart = parts[0];
    const timePart = parts[1] || '00:00:00';

    const dateComponents = datePart.split('.').filter(Boolean);
    if (dateComponents.length < 3) {
      return dateStr;
    }

    const day = dateComponents[0].padStart(2, '0');
    const month = dateComponents[1].padStart(2, '0');
    const year = dateComponents[2];
    const [hh = '00', mm = '00', ss = '00'] = timePart.split(':');
    const time = `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:${ss.padStart(2, '0')}`;
    const offset = belgradeOffset(Number(year), Number(month), Number(day), Number(hh));

    return `${year}-${month}-${day}T${time}${offset}`;
  } catch {
    return dateStr;
  }
}

/**
 * Proverava da URL sa QR koda zaista vodi na portal Poreske uprave
 * (tačan hostname, https) - `includes()` bi propustio i
 * "https://evil.com/?suf.purs.gov.rs".
 */
export function isSufReceiptUrl(url: string | null | undefined, allowedHost = 'suf.purs.gov.rs'): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' && parsed.hostname === allowedHost;
  } catch {
    return false;
  }
}

export type FuelCategory = 'Dizel' | 'Benzin' | 'TNG' | 'CNG';

export interface FuelDetection {
  isFuel: boolean;
  category: FuelCategory | null;
}

/**
 * Pravila za prepoznavanje goriva po nazivu stavke. Redosled je bitan (prvo
 * specifičniji). Sve sa granicama reči, da npr. "PREMIUM KAFA" ili "VEGAS"
 * ne bi bili protumačeni kao gorivo.
 */
const BRANDED = String.raw`(?:EVO|EKTO|G-?DRIVE|V-?POWER|MAXXMOTION|FUELSAVE)`;
const FUEL_RULES: ReadonlyArray<[RegExp, FuelCategory]> = [
  [/\b(TNG|LPG|AUTO\s?-?GAS|AUTOPLIN)\b/, 'TNG'],
  [/\b(CNG|KPG|METAN)\b/, 'CNG'],
  [new RegExp(String.raw`(DIZEL|DIESEL)\b|\bD2\b|\b${BRANDED}\s*D\b`), 'Dizel'],
  [
    new RegExp(
      String.raw`\bBMB|BENZIN\b|\b(EUROSUPER|EVROSUPER|OPTIPUR)\b|\bSUPER\s*9[58]\b|\b${BRANDED}\s*(95|98|100)\b|\b(V-?POWER|MAXXMOTION|G-?DRIVE|FUELSAVE)\b`,
    ),
    'Benzin',
  ],
];

/** Stavke koje sadrže reči goriva, ali NISU gorivo za vozilo (AdBlue, ulja, aditivi, boce za plin). */
const NON_FUEL_PATTERN = /\b(AD-?BLUE|ADITIV|ADDITIVE|ULJE|OIL|TECNOST|PRANJE|BOCA|BOCE)\b/;

/**
 * Prepoznaje da li je stavka sa računa gorivo i koje kategorije. Naziv se
 * prvo transliteruje (ćirilica -> latinica), pa se upoređuje velikim slovima.
 */
export function detectFuel(name: string | null | undefined): FuelDetection {
  const normalized = (normalizeText(name) ?? '').toUpperCase();
  if (!normalized || NON_FUEL_PATTERN.test(normalized)) {
    return { isFuel: false, category: null };
  }
  for (const [pattern, category] of FUEL_RULES) {
    if (pattern.test(normalized)) {
      return { isFuel: true, category };
    }
  }
  return { isFuel: false, category: null };
}

/** "Adresa, Grad" za prikaz (ili "Nepoznata lokacija"). */
export function formatLocation(item: { address?: string | null; city?: string | null }): string {
  return [item.address, item.city].filter((v): v is string => !!v).join(', ') || 'Nepoznata lokacija';
}
