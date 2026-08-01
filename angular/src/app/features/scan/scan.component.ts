import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Html5Qrcode } from 'html5-qrcode';

import { ParsedReceipt, ReceiptErrorKind, ReceiptScanError } from '../../core/models/receipt.model';
import { ReceiptService } from '../../core/services/receipt.service';
import { ToastService } from '../../core/services/toast.service';

type ScanStatusType = 'idle' | 'loading' | 'success' | 'warning' | 'error';

interface ScanStatus {
  message: string;
  type: ScanStatusType;
}

/**
 * Standalone rekonstrukcija kamere/skenera iz `old-vanilla/js/scanner.js`
 * + `old-vanilla/js/ui/scan.js`, prilagođena Angular 18+ standalone/signals
 * pristupu (umesto ručne manipulacije DOM-om preko `document.getElementById`).
 *
 * Tok je identičan starom:
 *   1. Kamera (getUserMedia, automatski upaljena pri ulasku na ekran, tačno
 *      kao stari `setTimeout(() => startCamera(), 50)` u `bindNavigation`)
 *      ili upload slike / snimak sa kamere.
 *   2. QR kod se dekodira lokalno preko `html5-qrcode` (Html5Qrcode.scanFile).
 *   3. Dekodovan URL se prosleđuje `ReceiptService.scanReceipt$()`, koji radi
 *      fetch preko proxy-ja + POST /specifications (umesto starog
 *      `POST /parse-receipt` ka Playwright backend-u) i vraća parsiran
 *      račun NA PREGLED - upis u Supabase se dešava tek kad korisnik klikne
 *      "Sačuvaj" (isti "Sačuvaj"/"Odbaci" tok kao stari `window.__pendingReceipt`).
 *
 * Layout napomena: kamera ima OGRANIČENU visinu (aspect-ratio + max-h-[48vh])
 * umesto da flex-1 puni ceo ekran - inače bi na malim ekranima gurala status
 * tekst/dugmad/rezultat van vidljive oblasti i sekcija se ne bi lepo skrolovala.
 *
 * Laserska animacija preko kamere (`.scanning-active` klasa, vidi
 * `isScanningVisualActive()`) radi samo dok je kamera upaljena ili dok se
 * uslikana/uploadovana slika stvarno obrađuje - ne vrti se stalno bez razloga.
 */
@Component({
  selector: 'app-scan',
  standalone: true,
  template: `
    <section class="flex flex-col pb-4">
      <div id="qr-reader" class="qr-reader-hidden"></div>

      <div
        class="camera-viewport relative w-full aspect-[3/4] max-h-[48vh] overflow-hidden bg-slate-900 shrink-0"
        [class.scanning-active]="isScanningVisualActive()"
      >
        <button
          type="button"
          (click)="toggleCamera()"
          class="absolute top-4 right-4 z-50 bg-black/40 backdrop-blur-md p-3 rounded-full border border-white/20 hover:bg-black/60 transition flex items-center justify-center"
        >
          <img
            [src]="cameraActive() ? 'assets/camera-icon.svg' : 'assets/camera-off-icon.svg'"
            alt="Kamera"
            class="w-5 h-5"
          />
        </button>

        @if (!cameraActive() && !imagePreviewUrl()) {
          <div class="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-2">
            <img src="assets/camera-off-icon.svg" alt="Kamera isključena" class="w-10 h-10 opacity-60" />
            <p class="text-sm">Kamera je isključena</p>
          </div>
        }

        <video
          #videoPreview
          class="camera-preview w-full h-full object-cover"
          [class.hidden]="!cameraActive() || !!imagePreviewUrl()"
          autoplay
          playsinline
        ></video>

        @if (imagePreviewUrl()) {
          <div class="w-full h-full">
            <img [src]="imagePreviewUrl()" alt="Uslikani račun" class="w-full h-full object-contain" />
          </div>
        }
      </div>

      <p class="text-center text-xs py-2 px-4" [class]="statusClass()">
        {{ scanStatus().message }}
      </p>

      <div class="h-24 flex items-center justify-center relative px-8 shrink-0">
        <button
          type="button"
          [disabled]="!cameraActive() || resultState() === 'loading' || isCapturing()"
          (click)="capturePhoto()"
          class="btn-capture w-16 h-16 bg-white rounded-full border-4 border-slate-600 hover:scale-105 transition-transform disabled:opacity-40 disabled:hover:scale-100"
        ></button>

        <label class="absolute right-8 cursor-pointer p-3 rounded-full hover:bg-slate-800 transition">
          <img src="assets/gallery-icon.svg" alt="Galerija" class="w-8 h-8" />
          <input type="file" accept="image/*" (change)="onFileSelected($event)" class="hidden" />
        </label>
      </div>

      @if (resultState() === 'loading') {
        <div class="mx-4 mb-4 bg-surface-card border border-surface-border rounded-2xl p-5 flex flex-col items-center gap-3">
          <div class="w-8 h-8 border-4 border-fuel-900 border-t-fuel-400 rounded-full animate-spin"></div>
          <p class="text-slate-400 text-sm animate-pulse">Analiziram račun...</p>
        </div>
      }

      @if (resultState() === 'error') {
        <div
          class="mx-4 mb-4 border rounded-2xl p-5 text-center space-y-3"
          [class]="isRetryableError() ? 'bg-amber-500/10 border-amber-500/30' : 'bg-surface-card border-surface-border'"
        >
          <p class="font-semibold" [class]="isRetryableError() ? 'text-amber-400' : 'text-red-400'">
            {{ errorTitle() }}
          </p>
          <p class="text-slate-400 text-sm">{{ errorMessage() }}</p>

          @if (isRetryableError()) {
            <div class="flex gap-3">
              <button
                type="button"
                (click)="resetScan()"
                class="flex-1 bg-slate-700 hover:bg-slate-600 font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                Skeniraj drugi račun
              </button>
              <button
                type="button"
                (click)="retryLastScan()"
                class="flex-1 bg-fuel-600 hover:bg-fuel-500 font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                Pokušaj ponovo
              </button>
            </div>
          } @else {
            <button
              type="button"
              (click)="resetScan()"
              class="w-full bg-slate-700 hover:bg-slate-600 font-semibold py-2.5 rounded-xl transition-colors"
            >
              Skeniraj ponovo
            </button>
          }
        </div>
      }

      @if (resultState() === 'success' && receipt(); as data) {
        <div class="mx-4 mb-4 bg-surface-card border border-surface-border rounded-2xl p-5 space-y-3">
          <div class="flex items-start justify-between">
            <div class="flex-1 pr-2">
              <p class="font-semibold text-base leading-tight">{{ data.station ?? 'Nepoznata stanica' }}</p>
              <p class="text-xs text-slate-400 mt-0.5">{{ getLocationText(data) }}</p>
            </div>
            <span class="bg-fuel-900 text-fuel-300 text-xs font-medium px-2 py-1 rounded-lg shrink-0">{{ data.fuel_type ?? '—' }}</span>
          </div>
          <div class="border-t border-surface-border pt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p class="text-xs text-slate-400 mb-1">Litara</p>
              <p class="text-xl font-bold font-mono">{{ data.liters ?? '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-slate-400 mb-1">Cena/L</p>
              <p class="text-xl font-bold font-mono">{{ data.price_per_l ?? '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-slate-400 mb-1">Ukupno</p>
              <p class="text-xl font-bold font-mono text-fuel-400">{{ data.total ?? '—' }}</p>
            </div>
          </div>
          <div class="flex gap-3">
            <button
              type="button"
              [disabled]="isSaving()"
              (click)="discardReceipt()"
              class="flex-1 bg-slate-700 hover:bg-slate-600 font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-40"
            >
              Odbaci
            </button>
            <button
              type="button"
              [disabled]="isSaving()"
              (click)="saveReceipt()"
              class="flex-1 bg-fuel-600 hover:bg-fuel-500 font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60"
            >
              {{ isSaving() ? 'Čuvam...' : 'Sačuvaj' }}
            </button>
          </div>
        </div>
      }
    </section>
  `,
})
export class ScanComponent implements OnInit, OnDestroy {
  private readonly receiptService = inject(ReceiptService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  @ViewChild('videoPreview') private videoRef?: ElementRef<HTMLVideoElement>;

  private cameraStream: MediaStream | null = null;
  private fileQrScanner: Html5Qrcode | null = null;

  readonly cameraActive = signal(false);
  readonly imagePreviewUrl = signal<string | null>(null);
  readonly scanStatus = signal<ScanStatus>({ message: 'Spreman za skeniranje', type: 'idle' });
  readonly resultState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  readonly receipt = signal<ParsedReceipt | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly errorKind = signal<ReceiptErrorKind>('network');
  readonly isSaving = signal(false);
  /** `true` dok traje burst snimanje na klik dugmeta (vidi `capturePhoto`) - blokira dupli tap. */
  readonly isCapturing = signal(false);

  /**
   * Burst podešavanja za `capturePhoto()`. Jedan frejm iz `getUserMedia` live
   * stream-a je fundamentalno manje pouzdan od jedne native still-photo
   * fotografije (nema AF/AE lock ni stabilizaciju posvećenu tom kadru) - zato
   * se posle klika ne uzima samo JEDAN frejm, nego se proba više njih zaredom
   * dok jedan ne uspe da se dekoduje kao QR.
   */
  private readonly burstFrameCount = 6;
  private readonly burstIntervalMs = 120;
  /** Pauza PRE prvog frejma - sam dodir ekrana unese mikro-trešnju u ruci, ovo joj da vremena da se smiri. */
  private readonly burstStartDelayMs = 300;

  /** Poslednji dekodovan URL sa QR koda - omogućava retry BEZ ponovnog skeniranja. */
  private readonly lastScannedUrl = signal<string | null>(null);

  /**
   * Laserska animacija preko kamere se pali SAMO dok je nešto zaista aktivno
   * (kamera radi, ili je slika uhvaćena/uploadovana i stvarno se obrađuje) -
   * ne treba da se vrti stalno bez razloga.
   */
  isScanningVisualActive(): boolean {
    return this.cameraActive() || this.resultState() === 'loading';
  }

  ngOnInit(): void {
    // Isto ponašanje kao stari `setTimeout(() => startCamera(), 50)` pri ulasku na scan ekran.
    setTimeout(() => void this.startCamera(), 50);
  }

  ngOnDestroy(): void {
    this.stopCamera();
    this.disposeFileScanner();
  }

  async toggleCamera(): Promise<void> {
    if (this.cameraStream) {
      this.stopCamera();
    } else {
      await this.startCamera();
    }
  }

  async startCamera(): Promise<void> {
    if (this.cameraStream) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.scanStatus.set({ message: 'Kamera nije dostupna. Koristi učitavanje slike.', type: 'warning' });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      this.cameraStream = stream;
      if (this.videoRef) {
        this.videoRef.nativeElement.srcObject = stream;
      }
      this.cameraActive.set(true);
      this.scanStatus.set({ message: 'Kamera je spremna - usmerite ka QR kodu', type: 'success' });
    } catch (err) {
      console.error('[Camera]', err);
      this.cameraActive.set(false);
      this.scanStatus.set({ message: 'Kamera je blokirana. Učitavanje iz fajla radi.', type: 'warning' });
    }
  }

  stopCamera(): void {
    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.cameraStream = null;
    this.cameraActive.set(false);

    if (this.videoRef) {
      this.videoRef.nativeElement.srcObject = null;
    }
  }

  /**
   * Umesto da uzme TAČNO JEDAN frejm u trenutku klika (kao ranije - previše
   * osetljivo na tresenje ruke i autofocus koji baš tada "luta"), uzima kratki
   * burst frejmova iz live kamere i probava dekodovanje na svakom dok jedan
   * ne uspe. Svaki frejm i dalje ide u punoj `video.videoWidth`/`videoHeight`
   * rezoluciji (ne CSS prikazanoj veličini kontejnera).
   */
  async capturePhoto(): Promise<void> {
    const video = this.videoRef?.nativeElement;
    if (!this.cameraStream || !video?.videoWidth) {
      this.scanStatus.set({ message: 'Kamera nije aktivna!', type: 'error' });
      return;
    }
    if (this.isCapturing()) {
      return;
    }

    this.isCapturing.set(true);
    this.scanStatus.set({ message: 'Slikam - drži mirno...', type: 'loading' });

    // Mala pauza posle tapa - sam dodir ekrana unese mikro-trešnju, ovo joj
    // da vremena da se smiri pre nego što uzmemo prvi frejm iz burst-a.
    await this.delay(this.burstStartDelayMs);

    for (let attempt = 0; attempt < this.burstFrameCount; attempt++) {
      // Kamera je u međuvremenu ugašena (npr. korisnik je otišao sa ekrana ili kliknuo toggle) - prekini.
      if (!this.cameraStream || !video.videoWidth) {
        break;
      }

      const file = await this.grabFrame(video);
      if (!file) {
        continue;
      }

      this.scanStatus.set({
        message: `Tražim QR kod... (${attempt + 1}/${this.burstFrameCount})`,
        type: 'loading',
      });

      try {
        const decodedText = await this.scanQrFromBlob(file);
        this.isCapturing.set(false);
        this.showImagePreview(file);
        this.stopCamera();
        this.handleDecodedText(decodedText);
        return;
      } catch {
        // Ovaj frejm nije dao QR - probaj sledeći frejm iz burst-a bez prekidanja.
      }

      if (attempt < this.burstFrameCount - 1) {
        await this.delay(this.burstIntervalMs);
      }
    }

    // Nijedan frejm iz burst-a nije dao QR kod - vrati se na live kameru
    // (namerno NE prikazujemo poslednji neuspeli frejm kao "zaleđenu" sliku,
    // korisnik odmah vidi živu kameru i može odmah ponovo da pokuša).
    this.isCapturing.set(false);
    this.scanStatus.set({
      message: 'Nije pronađen QR kod. Pokušajte ponovo, malo bliže i sa boljim osvetljenjem.',
      type: 'warning',
    });
  }

  /** Uzima JEDAN frejm iz live videa u punoj (native) rezoluciji kamere, ne CSS prikazanoj veličini. */
  private grabFrame(video: HTMLVideoElement): Promise<File | null> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], 'snapshot.jpg', { type: 'image/jpeg' }) : null);
      }, 'image/jpeg');
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.showImagePreview(file);
    void this.processImage(file);
    input.value = '';
  }

  resetScan(): void {
    this.resultState.set('idle');
    this.receipt.set(null);
    this.errorMessage.set(null);
    this.lastScannedUrl.set(null);
    this.imagePreviewUrl.set(null);
    this.scanStatus.set({ message: 'Spreman za skeniranje', type: 'idle' });
    void this.startCamera();
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

  /** Pomoćna metoda za template (Angular template binding ne dozvoljava arrow funkcije/lambda izraze). */
  getLocationText(receipt: ParsedReceipt): string {
    return [receipt.address, receipt.city].filter((value): value is string => !!value).join(', ') || 'Nepoznata lokacija';
  }

  private showImagePreview(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => this.imagePreviewUrl.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  private async processImage(file: File): Promise<void> {
    try {
      this.scanStatus.set({ message: 'Tražim QR kod na slici...', type: 'loading' });
      this.resultState.set('loading');

      const decodedText = await this.scanQrFromBlob(file);
      this.stopCamera();
      this.handleDecodedText(decodedText);
    } catch (err) {
      this.resultState.set('idle');
      this.imagePreviewUrl.set(null);
      // 'warning', ne 'error' - ovo je često i bezazleno (loše osvetljenje,
      // zamućena slika), ne treba da deluje kao ozbiljan kvar.
      this.scanStatus.set({
        message: err instanceof Error ? err.message : 'Nije pronađen QR. Pokušajte ponovo.',
        type: 'warning',
      });
    }
  }

  private handleDecodedText(decodedText: string): void {
    this.lastScannedUrl.set(decodedText);
    this.resultState.set('loading');
    this.scanStatus.set({ message: 'Analiziram račun...', type: 'loading' });

    this.receiptService
      .scanReceipt$(decodedText, (attempt, maxAttempts) => {
        // Korisnik vidi da se nešto dešava umesto da gleda u tih spiner i
        // posumnja da je aplikacija zaglavljena.
        this.scanStatus.set({
          message: `Poreska uprava malo sporije odgovara - pokušavam ponovo (${attempt}/${maxAttempts})...`,
          type: 'loading',
        });
      })
      .subscribe({
        next: (parsedReceipt) => {
          this.receipt.set(parsedReceipt);
          this.resultState.set('success');
          this.scanStatus.set({ message: 'Račun pronađen - proverite podatke', type: 'success' });
        },
        error: (err: unknown) => {
          const scanError = err instanceof ReceiptScanError ? err : null;
          const kind = scanError?.kind ?? 'network';

          this.resultState.set('error');
          this.errorKind.set(kind);
          this.errorMessage.set(this.friendlyErrorMessage(kind));
          this.scanStatus.set({ message: 'Nije uspelo ovog puta.', type: 'warning' });
        },
      });
  }

  /**
   * Ljudski, smiren opis greške po kategoriji - namerno bez sirovih HTTP/tehničkih
   * poruka za slučajeve koji nisu korisnikova krivica (skoro uvek se rešavaju
   * samim retry-jem).
   */
  private friendlyErrorMessage(kind: ReceiptErrorKind): string {
    switch (kind) {
      case 'invalid-url':
        return 'Ovo ne izgleda kao QR kod sa fiskalnog računa za gorivo. Proverite da li ste skenirali kod sa dna računa.';
      case 'parse-failed':
      case 'tax-authority-empty':
        return 'Poreska uprava ponekad malo sporije odgovori na prvi upit za novi račun. Sačekajte par sekundi i pokušajte ponovo - obično odmah uspe.';
      case 'network':
      default:
        return 'Trenutno ne možemo da se povežemo sa Poreskom upravom. Proverite internet konekciju i pokušajte ponovo.';
    }
  }

  /** `true` za greške kod kojih retry ima realnog smisla (skoro sve osim pogrešnog QR-a). */
  isRetryableError(): boolean {
    return this.errorKind() !== 'invalid-url';
  }

  errorTitle(): string {
    return this.errorKind() === 'invalid-url' ? 'Ovo nije račun za gorivo' : 'Nije uspelo ovog puta';
  }

  /** Retry BEZ ponovnog skeniranja QR-a - koristi već dekodovan URL. */
  retryLastScan(): void {
    const url = this.lastScannedUrl();
    if (!url) {
      this.resetScan();
      return;
    }
    this.handleDecodedText(url);
  }

  /** Isti trenutak kao stari `btn-save-result` handler - upis se dešava TEK ovde. */
  saveReceipt(): void {
    const pendingReceipt = this.receipt();
    if (!pendingReceipt || this.isSaving()) {
      return;
    }

    this.isSaving.set(true);
    this.receiptService.saveReceipt$(pendingReceipt).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.show('Račun je sačuvan!', 'success');
        this.resetScan();
        void this.router.navigate(['/dashboard']);
      },
      error: (err: Error) => {
        this.isSaving.set(false);
        this.toast.show(err.message || 'Greška pri čuvanju.', 'error');
      },
    });
  }

  /** Isti trenutak kao stari `btn-discard-result` handler - račun se baca, bez upisa. */
  discardReceipt(): void {
    this.toast.show('Račun odbačen.', 'info');
    this.resetScan();
  }

  private getFileQrScanner(): Html5Qrcode {
    if (!this.fileQrScanner) {
      this.fileQrScanner = new Html5Qrcode('qr-reader');
    }
    return this.fileQrScanner;
  }

  private async scanQrFromBlob(file: File): Promise<string> {
    try {
      return await this.getFileQrScanner().scanFile(file, true);
    } catch (err) {
      console.error('[QR Scanner Error]:', err);
      throw new Error('Nije pronađen QR kod. Pokušajte ponovo sa boljim osvetljenjem.');
    }
  }

  private disposeFileScanner(): void {
    if (this.fileQrScanner?.isScanning) {
      this.fileQrScanner.stop().catch(() => undefined);
    }
    this.fileQrScanner = null;
  }
}
