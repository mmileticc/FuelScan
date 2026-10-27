import { Injectable, inject, signal } from '@angular/core';
import { Observable, from, map, of, switchMap, throwError } from 'rxjs';

import { FuelReceiptRecord } from '../models/receipt.model';
import { supabaseClient } from '../supabase/supabase-client';
import { friendlyError } from '../utils/errors.utils';
import { ReceiptsStore } from './receipts-store.service';
import { ToastService } from './toast.service';

interface NicknameRow {
  station_key: string;
  nickname: string;
}

/**
 * Korisnikovi nadimci za stanice ("kod mosta", "Spoonit kod posla"...).
 * Nadimak je vezan za ključ stanice (`StationSummary.key`), ne za račun, pa
 * važi za sva točenja te stanice. Tabela: `station_nicknames`.
 */
@Injectable({ providedIn: 'root' })
export class StationNicknamesService {
  private readonly toast = inject(ToastService);
  private readonly store = inject(ReceiptsStore);

  private readonly _nicknames = signal<ReadonlyMap<string, string>>(new Map());
  private loaded = false;
  private loading = false;
  private wanted = false;

  constructor() {
    // Učitavanje nije uspelo bez interneta - pokušaj ponovo čim se veza vrati.
    window.addEventListener('online', () => {
      if (this.wanted && !this.loaded) this.load();
    });
  }

  /** ključ stanice -> nadimak */
  readonly nicknames = this._nicknames.asReadonly();

  load(force = false): void {
    this.wanted = true;
    if ((this.loaded && !force) || this.loading) return;
    this.loading = true;
    from(supabaseClient.from('station_nicknames').select('station_key, nickname')).subscribe({
      next: ({ data, error }) => {
        this.loading = false;
        if (error) {
          // Tabela možda još nije napravljena (migracija nije pokrenuta) - aplikacija radi i bez nadimaka.
          console.warn('[Nadimci]', error.message);
          return;
        }
        this._nicknames.set(new Map((data as NicknameRow[]).map((r) => [r.station_key, r.nickname])));
        this.loaded = true;
      },
      error: () => (this.loading = false),
    });
  }

  reset(): void {
    this._nicknames.set(new Map());
    this.loaded = false;
    this.wanted = false;
  }

  get(key: string | null | undefined): string | null {
    const stored = this.storedKey(key);
    return stored ? (this._nicknames().get(stored) ?? null) : null;
  }

  /**
   * Ključ pod kojim je nadimak stvarno sačuvan. Ključ stanice je
   * "NAZIV|ADRESA", ali dok stanica nema nijedan račun sa adresom, samo "NAZIV" -
   * pa nadimak dat u toj fazi mora da važi i kad se adresa kasnije pojavi.
   */
  private storedKey(key: string | null | undefined): string | null {
    if (!key) return null;
    const map = this._nicknames();
    if (map.has(key)) return key;
    const nameOnly = key.split('|')[0];
    return nameOnly !== key && map.has(nameOnly) ? nameOnly : null;
  }

  /** Nadimak stanice kojoj pripada sačuvan račun. */
  forReceipt(record: Pick<FuelReceiptRecord, 'id'>): string | null {
    return this.get(this.store.stationKeys().get(record.id));
  }

  /** Postavlja nadimak; prazan string/`null` ga briše. */
  set$(key: string, nickname: string | null): Observable<void> {
    const value = nickname?.trim().slice(0, 60) || null;
    if (value === this.get(key)) {
      return of(undefined);
    }

    const request$ = value
      ? from(supabaseClient.auth.getUser()).pipe(
          switchMap(({ data }) => {
            if (!data.user) return throwError(() => new Error('Korisnik nije prijavljen.'));
            return from(
              supabaseClient
                .from('station_nicknames')
                .upsert({ user_id: data.user.id, station_key: key, nickname: value, updated_at: new Date().toISOString() }),
            );
          }),
        )
      : from(supabaseClient.from('station_nicknames').delete().eq('station_key', this.storedKey(key) ?? key));

    const deletedKey = this.storedKey(key) ?? key;
    return request$.pipe(
      map(({ error }) => {
        if (error) throw error;
        const next = new Map(this._nicknames());
        if (value) next.set(key, value);
        else next.delete(deletedKey);
        this._nicknames.set(next);
      }),
    );
  }

  /** Isto kao `set$`, uz toast poruke - za mesta gde je nadimak jedina izmena. */
  save(key: string, nickname: string | null, onDone?: () => void): void {
    this.set$(key, nickname).subscribe({
      next: () => {
        this.toast.show(nickname?.trim() ? 'Nadimak sačuvan.' : 'Nadimak uklonjen.', 'success');
        onDone?.();
      },
      error: (err: unknown) =>
        this.toast.show(friendlyError(err, 'čuvanju nadimka'), 'error'),
    });
  }
}
