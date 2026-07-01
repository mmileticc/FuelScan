import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'welcome' },
  {
    path: 'welcome',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/welcome/welcome.component').then((m) => m.WelcomeComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'scan',
    canActivate: [authGuard],
    loadComponent: () => import('./features/scan/scan.component').then((m) => m.ScanComponent),
  },
  {
    path: 'history',
    canActivate: [authGuard],
    loadComponent: () => import('./features/history/history.component').then((m) => m.HistoryComponent),
  },
  {
    path: 'statistics',
    canActivate: [authGuard],
    loadComponent: () => import('./features/statistics/statistics.component').then((m) => m.StatisticsComponent),
  },
  { path: '**', redirectTo: 'welcome' },
];
