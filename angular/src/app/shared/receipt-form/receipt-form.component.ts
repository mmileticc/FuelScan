import { Component, OnInit, computed, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { belgradeOffset, parseLocalReceiptDate, roundTo2 } from '../../core/utils/receipt-parsing.utils';

/** Vrednosti forme (isti nazivi kao kolone u `fuel_receipts`). `date` je ISO sa zonom. */
export interface ReceiptFormValue {
  station: string | null;
  address: string | null;
  city: string | null;
  fuel_type: string | null;
  liters: number | null;
  price_per_l: number | null;
  total: number | null;
  date: string | null;
  odometer_km: number | null;
  /**
   * Nadimak STANICE (važi za sve njene račune). `undefined` = korisnik ga nije
   * menjao; `null` = obrisan. Samo kad je `showNickname`.
   */
  nickname?: string | null;
}

type NumberField = 'liters' | 'price_per_l' | 'total';

/**
 * Zajednička forma za račun - koristi se za:
 *   - pregled/izmenu posle skeniranja (pre "Sačuvaj"),
 *   - ručni unos (kad Poreska uprava ne odgovara ili račun nema QR),
 *   - izmenu postojećeg zapisa iz istorije.
 *
 * Od litara, cene po litru i ukupnog iznosa dovoljno je uneti dva - treći se
 * sam izračuna.
 */
@Component({
  selector: 'app-receipt-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-3">
      @if (warning()) {
        <p class="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl px-3 py-2">{{ warning() }}</p>
      }

      @if (showNickname()) {
        <label class="block">
          <span class="field-label">Nadimak stanice (opciono)</span>
          <input formControlName="nickname" class="field-input" maxlength="60" placeholder="npr. Pumpa kod mosta" autocomplete="off" />
          <span class="block text-[10px] text-slate-500 mt-1">Važi za sve račune ove stanice i prikazuje se umesto zvaničnog naziva.</span>
        </label>
      }

      <label class="block">
        <span class="field-label">Stanica (naziv sa računa)</span>
        <input formControlName="station" class="field-input" placeholder="npr. NIS Petrol Beograd" autocomplete="off" />
      </label>

      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span class="field-label">Adresa</span>
          <input formControlName="address" class="field-input" autocomplete="off" />
        </label>
        <label class="block">
          <span class="field-label">Grad</span>
          <input formControlName="city" class="field-input" autocomplete="off" />
        </label>
      </div>

      <label class="block">
        <span class="field-label">Gorivo *</span>
        <input formControlName="fuel_type" class="field-input" list="fuel-type-options" autocomplete="off" placeholder="npr. Evro dizel" />
        <datalist id="fuel-type-options">
          @for (option of fuelTypeOptions; track option) {
            <option [value]="option"></option>
          }
        </datalist>
      </label>

      <label class="block">
        <span class="field-label">Datum i vreme *</span>
        <input formControlName="date" type="datetime-local" class="field-input" />
      </label>

      <div class="grid grid-cols-3 gap-2">
        <label class="block">
          <span class="field-label">Litara *</span>
          <input formControlName="liters" type="number" inputmode="decimal" step="0.01" min="0" class="field-input font-mono" (change)="autofill('liters')" />
        </label>
        <label class="block">
          <span class="field-label">Cena/L</span>
          <input formControlName="price_per_l" type="number" inputmode="decimal" step="0.01" min="0" class="field-input font-mono" (change)="autofill('price_per_l')" />
        </label>
        <label class="block">
          <span class="field-label">Ukupno *</span>
          <input formControlName="total" type="number" inputmode="decimal" step="0.01" min="0" class="field-input font-mono" (change)="autofill('total')" />
        </label>
      </div>

      <label class="block">
        <span class="field-label">Kilometraža (opciono)</span>
        <input
          formControlName="odometer_km"
          type="number"
          inputmode="numeric"
          step="1"
          min="0"
          class="field-input font-mono"
          placeholder="npr. 125400"
        />
        <span class="block text-[10px] text-slate-500 mt-1">Stanje km-sata - koristi se za potrošnju L/100km.</span>
      </label>

      <div class="flex gap-3 pt-1">
        <button
          type="button"
          [disabled]="busy()"
          (click)="cancelled.emit()"
          class="flex-1 bg-slate-700 hover:bg-slate-600 font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-40"
        >
          {{ cancelLabel() }}
        </button>
        <button
          type="submit"
          [disabled]="busy() || !valid()"
          class="flex-1 bg-fuel-600 hover:bg-fuel-500 font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-40"
        >
          {{ busy() ? 'Čuvam...' : submitLabel() }}
        </button>
      </div>
    </form>
  `,
})
export class ReceiptFormComponent implements OnInit {
  readonly initial = input<Partial<ReceiptFormValue> | null>(null);
  readonly submitLabel = input('Sačuvaj');
  readonly cancelLabel = input('Odbaci');
  readonly busy = input(false);
  readonly warning = input<string | null>(null);
  readonly showNickname = input(false);

  readonly submitted = output<ReceiptFormValue>();
  readonly cancelled = output<void>();

  readonly fuelTypeOptions = ['Evro dizel', 'BMB 95', 'BMB 100', 'TNG', 'CNG'];

  readonly form = new FormGroup({
    station: new FormControl<string>('', { nonNullable: true }),
    address: new FormControl<string>('', { nonNullable: true }),
    city: new FormControl<string>('', { nonNullable: true }),
    fuel_type: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    date: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    liters: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    price_per_l: new FormControl<number | null>(null, [Validators.min(0)]),
    total: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    odometer_km: new FormControl<number | null>(null, [Validators.min(0)]),
    nickname: new FormControl<string>('', { nonNullable: true }),
  });

  private readonly status = signal(this.form.status);
  readonly valid = computed(() => this.status() === 'VALID');

  ngOnInit(): void {
    const init = this.initial();
    if (init) {
      this.form.patchValue({
        station: init.station ?? '',
        address: init.address ?? '',
        city: init.city ?? '',
        fuel_type: init.fuel_type ?? '',
        date: toDateTimeLocal(init.date ?? null),
        liters: init.liters ?? null,
        price_per_l: init.price_per_l ?? null,
        total: init.total ?? null,
        odometer_km: init.odometer_km ?? null,
        nickname: init.nickname ?? '',
      });
    } else {
      this.form.patchValue({ date: toDateTimeLocal(new Date().toISOString()) });
    }
    this.status.set(this.form.status);
    this.form.statusChanges.subscribe((s) => this.status.set(s));
  }

  /** Kad su poznata dva od tri broja, izračunaj treći. */
  autofill(changed: NumberField): void {
    const { liters, price_per_l, total } = this.form.getRawValue();
    const has = (v: number | null): v is number => typeof v === 'number' && v > 0;

    if (has(liters) && has(price_per_l) && (!has(total) || changed !== 'total')) {
      this.form.controls.total.setValue(roundTo2(liters * price_per_l));
    } else if (has(liters) && has(total) && !has(price_per_l)) {
      this.form.controls.price_per_l.setValue(roundTo2(total / liters));
    } else if (has(price_per_l) && has(total) && !has(liters)) {
      this.form.controls.liters.setValue(roundTo2(total / price_per_l));
    }
  }

  submit(): void {
    if (!this.valid()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const text = (s: string) => s.trim() || null;
    const num = (n: number | null) => (typeof n === 'number' && !Number.isNaN(n) ? n : null);

    this.submitted.emit({
      station: text(v.station),
      address: text(v.address),
      city: text(v.city),
      fuel_type: text(v.fuel_type),
      liters: roundTo2(num(v.liters)),
      price_per_l: roundTo2(num(v.price_per_l)),
      total: roundTo2(num(v.total)),
      date: fromDateTimeLocal(v.date),
      odometer_km: num(v.odometer_km) === null ? null : Math.round(v.odometer_km as number),
      // Nadimak se šalje SAMO ako ga je korisnik dirao - prazno, nedirnuto polje
      // (npr. ručni unos za stanicu koja već ima nadimak) ne sme da ga obriše.
      ...(this.showNickname() && this.form.controls.nickname.dirty ? { nickname: text(v.nickname) } : {}),
    });
  }
}

/** ISO / SDC datum -> "YYYY-MM-DDTHH:mm" u lokalnom vremenu za `<input type="datetime-local">`. */
export function toDateTimeLocal(value: string | null): string {
  if (!value) return '';
  const iso = parseLocalReceiptDate(value);
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" (vreme u Srbiji) -> ISO sa zonom Europe/Belgrade. */
export function fromDateTimeLocal(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  return `${y}-${m}-${d}T${hh}:${mm}:00${belgradeOffset(+y, +m, +d, +hh)}`;
}
