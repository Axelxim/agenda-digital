export type TaskPriority = 'baja' | 'media' | 'alta';
export type TaskStatus = 'pendiente' | 'completada' | 'vencida' | 'ignorada';
export type TaskRepeat = 'none' | 'daily' | 'weekly' | 'monthly';
export type TaskSyncStatus = 'pending' | 'synced' | 'conflict';
export type RecurrenceScope = 'one' | 'following' | 'all';
export type TaskType = 'evento' | 'tarea';
export type TaskLabel =
  | 'Universidad'
  | 'Trabajo'
  | 'Personal'
  | 'Salud'
  | 'Ocio';
export type ReminderLeadMinutes = 10080 | 4320 | 2880 | 1440 | 720 | 180;

export interface TaskSubtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface LabelReminderSettings {
  label: TaskLabel;
  enabled: boolean;
  advanceMinutes: ReminderLeadMinutes[];
  duePromptEnabled: boolean;
  dateOnlyTime: string;
}

export interface CalculatedLabelReminder {
  type: 'advance' | 'due-prompt';
  scheduledAt: Date;
  offsetMinutes?: ReminderLeadMinutes;
}

export interface Task {
  id: number;
  /** Identificador estable que se conservará entre dispositivos. */
  uuid?: string;
  titulo: string;
  tipo: TaskType;
  fecha?: string;
  hora?: string;
  horaFin?: string;
  duracion?: number;
  color?: string;
  presetId?: number;
  prioridad: TaskPriority;
  estado: TaskStatus;
  etiqueta?: TaskLabel;
  favorita?: boolean;
  repeticion?: TaskRepeat;
  /** Identifica los eventos ya materializados que pertenecen a una misma serie. */
  seriesId?: string;
  /** Fecha original de una ocurrencia que fue movida o editada individualmente. */
  occurrenceDate?: string;
  /** Fechas excluidas de la serie por una edición o cancelación individual. */
  recurrenceExceptions?: string[];
  /** Actividad que agrupa esta tarea dentro del mismo día. */
  parentId?: number;
  subtasks?: TaskSubtask[];
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  syncStatus?: TaskSyncStatus;
}

export interface TaskSection {
  id: 'hoy' | 'manana' | 'proximas' | 'sin-fecha' | 'vencidas';
  titulo: string;
  tareas: Task[];
}

export interface TaskLabelMeta {
  nombre: TaskLabel;
  color: string;
}

export interface EventPreset {
  id: number;
  nombre: string;
  color: string;
  horaInicio: string;
  horaFin: string;
  dias: number[];
  horarios?: EventPresetSchedule[];
}

export interface EventPresetSchedule {
  dia: number;
  horaInicio: string;
  horaFin: string;
}

export interface TaskSummary {
  hoy: number;
  manana: number;
  proximas: number;
  sinFecha: number;
  pendientes: number;
  completadas: number;
}
