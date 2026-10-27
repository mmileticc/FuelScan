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
/** Brisanja koja čekaju istek roka za "Poništi" - preživljavaju i zatvaranje aplikacije. */
const PENDING_DELETES_KEY = 'fuelscan.pendingDeletes';

@Injectable({ providedIn: 'root' })
export class ReceiptsStore {
  private readonly api = inject(FuelReceiptsService);
  private readonly toast = inject(ToastService);

  private readonly _receipts = signal<FuelReceiptRecord[]>([]);
  private readonly _loading = signal(false);
  private loaded = false;
  /** Lokalne izmene napravljene dok `load()` čeka odgovor - primenjuju se i na pristigle podatke. */
  private pendingOps: Array<(list: FuelReceiptRecord[]) => FuelReceiptRecord[]> = [];
  private readonly scheduledDeletes = new Map<string, { timer: ReturnType<typeof setTimeout>; record: FuelReceiptRecord }>();

  constructor() {
    // Aplikacija se zatvara usred roka za "Poništi" -> pokušaj brisanje odmah;
    // ako ni to ne stigne, id ostaje zapamćen i briše se pri sledećem učitavanju.
    window.addEventListener('pagehide', () => this.flushScheduledDeletes());
  }

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
        const leftover = this.leftoverDeletes();
        this._receipts.set(ops.reduce((list, op) => op(list), data).filter((r) => !leftover.includes(r.id)));
        this.finishLeftoverDeletes(leftover);
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

  /**
   * Brisanje sa mogućnošću poništavanja: zapis odmah nestaje iz prikaza, a iz
   * baze se briše tek posle `delayMs`. Vraća funkciju za poništavanje.
   */
  scheduleDelete(record: FuelReceiptRecord, delayMs: number): () => void {
    this.removeLocal(record.id);
    this.persistDeletes([...this.leftoverDeletes(), record.id]);
    const timer = setTimeout(() => this.commitDelete(record.id), delayMs);
    this.scheduledDeletes.set(record.id, { timer, record });

    return () => {
      const pending = this.scheduledDeletes.get(record.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.scheduledDeletes.delete(record.id);
      this.forgetDelete(record.id);
      this.upsertLocal(pending.record);
    };
  }

  private flushScheduledDeletes(): void {
    for (const [id, { timer }] of this.scheduledDeletes) {
      clearTimeout(timer);
      this.commitDelete(id);
    }
  }

  private commitDelete(id: string): void {
    const record = this.scheduledDeletes.get(id)?.record;
    this.scheduledDeletes.delete(id);
    this.api.deleteReceipt$(id).subscribe({
      next: () => this.forgetDelete(id),
      error: (err: unknown) => {
        this.forgetDelete(id);
        if (record) this.upsertLocal(record);
        this.toast.show(err instanceof Error ? `Greška pri brisanju: ${err.message}` : 'Greška pri brisanju.', 'error');
      },
    });
  }

  /** Brisanja zapamćena iz prethodnog pokretanja (aplikacija zatvorena pre isteka roka). */
  private finishLeftoverDeletes(ids: string[]): void {
    for (const id of ids) {
      if (!this.scheduledDeletes.has(id)) {
        this.api.deleteReceipt$(id).subscribe({ next: () => this.forgetDelete(id), error: () => undefined });
      }
    }
  }

  private leftoverDeletes(): string[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(PENDING_DELETES_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }

  private persistDeletes(ids: string[]): void {
    try {
      localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify([...new Set(ids)]));
    } catch {
      // Bez storage-a brisanje i dalje radi, samo ne preživljava zatvaranje aplikacije.
    }
  }

  private forgetDelete(id: string): void {
    this.persistDeletes(this.leftoverDeletes().filter((v) => v !== id));
  }

  /** Lokalno sklanjanje bez poziva baze. */
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
