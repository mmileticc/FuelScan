import { FuelReceiptRecord } from '../models/receipt.model';
import { groupByStation, normalizeKey, resolveStationKey, stationKeyMap } from './stations.utils';

let nextId = 1;
function receipt(partial: Partial<FuelReceiptRecord>): FuelReceiptRecord {
  return {
    id: String(nextId++),
    user_id: 'u1',
    invoice_number: null,
    station: 'SPOONIT DOO BENZINSKA STANICA',
    fuel_type: 'EVRO DIZEL',
    liters: 40,
    price_per_l: 200,
    total: 8000,
    date: '2026-10-10T10:00:00+02:00',
    raw_url: null,
    address: 'Bulevar Oslobođenja 1',
    city: 'Novi Sad',
    municipality: null,
    ...partial,
  };
}

describe('stations.utils', () => {
  it('normalizeKey ujednačava razmake, velika slova, interpunkciju i ćirilicu', () => {
    expect(normalizeKey('  Spoonit  d.o.o. ')).toBe('SPOONIT DOO');
    expect(normalizeKey('SPOONIT DOO')).toBe('SPOONIT DOO');
    expect(normalizeKey('СПООНИТ')).toBe('SPOONIT');
    expect(normalizeKey('NIS-Petrol')).toBe('NIS PETROL');
    expect(normalizeKey('Bulevar Oslobođenja 1')).toBe(normalizeKey('BULEVAR OSLOBODJENJA 1'));
    expect(normalizeKey('Čačak')).toBe('CACAK');
  });

  it('spaja istu stanicu napisanu na različite načine', () => {
    const result = groupByStation([
      receipt({ station: 'SPOONIT DOO BENZINSKA STANICA' }),
      receipt({ station: 'Spoonit  DOO benzinska stanica ' }),
      receipt({ station: 'SPOONIT DOO BENZINSKA STANICA', address: 'BULEVAR OSLOBOĐENJA 1' }),
    ]);
    expect(result.length).toBe(1);
    expect(result[0].count).toBe(3);
  });

  it('isti naziv na različitim adresama su različite stanice', () => {
    const result = groupByStation([
      receipt({ address: 'Bulevar Oslobođenja 1' }),
      receipt({ address: 'Futoški put 20' }),
    ]);
    expect(result.length).toBe(2);
    expect(result.map((s) => s.address).sort()).toEqual(['Bulevar Oslobođenja 1', 'Futoški put 20']);
  });

  it('zapis bez adrese pripaja se najčešćoj adresi istog naziva', () => {
    const result = groupByStation([
      receipt({ address: 'Bulevar Oslobođenja 1' }),
      receipt({ address: 'Bulevar Oslobođenja 1' }),
      receipt({ address: 'Futoški put 20' }),
      receipt({ address: null }),
    ]);
    expect(result.length).toBe(2);
    expect(result.find((s) => s.address === 'Bulevar Oslobođenja 1')?.count).toBe(3);
  });

  it('cene se prate posebno po vrsti goriva, sa trendom', () => {
    const [station] = groupByStation([
      receipt({ fuel_type: 'EVRO DIZEL', price_per_l: 200, date: '2026-09-01T10:00:00+02:00' }),
      receipt({ fuel_type: 'Diesel', price_per_l: 210, date: '2026-10-01T10:00:00+02:00' }),
      receipt({ fuel_type: 'BMB 95', price_per_l: 190, date: '2026-09-15T10:00:00+02:00' }),
    ]);
    const dizel = station.categories.find((c) => c.category === 'Dizel')!;
    expect(dizel.history.map((p) => p.price)).toEqual([200, 210]);
    expect(dizel.last.price).toBe(210);
    expect(dizel.previous?.price).toBe(200);
    expect(dizel.avg).toBe(205);
    expect(station.categories.find((c) => c.category === 'Benzin')?.last.price).toBe(190);
    expect(station.lastVisit).toBe('2026-10-01T10:00:00+02:00');
  });

  it('stationKeyMap: svi računi iste stanice dele ključ (nadimak važi za sve)', () => {
    const a = receipt({ station: 'SPOONIT DOO BENZINSKA STANICA' });
    const b = receipt({ station: 'spoonit doo  benzinska stanica', address: null });
    const c = receipt({ station: 'NIS PETROL', address: 'Autoput 4' });
    const keys = stationKeyMap([a, b, c]);
    expect(keys.get(a.id)).toBe(keys.get(b.id) as string);
    expect(keys.get(c.id)).not.toBe(keys.get(a.id) as string);
  });

  it('resolveStationKey nalazi ključ postojeće stanice za još nesačuvan račun', () => {
    const saved = [receipt({ station: 'SPOONIT DOO BENZINSKA STANICA' })];
    const key = resolveStationKey({ station: 'Spoonit DOO Benzinska stanica', address: 'BULEVAR OSLOBOĐENJA 1' }, saved);
    expect(key).toBe(stationKeyMap(saved).get(saved[0].id) as string);
    expect(resolveStationKey({ station: '', address: null }, saved)).toBeNull();
  });
});
