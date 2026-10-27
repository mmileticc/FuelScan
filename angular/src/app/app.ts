import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from './core/services/auth.service';
import { ReceiptsStore } from './core/services/receipts-store.service';
import { StationNicknamesService } from './core/services/station-nicknames.service';
import { ToastService } from './core/services/toast.service';

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

  async login(): Promise<void> {
    try {
      await this.auth.signInWithGoogle();
    } catch (err) {
      this.toastService.show(err instanceof Error ? err.message : 'Greška pri prijavi.', 'error');
    }
  }

  async logout(): Promise<void> {
    try {
      await this.auth.signOut();
      this.store.reset();
      this.nicknames.reset();
      this.toastService.show('Uspešno ste odjavljeni.', 'success');
      await this.router.navigate(['/welcome']);
    } catch (err) {
      this.toastService.show(err instanceof Error ? err.message : 'Greška pri odjavi.', 'error');
    }
  }
}
