import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { FuelReceiptRecord } from '../../core/models/receipt.model';
import { ReceiptsStore } from '../../core/services/receipts-store.service';
import { StationNicknamesService } from '../../core/services/station-nicknames.service';
import { ToastService } from '../../core/services/toast.service';
import { FuelCategory, detectFuel, formatLocation } from '../../core/utils/receipt-parsing.utils';
import { StatsPeriod, computeConsumption, filterByPeriod } from '../../core/utils/receipt-stats.utils';
import { ReceiptFormComponent, ReceiptFormValue } from '../../shared/receipt-form/receipt-form.component';
import { receiptsToCsv } from './receipts-csv';

const PAGE_SIZE = 30;
const UNDO_MS = 5000;

/**
 * Istorija točenja: pretraga, filteri (gorivo, period), izmena zapisa, CSV
 * izvoz i brisanje sa "Poništi" (zapis se zaista briše tek posle 5s).
 */
@Component({
  selector: 'app-history',
  standalone: true,
  imports: [DatePipe, DecimalPipe, ReceiptFormComponent],
  template: `
    <section class="px-4 pt-6 pb-28 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold">Istorija punjenja</h2>
        <button
          type="button"
          (click)="exportCsv()"
          [disabled]="!filtered().length"
          class="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg disabled:opacity-40"
        >
          Izvezi CSV
        </button>
      </div>

      <input
        type="search"
        class="field-input"
        placeholder="Pretraga: stanica, grad, gorivo..."
        [value]="query()"
        (input)="query.set($any($event.target).value); visible.set(pageSize)"
        aria-label="Pretraga"
      />

      <div class="flex flex-wrap gap-2">
        @for (c of categoryOptions; track c.value) {
          <button type="button" class="chip" [class.chip-active]="category() === c.value" (click)="category.set(c.value); visible.set(pageSize)">
            {{ c.label }}
          </button>
        }
        <span class="w-px bg-slate-700 mx-1"></span>
        @for (p of periodOptions; track p.value) {
          <button type="button" class="chip" [class.chip-active]="period() === p.value" (click)="period.set(p.value); visible.set(pageSize)">
            {{ p.label }}
          </button>
        }
      </div>

      @if (store.loading() && !store.receipts().length) {
        <p class="text-slate-500 text-sm text-center py-10">Učitavanje...</p>
      } @else if (!filtered().length) {
        <p class="text-slate-500 text-sm text-center py-10">
          {{ store.receipts().length ? 'Nema zapisa za izabrane filtere.' : 'Istorija je prazna.' }}
        </p>
      } @else {
        <p class="text-[11px] text-slate-500">
          {{ filtered().length }} zapisa · {{ filteredTotal() | number: '1.0-0' }} RSD · {{ filteredLiters() | number: '1.0-1' }} L
        </p>
        <ul class="space-y-3">
          @for (r of shown(); track r.id) {
            <li class="bg-surface-card border border-surface-border rounded-xl px-4 py-4 space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  @if (nicknames.forReceipt(r); as nick) {
                    <p class="font-semibold leading-tight break-words">{{ nick }}</p>
                    <p class="text-[11px] text-slate-500 mt-0.5 break-words">{{ r.station }}</p>
                  } @else {
                    <p class="font-semibold leading-tight break-words">{{ r.station ?? 'Nepoznata stanica' }}</p>
                  }
                  <p class="text-[11px] text-slate-400 mt-0.5 break-words">{{ formatLocation(r) }}</p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <span class="text-xs text-fuel-300 bg-fuel-900 px-2 py-0.5 rounded-lg">{{ r.fuel_type ?? '—' }}</span>
                  <button type="button" (click)="editing.set(r)" class="icon-btn" aria-label="Izmeni">✎</button>
                  <button type="button" (click)="deleteWithUndo(r)" class="icon-btn hover:text-red-400" aria-label="Obriši">✕</button>
                </div>
              </div>
              <div class="flex items-center justify-between text-sm pt-1">
                <span class="text-slate-400 text-xs">{{ r.date ? (r.date | date: 'd.M.y. HH:mm') : '—' }}</span>
                <span class="font-mono text-fuel-400 font-semibold">{{ r.total ? (r.total | number: '1.0-0') + ' RSD' : '—' }}</span>
              </div>
              <div class="grid grid-cols-3 gap-2 pt-1.5 border-t border-surface-border text-xs text-slate-400">
                <span>Litara: <strong class="text-slate-200">{{ r.liters ? (r.liters | number: '1.2-2') : '—' }}</strong></span>
                <span>Cena/L: <strong class="text-slate-200">{{ r.price_per_l ? (r.price_per_l | number: '1.2-2') : '—' }}</strong></span>
                <span>
                  @if (consumption().get(r.id); as l100) {
                    <strong class="text-slate-200">{{ l100 | number: '1.1-1' }}</strong> L/100km
                  } @else if (r.odometer_km) {
                    <strong class="text-slate-200">{{ r.odometer_km | number: '1.0-0' }}</strong> km
                  }
                </span>
              </div>
            </li>
          }
        </ul>
        @if (shown().length < filtered().length) {
          <button
            type="button"
            (click)="visible.set(visible() + pageSize)"
            class="w-full text-sm py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700"
          >
            Prikaži još ({{ filtered().length - shown().length }})
          </button>
        }
      }
    </section>

    @if (editing(); as r) {
      <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" (click)="editing.set(null)">
        <div
          class="bg-slate-900 border border-surface-border p-5 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
          (click)="$event.stopPropagation()"
        >
          <h3 class="text-lg font-bold mb-3">Izmena zapisa</h3>
          <app-receipt-form
            [initial]="editInitial(r)"
            [showNickname]="true"
            [busy]="saving()"
            submitLabel="Sačuvaj izmene"
            cancelLabel="Otkaži"
            (submitted)="saveEdit(r, $event)"
            (cancelled)="editing.set(null)"
          />
        </div>
      </div>
    }
  `,
})
export class HistoryComponent implements OnInit {
  protected readonly store = inject(ReceiptsStore);
  protected readonly nicknames = inject(StationNicknamesService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageSize = PAGE_SIZE;
  readonly formatLocation = formatLocation;
  readonly categoryOptions: { value: FuelCategory | 'all'; label: string }[] = [
    { value: 'all', label: 'Sve' },
    { value: 'Dizel', label: 'Dizel' },
    { value: 'Benzin', label: 'Benzin' },
    { value: 'TNG', label: 'TNG' },
    { value: 'CNG', label: 'CNG' },
  ];
  readonly periodOptions: { value: StatsPeriod; label: string }[] = [
    { value: 'all', label: 'Ceo period' },
    { value: 'year', label: '12 meseci' },
    { value: 'month', label: '30 dana' },
  ];

  readonly query = signal('');
  readonly category = signal<FuelCategory | 'all'>('all');
  readonly period = signal<StatsPeriod>('all');
  readonly visible = signal(PAGE_SIZE);
  readonly editing = signal<FuelReceiptRecord | null>(null);
  readonly saving = signal(false);


  readonly consumption = computed(() => computeConsumption(this.store.receipts()).byId);

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.category();
    return filterByPeriod(this.store.receipts(), this.period()).filter((r) => {
      if (cat !== 'all' && detectFuel(r.fuel_type).category !== cat) return false;
      if (!q) return true;
      return [this.nicknames.forReceipt(r), r.station, r.city, r.address, r.fuel_type].some((v) => v?.toLowerCase().includes(q));
    });
  });

  readonly shown = computed(() => this.filtered().slice(0, this.visible()));
  readonly filteredTotal = computed(() => this.filtered().reduce((s, r) => s + (Number(r.total) || 0), 0));
  readonly filteredLiters = computed(() => this.filtered().reduce((s, r) => s + (Number(r.liters) || 0), 0));

  ngOnInit(): void {
    this.store.load();
    this.nicknames.load();
  }

  editInitial(r: FuelReceiptRecord): Partial<ReceiptFormValue> {
    return { ...r, nickname: this.nicknames.forReceipt(r) };
  }

  deleteWithUndo(record: FuelReceiptRecord): void {
    // Rok i stvarno brisanje vodi store (root servis) - ne prekida se napuštanjem ekrana.
    const undo = this.store.scheduleDelete(record, UNDO_MS);
    this.toast.show('Zapis obrisan.', 'info', UNDO_MS, { label: 'Poništi', handler: undo });
  }

  saveEdit(record: FuelReceiptRecord, value: ReceiptFormValue): void {
    const { nickname, ...fields } = value;
    const previousNickname = this.nicknames.forReceipt(record);
    this.saving.set(true);
    this.store
      .update$(record.id, fields)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.editing.set(null);
          this.toast.show('Izmene su sačuvane.', 'success');
          // Ključ stanice se čita POSLE izmene - naziv/adresa su možda promenjeni,
          // pa nedirnut nadimak "prelazi" na novi ključ umesto da se izgubi.
          this.syncNickname(updated, nickname === undefined ? previousNickname : nickname);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.toast.show(err instanceof Error ? `Greška pri čuvanju: ${err.message}` : 'Greška pri čuvanju.', 'error');
        },
      });
  }

  /** Nadimak je odvojen od računa: njegova greška ne sme da izgleda kao neuspela izmena računa. */
  private syncNickname(record: FuelReceiptRecord, nickname: string | null): void {
    const key = this.store.stationKeys().get(record.id);
    if (!key || (nickname ?? null) === this.nicknames.get(key)) return;
    this.nicknames.set$(key, nickname).subscribe({
      error: () => this.toast.show('Račun je izmenjen, ali nadimak stanice nije sačuvan.', 'warning', 4000),
    });
  }

  exportCsv(): void {
    const csv = receiptsToCsv(this.filtered(), this.consumption(), (r) => this.nicknames.forReceipt(r));
    // BOM da Excel ispravno prikaže č/ć/š/ž.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fuelscan-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
