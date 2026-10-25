import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  locale: string;
  timezone: string;
}

interface AuthResponse {
  data: {
    user: AuthUser;
    token: string;
    token_type: 'Bearer';
  };
}

interface UserResponse {
  data: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  static readonly tokenStorageKey = 'todo-en-orden-auth-token';
  private static readonly userStorageKey = 'todo-en-orden-auth-user';
  private static readonly localModeStorageKey = 'todo-en-orden-local-mode';
  private static readonly lastAccountStorageKey = 'todo-en-orden-last-google-account';

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly currentUser = signal<AuthUser | null>(this.readStoredUser());
  private readonly localMode = signal(localStorage.getItem(AuthService.localModeStorageKey) === 'true');

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null && this.token !== null);
  readonly isLocalMode = this.localMode.asReadonly();

  get token(): string | null {
    return localStorage.getItem(AuthService.tokenStorageKey);
  }

  get lastAccountEmail(): string | null {
    return localStorage.getItem(AuthService.lastAccountStorageKey);
  }

  hasAccess(): boolean {
    return this.token !== null || this.localMode();
  }

  async loginWithGoogle(credential: string): Promise<AuthUser> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(`${environment.apiUrl}/auth/google`, {
        credential,
        device_name: this.deviceName(),
      }),
    );

    this.saveSession(response.data.user, response.data.token);
    return response.data.user;
  }

  async restoreSession(): Promise<boolean> {
    if (!this.token) {
      return false;
    }

    try {
      const response = await firstValueFrom(
        this.http.get<UserResponse>(`${environment.apiUrl}/auth/me`),
      );
      this.storeUser(response.data);
      return true;
    } catch {
      this.clearSession();
      return false;
    }
  }

  continueLocally(): void {
    this.clearSession();
    localStorage.setItem(AuthService.localModeStorageKey, 'true');
    this.localMode.set(true);
  }

  forgetLastAccount(): void {
    localStorage.removeItem(AuthService.lastAccountStorageKey);
  }

  async logout(): Promise<void> {
    if (this.token) {
      try {
        await firstValueFrom(this.http.post(`${environment.apiUrl}/auth/logout`, {}));
      } catch {
        // La sesión local siempre se limpia aunque el dispositivo esté sin conexión.
      }
    }

    this.clearSession();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  private saveSession(user: AuthUser, token: string): void {
    localStorage.setItem(AuthService.tokenStorageKey, token);
    localStorage.setItem(AuthService.lastAccountStorageKey, user.email);
    localStorage.removeItem(AuthService.localModeStorageKey);
    this.localMode.set(false);
    this.storeUser(user);
  }

  private storeUser(user: AuthUser): void {
    localStorage.setItem(AuthService.userStorageKey, JSON.stringify(user));
    this.currentUser.set(user);
  }

  private clearSession(): void {
    localStorage.removeItem(AuthService.tokenStorageKey);
    localStorage.removeItem(AuthService.userStorageKey);
    localStorage.removeItem(AuthService.localModeStorageKey);
    this.currentUser.set(null);
    this.localMode.set(false);
  }

  private readStoredUser(): AuthUser | null {
    const value = localStorage.getItem(AuthService.userStorageKey);
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as AuthUser;
    } catch {
      localStorage.removeItem(AuthService.userStorageKey);
      return null;
    }
  }

  private deviceName(): string {
    return navigator.userAgent.includes('Android')
      ? 'Todo en Orden - Android'
      : 'Todo en Orden - Web';
  }
}
