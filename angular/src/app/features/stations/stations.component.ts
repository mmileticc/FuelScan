import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';

import { ReceiptsStore } from '../../core/services/receipts-store.service';
import { StationNicknamesService } from '../../core/services/station-nicknames.service';
import { FuelCategory, formatLocation } from '../../core/utils/receipt-parsing.utils';
import { CategoryPriceHistory, StationSummary, groupByStation } from '../../core/utils/stations.utils';

type SortMode = 'frequent' | 'cheapest' | 'recent';

/**
 * Stanice na kojima je korisnik točio, sa cenama praćenim posebno za svaku
 * vrstu goriva: poslednja cena + trend, prosek, raspon i istorija cena.
 */
@Component({
  selector: 'app-stations',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  template: `
    <section class="px-4 pt-6 pb-28 space-y-4">
      <div class="flex items-baseline justify-between">
        <h2 class="text-xl font-bold">Stanice i cene</h2>
        <span class="text-xs text-slate-500">{{ stations().length }} stanica</span>
      </div>

      <input
        type="search"
        class="field-input"
        placeholder="Pretraga: naziv, adresa, grad..."
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        aria-label="Pretraga stanica"
      />

      <div class="flex flex-wrap gap-2">
        @for (c of categoryOptions; track c.value) {
          <button type="button" class="chip" [class.chip-active]="category() === c.value" (click)="category.set(c.value)">
            {{ c.label }}
          </button>
        }
      </div>

      <div class="flex bg-surface-card p-1 rounded-xl border border-surface-border">
        @for (s of sortOptions; track s.value) {
          <button
            type="button"
            (click)="sort.set(s.value)"
            class="flex-1 text-xs font-medium py-2 rounded-lg transition-all"
            [class.bg-fuel-600]="sort() === s.value"
            [class.text-white]="sort() === s.value"
            [class.text-slate-400]="sort() !== s.value"
          >
            {{ s.label }}
          </button>
        }
      </div>
      @if (sort() === 'cheapest') {
        <p class="text-[11px] text-slate-500 -mt-2">Po poslednjoj ceni za: <strong class="text-slate-300">{{ sortCategory() ?? '—' }}</strong></p>
      }

      @if (store.loading() && !store.receipts().length) {
        <p class="text-slate-500 text-sm text-center py-10">Učitavanje...</p>
      } @else if (!filtered().length) {
        <p class="text-slate-500 text-sm text-center py-10">
          {{ stations().length ? 'Nema stanica za izabrane filtere.' : 'Još nema sačuvanih točenja.' }}
        </p>
      } @else {
        <ul class="space-y-3">
          @for (item of filtered(); track item.station.key) {
            @let s = item.station;
            <li class="bg-surface-card border border-surface-border rounded-xl">
              <button type="button" class="w-full text-left px-4 pt-4 pb-3 space-y-1" (click)="toggle(s.key)" [attr.aria-expanded]="expanded() === s.key">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    @if (nicknames.get(s.key); as nick) {
                      <p class="font-semibold leading-snug break-words">{{ nick }}</p>
                      <p class="text-[11px] text-slate-500 break-words">{{ s.name }}</p>
                    } @else {
                      <p class="font-semibold leading-snug break-words">{{ s.name }}</p>
                    }
                  </div>
                  <span class="text-slate-500 text-xs shrink-0 pt-0.5">{{ expanded() === s.key ? '▲' : '▼' }}</span>
                </div>
                <p class="text-[11px] text-slate-400 break-words">{{ formatLocation(s) }}</p>
                <p class="text-[11px] text-slate-500">
                  {{ s.count }} {{ s.count === 1 ? 'točenje' : 'točenja' }} · poslednje {{ s.lastVisit ? (s.lastVisit | date: 'd.M.y.') : '—' }} ·
                  {{ s.total | number: '1.0-0' }} RSD
                </p>
              </button>

              <div class="px-4 pb-4 space-y-2">
                @if (editingKey() === s.key) {
                  <form class="flex gap-2" (submit)="$event.preventDefault(); saveNickname(s.key, nickInput.value)">
                    <input
                      #nickInput
                      class="field-input flex-1"
                      maxlength="60"
                      placeholder="Nadimak, npr. Pumpa kod mosta"
                      [value]="nicknames.get(s.key) ?? ''"
                      aria-label="Nadimak stanice"
                    />
                    <button type="submit" class="text-xs bg-fuel-600 hover:bg-fuel-500 px-3 rounded-lg">Sačuvaj</button>
                    <button type="button" class="text-xs text-slate-400 px-2" (click)="editingKey.set(null)">Otkaži</button>
                  </form>
                } @else {
                  <button type="button" class="text-[11px] text-fuel-400 hover:text-fuel-300" (click)="editingKey.set(s.key)">
                    ✎ {{ nicknames.get(s.key) ? 'Izmeni nadimak' : 'Dodaj nadimak' }}
                  </button>
                }
                @for (c of item.categories; track c.category) {
                  <div class="border-t border-surface-border pt-2">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs text-fuel-300 bg-fuel-900 px-2 py-0.5 rounded-lg">{{ c.category }}</span>
                      <span class="font-mono text-sm font-semibold">
                        {{ c.last.price | number: '1.2-2' }} <span class="text-[10px] text-slate-400 font-normal">RSD/L</span>
                        @if (c.previous && c.last.price !== c.previous.price) {
                          <span [class]="c.last.price > c.previous.price ? 'text-red-400' : 'text-emerald-400'" class="text-xs">
                            {{ c.last.price > c.previous.price ? '▲' : '▼' }}{{ abs(c.last.price - c.previous.price) | number: '1.2-2' }}
                          </span>
                        }
                      </span>
                    </div>
                    <p class="text-[11px] text-slate-500 mt-1">
                      prosek {{ c.avg | number: '1.2-2' }} · min {{ c.min | number: '1.2-2' }} · max {{ c.max | number: '1.2-2' }} · {{ c.history.length }}×
                    </p>

                    @if (expanded() === s.key) {
                      @if (c.history.length > 1) {
                        <svg viewBox="0 0 100 30" preserveAspectRatio="none" class="w-full h-12 mt-2" aria-hidden="true">
                          <polyline [attr.points]="sparkline(c)" fill="none" stroke="#38bdf8" stroke-width="1.5" vector-effect="non-scaling-stroke" />
                        </svg>
                      }
                      <ul class="mt-2 space-y-1">
                        @for (p of c.recentFirst; track $index) {
                          <li class="flex justify-between text-xs text-slate-400">
                            <span>{{ p.date | date: 'd.M.y.' }}</span>
                            <span class="font-mono text-slate-200">{{ p.price | number: '1.2-2' }}</span>
                          </li>
                        }
                      </ul>
                    }
                  </div>
                } @empty {
                  <p class="text-[11px] text-slate-500 border-t border-surface-border pt-2">Nema zabeleženih cena za izabrano gorivo.</p>
                }
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class StationsComponent implements OnInit {
  protected readonly store = inject(ReceiptsStore);
  protected readonly nicknames = inject(StationNicknamesService);

  readonly categoryOptions: { value: FuelCategory | 'all'; label: string }[] = [
    { value: 'all', label: 'Sva goriva' },
    { value: 'Dizel', label: 'Dizel' },
    { value: 'Benzin', label: 'Benzin' },
    { value: 'TNG', label: 'TNG' },
    { value: 'CNG', label: 'CNG' },
  ];
  readonly sortOptions: { value: SortMode; label: string }[] = [
    { value: 'frequent', label: 'Najčešće' },
    { value: 'cheapest', label: 'Najjeftinije' },
    { value: 'recent', label: 'Poslednje' },
  ];

  readonly formatLocation = formatLocation;
  readonly query = signal('');
  readonly category = signal<FuelCategory | 'all'>('all');
  readonly sort = signal<SortMode>('frequent');
  readonly expanded = signal<string | null>(null);
  readonly editingKey = signal<string | null>(null);

  readonly stations = computed(() => groupByStation(this.store.receipts()));

  /** Za "Najjeftinije" mora postojati jedno gorivo: izabrano, ili najčešće točeno. */
  readonly sortCategory = computed<FuelCategory | null>(() => {
    const selected = this.category();
    if (selected !== 'all') return selected;
    const counts = new Map<FuelCategory, number>();
    for (const s of this.stations()) {
      for (const c of s.categories) counts.set(c.category, (counts.get(c.category) ?? 0) + c.history.length);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  });

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.category();
    let list = this.stations().filter((s) => {
      if (cat !== 'all' && !s.categories.some((c) => c.category === cat)) return false;
      if (!q) return true;
      return [this.nicknames.get(s.key), s.name, s.address, s.city].some((v) => v?.toLowerCase().includes(q));
    });

    const mode = this.sort();
    if (mode === 'recent') {
      list = [...list].sort((a, b) => (b.lastVisit ?? '').localeCompare(a.lastVisit ?? ''));
    } else if (mode === 'cheapest') {
      const sortCat = this.sortCategory();
      const price = (s: StationSummary) => s.categories.find((c) => c.category === sortCat)?.last.price ?? Infinity;
      list = list.filter((s) => price(s) !== Infinity).sort((a, b) => price(a) - price(b));
    }
    // Kategorije za prikaz se računaju ovde (jednom po promeni filtera), ne u šablonu.
    return list.map((station) => ({
      station,
      categories: cat === 'all' ? station.categories : station.categories.filter((c) => c.category === cat),
    }));
  });

  ngOnInit(): void {
    this.store.load();
    this.nicknames.load();
  }

  saveNickname(key: string, value: string): void {
    this.nicknames.save(key, value, () => this.editingKey.set(null));
  }

  toggle(key: string): void {
    this.expanded.set(this.expanded() === key ? null : key);
  }

  abs(value: number): number {
    return Math.abs(value);
  }

  /** Tačke za mini grafikon cene (SVG viewBox 100x30). */
  sparkline(c: CategoryPriceHistory): string {
    const n = c.history.length;
    const span = c.max - c.min || 1;
    return c.history
      .map((p, i) => `${((i / (n - 1)) * 100).toFixed(1)},${(28 - ((p.price - c.min) / span) * 26).toFixed(1)}`)
      .join(' ');
  }
}
