import { Injectable } from '@angular/core';
import { Observable, from, map } from 'rxjs';

import { FuelReceiptRecord } from '../models/receipt.model';
import { supabaseClient } from '../supabase/supabase-client';

/**
 * Prenos preostalih Supabase CRUD funkcija iz `old-vanilla/js/api.js`
 * (`fetchUserReceipts`, `deleteReceipt`). Upis (`saveReceiptToSupabase`)
 * je deo `ReceiptService`-a jer se sad dešava automatski nakon parsiranja.
 */
@Injectable({ providedIn: 'root' })
export class FuelReceiptsService {
  fetchUserReceipts$(): Observable<FuelReceiptRecord[]> {
    return from(
      supabaseClient.from('fuel_receipts').select('*').order('date', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          throw error;
        }
        return (data ?? []) as FuelReceiptRecord[];
      }),
    );
  }

  deleteReceipt$(id: string): Observable<true> {
    return from(supabaseClient.from('fuel_receipts').delete().eq('id', id)).pipe(
      map(({ error }) => {
        if (error) {
          throw error;
        }
        return true as const;
      }),
    );
  }
}
