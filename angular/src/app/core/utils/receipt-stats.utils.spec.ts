import { FuelReceiptRecord } from '../models/receipt.model';
import {
  avgPriceByCategory,
  computeStatistics,
  getMonthlyComparison,
  monthlySpending,
  stationComparison,
} from './receipt-stats.utils';

let nextId = 1;
function receipt(partial: Partial<FuelReceiptRecord>): FuelReceiptRecord {
  return {
    id: String(nextId++),
    user_id: 'u1',
    invoice_number: null,
    station: 'NIS',
    fuel_type: 'EVRO DIZEL',
    liters: 40,
    price_per_l: 200,
    total: 8000,
    date: '2026-10-10T10:00:00+02:00',
    raw_url: null,
    address: null,
    city: null,
    municipality: null,
    ...partial,
  };
}

describe('receipt-stats.utils', () => {
  const now = new Date('2026-10-26T12:00:00+01:00');

  it('getMonthlyComparison poredi kalendarske mesece', () => {
    const result = getMonthlyComparison(
      [
        receipt({ total: 6000, liters: 30, date: '2026-10-05T10:00:00+02:00' }),
        receipt({ total: 4000, liters: 20, date: '2026-09-20T10:00:00+02:00' }),
      ],
      now,
    );
    expect(result.totals.thisSpent).toBe(6000);
    expect(result.totals.thisLiters).toBe(30);
    expect(result.spent.isIncrease).toBeTrue();
    expect(result.spent.text).toContain('+50%');
  });

  it('computeStatistics: period 30 dana i najjeftinije/najskuplje', () => {
    const result = computeStatistics(
      [
        receipt({ price_per_l: 190, station: 'A', date: '2026-10-20T10:00:00+02:00' }),
        receipt({ price_per_l: 210, station: 'B', date: '2026-10-01T10:00:00+02:00' }),
        receipt({ price_per_l: 150, station: 'C', date: '2026-01-01T10:00:00+01:00' }),
      ],
      'month',
      now,
    );
    expect(result.cheapest?.station).toBe('A');
    expect(result.expensive?.station).toBe('B');
    expect(result.chartData.length).toBe(2);
  });

  it('monthlySpending pravi 12 meseci, uključujući tekući', () => {
    const months = monthlySpending(
      [
        receipt({ total: 1000, date: '2026-10-02T10:00:00+02:00' }),
        receipt({ total: 500, date: '2026-10-20T10:00:00+02:00' }),
        receipt({ total: 700, date: '2025-11-03T10:00:00+01:00' }),
        receipt({ total: 999, date: '2024-01-03T10:00:00+01:00' }),
      ],
      12,
      now,
    );
    expect(months.length).toBe(12);
    expect(months[11].key).toBe('2026-10');
    expect(months[11].total).toBe(1500);
    expect(months[0].key).toBe('2025-11');
    expect(months[0].total).toBe(700);
  });

  it('avgPriceByCategory ponderiše litrima', () => {
    const result = avgPriceByCategory([
      receipt({ fuel_type: 'EVRO DIZEL', liters: 10, price_per_l: 200 }),
      receipt({ fuel_type: 'Diesel', liters: 30, price_per_l: 220 }),
      receipt({ fuel_type: 'BMB 95', liters: 20, price_per_l: 190 }),
    ]);
    const dizel = result.find((c) => c.category === 'Dizel');
    expect(dizel?.avgPrice).toBeCloseTo(215, 5);
    expect(dizel?.count).toBe(2);
    expect(result.find((c) => c.category === 'Benzin')?.avgPrice).toBe(190);
  });

  it('stationComparison sortira po broju točenja', () => {
    const result = stationComparison([
      receipt({ station: 'A', price_per_l: 200 }),
      receipt({ station: 'B', price_per_l: 190 }),
      receipt({ station: 'B', price_per_l: 210 }),
    ]);
    expect(result[0].station).toBe('B');
    expect(result[0].count).toBe(2);
    expect(result[0].avgPrice).toBe(200);
  });

  it('computeStatistics ne meša vrste goriva: najjeftinije važi za najčešću (ili izabranu)', () => {
    const data = [
      receipt({ fuel_type: 'EVRO DIZEL', price_per_l: 205, station: 'D1', date: '2026-10-20T10:00:00+02:00' }),
      receipt({ fuel_type: 'EVRO DIZEL', price_per_l: 199, station: 'D2', date: '2026-10-21T10:00:00+02:00' }),
      receipt({ fuel_type: 'TNG', price_per_l: 95, station: 'T1', date: '2026-10-22T10:00:00+02:00' }),
    ];
    const byDefault = computeStatistics(data, 'month', now);
    expect(byDefault.category).toBe('Dizel');
    expect(byDefault.categories).toEqual(['Dizel', 'TNG']);
    expect(byDefault.cheapest?.station).toBe('D2');
    expect(byDefault.chartData.length).toBe(2);

    const tng = computeStatistics(data, 'month', now, 'TNG');
    expect(tng.cheapest?.station).toBe('T1');
  });
});
