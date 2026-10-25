import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, OnInit, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { calendarOutline, cloudOfflineOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { AuthService } from '../core/auth.service';
import { AgendaSyncService } from '../core/agenda-sync.service';
import { environment } from '../../environments/environment';

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentityApi {
  initialize(options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    login_hint?: string;
    use_fedcm_for_button?: boolean;
    button_auto_select?: boolean;
  }): void;
  renderButton(element: HTMLElement, options: Record<string, string | number>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentityApi } };
  }
}

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
  imports: [IonButton, IonContent, IonIcon, IonSpinner],
})
export class LoginPage implements OnInit, AfterViewInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly agendaSync = inject(AgendaSyncService);

  @ViewChild('googleButton') googleButton!: ElementRef<HTMLDivElement>;

  loading = true;
  signingIn = false;
  errorMessage = '';

  get rememberedAccount(): string | null {
    return this.auth.lastAccountEmail;
  }

  constructor() {
    addIcons({ calendarOutline, cloudOfflineOutline, shieldCheckmarkOutline });
  }

  async ngOnInit(): Promise<void> {
    if (this.auth.token && await this.auth.restoreSession()) {
      await this.navigateAfterLogin();
    }
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      await this.loadGoogleIdentity();
      this.loading = false;
      this.changeDetector.detectChanges();
      this.renderGoogleButton();
    } catch {
      this.errorMessage = 'No fue posible cargar el acceso con Google. Revisa tu conexión.';
    } finally {
      this.loading = false;
      this.changeDetector.detectChanges();
    }
  }

  async continueLocally(): Promise<void> {
    this.auth.continueLocally();
    await this.router.navigateByUrl('/home', { replaceUrl: true });
  }

  useAnotherAccount(): void {
    this.auth.forgetLastAccount();
    window.location.reload();
  }

  private renderGoogleButton(): void {
    const googleIdentity = window.google?.accounts.id;
    if (!googleIdentity) {
      throw new Error('Google Identity Services no está disponible.');
    }

    googleIdentity.initialize({
      client_id: environment.googleClientId,
      callback: (response) => this.zone.run(() => void this.handleGoogleCredential(response)),
      auto_select: false,
      cancel_on_tap_outside: true,
      login_hint: this.rememberedAccount ?? undefined,
      use_fedcm_for_button: true,
      button_auto_select: true,
    });
    googleIdentity.renderButton(this.googleButton.nativeElement, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width: Math.min(window.innerWidth - 64, 360),
      locale: 'es',
    });
  }

  private async handleGoogleCredential(response: GoogleCredentialResponse): Promise<void> {
    if (!response.credential || this.signingIn) {
      this.errorMessage = 'Google no entregó una credencial válida.';
      return;
    }

    this.signingIn = true;
    this.errorMessage = '';
    try {
      await this.auth.loginWithGoogle(response.credential);
      await this.navigateAfterLogin();
    } catch (error) {
      this.errorMessage = this.loginErrorMessage(error);
    } finally {
      this.signingIn = false;
    }
  }

  private loadGoogleIdentity(): Promise<void> {
    if (window.google?.accounts.id) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset['googleIdentity'] = 'true';
      script.addEventListener('load', () => resolve(), { once: true });
      script.addEventListener('error', () => reject(new Error('No se pudo cargar Google.')), { once: true });
      document.head.appendChild(script);
    });
  }

  private async navigateAfterLogin(): Promise<void> {
    const destination = this.agendaSync.hasPreference() ? '/home' : '/configurar-sincronizacion';
    await this.router.navigateByUrl(destination, { replaceUrl: true });
  }

  private loginErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const messages = error.error?.messages as Record<string, string> | undefined;
      const serverMessage = messages ? Object.values(messages)[0] : undefined;
      if (serverMessage) {
        return serverMessage;
      }
      if (error.status === 0) {
        return 'No se pudo conectar con el servidor local.';
      }
    }

    return 'No fue posible iniciar sesión. Inténtalo nuevamente.';
  }
}
