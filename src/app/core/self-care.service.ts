import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { SelfCareCompletion, SelfCareHabit, SelfCareState } from './self-care.model';

@Injectable({ providedIn: 'root' })
export class SelfCareService {
  private readonly key = 'agenda_self_care_v1';
  private state: SelfCareState = { enabled: false, habits: [], completions: [], lowEnergy: false };
  private readonly changesSubject = new Subject<SelfCareState>();
  readonly changes$ = this.changesSubject.asObservable();

  load(): SelfCareState {
    try {
      const stored = JSON.parse(localStorage.getItem(this.key) ?? '{}') as Partial<SelfCareState>;
      this.state = {
        enabled: stored.enabled === true,
        habits: Array.isArray(stored.habits) ? stored.habits.map((habit) => this.normalizeHabit(habit)) : [],
        completions: Array.isArray(stored.completions) ? stored.completions.filter(this.isCompletion) : [],
        lowEnergy: stored.lowEnergy === true,
      };
    } catch {
      this.state = { enabled: false, habits: [], completions: [], lowEnergy: false };
    }
    this.persist(false);
    return this.getState();
  }

  getState(): SelfCareState {
    return {
      enabled: this.state.enabled,
      habits: this.state.habits.map((habit) => ({ ...habit, days: [...habit.days], times: [...habit.times] })),
      completions: this.state.completions.map((completion) => ({ ...completion })),
      lowEnergy: this.state.lowEnergy,
    };
  }

  saveHabit(draft: Omit<SelfCareHabit, 'id' | 'createdAt' | 'updatedAt'>, id?: string): SelfCareState {
    const existing = id ? this.state.habits.find((habit) => habit.id === id) : undefined;
    const now = new Date().toISOString();
    const habit = this.normalizeHabit({ ...draft, id: existing?.id ?? this.id(), createdAt: existing?.createdAt ?? now, updatedAt: now });
    if (!habit.name) return this.getState();
    this.state.habits = existing
      ? this.state.habits.map((item) => item.id === existing.id ? habit : item)
      : [...this.state.habits, habit];
    this.persist();
    return this.getState();
  }

  deleteHabit(id: string): SelfCareState {
    this.state.habits = this.state.habits.filter((habit) => habit.id !== id);
    this.state.completions = this.state.completions.filter((completion) => completion.habitId !== id);
    this.persist();
    return this.getState();
  }

  toggleCompletion(habitId: string, date: string, timeKey: string): SelfCareState {
    const existing = this.state.completions.find((item) => item.habitId === habitId && item.date === date && item.timeKey === timeKey);
    this.state.completions = existing
      ? this.state.completions.filter((item) => item.id !== existing.id)
      : [...this.state.completions, { id: this.id(), habitId, date, timeKey, completedAt: new Date().toISOString() }];
    this.persist();
    return this.getState();
  }

  setLowEnergy(lowEnergy: boolean): SelfCareState {
    this.state.lowEnergy = lowEnergy;
    this.persist();
    return this.getState();
  }

  setEnabled(enabled: boolean): SelfCareState {
    this.state.enabled = enabled;
    this.persist();
    return this.getState();
  }

  private persist(emit = true): void {
    localStorage.setItem(this.key, JSON.stringify(this.state));
    if (emit) this.changesSubject.next(this.getState());
  }

  private normalizeHabit(value: Partial<SelfCareHabit>): SelfCareHabit {
    const now = new Date().toISOString();
    const days = Array.isArray(value.days) ? value.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [0, 1, 2, 3, 4, 5, 6];
    const times = Array.isArray(value.times) ? value.times.filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) : [];
    return { id: value.id || this.id(), name: value.name?.trim() || '', icon: value.icon || '✨', color: value.color || '#8b5cf6', days: days.length ? days : [0,1,2,3,4,5,6], times, essential: value.essential === true, reminders: value.reminders === true, createdAt: value.createdAt || now, updatedAt: value.updatedAt || now };
  }

  private isCompletion = (value: unknown): value is SelfCareCompletion => {
    const item = value as Partial<SelfCareCompletion>;
    return !!item && typeof item.id === 'string' && typeof item.habitId === 'string' && typeof item.date === 'string' && typeof item.timeKey === 'string';
  };

  private id(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `care-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
