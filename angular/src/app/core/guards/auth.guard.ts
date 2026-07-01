import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

/**
 * Ekvivalent provere iz `old-vanilla/js/main.js` (`bindNavigation`):
 * ako korisnik nije prijavljen, vrati ga na welcome ekran uz toast poruku.
 * `AuthService.init()` se čeka preko `provideAppInitializer` pre bootstrap-a
 * rute, pa je `currentUser()` ovde uvek pouzdan (nema "flash" efekta).
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (auth.currentUser()) {
    return true;
  }

  toast.show('Morate se prijaviti da biste pristupili ovoj sekciji.', 'warning');
  return router.createUrlTree(['/welcome']);
};

/** Sprečava prikaz welcome/login ekrana korisniku koji je već prijavljen. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.currentUser()) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
