import { Component, signal } from '@angular/core';

const DISMISSED_KEY = 'fuelscan.iosInstallHintDismissed';

/** iPhone/iPad (i iPadOS koji se predstavlja kao Mac). */
export function isIosDevice(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { platform?: string } = navigator): boolean {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

/** Aplikacija je već otvorena sa početnog ekrana (instalirana). */
export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Jednokratan savet za iPhone: iOS (za razliku od Android-a) ne nudi sam
 * instalaciju web aplikacije - mora preko "Podeli -> Dodaj na početni ekran".
 * Prikazuje se samo na iPhone-u/iPad-u, dok aplikacija nije instalirana i dok
 * ga korisnik ne zatvori.
 */
@Component({
  selector: 'app-ios-install-hint',
  standalone: true,
  template: `
    @if (visible()) {
      <div class="mx-4 mt-3 bg-surface-card border border-fuel-500/30 rounded-xl px-4 py-3 flex items-start gap-3" role="note">
        <span class="text-xl leading-none mt-0.5" aria-hidden="true">📲</span>
        <div class="flex-1 min-w-0 text-xs text-slate-300">
          <p class="font-semibold text-white text-sm">Instalirajte FuelScan</p>
          <p class="mt-0.5">
            Dodirnite <strong>Podeli</strong>
            <span class="inline-block align-[-2px] mx-0.5" aria-hidden="true">⬆️</span>
            pa <strong>„Dodaj na početni ekran“</strong> - aplikacija se onda otvara preko celog ekrana, kao prava.
          </p>
        </div>
        <button type="button" (click)="dismiss()" class="text-slate-500 hover:text-slate-200 text-sm px-1" aria-label="Zatvori savet">✕</button>
      </div>
    }
  `,
})
export class IosInstallHintComponent {
  readonly visible = signal(isIosDevice() && !isStandalone() && !wasDismissed());

  dismiss(): void {
    this.visible.set(false);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Bez storage-a savet se samo ponovo pojavi sledeći put.
    }
  }
}
