import { FuelReceiptRecord } from '../models/receipt.model';
import { FuelCategory, detectFuel } from './receipt-parsing.utils';
import { groupByStation } from './stations.utils';

export interface MonthlyDiff {
  text: string;
  isIncrease: boolean;
}

export interface MonthlyComparison {
  spent: MonthlyDiff;
  liters: MonthlyDiff;
  totals: { thisSpent: number; thisLiters: number };
}

/** Poredi potrošnju ovog i prošlog KALENDARSKOG meseca (dashboard). */
export function getMonthlyComparison(receipts: FuelReceiptRecord[], now = new Date()): MonthlyComparison {
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  const filterByMonth = (m: number, y: number) =>
    receipts.filter((r) => {
      if (!r.date) return false;
      const d = new Date(r.date);
      if (isNaN(d.getTime())) return false;
      return d.getMonth() === m && d.getFullYear() === y;
    });

  const thisMonth = filterByMonth(currentMonth, currentYear);
  const lastMonth = filterByMonth(prevMonth, prevMonthYear);

  const calcTotal = (arr: FuelReceiptRecord[], key: 'total' | 'liters') =>
    arr.reduce((s, r) => s + (Number(r[key]) || 0), 0);

  const thisSpent = calcTotal(thisMonth, 'total');
  const lastSpent = calcTotal(lastMonth, 'total');
  const thisLiters = calcTotal(thisMonth, 'liters');
  const lastLiters = calcTotal(lastMonth, 'liters');

  const getDiff = (curr: number, prev: number): MonthlyDiff => {
    if (prev === 0) return { text: '', isIncrease: false };
    const diff = curr - prev;
    const percent = ((diff / prev) * 100).toFixed(0);
    return {
      text: diff === 0 ? 'Isto' : `${diff > 0 ? '+' : ''}${percent}% u odnosu na prethodni mesec`,
      isIncrease: diff > 0,
    };
  };

  return {
    spent: getDiff(thisSpent, lastSpent),
    liters: getDiff(thisLiters, lastLiters),
    totals: { thisSpent, thisLiters },
  };
}

export type StatsPeriod = 'all' | 'year' | 'month';

export interface StatisticsResult {
  periodTotal: number;
  periodLiters: number;
  /** Vrsta goriva za koju važe najjeftinije/najskuplje i trend cena. */
  category: FuelCategory | null;
  /** Vrste goriva koje se pojavljuju u periodu, najčešća prva. */
  categories: FuelCategory[];
  cheapest: FuelReceiptRecord | null;
  expensive: FuelReceiptRecord | null;
  chartData: FuelReceiptRecord[];
}

/**
 * Agregati za ekran statistike. Periodi su "klizni" (poslednjih 30 dana /
 * 12 meseci) - za razliku od dashboard-a koji gleda kalendarski mesec.
 */
export function computeStatistics(
  receipts: FuelReceiptRecord[],
  period: StatsPeriod = 'all',
  now = new Date(),
  preferredCategory: FuelCategory | null = null,
): StatisticsResult {
  const filtered = filterByPeriod(receipts, period, now);

  // Cene različitih goriva se ne porede međusobno (TNG bi uvek bio "najjeftiniji"):
  // najjeftinije/najskuplje i trend važe za jednu vrstu - izabranu ili najčešću.
  const priced = filtered
    .filter((r) => Number(r.price_per_l) > 0 && r.station)
    .map((r) => ({ r, category: detectFuel(r.fuel_type).category }));
  const counts = new Map<FuelCategory, number>();
  for (const { category } of priced) {
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const categories = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const category = preferredCategory && counts.has(preferredCategory) ? preferredCategory : (categories[0] ?? null);
  const validForStats = priced.filter((p) => p.category === category).map((p) => p.r);

  const periodTotal = filtered.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
  const periodLiters = filtered.reduce((sum, r) => sum + (Number(r.liters) || 0), 0);

  let cheapest: FuelReceiptRecord | null = null;
  let expensive: FuelReceiptRecord | null = null;

  if (validForStats.length > 0) {
    cheapest = validForStats.reduce((min, r) => (Number(r.price_per_l) < Number(min.price_per_l) ? r : min), validForStats[0]);
    expensive = validForStats.reduce((max, r) => (Number(r.price_per_l) > Number(max.price_per_l) ? r : max), validForStats[0]);
  }

  const chartData = [...validForStats].sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime());

  return { periodTotal, periodLiters, category, categories, cheapest, expensive, chartData };
}

// ---------------------------------------------------------------------------
// Mesečni troškovi, poređenja
// ---------------------------------------------------------------------------

export interface MonthlySpending {
  /** "2026-10" */
  key: string;
  /** "10/26" */
  label: string;
  total: number;
  liters: number;
}

/** Troškovi i litri po kalendarskom mesecu, poslednjih `months` meseci (uključujući tekući). */
export function monthlySpending(receipts: FuelReceiptRecord[], months = 12, now = new Date()): MonthlySpending[] {
  const buckets: MonthlySpending[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({ key, label: `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`, total: 0, liters: 0 });
  }
  const index = new Map(buckets.map((b) => [b.key, b]));

  for (const r of receipts) {
    if (!r.date) continue;
    const d = new Date(r.date);
    if (Number.isNaN(d.getTime())) continue;
    const bucket = index.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    if (bucket) {
      bucket.total += Number(r.total) || 0;
      bucket.liters += Number(r.liters) || 0;
    }
  }
  return buckets;
}

export interface CategoryPrice {
  category: FuelCategory;
  avgPrice: number;
  count: number;
}

/** Prosečna cena po litru po kategoriji goriva (ponderisano litrima). */
export function avgPriceByCategory(receipts: FuelReceiptRecord[]): CategoryPrice[] {
  const acc = new Map<FuelCategory, { total: number; liters: number; count: number }>();
  for (const r of receipts) {
    const category = detectFuel(r.fuel_type).category;
    const liters = Number(r.liters) || 0;
    const price = Number(r.price_per_l) || 0;
    if (!category || liters <= 0 || price <= 0) continue;
    const entry = acc.get(category) ?? { total: 0, liters: 0, count: 0 };
    entry.total += price * liters;
    entry.liters += liters;
    entry.count += 1;
    acc.set(category, entry);
  }
  return [...acc.entries()]
    .map(([category, e]) => ({ category, avgPrice: e.total / e.liters, count: e.count }))
    .sort((a, b) => b.count - a.count);
}

export interface StationStat {
  key: string;
  station: string;
  address: string | null;
  city: string | null;
  avgPrice: number;
  count: number;
  total: number;
}

/**
 * Poređenje stanica: prosečna cena/L (ponderisano litrima, sve vrste goriva)
 * i broj točenja, najčešće stanice prve. Grupisanje je isto kao na ekranu
 * Stanice (`groupByStation`) - bez duplikata zbog razmaka, velikih slova ili ćirilice.
 */
export function stationComparison(receipts: FuelReceiptRecord[], limit = 5): StationStat[] {
  return groupByStation(receipts)
    .filter((s) => s.categories.length > 0)
    .map((s) => {
      const points = s.categories.flatMap((c) => c.history);
      const liters = points.reduce((sum, p) => sum + p.liters, 0);
      const avgPrice =
        liters > 0
          ? points.reduce((sum, p) => sum + p.price * p.liters, 0) / liters
          : points.reduce((sum, p) => sum + p.price, 0) / points.length;
      return { key: s.key, station: s.name, address: s.address, city: s.city, avgPrice, count: s.count, total: s.total };
    })
    .sort((a, b) => b.count - a.count || a.avgPrice - b.avgPrice)
    .slice(0, limit);
}

/** Filtrira zapise po periodu (zajedničko za statistiku i istoriju). */
export function filterByPeriod(receipts: FuelReceiptRecord[], period: StatsPeriod, now = new Date()): FuelReceiptRecord[] {
  if (period === 'all') return receipts;
  const from = new Date(now);
  if (period === 'month') from.setDate(now.getDate() - 30);
  else from.setFullYear(now.getFullYear() - 1);
  return receipts.filter((r) => {
    if (!r.date) return false;
    const d = new Date(r.date);
    return !Number.isNaN(d.getTime()) && d >= from;
  });
}
