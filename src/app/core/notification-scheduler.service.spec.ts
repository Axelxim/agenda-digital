import { LabelReminderService } from './label-reminder.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { LabelReminderSettings, Task, TaskLabel } from './task.model';

describe('NotificationSchedulerService', () => {
  let service: NotificationSchedulerService;
  let labelReminderService: LabelReminderService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LabelReminderService, NotificationSchedulerService],
    });
    labelReminderService = TestBed.inject(LabelReminderService);
    service = TestBed.inject(NotificationSchedulerService);
  });

  it('does not block the web app while native permissions are unavailable', async () => {
    await expect(service.checkNotificationPermission()).resolves.toBe(true);
    await expect(service.checkExactAlarmPermission()).resolves.toBe(true);
    await expect(service.checkFullScreenPermission()).resolves.toBe(true);
  });

  it('builds stable, unique notifications including the due question', () => {
    const settings = allSettings();
    settings.Universidad = {
      ...labelReminderService.defaultSettings('Universidad'),
      enabled: true,
      advanceMinutes: [1440, 180],
    };
    const task = universityTask();

    const first = service.buildNotifications([task], settings, new Date('2026-10-20T00:00:00'));
    const second = service.buildNotifications([task], settings, new Date('2026-10-20T00:00:00'));

    expect(first).toHaveLength(3);
    expect(new Set(first.map((notification) => notification.id)).size).toBe(3);
    expect(second.map((notification) => notification.id)).toEqual(first.map((notification) => notification.id));
    expect(first.at(-1)?.title).toBe('¿Ya lo entregaste?');
    expect(first.at(-1)?.schedule?.at).toEqual(new Date('2026-10-24T18:00:00'));
    expect(first.every((notification) => notification.actionTypeId === 'agenda-task-actions')).toBe(true);
    expect(first.every((notification) => notification.extra.taskId === task.id)).toBe(true);
  });

  it('ignores events, completed tasks and disabled labels', () => {
    const settings = allSettings();
    const task = universityTask();

    expect(service.buildNotifications([task], settings)).toEqual([]);
    settings.Universidad = { ...settings.Universidad, enabled: true };
    expect(service.buildNotifications([
      { ...task, tipo: 'evento' },
      { ...task, estado: 'completada' },
    ], settings)).toEqual([]);
  });

  it('schedules pending medication doses and ignores taken or overdue doses', () => {
    const treatment = {
      id: 'treatment-1',
      treatmentName: 'Control de depresión',
      name: 'Citalopram',
      dose: '1 tableta',
      startDate: '2026-10-24',
      continuous: true,
      schedule: { days: [0, 1, 2, 3, 4, 5, 6], times: ['20:00'] },
      color: '#22c55e',
      strictTracking: false,
      stockEnabled: false,
      stockQuantity: 0,
      doseUnits: 1,
      stockUnit: 'tabletas',
      lowStockThreshold: 5,
      status: 'active' as const,
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:00.000Z',
    };
    const notifications = service.buildMedicationNotifications([
      { id: 'future', treatmentId: treatment.id, scheduledAt: '2026-10-24T20:00:00', status: 'pending' },
      { id: 'taken', treatmentId: treatment.id, scheduledAt: '2026-10-24T21:00:00', status: 'taken' },
      { id: 'past', treatmentId: treatment.id, scheduledAt: '2026-10-24T07:00:00', status: 'pending' },
    ], [treatment], new Date('2026-10-24T12:00:00'));

    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe('Hora de tomar Citalopram');
    expect(notifications[0].body).toContain('Control de depresión');
    expect(notifications[0].extra.medicationDoseId).toBe('future');
  });

  it('schedules a fixed payment one day before and on its due date', () => {
    const expense = {
      id: 'rent', name: 'Renta', amount: 4500, category: 'Hogar', dueDay: 26,
      frequencyMonths: 1 as const, firstDueDate: '2026-10-26', trackingStartDate: '2026-10-01', reminderTime: '09:00', active: true,
      createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    };
    const notifications = service.buildWalletNotifications([{
      id: 'rent:2026-10', expense, period: '2026-10', dueDate: '2026-10-26', paid: false,
    }], new Date('2026-10-24T08:00:00'));

    expect(notifications).toHaveLength(2);
    expect(notifications[0].schedule?.at).toEqual(new Date('2026-10-25T09:00:00'));
    expect(notifications[1].schedule?.at).toEqual(new Date('2026-10-26T09:00:00'));
    expect(notifications[1].extra.walletFixedExpenseId).toBe('rent');
  });

  function allSettings(): Record<TaskLabel, LabelReminderSettings> {
    return ['Universidad', 'Trabajo', 'Personal', 'Salud', 'Ocio'].reduce((result, label) => {
      const taskLabel = label as TaskLabel;
      result[taskLabel] = labelReminderService.defaultSettings(taskLabel);
      return result;
    }, {} as Record<TaskLabel, LabelReminderSettings>);
  }

  function universityTask(): Task {
    return {
      id: 42,
      titulo: 'Entregar proyecto',
      tipo: 'tarea',
      fecha: '2026-10-24',
      hora: '18:00',
      prioridad: 'alta',
      estado: 'pendiente',
      etiqueta: 'Universidad',
      repeticion: 'none',
    };
  }
});
import { TestBed } from '@angular/core/testing';

