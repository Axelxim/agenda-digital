import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { App } from '@capacitor/app';
import { PluginListenerHandle } from '@capacitor/core';
import {
  IonButton,
  IonAlert,
  IonButtons,
  IonCheckbox,
  IonChip,
  IonContent,
  IonFooter,
  IonFab,
  IonFabButton,
  IonFabList,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  calendarOutline,
  checkboxOutline,
  chevronBackOutline,
  chevronDownOutline,
  chevronForwardOutline,
      close,
      closeCircleOutline,
  ellipsisHorizontal,
  homeOutline,
  menuOutline,
  notificationsOutline,
      pricetagOutline,
      pencilOutline,
      repeatOutline,
  saveOutline,
  settingsOutline,
  sunnyOutline,
  timeOutline,
  trashOutline,
  add,
} from 'ionicons/icons';
import {
  EventPreset,
  EventPresetSchedule,
  LabelReminderSettings,
  RecurrenceScope,
  ReminderLeadMinutes,
  Task,
  TaskLabel,
  TaskPriority,
  TaskRepeat,
  TaskSection,
  TaskSummary,
  TaskType,
} from '../core/task.model';
import { LabelReminderService } from '../core/label-reminder.service';
import {
  DeviceCalendar,
  DeviceCalendarTask,
  DeviceCalendarService,
  DeviceCalendarSettings,
} from '../core/device-calendar.service';
import {
  NotificationSchedulerService,
  NotificationSyncStatus,
} from '../core/notification-scheduler.service';
import { TaskService } from '../core/task.service';

type ViewMode = 'hoy' | 'calendario' | 'pendientes' | 'mas';
type CalendarView = 'dia' | 'semana' | 'mes';
type PendingFilter = 'pendientes' | 'programadas' | 'vencidas' | 'completadas';
type FormMode = 'create' | 'edit' | 'reschedule';

interface CalendarDay {
  label: number;
  iso: string;
  currentMonth: boolean;
  selected: boolean;
  hasTasks: boolean;
}

interface WeekDay {
  iso: string;
  day: number;
  shortLabel: string;
}

interface TimedEventLayout {
  left: number;
  width: number;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    FormsModule,
    NgTemplateOutlet,
    IonButton,
    IonAlert,
    IonButtons,
    IonCheckbox,
    IonChip,
    IonContent,
    IonFooter,
    IonFab,
    IonFabButton,
    IonFabList,
    IonHeader,
    IonIcon,
    IonInput,
    IonModal,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToggle,
    IonToolbar,
  ],
})
export class HomePage implements OnInit, OnDestroy {
  private readonly taskService = inject(TaskService);
  private readonly labelReminderService = inject(LabelReminderService);
  private readonly notificationScheduler = inject(NotificationSchedulerService);
  private readonly deviceCalendarService = inject(DeviceCalendarService);

  @ViewChild(IonModal) modal?: IonModal;
  @ViewChild('agendaTimeline') agendaTimeline?: ElementRef<HTMLElement>;
  @ViewChild('presetModal') presetModal?: IonModal;
  @ViewChild('settingsModal') settingsModal?: IonModal;
  @ViewChild('deviceCalendarModal') deviceCalendarModal?: IonModal;

  titulo = 'Agenda';
  selectedView: ViewMode = 'hoy';
  calendarView: CalendarView = 'dia';
  pendingFilter: PendingFilter = 'pendientes';
  formMode: FormMode = 'create';
  formItemType: TaskType = 'tarea';
  editingTaskId: number | null = null;
  eventOperationScope: RecurrenceScope | null = null;
  eventOperationTaskId: number | null = null;
  selectedEvent?: Task;
  eventAction: 'edit' | 'reschedule' | 'cancel' | null = null;
  confirmingEventCancellation = false;
  eventCancelAlertOpen = false;
  readonly eventCancelAlertButtons = [
    { text: 'Volver', role: 'cancel', handler: () => this.cancelarConfirmacionEvento() },
    { text: 'Cancelar evento', role: 'destructive', handler: () => this.confirmarCancelacionEvento() },
  ];
  eventEditorOpen = false;
  eventRepeatExpanded = false;
  confirmingEventDeletion = false;
  expandedTaskId: number | null = null;
  expandedReminderLabel: TaskLabel | null = null;
  notificationSyncStatus: NotificationSyncStatus | 'idle' | 'error' = 'idle';
  calendarEditError = '';
  deviceCalendarStatus: 'idle' | 'loading' | 'ready' | 'denied' | 'unavailable' | 'error' = 'idle';
  deviceCalendars: DeviceCalendar[] = [];
  deviceCalendarTasks: DeviceCalendarTask[] = [];
  deviceCalendarSettings: DeviceCalendarSettings = {
    enabled: false,
    selectedCalendarIds: [],
    selectionConfigured: false,
  };

  tareas: Task[] = [];
  secciones: TaskSection[] = [];
  resumen: TaskSummary = {
    hoy: 0,
    manana: 0,
    proximas: 0,
    sinFecha: 0,
    pendientes: 0,
    completadas: 0,
  };
  selectedDate = '';
  currentMonth = new Date();
  currentTime = new Date();
  calendarDays: CalendarDay[] = [];

  nuevoTitulo = '';
  nuevaFecha = '';
  nuevaHora = '';
  nuevaHoraFin = '';
  eventColor = '#2563eb';
  preestablecidos: EventPreset[] = [];
  presetNombre = '';
  presetColor = '#2563eb';
  presetHoraInicio = '09:00';
  presetHoraFin = '10:00';
  presetDias: number[] = [];
  presetHorarios: EventPresetSchedule[] = [];
  presetActiveDay: number | null = null;
  editingPresetId: number | null = null;
  prioridad: TaskPriority = 'media';
  etiqueta: TaskLabel | undefined = undefined;
  actividadMadreId: number | undefined = undefined;
  favorita = false;
  repeticion: TaskRepeat = 'none';
  private currentTimeTimer?: ReturnType<typeof setInterval>;
  private appResumeListener?: PluginListenerHandle;
  private reminderSettingsReady = false;

  readonly etiquetas = this.taskService.etiquetas;
  readonly reminderLeadOptions = this.labelReminderService.leadOptions;
  labelReminderSettings = {} as Record<TaskLabel, LabelReminderSettings>;
  readonly resumenCards = [
    { id: 'hoy', label: 'Hoy', key: 'hoy' },
    { id: 'manana', label: 'Mañana', key: 'manana' },
    { id: 'proximas', label: 'Próximas', key: 'proximas' },
    { id: 'sin-fecha', label: 'Pendientes', key: 'sinFecha' },
  ] as const;
  readonly agendaHours = Array.from(
    { length: 24 },
    (_, index) => `${String(index).padStart(2, '0')}:00`,
  );
  readonly agendaHourHeight = 72;
  readonly diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  constructor() {
    addIcons({
      alertCircleOutline,
      calendarOutline,
      checkboxOutline,
      chevronBackOutline,
      chevronDownOutline,
      chevronForwardOutline,
  close,
  closeCircleOutline,
      ellipsisHorizontal,
      homeOutline,
      menuOutline,
      notificationsOutline,
  pricetagOutline,
  pencilOutline,
  repeatOutline,
      saveOutline,
      settingsOutline,
      sunnyOutline,
      timeOutline,
      trashOutline,
      add,
    });
  }

  ngOnInit(): void {
    this.selectedDate = this.taskService.toISODate(new Date());
    this.currentMonth = new Date(`${this.selectedDate}T00:00:00`);
    this.setTasks(this.taskService.load());
    this.labelReminderSettings = this.labelReminderService.load(
      this.etiquetas.map((label) => label.nombre),
    );
    this.reminderSettingsReady = true;
    this.syncNotifications();
    this.preestablecidos = this.taskService.loadEventPresets();
    this.deviceCalendarSettings = this.deviceCalendarService.loadSettings();
    void this.refreshDeviceCalendarEvents();
    if (this.deviceCalendarService.supported) {
      void App.addListener('resume', () => this.refreshDeviceCalendarEvents()).then((listener) => {
        this.appResumeListener = listener;
      });
    }
    this.currentTimeTimer = setInterval(() => {
      this.currentTime = new Date();
    }, 60_000);
  }

  ngOnDestroy(): void {
    if (this.currentTimeTimer) {
      clearInterval(this.currentTimeTimer);
    }
    void this.appResumeListener?.remove();
  }

  get visibleSections(): TaskSection[] {
    if (this.selectedView === 'hoy') {
      const homeOrder: TaskSection['id'][] = [
        'sin-fecha',
        'proximas',
        'manana',
        'vencidas',
      ];
      return homeOrder.flatMap((id) =>
        this.secciones.filter((section) => section.id === id),
      );
    }

    return this.secciones;
  }

  get filteredTasks(): Task[] {
    if (this.pendingFilter === 'pendientes') {
      return this.tareas.filter(
        (tarea) => tarea.tipo === 'tarea' && tarea.estado === 'pendiente' && !tarea.fecha,
      );
    }

    if (this.pendingFilter === 'programadas') {
      return this.tareas.filter(
        (tarea) => tarea.tipo === 'tarea' && tarea.estado === 'pendiente' && !!tarea.fecha,
      );
    }

    if (this.pendingFilter === 'vencidas') {
      return this.tareas.filter(
        (tarea) => tarea.tipo === 'tarea' && tarea.estado === 'vencida',
      );
    }

    if (this.pendingFilter === 'completadas') {
      return this.tareas.filter(
        (tarea) => tarea.tipo === 'tarea' && tarea.estado === 'completada',
      );
    }

    return [];
  }

  get taskFilterSectionTitle(): string {
    if (this.pendingFilter === 'pendientes') return 'Sin fecha';
    if (this.pendingFilter === 'programadas') return 'Programadas';
    if (this.pendingFilter === 'vencidas') return 'Vencidas';
    return 'Completadas';
  }

  get totalTasks(): number {
    return this.tareas.filter((tarea) => tarea.tipo === 'tarea').length;
  }

  get calendarTasks(): Task[] {
    return [...this.tareas, ...this.deviceCalendarTasks];
  }

  get activeEvents(): Task[] {
    const today = this.taskService.toISODate(this.currentTime);
    const now = this.currentTime.getHours() * 60 + this.currentTime.getMinutes();
    return this.calendarTasks.filter((tarea) => {
      if (tarea.tipo !== 'evento' || tarea.estado === 'ignorada' || tarea.fecha !== today || !tarea.hora) {
        return false;
      }
      const [startHour, startMinute] = tarea.hora.split(':').map(Number);
      const end = this.taskEndTime(tarea).split(':').map(Number);
      const start = startHour * 60 + startMinute;
      const finish = end[0] * 60 + end[1];
      return now >= start && now < finish;
    });
  }

  get upcomingEvents(): Task[] {
    const now = this.currentTime.getTime();
    const today = this.taskService.toISODate(this.currentTime);

    return this.calendarTasks
      .filter((tarea) => {
        if (tarea.tipo !== 'evento' || tarea.estado === 'ignorada' || tarea.fecha !== today || !tarea.hora) return false;
        return new Date(`${tarea.fecha}T${tarea.hora}:00`).getTime() > now;
      })
      .sort((a, b) => `${a.fecha}T${a.hora}`.localeCompare(`${b.fecha}T${b.hora}`));
  }

  get nextEvent(): Task | undefined {
    return this.upcomingEvents[0];
  }

  get followingEvent(): Task | undefined {
    return this.upcomingEvents[1];
  }

  get selectedDateTasks(): Task[] {
    return this.taskService
      .getTasksForDate(this.selectedDate, this.calendarTasks)
      .filter((tarea) => tarea.estado !== 'completada');
  }

  get actividadesMadreDisponibles(): Task[] {
    if (!this.nuevaFecha) return [];

    return this.tareas.filter(
      (tarea) =>
        tarea.id !== this.editingTaskId &&
        !tarea.parentId &&
        tarea.fecha === this.nuevaFecha &&
        tarea.estado !== 'ignorada',
    );
  }

  get untimedSelectedDateTasks(): Task[] {
    return this.selectedDateTasks.filter((tarea) => !tarea.hora && !this.isBirthdayEvent(tarea));
  }

  get birthdayEventsForSelectedDate(): DeviceCalendarTask[] {
    return this.deviceCalendarTasks.filter(
      (event) => event.externalKind === 'birthday' && event.fecha === this.selectedDate && !event.hora,
    );
  }

  get birthdayEventsToday(): DeviceCalendarTask[] {
    const today = this.taskService.toISODate(this.currentTime);
    return this.deviceCalendarTasks.filter(
      (event) => event.externalKind === 'birthday' && event.fecha === today && !event.hora,
    );
  }

  get birthdayNamesForSelectedDate(): string {
    return this.birthdayEventsForSelectedDate.map((event) => this.birthdayName(event)).join(' · ');
  }

  birthdayName(event: DeviceCalendarTask): string {
    return event.titulo
      .replace(/^cumple(?:años)?(?: de)?\s*/i, '')
      .replace(/(?:'s)?\s+birthday$/i, '')
      .trim() || event.titulo;
  }

  get selectedEventIsRecurring(): boolean {
    return !!this.selectedEvent && this.selectedEvent.repeticion !== 'none';
  }

  get editingExternalEvent(): DeviceCalendarTask | undefined {
    return this.deviceCalendarTasks.find((event) => event.id === this.editingTaskId);
  }

  calendarTaskTitle(tarea: Task): string {
    return tarea.parentId ? `↳ ${tarea.titulo}` : tarea.titulo;
  }

  get timeRangeInvalid(): boolean {
    return !!this.nuevaHora && !!this.nuevaHoraFin && this.nuevaHoraFin <= this.nuevaHora;
  }

  get weekDays(): WeekDay[] {
    const date = new Date(`${this.selectedDate}T00:00:00`);
    const mondayOffset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - mondayOffset);

    return Array.from({ length: 7 }, (_, index) => {
      const current = new Date(date);
      current.setDate(date.getDate() + index);
      return {
        iso: this.taskService.toISODate(current),
        day: current.getDate(),
        shortLabel: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][index],
      };
    });
  }

  get monthTitle(): string {
    const title = this.currentMonth.toLocaleDateString('es-MX', {
      month: 'long',
      year: 'numeric',
    });

    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  summaryValue(key: keyof TaskSummary): number {
    return this.resumen[key];
  }

  selectView(view: ViewMode): void {
    this.selectedView = view;

    if (view === 'hoy') {
      this.setTasks(this.taskService.getAll());
    }

    if (view === 'calendario' && this.calendarView === 'dia') {
      void this.refreshDeviceCalendarEvents();
      setTimeout(() => this.scrollToCurrentHour());
    }
  }

  selectDate(date: string): void {
    this.selectedDate = date;
    this.buildCalendar();
  }

  selectMonthDate(date: string): void {
    this.selectDate(date);
    const selected = new Date(`${date}T00:00:00`);
    if (
      selected.getFullYear() !== this.currentMonth.getFullYear() ||
      selected.getMonth() !== this.currentMonth.getMonth()
    ) {
      this.currentMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
      this.buildCalendar();
    }
  }

  previousDay(): void {
    if (this.calendarView === 'mes') {
      this.previousMonth();
      return;
    }

    this.selectDate(this.taskService.addDays(this.selectedDate, this.calendarView === 'semana' ? -7 : -1));
  }

  nextDay(): void {
    if (this.calendarView === 'mes') {
      this.nextMonth();
      return;
    }

    this.selectDate(this.taskService.addDays(this.selectedDate, this.calendarView === 'semana' ? 7 : 1));
  }

  goToToday(): void {
    this.selectDate(this.taskService.toISODate(new Date()));
    this.calendarView = 'dia';
    setTimeout(() => this.scrollToCurrentHour());
  }

  previousMonth(): void {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() - 1,
      1,
    );
    this.buildCalendar();
  }

  nextMonth(): void {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() + 1,
      1,
    );
    this.buildCalendar();
  }

  nuevaTarea(fecha?: string, hora?: string): void {
    this.formMode = 'create';
    this.formItemType = 'tarea';
    this.editingTaskId = null;
    this.resetForm(fecha);
    this.nuevaHora = hora ?? '';
    this.nuevaHoraFin = hora ? this.addMinutesToTime(hora, 60) : '';
    this.eventColor = '#2563eb';
    this.modal?.present();
  }

  nuevoEvento(fecha?: string, hora?: string): void {
    this.formMode = 'create';
    this.formItemType = 'evento';
    this.editingTaskId = null;
    this.resetForm(fecha);
    this.nuevaHora = hora ?? '';
    this.nuevaHoraFin = hora ? this.addMinutesToTime(hora, 60) : '';
    this.eventColor = '#2563eb';
    this.eventRepeatExpanded = false;
    this.confirmingEventDeletion = false;
    this.eventEditorOpen = true;
  }

  editarTarea(tarea: Task): void {
    this.formMode = 'edit';
    this.formItemType = tarea.tipo;
    this.eventColor = tarea.color ?? '#2563eb';
    this.editingTaskId = tarea.id;
    this.fillForm(tarea);
    if (tarea.tipo === 'evento') {
      this.eventRepeatExpanded = false;
      this.confirmingEventDeletion = false;
      this.eventEditorOpen = true;
      return;
    }
    this.modal?.present();
  }

  abrirDetalleEvento(evento: Task): void {
    if (evento.tipo !== 'evento') {
      this.editarTarea(evento);
      return;
    }
    if (this.selectedEvent?.id === evento.id) {
      this.cerrarDetalleEvento();
      return;
    }
    this.selectedEvent = evento;
    this.eventAction = null;
    this.confirmingEventCancellation = false;
  }

  isEventExpanded(evento: Task): boolean {
    return this.selectedEvent?.id === evento.id;
  }

  cerrarDetalleEvento(): void {
    this.selectedEvent = undefined;
    this.eventAction = null;
    this.confirmingEventCancellation = false;
  }

  iniciarAccionEvento(action: 'edit' | 'reschedule' | 'cancel'): void {
    if (!this.selectedEvent) return;
    this.eventAction = action;
    if (!this.selectedEventIsRecurring) this.aplicarAccionEvento('one');
  }

  aplicarAccionEvento(scope: RecurrenceScope): void {
    if (!this.selectedEvent || !this.eventAction) return;
    if (this.eventAction === 'cancel') {
      this.eventOperationScope = scope;
      this.confirmingEventCancellation = true;
      this.eventCancelAlertOpen = true;
      return;
    }

    const event = this.selectedEvent;
    const action = this.eventAction;
    this.eventOperationTaskId = event.id;
    this.eventOperationScope = this.selectedEventIsRecurring ? scope : null;
    this.selectedEvent = undefined;
    this.eventAction = null;
    action === 'edit' ? this.editarTarea(event) : this.prepararReagenda(event);
  }

  async confirmarCancelacionEvento(): Promise<void> {
    if (!this.selectedEvent || !this.eventOperationScope) return;
    this.eventCancelAlertOpen = false;
    const externalEvent = this.externalCalendarEvent(this.selectedEvent);
    if (externalEvent) {
      try {
        await this.deviceCalendarService.deleteEvent(externalEvent);
        await this.refreshDeviceCalendarEvents();
        this.cerrarDetalleEvento();
      } catch (error) {
        this.calendarEditError = this.errorMessage(error);
        this.confirmingEventCancellation = false;
      }
      return;
    }
    this.setTasks(this.taskService.cancelEventWithScope(this.selectedEvent.id, this.eventOperationScope));
    this.cerrarDetalleEvento();
  }

  cancelarConfirmacionEvento(): void {
    this.eventCancelAlertOpen = false;
    this.confirmingEventCancellation = false;
    this.eventAction = null;
  }

  cerrarAlertaCancelacion(): void {
    if (this.confirmingEventCancellation && this.selectedEvent) {
      this.cancelarConfirmacionEvento();
      return;
    }
    this.eventCancelAlertOpen = false;
  }

  prepararReagenda(tarea: Task): void {
    this.formMode = 'reschedule';
    this.formItemType = tarea.tipo;
    this.eventColor = tarea.color ?? '#2563eb';
    this.editingTaskId = tarea.id;
    this.fillForm(tarea);
    if (tarea.tipo === 'evento') {
      this.eventRepeatExpanded = false;
      this.confirmingEventDeletion = false;
      this.eventEditorOpen = true;
      return;
    }
    this.modal?.present();
  }

  async guardarFormulario(): Promise<void> {
    if (this.timeRangeInvalid) return;

    if (this.editingTaskId !== null && this.formMode === 'reschedule' && this.formItemType === 'tarea') {
      this.setTasks(
        this.taskService.reschedule(
          this.editingTaskId,
          this.nuevaFecha,
          this.nuevaHora,
        ),
      );
      this.cerrarModal();
      return;
    }

    const draft = {
      titulo: this.nuevoTitulo,
      tipo: this.formItemType,
      fecha: this.nuevaFecha,
      hora: this.nuevaHora,
      horaFin: this.nuevaHoraFin,
      color: this.formItemType === 'evento' ? this.eventColor : undefined,
      prioridad: this.prioridad,
      etiqueta: this.etiqueta,
      favorita: this.favorita,
      repeticion: this.repeticion,
      parentId: this.formItemType === 'tarea' ? this.actividadMadreId : undefined,
    };

    const externalEvent = this.editingExternalEvent;
    if (externalEvent) {
      this.calendarEditError = '';
      try {
        await this.deviceCalendarService.updateEvent(externalEvent, {
          title: this.nuevoTitulo.trim(),
          date: this.nuevaFecha,
          startTime: this.nuevaHora || undefined,
          endTime: this.nuevaHoraFin || undefined,
        });
        await this.refreshDeviceCalendarEvents();
        this.cerrarEditorEvento();
      } catch (error) {
        this.calendarEditError = this.errorMessage(error);
      }
      return;
    }

    if (this.editingTaskId !== null) {
      const shouldUpdateSeries =
        this.formItemType === 'evento' &&
        this.eventOperationTaskId === this.editingTaskId &&
        this.eventOperationScope !== null;
      this.setTasks(
        shouldUpdateSeries
          ? this.taskService.updateEventWithScope(this.editingTaskId, draft, this.eventOperationScope!)
          : this.taskService.update(this.editingTaskId, draft),
      );
    } else {
      this.setTasks(this.taskService.create(draft));
    }

    if (this.eventEditorOpen) {
      this.cerrarEditorEvento();
    } else {
      this.cerrarModal();
    }
  }

  cambiarEstado(tarea: Task): void {
    if (this.expandedTaskId === tarea.id) this.expandedTaskId = null;
    this.setTasks(this.taskService.toggleCompleted(tarea.id));
  }

  toggleTaskActions(tarea: Task): void {
    this.expandedTaskId = this.expandedTaskId === tarea.id ? null : tarea.id;
  }

  isTaskActionsExpanded(tarea: Task): boolean {
    return this.expandedTaskId === tarea.id;
  }

  editTaskFromHome(tarea: Task): void {
    this.expandedTaskId = null;
    this.editarTarea(tarea);
  }

  rescheduleTaskFromHome(tarea: Task): void {
    this.expandedTaskId = null;
    this.prepararReagenda(tarea);
  }

  discardTaskFromHome(tarea: Task): void {
    this.expandedTaskId = null;
    this.ignorarTarea(tarea);
  }

  homeSectionTitle(id: TaskSection['id']): string {
    if (id === 'sin-fecha') return 'Pendientes';
    if (id === 'proximas') return 'Próximas';
    if (id === 'manana') return 'Mañana';
    return 'Vencidas';
  }

  homeSectionIcon(id: TaskSection['id']): string {
    if (id === 'sin-fecha') return 'checkbox-outline';
    if (id === 'proximas') return 'calendar-outline';
    if (id === 'manana') return 'sunny-outline';
    return 'alert-circle-outline';
  }

  homeSectionMeta(section: TaskSection): string {
    if (section.id === 'manana') {
      const tomorrow = new Date(this.currentTime);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return new Intl.DateTimeFormat('es-MX', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(tomorrow);
    }

    return `${section.tareas.length} ${section.tareas.length === 1 ? 'tarea' : 'tareas'}`;
  }

  eliminarTarea(tarea: Task): void {
    this.setTasks(this.taskService.delete(tarea.id));
  }

  ignorarTarea(tarea: Task): void {
    this.setTasks(this.taskService.discard(tarea.id));
  }

  descartarDesdeFormulario(): void {
    if (this.editingTaskId === null) {
      return;
    }

    this.setTasks(this.taskService.discard(this.editingTaskId));
    this.cerrarModal();
  }

  cerrarModal(): void {
    this.editingTaskId = null;
    this.formMode = 'create';
    this.formItemType = 'tarea';
    this.eventOperationScope = null;
    this.eventOperationTaskId = null;
    this.resetForm();
    this.modal?.dismiss();
  }

  cerrarEditorEvento(): void {
    this.eventEditorOpen = false;
    this.eventRepeatExpanded = false;
    this.confirmingEventDeletion = false;
    this.editingTaskId = null;
    this.eventOperationScope = null;
    this.eventOperationTaskId = null;
    this.formMode = 'create';
    this.formItemType = 'tarea';
    this.calendarEditError = '';
    this.resetForm();
  }

  async eliminarEventoDesdeEditor(): Promise<void> {
    if (this.editingTaskId === null) return;
    const externalEvent = this.editingExternalEvent;
    if (externalEvent) {
      this.calendarEditError = '';
      try {
        await this.deviceCalendarService.deleteEvent(externalEvent);
        await this.refreshDeviceCalendarEvents();
        this.cerrarEditorEvento();
      } catch (error) {
        this.calendarEditError = this.errorMessage(error);
        this.confirmingEventDeletion = false;
      }
      return;
    }
    this.setTasks(this.taskService.delete(this.editingTaskId));
    this.cerrarEditorEvento();
  }

  formatDate(fecha?: string): string {
    return this.taskService.formatDate(fecha);
  }

  labelColor(label?: TaskLabel): string {
    return this.taskService.labelColor(label);
  }

  labelCount(label: TaskLabel): number {
    return this.taskService.getLabelCount(label, this.tareas);
  }

  priorityText(priority: TaskPriority): string {
    switch (priority) {
      case 'alta':
        return 'Alta';
      case 'media':
        return 'Media';
      case 'baja':
        return 'Baja';
    }
  }

  durationText(minutes = 60): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes
      ? `${hours} h ${remainingMinutes} min`
      : `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }

  applyEventPreset(preset: EventPreset): void {
    this.nuevoTitulo = preset.nombre;
    this.nuevaHora = preset.horaInicio;
    this.nuevaHoraFin = preset.horaFin;
    this.eventColor = preset.color;
  }

  togglePresetDay(day: number): void {
    const schedule = this.presetHorarios.find((item) => item.dia === day);
    if (!schedule) {
      this.presetHorarios = [
        ...this.presetHorarios,
        { dia: day, horaInicio: this.presetHoraInicio, horaFin: this.presetHoraFin },
      ];
      this.presetDias = [...this.presetDias, day];
    }
    this.presetActiveDay = day;
    const selected = this.presetHorarios.find((item) => item.dia === day);
    this.presetHoraInicio = selected?.horaInicio ?? this.presetHoraInicio;
    this.presetHoraFin = selected?.horaFin ?? this.presetHoraFin;
  }

  actualizarHorarioPreestablecido(): void {
    if (this.presetActiveDay === null) return;
    this.presetHorarios = this.presetHorarios.map((item) =>
      item.dia === this.presetActiveDay
        ? { ...item, horaInicio: this.presetHoraInicio, horaFin: this.presetHoraFin }
        : item,
    );
  }

  quitarDiaPreestablecido(): void {
    if (this.presetActiveDay === null) return;
    this.presetDias = this.presetDias.filter((day) => day !== this.presetActiveDay);
    this.presetHorarios = this.presetHorarios.filter((item) => item.dia !== this.presetActiveDay);
    this.presetActiveDay = null;
  }

  guardarPreestablecido(): void {
    const nombre = this.presetNombre.trim();
    if (!nombre || !this.presetHoraInicio || !this.presetHoraFin) return;

    const preset = {
      nombre,
      color: this.presetColor,
      horaInicio: this.presetHoraInicio,
      horaFin: this.presetHoraFin,
      dias: this.presetDias,
      horarios: this.presetHorarios,
    };
    this.preestablecidos = this.editingPresetId === null
      ? this.taskService.saveEventPreset(preset)
      : this.taskService.updateEventPreset({ ...preset, id: this.editingPresetId });
    this.setTasks(this.taskService.getAll());
    this.resetPresetForm();
  }

  editarPreestablecido(preset: EventPreset): void {
    this.editingPresetId = preset.id;
    this.presetNombre = preset.nombre;
    this.presetColor = preset.color;
    this.presetHoraInicio = preset.horaInicio;
    this.presetHoraFin = preset.horaFin;
    this.presetDias = [...preset.dias];
    this.presetHorarios = preset.horarios?.length
      ? preset.horarios.map((item) => ({ ...item }))
      : preset.dias.map((dia) => ({ dia, horaInicio: preset.horaInicio, horaFin: preset.horaFin }));
    this.presetActiveDay = this.presetDias[0] ?? null;
    if (this.presetActiveDay !== null) this.togglePresetDay(this.presetActiveDay);
  }

  cancelarEdicionPreestablecido(): void {
    this.resetPresetForm();
  }

  private resetPresetForm(): void {
    this.presetNombre = '';
    this.presetColor = '#2563eb';
    this.presetHoraInicio = '09:00';
    this.presetHoraFin = '10:00';
    this.presetDias = [];
    this.presetHorarios = [];
    this.presetActiveDay = null;
    this.editingPresetId = null;
  }

  agregarPreestablecidoEnSemana(preset: EventPreset): void {
    const dates = this.weekDays
      .filter((_, index) => preset.dias.length === 0 || preset.dias.includes(index))
      .map((day) => day.iso);
    this.setTasks(this.taskService.createPresetEvents(preset, dates));
  }

  quitarPreestablecidoDeSemana(preset: EventPreset): void {
    const dates = this.weekDays.map((day) => day.iso);
    this.setTasks(this.taskService.removePresetEvents(preset, dates));
  }

  abrirPreestablecidos(): void {
    this.presetModal?.present();
  }

  cerrarPreestablecidos(): void {
    this.presetModal?.dismiss();
  }

  taskDuration(tarea: Task): number {
    if (!tarea.hora || !tarea.horaFin) {
      return tarea.duracion ?? 60;
    }

    const [startHour, startMinute] = tarea.hora.split(':').map(Number);
    const [endHour, endMinute] = tarea.horaFin.split(':').map(Number);
    let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
    return minutes > 0 ? minutes : minutes + 24 * 60;
  }

  taskEndTime(tarea: Task): string {
    if (tarea.horaFin) {
      return tarea.horaFin;
    }

    if (!tarea.hora) {
      return '';
    }

    const [hour, minute] = tarea.hora.split(':').map(Number);
    const total = (hour * 60 + minute + (tarea.duracion ?? 60)) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  agendaEventOffset(tarea: Task): number {
    const minutes = Number(tarea.hora?.slice(3, 5) ?? 0);
    return (minutes / 60) * this.agendaHourHeight + 4;
  }

  agendaEventHeight(tarea: Task): number {
    return Math.max(32, (this.taskDuration(tarea) / 60) * this.agendaHourHeight - 4);
  }

  calendarEventLayout(tarea: Task, date: string): TimedEventLayout {
    return this.layoutsForDate(date).get(tarea.id) ?? { left: 1, width: 98 };
  }

  weekEventOffset(tarea: Task): number {
    const minutes = Number(tarea.hora?.slice(3, 5) ?? 0);
    return (minutes / 60) * 56 + 3;
  }

  weekEventHeight(tarea: Task): number {
    return Math.max(26, (this.taskDuration(tarea) / 60) * 56 - 4);
  }

  abrirConfiguracion(): void {
    this.labelReminderSettings = this.labelReminderService.load(
      this.etiquetas.map((label) => label.nombre),
    );
    this.settingsModal?.present();
  }

  cerrarConfiguracion(): void {
    this.expandedReminderLabel = null;
    this.settingsModal?.dismiss();
  }

  async abrirCalendariosDispositivo(): Promise<void> {
    this.deviceCalendarSettings = this.deviceCalendarService.loadSettings();
    await this.deviceCalendarModal?.present();
    await this.loadDeviceCalendars(false);
  }

  cerrarCalendariosDispositivo(): void {
    this.deviceCalendarModal?.dismiss();
  }

  async refreshDeviceCalendars(): Promise<void> {
    await this.loadDeviceCalendars(false);
    await this.refreshDeviceCalendarEvents();
  }

  async setDeviceCalendarEnabled(enabled: boolean): Promise<void> {
    this.deviceCalendarSettings = { ...this.deviceCalendarSettings, enabled };
    if (!enabled) {
      this.deviceCalendarService.saveSettings(this.deviceCalendarSettings);
      this.deviceCalendarTasks = [];
      this.buildCalendar();
      return;
    }

    await this.loadDeviceCalendars(true);
    if (this.deviceCalendarStatus !== 'ready') {
      this.deviceCalendarSettings = { ...this.deviceCalendarSettings, enabled: false };
      this.deviceCalendarService.saveSettings(this.deviceCalendarSettings);
      return;
    }

    if (!this.deviceCalendarSettings.selectionConfigured) {
      this.deviceCalendarSettings = {
        ...this.deviceCalendarSettings,
        selectedCalendarIds: this.deviceCalendars.map((calendar) => calendar.id),
        selectionConfigured: true,
      };
    }
    this.deviceCalendarService.saveSettings(this.deviceCalendarSettings);
    await this.refreshDeviceCalendarEvents();
  }

  isDeviceCalendarSelected(calendarId: string): boolean {
    return this.deviceCalendarSettings.selectedCalendarIds.includes(calendarId);
  }

  async setDeviceCalendarSelected(calendarId: string, selected: boolean): Promise<void> {
    const ids = new Set(this.deviceCalendarSettings.selectedCalendarIds);
    if (selected) ids.add(calendarId); else ids.delete(calendarId);
    this.deviceCalendarSettings = {
      ...this.deviceCalendarSettings,
      selectedCalendarIds: [...ids],
      selectionConfigured: true,
    };
    this.deviceCalendarService.saveSettings(this.deviceCalendarSettings);
    await this.refreshDeviceCalendarEvents();
  }

  isDeviceCalendarEvent(tarea: Task): boolean {
    return tarea.id < 0;
  }

  isBirthdayEvent(tarea: Task): boolean {
    return this.deviceCalendarTasks.some(
      (event) => event.id === tarea.id && event.externalKind === 'birthday',
    );
  }

  canEditCalendarEvent(tarea: Task): boolean {
    return this.externalCalendarEvent(tarea)?.writable === true;
  }

  openCalendarItem(tarea: Task): void {
    const externalEvent = this.externalCalendarEvent(tarea);
    if (!externalEvent || externalEvent.writable) this.abrirDetalleEvento(tarea);
  }

  private externalCalendarEvent(tarea: Task): DeviceCalendarTask | undefined {
    return this.deviceCalendarTasks.find((event) => event.id === tarea.id);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'No fue posible modificar el evento.';
  }

  private async loadDeviceCalendars(requestPermission: boolean): Promise<void> {
    this.deviceCalendarStatus = 'loading';
    try {
      const result = await this.deviceCalendarService.getCalendars(requestPermission);
      this.deviceCalendars = result.calendars;
      this.deviceCalendarStatus = result.status;
    } catch {
      this.deviceCalendarStatus = 'error';
      this.deviceCalendars = [];
    }
  }

  private async refreshDeviceCalendarEvents(): Promise<void> {
    try {
      this.deviceCalendarTasks = await this.deviceCalendarService.getEvents(
        this.deviceCalendarSettings,
        this.currentMonth,
      );
    } catch {
      this.deviceCalendarTasks = [];
    }
    this.buildCalendar();
  }

  reminderSettingsFor(label: TaskLabel): LabelReminderSettings {
    return this.labelReminderSettings[label] ?? this.labelReminderService.defaultSettings(label);
  }

  toggleReminderLabel(label: TaskLabel): void {
    this.expandedReminderLabel = this.expandedReminderLabel === label ? null : label;
  }

  setLabelRemindersEnabled(label: TaskLabel, enabled: boolean): void {
    this.updateLabelReminderSettings(label, { enabled }, enabled);
    if (enabled) this.expandedReminderLabel = label;
  }

  toggleReminderLead(label: TaskLabel, minutes: ReminderLeadMinutes): void {
    const current = this.reminderSettingsFor(label);
    const advanceMinutes = current.advanceMinutes.includes(minutes)
      ? current.advanceMinutes.filter((value) => value !== minutes)
      : [...current.advanceMinutes, minutes];
    this.updateLabelReminderSettings(label, { advanceMinutes });
  }

  setDuePromptEnabled(label: TaskLabel, duePromptEnabled: boolean): void {
    this.updateLabelReminderSettings(label, { duePromptEnabled });
  }

  setDateOnlyReminderTime(label: TaskLabel, dateOnlyTime: string | null | undefined): void {
    if (!dateOnlyTime) return;
    this.updateLabelReminderSettings(label, { dateOnlyTime });
  }

  private updateLabelReminderSettings(
    label: TaskLabel,
    changes: Partial<LabelReminderSettings>,
    requestPermission = false,
  ): void {
    this.labelReminderSettings = {
      ...this.labelReminderSettings,
      [label]: { ...this.reminderSettingsFor(label), ...changes, label },
    };
    this.labelReminderService.save(this.labelReminderSettings);
    this.syncNotifications(requestPermission);
  }

  activateNotifications(): void {
    this.syncNotifications(true);
  }

  notificationButtonLabel(): string {
    if (this.notificationSyncStatus === 'permission-denied') return 'Activar notificaciones';
    if (this.notificationSyncStatus === 'error') return 'Reintentar notificaciones';
    return 'Sincronizar notificaciones';
  }

  private syncNotifications(requestPermission = false): void {
    if (!this.reminderSettingsReady) return;
    void this.notificationScheduler
      .sync(this.tareas, this.labelReminderSettings, requestPermission)
      .then((result) => {
        this.notificationSyncStatus = result.status;
      })
      .catch(() => {
        this.notificationSyncStatus = 'error';
      });
  }

  private addMinutesToTime(time: string, minutes: number): string {
    const [hour, minute] = time.split(':').map(Number);
    const total = (hour * 60 + minute + minutes) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  tasksForHour(hour: string): Task[] {
    return this.selectedDateTasks.filter(
      (tarea) =>
        tarea.hora?.startsWith(hour.slice(0, 2)) &&
        tarea.estado !== 'completada',
    );
  }

  get currentMinutePosition(): number {
    return (this.currentTime.getMinutes() / 60) * 100;
  }

  isCurrentHour(hour: string): boolean {
    const today = this.taskService.toISODate(this.currentTime);

    return (
      this.selectedDate === today &&
      Number(hour.slice(0, 2)) === this.currentTime.getHours()
    );
  }

  private scrollToCurrentHour(): void {
    if (this.selectedDate !== this.taskService.toISODate(new Date())) {
      return;
    }

    this.agendaTimeline?.nativeElement
      .querySelector<HTMLElement>('.current-hour')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  tasksForDateAndHour(date: string, hour: string): Task[] {
    return this.taskService
      .getTasksForDate(date, this.calendarTasks)
      .filter(
        (tarea) =>
          tarea.hora?.startsWith(hour.slice(0, 2)) &&
          tarea.estado !== 'completada',
      );
  }

  private layoutsForDate(date: string): Map<number, TimedEventLayout> {
    const timed = this.taskService
      .getTasksForDate(date, this.calendarTasks)
      .filter((tarea) => !!tarea.hora && tarea.estado !== 'completada')
      .map((tarea) => {
        const [hours, minutes] = tarea.hora!.split(':').map(Number);
        const start = hours * 60 + minutes;
        return { tarea, start, end: start + this.taskDuration(tarea) };
      })
      .sort((a, b) => a.start - b.start || a.end - b.end);

    const layouts = new Map<number, TimedEventLayout>();
    let group: typeof timed = [];
    let groupEnd = -1;

    const assignGroup = (): void => {
      if (!group.length) return;

      const columnEnds: number[] = [];
      const assignments: Array<{ id: number; column: number }> = [];
      for (const item of group) {
        let column = columnEnds.findIndex((end) => end <= item.start);
        if (column === -1) {
          column = columnEnds.length;
          columnEnds.push(item.end);
        } else {
          columnEnds[column] = item.end;
        }
        assignments.push({ id: item.tarea.id, column });
      }

      const columns = columnEnds.length;
      const columnWidth = 100 / columns;
      for (const assignment of assignments) {
        layouts.set(assignment.id, {
          left: assignment.column * columnWidth + 1,
          width: Math.max(0, columnWidth - 2),
        });
      }
    };

    for (const item of timed) {
      if (group.length && item.start >= groupEnd) {
        assignGroup();
        group = [];
        groupEnd = -1;
      }
      group.push(item);
      groupEnd = Math.max(groupEnd, item.end);
    }
    assignGroup();

    return layouts;
  }

  formTitle(): string {
    if (this.formMode === 'reschedule') {
      return this.formItemType === 'evento' ? 'Reagendar evento' : 'Reagendar tarea';
    }

    if (this.editingTaskId === null) {
      return this.formItemType === 'evento' ? 'Nuevo evento' : 'Nueva tarea';
    }

    return this.formItemType === 'evento' ? 'Editar evento' : 'Editar tarea';
  }

  private setTasks(tareas: Task[]): void {
    this.tareas = tareas;
    this.resumen = this.taskService.getSummary(tareas);
    this.secciones = this.taskService
      .getSections(tareas)
      .filter((section) => section.tareas.length > 0);
    this.buildCalendar();
    this.syncNotifications();
  }

  private resetForm(fecha = ''): void {
    this.nuevoTitulo = '';
    this.nuevaFecha = fecha;
    this.nuevaHora = '';
    this.nuevaHoraFin = '';
    this.eventColor = '#2563eb';
    this.prioridad = 'media';
    this.etiqueta = undefined;
    this.actividadMadreId = undefined;
    this.favorita = false;
    this.repeticion = 'none';
  }

  private fillForm(tarea: Task): void {
    this.nuevoTitulo = tarea.titulo;
    this.nuevaFecha = tarea.fecha ?? '';
    this.nuevaHora = tarea.hora ?? '';
    this.nuevaHoraFin = this.taskEndTime(tarea);
    this.eventColor = tarea.color ?? '#2563eb';
    this.prioridad = tarea.prioridad;
    this.etiqueta = tarea.etiqueta;
    this.actividadMadreId = tarea.parentId;
    this.favorita = tarea.favorita ?? false;
    this.repeticion = tarea.repeticion ?? 'none';
  }

  private buildCalendar(): void {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const firstWeekday = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - firstWeekday);

    this.calendarDays = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const iso = this.taskService.toISODate(date);

      return {
        label: date.getDate(),
        iso,
        currentMonth: date.getMonth() === month,
        selected: iso === this.selectedDate,
        hasTasks: this.taskService.hasTasksOnDate(iso, this.calendarTasks),
      };
    });
  }
}
