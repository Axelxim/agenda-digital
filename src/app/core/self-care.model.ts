export type SelfCareFilter = 'daily' | 'morning' | 'night' | 'mine';

export interface SelfCareHabit {
  id: string;
  name: string;
  icon: string;
  color: string;
  days: number[];
  times: string[];
  essential: boolean;
  reminders: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SelfCareCompletion {
  id: string;
  habitId: string;
  date: string;
  timeKey: string;
  completedAt: string;
}

export interface SelfCareState {
  enabled: boolean;
  habits: SelfCareHabit[];
  completions: SelfCareCompletion[];
  lowEnergy: boolean;
}
