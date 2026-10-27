import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';

export interface QueuedScan {
  url: string;
  scannedAt: string;
  /** Ko je skenirao - drugi korisnik na istom uređaju ne vidi tuđe račune na čekanju. */
  userId?: string;
}

const STORAGE_KEY = 'fuelscan.offlineQueue';

/**
 * Red skeniranih QR kodova koji nisu mogli da se obrade (nema interneta na
 * pumpi). Čuva se lokalno na uređaju; korisnik ih kasnije ručno obradi i
 * pregleda pre čuvanja na Skeniraj ekranu.
 */
@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  private readonly auth = inject(AuthService);
  /** Ceo red na uređaju (svi korisnici). */
  private readonly all = signal<QueuedScan[]>(this.read());

  /** Red trenutno prijavljenog korisnika (stavke bez `userId` su iz starije verzije i vidljive su svima). */
  readonly items = computed(() => {
    const userId = this.auth.currentUser()?.id;
    return this.all().filter((i) => !i.userId || i.userId === userId);
  });
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
    const userId = this.auth.currentUser()?.id;
    this.all.update((list) => [...list, { url, scannedAt: new Date().toISOString(), userId }]);
    this.write();
    return true;
  }

  remove(url: string): void {
    const userId = this.auth.currentUser()?.id;
    this.all.update((list) => list.filter((i) => i.url !== url || (!!i.userId && i.userId !== userId)));
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.all()));
    } catch {
      // Storage nedostupan (privatni prozor i sl.) - red živi samo u memoriji.
    }
  }
}
