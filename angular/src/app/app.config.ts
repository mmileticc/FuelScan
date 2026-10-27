import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import localeSrLatn from '@angular/common/locales/sr-Latn';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';

// Brojevi/datumi u srpskom formatu (1.234,56 · 18.6.2026.) preko `number`/`date` pipe-ova.
registerLocaleData(localeSrLatn);

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'sr-Latn' },
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    // withHashLocation(): GitHub Pages je statički hosting bez server-side
    // fallback-a na index.html, pa hash routing (#/dashboard) sprečava 404
    // pri osvežavanju stranice ili direktnom linku na podrutu.
    provideRouter(routes, withHashLocation()),
    provideHttpClient(),
    // Ekvivalent `await initAuth()` pre prikaza UI-ja u starom main.js:
    // sesija se proverava PRE nego što ruta odluči da li ide na welcome ili dashboard.
    provideAppInitializer(() => inject(AuthService).init()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
