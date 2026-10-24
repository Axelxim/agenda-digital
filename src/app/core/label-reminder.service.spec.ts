import { LabelReminderService } from './label-reminder.service';
import { LabelReminderSettings, Task } from './task.model';

describe('LabelReminderService', () => {
  let service: LabelReminderService;

  beforeEach(() => {
    localStorage.clear();
    service = new LabelReminderService();
  });

  it('persists reminder settings without touching task storage', () => {
    const settings = service.load(['Universidad']);
    settings.Universidad = {
      ...settings.Universidad,
      enabled: true,
      advanceMinutes: [10080, 180],
    };
    localStorage.setItem('agenda_tasks_v1', '[{"id":1}]');

    service.save(settings);

    expect(service.load(['Universidad']).Universidad).toEqual(settings.Universidad);
    expect(localStorage.getItem('agenda_tasks_v1')).toBe('[{"id":1}]');
  });

  it('schedules advance reminders and the delivery question at the exact due time', () => {
    const task = universityTask({ fecha: '2026-10-15', hora: '18:00' });
    const settings = enabledSettings();

    const reminders = service.calculateSchedule(task, settings, new Date('2026-10-01T00:00:00'));

    expect(reminders.map((reminder) => localDateTime(reminder.scheduledAt))).toEqual([
      '2026-10-08T18:00',
      '2026-10-12T18:00',
      '2026-10-13T18:00',
      '2026-10-14T18:00',
      '2026-10-15T06:00',
      '2026-10-15T15:00',
      '2026-10-15T18:00',
    ]);
    expect(reminders.at(-1)?.type).toBe('due-prompt');
  });

  it('uses 09:00 for a dated task without a time', () => {
    const reminders = service.calculateSchedule(
      universityTask({ fecha: '2026-10-15' }),
      enabledSettings(),
      new Date('2026-10-15T08:00:00'),
    );

    expect(reminders).toHaveLength(1);
    expect(reminders[0].type).toBe('due-prompt');
    expect(reminders[0].scheduledAt.getHours()).toBe(9);
  });

  function enabledSettings(): LabelReminderSettings {
    return {
      ...service.defaultSettings('Universidad'),
      enabled: true,
    };
  }

  function universityTask(overrides: Partial<Task>): Task {
    return {
      id: 1,
      titulo: 'Entregar proyecto',
      tipo: 'tarea',
      prioridad: 'alta',
      estado: 'pendiente',
      etiqueta: 'Universidad',
      repeticion: 'none',
      ...overrides,
    };
  }

  function localDateTime(date: Date): string {
    const part = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
  }
});
