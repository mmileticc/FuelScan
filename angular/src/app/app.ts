import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from './core/services/auth.service';
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
      this.toastService.show('Uspešno ste odjavljeni.', 'success');
      await this.router.navigate(['/welcome']);
    } catch (err) {
      this.toastService.show(err instanceof Error ? err.message : 'Greška pri odjavi.', 'error');
    }
  }
}
