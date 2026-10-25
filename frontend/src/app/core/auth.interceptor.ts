import { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = localStorage.getItem(AuthService.tokenStorageKey);
  if (!token || !request.url.startsWith(environment.apiUrl) || request.headers.has('Authorization')) {
    return next(request);
  }

  return next(request.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  }));
};
