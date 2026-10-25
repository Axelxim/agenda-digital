import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService, AuthUser } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  const user: AuthUser = {
    id: 'user-1',
    name: 'Alexis',
    email: 'alexis@example.com',
    avatarUrl: 'https://example.com/avatar.jpg',
    locale: 'es-MX',
    timezone: 'America/Mexico_City',
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('stores the user and token after Google authentication', async () => {
    const login = service.loginWithGoogle('google-credential');
    const request = http.expectOne(`${environment.apiUrl}/auth/google`);

    expect(request.request.method).toBe('POST');
    expect(request.request.body.credential).toBe('google-credential');
    request.flush({ data: { user, token: 'token-123', token_type: 'Bearer' } });

    expect(await login).toEqual(user);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.token).toBe('token-123');
    expect(service.user()).toEqual(user);
    expect(service.lastAccountEmail).toBe(user.email);
  });

  it('keeps the remembered account after clearing a session and can forget it explicitly', async () => {
    const login = service.loginWithGoogle('google-credential');
    http.expectOne(`${environment.apiUrl}/auth/google`).flush({
      data: { user, token: 'token-123', token_type: 'Bearer' },
    });
    await login;

    service.continueLocally();
    expect(service.lastAccountEmail).toBe(user.email);

    service.forgetLastAccount();
    expect(service.lastAccountEmail).toBeNull();
  });

  it('allows local mode without creating a remote session', () => {
    service.continueLocally();

    expect(service.hasAccess()).toBe(true);
    expect(service.isLocalMode()).toBe(true);
    expect(service.isAuthenticated()).toBe(false);
  });

  it('restores a valid stored session', async () => {
    localStorage.setItem(AuthService.tokenStorageKey, 'saved-token');
    const restored = service.restoreSession();
    const request = http.expectOne(`${environment.apiUrl}/auth/me`);

    expect(request.request.method).toBe('GET');
    request.flush({ data: user });

    expect(await restored).toBe(true);
    expect(service.user()).toEqual(user);
  });
});
