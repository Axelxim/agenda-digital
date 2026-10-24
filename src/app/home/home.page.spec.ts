import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Task } from '../core/task.model';
import { TaskService } from '../core/task.service';
import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the next two events and promotes one when it starts', () => {
    component.tareas = [
      {
        id: 1,
        titulo: 'Universidad',
        tipo: 'evento',
        fecha: '2026-10-23',
        hora: '17:00',
        horaFin: '21:00',
        prioridad: 'media',
        estado: 'pendiente',
        repeticion: 'none',
      },
      {
        id: 2,
        titulo: 'Cena',
        tipo: 'evento',
        fecha: '2026-10-23',
        hora: '21:00',
        horaFin: '22:00',
        prioridad: 'media',
        estado: 'pendiente',
        repeticion: 'none',
      },
    ] satisfies Task[];

    component.currentTime = new Date('2026-10-23T16:00:00');
    expect(component.activeEvents).toHaveLength(0);
    expect(component.nextEvent?.titulo).toBe('Universidad');
    expect(component.followingEvent?.titulo).toBe('Cena');

    component.currentTime = new Date('2026-10-23T17:00:00');
    expect(component.activeEvents[0]?.titulo).toBe('Universidad');
    expect(component.nextEvent?.titulo).toBe('Cena');
    expect(component.followingEvent).toBeUndefined();
  });

  it('keeps tomorrow events out of the current-day event cards', () => {
    component.tareas = [
      {
        id: 1,
        titulo: 'Evento de manana',
        tipo: 'evento',
        fecha: '2026-10-24',
        hora: '18:00',
        horaFin: '19:00',
        prioridad: 'media',
        estado: 'pendiente',
        repeticion: 'none',
      },
    ];
    component.currentTime = new Date('2026-10-23T20:00:00');

    expect(component.nextEvent).toBeUndefined();
    expect(component.followingEvent).toBeUndefined();
  });

  it('shows today birthdays independently from the selected calendar date', () => {
    component.currentTime = new Date('2026-10-23T12:00:00');
    component.selectedDate = '2026-11-10';
    component.deviceCalendarTasks = [
      {
        id: -1,
        titulo: 'Cumpleaños de Jocelyn',
        tipo: 'evento',
        fecha: '2026-10-23',
        color: '#c45b86',
        prioridad: 'media',
        estado: 'pendiente',
        repeticion: 'none',
        externalKind: 'birthday',
        externalEventId: '10',
        externalCalendarId: '2',
        originalInstanceStart: new Date('2026-10-23T00:00:00Z').getTime(),
        originalInstanceEnd: new Date('2026-10-24T00:00:00Z').getTime(),
        allDay: true,
        writable: true,
        externalRecurring: true,
      },
    ];

    expect(component.birthdayEventsToday.map((event) => event.titulo)).toEqual([
      'Cumpleaños de Jocelyn',
    ]);
    expect(component.birthdayName(component.birthdayEventsToday[0])).toBe('Jocelyn');
  });

  it('orders home sections without duplicating tasks', () => {
    const service = TestBed.inject(TaskService);
    const today = service.toISODate(new Date());
    const tomorrow = service.addDays(today, 1);
    const upcoming = service.addDays(today, 2);
    component.selectedView = 'hoy';
    component.secciones = service.getSections([
      task(1),
      { ...task(2), fecha: tomorrow },
      { ...task(3), fecha: upcoming },
      { ...task(4, 'vencida'), fecha: today, hora: '08:00' },
      { ...task(5), fecha: today },
      { ...task(6), tipo: 'evento', fecha: tomorrow, hora: '18:00', horaFin: '19:00' },
    ]).filter((section) => section.tareas.length > 0);

    expect(component.visibleSections.map((section) => section.id)).toEqual([
      'sin-fecha',
      'proximas',
      'manana',
      'vencidas',
    ]);
    expect(component.visibleSections.flatMap((section) => section.tareas).map((item) => item.id)).toEqual([1, 3, 6, 2, 4]);
    expect(component.visibleSections.find((section) => section.id === 'manana')?.tareas.some((item) => item.tipo === 'evento')).toBe(true);
    expect(service.getSummary(component.secciones.flatMap((section) => section.tareas)).manana).toBe(2);
  });

  it('keeps only one home task expanded', () => {
    const first = task(1);
    const second = task(2);

    component.toggleTaskActions(first);
    expect(component.isTaskActionsExpanded(first)).toBe(true);
    component.toggleTaskActions(second);
    expect(component.isTaskActionsExpanded(first)).toBe(false);
    expect(component.isTaskActionsExpanded(second)).toBe(true);
    component.toggleTaskActions(second);
    expect(component.expandedTaskId).toBeNull();
  });

  it('classifies the task tabs without mixing events or states', () => {
    component.tareas = [
      task(1),
      { ...task(2), fecha: '2026-10-24' },
      { ...task(3, 'vencida'), fecha: '2026-10-22' },
      task(4, 'completada'),
      { ...task(5), tipo: 'evento', fecha: '2026-10-24' },
    ];

    component.pendingFilter = 'pendientes';
    expect(component.filteredTasks.map((item) => item.id)).toEqual([1]);
    component.pendingFilter = 'programadas';
    expect(component.filteredTasks.map((item) => item.id)).toEqual([2]);
    component.pendingFilter = 'vencidas';
    expect(component.filteredTasks.map((item) => item.id)).toEqual([3]);
    component.pendingFilter = 'completadas';
    expect(component.filteredTasks.map((item) => item.id)).toEqual([4]);
  });

  function task(id: number, estado: Task['estado'] = 'pendiente'): Task {
    return {
      id,
      titulo: `Tarea ${id}`,
      tipo: 'tarea',
      prioridad: 'media',
      estado,
      repeticion: 'none',
    };
  }
});
