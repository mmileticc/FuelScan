import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { FuelReceiptsService } from '../../core/services/fuel-receipts.service';
import { ToastService } from '../../core/services/toast.service';
import { FuelReceiptRecord } from '../../core/models/receipt.model';
import { getMonthlyComparison } from '../../core/utils/receipt-stats.utils';

/** Rekonstrukcija `#screen-dashboard` + `loadDashboardData()` iz starog `main.js`/`dashboard.js`. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="px-4 pt-6 pb-28 space-y-6">
      <div class="bg-gradient-to-br from-fuel-700 to-fuel-900 rounded-2xl p-5 shadow-lg">
        <p class="text-sm text-fuel-200 mb-1">Dobrodošli nazad</p>
        <h1 class="text-2xl font-bold">{{ auth.greetingName() }}</h1>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2 flex justify-between items-center bg-slate-800/50 rounded-xl px-4 py-2 border border-slate-700">
          <p class="text-[10px] text-slate-400 uppercase">
            Poslednje evidentirano točenje:
            <span class="text-white">{{ lastReceiptDateText() }}</span>
          </p>
          <p class="text-sm font-bold font-mono text-fuel-400">{{ lastReceiptTotalText() }}</p>
        </div>

        <div class="bg-surface-card border border-surface-border rounded-xl p-4 flex flex-col">
          <p class="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Potrošeno (Ovaj mesec)</p>
          <p class="text-xl font-bold font-mono">{{ monthlyComparison().totals.thisSpent.toFixed(0) }} RSD</p>
          <p
            class="text-[10px] font-mono mt-1"
            [class.text-red-500]="monthlyComparison().spent.isIncrease"
            [class.text-green-500]="!monthlyComparison().spent.isIncrease"
          >
            {{ monthlyComparison().spent.text }}
          </p>
        </div>

        <div class="bg-surface-card border border-surface-border rounded-xl p-4 flex flex-col">
          <p class="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Sipano (Ovaj mesec)</p>
          <p class="text-xl font-bold font-mono">{{ monthlyComparison().totals.thisLiters.toFixed(1) }} L</p>
          <p
            class="text-[10px] font-mono mt-1"
            [class.text-red-500]="monthlyComparison().liters.isIncrease"
            [class.text-green-500]="!monthlyComparison().liters.isIncrease"
          >
            {{ monthlyComparison().liters.text }}
          </p>
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-400">Poslednje transakcije</h2>
          <a routerLink="/history" class="text-xs text-fuel-400 hover:text-fuel-300">Sve →</a>
        </div>

        @if (loading()) {
          <p class="text-slate-500 text-sm text-center py-6">Učitavanje...</p>
        } @else if (!recentTransactions().length) {
          <p class="text-slate-500 text-sm text-center py-6">Nema podataka. Skenirajte prvi račun.</p>
        } @else {
          <ul class="space-y-2">
            @for (r of recentTransactions(); track r.id) {
              <li class="bg-surface-card border border-surface-border rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p class="font-medium text-sm">{{ r.station ?? 'Nepoznata stanica' }}</p>
                  <p class="text-xs text-slate-400">{{ formatDate(r.date) }} · {{ r.fuel_type ?? '' }}</p>
                </div>
                <div class="text-right">
                  <p class="font-semibold font-mono text-fuel-400">{{ r.total ? r.total.toFixed(0) + ' RSD' : '—' }}</p>
                  <p class="text-xs text-slate-400">{{ r.liters ? r.liters.toFixed(1) + ' L' : '' }}</p>
                </div>
              </li>
            }
          </ul>
        }
      </div>

      <a
        routerLink="/scan"
        class="block text-center bg-fuel-600 hover:bg-fuel-500 text-white font-semibold py-3 rounded-xl transition-colors"
      >
        Skeniraj novi račun
      </a>
    </section>
  `,
})
export class DashboardComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly receiptsService = inject(FuelReceiptsService);
  private readonly toast = inject(ToastService);

  readonly receipts = signal<FuelReceiptRecord[]>([]);
  readonly loading = signal(true);

  readonly lastReceipt = computed<FuelReceiptRecord | null>(() => this.receipts()[0] ?? null);
  readonly monthlyComparison = computed(() => getMonthlyComparison(this.receipts()));
  readonly recentTransactions = computed(() => this.receipts().slice(0, 3));

  ngOnInit(): void {
    this.load();
  }

  lastReceiptDateText(): string {
    return this.formatDate(this.lastReceipt()?.date ?? null, '---');
  }

  lastReceiptTotalText(): string {
    const total = this.lastReceipt()?.total;
    return total ? `${Number(total).toFixed(0)} RSD` : '---';
  }

  formatDate(dateStr: string | null | undefined, fallback = '—'): string {
    if (!dateStr) return fallback;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? fallback : date.toLocaleDateString('sr-RS');
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
