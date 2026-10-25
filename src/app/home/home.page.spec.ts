import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Task } from '../core/task.model';
import { TaskService } from '../core/task.service';
import { WalletService } from '../core/wallet.service';
import { HomePage } from './home.page';

const localIsoDate = (date: Date): string => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

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

  it('shows a scheduled task as the next item for today', () => {
    component.tareas = [
      {
        id: 1,
        titulo: 'Test',
        tipo: 'tarea',
        fecha: '2026-10-24',
        hora: '07:00',
        horaFin: '07:15',
        prioridad: 'media',
        estado: 'pendiente',
        repeticion: 'none',
      },
    ];
    component.currentTime = new Date('2026-10-24T06:58:00');

    expect(component.nextEvent?.titulo).toBe('Test');
    expect(component.followingEvent).toBeUndefined();
  });

  it('keeps completed scheduled tasks visible in the calendar', () => {
    component.selectedDate = '2026-10-24';
    component.tareas = [
      {
        ...task(1, 'completada'),
        fecha: '2026-10-24',
        hora: '07:00',
        horaFin: '07:15',
      },
    ];

    expect(component.selectedDateTasks.map((item) => item.id)).toEqual([1]);
    expect(component.tasksForHour('07:00').map((item) => item.id)).toEqual([1]);
  });

  it('does not show completed or expired tasks in the current-day event cards', () => {
    component.tareas = [
      {
        id: 1,
        titulo: 'Completada',
        tipo: 'tarea',
        fecha: '2026-10-24',
        hora: '07:00',
        prioridad: 'media',
        estado: 'completada',
        repeticion: 'none',
      },
      {
        id: 2,
        titulo: 'Vencida',
        tipo: 'tarea',
        fecha: '2026-10-24',
        hora: '08:00',
        prioridad: 'media',
        estado: 'vencida',
        repeticion: 'none',
      },
    ];
    component.currentTime = new Date('2026-10-24T06:58:00');

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

  it('searches tasks and device birthdays without requiring accents', () => {
    component.tareas = [{ ...task(1), titulo: 'Comprar medicina', etiqueta: 'Salud' }];
    component.deviceCalendarTasks = [{
      id: -2,
      titulo: 'Cumpleaños de José',
      tipo: 'evento',
      fecha: '2026-10-24',
      prioridad: 'media',
      estado: 'pendiente',
      repeticion: 'none',
      externalKind: 'birthday',
      externalEventId: 'birthday-2',
      externalCalendarId: 'calendar-1',
      originalInstanceStart: new Date('2026-10-24T00:00:00Z').getTime(),
      originalInstanceEnd: new Date('2026-10-25T00:00:00Z').getTime(),
      allDay: true,
      writable: true,
      externalRecurring: true,
    }];

    component.globalSearchQuery = 'jose';
    expect(component.globalSearchResults.map((result) => result.kind)).toEqual(['birthday']);
    expect(component.globalSearchResults[0].title).toBe('José');

    component.globalSearchQuery = 'salud';
    expect(component.globalSearchResults.map((result) => result.title)).toContain('Comprar medicina');
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
      { ...task(7), tipo: 'evento', fecha: upcoming, hora: '18:00', horaFin: '19:00' },
    ]).filter((section) => section.tareas.length > 0);

    expect(component.visibleSections.map((section) => section.id)).toEqual([
      'sin-fecha',
      'manana',
      'proximas',
      'vencidas',
    ]);
    expect(component.visibleSections.flatMap((section) => section.tareas).map((item) => item.id)).toEqual([1, 6, 2, 3, 4]);
    expect(component.visibleSections.find((section) => section.id === 'sin-fecha')?.tareas.map((item) => item.id)).toEqual([1]);
    expect(component.visibleSections.find((section) => section.id === 'manana')?.tareas.some((item) => item.tipo === 'evento')).toBe(true);
    expect(service.getSummary(component.secciones.flatMap((section) => section.tareas)).manana).toBe(2);
    expect(service.getSummary(component.secciones.flatMap((section) => section.tareas)).proximas).toBe(1);
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

  it('keeps advanced mode optional and calculates subtask progress', () => {
    const advancedTask = {
      ...task(10),
      subtasks: [
        { id: 'a', title: 'Primera', completed: true },
        { id: 'b', title: 'Segunda', completed: false },
      ],
    };

    component.setAdvancedModeEnabled(true);
    expect(localStorage.getItem('agenda-advanced-mode')).toBe('true');
    expect(component.subtaskProgress(advancedTask)).toEqual({ completed: 1, total: 2, percentage: 50 });
    component.setAdvancedModeEnabled(false);
  });

  it('keeps task date and time optional behind their controls', () => {
    component.nuevaTarea();
    expect(component.taskScheduleEnabled).toBe(false);
    expect(component.nuevaFecha).toBe(localIsoDate(new Date()));

    component.setTaskScheduleEnabled(true);
    expect(component.taskSchedulingInvalid).toBe(false);

    component.nuevaHora = '09:00';
    expect(component.taskSchedulingInvalid).toBe(false);

    component.setTaskScheduleEnabled(false);
    expect(component.nuevaFecha).toBe('');
    expect(component.nuevaHora).toBe('');
  });

  it('starts new events on today when opened without a calendar date', () => {
    component.nuevoEvento();

    expect(component.nuevaFecha).toBe(localIsoDate(new Date()));
  });

  it('classifies the task tabs without mixing events or states', () => {
    component.tareas = [
      task(1),
      { ...task(2), fecha: '2026-10-24' },
      { ...task(3, 'vencida'), fecha: '2026-10-22' },
      task(4, 'completada'),
      { ...task(5), tipo: 'evento', fecha: '2026-10-24' },
      { ...task(6, 'ignorada'), fecha: '2026-10-21' },
    ];

    component.pendingFilter = 'pendientes';
    expect(component.filteredTasks.map((item) => item.id)).toEqual([1]);
    component.pendingFilter = 'programadas';
    expect(component.filteredTasks.map((item) => item.id)).toEqual([2]);
    component.pendingFilter = 'vencidas';
    expect(component.filteredTasks.map((item) => item.id)).toEqual([3, 6]);
    component.pendingFilter = 'completadas';
    expect(component.filteredTasks.map((item) => item.id)).toEqual([4]);
  });

  it('calculates daily medication times and treatment dose count', () => {
    component.medicationFirstTime = '08:00';
    component.medicationFrequencyHours = 8;
    component.medicationDurationDays = 4;

    expect(component.calculatedMedicationTimes).toEqual(['08:00', '16:00', '00:00']);
    expect(component.calculatedDoseCount).toBe(12);
  });

  it('keeps continuous medication calculations without a final dose count', () => {
    component.medicationFirstTime = '09:00';
    component.medicationFrequencyHours = 12;
    component.medicationDurationDays = null;

    expect(component.calculatedMedicationTimes).toEqual(['09:00', '21:00']);
    expect(component.calculatedDoseCount).toBeNull();
    expect(component.medicationFrequencyLabel(24)).toBe('Una vez al día');
  });

  it('marks a pending medication dose overdue after its scheduled time', () => {
    component.currentTime = new Date('2026-10-24T09:01:00');
    const dose = {
      id: 'dose-1',
      treatmentId: 'treatment-1',
      scheduledAt: '2026-10-24T09:00:00',
      status: 'pending' as const,
    };

    expect(component.isMedicationDoseOverdue(dose)).toBe(true);
    expect(component.isMedicationDoseOverdue({ ...dose, status: 'taken' })).toBe(false);
    expect(component.medicationHistoryStatus(dose)).toBe('overdue');
    expect(component.medicationHistoryStatus({
      ...dose,
      status: 'taken',
      recordedAt: '2026-10-24T09:10:00',
    })).toBe('late');
    expect(component.medicationHistoryStatus({
      ...dose,
      scheduledAt: '2026-10-23T09:00:00',
    })).toBe('missed');
  });

  it('separates today medication doses and calculates daily progress', () => {
    component.currentTime = new Date('2026-10-24T10:00:00');
    component.medicationDoses = [
      { id: 'overdue', treatmentId: 'medicine', scheduledAt: '2026-10-24T08:00:00', status: 'pending' },
      { id: 'taken', treatmentId: 'medicine', scheduledAt: '2026-10-24T09:00:00', status: 'taken', recordedAt: '2026-10-24T09:05:00' },
      { id: 'pending', treatmentId: 'medicine', scheduledAt: '2026-10-24T11:00:00', status: 'pending' },
      { id: 'pending-later', treatmentId: 'medicine', scheduledAt: '2026-10-24T18:00:00', status: 'pending' },
      { id: 'tomorrow', treatmentId: 'medicine', scheduledAt: '2026-10-25T08:00:00', status: 'pending' },
    ];

    expect(component.todayMedicationOverdueDoses.map((dose) => dose.id)).toEqual(['overdue']);
    expect(component.todayMedicationPendingDoses.map((dose) => dose.id)).toEqual(['pending', 'pending-later']);
    expect(component.todayMedicationTakenDoses.map((dose) => dose.id)).toEqual(['taken']);
    expect(component.todayMedicationProgress).toBe(25);
    expect(component.medicationDoseRecordedTime(component.todayMedicationTakenDoses[0])).toContain('09:05');
    expect(component.visibleTodayMedicationOverdueDoses.map((dose) => dose.id)).toEqual(['overdue']);
    expect(component.visibleTodayMedicationPendingDoses).toEqual([]);
    expect(component.hiddenTodayMedicationDoseCount).toBe(2);

    component.toggleMedicationHomeExpanded();
    expect(component.visibleTodayMedicationPendingDoses.map((dose) => dose.id)).toEqual(['pending', 'pending-later']);
  });

  it('keeps medication doses out of the calendar', () => {
    component.currentTime = new Date('2026-10-24T10:00:00');
    component.currentMonth = new Date('2026-10-01T00:00:00');
    component.tareas = [];
    component.deviceCalendarTasks = [];
    const treatment = {
      dose: '1 tableta',
      startDate: '2026-10-24',
      schedule: { days: [0, 1, 2, 3, 4, 5, 6], times: ['08:00'] },
      color: '#22c55e',
      strictTracking: false,
      stockEnabled: false,
      stockQuantity: 0,
      doseUnits: 1,
      stockUnit: 'tabletas',
      lowStockThreshold: 5,
      status: 'active' as const,
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:00.000Z',
    };
    component.medicationTreatments = [
      { ...treatment, id: 'continuous', name: 'Citalopram', continuous: true },
      { ...treatment, id: 'temporary', name: 'Antibiótico', continuous: false, endDate: '2026-10-30' },
    ];
    component.medicationDoses = [
      { id: 'continuous-dose', treatmentId: 'continuous', scheduledAt: '2026-10-24T08:00:00', status: 'pending' },
      { id: 'temporary-dose', treatmentId: 'temporary', scheduledAt: '2026-10-24T09:00:00', status: 'pending' },
    ];

    component.selectDate('2026-10-24');

    expect(component.calendarDays.find((day) => day.iso === '2026-10-24')?.hasTasks).toBe(false);
    expect(component.todayMedicationDoses.map((dose) => dose.id)).toContain('continuous-dose');
  });

  it('groups medicines by treatment reference', () => {
    const base = {
      dose: '1 tableta',
      startDate: '2026-10-24',
      continuous: true,
      schedule: { days: [0, 1, 2, 3, 4, 5, 6], times: ['08:00'] },
      color: '#22c55e',
      strictTracking: false,
      stockEnabled: false,
      stockQuantity: 0,
      doseUnits: 1,
      stockUnit: 'tabletas',
      lowStockThreshold: 5,
      status: 'active' as const,
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:00.000Z',
    };
    component.medicationTreatments = [
      { ...base, id: 'a', treatmentName: 'Control de depresión', name: 'Citalopram' },
      { ...base, id: 'b', treatmentName: 'Control de depresión', name: 'Vitamina D' },
    ];

    expect(component.treatmentGroups).toHaveLength(1);
    expect(component.treatmentGroups[0].name).toBe('Control de depresión');
    expect(component.treatmentGroups[0].treatments).toHaveLength(2);
  });

  it('includes quick notes in the global search', () => {
    component.quickNotes = [{
      id: 'note-search',
      title: 'Idea para vacaciones',
      content: 'Revisar hospedaje',
      createdAt: '2026-10-24T10:00:00.000Z',
      updatedAt: '2026-10-24T10:00:00.000Z',
    }];
    component.globalSearchQuery = 'hospedaje';

    expect(component.globalSearchResults.some((result) => result.kind === 'note')).toBe(true);
  });

  it('opens the task editor from a quick note and preserves the note', async () => {
    component.nuevaNota();
    component.noteTitle = 'Comprar material';
    component.noteContent = 'Cartulina y plumones';

    await component.convertirNotaEnTarea();

    expect(component.quickNotes.some((note) => note.title === 'Comprar material')).toBe(true);
    expect(component.formItemType).toBe('tarea');
    expect(component.nuevoTitulo).toBe('Comprar material');
  });

  it('opens the event editor from a quick note', async () => {
    component.nuevaNota();
    component.noteContent = 'Cita con el dentista';

    await component.convertirNotaEnEvento();

    expect(component.formItemType).toBe('evento');
    expect(component.nuevoTitulo).toBe('Cita con el dentista');
    expect(component.eventEditorOpen).toBe(true);
  });

  it('updates the visible task lists as soon as the task service changes', () => {
    const taskService = TestBed.inject(TaskService);

    taskService.create({
      titulo: 'Cambio en tiempo real',
      prioridad: 'media',
      repeticion: 'none',
    });

    expect(component.tareas.some((item) => item.titulo === 'Cambio en tiempo real')).toBe(true);
    expect(component.secciones.some((section) =>
      section.tareas.some((item) => item.titulo === 'Cambio en tiempo real'))).toBe(true);
  });

  it('shows fixed expenses on Home only when they expire today or tomorrow', () => {
    const wallet = TestBed.inject(WalletService);
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    wallet.saveFixedExpense({
      name: 'Internet', amount: 600, category: 'Servicios', dueDay: tomorrow.getDate(),
      frequencyMonths: 1, reminderTime: '09:00', active: true,
    });
    component.currentTime = today;

    expect(component.homeFixedExpenses.map((item) => item.expense.name)).toContain('Internet');
    wallet.addTransaction({ kind: 'expense', description: 'Café', amount: 50, category: 'Alimentos', date: component.selectedDate });
    expect(component.homeFixedExpenses.some((item) => item.expense.name === 'Café')).toBe(false);
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
