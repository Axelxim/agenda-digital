import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

import {
  CalculatedLabelReminder,
  LabelReminderSettings,
  ReminderLeadMinutes,
  Task,
  TaskLabel,
} from './task.model';

@Injectable({ providedIn: 'root' })
export class LabelReminderService {
  private readonly storageKey = 'agenda_label_reminders_v1';
  private readonly changesSubject = new Subject<Record<TaskLabel, LabelReminderSettings>>();
  readonly changes$ = this.changesSubject.asObservable();

  readonly leadOptions: ReadonlyArray<{ minutes: ReminderLeadMinutes; label: string }> = [
    { minutes: 10080, label: '1 semana' },
    { minutes: 4320, label: '3 días' },
    { minutes: 2880, label: '2 días' },
    { minutes: 1440, label: '1 día' },
    { minutes: 720, label: '12 horas' },
    { minutes: 180, label: '3 horas' },
  ];

  load(labels: TaskLabel[]): Record<TaskLabel, LabelReminderSettings> {
    let stored: Partial<Record<TaskLabel, Partial<LabelReminderSettings>>> = {};
    const raw = localStorage.getItem(this.storageKey);

    if (raw) {
      try {
        stored = JSON.parse(raw) as Partial<Record<TaskLabel, Partial<LabelReminderSettings>>>;
      } catch {
        stored = {};
      }
    }

    return labels.reduce((settings, label) => {
      settings[label] = this.normalize(label, stored[label]);
      return settings;
    }, {} as Record<TaskLabel, LabelReminderSettings>);
  }

  save(settings: Record<TaskLabel, LabelReminderSettings>): void {
    localStorage.setItem(this.storageKey, JSON.stringify(settings));
    this.changesSubject.next(settings);
  }

  replaceFromSync(settings: Record<TaskLabel, LabelReminderSettings>): void {
    localStorage.setItem(this.storageKey, JSON.stringify(settings));
    this.changesSubject.next(settings);
  }

  defaultSettings(label: TaskLabel): LabelReminderSettings {
    return {
      label,
      enabled: false,
      advanceMinutes: this.leadOptions.map((option) => option.minutes),
      duePromptEnabled: true,
      dateOnlyTime: '09:00',
    };
  }

  calculateSchedule(
    task: Task,
    settings: LabelReminderSettings,
    now = new Date(),
  ): CalculatedLabelReminder[] {
    if (
      !settings.enabled ||
      !task.fecha ||
      task.estado === 'completada' ||
      task.estado === 'ignorada'
    ) {
      return [];
    }

    const dueAt = new Date(`${task.fecha}T${task.hora || settings.dateOnlyTime}:00`);
    if (Number.isNaN(dueAt.getTime())) return [];

    const reminders: CalculatedLabelReminder[] = settings.advanceMinutes.map((offsetMinutes) => ({
      type: 'advance' as const,
      offsetMinutes,
      scheduledAt: new Date(dueAt.getTime() - offsetMinutes * 60_000),
    }));

    if (settings.duePromptEnabled) {
      reminders.push({ type: 'due-prompt', scheduledAt: dueAt });
    }

    return reminders
      .filter((reminder) => reminder.scheduledAt.getTime() >= now.getTime())
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  }

  private normalize(
    label: TaskLabel,
    stored?: Partial<LabelReminderSettings>,
  ): LabelReminderSettings {
    const defaults = this.defaultSettings(label);
    const allowed = new Set(this.leadOptions.map((option) => option.minutes));
    const advanceMinutes = Array.isArray(stored?.advanceMinutes)
      ? stored.advanceMinutes.filter(
          (minutes): minutes is ReminderLeadMinutes => allowed.has(minutes),
        )
      : defaults.advanceMinutes;
    const dateOnlyTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(stored?.dateOnlyTime ?? '')
      ? stored!.dateOnlyTime!
      : defaults.dateOnlyTime;

    return {
      label,
      enabled: stored?.enabled === true,
      advanceMinutes,
      duePromptEnabled: stored?.duePromptEnabled !== false,
      dateOnlyTime,
    };
  }
}
