import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { FuelReceiptRecord, FuelReceiptRow } from '../models/receipt.model';
import { CacheEntry, cacheDelete, cacheGet, cacheSet, userCacheKey } from '../storage/local-cache';
import { OFFLINE_MESSAGE, friendlyError, isNetworkError } from '../utils/errors.utils';
import { stationKeyMap } from '../utils/stations.utils';
import { AuthService } from './auth.service';
import { FuelReceiptPatch, FuelReceiptsService } from './fuel-receipts.service';
import { NetworkStatusService } from './network-status.service';
import { ToastService } from './toast.service';

/** Brisanja koja čekaju istek roka za "Poništi" - preživljavaju i zatvaranje aplikacije. */
const PENDING_DELETES_KEY = 'fuelscan.pendingDeletes';

interface PendingDelete {
  id: string;
  /** Čiji je zapis - brisanje se završava samo kad je prijavljen isti korisnik. */
  userId?: string;
}

/**
 * Jedan, zajednički keš računa za dashboard, istoriju i statistiku - umesto da
 * svaki ekran posebno vuče celu tabelu iz Supabase-a pri svakom ulasku.
 */
@Injectable({ providedIn: 'root' })
export class ReceiptsStore {
  private readonly api = inject(FuelReceiptsService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly network = inject(NetworkStatusService);
  /** Upis kopije se odlaže i spaja (više izmena zaredom = jedan upis). */
  private cacheWriteTimer?: ReturnType<typeof setTimeout>;

  private readonly _receipts = signal<FuelReceiptRecord[]>([]);
  private readonly _loading = signal(false);
  /** Kad su prikazani podaci poslednji put potvrđeni iz baze (za "podaci od ..." offline). */
  private readonly _syncedAt = signal<string | null>(null);
  /** `true` dok se prikazuje lokalna kopija, a sveži podaci iz baze još nisu stigli. */
  private readonly _fromCache = signal(false);
  private loaded = false;
  /** Za kog korisnika je lokalna kopija već primenjena u ovoj sesiji. */
  private cacheAppliedFor: string | null = null;
  /** Neki ekran je tražio podatke (od poslednje odjave) - samo tada se osvežava kad se veza vrati. */
  private wanted = false;
  /** Poruka "nema interneta" se prikazuje jednom po prekidu veze, ne na svakom ekranu. */
  private offlineNotified = false;
  /** Lokalne izmene napravljene dok `load()` čeka odgovor - primenjuju se i na pristigle podatke. */
  private pendingOps: Array<(list: FuelReceiptRecord[]) => FuelReceiptRecord[]> = [];
  private readonly scheduledDeletes = new Map<string, { timer: ReturnType<typeof setTimeout>; record: FuelReceiptRecord }>();

  constructor() {
    // Aplikacija se zatvara usred roka za "Poništi" -> pokušaj brisanje odmah;
    // ako ni to ne stigne, id ostaje zapamćen i briše se pri sledećem učitavanju.
    window.addEventListener('pagehide', () => this.flushScheduledDeletes());
    // Veza se vratila (ili periodičan pokušaj dok zahtevi padaju) - osveži podatke.
    this.network.onReconnect(() => {
      this.offlineNotified = false;
      if (this.wanted) this.load(true);
    });
  }

  /** Sortirano po datumu, najnoviji prvi. */
  readonly receipts = this._receipts.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly syncedAt = this._syncedAt.asReadonly();
  readonly fromCache = this._fromCache.asReadonly();
  /** `id` računa -> ključ stanice (vidi `groupByStation`). */
  readonly stationKeys = computed(() => stationKeyMap(this._receipts()));
  readonly isEmpty = computed(() => this.loaded && !this._loading() && this._receipts().length === 0);

  /** Učitava jednom; `force` ponovo vuče iz baze. */
  load(force = false): void {
    this.wanted = true;
    if ((this.loaded && !force) || this._loading()) {
      return;
    }
    this._loading.set(true);
    // Odmah prikaži lokalnu kopiju (radi i bez interneta), pa je zameni svežim podacima iz baze.
    void this.applyCache();
    this.api.fetchUserReceipts$().subscribe({
      next: (data) => {
        const ops = this.pendingOps;
        this.pendingOps = [];
        const leftover = this.leftoverDeletes().map((d) => d.id);
        this._receipts.set(ops.reduce((list, op) => op(list), data).filter((r) => !leftover.includes(r.id)));
        this.finishLeftoverDeletes(leftover);
        this.loaded = true;
        this._loading.set(false);
        this._fromCache.set(false);
        this._syncedAt.set(new Date().toISOString());
        this.network.reportSuccess();
        this.writeCache();
      },
      error: (err: unknown) => {
        this.pendingOps = [];
        this._loading.set(false);
        if (isNetworkError(err)) {
          this.network.reportFailure();
          if (!this.offlineNotified) {
            this.offlineNotified = true;
            this.toast.show(OFFLINE_MESSAGE, 'warning');
          }
          return;
        }
        this.toast.show(friendlyError(err, 'učitavanju podataka'), 'error');
      },
    });
  }

  /** Briše keš (npr. pri odjavi), da drugi korisnik na istom uređaju ne vidi tuđe podatke. */
  reset(): void {
    this.pendingOps = [];
    this._receipts.set([]);
    this.loaded = false;
    this.wanted = false;
    this.cacheAppliedFor = null;
    this._fromCache.set(false);
    this._syncedAt.set(null);
    clearTimeout(this.cacheWriteTimer);
    this.cacheWriteTimer = undefined;
  }

  /** Briše lokalnu kopiju korisnika sa telefona (pri odjavi). */
  clearCache(userId: string): Promise<void> {
    return cacheDelete(userCacheKey('receipts', userId));
  }

  private async applyCache(): Promise<void> {
    const userId = this.auth.currentUser()?.id;
    if (!userId || this.cacheAppliedFor === userId) return;
    this.cacheAppliedFor = userId;

    const entry = await cacheGet<CacheEntry<FuelReceiptRecord[]>>(userCacheKey('receipts', userId));
    // Baza je u međuvremenu već odgovorila, ili je korisnik promenjen - kopija više ne treba.
    if (!entry || !Array.isArray(entry.data) || this.loaded || this.auth.currentUser()?.id !== userId) return;

    const leftover = this.leftoverDeletes().map((d) => d.id);
    this._receipts.set(this.pendingOps.reduce((list, op) => op(list), entry.data).filter((r) => !leftover.includes(r.id)));
    this._fromCache.set(true);
    this._syncedAt.set(entry.savedAt);
  }

  /** Pamti trenutno stanje kao lokalnu kopiju (posle učitavanja iz baze ili uspešne izmene). */
  private writeCache(): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId || !this.loaded) return;
    clearTimeout(this.cacheWriteTimer);
    this.cacheWriteTimer = setTimeout(() => {
      this.cacheWriteTimer = undefined;
      // Korisnik se u međuvremenu odjavio ili promenio - ne vraćaj obrisanu kopiju.
      if (this.auth.currentUser()?.id !== userId || !this.loaded) return;
      const entry: CacheEntry<FuelReceiptRecord[]> = {
        savedAt: this._syncedAt() ?? new Date().toISOString(),
        data: this._receipts(),
      };
      void cacheSet(userCacheKey('receipts', userId), entry);
    }, 300);
  }

  // Svaki uspeo poziv baze potvrđuje da veza radi (gasi offline stanje posle kratkog prekida).
  insert$(row: FuelReceiptRow): Observable<FuelReceiptRecord> {
    return this.api.insert$(row).pipe(tap((record) => this.afterSuccess(() => this.upsertLocal(record))));
  }

  update$(id: string, patch: FuelReceiptPatch): Observable<FuelReceiptRecord> {
    return this.api.update$(id, patch).pipe(tap((record) => this.afterSuccess(() => this.upsertLocal(record))));
  }

  delete$(id: string): Observable<true> {
    return this.api.deleteReceipt$(id).pipe(tap(() => this.afterSuccess(() => this.removeLocal(id))));
  }

  private afterSuccess(apply: () => void): void {
    this.network.reportSuccess();
    apply();
  }

  /**
   * Brisanje sa mogućnošću poništavanja: zapis odmah nestaje iz prikaza, a iz
   * baze se briše tek posle `delayMs`. Vraća funkciju za poništavanje.
   */
  scheduleDelete(record: FuelReceiptRecord, delayMs: number): () => void {
    this.removeLocal(record.id);
    this.persistDeletes([...this.allPendingDeletes(), { id: record.id, userId: this.auth.currentUser()?.id }]);
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

  /** Odmah izvršava brisanja koja čekaju rok (zatvaranje aplikacije, odjava). */
  flushScheduledDeletes(): void {
    for (const [id, { timer }] of this.scheduledDeletes) {
      clearTimeout(timer);
      this.commitDelete(id);
    }
  }

  private commitDelete(id: string): void {
    const record = this.scheduledDeletes.get(id)?.record;
    this.scheduledDeletes.delete(id);
    this.api.deleteReceipt$(id).subscribe({
      next: () => {
        this.network.reportSuccess();
        this.forgetDelete(id);
      },
      error: (err: unknown) => {
        // Bez mreže: id ostaje zapamćen i brisanje se završava pri sledećem učitavanju.
        if (isNetworkError(err)) {
          this.network.reportFailure();
          return;
        }
        this.forgetDelete(id);
        if (record) this.upsertLocal(record);
        this.toast.show(friendlyError(err, 'brisanju'), 'error');
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

  /** Zapamćena brisanja TRENUTNOG korisnika (stari zapisi bez `userId` se tretiraju kao njegovi). */
  private leftoverDeletes(): PendingDelete[] {
    const userId = this.auth.currentUser()?.id;
    return this.allPendingDeletes().filter((d) => !d.userId || d.userId === userId);
  }

  private allPendingDeletes(): PendingDelete[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(PENDING_DELETES_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((v): PendingDelete | null =>
          typeof v === 'string' ? { id: v } : v && typeof v.id === 'string' ? { id: v.id, userId: v.userId } : null,
        )
        .filter((v): v is PendingDelete => v !== null);
    } catch {
      return [];
    }
  }

  private persistDeletes(list: PendingDelete[]): void {
    const unique = [...new Map(list.map((d) => [d.id, d])).values()];
    try {
      localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(unique));
    } catch {
      // Bez storage-a brisanje i dalje radi, samo ne preživljava zatvaranje aplikacije.
    }
  }

  private forgetDelete(id: string): void {
    this.persistDeletes(this.allPendingDeletes().filter((d) => d.id !== id));
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
    this.writeCache();
  }
}

function sortByDateDesc(list: FuelReceiptRecord[]): FuelReceiptRecord[] {
  const time = (r: FuelReceiptRecord) => (r.date ? new Date(r.date).getTime() || 0 : 0);
  return [...list].sort((a, b) => time(b) - time(a));
}
