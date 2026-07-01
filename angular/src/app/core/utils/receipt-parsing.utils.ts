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
 * Ekvivalent `parseLocalReceiptDate` iz old-vanilla/js/dateUtil.js.
 * Pretvara "18.6.2026. 11:14:31" (SDC datum sa računa) u ISO-nalik string
 * "2026-06-18T11:14:31" pogodan za Date/Supabase.
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

    return `${year}-${month}-${day}T${timePart}`;
  } catch {
    return dateStr;
  }
}
