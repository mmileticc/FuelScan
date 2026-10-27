import { Injectable, signal } from '@angular/core';

export interface QueuedScan {
  url: string;
  scannedAt: string;
}

const STORAGE_KEY = 'fuelscan.offlineQueue';

/**
 * Red skeniranih QR kodova koji nisu mogli da se obrade (nema interneta na
 * pumpi). Čuva se lokalno na uređaju; korisnik ih kasnije ručno obradi i
 * pregleda pre čuvanja na Skeniraj ekranu.
 */
@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  readonly items = signal<QueuedScan[]>(this.read());
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.online.set(true));
      window.addEventListener('offline', () => this.online.set(false));
    }
  }

  /** Dodaje URL u red (bez duplikata). Vraća `false` ako je već bio u redu. */
  add(url: string): boolean {
    if (this.items().some((i) => i.url === url)) {
      return false;
    }
    this.items.update((list) => [...list, { url, scannedAt: new Date().toISOString() }]);
    this.write();
    return true;
  }

  remove(url: string): void {
    this.items.update((list) => list.filter((i) => i.url !== url));
    this.write();
  }

  has(url: string): boolean {
    return this.items().some((i) => i.url === url);
  }

  private read(): QueuedScan[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as QueuedScan[]).filter((i) => typeof i?.url === 'string') : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items()));
    } catch {
      // Storage nedostupan (privatni prozor i sl.) - red živi samo u memoriji.
    }
  }
}
