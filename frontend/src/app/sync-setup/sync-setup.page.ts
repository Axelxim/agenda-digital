import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, cloudDoneOutline, phonePortraitOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { AgendaSyncService } from '../core/agenda-sync.service';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-sync-setup',
  templateUrl: './sync-setup.page.html',
  styleUrl: './sync-setup.page.scss',
  imports: [IonButton, IonContent, IonIcon],
})
export class SyncSetupPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly sync = inject(AgendaSyncService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ checkmarkCircleOutline, cloudDoneOutline, phonePortraitOutline, shieldCheckmarkOutline });
  }

  ngOnInit(): void {
    if (!this.auth.isAuthenticated()) {
      void this.router.navigateByUrl('/home', { replaceUrl: true });
      return;
    }
    if (this.sync.hasPreference()) {
      void this.router.navigateByUrl('/home', { replaceUrl: true });
    }
  }

  async enableSync(): Promise<void> {
    this.sync.enable();
    await this.router.navigateByUrl('/home', { replaceUrl: true });
  }

  async keepLocal(): Promise<void> {
    this.sync.disable();
    await this.router.navigateByUrl('/home', { replaceUrl: true });
  }
}
