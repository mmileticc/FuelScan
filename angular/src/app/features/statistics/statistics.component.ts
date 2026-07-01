import { AfterViewInit, Component, ElementRef, OnInit, ViewChild, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Chart, registerables } from 'chart.js';

import { FuelReceiptsService } from '../../core/services/fuel-receipts.service';
import { ToastService } from '../../core/services/toast.service';
import { FuelReceiptRecord } from '../../core/models/receipt.model';
import { StatisticsResult, StatsPeriod, computeStatistics } from '../../core/utils/receipt-stats.utils';

Chart.register(...registerables);

/** Rekonstrukcija `#screen-statistics` + `ui/statistics.js` (Chart.js linijski grafikon). */
@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <section class="px-4 pt-6 pb-28 space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold">Analitika potrošnje</h2>
      </div>

      <div class="flex bg-surface-card p-1 rounded-xl border border-surface-border">
        @for (p of periods; track p.value) {
          <button
            type="button"
            (click)="setPeriod(p.value)"
            class="flex-1 text-xs font-medium py-2 rounded-lg transition-all"
            [class.bg-fuel-600]="period() === p.value"
            [class.text-white]="period() === p.value"
            [class.text-slate-400]="period() !== p.value"
          >
            {{ p.label }}
          </button>
        }
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="bg-gradient-to-br from-slate-800 to-slate-900 border border-surface-border rounded-xl p-4">
          <p class="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">Potrošeno u periodu</p>
          <p class="text-xl font-black font-mono text-white">{{ stats().periodTotal.toFixed(0) }} RSD</p>
        </div>

        <div class="bg-gradient-to-br from-slate-800 to-slate-900 border border-surface-border rounded-xl p-4">
          <p class="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">Sipano u periodu</p>
          <p class="text-xl font-black font-mono text-white">{{ stats().periodLiters.toFixed(1) }} L</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="bg-surface-card border border-surface-border rounded-xl p-4 flex flex-col justify-between min-h-[100px]">
          <div>
            <p class="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold mb-1">Najjeftinije gorivo</p>
            <p class="text-base font-bold truncate" [title]="stats().cheapest?.station">
              {{ stats().cheapest?.station ?? 'Nema podataka' }}
            </p>
          </div>
          <p class="text-sm font-semibold font-mono text-slate-300 mt-2">
            {{ stats().cheapest ? (stats().cheapest!.price_per_l | number: '1.2-2') + ' RSD/L' : '—' }}
          </p>
        </div>

        <div class="bg-surface-card border border-surface-border rounded-xl p-4 flex flex-col justify-between min-h-[100px]">
          <div>
            <p class="text-[10px] text-red-400 uppercase tracking-wider font-semibold mb-1">Najskuplje gorivo</p>
            <p class="text-base font-bold truncate" [title]="stats().expensive?.station">
              {{ stats().expensive?.station ?? 'Nema podataka' }}
            </p>
          </div>
          <p class="text-sm font-semibold font-mono text-slate-300 mt-2">
            {{ stats().expensive ? (stats().expensive!.price_per_l | number: '1.2-2') + ' RSD/L' : '—' }}
          </p>
        </div>
      </div>

      <div class="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-3">
        <p class="text-xs text-slate-400 uppercase tracking-wider font-medium">Trend cena kroz vreme (RSD/L)</p>
        <div class="relative w-full h-56">
          <canvas #chartCanvas></canvas>
        </div>
      </div>
    </section>
  `,
})
export class StatisticsComponent implements OnInit, AfterViewInit {
  private readonly receiptsService = inject(FuelReceiptsService);
  private readonly toast = inject(ToastService);

  @ViewChild('chartCanvas') private chartCanvasRef?: ElementRef<HTMLCanvasElement>;
  private chartInstance: Chart | null = null;

  readonly periods: { value: StatsPeriod; label: string }[] = [
    { value: 'all', label: 'Sve' },
    { value: 'year', label: 'Godina' },
    { value: 'month', label: 'Mesec' },
  ];

  readonly receipts = signal<FuelReceiptRecord[]>([]);
  readonly period = signal<StatsPeriod>('all');
  readonly viewReady = signal(false);

  readonly stats = signal<StatisticsResult>({
    periodTotal: 0,
    periodLiters: 0,
    cheapest: null,
    expensive: null,
    chartData: [],
  });

  constructor() {
    effect(() => {
      const data = computeStatistics(this.receipts(), this.period());
      this.stats.set(data);

      if (this.viewReady()) {
        this.renderChart(data);
      }
    });
  }

  ngOnInit(): void {
    this.load();
  }

  ngAfterViewInit(): void {
    this.viewReady.set(true);
  }

  setPeriod(period: StatsPeriod): void {
    this.period.set(period);
  }

  private load(): void {
    this.receiptsService.fetchUserReceipts$().subscribe({
      next: (data) => this.receipts.set(data),
      error: (err) => this.toast.show(err instanceof Error ? err.message : 'Greška pri učitavanju statistike.', 'error'),
    });
  }

  private renderChart(data: StatisticsResult): void {
    const canvas = this.chartCanvasRef?.nativeElement;
    if (!canvas) return;

    const labels = data.chartData.map((r) =>
      new Date(r.date as string).toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit' }),
    );
    const prices = data.chartData.map((r) => Number(r.price_per_l));

    this.chartInstance?.destroy();

    this.chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Cena po litru',
            data: prices,
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.1)',
            borderWidth: 3,
            tension: 0.3,
            pointBackgroundColor: '#0ea5e9',
            pointRadius: data.chartData.length > 15 ? 2 : 4,
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
            backgroundColor: '#1e293b',
            titleColor: '#94a3b8',
            bodyColor: '#f8fafc',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: (context) => {
                const item = data.chartData[context.dataIndex];
                return [`Cena: ${Number(context.parsed.y).toFixed(2)} RSD/L`, `Pumpa: ${item?.station ?? ''}`];
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { size: 10 } },
          },
          y: {
            grid: { color: 'rgba(51, 65, 85, 0.2)' },
            ticks: { color: '#94a3b8', font: { size: 10 } },
          },
        },
      },
    });
  }
}
