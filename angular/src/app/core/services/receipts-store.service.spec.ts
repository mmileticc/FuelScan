import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';

import { FuelReceiptRecord } from '../models/receipt.model';
import { FuelReceiptsService } from './fuel-receipts.service';
import { ReceiptsStore } from './receipts-store.service';

function record(id: string, date: string): FuelReceiptRecord {
  return {
    id,
    user_id: 'u1',
    invoice_number: null,
    odometer_km: null,
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
});
