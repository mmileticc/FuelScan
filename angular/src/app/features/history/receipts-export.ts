import type { CellObject, Row, SheetData } from 'write-excel-file/browser';

import { FuelReceiptRecord } from '../../core/models/receipt.model';

/**
 * Izvoz u pravi Excel fajl (.xlsx) umesto CSV-a: CSV se u Excel-u otvara
 * različito zavisno od regionalnih podešavanja (sve u jednoj koloni, pogrešni
 * decimalni zarezi, datumi kao tekst), a na telefonu ga mnogi pregledači
 * prikazuju kao sirov tekst. .xlsx nosi kolone, širine, formate brojeva i
 * datuma, pa izgleda isto u Excel-u, Google Sheets-u i Numbers-u.
 *
 * Biblioteka se učitava tek na klik (`import()`), da ne povećava početni paket.
 */

const HEADER_STYLE: Partial<CellObject> = {
  fontWeight: 'bold',
  textColor: '#FFFFFF',
  backgroundColor: '#0369A1',
  align: 'center',
  alignVertical: 'center',
  height: 22,
};

const TOTAL_STYLE: Partial<CellObject> = {
  fontWeight: 'bold',
  backgroundColor: '#E0F2FE',
  topBorderStyle: 'thin',
  topBorderColor: '#0369A1',
};

const COLUMNS: Array<{ title: string; width: number }> = [
  { title: 'Datum', width: 17 },
  { title: 'Stanica', width: 30 },
  { title: 'Naziv sa računa', width: 36 },
  { title: 'Adresa', width: 28 },
  { title: 'Grad', width: 16 },
  { title: 'Gorivo', width: 16 },
  { title: 'Litara', width: 10 },
  { title: 'Cena/L (RSD)', width: 13 },
  { title: 'Ukupno (RSD)', width: 14 },
  { title: 'Broj računa', width: 30 },
];

const NUMBER_2 = '#,##0.00';

/**
 * Excel datumi nemaju vremensku zonu: upisuje se lokalno vreme (kao na
 * računu), zapakovano u UTC da ga biblioteka ne pomeri.
 */
function excelDate(value: string | null): CellObject | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { value, type: String };
  const local = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
  return { value: local, type: Date, format: 'dd.mm.yyyy hh:mm' };
}

function num(value: number | null | undefined): CellObject | null {
  return typeof value === 'number' && !Number.isNaN(value) ? { value, type: Number, format: NUMBER_2 } : null;
}

function text(value: string | null | undefined): CellObject | null {
  return value ? { value, type: String } : null;
}

/** Tabela za izvoz (bez I/O - lako se testira). */
export function buildReceiptsSheet(
  receipts: FuelReceiptRecord[],
  nickname: (r: FuelReceiptRecord) => string | null = () => null,
): SheetData {
  const header: Row = COLUMNS.map((c) => ({ value: c.title, ...HEADER_STYLE }));

  const rows: Row[] = receipts.map((r) => [
    excelDate(r.date),
    text(nickname(r) ?? r.station),
    text(r.station),
    text(r.address),
    text(r.city),
    text(r.fuel_type),
    num(r.liters),
    num(r.price_per_l),
    num(r.total),
    text(r.invoice_number),
  ]);

  const sum = (pick: (r: FuelReceiptRecord) => number | null) => receipts.reduce((s, r) => s + (Number(pick(r)) || 0), 0);
  const totalRow: Row = [
    { value: `Ukupno (${receipts.length})`, type: String, ...TOTAL_STYLE },
    ...Array.from({ length: 5 }, () => ({ ...TOTAL_STYLE })),
    { value: sum((r) => r.liters), type: Number, format: NUMBER_2, ...TOTAL_STYLE },
    { ...TOTAL_STYLE },
    { value: sum((r) => r.total), type: Number, format: NUMBER_2, ...TOTAL_STYLE },
    { ...TOTAL_STYLE },
  ];

  return [header, ...rows, totalRow];
}

/** Pravi i preuzima .xlsx fajl. */
export async function downloadReceiptsXlsx(
  receipts: FuelReceiptRecord[],
  nickname: (r: FuelReceiptRecord) => string | null,
): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const data = buildReceiptsSheet(receipts, nickname);
  const fileName = `fuelscan-${new Date().toISOString().slice(0, 10)}.xlsx`;
  await writeExcelFile(data, {
    sheet: 'Točenja',
    columns: COLUMNS.map(({ width }) => ({ width })),
    stickyRowsCount: 1,
  }).toFile(fileName);
}
