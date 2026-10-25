import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AgendaSyncService } from './agenda-sync.service';
import { AuthService } from './auth.service';

export const syncPreferenceGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (!auth.isAuthenticated()) return true;

  const sync = inject(AgendaSyncService);
  return sync.hasPreference()
    ? true
    : inject(Router).createUrlTree(['/configurar-sincronizacion']);
};
