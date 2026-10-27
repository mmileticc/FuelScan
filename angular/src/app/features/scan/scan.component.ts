import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';

import { ParsedReceipt, ReceiptErrorKind, ReceiptScanError } from '../../core/models/receipt.model';
import { cropCenter, detectQr, detectQrFromFile, warmUpQrDetector } from '../../core/scanner/qr-detector';
import { OfflineQueueService } from '../../core/services/offline-queue.service';
import { ReceiptService } from '../../core/services/receipt.service';
import { ToastService } from '../../core/services/toast.service';
import { isSufReceiptUrl } from '../../core/utils/receipt-parsing.utils';
import { ReceiptFormComponent, ReceiptFormValue } from '../../shared/receipt-form/receipt-form.component';

type ScanStatusType = 'idle' | 'loading' | 'success' | 'warning' | 'error';

interface ScanStatus {
  message: string;
  type: ScanStatusType;
}

/** `torch`/`zoom` nisu (svuda) u TS DOM tipovima. */
interface ExtendedCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
  focusMode?: string[];
}

/** Deo kraće stranice kadra koji pokriva okvir-vodič na ekranu (isti udeo se dekodira). */
const GUIDE_FRACTION = 0.7;
/** Minimalni razmak između dva pokušaja dekodiranja žive slike (~8/s). */
const DETECT_INTERVAL_MS = 120;

/**
 * Ekran za skeniranje.
 *
 * Kamera skenira KONTINUALNO - nema okidanja: svakih ~120ms se dekodira
 * centralni deo kadra (unutar okvira-vodiča) u punoj rezoluciji kamere, a
 * svaki treći put ceo kadar. Dekoder je nativni `BarcodeDetector` gde postoji,
 * inače ZXing WASM (vidi `core/scanner/qr-detector.ts`).
 *
 * Rezervni putevi:
 *   - "Fotografiši" otvara SISTEMSKU kameru telefona (`capture="environment"`)
 *     sa pravim autofokusom/stabilizacijom - fotografija se dekodira lokalno.
 *   - Galerija (postojeća slika).
 *   - Ručni unos (bez QR koda / kad Poreska uprava ne odgovara).
 *
 * Bez interneta skenirani URL ide u lokalni red ("Na čekanju") i obrađuje se
 * kasnije, uz pregled pre čuvanja.
 */
@Component({
  selector: 'app-scan',
  standalone: true,
  imports: [ReceiptFormComponent, DatePipe],
  template: `
    <section class="flex flex-col pb-4">
      @if (mode() === 'camera') {
        <div
          class="camera-viewport relative w-full aspect-[3/4] max-h-[52vh] overflow-hidden bg-slate-900 shrink-0"
          [class.scanning-active]="cameraActive()"
        >
          <video
            #videoPreview
            class="camera-preview w-full h-full object-cover"
            [class.hidden]="!cameraActive() || !!imagePreviewUrl()"
            autoplay
            muted
            playsinline
          ></video>

          @if (imagePreviewUrl()) {
            <img [src]="imagePreviewUrl()" alt="Uslikani račun" class="absolute inset-0 w-full h-full object-contain bg-black" />
          }

          @if (cameraActive() && !imagePreviewUrl()) {
            <div class="scan-guide pointer-events-none" aria-hidden="true"></div>
            <p class="absolute bottom-3 inset-x-0 text-center text-[11px] text-white/80 px-6">
              Usmerite ka QR kodu - prepoznaje se automatski
            </p>
          }

          @if (!cameraActive() && !imagePreviewUrl()) {
            <div class="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-3 px-6 text-center">
              <img src="assets/camera-off-icon.svg" alt="" class="w-10 h-10 opacity-60" />
              <p class="text-sm">Kamera je isključena</p>
              <button type="button" (click)="startCamera()" class="text-xs bg-fuel-600 hover:bg-fuel-500 text-white px-4 py-2 rounded-lg">
                Uključi kameru
              </button>
            </div>
          }

          <div class="absolute top-3 right-3 z-20 flex flex-col gap-2">
            <button
              type="button"
              (click)="toggleCamera()"
              class="cam-btn"
              [attr.aria-label]="cameraActive() ? 'Isključi kameru' : 'Uključi kameru'"
            >
              <img [src]="cameraActive() ? 'assets/camera-icon.svg' : 'assets/camera-off-icon.svg'" alt="" class="w-5 h-5" />
            </button>
            @if (cameraActive() && torchSupported()) {
              <button
                type="button"
                (click)="toggleTorch()"
                class="cam-btn text-lg leading-none"
                [class.bg-amber-400]="torchOn()"
                [attr.aria-pressed]="torchOn()"
                aria-label="Blic"
              >
                ⚡
              </button>
            }
          </div>

          @if (cameraActive() && zoomRange(); as z) {
            <div class="absolute left-4 right-16 top-4 z-20 flex items-center gap-2 bg-black/40 backdrop-blur-md rounded-full px-3 py-1.5">
              <span class="text-[10px] text-white/80 font-mono w-8">{{ zoom().toFixed(1) }}×</span>
              <input
                type="range"
                class="flex-1 accent-sky-400"
                [min]="z.min"
                [max]="z.max"
                [step]="z.step"
                [value]="zoom()"
                (input)="setZoom($any($event.target).valueAsNumber)"
                aria-label="Zum"
              />
            </div>
          }
        </div>

        <p class="text-center text-xs py-2 px-4" [class]="statusClass()">{{ scanStatus().message }}</p>

        <div class="flex items-center justify-center gap-6 px-6 shrink-0">
          <label class="scan-action">
            <img src="assets/gallery-icon.svg" alt="" class="w-7 h-7" />
            <span>Galerija</span>
            <input type="file" accept="image/*" (change)="onFileSelected($event)" class="hidden" />
          </label>

          <label class="flex flex-col items-center gap-1 cursor-pointer" [class.opacity-40]="busy()">
            <span class="btn-capture w-16 h-16 bg-white rounded-full border-4 border-slate-600 flex items-center justify-center">
              <img src="assets/camera-icon.svg" alt="" class="w-6 h-6 invert" />
            </span>
            <span class="text-[11px] text-slate-300">Fotografiši</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              [disabled]="busy()"
              (change)="onFileSelected($event)"
              class="hidden"
            />
          </label>

          <button type="button" class="scan-action" (click)="openManualEntry()">
            <span class="text-2xl leading-7">✎</span>
            <span>Ručno</span>
          </button>
        </div>

        @if (queue.items().length) {
          <div class="mx-4 mt-4 bg-surface-card border border-surface-border rounded-2xl p-4 space-y-2">
            <p class="text-xs uppercase tracking-wider text-slate-400 font-semibold">
              Na čekanju ({{ queue.items().length }})
              @if (!queue.online()) {
                <span class="normal-case text-amber-400 font-normal"> · nema interneta</span>
              }
            </p>
            @for (item of queue.items(); track item.url) {
              <div class="flex items-center justify-between gap-2 text-sm">
                <span class="text-slate-300 text-xs">Skenirano {{ item.scannedAt | date: 'd.M.y. HH:mm' }}</span>
                <div class="flex gap-2 shrink-0">
                  <button type="button" class="text-xs text-slate-400 hover:text-red-400 px-2 py-1" (click)="queue.remove(item.url)">Ukloni</button>
                  <button
                    type="button"
                    class="text-xs bg-fuel-600 hover:bg-fuel-500 disabled:opacity-40 px-3 py-1 rounded-lg"
                    [disabled]="!queue.online() || busy()"
                    (click)="processQueued(item.url)"
                  >
                    Obradi
                  </button>
                </div>
              </div>
            }
          </div>
        }
      }

      @if (resultState() === 'loading') {
        <div class="mx-4 my-4 bg-surface-card border border-surface-border rounded-2xl p-5 flex flex-col items-center gap-3">
          <div class="w-8 h-8 border-4 border-fuel-900 border-t-fuel-400 rounded-full animate-spin"></div>
          <p class="text-slate-400 text-sm animate-pulse">{{ scanStatus().message }}</p>
        </div>
      }

      @if (resultState() === 'error') {
        <div
          class="mx-4 my-4 border rounded-2xl p-5 text-center space-y-3"
          [class]="isRetryableError() ? 'bg-amber-500/10 border-amber-500/30' : 'bg-surface-card border-surface-border'"
        >
          <p class="font-semibold" [class]="isRetryableError() ? 'text-amber-400' : 'text-red-400'">{{ errorTitle() }}</p>
          <p class="text-slate-400 text-sm">{{ errorMessage() }}</p>
          <div class="flex gap-2">
            <button type="button" (click)="resetScan()" class="flex-1 bg-slate-700 hover:bg-slate-600 font-semibold py-2.5 rounded-xl text-sm">
              Skeniraj drugi
            </button>
            @if (isRetryableError()) {
              <button type="button" (click)="retryLastScan()" class="flex-1 bg-fuel-600 hover:bg-fuel-500 font-semibold py-2.5 rounded-xl text-sm">
                Pokušaj ponovo
              </button>
            }
          </div>
          <button type="button" (click)="openManualEntry()" class="text-xs text-fuel-400 hover:text-fuel-300 underline">
            Unesi podatke ručno
          </button>
        </div>
      }

      @if (mode() === 'review' && receipt(); as data) {
        <div class="mx-4 my-4 bg-surface-card border border-surface-border rounded-2xl p-5 space-y-3">
          <div>
            <p class="font-semibold text-base leading-tight">Proverite podatke</p>
            <p class="text-xs text-slate-400 mt-0.5">Sve se može izmeniti pre čuvanja.</p>
          </div>
          <app-receipt-form
            [initial]="formInitial()"
            [busy]="isSaving()"
            [warning]="data.fuel_type ? null : noFuelWarning"
            (submitted)="saveReceipt($event)"
            (cancelled)="discardReceipt()"
          />
        </div>
      }

      @if (mode() === 'manual') {
        <div class="mx-4 my-4 bg-surface-card border border-surface-border rounded-2xl p-5 space-y-3">
          <p class="font-semibold text-base">Ručni unos točenja</p>
          <app-receipt-form [busy]="isSaving()" cancelLabel="Nazad" (submitted)="saveReceipt($event)" (cancelled)="resetScan()" />
        </div>
      }
    </section>
  `,
})
export class ScanComponent implements AfterViewInit, OnDestroy {
  private readonly receiptService = inject(ReceiptService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly queue = inject(OfflineQueueService);

  @ViewChild('videoPreview') private videoRef?: ElementRef<HTMLVideoElement>;

  readonly noFuelWarning =
    'Na računu nije pronađeno gorivo. Ako jeste račun za gorivo, upišite vrstu goriva i litre ručno - u suprotnom ga odbacite.';

  private cameraStream: MediaStream | null = null;
  private destroyed = false;
  private loopActive = false;
  private frameCounter = 0;
  private lastAttempt = 0;
  private lastRejectedValue: string | null = null;
  private readonly cropCanvas = document.createElement('canvas');
  private readonly onVisibilityChange = () => this.handleVisibilityChange();

  readonly mode = signal<'camera' | 'review' | 'manual'>('camera');
  readonly cameraActive = signal(false);
  readonly torchSupported = signal(false);
  readonly torchOn = signal(false);
  readonly zoomRange = signal<{ min: number; max: number; step: number } | null>(null);
  readonly zoom = signal(1);
  readonly imagePreviewUrl = signal<string | null>(null);
  readonly scanStatus = signal<ScanStatus>({ message: 'Spreman za skeniranje', type: 'idle' });
  readonly resultState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  readonly receipt = signal<ParsedReceipt | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly errorKind = signal<ReceiptErrorKind>('network');
  readonly isSaving = signal(false);
  readonly busy = computed(() => this.resultState() === 'loading' || this.isSaving());

  readonly formInitial = computed<Partial<ReceiptFormValue> | null>(() => {
    const r = this.receipt();
    return r
      ? {
          station: r.station,
          address: r.address,
          city: r.city,
          fuel_type: r.fuel_type,
          liters: r.liters,
          price_per_l: r.price_per_l,
          total: r.fuel_type ? r.total : null,
          date: r.date,
          odometer_km: null,
        }
      : null;
  });

  /** Poslednji dekodovan URL sa QR koda - omogućava retry BEZ ponovnog skeniranja. */
  private lastScannedUrl: string | null = null;

  constructor() {
    warmUpQrDetector();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  ngAfterViewInit(): void {
    void this.startCamera();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.stopCamera();
  }

  async toggleCamera(): Promise<void> {
    if (this.cameraStream) {
      this.stopCamera();
    } else {
      await this.startCamera();
    }
  }

  async startCamera(): Promise<void> {
    if (this.cameraStream || this.mode() !== 'camera') {
      return;
    }
    this.imagePreviewUrl.set(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      this.scanStatus.set({ message: 'Kamera nije dostupna - koristite "Fotografiši" ili galeriju.', type: 'warning' });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });

      // Korisnik je u međuvremenu napustio ekran ili prešao na pregled.
      if (this.mode() !== 'camera' || this.destroyed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      this.cameraStream = stream;
      const video = this.videoRef?.nativeElement;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      this.cameraActive.set(true);
      await this.configureTrack(stream.getVideoTracks()[0]);
      this.scanStatus.set({ message: 'Usmerite kameru ka QR kodu na dnu računa', type: 'idle' });
      this.startDetectionLoop();
    } catch (err) {
      console.error('[Camera]', err);
      this.cameraActive.set(false);
      this.scanStatus.set({ message: 'Kamera je blokirana - koristite "Fotografiši" ili galeriju.', type: 'warning' });
    }
  }

  stopCamera(): void {
    this.loopActive = false;
    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.cameraStream = null;
    this.cameraActive.set(false);
    this.torchOn.set(false);

    const video = this.videoRef?.nativeElement;
    if (video) {
      video.srcObject = null;
    }
  }

  async toggleTorch(): Promise<void> {
    const track = this.cameraStream?.getVideoTracks()[0];
    if (!track) return;
    const next = !this.torchOn();
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      this.torchOn.set(next);
    } catch {
      this.torchSupported.set(false);
    }
  }

  async setZoom(value: number): Promise<void> {
    const track = this.cameraStream?.getVideoTracks()[0];
    if (!track || Number.isNaN(value)) return;
    this.zoom.set(value);
    await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] }).catch(() => undefined);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      void this.processImage(file);
    }
  }

  openManualEntry(): void {
    this.stopCamera();
    this.resultState.set('idle');
    this.receipt.set(null);
    this.mode.set('manual');
  }

  resetScan(): void {
    this.resultState.set('idle');
    this.receipt.set(null);
    this.errorMessage.set(null);
    this.lastScannedUrl = null;
    this.lastRejectedValue = null;
    this.imagePreviewUrl.set(null);
    this.mode.set('camera');
    this.scanStatus.set({ message: 'Spreman za skeniranje', type: 'idle' });
    // Video element se ponovo pravi kad se vrati 'camera' mod - sačekaj render.
    setTimeout(() => void this.startCamera());
  }

  processQueued(url: string): void {
    this.stopCamera();
    this.handleDecodedText(url);
  }

  statusClass(): string {
    const colors: Record<ScanStatusType, string> = {
      idle: 'text-slate-400',
      loading: 'text-fuel-400 animate-pulse',
      success: 'text-emerald-400',
      warning: 'text-amber-400',
      error: 'text-red-400',
    };
    return colors[this.scanStatus().type];
  }

  isRetryableError(): boolean {
    return this.errorKind() !== 'invalid-url';
  }

  errorTitle(): string {
    return this.errorKind() === 'invalid-url' ? 'Ovo nije fiskalni račun' : 'Nije uspelo ovog puta';
  }

  retryLastScan(): void {
    if (!this.lastScannedUrl) {
      this.resetScan();
      return;
    }
    this.handleDecodedText(this.lastScannedUrl);
  }

  saveReceipt(value: ReceiptFormValue): void {
    if (this.isSaving()) return;

    const base = this.mode() === 'review' ? this.receipt() : null;
    const toSave: ParsedReceipt = {
      status: 'success',
      municipality: base?.municipality ?? null,
      invoice_number: base?.invoice_number ?? null,
      raw_url: base?.raw_url ?? null,
      ...value,
    };

    this.isSaving.set(true);
    this.receiptService
      .saveReceipt$(toSave)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          if (toSave.raw_url) this.queue.remove(toSave.raw_url);
          this.toast.show('Račun je sačuvan!', 'success');
          void this.router.navigate(['/dashboard']);
        },
        error: (err: unknown) => {
          this.isSaving.set(false);
          this.toast.show(err instanceof Error && err.message ? err.message : 'Greška pri čuvanju.', 'error', 4000);
        },
      });
  }

  discardReceipt(): void {
    const url = this.receipt()?.raw_url;
    if (url) this.queue.remove(url);
    this.toast.show('Račun odbačen.', 'info');
    this.resetScan();
  }

  // ---------------------------------------------------------------------------

  private async configureTrack(track: MediaStreamTrack | undefined): Promise<void> {
    if (!track) return;
    const caps = (track.getCapabilities?.() ?? {}) as ExtendedCapabilities;

    if (caps.focusMode?.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined);
    }

    this.torchSupported.set(!!caps.torch);

    if (caps.zoom && caps.zoom.max > caps.zoom.min) {
      const range = { min: caps.zoom.min, max: Math.min(caps.zoom.max, 5), step: caps.zoom.step || 0.1 };
      this.zoomRange.set(range);
      // Blagi zum - korisnik ne mora da prinosi telefon preblizu (gde autofokus ne stiže).
      const initial = Math.min(Math.max(1.5, range.min), range.max);
      await this.setZoom(initial);
    } else {
      this.zoomRange.set(null);
    }
  }

  private startDetectionLoop(): void {
    this.loopActive = true;
    this.frameCounter = 0;
    this.scheduleNextFrame();
  }

  private scheduleNextFrame(): void {
    const video = this.videoRef?.nativeElement;
    if (!this.loopActive || !video) return;
    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(() => void this.detectFrame());
    } else {
      requestAnimationFrame(() => void this.detectFrame());
    }
  }

  private async detectFrame(): Promise<void> {
    const video = this.videoRef?.nativeElement;
    if (!this.loopActive || !video) return;

    const now = performance.now();
    if (now - this.lastAttempt >= DETECT_INTERVAL_MS && video.videoWidth && !document.hidden) {
      this.lastAttempt = now;
      this.frameCounter++;
      const source =
        this.frameCounter % 3 === 0
          ? video
          : cropCenter(video, video.videoWidth, video.videoHeight, GUIDE_FRACTION, 1, this.cropCanvas);

      const value = await detectQr(source);
      if (value && this.loopActive) {
        if (this.onLiveCode(value, video)) return;
      }
    }
    this.scheduleNextFrame();
  }

  /** Vraća `true` ako je kod prihvaćen (petlja staje). */
  private onLiveCode(value: string, video: HTMLVideoElement): boolean {
    if (!isSufReceiptUrl(value)) {
      if (value !== this.lastRejectedValue) {
        this.lastRejectedValue = value;
        this.scanStatus.set({ message: 'Ovo nije QR kod sa fiskalnog računa - skenirajte kod sa dna računa.', type: 'warning' });
      }
      return false;
    }

    navigator.vibrate?.(80);
    // Zamrzni kadar na kom je kod pronađen, da korisnik vidi šta je skenirano.
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    this.imagePreviewUrl.set(canvas.toDataURL('image/jpeg', 0.7));

    this.stopCamera();
    this.handleDecodedText(value);
    return true;
  }

  private handleVisibilityChange(): void {
    // Aplikacija u pozadini - oslobodi kameru (baterija, privatnost); vrati je po povratku.
    if (document.hidden) {
      if (this.cameraStream) this.stopCamera();
    } else if (this.mode() === 'camera' && this.resultState() === 'idle' && !this.imagePreviewUrl()) {
      void this.startCamera();
    }
  }

  private async processImage(file: File): Promise<void> {
    this.stopCamera();
    this.imagePreviewUrl.set(URL.createObjectURL(file));
    this.scanStatus.set({ message: 'Tražim QR kod na slici...', type: 'loading' });

    const value = await detectQrFromFile(file);
    if (!value) {
      this.imagePreviewUrl.set(null);
      this.scanStatus.set({
        message: 'Na slici nije pronađen QR kod. Fotografišite ga bliže, oštro i pri dobrom svetlu.',
        type: 'warning',
      });
      void this.startCamera();
      return;
    }
    this.handleDecodedText(value);
  }

  private handleDecodedText(decodedText: string): void {
    this.lastScannedUrl = decodedText;

    if (isSufReceiptUrl(decodedText) && !navigator.onLine) {
      this.enqueueOffline(decodedText);
      return;
    }

    this.resultState.set('loading');
    this.scanStatus.set({ message: 'Analiziram račun...', type: 'loading' });

    this.receiptService
      .scanReceipt$(decodedText, (attempt, maxAttempts) => {
        this.scanStatus.set({
          message: `Poreska uprava sporije odgovara - pokušavam ponovo (${attempt}/${maxAttempts})...`,
          type: 'loading',
        });
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (parsedReceipt) => {
          this.receipt.set(parsedReceipt);
          this.resultState.set('success');
          this.mode.set('review');
          this.scanStatus.set({ message: 'Račun pronađen - proverite podatke', type: 'success' });
        },
        error: (err: unknown) => {
          const kind = err instanceof ReceiptScanError ? err.kind : 'network';
          if (kind === 'network' && !navigator.onLine) {
            this.enqueueOffline(decodedText);
            return;
          }
          this.resultState.set('error');
          this.errorKind.set(kind);
          this.errorMessage.set(this.friendlyErrorMessage(kind));
          this.scanStatus.set({ message: 'Nije uspelo ovog puta.', type: 'warning' });
        },
      });
  }

  private enqueueOffline(url: string): void {
    const added = this.queue.add(url);
    this.toast.show(
      added ? 'Nema interneta - račun je sačuvan za kasniju obradu.' : 'Ovaj račun je već na čekanju.',
      'info',
      4000,
    );
    this.resetScan();
  }

  private friendlyErrorMessage(kind: ReceiptErrorKind): string {
    switch (kind) {
      case 'invalid-url':
        return 'Ovo ne izgleda kao QR kod sa fiskalnog računa. Skenirajte kod sa dna računa.';
      case 'parse-failed':
      case 'tax-authority-empty':
        return 'Poreska uprava ponekad sporije odgovori na prvi upit za novi račun. Sačekajte par sekundi i pokušajte ponovo.';
      case 'rate-limited':
        return 'Previše pokušaja u kratkom roku. Sačekajte minut pa pokušajte ponovo.';
      case 'network':
      default:
        return 'Trenutno ne možemo da se povežemo sa Poreskom upravom. Proverite internet konekciju i pokušajte ponovo.';
    }
  }
}
