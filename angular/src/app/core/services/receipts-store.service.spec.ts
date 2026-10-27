import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Observable, Subject, of, throwError } from 'rxjs';

import { FuelReceiptRecord } from '../models/receipt.model';
import { cacheDelete, cacheGet, cacheSet, userCacheKey } from '../storage/local-cache';
import { AuthService } from './auth.service';
import { FuelReceiptsService } from './fuel-receipts.service';
import { ReceiptsStore } from './receipts-store.service';

function record(id: string, date: string): FuelReceiptRecord {
  return {
    id,
    user_id: 'u1',
    invoice_number: null,
    station: 'NIS',
    fuel_type: 'EVRO DIZEL',
    liters: 40,
    price_per_l: 200,
    total: 8000,
    date,
    raw_url: null,
    address: null,
    city: null,
    municipality: null,
  };
}

describe('ReceiptsStore', () => {
  it('ne gubi račun sačuvan dok je učitavanje bilo u toku', () => {
    const fetch$ = new Subject<FuelReceiptRecord[]>();
    const saved = record('new', '2026-10-27T10:00:00+01:00');
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FuelReceiptsService,
          useValue: { fetchUserReceipts$: () => fetch$, insert$: () => of(saved) },
        },
      ],
    });
    const store = TestBed.inject(ReceiptsStore);

    store.load();
    store.insert$({} as never).subscribe();
    // Odgovor stiže POSLE upisa i ne sadrži novi račun (upit je krenuo ranije).
    fetch$.next([record('old', '2026-10-01T10:00:00+02:00')]);

    expect(store.receipts().map((r) => r.id)).toEqual(['new', 'old']);
  });

  describe('scheduleDelete', () => {
    beforeEach(() => localStorage.removeItem('fuelscan.pendingDeletes'));
    afterEach(() => localStorage.removeItem('fuelscan.pendingDeletes'));

    function setup(deleteSpy: jasmine.Spy) {
      TestBed.configureTestingModule({
        providers: [{ provide: FuelReceiptsService, useValue: { fetchUserReceipts$: () => of([]), deleteReceipt$: deleteSpy } }],
      });
      const store = TestBed.inject(ReceiptsStore);
      store.upsertLocal(record('a', '2026-10-01T10:00:00+02:00'));
      return store;
    }

    it('briše tek posle roka, a "Poništi" vraća zapis', fakeAsync(() => {
      const deleteSpy = jasmine.createSpy('deleteReceipt$').and.returnValue(of(true));
      const store = setup(deleteSpy);

      const undo = store.scheduleDelete(store.receipts()[0], 5000);
      expect(store.receipts().length).toBe(0);
      expect(JSON.parse(localStorage.getItem('fuelscan.pendingDeletes')!)).toEqual([{ id: 'a' }]);

      undo();
      tick(5000);
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(store.receipts().map((r) => r.id)).toEqual(['a']);
      expect(JSON.parse(localStorage.getItem('fuelscan.pendingDeletes')!)).toEqual([]);
    }));

    it('posle roka briše iz baze i zaboravlja zapamćeni id', fakeAsync(() => {
      const deleteSpy = jasmine.createSpy('deleteReceipt$').and.returnValue(of(true));
      const store = setup(deleteSpy);

      store.scheduleDelete(store.receipts()[0], 5000);
      tick(5000);
      expect(deleteSpy).toHaveBeenCalledWith('a');
      expect(JSON.parse(localStorage.getItem('fuelscan.pendingDeletes')!)).toEqual([]);
    }));

    it('brisanje zapamćeno iz prethodnog pokretanja se završava pri učitavanju', () => {
      // Stari format (samo id) i zapis drugog korisnika - drugi se ne sme dirati.
      localStorage.setItem('fuelscan.pendingDeletes', JSON.stringify(['old', { id: 'foreign', userId: 'someone-else' }]));
      const deleteSpy = jasmine.createSpy('deleteReceipt$').and.returnValue(of(true));
      TestBed.configureTestingModule({
        providers: [
          {
            provide: FuelReceiptsService,
            useValue: { fetchUserReceipts$: () => of([record('old', '2026-10-01T10:00:00+02:00')]), deleteReceipt$: deleteSpy },
          },
        ],
      });
      const store = TestBed.inject(ReceiptsStore);
      store.load();
      expect(store.receipts().length).toBe(0);
      expect(deleteSpy).toHaveBeenCalledWith('old');
      expect(deleteSpy).not.toHaveBeenCalledWith('foreign');
      expect(JSON.parse(localStorage.getItem('fuelscan.pendingDeletes')!)).toEqual([{ id: 'foreign', userId: 'someone-else' }]);
    });
  });

  describe('lokalna kopija', () => {
    const userId = 'cache-user';
    const key = userCacheKey('receipts', userId);
    afterEach(async () => cacheDelete(key));

    function setup(fetch$: Observable<FuelReceiptRecord[]>) {
      TestBed.configureTestingModule({
        providers: [
          { provide: FuelReceiptsService, useValue: { fetchUserReceipts$: () => fetch$, deleteReceipt$: () => of(true) } },
          { provide: AuthService, useValue: { currentUser: signal({ id: userId }) } },
        ],
      });
      return TestBed.inject(ReceiptsStore);
    }

    it('bez interneta prikazuje poslednju sačuvanu kopiju', async () => {
      await cacheSet(key, { savedAt: '2026-10-26T18:00:00Z', data: [record('cached', '2026-10-20T10:00:00+02:00')] });
      const store = setup(throwError(() => new TypeError('Failed to fetch')));

      store.load();
      await new Promise((r) => setTimeout(r, 50));

      expect(store.receipts().map((r) => r.id)).toEqual(['cached']);
      expect(store.fromCache()).toBeTrue();
      expect(store.syncedAt()).toBe('2026-10-26T18:00:00Z');
    });

    it('sveži podaci iz baze zamenjuju kopiju i upisuju se u nju', async () => {
      await cacheSet(key, { savedAt: '2026-10-26T18:00:00Z', data: [record('cached', '2026-10-20T10:00:00+02:00')] });
      const fresh$ = new Subject<FuelReceiptRecord[]>();
      const store = setup(fresh$);

      store.load();
      await new Promise((r) => setTimeout(r, 50));
      fresh$.next([record('fresh', '2026-10-27T10:00:00+01:00')]);
      // Upis kopije se odlaže 300ms (spaja više izmena u jedan upis).
      await new Promise((r) => setTimeout(r, 450));

      expect(store.receipts().map((r) => r.id)).toEqual(['fresh']);
      expect(store.fromCache()).toBeFalse();
      const saved = await cacheGet<{ data: FuelReceiptRecord[] }>(key);
      expect(saved?.data.map((r) => r.id)).toEqual(['fresh']);
    });
  });
});
