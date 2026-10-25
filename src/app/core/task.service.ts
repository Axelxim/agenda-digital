import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { AgendaStorageService } from './agenda-storage.service';
import {
  EventPreset,
  RecurrenceScope,
  Task,
  TaskLabel,
  TaskLabelMeta,
  TaskPriority,
  TaskRepeat,
  TaskSection,
  TaskStatus,
  TaskSummary,
  TaskSubtask,
  TaskType,
} from './task.model';

interface TaskDraft {
  titulo: string;
  tipo?: TaskType;
  fecha?: string;
  hora?: string;
  horaFin?: string;
  duracion?: number;
  color?: string;
  prioridad: TaskPriority;
  etiqueta?: TaskLabel;
  favorita?: boolean;
  repeticion?: TaskRepeat;
  parentId?: number;
  subtasks?: TaskSubtask[];
}

@Injectable({
  providedIn: 'root',
})
export class TaskService {
  private readonly agendaStorage = inject(AgendaStorageService);
  private readonly storageKey = 'tareas';
  private readonly presetsStorageKey = 'eventos-preestablecidos';

  readonly etiquetas: TaskLabelMeta[] = [
    { nombre: 'Universidad', color: '#ef4444' },
    { nombre: 'Trabajo', color: '#f97316' },
    { nombre: 'Personal', color: '#16a34a' },
    { nombre: 'Salud', color: '#2563eb' },
    { nombre: 'Ocio', color: '#8b5cf6' },
  ];

  private tareas: Task[] = [];
  private readonly changesSubject = new Subject<Task[]>();
  readonly changes$ = this.changesSubject.asObservable();

  load(): Task[] {
    const datos = localStorage.getItem(this.storageKey);

    if (datos !== null) {
      try {
        const parsed = JSON.parse(datos) as Partial<Task>[];
        this.tareas = parsed.map((task) => this.normalizeTask(task));
      } catch {
        this.tareas = [];
      }
    } else {
      this.tareas = this.createSeedTasks();
    }

    this.refreshExpired();
    this.save();

    return this.getAll();
  }

  async initializePersistence(): Promise<{ tasks: Task[]; presets: EventPreset[] }> {
    const localPresets = this.loadEventPresets();
    try {
      const stored = await this.agendaStorage.initialize(this.tareas, localPresets);
      this.tareas = stored.tasks.map((task) => this.normalizeTask(task));
      this.refreshExpired();
      const presets = this.normalizePresets(stored.presets);
      localStorage.setItem(this.presetsStorageKey, JSON.stringify(presets));
      this.save();
      return { tasks: this.getAll(), presets };
    } catch (error) {
      console.error('No fue posible inicializar SQLite; se conserva el respaldo local.', error);
      return { tasks: this.getAll(), presets: localPresets };
    }
  }

  getAll(): Task[] {
    return this.tareas.map((tarea) => ({
      ...tarea,
      subtasks: tarea.subtasks?.map((subtask) => ({ ...subtask })),
    }));
  }

  loadEventPresets(): EventPreset[] {
    const stored = localStorage.getItem(this.presetsStorageKey);
    if (!stored) return [];

    try {
      return this.normalizePresets(JSON.parse(stored) as Partial<EventPreset>[]);
    } catch {
      return [];
    }
  }

  saveEventPreset(preset: Omit<EventPreset, 'id'>): EventPreset[] {
    const presets = this.loadEventPresets();
    const next = [...presets, { ...preset, id: Date.now() }];
    localStorage.setItem(this.presetsStorageKey, JSON.stringify(next));
    void this.agendaStorage.savePresets(next);
    return next;
  }

  updateEventPreset(preset: EventPreset): EventPreset[] {
    const next = this.loadEventPresets().map((item) =>
      item.id === preset.id ? preset : item,
    );
    localStorage.setItem(this.presetsStorageKey, JSON.stringify(next));
    void this.agendaStorage.savePresets(next);

    this.tareas = this.tareas.flatMap((tarea) => {
      const matchesPreset =
        tarea.tipo === 'evento' &&
        (tarea.presetId === preset.id || tarea.titulo === preset.nombre);
      if (!matchesPreset || !tarea.fecha) return [tarea];

      const day = (new Date(`${tarea.fecha}T00:00:00`).getDay() + 6) % 7;
      if (!preset.dias.includes(day)) return [];
      const schedule = preset.horarios?.find((item) => item.dia === day);
      const hora = schedule?.horaInicio ?? preset.horaInicio;
      const horaFin = schedule?.horaFin ?? preset.horaFin;
      return [{
        ...tarea,
        presetId: preset.id,
        titulo: preset.nombre,
        color: preset.color,
        hora,
        horaFin,
        duracion: this.durationFromTimes(hora, horaFin),
      }];
    });
    const seenDates = new Set<string>();
    this.tareas = this.tareas.filter((tarea) => {
      if (tarea.tipo !== 'evento' || tarea.presetId !== preset.id || !tarea.fecha) {
        return true;
      }
      const key = `${preset.id}:${tarea.fecha}`;
      if (seenDates.has(key)) return false;
      seenDates.add(key);
      return true;
    });
    this.save();
    return next;
  }

  createPresetEvents(preset: EventPreset, dates: string[]): Task[] {
    const createdAt = Date.now();
    const scheduledEvents = dates.map((fecha) => {
      const day = (new Date(`${fecha}T00:00:00`).getDay() + 6) % 7;
      const schedule = preset.horarios?.find((item) => item.dia === day);
      const horaInicio = schedule?.horaInicio ?? preset.horaInicio;
      const horaFin = schedule?.horaFin ?? preset.horaFin;

      return { fecha, horaInicio, horaFin };
    });

    this.tareas = this.tareas.map((tarea) => {
      const match = scheduledEvents.some(
        (event) =>
          tarea.tipo === 'evento' &&
          tarea.fecha === event.fecha &&
          tarea.titulo === preset.nombre &&
          tarea.hora === event.horaInicio &&
          tarea.horaFin === event.horaFin,
      );
      return match ? { ...tarea, presetId: preset.id } : tarea;
    });
    const existingPresetDates = new Set<string>();
    this.tareas = this.tareas.filter((tarea) => {
      if (tarea.tipo !== 'evento' || tarea.presetId !== preset.id || !tarea.fecha) {
        return true;
      }
      if (existingPresetDates.has(tarea.fecha)) return false;
      existingPresetDates.add(tarea.fecha);
      return true;
    });

    const events = scheduledEvents
      .filter(
        (event) =>
          !this.tareas.some(
            (tarea) =>
              tarea.tipo === 'evento' &&
              tarea.fecha === event.fecha &&
              (tarea.presetId === preset.id ||
                (tarea.titulo === preset.nombre &&
                  tarea.hora === event.horaInicio &&
                  tarea.horaFin === event.horaFin)),
          ),
      )
      .map((event, index) => {
        const { fecha, horaInicio, horaFin } = event;

      return {
      id: createdAt + index,
      titulo: preset.nombre,
      tipo: 'evento' as const,
      fecha,
      hora: horaInicio,
      horaFin,
      duracion: this.durationFromTimes(horaInicio, horaFin),
      color: preset.color,
      presetId: preset.id,
      prioridad: 'media' as const,
      estado: 'pendiente' as const,
      favorita: false,
      repeticion: 'none' as const,
      };
      });

    this.tareas = [...this.tareas, ...events];
    this.save();
    return this.getAll();
  }

  removePresetEvents(preset: EventPreset, dates: string[]): Task[] {
    const datesToRemove = new Set(dates);
    this.tareas = this.tareas.filter(
      (tarea) =>
        !(
          tarea.tipo === 'evento' &&
          tarea.fecha &&
          datesToRemove.has(tarea.fecha) &&
          (tarea.presetId === preset.id || tarea.titulo === preset.nombre)
        ),
    );
    this.save();
    return this.getAll();
  }

  create(draft: TaskDraft): Task[] {
    const titulo = draft.titulo.trim();

    if (!titulo) {
      return this.getAll();
    }

    const id = Date.now();
    const repetition = draft.repeticion ?? 'none';
    this.tareas = [
      ...this.tareas,
      {
        id,
        titulo,
        tipo: draft.tipo ?? 'tarea',
        fecha: this.cleanOptional(draft.fecha),
        hora: this.cleanOptional(draft.hora),
        horaFin: this.cleanOptional(draft.horaFin),
        duracion: this.durationFromTimes(draft.hora, draft.horaFin, draft.duracion),
        color: this.cleanOptional(draft.color),
        prioridad: draft.prioridad,
        estado: 'pendiente',
        etiqueta: draft.etiqueta,
        favorita: draft.favorita ?? false,
        repeticion: repetition,
        seriesId: repetition !== 'none' ? `serie-${id}` : undefined,
        occurrenceDate: this.cleanOptional(draft.fecha),
        parentId: typeof draft.parentId === 'number' ? draft.parentId : undefined,
        subtasks: this.normalizeSubtasks(draft.subtasks),
      },
    ];
    this.save();

    return this.getAll();
  }

  update(id: number, draft: TaskDraft): Task[] {
    const titulo = draft.titulo.trim();

    if (!titulo) {
      return this.getAll();
    }

    this.tareas = this.tareas.map((tarea) => {
      if (tarea.id !== id) return tarea;
      const repetition = draft.repeticion ?? 'none';
      return {
            ...tarea,
            titulo,
            tipo: draft.tipo ?? tarea.tipo,
            fecha: this.cleanOptional(draft.fecha),
            hora: this.cleanOptional(draft.hora),
            horaFin: this.cleanOptional(draft.horaFin),
            duracion: this.durationFromTimes(draft.hora, draft.horaFin, draft.duracion),
            color: this.cleanOptional(draft.color),
            prioridad: draft.prioridad,
            etiqueta: draft.etiqueta,
            favorita: draft.favorita ?? false,
            repeticion: repetition,
            seriesId: repetition !== 'none' ? tarea.seriesId ?? `serie-${id}` : undefined,
            occurrenceDate: this.cleanOptional(draft.fecha),
            recurrenceExceptions: repetition !== 'none' ? tarea.recurrenceExceptions : undefined,
            parentId: typeof draft.parentId === 'number' ? draft.parentId : undefined,
            subtasks: this.normalizeSubtasks(draft.subtasks),
          };
    });
    this.save();

    return this.getAll();
  }

  updateEventWithScope(id: number, draft: TaskDraft, scope: RecurrenceScope): Task[] {
    const target = this.tareas.find((tarea) => tarea.id === id);
    if (!target || target.tipo !== 'evento' || !target.seriesId || target.repeticion === 'none') {
      return this.update(id, draft);
    }

    const occurrenceDate = target.occurrenceDate ?? target.fecha;
    if (!occurrenceDate) return this.update(id, draft);

    if (scope === 'one') {
      return this.detachOccurrence(target, draft, false);
    }

    const title = draft.titulo.trim();
    if (!title) return this.getAll();
    const deltaDays = this.daysBetween(occurrenceDate, draft.fecha ?? occurrenceDate);
    const newSeriesId = scope === 'following' ? `serie-${Date.now()}` : target.seriesId;

    this.tareas = this.tareas.map((tarea) => {
      const belongsToScope =
        tarea.tipo === 'evento' &&
        tarea.seriesId === target.seriesId &&
        tarea.repeticion !== 'none' &&
        !!tarea.fecha &&
        tarea.fecha >= occurrenceDate;
      const belongsToAll =
        tarea.tipo === 'evento' && tarea.seriesId === target.seriesId && tarea.repeticion !== 'none';
      if (!(scope === 'following' ? belongsToScope : belongsToAll)) return tarea;

      const date = tarea.fecha && deltaDays ? this.addDays(tarea.fecha, deltaDays) : tarea.fecha;
      return this.applyEventDraft(tarea, draft, date, newSeriesId);
    });
    this.save();
    return this.getAll();
  }

  cancelEventWithScope(id: number, scope: RecurrenceScope): Task[] {
    const target = this.tareas.find((tarea) => tarea.id === id);
    if (!target || target.tipo !== 'evento' || !target.seriesId || target.repeticion === 'none') {
      return this.discard(id);
    }

    const occurrenceDate = target.occurrenceDate ?? target.fecha;
    if (!occurrenceDate) return this.discard(id);

    if (scope === 'one') {
      return this.detachOccurrence(target, undefined, true);
    }

    const newSeriesId = scope === 'following' ? `serie-${Date.now()}` : target.seriesId;
    this.tareas = this.tareas.map((tarea) => {
      const applies =
        tarea.tipo === 'evento' &&
        tarea.seriesId === target.seriesId &&
        tarea.repeticion !== 'none' &&
        !!tarea.fecha &&
        (scope === 'all' || tarea.fecha >= occurrenceDate);
      return applies
        ? { ...tarea, estado: 'ignorada', seriesId: newSeriesId }
        : tarea;
    });
    this.save();
    return this.getAll();
  }

  delete(id: number): Task[] {
    this.tareas = this.tareas
      .filter((tarea) => tarea.id !== id)
      .map((tarea) => tarea.parentId === id ? { ...tarea, parentId: undefined } : tarea);
    this.save();

    return this.getAll();
  }

  toggleCompleted(id: number): Task[] {
    let completedTask: Task | undefined;
    this.tareas = this.tareas.map((tarea) => {
      if (tarea.id !== id) {
        return tarea;
      }

      const updated: Task = {
        ...tarea,
        estado: tarea.estado === 'completada' ? 'pendiente' : 'completada',
      };
      if (updated.estado === 'completada') completedTask = updated;
      return updated;
    });
    if (completedTask) this.ensureNextTaskOccurrence(completedTask);
    this.save();

    return this.getAll();
  }

  complete(id: number): Task[] {
    let completedTask: Task | undefined;
    this.tareas = this.tareas.map((tarea) => {
      if (tarea.id !== id) return tarea;
      const updated: Task = { ...tarea, estado: 'completada' };
      completedTask = updated;
      return updated;
    });
    if (completedTask) this.ensureNextTaskOccurrence(completedTask);
    this.save();
    return this.getAll();
  }

  findById(id: number): Task | undefined {
    const task = this.tareas.find((item) => item.id === id);
    return task ? { ...task, subtasks: task.subtasks?.map((subtask) => ({ ...subtask })) } : undefined;
  }

  toggleSubtask(taskId: number, subtaskId: string): Task[] {
    this.tareas = this.tareas.map((task) => task.id === taskId
      ? {
          ...task,
          subtasks: task.subtasks?.map((subtask) => subtask.id === subtaskId
            ? { ...subtask, completed: !subtask.completed }
            : subtask),
        }
      : task);
    this.save();
    return this.getAll();
  }

  discard(id: number): Task[] {
    this.tareas = this.tareas.map((tarea) =>
      tarea.id === id ? { ...tarea, estado: 'ignorada' } : tarea,
    );
    this.save();

    return this.getAll();
  }

  reschedule(id: number, fecha?: string, hora?: string, horaFin?: string): Task[] {
    const cleanStart = this.cleanOptional(hora);
    const requestedEnd = this.cleanOptional(horaFin);

    this.tareas = this.tareas.map((tarea) => {
      if (tarea.id !== id) return tarea;

      const end = cleanStart
        ? requestedEnd ?? this.addMinutes(cleanStart, tarea.duracion ?? 60)
        : undefined;

      return {
        ...tarea,
        fecha: this.cleanOptional(fecha),
        hora: cleanStart,
        horaFin: end,
        duracion: this.durationFromTimes(cleanStart, end, tarea.duracion),
        estado: 'pendiente',
      };
    });
    this.save();

    return this.getAll();
  }

  toggleFavorite(id: number): Task[] {
    this.tareas = this.tareas.map((tarea) =>
      tarea.id === id ? { ...tarea, favorita: !tarea.favorita } : tarea,
    );
    this.save();

    return this.getAll();
  }

  getSummary(tareas: Task[] = this.tareas): TaskSummary {
    const today = this.toISODate(new Date());
    const tomorrow = this.addDays(today, 1);
    const taskItems = tareas.filter((tarea) => tarea.tipo === 'tarea');
    const pendientes = taskItems.filter((tarea) => tarea.estado === 'pendiente');
    const programadas = tareas.filter(
      (tarea) => tarea.estado === 'pendiente' && !!tarea.fecha,
    );

    return {
      hoy: programadas.filter((tarea) => tarea.fecha === today).length,
      manana: programadas.filter((tarea) => tarea.fecha === tomorrow).length,
      proximas: programadas.filter(
        (tarea) => tarea.tipo === 'tarea' && tarea.fecha! > tomorrow,
      ).length,
      sinFecha: pendientes.filter((tarea) => !tarea.fecha).length,
      pendientes: pendientes.length,
      completadas: taskItems.filter((tarea) => tarea.estado === 'completada')
        .length,
    };
  }

  getSections(tareas: Task[] = this.tareas): TaskSection[] {
    const today = this.toISODate(new Date());
    const tomorrow = this.addDays(today, 1);
    const pendientes = this.sortTasks(
      tareas.filter(
        (tarea) => tarea.tipo === 'tarea' && tarea.estado === 'pendiente',
      ),
    );
    const programadas = this.sortTasks(
      tareas.filter(
        (tarea) => tarea.estado === 'pendiente' && !!tarea.fecha,
      ),
    );
    const vencidas = this.sortTasks(
      tareas.filter(
        (tarea) => tarea.tipo === 'tarea' && tarea.estado === 'vencida',
      ),
    );
    return [
      {
        id: 'hoy',
        titulo: `Hoy - ${this.formatSectionDate(today)}`,
        tareas: programadas.filter((tarea) => tarea.fecha === today),
      },
      {
        id: 'manana',
        titulo: `Manana - ${this.formatSectionDate(tomorrow)}`,
        tareas: programadas.filter((tarea) => tarea.fecha === tomorrow),
      },
      {
        id: 'proximas',
        titulo: 'Proximas',
        tareas: programadas.filter(
          (tarea) => tarea.fecha! > tomorrow,
        ),
      },
      {
        id: 'sin-fecha',
        titulo: 'Sin fecha',
        tareas: pendientes.filter((tarea) => !tarea.fecha),
      },
      {
        id: 'vencidas',
        titulo: 'Vencidas',
        tareas: vencidas,
      },
    ];
  }

  getTasksForDate(fecha: string, tareas: Task[] = this.tareas): Task[] {
    return this.sortTasks(
      tareas.filter(
        (tarea) => tarea.fecha === fecha && tarea.estado !== 'ignorada',
      ),
    );
  }

  getLabelCount(label: TaskLabel, tareas: Task[] = this.tareas): number {
    return tareas.filter(
      (tarea) =>
        tarea.tipo === 'tarea' &&
        tarea.etiqueta === label &&
        tarea.estado === 'pendiente',
    ).length;
  }

  hasTasksOnDate(fecha: string, tareas: Task[] = this.tareas): boolean {
    return tareas.some(
      (tarea) =>
        tarea.fecha === fecha &&
        tarea.estado !== 'ignorada',
    );
  }

  toISODate(date: Date): string {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  addDays(fecha: string, days: number): string {
    const date = new Date(`${fecha}T00:00:00`);
    date.setDate(date.getDate() + days);

    return this.toISODate(date);
  }

  formatDate(fecha?: string): string {
    if (!fecha) {
      return 'Sin fecha';
    }

    const date = new Date(`${fecha}T00:00:00`);

    return date.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  labelColor(label?: TaskLabel): string {
    return this.etiquetas.find((item) => item.nombre === label)?.color ?? '';
  }

  private detachOccurrence(target: Task, draft?: TaskDraft, cancel = false): Task[] {
    const occurrenceDate = target.occurrenceDate ?? target.fecha;
    this.tareas = this.tareas.map((tarea) =>
      tarea.tipo === 'evento' && tarea.seriesId === target.seriesId
        ? {
            ...tarea,
            recurrenceExceptions: Array.from(new Set([
              ...(tarea.recurrenceExceptions ?? []),
              ...(occurrenceDate ? [occurrenceDate] : []),
            ])),
          }
        : tarea,
    );

    this.tareas = this.tareas.map((tarea) =>
      tarea.id === target.id ? { ...tarea, estado: 'ignorada' } : tarea,
    );

    if (!cancel && draft) {
      const id = Date.now();
      const detached = this.applyEventDraft(target, draft, this.cleanOptional(draft.fecha) ?? target.fecha);
      this.tareas = [
        ...this.tareas,
        {
          ...detached,
          id,
          estado: 'pendiente',
          repeticion: 'none',
          occurrenceDate,
          recurrenceExceptions: undefined,
        },
      ];
    }

    this.save();
    return this.getAll();
  }

  private applyEventDraft(
    tarea: Task,
    draft: TaskDraft,
    fecha = tarea.fecha,
    seriesId = tarea.seriesId,
  ): Task {
    const hora = this.cleanOptional(draft.hora) ?? tarea.hora;
    const horaFin = this.cleanOptional(draft.horaFin) ?? tarea.horaFin;
    return {
      ...tarea,
      titulo: draft.titulo.trim() || tarea.titulo,
      fecha,
      hora,
      horaFin,
      duracion: this.durationFromTimes(hora, horaFin, tarea.duracion),
      color: this.cleanOptional(draft.color) ?? tarea.color,
      etiqueta: draft.etiqueta,
      repeticion: draft.repeticion ?? tarea.repeticion,
      seriesId,
      estado: 'pendiente',
    };
  }

  private daysBetween(from: string, to: string): number {
    const start = new Date(`${from}T00:00:00`).getTime();
    const end = new Date(`${to}T00:00:00`).getTime();
    return Math.round((end - start) / 86400000);
  }

  private save(): void {
    this.tareas = this.applySyncMetadata(this.tareas);
    localStorage.setItem(this.storageKey, JSON.stringify(this.tareas));
    void this.agendaStorage.saveTasks(this.tareas);
    this.changesSubject.next(this.getAll());
  }

  private createSeedTasks(): Task[] {
    const today = this.toISODate(new Date());
    const tomorrow = this.addDays(today, 1);
    const upcoming = this.addDays(today, 3);

    return [
      {
        id: 1,
        titulo: 'Revisar apuntes',
        tipo: 'tarea',
        fecha: today,
        hora: '10:00',
        prioridad: 'alta',
        estado: 'pendiente',
        etiqueta: 'Universidad',
        favorita: true,
        repeticion: 'none',
      },
      {
        id: 2,
        titulo: 'Entrenar',
        tipo: 'tarea',
        fecha: today,
        hora: '12:00',
        prioridad: 'media',
        estado: 'pendiente',
        etiqueta: 'Salud',
        repeticion: 'none',
      },
      {
        id: 3,
        titulo: 'Preparar presentacion',
        tipo: 'tarea',
        fecha: tomorrow,
        hora: '16:00',
        prioridad: 'media',
        estado: 'pendiente',
        etiqueta: 'Trabajo',
        repeticion: 'none',
      },
      {
        id: 4,
        titulo: 'Comprar regalo',
        tipo: 'tarea',
        fecha: upcoming,
        prioridad: 'baja',
        estado: 'pendiente',
        etiqueta: 'Personal',
        repeticion: 'none',
      },
      {
        id: 5,
        titulo: 'Leer 30 minutos',
        tipo: 'tarea',
        prioridad: 'baja',
        estado: 'pendiente',
        etiqueta: 'Personal',
        repeticion: 'none',
      },
    ];
  }

  refreshExpired(reference = new Date()): Task[] {
    const now = reference.getTime();
    let changed = false;
    const expiredTasks: Task[] = [];

    this.tareas = this.tareas.map((tarea) => {
      if (
        tarea.tipo !== 'tarea' ||
        tarea.estado !== 'pendiente' ||
        !tarea.fecha
      ) {
        return tarea;
      }

      let expiredAt: number;
      if (!tarea.hora) {
        expiredAt = new Date(`${this.addDays(tarea.fecha, 1)}T00:00:00`).getTime();
      } else {
        const start = new Date(`${tarea.fecha}T${tarea.hora}:00`);
        if (tarea.horaFin) {
          const end = new Date(`${tarea.fecha}T${tarea.horaFin}:00`);
          if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
          expiredAt = end.getTime();
        } else {
          expiredAt = start.getTime() + this.normalizeDuration(tarea.duracion) * 60_000;
        }
      }

      if (now < expiredAt) return tarea;

      changed = true;
      const expired: Task = { ...tarea, estado: 'vencida' };
      expiredTasks.push(expired);
      return expired;
    });

    if (changed) {
      expiredTasks.forEach((task) => this.ensureNextTaskOccurrence(task));
      this.save();
    }
    return this.getAll();
  }

  private ensureNextTaskOccurrence(task: Task): void {
    const repetition = task.repeticion ?? 'none';
    if (task.tipo !== 'tarea' || repetition === 'none' || !task.fecha) return;

    const seriesId = task.seriesId ?? `serie-${task.id}`;
    const nextDate = this.nextRecurrenceDate(task.fecha, repetition);
    if (
      this.tareas.some((candidate) =>
        candidate.id !== task.id &&
        candidate.seriesId === seriesId &&
        candidate.fecha === nextDate,
      )
    ) {
      return;
    }

    let id = Date.now();
    while (this.tareas.some((candidate) => candidate.id === id)) id += 1;
    const now = new Date().toISOString();
    this.tareas = [
      ...this.tareas,
      {
        ...task,
        id,
        uuid: this.createUuid(),
        fecha: nextDate,
        estado: 'pendiente',
        seriesId,
        occurrenceDate: nextDate,
        parentId: undefined,
        subtasks: task.subtasks?.map((subtask) => ({ ...subtask, completed: false })),
        createdAt: now,
        updatedAt: now,
        version: 1,
        syncStatus: 'pending',
      },
    ];
  }

  private nextRecurrenceDate(fecha: string, repetition: Exclude<TaskRepeat, 'none'>): string {
    if (repetition === 'daily') return this.addDays(fecha, 1);
    if (repetition === 'weekly') return this.addDays(fecha, 7);

    const source = new Date(`${fecha}T00:00:00`);
    const day = source.getDate();
    const nextMonth = new Date(source.getFullYear(), source.getMonth() + 1, 1);
    const lastDay = new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth() + 1,
      0,
    ).getDate();
    nextMonth.setDate(Math.min(day, lastDay));
    return this.toISODate(nextMonth);
  }

  private normalizeTask(task: Partial<Task>): Task {
    const id = typeof task.id === 'number' ? task.id : Date.now();
    const now = new Date().toISOString();
    const tipo = task.tipo === 'evento' ? 'evento' : 'tarea';
    const repeticion = task.repeticion ?? 'none';
    return {
      id,
      uuid: typeof task.uuid === 'string' && task.uuid ? task.uuid : this.createUuid(),
      titulo: typeof task.titulo === 'string' ? task.titulo : 'Tarea sin titulo',
      tipo,
      fecha: this.cleanOptional(task.fecha),
      hora: this.cleanOptional(task.hora),
      horaFin: this.cleanOptional(task.horaFin),
      duracion: this.durationFromTimes(task.hora, task.horaFin, task.duracion),
      color: this.cleanOptional(task.color),
      presetId: typeof task.presetId === 'number' ? task.presetId : undefined,
      prioridad: this.normalizePriority(task.prioridad),
      estado: this.normalizeStatus(task.estado),
      etiqueta: this.normalizeLabel(task.etiqueta),
      favorita: task.favorita ?? false,
      repeticion,
      seriesId: typeof task.seriesId === 'string'
        ? task.seriesId
        : repeticion !== 'none' ? `serie-${id}` : undefined,
      occurrenceDate: this.cleanOptional(task.occurrenceDate),
      recurrenceExceptions: Array.isArray(task.recurrenceExceptions)
        ? task.recurrenceExceptions.filter((date) => typeof date === 'string')
        : undefined,
      parentId: typeof task.parentId === 'number' && task.parentId !== id
        ? task.parentId
        : undefined,
      subtasks: tipo === 'tarea' ? this.normalizeSubtasks(task.subtasks) : undefined,
      createdAt: typeof task.createdAt === 'string' ? task.createdAt : now,
      updatedAt: typeof task.updatedAt === 'string' ? task.updatedAt : now,
      version: typeof task.version === 'number' && task.version > 0 ? task.version : 1,
      syncStatus: task.syncStatus === 'synced' || task.syncStatus === 'conflict'
        ? task.syncStatus
        : 'pending',
    };
  }

  private normalizeSubtasks(subtasks?: TaskSubtask[]): TaskSubtask[] | undefined {
    if (!Array.isArray(subtasks)) return undefined;
    const ids = new Set<string>();
    const normalized = subtasks
      .filter((subtask) => subtask && typeof subtask.title === 'string' && !!subtask.title.trim())
      .map((subtask) => {
        let id = typeof subtask.id === 'string' && subtask.id ? subtask.id : this.createUuid();
        while (ids.has(id)) id = this.createUuid();
        ids.add(id);
        return { id, title: subtask.title.trim(), completed: subtask.completed === true };
      });
    return normalized.length ? normalized : undefined;
  }

  private normalizePresets(presets: Partial<EventPreset>[]): EventPreset[] {
    return presets.filter((preset) => typeof preset.nombre === 'string').map((preset) => ({
      id: typeof preset.id === 'number' ? preset.id : Date.now(),
      nombre: preset.nombre?.trim() || 'Evento',
      color: typeof preset.color === 'string' ? preset.color : '#2563eb',
      horaInicio: typeof preset.horaInicio === 'string' ? preset.horaInicio : '09:00',
      horaFin: typeof preset.horaFin === 'string' ? preset.horaFin : '10:00',
      dias: Array.isArray(preset.dias)
        ? preset.dias.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        : [],
      horarios: Array.isArray(preset.horarios)
        ? preset.horarios.filter((schedule) =>
            typeof schedule?.dia === 'number' &&
            typeof schedule.horaInicio === 'string' &&
            typeof schedule.horaFin === 'string',
          )
        : [],
    }));
  }

  private applySyncMetadata(tasks: Task[]): Task[] {
    const previous = new Map<number, Partial<Task>>();
    try {
      const stored = JSON.parse(localStorage.getItem(this.storageKey) ?? '[]') as Partial<Task>[];
      stored.forEach((task) => {
        if (typeof task.id === 'number') previous.set(task.id, task);
      });
    } catch {
      // A damaged backup must not prevent SQLite from receiving current data.
    }

    const now = new Date().toISOString();
    return tasks.map((task) => {
      const current = this.normalizeTask(task);
      const old = previous.get(task.id);
      if (!old) return current;
      const changed = this.taskPayload(current) !== this.taskPayload(old);
      return {
        ...current,
        uuid: typeof old.uuid === 'string' && old.uuid ? old.uuid : current.uuid,
        createdAt: typeof old.createdAt === 'string' ? old.createdAt : current.createdAt,
        updatedAt: changed ? now : current.updatedAt,
        version: changed ? Math.max(current.version ?? 1, old.version ?? 1) + 1 : current.version,
        syncStatus: changed ? 'pending' : current.syncStatus,
      };
    });
  }

  private taskPayload(task: Partial<Task>): string {
    const { uuid: _uuid, createdAt: _createdAt, updatedAt: _updatedAt, version: _version, syncStatus: _syncStatus, ...payload } = task;
    return JSON.stringify(payload);
  }

  private createUuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private normalizePriority(priority?: TaskPriority): TaskPriority {
    return priority === 'alta' || priority === 'media' || priority === 'baja'
      ? priority
      : 'media';
  }

  private normalizeDuration(duration?: number): number {
    return typeof duration === 'number' && duration > 0 ? duration : 60;
  }

  private durationFromTimes(
    start?: string,
    end?: string,
    fallback?: number,
  ): number {
    if (!start || !end) {
      return this.normalizeDuration(fallback);
    }

    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);
    let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
    if (minutes <= 0) {
      minutes += 24 * 60;
    }

    return minutes;
  }

  private addMinutes(time: string, minutes: number): string {
    const [hour, minute] = time.split(':').map(Number);
    const total = (hour * 60 + minute + minutes) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  private normalizeStatus(status?: TaskStatus): TaskStatus {
    return status === 'pendiente' ||
      status === 'completada' ||
      status === 'vencida' ||
      status === 'ignorada'
      ? status
      : 'pendiente';
  }

  private normalizeLabel(label?: TaskLabel): TaskLabel | undefined {
    return this.etiquetas.some((item) => item.nombre === label)
      ? label
      : undefined;
  }

  private cleanOptional(value?: string): string | undefined {
    const text = value?.trim() ?? '';

    return text ? text : undefined;
  }

  private sortTasks(tareas: Task[]): Task[] {
    return [...tareas].sort((a, b) => {
      if (a.fecha && b.fecha && a.fecha !== b.fecha) {
        return a.fecha.localeCompare(b.fecha);
      }

      if (a.fecha && !b.fecha) {
        return -1;
      }

      if (!a.fecha && b.fecha) {
        return 1;
      }

      if (a.hora && b.hora && a.hora !== b.hora) {
        return a.hora.localeCompare(b.hora);
      }

      if (a.hora && !b.hora) {
        return -1;
      }

      if (!a.hora && b.hora) {
        return 1;
      }

      return this.priorityValue(b.prioridad) - this.priorityValue(a.prioridad);
    });
  }

  private priorityValue(priority: TaskPriority): number {
    switch (priority) {
      case 'alta':
        return 3;
      case 'media':
        return 2;
      case 'baja':
        return 1;
    }
  }

  private formatSectionDate(fecha: string): string {
    const date = new Date(`${fecha}T00:00:00`);
    const formatted = date.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }
}
