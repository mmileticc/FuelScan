import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

import { AuthService } from './core/services/auth.service';
import { ReceiptsStore } from './core/services/receipts-store.service';
import { StationNicknamesService } from './core/services/station-nicknames.service';
import { ToastService } from './core/services/toast.service';
import { friendlyError } from './core/utils/errors.utils';

/**
 * Root shell - ekvivalent statičnog dela `old-vanilla/index.html`
 * (header sa auth oblašću, `<main>` koje je ranije ručno prebacivalo
 * "ekrane" preko `showScreen()`, sad je to `<router-outlet>`, i donji
 * "floating" navigacioni meni + toast traka).
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly store = inject(ReceiptsStore);
  private readonly nicknames = inject(StationNicknamesService);
  private readonly swUpdate = inject(SwUpdate, { optional: true });

  /** Nova verzija je preuzeta - traka sa dugmetom "Osveži" (ne toast, da je druga poruka ne prekrije). */
  protected readonly updateReady = signal(false);

  protected reloadApp(): void {
    document.location.reload();
  }

  constructor() {
    this.watchForUpdates();
  }

  /**
   * Instalirana PWA bi posle deploy-a radila na staroj verziji sve do jednog-dva
   * ponovna pokretanja. Kad service worker preuzme novu verziju, ponudi osvežavanje;
   * provera se radi i kad se aplikacija vrati iz pozadine.
   */
  private watchForUpdates(): void {
    const sw = this.swUpdate;
    if (!sw?.isEnabled) return;

    sw.versionUpdates
      .pipe(
        filter((e) => e.type === 'VERSION_READY'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.updateReady.set(true));

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void sw.checkForUpdate().catch(() => undefined);
    });
  }

  async login(): Promise<void> {
    try {
      await this.auth.signInWithGoogle();
    } catch (err) {
      this.toastService.show(friendlyError(err, 'prijavi'), 'error');
    }
  }

  async logout(): Promise<void> {
    try {
      // Brisanja koja čekaju rok za "Poništi" moraju da se izvrše dok je sesija još važeća.
      this.store.flushScheduledDeletes();
      await this.auth.signOut();
      this.store.reset();
      this.nicknames.reset();
      this.toastService.show('Uspešno ste odjavljeni.', 'success');
      await this.router.navigate(['/welcome']);
    } catch (err) {
      this.toastService.show(friendlyError(err, 'odjavi'), 'error');
    }
  }
}
