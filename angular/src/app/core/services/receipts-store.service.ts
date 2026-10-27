import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { FuelReceiptRecord, FuelReceiptRow } from '../models/receipt.model';
import { stationKeyMap } from '../utils/stations.utils';
import { FuelReceiptPatch, FuelReceiptsService } from './fuel-receipts.service';
import { ToastService } from './toast.service';

/**
 * Jedan, zajednički keš računa za dashboard, istoriju i statistiku - umesto da
 * svaki ekran posebno vuče celu tabelu iz Supabase-a pri svakom ulasku.
 */
@Injectable({ providedIn: 'root' })
export class ReceiptsStore {
  private readonly api = inject(FuelReceiptsService);
  private readonly toast = inject(ToastService);

  private readonly _receipts = signal<FuelReceiptRecord[]>([]);
  private readonly _loading = signal(false);
  private loaded = false;
  /** Lokalne izmene napravljene dok `load()` čeka odgovor - primenjuju se i na pristigle podatke. */
  private pendingOps: Array<(list: FuelReceiptRecord[]) => FuelReceiptRecord[]> = [];

  /** Sortirano po datumu, najnoviji prvi. */
  readonly receipts = this._receipts.asReadonly();
  readonly loading = this._loading.asReadonly();
  /** `id` računa -> ključ stanice (vidi `groupByStation`). */
  readonly stationKeys = computed(() => stationKeyMap(this._receipts()));
  readonly isEmpty = computed(() => this.loaded && !this._loading() && this._receipts().length === 0);

  /** Učitava jednom; `force` ponovo vuče iz baze. */
  load(force = false): void {
    if ((this.loaded && !force) || this._loading()) {
      return;
    }
    this._loading.set(true);
    this.api.fetchUserReceipts$().subscribe({
      next: (data) => {
        const ops = this.pendingOps;
        this.pendingOps = [];
        this._receipts.set(ops.reduce((list, op) => op(list), data));
        this.loaded = true;
        this._loading.set(false);
      },
      error: (err: unknown) => {
        this.pendingOps = [];
        this._loading.set(false);
        this.toast.show(err instanceof Error ? err.message : 'Greška pri učitavanju podataka.', 'error');
      },
    });
  }

  /** Briše keš (npr. pri odjavi), da drugi korisnik na istom uređaju ne vidi tuđe podatke. */
  reset(): void {
    this.pendingOps = [];
    this._receipts.set([]);
    this.loaded = false;
  }

  insert$(row: FuelReceiptRow): Observable<FuelReceiptRecord> {
    return this.api.insert$(row).pipe(tap((record) => this.upsertLocal(record)));
  }

  update$(id: string, patch: FuelReceiptPatch): Observable<FuelReceiptRecord> {
    return this.api.update$(id, patch).pipe(tap((record) => this.upsertLocal(record)));
  }

  delete$(id: string): Observable<true> {
    return this.api.deleteReceipt$(id).pipe(tap(() => this.removeLocal(id)));
  }

  /** Lokalno sklanjanje bez poziva baze (za "Poništi" tok brisanja). */
  removeLocal(id: string): void {
    this.mutate((list) => list.filter((r) => r.id !== id));
  }

  upsertLocal(record: FuelReceiptRecord): void {
    this.mutate((list) => sortByDateDesc([record, ...list.filter((r) => r.id !== record.id)]));
  }

  private mutate(op: (list: FuelReceiptRecord[]) => FuelReceiptRecord[]): void {
    if (this._loading()) {
      this.pendingOps.push(op);
    }
    this._receipts.update(op);
  }
}

function sortByDateDesc(list: FuelReceiptRecord[]): FuelReceiptRecord[] {
  const time = (r: FuelReceiptRecord) => (r.date ? new Date(r.date).getTime() || 0 : 0);
  return [...list].sort((a, b) => time(b) - time(a));
}
