import { FuelReceiptRecord } from '../../core/models/receipt.model';

const HEADER = ['Datum', 'Nadimak', 'Stanica', 'Adresa', 'Grad', 'Gorivo', 'Litara', 'Cena/L', 'Ukupno (RSD)', 'Broj računa'];

/**
 * CSV za Excel u srpskom locale-u: separator `;`, decimalni zarez.
 */
export function receiptsToCsv(
  receipts: FuelReceiptRecord[],
  nickname: (r: FuelReceiptRecord) => string | null = () => null,
): string {
  const rows = receipts.map((r) => [
    formatDate(r.date),
    nickname(r),
    r.station,
    r.address,
    r.city,
    r.fuel_type,
    decimal(r.liters, 2),
    decimal(r.price_per_l, 2),
    decimal(r.total, 2),
    r.invoice_number,
  ]);
  return [HEADER, ...rows].map((row) => row.map(cell).join(';')).join('\r\n');
}

function cell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function decimal(value: number | null | undefined, digits: number): string {
  return typeof value === 'number' && !Number.isNaN(value) ? value.toFixed(digits).replace('.', ',') : '';
}

function formatDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
