import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription, debounceTime, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { EventPreset, Task, TaskRepeat, TaskStatus } from './task.model';
import { TaskService } from './task.service';

export type AgendaSyncStatus = 'local' | 'syncing' | 'synced' | 'pending' | 'offline' | 'error';
export type AgendaSyncPreference = 'enabled' | 'local';

interface ServerSubtask {
  id: string;
  id_cliente: string;
  titulo: string;
  completada: boolean;
  version: number;
  eliminado?: boolean;
}

interface ServerAgendaItem {
  id: string;
  id_cliente: string;
  titulo: string;
  tipo: 'tarea' | 'evento';
  fecha_programada?: string | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  duracion_minutos?: number | null;
  color?: string | null;
  rutina_id?: string | null;
  prioridad: 'baja' | 'media' | 'alta';
  estado: TaskStatus;
  etiqueta?: Task['etiqueta'] | null;
  favorita: boolean;
  repeticion: 'ninguna' | 'diaria' | 'semanal' | 'mensual';
  serie_id?: string | null;
  fecha_ocurrencia?: string | null;
  excepciones_repeticion?: string[];
  padre_id?: string | null;
  version: number;
  creado_en?: string;
  actualizado_en?: string;
  eliminado?: boolean;
  subtareas?: ServerSubtask[];
}

interface ServerSchedule {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

interface ServerRoutine {
  id: string;
  id_cliente: string;
  nombre: string;
  color: string;
  hora_inicio_predeterminada: string;
  hora_fin_predeterminada: string;
  activa: boolean;
  version: number;
  actualizado_en?: string;
  eliminada?: boolean;
  horarios?: ServerSchedule[];
}

interface SyncSnapshotEntry {
  id: string;
  version: number;
}

interface SyncSnapshot {
  tasks: Record<string, SyncSnapshotEntry>;
  routines: Record<string, SyncSnapshotEntry>;
}

@Injectable({ providedIn: 'root' })
export class AgendaSyncService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly tasks = inject(TaskService);
  private readonly currentStatus = signal<AgendaSyncStatus>('local');
  private readonly subscriptions = new Subscription();
  private started = false;
  private running = false;
  private rerunRequested = false;
  private ignoreNextTaskChange = false;
  private ignoreNextRoutineChange = false;
  private readonly ownerStorageKey = 'todo-en-orden-sync-owner';
  private readonly preferencePrefix = 'todo-en-orden-sync-preference:';
  private readonly currentPreference = signal<AgendaSyncPreference | null>(this.readPreference());

  readonly status = this.currentStatus.asReadonly();
  readonly preference = this.currentPreference.asReadonly();
  readonly enabled = computed(() => this.currentPreference() === 'enabled');
  readonly statusLabel = computed(() => ({
    local: 'Sin sincronización',
    syncing: 'Sincronizando…',
    synced: 'Sincronizado',
    pending: 'Cambios pendientes',
    offline: 'Sin conexión · cambios guardados',
    error: 'No se pudo sincronizar',
  })[this.currentStatus()]);

  start(): void {
    if (!this.started) {
      this.started = true;
      this.subscriptions.add(
        this.tasks.changes$.pipe(debounceTime(900)).subscribe(() => {
          if (this.ignoreNextTaskChange) {
            this.ignoreNextTaskChange = false;
            return;
          }
          this.onLocalChange();
        }),
      );
      this.subscriptions.add(
        this.tasks.presetsChanges$.pipe(debounceTime(900)).subscribe(() => {
          if (this.ignoreNextRoutineChange) {
            this.ignoreNextRoutineChange = false;
            return;
          }
          this.onLocalChange();
        }),
      );
      window.addEventListener('online', this.onlineListener);
    }

    void this.syncNow();
  }

  hasPreference(): boolean {
    const preference = this.readPreference();
    this.currentPreference.set(preference);
    return preference !== null;
  }

  enable(): void {
    this.savePreference('enabled');
    void this.syncNow();
  }

  disable(): void {
    this.savePreference('local');
    this.rerunRequested = false;
    this.currentStatus.set('local');
  }

  async syncNow(): Promise<void> {
    if (!this.auth.isAuthenticated() || !this.auth.user() || this.readPreference() !== 'enabled') {
      this.currentStatus.set('local');
      return;
    }
    if (this.running) {
      this.rerunRequested = true;
      return;
    }

    this.running = true;
    this.currentStatus.set('syncing');
    try {
      const userId = this.auth.user()!.id;
      const previousOwner = localStorage.getItem(this.ownerStorageKey);
      const accountChanged = previousOwner !== null && previousOwner !== userId;

      await this.syncRoutines(userId, accountChanged);
      await this.syncAgenda(userId, accountChanged);
      localStorage.setItem(this.ownerStorageKey, userId);
      this.currentStatus.set(this.readPreference() === 'enabled' ? 'synced' : 'local');
    } catch (error) {
      console.error('No fue posible sincronizar la agenda.', error);
      this.currentStatus.set(navigator.onLine ? 'error' : 'offline');
    } finally {
      this.running = false;
      if (this.rerunRequested) {
        this.rerunRequested = false;
        void this.syncNow();
      }
    }
  }

  private onLocalChange(): void {
    if (!this.auth.isAuthenticated() || this.readPreference() !== 'enabled') {
      return;
    }
    this.currentStatus.set(navigator.onLine ? 'pending' : 'offline');
    void this.syncNow();
  }

  private readonly onlineListener = () => void this.syncNow();

  private async syncRoutines(userId: string, downloadOnly: boolean): Promise<void> {
    const local = this.tasks.loadEventPresets();
    const snapshot = this.readSnapshot(userId);
    let conflictIds = new Set<string>();

    if (!downloadOnly) {
      const localIds = new Set(local.map((routine) => routine.uuid));
      const deletions = Object.entries(snapshot.routines)
        .filter(([uuid]) => !localIds.has(uuid))
        .map(([uuid, entry]) => ({
          id_cliente: uuid,
          version_base: entry.version,
          eliminada: true,
        }));
      const changes = local
        .filter((routine) => routine.syncStatus !== 'synced' || !routine.serverId)
        .map((routine) => this.routinePayload(routine));

      if (changes.length || deletions.length) {
        const result = await firstValueFrom(this.http.post<{
          data: { conflictos: ServerRoutine[] };
        }>(`${environment.apiUrl}/rutinas/sincronizar`, {
          rutinas: [...changes, ...deletions],
        }));
        conflictIds = new Set(result.data.conflictos.map((routine) => routine.id_cliente));
      }
    }

    const response = await firstValueFrom(this.http.get<{
      data: { rutinas: ServerRoutine[] };
    }>(`${environment.apiUrl}/rutinas`));
    const merged = this.mergeRoutines(local, response.data.rutinas, downloadOnly, conflictIds);
    this.ignoreNextRoutineChange = true;
    this.tasks.replaceEventPresetsFromSync(merged);

    snapshot.routines = Object.fromEntries(response.data.rutinas
      .filter((routine) => !routine.eliminada)
      .map((routine) => [routine.id_cliente, { id: routine.id, version: Number(routine.version) }]));
    this.writeSnapshot(userId, snapshot);
  }

  private async syncAgenda(userId: string, downloadOnly: boolean): Promise<void> {
    const local = this.tasks.getAll();
    const routines = this.tasks.loadEventPresets();
    const snapshot = this.readSnapshot(userId);
    let conflictIds = new Set<string>();

    if (!downloadOnly) {
      const localIds = new Set(local.map((task) => task.uuid));
      const deletions = Object.entries(snapshot.tasks)
        .filter(([uuid]) => !localIds.has(uuid))
        .map(([uuid, entry]) => ({
          id_cliente: uuid,
          version_base: entry.version,
          eliminado: true,
        }));
      const changes = local
        .filter((task) => task.syncStatus !== 'synced' || !task.serverId)
        .map((task) => this.taskPayload(task, local, routines));

      if (changes.length || deletions.length) {
        const result = await firstValueFrom(this.http.post<{
          data: { conflictos: ServerAgendaItem[] };
        }>(`${environment.apiUrl}/agenda/sincronizar`, {
          elementos: [...changes, ...deletions],
        }));
        conflictIds = new Set(result.data.conflictos.map((task) => task.id_cliente));
      }
    }

    const response = await firstValueFrom(this.http.get<{
      data: { elementos: ServerAgendaItem[] };
    }>(`${environment.apiUrl}/agenda`));
    const merged = this.mergeTasks(local, response.data.elementos, routines, downloadOnly, conflictIds);
    this.ignoreNextTaskChange = true;
    this.tasks.replaceFromSync(merged);

    snapshot.tasks = Object.fromEntries(response.data.elementos
      .filter((task) => !task.eliminado)
      .map((task) => [task.id_cliente, { id: task.id, version: Number(task.version) }]));
    this.writeSnapshot(userId, snapshot);
  }

  private routinePayload(routine: EventPreset): Record<string, unknown> {
    const schedules = routine.horarios?.length
      ? routine.horarios
      : routine.dias.map((day) => ({
        dia: day,
        horaInicio: routine.horaInicio,
        horaFin: routine.horaFin,
      }));

    return {
      id_cliente: routine.uuid,
      version_base: routine.serverVersion ?? 0,
      nombre: routine.nombre,
      color: routine.color,
      hora_inicio_predeterminada: routine.horaInicio,
      hora_fin_predeterminada: routine.horaFin,
      activa: true,
      horarios: schedules.map((schedule) => ({
        dia_semana: schedule.dia,
        hora_inicio: schedule.horaInicio,
        hora_fin: schedule.horaFin,
      })),
    };
  }

  private taskPayload(task: Task, allTasks: Task[], routines: EventPreset[]): Record<string, unknown> {
    const parent = allTasks.find((candidate) => candidate.id === task.parentId);
    const routine = routines.find((candidate) => candidate.id === task.presetId);
    return {
      id_cliente: task.uuid,
      version_base: task.serverVersion ?? 0,
      titulo: task.titulo,
      tipo: task.tipo,
      fecha_programada: task.fecha ?? null,
      hora_inicio: task.hora ?? null,
      hora_fin: task.horaFin ?? null,
      duracion_minutos: task.duracion ?? null,
      color: task.color ?? null,
      rutina_id: routine?.serverId ?? null,
      prioridad: task.prioridad,
      estado: task.estado,
      etiqueta: task.etiqueta ?? null,
      favorita: task.favorita ?? false,
      repeticion: task.repeticion ?? 'none',
      serie_id: task.seriesId ?? null,
      fecha_ocurrencia: task.occurrenceDate ?? null,
      excepciones_repeticion: task.recurrenceExceptions ?? [],
      padre_id: parent?.serverId ?? null,
      subtareas: (task.subtasks ?? []).map((subtask, position) => ({
        id_cliente: subtask.id,
        version_base: subtask.serverVersion ?? 0,
        titulo: subtask.title,
        completada: subtask.completed,
        posicion: position,
      })),
    };
  }

  private mergeRoutines(
    local: EventPreset[],
    remote: ServerRoutine[],
    downloadOnly: boolean,
    conflictIds: Set<string>,
  ): EventPreset[] {
    const localByUuid = new Map(local.map((routine) => [routine.uuid, routine]));
    const represented = new Set<string>();
    const usedIds = new Set(local.map((routine) => routine.id));
    const merged: EventPreset[] = [];

    for (const routine of remote) {
      represented.add(routine.id_cliente);
      if (routine.eliminada) continue;
      const previous = localByUuid.get(routine.id_cliente);
      const id = previous?.id ?? this.nextNumericId(usedIds);
      usedIds.add(id);
      merged.push({
        id,
        uuid: routine.id_cliente,
        serverId: routine.id,
        serverVersion: Number(routine.version),
        syncStatus: 'synced',
        updatedAt: routine.actualizado_en,
        nombre: routine.nombre,
        color: routine.color,
        horaInicio: this.shortTime(routine.hora_inicio_predeterminada),
        horaFin: this.shortTime(routine.hora_fin_predeterminada),
        dias: (routine.horarios ?? []).map((schedule) => Number(schedule.dia_semana)),
        horarios: (routine.horarios ?? []).map((schedule) => ({
          dia: Number(schedule.dia_semana),
          horaInicio: this.shortTime(schedule.hora_inicio),
          horaFin: this.shortTime(schedule.hora_fin),
        })),
      });
    }

    if (!downloadOnly) {
      merged.push(...local.filter((routine) => !represented.has(routine.uuid ?? '')));
      for (const routine of local.filter((item) => conflictIds.has(item.uuid ?? ''))) {
        const id = this.nextNumericId(usedIds);
        usedIds.add(id);
        merged.push({
          ...routine,
          id,
          uuid: this.createUuid(),
          serverId: undefined,
          serverVersion: 0,
          syncStatus: 'pending',
          nombre: `${routine.nombre} (copia local)`,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return merged;
  }

  private mergeTasks(
    local: Task[],
    remote: ServerAgendaItem[],
    routines: EventPreset[],
    downloadOnly: boolean,
    conflictIds: Set<string>,
  ): Task[] {
    const localByUuid = new Map(local.map((task) => [task.uuid, task]));
    const routineByServerId = new Map(routines.map((routine) => [routine.serverId, routine.id]));
    const represented = new Set<string>();
    const usedIds = new Set(local.map((task) => task.id));
    const serverToLocal = new Map<string, number>();
    const merged: Task[] = [];

    for (const task of remote) {
      represented.add(task.id_cliente);
      if (task.eliminado) continue;
      const previous = localByUuid.get(task.id_cliente);
      const id = previous?.id ?? this.nextNumericId(usedIds);
      usedIds.add(id);
      serverToLocal.set(task.id, id);
      merged.push({
        id,
        uuid: task.id_cliente,
        serverId: task.id,
        serverVersion: Number(task.version),
        titulo: task.titulo,
        tipo: task.tipo,
        fecha: task.fecha_programada ?? undefined,
        hora: this.optionalShortTime(task.hora_inicio),
        horaFin: this.optionalShortTime(task.hora_fin),
        duracion: task.duracion_minutos ?? undefined,
        color: task.color ?? undefined,
        presetId: task.rutina_id ? routineByServerId.get(task.rutina_id) : previous?.presetId,
        prioridad: task.prioridad,
        estado: task.estado,
        etiqueta: task.etiqueta ?? undefined,
        favorita: task.favorita,
        repeticion: this.localRepeat(task.repeticion),
        seriesId: task.serie_id ?? undefined,
        occurrenceDate: task.fecha_ocurrencia ?? undefined,
        recurrenceExceptions: task.excepciones_repeticion ?? undefined,
        parentId: previous?.parentId,
        subtasks: (task.subtareas ?? [])
          .filter((subtask) => !subtask.eliminado)
          .map((subtask) => ({
            id: subtask.id_cliente,
            title: subtask.titulo,
            completed: subtask.completada,
            serverId: subtask.id,
            serverVersion: Number(subtask.version),
          })),
        createdAt: task.creado_en,
        updatedAt: task.actualizado_en,
        version: previous?.version ?? 1,
        syncStatus: 'synced',
      });
    }

    remote.forEach((task) => {
      if (!task.eliminado && task.padre_id) {
        const localTask = merged.find((candidate) => candidate.serverId === task.id);
        if (localTask) localTask.parentId = serverToLocal.get(task.padre_id);
      }
    });

    if (!downloadOnly) {
      merged.push(...local.filter((task) => !represented.has(task.uuid ?? '')));
      for (const task of local.filter((item) => conflictIds.has(item.uuid ?? ''))) {
        const id = this.nextNumericId(usedIds);
        usedIds.add(id);
        merged.push({
          ...task,
          id,
          uuid: this.createUuid(),
          serverId: undefined,
          serverVersion: 0,
          syncStatus: 'pending',
          titulo: `${task.titulo} (copia local)`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return merged;
  }

  private readSnapshot(userId: string): SyncSnapshot {
    try {
      const stored = JSON.parse(localStorage.getItem(this.snapshotKey(userId)) ?? '{}') as Partial<SyncSnapshot>;
      return { tasks: stored.tasks ?? {}, routines: stored.routines ?? {} };
    } catch {
      return { tasks: {}, routines: {} };
    }
  }

  private writeSnapshot(userId: string, snapshot: SyncSnapshot): void {
    localStorage.setItem(this.snapshotKey(userId), JSON.stringify(snapshot));
  }

  private snapshotKey(userId: string): string {
    return `todo-en-orden-sync-snapshot:${userId}`;
  }

  private readPreference(): AgendaSyncPreference | null {
    const userId = this.auth?.user()?.id;
    if (!userId) return null;
    const value = localStorage.getItem(`${this.preferencePrefix}${userId}`);
    return value === 'enabled' || value === 'local' ? value : null;
  }

  private savePreference(preference: AgendaSyncPreference): void {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    localStorage.setItem(`${this.preferencePrefix}${userId}`, preference);
    this.currentPreference.set(preference);
  }

  private shortTime(value: string): string {
    return value.slice(0, 5);
  }

  private optionalShortTime(value?: string | null): string | undefined {
    return value ? this.shortTime(value) : undefined;
  }

  private localRepeat(value: ServerAgendaItem['repeticion']): TaskRepeat {
    return ({ ninguna: 'none', diaria: 'daily', semanal: 'weekly', mensual: 'monthly' } as const)[value];
  }

  private nextNumericId(used: Set<number>): number {
    let id = Date.now();
    while (used.has(id)) id += 1;
    return id;
  }

  private createUuid(): string {
    return typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `sync-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
