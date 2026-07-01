import { FuelReceiptRecord } from '../models/receipt.model';

export interface MonthlyDiff {
  text: string;
  isIncrease: boolean;
}

export interface MonthlyComparison {
  spent: MonthlyDiff;
  liters: MonthlyDiff;
  totals: { thisSpent: number; thisLiters: number };
}

/**
 * 1:1 prenos `getMonthlyComparison` iz `old-vanilla/js/ui/dashboard.js`.
 * Poredi potrošnju ovog i prošlog meseca.
 */
export function getMonthlyComparison(receipts: FuelReceiptRecord[]): MonthlyComparison {
  const now = new Date();
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
  cheapest: FuelReceiptRecord | null;
  expensive: FuelReceiptRecord | null;
  chartData: FuelReceiptRecord[];
}

/**
 * 1:1 prenos filterskog/agregacionog dela `renderStatistics` iz
 * `old-vanilla/js/ui/statistics.js` (bez crtanja grafikona - to radi komponenta).
 */
export function computeStatistics(receipts: FuelReceiptRecord[], period: StatsPeriod = 'all'): StatisticsResult {
  const now = new Date();

  const filtered = receipts.filter((r) => {
    if (!r.date) return false;
    const receiptDate = new Date(r.date);

    if (period === 'month') {
      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(now.getDate() - 30);
      return receiptDate >= oneMonthAgo;
    }
    if (period === 'year') {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(now.getFullYear() - 1);
      return receiptDate >= oneYearAgo;
    }
    return true;
  });

  const validForStats = filtered.filter((r) => Number(r.price_per_l) > 0 && r.station);

  const periodTotal = filtered.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
  const periodLiters = filtered.reduce((sum, r) => sum + (Number(r.liters) || 0), 0);

  let cheapest: FuelReceiptRecord | null = null;
  let expensive: FuelReceiptRecord | null = null;

  if (validForStats.length > 0) {
    cheapest = validForStats.reduce((min, r) => (Number(r.price_per_l) < Number(min.price_per_l) ? r : min), validForStats[0]);
    expensive = validForStats.reduce((max, r) => (Number(r.price_per_l) > Number(max.price_per_l) ? r : max), validForStats[0]);
  }

  const chartData = [...validForStats].sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime());

  return { periodTotal, periodLiters, cheapest, expensive, chartData };
}
