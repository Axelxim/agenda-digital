import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';

import { TaskService } from './task.service';

describe('TaskService', () => {
  let service: TaskService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T09:00:00'));
    localStorage.clear();
    localStorage.setItem('tareas', JSON.stringify([
      {
        id: 99,
        titulo: 'Entrega programada',
        tipo: 'tarea',
        fecha: '2026-10-25',
        hora: '10:00',
        horaFin: '11:00',
        duracion: 60,
        prioridad: 'media',
        estado: 'pendiente',
        repeticion: 'daily',
      },
    ]));
    TestBed.configureTestingModule({});
    service = TestBed.inject(TaskService);
    service.load();
  });

  afterEach(() => vi.useRealTimers());

  it('updates both times and duration when rescheduling a task', () => {
    const tasks = service.reschedule(99, '2026-10-26', '14:00', '14:20');
    const updated = tasks.find((task) => task.id === 99);

    expect(updated).toMatchObject({
      fecha: '2026-10-26',
      hora: '14:00',
      horaFin: '14:20',
      duracion: 20,
      estado: 'pendiente',
    });
  });

  it('keeps completed tasks discoverable on their calendar date', () => {
    const tasks = service.toggleCompleted(99);

    expect(service.getTasksForDate('2026-10-25', tasks).map((task) => task.id)).toEqual([99]);
    expect(service.hasTasksOnDate('2026-10-25', tasks)).toBe(true);
  });

  it('creates exactly one next occurrence after completing a recurring task', () => {
    let tasks = service.toggleCompleted(99);
    const completed = tasks.find((task) => task.id === 99)!;
    const next = tasks.find((task) => task.id !== 99)!;

    expect(completed.estado).toBe('completada');
    expect(next).toMatchObject({
      fecha: '2026-10-26',
      hora: '10:00',
      horaFin: '11:00',
      estado: 'pendiente',
      repeticion: 'daily',
      seriesId: completed.seriesId,
    });

    tasks = service.complete(99);
    expect(tasks.filter((task) => task.fecha === '2026-10-26')).toHaveLength(1);
  });

  it('tracks subtasks independently and resets them in the next recurrence', () => {
    service.update(99, {
      titulo: 'Entrega programada',
      tipo: 'tarea',
      fecha: '2026-10-25',
      hora: '10:00',
      horaFin: '11:00',
      prioridad: 'media',
      repeticion: 'daily',
      subtasks: [
        { id: 'step-1', title: 'Preparar archivo', completed: false },
        { id: 'step-2', title: 'Enviar correo', completed: false },
      ],
    });

    let tasks = service.toggleSubtask(99, 'step-1');
    expect(tasks.find((task) => task.id === 99)?.estado).toBe('pendiente');
    expect(tasks.find((task) => task.id === 99)?.subtasks?.[0].completed).toBe(true);

    tasks = service.complete(99);
    const next = tasks.find((task) => task.id !== 99)!;
    expect(next.subtasks?.map((subtask) => subtask.completed)).toEqual([false, false]);
  });

  it('expires a scheduled task when its end time passes', () => {
    service.reschedule(99, '2026-10-24', '07:00', '07:15');

    expect(service.refreshExpired(new Date('2026-10-24T07:14:00'))[0].estado).toBe('pendiente');
    const tasks = service.refreshExpired(new Date('2026-10-24T07:15:00'));
    expect(tasks.find((task) => task.id === 99)?.estado).toBe('vencida');
    expect(tasks.some((task) => task.fecha === '2026-10-25' && task.estado === 'pendiente')).toBe(true);
  });

  it('clamps monthly recurrence to the last valid day', () => {
    service.update(99, {
      titulo: 'Cierre mensual',
      tipo: 'tarea',
      fecha: '2027-01-31',
      hora: '10:00',
      horaFin: '11:00',
      prioridad: 'media',
      repeticion: 'monthly',
    });

    const tasks = service.toggleCompleted(99);
    expect(tasks.some((task) => task.fecha === '2027-02-28' && task.estado === 'pendiente')).toBe(true);
  });

  it('expires a date-only recurring task after that day ends', () => {
    service.update(99, {
      titulo: 'Rutina diaria',
      tipo: 'tarea',
      fecha: '2026-10-24',
      prioridad: 'media',
      repeticion: 'daily',
    });

    expect(service.refreshExpired(new Date('2026-10-24T23:59:00'))[0].estado).toBe('pendiente');
    const tasks = service.refreshExpired(new Date('2026-10-25T00:00:00'));
    expect(tasks.find((task) => task.id === 99)?.estado).toBe('vencida');
    expect(tasks.some((task) => task.fecha === '2026-10-25' && task.estado === 'pendiente')).toBe(true);
  });

  it('preserves the server version and marks a remotely stored task as pending after an edit', () => {
    service.replaceFromSync([{
      ...service.getAll()[0],
      uuid: 'task-cloud-1',
      serverId: 'server-task-1',
      serverVersion: 7,
      syncStatus: 'synced',
    }]);

    const updated = service.update(99, {
      titulo: 'Entrega editada',
      tipo: 'tarea',
      fecha: '2026-10-25',
      hora: '10:00',
      horaFin: '11:00',
      prioridad: 'media',
      repeticion: 'daily',
    })[0];

    expect(updated.serverVersion).toBe(7);
    expect(updated.syncStatus).toBe('pending');
  });

  it('adds synchronization metadata to routines and preserves it when editing', () => {
    const created = service.saveEventPreset({
      nombre: 'Ejercicio',
      color: '#2563eb',
      horaInicio: '07:00',
      horaFin: '08:00',
      dias: [1, 3, 5],
    })[0];

    expect(created.uuid).toBeTruthy();
    expect(created.syncStatus).toBe('pending');

    service.replaceEventPresetsFromSync([{
      ...created,
      serverId: 'server-routine-1',
      serverVersion: 3,
      syncStatus: 'synced',
    }]);
    const updated = service.updateEventPreset({ ...created, nombre: 'Ejercicio diario' })[0];

    expect(updated.serverId).toBe('server-routine-1');
    expect(updated.serverVersion).toBe(3);
    expect(updated.syncStatus).toBe('pending');
  });
});
