import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { FuelReceiptsService } from '../../core/services/fuel-receipts.service';
import { ToastService } from '../../core/services/toast.service';
import { FuelReceiptRecord } from '../../core/models/receipt.model';

/**
 * Rekonstrukcija `#screen-history` iz starog `index.html` + `ui/history.js`.
 *
 * Napomena: stari long-press/floating-menu za brisanje (pointerdown/pointermove
 * tajmeri) je ovde zamenjen jednostavnim dugmetom za brisanje + potvrdni modal
 * (isti `#delete-modal` koncept), što je pristupačnije i lakše za održavanje
 * uz identičan krajnji efekat.
 */
@Component({
  selector: 'app-history',
  standalone: true,
  template: `
    <section class="px-4 pt-6 pb-28 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold">Istorija punjenja</h2>
      </div>

      @if (loading()) {
        <p class="text-slate-500 text-sm text-center py-10">Učitavanje...</p>
      } @else if (!receipts().length) {
        <p class="text-slate-500 text-sm text-center py-10">Istorija je prazna.</p>
      } @else {
        <ul class="space-y-3">
          @for (r of receipts(); track r.id) {
            <li class="relative bg-surface-card border border-surface-border rounded-xl px-4 py-4 space-y-2">
              <div class="flex items-start justify-between">
                <div>
                  <p class="font-semibold leading-tight">{{ r.station ?? 'Nepoznata stanica' }}</p>
                  <p class="text-[11px] text-slate-400 mt-0.5">{{ locationText(r) }}</p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="text-xs text-fuel-300 bg-fuel-900 px-2 py-0.5 rounded-lg">{{ r.fuel_type ?? '—' }}</span>
                  <button
                    type="button"
                    (click)="requestDelete(r.id)"
                    class="text-slate-500 hover:text-red-400 transition-colors text-xs px-1"
                    aria-label="Obriši"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div class="flex items-center justify-between text-sm pt-1">
                <span class="text-slate-400 text-xs">{{ formatDate(r.date) }}</span>
                <span class="font-mono text-fuel-400 font-semibold">{{ r.total ? r.total.toFixed(0) + ' RSD' : '—' }}</span>
              </div>
              <div class="grid grid-cols-2 gap-2 pt-1.5 border-t border-surface-border text-xs text-slate-400">
                <span>Litara: <strong class="text-slate-200">{{ r.liters ? r.liters.toFixed(2) + ' L' : '—' }}</strong></span>
                <span>Cena/L: <strong class="text-slate-200">{{ r.price_per_l ? r.price_per_l.toFixed(2) + ' RSD' : '—' }}</strong></span>
              </div>
            </li>
          }
        </ul>
      }
    </section>

    @if (pendingDeleteId()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div class="bg-surface-card border border-surface-border p-6 rounded-2xl w-full max-w-xs shadow-2xl">
          <h3 class="text-lg font-bold text-white mb-2">Brisanje zapisa?</h3>
          <p class="text-slate-400 text-sm mb-6">Ova akcija je nepovratna. Da li ste sigurni?</p>
          <div class="flex gap-3">
            <button type="button" (click)="cancelDelete()" class="flex-1 py-2 rounded-xl bg-slate-700 text-white font-medium hover:bg-slate-600">
              Odustani
            </button>
            <button type="button" (click)="confirmDelete()" class="flex-1 py-2 rounded-xl bg-red-600 text-white font-medium hover:bg-red-500">
              Obriši
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class HistoryComponent implements OnInit {
  private readonly receiptsService = inject(FuelReceiptsService);
  private readonly toast = inject(ToastService);

  readonly receipts = signal<FuelReceiptRecord[]>([]);
  readonly loading = signal(true);
  readonly pendingDeleteId = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  locationText(r: FuelReceiptRecord): string {
    return [r.address, r.city].filter((v): v is string => !!v).join(', ') || 'Nepoznata lokacija';
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('sr-RS');
  }

  requestDelete(id: string): void {
    this.pendingDeleteId.set(id);
  }

  cancelDelete(): void {
    this.pendingDeleteId.set(null);
  }

  confirmDelete(): void {
    const id = this.pendingDeleteId();
    if (!id) return;

    this.receiptsService.deleteReceipt$(id).subscribe({
      next: () => {
        this.receipts.update((list) => list.filter((r) => r.id !== id));
        this.pendingDeleteId.set(null);
        this.toast.show('Zapis obrisan.', 'success');
      },
      error: (err) => {
        this.pendingDeleteId.set(null);
        this.toast.show(err instanceof Error ? `Greška pri brisanju: ${err.message}` : 'Greška pri brisanju.', 'error');
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.receiptsService.fetchUserReceipts$().subscribe({
      next: (data) => {
        this.receipts.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.toast.show(err instanceof Error ? err.message : 'Greška pri učitavanju podataka.', 'error');
        this.loading.set(false);
      },
    });
  }
}
