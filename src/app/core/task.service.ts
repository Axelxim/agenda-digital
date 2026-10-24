import { Injectable } from '@angular/core';
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
}

@Injectable({
  providedIn: 'root',
})
export class TaskService {
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

  getAll(): Task[] {
    return this.tareas.map((tarea) => ({ ...tarea }));
  }

  loadEventPresets(): EventPreset[] {
    const stored = localStorage.getItem(this.presetsStorageKey);
    if (!stored) return [];

    try {
      const parsed = JSON.parse(stored) as Partial<EventPreset>[];
      return parsed.filter((preset) => typeof preset.nombre === 'string').map((preset) => ({
        id: typeof preset.id === 'number' ? preset.id : Date.now(),
        nombre: preset.nombre?.trim() || 'Evento',
        color: typeof preset.color === 'string' ? preset.color : '#2563eb',
        horaInicio: typeof preset.horaInicio === 'string' ? preset.horaInicio : '09:00',
        horaFin: typeof preset.horaFin === 'string' ? preset.horaFin : '10:00',
        dias: Array.isArray(preset.dias) ? preset.dias.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [],
          horarios: Array.isArray(preset.horarios)
            ? preset.horarios.filter((schedule) =>
                typeof schedule?.dia === 'number' &&
                typeof schedule.horaInicio === 'string' &&
                typeof schedule.horaFin === 'string',
              )
            : [],
      }));
    } catch {
      return [];
    }
  }

  saveEventPreset(preset: Omit<EventPreset, 'id'>): EventPreset[] {
    const presets = this.loadEventPresets();
    const next = [...presets, { ...preset, id: Date.now() }];
    localStorage.setItem(this.presetsStorageKey, JSON.stringify(next));
    return next;
  }

  updateEventPreset(preset: EventPreset): EventPreset[] {
    const next = this.loadEventPresets().map((item) =>
      item.id === preset.id ? preset : item,
    );
    localStorage.setItem(this.presetsStorageKey, JSON.stringify(next));

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
        seriesId: draft.tipo === 'evento' && repetition !== 'none' ? `serie-${id}` : undefined,
        occurrenceDate: this.cleanOptional(draft.fecha),
        parentId: typeof draft.parentId === 'number' ? draft.parentId : undefined,
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

    this.tareas = this.tareas.map((tarea) =>
      tarea.id === id
        ? {
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
            repeticion: draft.repeticion ?? 'none',
            parentId: typeof draft.parentId === 'number' ? draft.parentId : undefined,
          }
        : tarea,
    );
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
    this.tareas = this.tareas.map((tarea) => {
      if (tarea.id !== id) {
        return tarea;
      }

      return {
        ...tarea,
        estado: tarea.estado === 'completada' ? 'pendiente' : 'completada',
      };
    });
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

  reschedule(id: number, fecha?: string, hora?: string): Task[] {
    this.tareas = this.tareas.map((tarea) =>
      tarea.id === id
        ? {
            ...tarea,
            fecha: this.cleanOptional(fecha),
            hora: this.cleanOptional(hora),
          horaFin: hora ? this.addMinutes(hora, tarea.duracion ?? 60) : tarea.horaFin,
            estado: 'pendiente',
          }
        : tarea,
    );
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
        (tarea) => tarea.fecha! > tomorrow,
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
        tarea.estado === 'pendiente',
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
    localStorage.setItem(this.storageKey, JSON.stringify(this.tareas));
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

  private refreshExpired(): void {
    const now = Date.now();

    this.tareas = this.tareas.map((tarea) => {
      if (tarea.estado !== 'pendiente' || !tarea.fecha || !tarea.hora) {
        return tarea;
      }

      const taskTime = new Date(`${tarea.fecha}T${tarea.hora}`).getTime();
      const expiredAt = taskTime + 3600000;

      return now >= expiredAt ? { ...tarea, estado: 'vencida' } : tarea;
    });
  }

  private normalizeTask(task: Partial<Task>): Task {
    const id = typeof task.id === 'number' ? task.id : Date.now();
    const tipo = task.tipo === 'evento' ? 'evento' : 'tarea';
    const repeticion = task.repeticion ?? 'none';
    return {
      id,
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
        : tipo === 'evento' && repeticion !== 'none' ? `serie-${id}` : undefined,
      occurrenceDate: this.cleanOptional(task.occurrenceDate),
      recurrenceExceptions: Array.isArray(task.recurrenceExceptions)
        ? task.recurrenceExceptions.filter((date) => typeof date === 'string')
        : undefined,
      parentId: typeof task.parentId === 'number' && task.parentId !== id
        ? task.parentId
        : undefined,
    };
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
