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

