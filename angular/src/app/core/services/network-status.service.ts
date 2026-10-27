import { Injectable, computed, signal } from '@angular/core';

/** Koliko često se pokušava ponovo dok "ima mreže" po browseru, a zahtevi ipak padaju. */
const RETRY_INTERVAL_MS = 20000;

/**
 * Jedino mesto za stanje mreže u aplikaciji.
 *
 * `navigator.onLine` nije dovoljan: sa slabim signalom (pumpa) browser kaže
 * "online", a zahtevi ipak padaju. Zato servisi prijavljuju mrežne greške
 * (`reportFailure`) i uspehe (`reportSuccess`), pa je `online` netačno i tada.
 * Dok traje takav prekid, registrovani "pokušaj ponovo" callback-ovi se
 * pozivaju periodično; kad se browser vrati online - odmah.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly browserOnline = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  private readonly requestsFailing = signal(false);
  private readonly retryCallbacks: Array<() => void> = [];
  private retryTimer?: ReturnType<typeof setInterval>;

  /** `true` samo ako browser ima mrežu I poslednji zahtevi nisu pali zbog mreže. */
  readonly online = computed(() => this.browserOnline() && !this.requestsFailing());

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => {
      this.browserOnline.set(true);
      this.retryNow();
    });
    window.addEventListener('offline', () => this.browserOnline.set(false));
  }

  /** Registruje "pokušaj ponovo" (npr. ponovno učitavanje podataka) kad se veza vrati. */
  onReconnect(callback: () => void): void {
    this.retryCallbacks.push(callback);
  }

  /** Zahtev je pao zbog mreže - prikaži offline stanje i pokušavaj ponovo. */
  reportFailure(): void {
    this.requestsFailing.set(true);
    this.retryTimer ??= setInterval(() => {
      if (this.browserOnline()) this.retryNow();
    }, RETRY_INTERVAL_MS);
  }

  /** Zahtev je uspeo - veza radi. */
  reportSuccess(): void {
    this.requestsFailing.set(false);
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  private retryNow(): void {
    for (const callback of this.retryCallbacks) {
      try {
        callback();
      } catch {
        // Jedan neuspeo pokušaj ne sme da spreči ostale.
      }
    }
  }
}
