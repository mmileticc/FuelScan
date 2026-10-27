import { Component, ElementRef, Injector, OnDestroy, OnInit, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartConfiguration,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

import { ReceiptsStore } from '../../core/services/receipts-store.service';
import { FuelCategory } from '../../core/utils/receipt-parsing.utils';
import { StationNicknamesService } from '../../core/services/station-nicknames.service';
import {
  StatsPeriod,
  avgPriceByCategory,
  computeStatistics,
  filterByPeriod,
  monthlySpending,
  stationComparison,
} from '../../core/utils/receipt-stats.utils';

// Samo ono što ekran koristi (linijski + stubičasti grafikon) - ne ceo Chart.js.
Chart.register(LineController, LineElement, PointElement, BarController, BarElement, CategoryScale, LinearScale, Filler, Tooltip);

const AXIS_TICKS = { color: '#94a3b8', font: { size: 10 } };
const TOOLTIP = {
  backgroundColor: '#1e293b',
  titleColor: '#94a3b8',
  bodyColor: '#f8fafc',
  borderColor: '#334155',
  borderWidth: 1,
  padding: 10,
  displayColors: false,
};

/** Statistika: zbirovi za period, cene po gorivu i stanici, grafikoni. */
@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [DecimalPipe, RouterLink],
  template: `
    <section class="px-4 pt-6 pb-28 space-y-6">
      <h2 class="text-xl font-bold">Analitika potrošnje</h2>

      <div class="flex bg-surface-card p-1 rounded-xl border border-surface-border">
        @for (p of periods; track p.value) {
          <button
            type="button"
            (click)="period.set(p.value)"
            class="flex-1 text-xs font-medium py-2 rounded-lg transition-all"
            [class.bg-fuel-600]="period() === p.value"
            [attr.aria-pressed]="period() === p.value"
            [class.text-white]="period() === p.value"
            [class.text-slate-400]="period() !== p.value"
          >
            {{ p.label }}
          </button>
        }
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="stat-tile">
          <p class="stat-label">Potrošeno u periodu</p>
          <p class="text-xl font-black font-mono">{{ stats().periodTotal | number: '1.0-0' }} RSD</p>
        </div>
        <div class="stat-tile">
          <p class="stat-label">Sipano u periodu</p>
          <p class="text-xl font-black font-mono">{{ stats().periodLiters | number: '1.0-1' }} L</p>
        </div>
      </div>

      @if (stats().categories.length > 1) {
        <div class="flex flex-wrap gap-2 -mb-3">
          @for (c of stats().categories; track c) {
            <button type="button" class="chip" [class.chip-active]="stats().category === c" [attr.aria-pressed]="stats().category === c" (click)="fuelCategory.set(c)">{{ c }}</button>
          }
        </div>
      }

      <div class="grid grid-cols-2 gap-3">
        <div class="bg-surface-card border border-surface-border rounded-xl p-4 flex flex-col justify-between min-h-[100px]">
          <div>
            <p class="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold mb-1">Najjeftinije{{ stats().category ? ' · ' + stats().category : '' }}</p>
            <p class="text-base font-bold leading-snug break-words">{{ stats().cheapest ? (nicknames.forReceipt(stats().cheapest!) ?? stats().cheapest!.station) : 'Nema podataka' }}</p>
          </div>
          <p class="text-sm font-semibold font-mono text-slate-300 mt-2">
            {{ stats().cheapest ? (stats().cheapest!.price_per_l | number: '1.2-2') + ' RSD/L' : '—' }}
          </p>
        </div>
        <div class="bg-surface-card border border-surface-border rounded-xl p-4 flex flex-col justify-between min-h-[100px]">
          <div>
            <p class="text-[10px] text-red-400 uppercase tracking-wider font-semibold mb-1">Najskuplje{{ stats().category ? ' · ' + stats().category : '' }}</p>
            <p class="text-base font-bold leading-snug break-words">{{ stats().expensive ? (nicknames.forReceipt(stats().expensive!) ?? stats().expensive!.station) : 'Nema podataka' }}</p>
          </div>
          <p class="text-sm font-semibold font-mono text-slate-300 mt-2">
            {{ stats().expensive ? (stats().expensive!.price_per_l | number: '1.2-2') + ' RSD/L' : '—' }}
          </p>
        </div>
      </div>

      <div class="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-3">
        <p class="stat-label">Troškovi po mesecima (RSD)</p>
        <div class="relative w-full h-48"><canvas #monthlyCanvas></canvas></div>
      </div>

      <div class="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-3">
        <p class="stat-label">Trend cena kroz vreme (RSD/L){{ stats().category ? ' · ' + stats().category : '' }}</p>
        <div class="relative w-full h-56"><canvas #priceCanvas></canvas></div>
      </div>

      @if (categories().length) {
        <div class="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-2">
          <p class="stat-label">Prosečna cena po gorivu</p>
          @for (c of categories(); track c.category) {
            <div class="flex justify-between text-sm">
              <span>{{ c.category }} <span class="text-slate-500 text-xs">({{ c.count }})</span></span>
              <span class="font-mono">{{ c.avgPrice | number: '1.2-2' }} RSD/L</span>
            </div>
          }
        </div>
      }

      @if (stations().length) {
        <div class="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-2">
          <p class="stat-label">Najčešće stanice</p>
          @for (s of stations(); track s.key) {
            <div class="flex justify-between gap-3 text-sm">
              <div class="min-w-0">
                <p class="leading-snug break-words">{{ nicknames.get(s.key) ?? s.station }} <span class="text-slate-500 text-xs">×{{ s.count }}</span></p>
                @if (s.address || s.city) {
                  <p class="text-[11px] text-slate-500 break-words">{{ s.address }}{{ s.address && s.city ? ', ' : '' }}{{ s.city }}</p>
                }
              </div>
              <span class="font-mono shrink-0">{{ s.avgPrice | number: '1.2-2' }} RSD/L</span>
            </div>
          }
          <a routerLink="/stations" class="block text-xs text-fuel-400 hover:text-fuel-300 pt-1">Sve stanice i cene →</a>
        </div>
      }
    </section>
  `,
})
export class StatisticsComponent implements OnInit, OnDestroy {
  private readonly store = inject(ReceiptsStore);
  protected readonly nicknames = inject(StationNicknamesService);
  private readonly injector = inject(Injector);

  private readonly priceCanvas = viewChild<ElementRef<HTMLCanvasElement>>('priceCanvas');
  private readonly monthlyCanvas = viewChild<ElementRef<HTMLCanvasElement>>('monthlyCanvas');
  private priceChart: Chart | null = null;
  private monthlyChart: Chart | null = null;

  readonly periods: { value: StatsPeriod; label: string }[] = [
    { value: 'month', label: '30 dana' },
    { value: 'year', label: '12 meseci' },
    { value: 'all', label: 'Sve' },
  ];

  readonly period = signal<StatsPeriod>('year');
  /** Izabrana vrsta goriva za najjeftinije/najskuplje i trend; `null` = najčešća u periodu. */
  readonly fuelCategory = signal<FuelCategory | null>(null);
  private readonly inPeriod = computed(() => filterByPeriod(this.store.receipts(), this.period()));

  readonly stats = computed(() => computeStatistics(this.store.receipts(), this.period(), new Date(), this.fuelCategory()));
  readonly categories = computed(() => avgPriceByCategory(this.inPeriod()));
  readonly stations = computed(() => stationComparison(this.inPeriod()));
  readonly monthly = computed(() => monthlySpending(this.store.receipts(), this.period() === 'month' ? 3 : 12));

  ngOnInit(): void {
    this.store.load();
    this.nicknames.load();
    // Grafikoni se crtaju tek kad canvas postoji, i ponovo pri svakoj promeni podataka/perioda.
    afterNextRender(
      () => {
        effect(() => this.renderCharts(), { injector: this.injector });
      },
      { injector: this.injector },
    );
  }

  ngOnDestroy(): void {
    this.priceChart?.destroy();
    this.monthlyChart?.destroy();
  }

  private renderCharts(): void {
    this.renderPriceChart();
    this.renderMonthlyChart();
  }

  private renderPriceChart(): void {
    const canvas = this.priceCanvas()?.nativeElement;
    const data = this.stats().chartData;
    if (!canvas) return;

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels: data.map((r) => new Date(r.date as string).toLocaleDateString('sr-Latn', { day: '2-digit', month: '2-digit' })),
        datasets: [
          {
            label: 'Cena po litru',
            data: data.map((r) => Number(r.price_per_l)),
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.1)',
            borderWidth: 3,
            tension: 0.3,
            pointBackgroundColor: '#0ea5e9',
            pointRadius: data.length > 15 ? 2 : 4,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP,
            callbacks: {
              label: (context) => {
                const item = data[context.dataIndex];
                const station = item ? (this.nicknames.forReceipt(item) ?? item.station ?? '') : '';
                return [`Cena: ${Number(context.parsed.y).toFixed(2)} RSD/L`, `Pumpa: ${station}`];
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: AXIS_TICKS },
          y: { grid: { color: 'rgba(51, 65, 85, 0.2)' }, ticks: AXIS_TICKS },
        },
      },
    };

    this.priceChart?.destroy();
    this.priceChart = new Chart(canvas, config);
  }

  private renderMonthlyChart(): void {
    const canvas = this.monthlyCanvas()?.nativeElement;
    const months = this.monthly();
    if (!canvas) return;

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: months.map((m) => m.label),
        datasets: [
          {
            label: 'RSD',
            data: months.map((m) => Math.round(m.total)),
            backgroundColor: '#0284c7',
            borderRadius: 4,
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP,
            callbacks: {
              label: (context) => {
                const m = months[context.dataIndex];
                return [`${Math.round(m.total).toLocaleString('sr-Latn')} RSD`, `${m.liters.toFixed(1)} L`];
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: AXIS_TICKS },
          y: { grid: { color: 'rgba(51, 65, 85, 0.2)' }, ticks: AXIS_TICKS, beginAtZero: true },
        },
      },
    };

    this.monthlyChart?.destroy();
    this.monthlyChart = new Chart(canvas, config);
  }
}
