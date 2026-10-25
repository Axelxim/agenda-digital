import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { syncPreferenceGuard } from './core/sync-preference.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
    canActivate: [authGuard, syncPreferenceGuard],
  },
  {
    path: 'configurar-sincronizacion',
    loadComponent: () => import('./sync-setup/sync-setup.page').then((m) => m.SyncSetupPage),
    canActivate: [authGuard],
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
];
