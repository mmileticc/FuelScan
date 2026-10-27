import { FuelReceiptRecord } from '../models/receipt.model';
import { FuelCategory, detectFuel, normalizeText } from './receipt-parsing.utils';

export interface PricePoint {
  date: string;
  price: number;
  liters: number;
}

export interface CategoryPriceHistory {
  category: FuelCategory;
  /** Najstariji prvi. */
  history: PricePoint[];
  /** Ista istorija, najnoviji prvi (za prikaz liste). */
  recentFirst: PricePoint[];
  last: PricePoint;
  /** Prethodna cena (za strelicu trenda), `null` ako je samo jedno točenje. */
  previous: PricePoint | null;
  /** Ponderisano litrima. */
  avg: number;
  min: number;
  max: number;
}

export interface StationSummary {
  /** Stabilan ključ grupe (normalizovan naziv + adresa). */
  key: string;
  name: string;
  address: string | null;
  city: string | null;
  count: number;
  total: number;
  liters: number;
  lastVisit: string | null;
  /** Cene praćene posebno za svaku vrstu goriva. */
  categories: CategoryPriceHistory[];
  /** `id`-jevi računa koji pripadaju ovoj stanici. */
  receiptIds: string[];
}

/**
 * Ključ za poređenje teksta: ćirilica -> latinica, velika slova, bez
 * dijakritika, interpunkcije i višestrukih razmaka. Tako "NIS  Petrol",
 * "НИС ПЕТРОЛ", "nis-petrol", "Spoonit d.o.o." / "SPOONIT DOO" i
 * "Oslobođenja" / "OSLOBODJENJA" završe u istoj grupi.
 */
export function normalizeKey(value: string | null | undefined): string {
  return (normalizeText(value) ?? '')
    .toUpperCase()
    .replace(/Đ/g, 'DJ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Č/Ć/Š/Ž -> C/C/S/Z (neki računi nemaju dijakritike)
    .replace(/[.'"]/g, '') // "D.O.O." === "DOO"
    .replace(/[,;:()/\\-]/g, ' ') // "NIS-PETROL" === "NIS PETROL"
    .replace(/\s+/g, ' ')
    .trim();
}

function time(r: { date: string | null }): number {
  const t = r.date ? new Date(r.date).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Grupisanje točenja po stanici.
 *
 * Isti naziv na različitim adresama = različite stanice (npr. dve pumpe istog
 * lanca). Zapisi bez adrese (stari ili ručni unosi) pripajaju se najčešćoj
 * adresi tog naziva, da se ista stanica ne pojavi dvaput samo zato što jednom
 * adresa nije bila upisana.
 */
export function groupByStation(receipts: FuelReceiptRecord[]): StationSummary[] {
  const byName = new Map<string, FuelReceiptRecord[]>();
  for (const r of receipts) {
    const nameKey = normalizeKey(r.station);
    if (!nameKey) continue;
    const list = byName.get(nameKey) ?? [];
    list.push(r);
    byName.set(nameKey, list);
  }

  const summaries: StationSummary[] = [];
  for (const [nameKey, list] of byName) {
    const byAddress = new Map<string, FuelReceiptRecord[]>();
    const withoutAddress: FuelReceiptRecord[] = [];
    for (const r of list) {
      const addressKey = normalizeKey(r.address);
      if (!addressKey) {
        withoutAddress.push(r);
        continue;
      }
      const group = byAddress.get(addressKey) ?? [];
      group.push(r);
      byAddress.set(addressKey, group);
    }

    if (!byAddress.size) {
      summaries.push(summarize(nameKey, withoutAddress));
      continue;
    }
    const mostCommon = [...byAddress.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
    byAddress.get(mostCommon)!.push(...withoutAddress);
    for (const [addressKey, group] of byAddress) {
      summaries.push(summarize(`${nameKey}|${addressKey}`, group));
    }
  }

  return summaries.sort((a, b) => b.count - a.count || (b.lastVisit ?? '').localeCompare(a.lastVisit ?? ''));
}

function summarize(key: string, records: FuelReceiptRecord[]): StationSummary {
  const sorted = [...records].sort((a, b) => time(a) - time(b));
  const latest = sorted[sorted.length - 1];
  // Prikazuje se najnoviji zapis naziva/adrese (najverovatnije ispravno transliterisan).
  const withAddress = [...sorted].reverse().find((r) => r.address) ?? latest;

  const perCategory = new Map<FuelCategory, PricePoint[]>();
  for (const r of sorted) {
    const category = detectFuel(r.fuel_type).category;
    const price = Number(r.price_per_l) || 0;
    if (!category || price <= 0 || !r.date) continue;
    const points = perCategory.get(category) ?? [];
    points.push({ date: r.date, price, liters: Number(r.liters) || 0 });
    perCategory.set(category, points);
  }

  const categories: CategoryPriceHistory[] = [...perCategory.entries()]
    .map(([category, history]) => {
      const liters = history.reduce((s, p) => s + p.liters, 0);
      const avg = liters > 0 ? history.reduce((s, p) => s + p.price * p.liters, 0) / liters : history.reduce((s, p) => s + p.price, 0) / history.length;
      const prices = history.map((p) => p.price);
      return {
        category,
        history,
        recentFirst: [...history].reverse(),
        last: history[history.length - 1],
        previous: history.length > 1 ? history[history.length - 2] : null,
        avg,
        min: Math.min(...prices),
        max: Math.max(...prices),
      };
    })
    .sort((a, b) => b.history.length - a.history.length);

  return {
    key,
    name: (normalizeText(latest.station) ?? '').trim(),
    address: withAddress.address,
    city: withAddress.city,
    count: records.length,
    total: records.reduce((s, r) => s + (Number(r.total) || 0), 0),
    liters: records.reduce((s, r) => s + (Number(r.liters) || 0), 0),
    lastVisit: latest.date,
    categories,
    receiptIds: records.map((r) => r.id),
  };
}

/** `id` računa -> ključ stanice (za nadimke u istoriji, dashboard-u...). */
export function stationKeyMap(receipts: FuelReceiptRecord[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const station of groupByStation(receipts)) {
    for (const id of station.receiptIds) result.set(id, station.key);
  }
  return result;
}

/**
 * Ključ stanice za račun koji (možda) još nije sačuvan - npr. na pregledu
 * posle skeniranja, da se ponudi postojeći nadimak i sačuva novi.
 */
export function resolveStationKey(
  record: Pick<FuelReceiptRecord, 'station' | 'address'> & Partial<FuelReceiptRecord>,
  receipts: FuelReceiptRecord[],
): string | null {
  if (!normalizeKey(record.station)) return null;
  const probeId = record.id ?? '__probe__';
  const probe = { ...(record as FuelReceiptRecord), id: probeId };
  const others = receipts.filter((r) => r.id !== probeId);
  return stationKeyMap([...others, probe]).get(probeId) ?? null;
}
