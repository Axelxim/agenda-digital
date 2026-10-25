import { inject, Injectable } from '@angular/core';
import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import {
  ActionPerformed,
  LocalNotificationSchema,
  LocalNotifications,
} from '@capacitor/local-notifications';
import { LabelReminderSettings, Task, TaskLabel } from './task.model';
import { LabelReminderService } from './label-reminder.service';
import { MedicationDose, MedicationTreatment } from './wellness.model';
import { FixedExpenseOccurrence } from './wallet.model';

interface AgendaReminderPayload {
  id: number;
  taskId: number;
  kind: 'task' | 'medication' | 'wallet';
  taskTitle: string;
  label: string;
  title: string;
  body: string;
  scheduledAt: number;
  dueAt: number;
  sourceJson: string;
}

interface AgendaReminderPlugin {
  sync(options: { remindersJson: string }): Promise<void>;
  cancel(options: { ids: number[] }): Promise<void>;
  requestFullScreenPermission(): Promise<void>;
  checkBatteryOptimization(): Promise<{ supported: boolean; ignoring: boolean }>;
  requestBatteryOptimizationExemption(): Promise<void>;
  getBatterySettingsInfo(): Promise<{ manufacturer: string; family: string }>;
  openAppSettings(): Promise<void>;
  openManufacturerBatterySettings(): Promise<void>;
}

const AgendaReminder = registerPlugin<AgendaReminderPlugin>('AgendaReminder');

export type NotificationSyncStatus =
  | 'scheduled'
  | 'permission-denied'
  | 'web';

export interface NotificationSyncResult {
  status: NotificationSyncStatus;
  scheduled: number;
  exact: boolean;
}

export interface BatteryOptimizationStatus {
  supported: boolean;
  ignoring: boolean;
}

export interface BatteryDeviceInfo {
  manufacturer: string;
  family: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationSchedulerService {
  private readonly labelReminderService = inject(LabelReminderService);
  private readonly managedIdsKey = 'agenda_scheduled_notification_ids_v1';
  private readonly lowStockNotifiedKey = 'agenda_low_stock_notified_v1';
  private readonly channelId = 'agenda-reminders';
  private readonly actionTypeId = 'agenda-task-actions';
  private actionsRegistered = false;
  private syncQueue = Promise.resolve<NotificationSyncResult>({
    status: 'web',
    scheduled: 0,
    exact: false,
  });

  sync(
    tasks: Task[],
    settings: Record<TaskLabel, LabelReminderSettings>,
    requestPermission = false,
    medicationDoses: MedicationDose[] = [],
    medicationTreatments: MedicationTreatment[] = [],
    walletOccurrences: FixedExpenseOccurrence[] = [],
  ): Promise<NotificationSyncResult> {
    const taskSnapshot = tasks.map((task) => ({ ...task }));
    const settingsSnapshot = Object.fromEntries(
      Object.entries(settings).map(([label, value]) => [
        label,
        { ...value, advanceMinutes: [...value.advanceMinutes] },
      ]),
    ) as Record<TaskLabel, LabelReminderSettings>;
    const doseSnapshot = medicationDoses.map((dose) => ({ ...dose }));
    const treatmentSnapshot = medicationTreatments.map((treatment) => ({
      ...treatment,
      schedule: { days: [...treatment.schedule.days], times: [...treatment.schedule.times] },
    }));
    const walletSnapshot = walletOccurrences.map((occurrence) => ({
      ...occurrence,
      expense: { ...occurrence.expense },
      paidTransaction: occurrence.paidTransaction ? { ...occurrence.paidTransaction } : undefined,
    }));

    this.syncQueue = this.syncQueue
      .catch(() => ({ status: 'web' as const, scheduled: 0, exact: false }))
      .then(() => this.performSync(
        taskSnapshot,
        settingsSnapshot,
        requestPermission,
        doseSnapshot,
        treatmentSnapshot,
        walletSnapshot,
      ));
    return this.syncQueue;
  }

  async checkBatteryOptimization(): Promise<BatteryOptimizationStatus> {
    if (Capacitor.getPlatform() !== 'android') {
      return { supported: false, ignoring: true };
    }
    return AgendaReminder.checkBatteryOptimization();
  }

  async requestNotificationPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return true;
    const permission = await LocalNotifications.requestPermissions();
    return permission.display === 'granted';
  }

  async requestBatteryOptimizationExemption(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return;
    await AgendaReminder.requestBatteryOptimizationExemption();
  }

  async getBatteryDeviceInfo(): Promise<BatteryDeviceInfo> {
    if (Capacitor.getPlatform() !== 'android') {
      return { manufacturer: 'Android', family: 'android' };
    }
    return AgendaReminder.getBatterySettingsInfo();
  }

  async openAppSettings(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return;
    await AgendaReminder.openAppSettings();
  }

  async openManufacturerBatterySettings(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return;
    await AgendaReminder.openManufacturerBatterySettings();
  }

  async syncLowStockNotification(treatment: MedicationTreatment): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    const id = this.stableNotificationId(`stock:${treatment.id}`);
    const notified = this.loadLowStockNotified();
    const isLow = treatment.stockEnabled && treatment.stockQuantity <= treatment.lowStockThreshold;
    if (!isLow) {
      delete notified[treatment.id];
      this.saveLowStockNotified(notified);
      await LocalNotifications.cancel({ notifications: [{ id }] });
      await LocalNotifications.removeDeliveredNotificationsById({ ids: [id] });
      return;
    }
    if (notified[treatment.id] === treatment.stockQuantity) return;
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') return;
    await LocalNotifications.schedule({ notifications: [{
      id,
      title: `Queda poco ${treatment.name}`,
      body: `Quedan ${treatment.stockQuantity} ${treatment.stockUnit}. Considera reponerlo.`,
      schedule: { at: new Date(Date.now() + 1_000), allowWhileIdle: true },
      channelId: this.channelId,
      foreground: true,
      extra: { medicationTreatmentId: treatment.id, reminderType: 'low-stock' },
    }] });
    notified[treatment.id] = treatment.stockQuantity;
    this.saveLowStockNotified(notified);
  }

  private async performSync(
    tasks: Task[],
    settings: Record<TaskLabel, LabelReminderSettings>,
    requestPermission: boolean,
    medicationDoses: MedicationDose[],
    medicationTreatments: MedicationTreatment[],
    walletOccurrences: FixedExpenseOccurrence[],
  ): Promise<NotificationSyncResult> {
    if (!Capacitor.isNativePlatform()) {
      return { status: 'web', scheduled: 0, exact: false };
    }

    await this.ensureActionsRegistered();

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
    const notifications = [
      ...this.buildNotifications(tasks, settings),
      ...this.buildMedicationNotifications(medicationDoses, medicationTreatments),
      ...this.buildWalletNotifications(walletOccurrences),
    ].map((notification) => ({ ...notification, isExactNotification: exact }));

    if (Capacitor.getPlatform() === 'android') {
      await AgendaReminder.sync({
        remindersJson: JSON.stringify(this.buildUrgentReminders(
          notifications,
          tasks,
          settings,
          medicationDoses,
          medicationTreatments,
          walletOccurrences,
        )),
      });
      if (requestPermission) {
        await AgendaReminder.requestFullScreenPermission();
      }
    } else if (notifications.length > 0) {
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
          actionTypeId: this.actionTypeId,
          foreground: true,
          extra: {
            taskId: task.id,
            taskUuid: task.uuid,
            reminderType: reminder.type,
            offsetMinutes: reminder.offsetMinutes,
          },
        } satisfies LocalNotificationSchema;
      });
    });
  }

  buildMedicationNotifications(
    doses: MedicationDose[],
    treatments: MedicationTreatment[],
    now = new Date(),
  ): LocalNotificationSchema[] {
    const treatmentById = new Map(treatments.map((treatment) => [treatment.id, treatment]));
    const limit = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    return doses.flatMap((dose) => {
      if (dose.status !== 'pending') return [];
      const treatment = treatmentById.get(dose.treatmentId);
      if (!treatment || treatment.status !== 'active') return [];
      const scheduledAt = new Date(dose.scheduledAt);
      if (
        Number.isNaN(scheduledAt.getTime()) ||
        scheduledAt.getTime() < now.getTime() ||
        scheduledAt.getTime() > limit.getTime()
      ) {
        return [];
      }

      return [{
        id: this.stableNotificationId(`medication:${dose.id}`),
        title: `Hora de tomar ${treatment.name}`,
        body: `${treatment.dose}${treatment.treatmentName ? ` · ${treatment.treatmentName}` : ''}`,
        schedule: { at: scheduledAt, allowWhileIdle: true },
        channelId: this.channelId,
        foreground: true,
        extra: {
          medicationDoseId: dose.id,
          medicationTreatmentId: treatment.id,
          reminderType: 'medication',
        },
      } satisfies LocalNotificationSchema];
    });
  }

  buildWalletNotifications(
    occurrences: FixedExpenseOccurrence[],
    now = new Date(),
  ): LocalNotificationSchema[] {
    const limit = new Date(now.getTime() + 62 * 86400000);
    return occurrences.flatMap((occurrence) => {
      if (occurrence.paid || !occurrence.expense.active) return [];
      const dueAt = new Date(`${occurrence.dueDate}T${occurrence.expense.reminderTime}:00`);
      if (Number.isNaN(dueAt.getTime()) || dueAt > limit) return [];
      const dayBefore = new Date(dueAt);
      dayBefore.setDate(dayBefore.getDate() - 1);
      return [
        { key: 'before', at: dayBefore, title: `Mañana vence ${occurrence.expense.name}`, body: `${this.money(occurrence.expense.amount)} · ${occurrence.expense.category}` },
        { key: 'due', at: dueAt, title: `Hoy vence ${occurrence.expense.name}`, body: `${this.money(occurrence.expense.amount)} · Pago pendiente` },
      ].flatMap((reminder): LocalNotificationSchema[] => {
        if (reminder.at.getTime() <= now.getTime()) return [];
        return [{
          id: this.stableNotificationId(`wallet:${occurrence.id}:${reminder.key}`),
          title: reminder.title,
          body: reminder.body,
          schedule: { at: reminder.at, allowWhileIdle: true },
          channelId: this.channelId,
          foreground: true,
          extra: {
            walletOccurrenceId: occurrence.id,
            walletFixedExpenseId: occurrence.expense.id,
            walletDueAt: dueAt.getTime(),
            reminderType: `wallet-${reminder.key}`,
          },
        }];
      });
    });
  }

  async listenForActions(
    listener: (action: ActionPerformed) => void | Promise<void>,
  ): Promise<PluginListenerHandle | undefined> {
    if (!Capacitor.isNativePlatform()) return undefined;
    await this.ensureActionsRegistered();
    return LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      void listener(action);
    });
  }

  async clearTaskNotifications(taskId: number): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    const ids = [
      this.notificationId(taskId, 'due'),
      ...this.labelReminderService.leadOptions.map((option) =>
        this.notificationId(taskId, String(option.minutes)),
      ),
    ];
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
    await LocalNotifications.removeDeliveredNotificationsById({ ids });
    if (Capacitor.getPlatform() === 'android') {
      await AgendaReminder.cancel({ ids });
    }
    const removed = new Set(ids);
    this.saveManagedIds(this.loadManagedIds().filter((id) => !removed.has(id)));
  }

  private async ensureActionsRegistered(): Promise<void> {
    if (this.actionsRegistered) return;
    await LocalNotifications.registerActionTypes({
      types: [{
        id: this.actionTypeId,
        actions: [
          { id: 'complete', title: 'Hecho' },
          { id: 'snooze', title: 'Posponer' },
          { id: 'discard', title: 'Descartar' },
        ],
      }],
    });
    this.actionsRegistered = true;
  }

  private async cancelManagedNotifications(): Promise<void> {
    const ids = this.loadManagedIds();
    if (ids.length > 0) {
      await LocalNotifications.cancel({
        notifications: ids.map((id) => ({ id })),
      });
      if (Capacitor.getPlatform() === 'android') {
        await AgendaReminder.cancel({ ids });
      }
    }
    this.saveManagedIds([]);
  }

  private buildUrgentReminders(
    notifications: LocalNotificationSchema[],
    tasks: Task[],
    settings: Record<TaskLabel, LabelReminderSettings>,
    medicationDoses: MedicationDose[],
    medicationTreatments: MedicationTreatment[],
    walletOccurrences: FixedExpenseOccurrence[],
  ): AgendaReminderPayload[] {
    return notifications.flatMap((notification): AgendaReminderPayload[] => {
      const walletOccurrenceId = notification.extra?.['walletOccurrenceId'];
      if (typeof walletOccurrenceId === 'string') {
        const occurrence = walletOccurrences.find((item) => item.id === walletOccurrenceId);
        const scheduledAt = notification.schedule?.at;
        if (!occurrence || !(scheduledAt instanceof Date)) return [];
        const dueAt = Number(notification.extra?.['walletDueAt']);
        return [{
          id: notification.id,
          taskId: 0,
          kind: 'wallet',
          taskTitle: occurrence.expense.name,
          label: this.money(occurrence.expense.amount),
          title: notification.title,
          body: notification.body,
          scheduledAt: scheduledAt.getTime(),
          dueAt: Number.isFinite(dueAt) ? dueAt : scheduledAt.getTime(),
          sourceJson: JSON.stringify({ id: notification.id, title: notification.title, body: notification.body, extra: notification.extra }),
        }];
      }

      const medicationDoseId = notification.extra?.['medicationDoseId'];
      if (typeof medicationDoseId === 'string') {
        const dose = medicationDoses.find((item) => item.id === medicationDoseId);
        const treatment = dose
          ? medicationTreatments.find((item) => item.id === dose.treatmentId)
          : undefined;
        const scheduledAt = notification.schedule?.at;
        if (!dose || !treatment || !(scheduledAt instanceof Date)) return [];
        const sourceJson = JSON.stringify({
          id: notification.id,
          title: notification.title,
          body: notification.body,
          extra: notification.extra,
        });
        return [{
          id: notification.id,
          taskId: 0,
          kind: 'medication',
          taskTitle: treatment.name,
          label: treatment.dose,
          title: notification.title,
          body: notification.body,
          scheduledAt: scheduledAt.getTime(),
          dueAt: scheduledAt.getTime(),
          sourceJson,
        }];
      }

      const taskId = Number(notification.extra?.['taskId']);
      const task = tasks.find((item) => item.id === taskId);
      const scheduledAt = notification.schedule?.at;
      if (!task?.fecha || !task.etiqueta || !(scheduledAt instanceof Date)) return [];

      const dueTime = task.hora || settings[task.etiqueta]?.dateOnlyTime;
      if (!dueTime) return [];
      const dueAt = new Date(`${task.fecha}T${dueTime}:00`).getTime();
      if (Number.isNaN(dueAt)) return [];

      const sourceJson = JSON.stringify({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        actionTypeId: notification.actionTypeId,
        extra: notification.extra,
      });

      return [{
        id: notification.id,
        taskId,
        kind: 'task',
        taskTitle: task.titulo,
        label: task.etiqueta,
        title: notification.title,
        body: notification.body,
        scheduledAt: scheduledAt.getTime(),
        dueAt,
        sourceJson,
      }];
    });
  }

  private leadLabel(minutes?: number): string {
    return this.labelReminderService.leadOptions.find(
      (option) => option.minutes === minutes,
    )?.label ?? 'poco tiempo';
  }

  private money(value: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
  }

  private notificationId(taskId: number, reminderKey: string): number {
    return this.stableNotificationId(`${taskId}:${reminderKey}`);
  }

  private stableNotificationId(value: string): number {
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

  private loadLowStockNotified(): Record<string, number> {
    try {
      const value = JSON.parse(localStorage.getItem(this.lowStockNotifiedKey) ?? '{}') as unknown;
      return value && typeof value === 'object' ? value as Record<string, number> : {};
    } catch {
      return {};
    }
  }

  private saveLowStockNotified(values: Record<string, number>): void {
    localStorage.setItem(this.lowStockNotifiedKey, JSON.stringify(values));
  }
}
