import { Injectable } from '@angular/core';
import { Observable, from, map } from 'rxjs';

import { FuelReceiptRecord, FuelReceiptRow } from '../models/receipt.model';
import { supabaseClient } from '../supabase/supabase-client';

/** Postgres kod za narušen UNIQUE (ovde: isti `invoice_number` za istog korisnika). */
const UNIQUE_VIOLATION = '23505';

export const DUPLICATE_RECEIPT_MESSAGE = 'Ovaj račun je već sačuvan.';

/** Polja koja korisnik sme da menja na postojećem zapisu. */
export type FuelReceiptPatch = Partial<Omit<FuelReceiptRow, 'user_id'>>;

/** Supabase CRUD nad tabelom `fuel_receipts` (RLS u bazi ograničava sve upite na ulogovanog korisnika). */
@Injectable({ providedIn: 'root' })
export class FuelReceiptsService {
  /**
   * Svi računi korisnika. Supabase vraća najviše 1000 redova po upitu, pa se
   * čita po stranama - inače bi posle 1000 računa istorija i statistika tiho
   * bile nepotpune.
   */
  fetchUserReceipts$(): Observable<FuelReceiptRecord[]> {
    return from(fetchAllPages());
  }

  /**
   * `true` ako korisnik već ima isti račun - po broju računa, ili po URL-u sa
   * QR koda (stari zapisi nemaju `invoice_number`, ali imaju `raw_url`).
   */
  isDuplicate$(invoiceNumber: string | null, rawUrl: string | null): Observable<boolean> {
    const filters: string[] = [];
    if (invoiceNumber) filters.push(`invoice_number.eq.${quoteFilterValue(invoiceNumber)}`);
    if (rawUrl) filters.push(`raw_url.eq.${quoteFilterValue(rawUrl)}`);
    if (!filters.length) {
      return from(Promise.resolve(false));
    }

    return from(supabaseClient.from('fuel_receipts').select('id').or(filters.join(',')).limit(1)).pipe(
      map(({ data, error }) => {
        if (error) {
          throw error;
        }
        return (data ?? []).length > 0;
      }),
    );
  }

  insert$(row: FuelReceiptRow): Observable<FuelReceiptRecord> {
    return from(supabaseClient.from('fuel_receipts').insert([row]).select().single()).pipe(
      map(({ data, error }) => {
        if (error) {
          throw error.code === UNIQUE_VIOLATION ? new Error(DUPLICATE_RECEIPT_MESSAGE) : error;
        }
        return data as FuelReceiptRecord;
      }),
    );
  }

  update$(id: string, patch: FuelReceiptPatch): Observable<FuelReceiptRecord> {
    return from(supabaseClient.from('fuel_receipts').update(patch).eq('id', id).select().single()).pipe(
      map(({ data, error }) => {
        if (error) {
          throw error;
        }
        return data as FuelReceiptRecord;
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

const PAGE_SIZE = 1000;

async function fetchAllPages(): Promise<FuelReceiptRecord[]> {
  const all: FuelReceiptRecord[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseClient
      .from('fuel_receipts')
      .select('*')
      // `id` kao drugi ključ: stabilan redosled i kad više računa ima isti datum.
      .order('date', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw error;
    }
    const page = (data ?? []) as FuelReceiptRecord[];
    all.push(...page);
    if (page.length < PAGE_SIZE) {
      return all;
    }
  }
}

/** PostgREST `or()` filter - vrednost sa zarezima/zagradama (URL!) mora biti u navodnicima. */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
