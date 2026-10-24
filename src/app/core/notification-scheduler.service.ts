import { inject, Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  LocalNotificationSchema,
  LocalNotifications,
} from '@capacitor/local-notifications';

import { LabelReminderSettings, Task, TaskLabel } from './task.model';
import { LabelReminderService } from './label-reminder.service';

export type NotificationSyncStatus =
  | 'scheduled'
  | 'permission-denied'
  | 'web';

export interface NotificationSyncResult {
  status: NotificationSyncStatus;
  scheduled: number;
  exact: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationSchedulerService {
  private readonly labelReminderService = inject(LabelReminderService);
  private readonly managedIdsKey = 'agenda_scheduled_notification_ids_v1';
  private readonly channelId = 'agenda-reminders';
  private syncQueue = Promise.resolve<NotificationSyncResult>({
    status: 'web',
    scheduled: 0,
    exact: false,
  });

  sync(
    tasks: Task[],
    settings: Record<TaskLabel, LabelReminderSettings>,
    requestPermission = false,
  ): Promise<NotificationSyncResult> {
    const taskSnapshot = tasks.map((task) => ({ ...task }));
    const settingsSnapshot = Object.fromEntries(
      Object.entries(settings).map(([label, value]) => [
        label,
        { ...value, advanceMinutes: [...value.advanceMinutes] },
      ]),
    ) as Record<TaskLabel, LabelReminderSettings>;

    this.syncQueue = this.syncQueue
      .catch(() => ({ status: 'web' as const, scheduled: 0, exact: false }))
      .then(() => this.performSync(taskSnapshot, settingsSnapshot, requestPermission));
    return this.syncQueue;
  }

  private async performSync(
    tasks: Task[],
    settings: Record<TaskLabel, LabelReminderSettings>,
    requestPermission: boolean,
  ): Promise<NotificationSyncResult> {
    if (!Capacitor.isNativePlatform()) {
      return { status: 'web', scheduled: 0, exact: false };
    }

    let permission = await LocalNotifications.checkPermissions();
    if (requestPermission && permission.display !== 'granted') {
      permission = await LocalNotifications.requestPermissions();
    }

    if (permission.display !== 'granted') {
      await this.cancelManagedNotifications();
      return { status: 'permission-denied', scheduled: 0, exact: false };
    }

    let exact = false;
    if (Capacitor.getPlatform() === 'android') {
      await LocalNotifications.createChannel({
        id: this.channelId,
        name: 'Recordatorios de agenda',
        description: 'Avisos programados para tus tareas',
        importance: 4,
        visibility: 1,
        lights: true,
        lightColor: '#3b82f6',
      });

      const exactPermission = await LocalNotifications.checkExactNotificationSetting();
      exact = exactPermission.exact_alarm === 'granted';
      if (requestPermission && !exact) {
        await LocalNotifications.changeExactNotificationSetting();
        const refreshed = await LocalNotifications.checkExactNotificationSetting();
        exact = refreshed.exact_alarm === 'granted';
      }
    }

    await this.cancelManagedNotifications();
    const notifications = this.buildNotifications(tasks, settings).map((notification) => ({
      ...notification,
      isExactNotification: exact,
    }));

    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications });
    }
    this.saveManagedIds(notifications.map((notification) => notification.id));

    return { status: 'scheduled', scheduled: notifications.length, exact };
  }

  buildNotifications(
    tasks: Task[],
    settings: Record<TaskLabel, LabelReminderSettings>,
    now = new Date(),
  ): LocalNotificationSchema[] {
    return tasks.flatMap((task) => {
      if (task.tipo !== 'tarea' || !task.etiqueta) return [];
      const labelSettings = settings[task.etiqueta];
      if (!labelSettings) return [];

      return this.labelReminderService.calculateSchedule(task, labelSettings, now).map((reminder) => {
        const isDuePrompt = reminder.type === 'due-prompt';
        return {
          id: this.notificationId(task.id, isDuePrompt ? 'due' : String(reminder.offsetMinutes)),
          title: isDuePrompt ? '¿Ya lo entregaste?' : `Recordatorio: ${task.titulo}`,
          body: isDuePrompt
            ? task.titulo
            : `Vence en ${this.leadLabel(reminder.offsetMinutes)} · ${task.etiqueta}`,
          schedule: { at: reminder.scheduledAt, allowWhileIdle: true },
          channelId: this.channelId,
          foreground: true,
          extra: {
            taskId: task.id,
            reminderType: reminder.type,
            offsetMinutes: reminder.offsetMinutes,
          },
        } satisfies LocalNotificationSchema;
      });
    });
  }

  private async cancelManagedNotifications(): Promise<void> {
    const ids = this.loadManagedIds();
    if (ids.length > 0) {
      await LocalNotifications.cancel({
        notifications: ids.map((id) => ({ id })),
      });
    }
    this.saveManagedIds([]);
  }

  private leadLabel(minutes?: number): string {
    return this.labelReminderService.leadOptions.find(
      (option) => option.minutes === minutes,
    )?.label ?? 'poco tiempo';
  }

  private notificationId(taskId: number, reminderKey: string): number {
    const value = `${taskId}:${reminderKey}`;
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) & 0x7fffffff || 1;
  }

  private loadManagedIds(): number[] {
    const raw = localStorage.getItem(this.managedIdsKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((id): id is number => Number.isInteger(id))
        : [];
    } catch {
      return [];
    }
  }

  private saveManagedIds(ids: number[]): void {
    localStorage.setItem(this.managedIdsKey, JSON.stringify(ids));
  }
}
