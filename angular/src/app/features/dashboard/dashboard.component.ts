import { Component, OnInit, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ReceiptsStore } from '../../core/services/receipts-store.service';
import { FuelReceiptRecord } from '../../core/models/receipt.model';
import { computeConsumption, getMonthlyComparison } from '../../core/utils/receipt-stats.utils';

/** Početni ekran: poslednje točenje, ovaj vs. prošli kalendarski mesec, potrošnja, poslednje transakcije. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe],
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
            <span class="text-white">{{ lastReceipt()?.date ? (lastReceipt()!.date | date: 'd.M.y.') : '---' }}</span>
          </p>
          <p class="text-sm font-bold font-mono text-fuel-400">
            {{ lastReceipt()?.total ? (lastReceipt()!.total | number: '1.0-0') + ' RSD' : '---' }}
          </p>
        </div>

        <div class="bg-surface-card border border-surface-border rounded-xl p-4 flex flex-col">
          <p class="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Potrošeno (Ovaj mesec)</p>
          <p class="text-xl font-bold font-mono">{{ monthlyComparison().totals.thisSpent | number: '1.0-0' }} RSD</p>
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
          <p class="text-xl font-bold font-mono">{{ monthlyComparison().totals.thisLiters | number: '1.0-1' }} L</p>
          <p
            class="text-[10px] font-mono mt-1"
            [class.text-red-500]="monthlyComparison().liters.isIncrease"
            [class.text-green-500]="!monthlyComparison().liters.isIncrease"
          >
            {{ monthlyComparison().liters.text }}
          </p>
        </div>

        @if (averageConsumption() !== null) {
          <div class="col-span-2 bg-surface-card border border-surface-border rounded-xl p-4 flex items-center justify-between">
            <p class="text-[10px] text-slate-400 uppercase tracking-wider">Prosečna potrošnja</p>
            <p class="text-xl font-bold font-mono">{{ averageConsumption() | number: '1.1-1' }} <span class="text-sm text-slate-400">L/100km</span></p>
          </div>
        }
      </div>

      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-400">Poslednje transakcije</h2>
          <a routerLink="/history" class="text-xs text-fuel-400 hover:text-fuel-300">Sve →</a>
        </div>

        @if (store.loading() && !store.receipts().length) {
          <p class="text-slate-500 text-sm text-center py-6">Učitavanje...</p>
        } @else if (!recentTransactions().length) {
          <p class="text-slate-500 text-sm text-center py-6">Nema podataka. Skenirajte prvi račun.</p>
        } @else {
          <ul class="space-y-2">
            @for (r of recentTransactions(); track r.id) {
              <li class="bg-surface-card border border-surface-border rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p class="font-medium text-sm">{{ r.station ?? 'Nepoznata stanica' }}</p>
                  <p class="text-xs text-slate-400">{{ r.date ? (r.date | date: 'd.M.y.') : '—' }} · {{ r.fuel_type ?? '' }}</p>
                </div>
                <div class="text-right">
                  <p class="font-semibold font-mono text-fuel-400">{{ r.total ? (r.total | number: '1.0-0') + ' RSD' : '—' }}</p>
                  <p class="text-xs text-slate-400">{{ r.liters ? (r.liters | number: '1.0-1') + ' L' : '' }}</p>
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
  protected readonly store = inject(ReceiptsStore);

  readonly lastReceipt = computed<FuelReceiptRecord | null>(() => this.store.receipts()[0] ?? null);
  readonly monthlyComparison = computed(() => getMonthlyComparison(this.store.receipts()));
  readonly recentTransactions = computed(() => this.store.receipts().slice(0, 3));
  readonly averageConsumption = computed(() => computeConsumption(this.store.receipts()).average);

  ngOnInit(): void {
    this.store.load();
  }
}
