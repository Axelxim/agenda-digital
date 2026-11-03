import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { App } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { ActionPerformed } from '@capacitor/local-notifications';
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
  IonMenu,
  IonModal,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonTextarea,
  IonToggle,
  IonToolbar,
  MenuController,
  RefresherCustomEvent,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { Subscription } from 'rxjs';
import {
  alertCircleOutline,
  batteryChargingOutline,
  calendarOutline,
  checkboxOutline,
  chevronBackOutline,
  chevronDownOutline,
  chevronForwardOutline,
      close,
      closeCircleOutline,
  ellipsisHorizontal,
  giftOutline,
  homeOutline,
  heartOutline,
  menuOutline,
  medicalOutline,
  walletOutline,
  cashOutline,
  receiptOutline,
  documentTextOutline,
  notificationsOutline,
  pauseOutline,
      pricetagOutline,
      pencilOutline,
      playOutline,
      repeatOutline,
      squareOutline,
  saveOutline,
  searchOutline,
  settingsOutline,
  sunnyOutline,
  timeOutline,
  trashOutline,
  stopCircleOutline,
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
  TaskSubtask,
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
import { MedicationDose, MedicationTreatment, WellnessSettings } from '../core/wellness.model';
import { WellnessService } from '../core/wellness.service';
import { QuickNote } from '../core/note.model';
import { NoteService } from '../core/note.service';
import { FixedExpense, FixedExpenseOccurrence, WalletLoan, WalletState, WalletTransactionKind } from '../core/wallet.model';
import { WalletService } from '../core/wallet.service';
import { SelfCareCompletion, SelfCareHabit, SelfCareFilter, SelfCareState } from '../core/self-care.model';
import { SelfCareService } from '../core/self-care.service';

type ViewMode = 'hoy' | 'calendario' | 'pendientes' | 'cuidado' | 'mas';
type CalendarView = 'dia' | 'semana' | 'mes';
type PendingFilter = 'pendientes' | 'programadas' | 'vencidas' | 'completadas';
type FormMode = 'create' | 'edit' | 'reschedule';
type WellnessView = 'treatment' | 'medication';
type MedicationHistoryStatus = 'taken' | 'late' | 'missed' | 'overdue' | 'pending';
type MedicationHistoryFilter = 'all' | MedicationHistoryStatus;
type WalletView = 'dashboard' | 'transaction' | 'fixed' | 'payment' | 'settings' | 'loans' | 'loan-form' | 'loan-payment';

interface TreatmentMedicationDraft {
  key: string;
  name: string;
  dose: string;
  instructions: string;
  frequencyHours: number;
  durationDays: number | null;
  firstTime: string;
  color: string;
  strictTracking: boolean;
  insistentReminder: boolean;
  stockEnabled: boolean;
  stockQuantity: number;
  doseUnits: number;
  stockUnit: string;
  lowStockThreshold: number;
}

interface TreatmentGroup {
  key: string;
  name: string;
  treatments: MedicationTreatment[];
  status: MedicationTreatment['status'];
  startDate: string;
}

interface MedicationHistoryEntry {
  dose: MedicationDose;
  treatment: MedicationTreatment;
  status: MedicationHistoryStatus;
}

type GlobalSearchResultKind = 'task' | 'event' | 'birthday' | 'treatment' | 'medication' | 'note';

interface GlobalSearchResult {
  id: string;
  kind: GlobalSearchResultKind;
  title: string;
  subtitle: string;
  task?: Task;
  treatment?: MedicationTreatment;
  treatmentGroupKey?: string;
  note?: QuickNote;
}

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
  styleUrls: [
    'home.page.scss',
    'home.page-calendar.scss',
    'home.page-forms.scss',
    'home.page-components.scss',
    'home.page-responsive.scss',
  ],
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
    IonMenu,
    IonModal,
    IonRefresher,
    IonRefresherContent,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonTextarea,
    IonToggle,
    IonToolbar,
  ],
})
export class HomePage implements OnInit, OnDestroy {
  private readonly taskService = inject(TaskService);
  private readonly labelReminderService = inject(LabelReminderService);
  private readonly notificationScheduler = inject(NotificationSchedulerService);
  private readonly deviceCalendarService = inject(DeviceCalendarService);
  private readonly wellnessService = inject(WellnessService);
  private readonly noteService = inject(NoteService);
  private readonly walletService = inject(WalletService);
  private readonly selfCareService = inject(SelfCareService);
  private readonly menuController = inject(MenuController);
  private readonly changeDetector = inject(ChangeDetectorRef);

  @ViewChild(IonModal) modal?: IonModal;
  @ViewChild('agendaTimeline') agendaTimeline?: ElementRef<HTMLElement>;
  @ViewChild('presetModal') presetModal?: IonModal;
  @ViewChild('settingsModal') settingsModal?: IonModal;
  @ViewChild('deviceCalendarModal') deviceCalendarModal?: IonModal;
  @ViewChild('batteryModal') batteryModal?: IonModal;
  @ViewChild('wellnessModal') wellnessModal?: IonModal;
  @ViewChild('treatmentsModal') treatmentsModal?: IonModal;
  @ViewChild('globalSearchModal') globalSearchModal?: IonModal;
  @ViewChild('notesModal') notesModal?: IonModal;
  @ViewChild('walletModal') walletModal?: IonModal;
  @ViewChild('todayFab') todayFab?: IonFab;

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
  birthdayEditorOpen = false;
  birthdayRepeatExpanded = false;
  birthdayNameValue = '';
  birthdayDate = '';
  birthdayRepeatsYearly = true;
  syncBirthdayToDeviceCalendar = false;
  syncEventToDeviceCalendar = false;
  birthdaySaveError = '';
  confirmingEventDeletion = false;
  expandedTaskId: number | null = null;
  expandedReminderLabel: TaskLabel | null = null;
  notificationSyncStatus: NotificationSyncStatus | 'idle' | 'error' = 'idle';
  insistentNotificationsEnabled = false;
  batteryOptimizationStatus: 'checking' | 'protected' | 'restricted' | 'unavailable' = 'checking';
  batteryDeviceInfo = { manufacturer: 'Android', family: 'android' };
  calendarEditError = '';
  deviceCalendarStatus: 'idle' | 'loading' | 'ready' | 'denied' | 'unavailable' | 'error' = 'idle';
  deviceCalendars: DeviceCalendar[] = [];
  deviceCalendarTasks: DeviceCalendarTask[] = [];
  deviceCalendarSettings: DeviceCalendarSettings = {
    enabled: false,
    selectedCalendarIds: [],
    selectionConfigured: false,
  };
  wellnessSettings: WellnessSettings = { enabled: false };
  medicationTreatments: MedicationTreatment[] = [];
  medicationDoses: MedicationDose[] = [];
  wellnessView: WellnessView = 'treatment';
  selfCareState: SelfCareState = { enabled: false, habits: [], completions: [], lowEnergy: false };
  selfCareFilter: SelfCareFilter = 'daily';
  selfCareEditorOpen = false;
  selfCareHistoryOpen = false;
  editingSelfCareHabitId: string | null = null;
  selfCareName = '';
  selfCareIcon = '✨';
  selfCareColor = '#8b5cf6';
  selfCareDays = [0, 1, 2, 3, 4, 5, 6];
  selfCareTimes: string[] = [];
  selfCareTimeDraft = '08:00';
  selfCareEssential = false;
  selfCareReminders = false;
  readonly selfCareIcons = ['🪥', '💧', '🧴', '🚿', '🍽️', '💊', '✨', '🧘'];
  treatmentName = '';
  treatmentStartDate = '';
  treatmentMedicationDrafts: TreatmentMedicationDraft[] = [];
  editingDraftKey: string | null = null;
  editingMedicationId: string | null = null;
  medicationName = '';
  medicationDose = '';
  medicationInstructions = '';
  medicationStartDate = '';
  medicationEndDate = '';
  medicationContinuous = false;
  medicationDays: number[] = [];
  medicationTimes: string[] = [];
  medicationColor = '#22c55e';
  medicationStrictTracking = false;
  medicationInsistentReminder = false;
  medicationStockEnabled = false;
  medicationStockQuantity = 30;
  medicationDoseUnits = 1;
  medicationStockUnit = 'tabletas';
  medicationLowStockThreshold = 5;
  medicationFrequencyHours = 8;
  medicationDurationDays: number | null = 4;
  medicationFirstTime = '08:00';
  confirmingMedicationDeletion = false;
  expandedTreatmentGroupKey: string | null = null;
  confirmingTreatmentGroupDeleteKey: string | null = null;
  restockingMedicationId: string | null = null;
  restockAmount = 0;
  selectedHistoryGroupKey: string | null = null;
  medicationHistoryFilter: MedicationHistoryFilter = 'all';
  globalSearchQuery = '';
  quickNotes: QuickNote[] = [];
  notesView: 'list' | 'editor' = 'list';
  editingNoteId: string | null = null;
  noteTitle = '';
  noteContent = '';
  walletState: WalletState = {
    settings: { salaryAmount: 0, paySchedule: 'semi-monthly', firstPayDate: '', weeklyPayDay: 1, moveWeekendPayToFriday: false, currency: 'MXN' },
    fixedExpenses: [],
    loans: [],
    transactions: [],
  };
  walletView: WalletView = 'dashboard';
  loansStandalone = false;
  walletTransactionKind: WalletTransactionKind = 'expense';
  walletDescription = '';
  walletAmount: number | null = null;
  walletCategory = 'Otros';
  walletDate = '';
  walletExpenseLoanId: string | null = null;
  walletIncomeLoanId: string | null = null;
  editingFixedExpenseId: string | null = null;
  fixedExpenseName = '';
  fixedExpenseAmount: number | null = null;
  fixedExpenseCategory = 'Servicios';
  fixedExpenseDueDay = 1;
  fixedExpenseFrequencyMonths: 1 | 2 = 1;
  fixedExpenseFirstDueDate = '';
  fixedExpenseReminderTime = '09:00';
  fixedExpenseInsistentReminder = false;
  private readonly dismissedWalletReminderKey = 'agenda_dismissed_wallet_reminders_v1';
  private walletSwipeStartX: number | null = null;
  walletSwipeOffset = 0;
  walletSwipingOccurrenceId: string | null = null;
  payingFixedOccurrence: FixedExpenseOccurrence | null = null;
  fixedPaymentAmount: number | null = null;
  fixedPaymentDate = '';
  walletSalaryAmount: number | null = null;
  walletPaySchedule: 'semi-monthly' | 'biweekly' | 'weekly' = 'semi-monthly';
  walletFirstPayDate = '';
  walletWeeklyPayDay = 1;
  walletMoveWeekendPayToFriday = false;
  editingLoanId: string | null = null;
  loanCreditor = '';
  loanOriginalAmount: number | null = null;
  loanRemainingAmount: number | null = null;
  loanPaymentAmount: number | null = null;
  loanPaymentSchedule: 'fixed' | 'weekly' | 'tentative' = 'fixed';
  loanDueDay = 1;
  loanDueWeekday = 1;
  loanTentativePaymentDate = '';
  loanNotes = '';
  payingLoan: WalletLoan | null = null;
  loanPaymentValue: number | null = null;
  loanPaymentDate = '';
  returnToTreatmentManager = false;
  readonly medicationFrequencyOptions = [4, 6, 8, 12, 24];
  readonly medicationDurationOptions = [3, 4, 5, 7, 10, 14, 30];
  readonly medicationStockUnits = ['tabletas', 'cápsulas', 'dosis', 'ml'];
  readonly loanWeekdays = [
    { value: 0, label: 'Domingo' }, { value: 1, label: 'Lunes' }, { value: 2, label: 'Martes' },
    { value: 3, label: 'Miércoles' }, { value: 4, label: 'Jueves' }, { value: 5, label: 'Viernes' }, { value: 6, label: 'Sábado' },
  ];

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
  taskScheduleEnabled = false;
  taskSubtasks: TaskSubtask[] = [];
  newSubtaskTitle = '';
  advancedModeEnabled = false;
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
  routineEditorOpen = false;
  prioridad: TaskPriority = 'media';
  etiqueta: TaskLabel | undefined = undefined;
  taskInsistentReminder = false;
  taskReminderEnabled = false;
  taskReminderDate = '';
  taskReminderTime = '09:00';
  eventReminderMinutes: number | null = null;
  readonly eventReminderOptions = [
    { minutes: 0, label: 'A la hora del evento' },
    { minutes: 5, label: '5 minutos antes' },
    { minutes: 10, label: '10 minutos antes' },
    { minutes: 15, label: '15 minutos antes' },
    { minutes: 30, label: '30 minutos antes' },
    { minutes: 60, label: '1 hora antes' },
    { minutes: 120, label: '2 horas antes' },
    { minutes: 1440, label: '1 día antes' },
  ];
  actividadMadreId: number | undefined = undefined;
  favorita = false;
  repeticion: TaskRepeat = 'none';
  private currentTimeTimer?: ReturnType<typeof setInterval>;
  private appResumeListener?: PluginListenerHandle;
  private appBackButtonListener?: PluginListenerHandle;
  private calendarChangeListener?: PluginListenerHandle;
  private notificationActionListener?: PluginListenerHandle;
  private calendarRefreshTimer?: ReturnType<typeof setTimeout>;
  private initialPermissionTimer?: ReturnType<typeof setTimeout>;
  private readonly liveStateSubscriptions = new Subscription();
  private lastClockMinute = '';
  private lastStoredRefreshAt = 0;
  private ignoreBackUntil = 0;
  private readonly storageChangeListener = () => this.refreshStoredState();
  private readonly windowFocusListener = () => this.refreshStoredState();
  private readonly visibilityChangeListener = () => {
    if (document.visibilityState === 'visible') this.refreshStoredState();
  };
  private reminderSettingsReady = false;
  private readonly fabPositionKey = 'home-fab-position';
  private readonly advancedModeKey = 'agenda-advanced-mode';
  private readonly initialPermissionKey = 'agenda-native-permissions-v1';
  private readonly initialCalendarPermissionKey = 'agenda-calendar-permission-requested-v1';
  private fabDrag?: {
    pointerId: number;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
    startRect: DOMRect;
    button: HTMLElement;
  };
  private suppressFabClick = false;
  fabOffsetX = 0;
  fabOffsetY = 0;
  fabListSide: 'top' | 'bottom' = 'top';
  fabDragging = false;
  medicationHomeExpanded = false;

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
      batteryChargingOutline,
      calendarOutline,
      checkboxOutline,
      chevronBackOutline,
      chevronDownOutline,
      chevronForwardOutline,
  close,
  closeCircleOutline,
      ellipsisHorizontal,
      giftOutline,
      heartOutline,
      homeOutline,
      menuOutline,
      medicalOutline,
      walletOutline,
      cashOutline,
      receiptOutline,
      documentTextOutline,
      notificationsOutline,
      pauseOutline,
  pricetagOutline,
  pencilOutline,
  playOutline,
  repeatOutline,
  squareOutline,
      saveOutline,
      searchOutline,
      settingsOutline,
      sunnyOutline,
      timeOutline,
      trashOutline,
      stopCircleOutline,
      add,
    });
  }

  ngOnInit(): void {
    this.connectLiveState();
    window.addEventListener('storage', this.storageChangeListener);
    window.addEventListener('focus', this.windowFocusListener);
    document.addEventListener('visibilitychange', this.visibilityChangeListener);
    this.advancedModeEnabled = localStorage.getItem(this.advancedModeKey) === 'true';
    this.loadFabPosition();
    this.selectedDate = this.taskService.toISODate(new Date());
    this.currentMonth = new Date(`${this.selectedDate}T00:00:00`);
    this.setTasks(this.taskService.load());
    this.labelReminderSettings = this.labelReminderService.load(
      this.etiquetas.map((label) => label.nombre),
    );
    this.insistentNotificationsEnabled = this.notificationScheduler.loadInsistentNotificationsEnabled();
    this.reminderSettingsReady = true;
    this.syncNotifications();
    void this.refreshBatteryOptimizationStatus();
    this.preestablecidos = this.taskService.loadEventPresets();
    this.wellnessSettings = this.wellnessService.loadSettings();
    this.medicationTreatments = this.wellnessService.loadTreatments();
    this.quickNotes = this.noteService.load();
    this.walletState = this.walletService.load();
    this.selfCareState = this.selfCareService.load();
    void this.walletService.initializePersistence().then((state) => {
      this.walletState = state;
      this.syncNotifications();
      this.refreshView();
    });
    void this.noteService.initializePersistence().then((notes) => {
      this.quickNotes = notes;
      this.refreshView();
    });
    void this.wellnessService.initializePersistence().then((treatments) => {
      this.medicationTreatments = treatments;
      this.medicationDoses = this.wellnessService.getDoses();
      this.buildCalendar();
      this.syncNotifications();
      this.refreshView();
    });
    void this.taskService.initializePersistence().then(({ tasks, presets }) => {
      this.preestablecidos = presets;
      this.setTasks(tasks);
    });
    this.deviceCalendarSettings = this.deviceCalendarService.loadSettings();
    void this.notificationScheduler.listenForActions((action) =>
      this.handleNotificationAction(action),
    ).then((listener) => {
      this.notificationActionListener = listener;
    });
    void this.refreshDeviceCalendarEvents();
    if (this.deviceCalendarService.supported) {
      void App.addListener('resume', () => {
        this.refreshStoredState();
        void this.refreshDeviceCalendarEvents();
        void this.refreshBatteryOptimizationStatus();
      }).then((listener) => {
        this.appResumeListener = listener;
      });
      void this.deviceCalendarService.observeChanges(() => {
        if (this.calendarRefreshTimer) clearTimeout(this.calendarRefreshTimer);
        this.calendarRefreshTimer = setTimeout(() => this.refreshDeviceCalendarEvents(), 500);
      }).then((listener) => {
        this.calendarChangeListener = listener;
      });
    }
    if (Capacitor.getPlatform() === 'android') {
      void App.addListener('backButton', () => {
        void this.handleAndroidBack();
      }).then((listener) => {
        this.appBackButtonListener = listener;
      });
    }
    this.updateLiveClock();
    this.currentTimeTimer = setInterval(() => this.updateLiveClock(), 1_000);
    this.initialPermissionTimer = setTimeout(() => void this.requestInitialAndroidPermissions(), 700);
  }

  ngOnDestroy(): void {
    if (this.currentTimeTimer) {
      clearInterval(this.currentTimeTimer);
    }
    void this.appResumeListener?.remove();
    void this.appBackButtonListener?.remove();
    void this.calendarChangeListener?.remove();
    void this.notificationActionListener?.remove();
    this.liveStateSubscriptions.unsubscribe();
    window.removeEventListener('storage', this.storageChangeListener);
    window.removeEventListener('focus', this.windowFocusListener);
    document.removeEventListener('visibilitychange', this.visibilityChangeListener);
    if (this.calendarRefreshTimer) clearTimeout(this.calendarRefreshTimer);
    if (this.initialPermissionTimer) clearTimeout(this.initialPermissionTimer);
  }

  private connectLiveState(): void {
    this.liveStateSubscriptions.add(
      this.taskService.changes$.subscribe((tasks) => this.setTasks(tasks)),
    );
    this.liveStateSubscriptions.add(
      this.walletService.changes$.subscribe((state) => {
        this.walletState = state;
        this.syncNotifications();
        this.refreshView();
      }),
    );
    this.liveStateSubscriptions.add(
      this.selfCareService.changes$.subscribe((state) => {
        this.selfCareState = state;
        this.refreshView();
      }),
    );
    this.liveStateSubscriptions.add(
      this.wellnessService.changes$.subscribe(({ treatments, doses, settings }) => {
        this.wellnessSettings = settings;
        this.medicationTreatments = treatments;
        this.medicationDoses = doses;
        this.buildCalendar();
        this.syncNotifications();
        this.refreshView();
      }),
    );
    this.liveStateSubscriptions.add(
      this.noteService.changes$.subscribe((notes) => {
        this.quickNotes = notes;
        this.refreshView();
      }),
    );
  }

  private updateLiveClock(): void {
    const previousDate = this.taskService.toISODate(this.currentTime);
    this.currentTime = new Date();
    this.refreshView();
    const currentMinute = `${this.taskService.toISODate(this.currentTime)}T${String(this.currentTime.getHours()).padStart(2, '0')}:${String(this.currentTime.getMinutes()).padStart(2, '0')}`;
    if (currentMinute === this.lastClockMinute) return;

    this.lastClockMinute = currentMinute;
    if (this.taskService.toISODate(this.currentTime) !== previousDate) {
      this.medicationDoses = this.wellnessService.refreshDoses(this.currentTime);
    }
    this.refreshExpiredTasks();
  }

  private refreshStoredState(): void {
    const now = Date.now();
    if (now - this.lastStoredRefreshAt < 250) return;
    this.lastStoredRefreshAt = now;
    this.currentTime = new Date();
    if (Capacitor.getPlatform() !== 'android') this.taskService.load();
    this.preestablecidos = this.taskService.loadEventPresets();
    this.labelReminderSettings = this.labelReminderService.load(
      this.etiquetas.map((label) => label.nombre),
    );
    this.deviceCalendarSettings = this.deviceCalendarService.loadSettings();
    this.wellnessSettings = this.wellnessService.loadSettings();
    this.medicationTreatments = this.wellnessService.loadTreatments();
    this.wellnessService.loadDoses();
    this.medicationDoses = this.wellnessService.refreshDoses(this.currentTime);
    this.quickNotes = this.noteService.load();
    this.walletState = this.walletService.load();
    this.buildCalendar();
    if (Capacitor.getPlatform() !== 'android') this.syncNotifications();
    this.refreshView();
    if (Capacitor.getPlatform() === 'android') {
      void this.taskService.initializePersistence().then(({ tasks, presets }) => {
        this.preestablecidos = presets;
        this.setTasks(tasks);
      });
    }
  }

  private async handleAndroidBack(): Promise<void> {
    if (Date.now() < this.ignoreBackUntil) return;
    if (this.eventCancelAlertOpen) {
      this.cancelarConfirmacionEvento();
      return;
    }
    if (this.eventEditorOpen) {
      this.cerrarEditorEvento();
      return;
    }
    if (this.birthdayEditorOpen) {
      this.cerrarEditorCumpleanos();
      return;
    }
    if (this.selectedEvent) {
      this.cerrarDetalleEvento();
      return;
    }
    if (await this.menuController.isOpen('settings-menu')) {
      await this.menuController.close('settings-menu');
      return;
    }
    if (await this.menuController.isOpen('main-menu')) {
      await this.menuController.close('main-menu');
      return;
    }

    const topModal = document.querySelector<HTMLIonModalElement>(
      'ion-modal.modal-top, ion-modal.show-modal',
    );
    if (topModal) {
      if (topModal.id === 'task-editor-modal') {
        this.cerrarModal();
        return;
      }
      if (topModal.id === 'routines-modal' && this.routineEditorOpen) {
        this.cancelarEdicionPreestablecido();
        return;
      }
      if (topModal.id === 'wellness-modal' && this.wellnessView === 'medication') {
        this.volverDesdeBienestar();
        return;
      }
      if (topModal.id === 'treatments-modal' && this.selectedHistoryGroupKey) {
        this.cerrarHistorialTratamiento();
        return;
      }
      if (topModal.id === 'notes-modal' && this.notesView === 'editor') {
        this.resetNoteEditor();
        return;
      }
      if (topModal.id === 'wallet-modal' && this.walletView !== 'dashboard') {
        this.walletView = 'dashboard';
        return;
      }
      this.ignoreBackUntil = Date.now() + 450;
      await topModal.dismiss();
      return;
    }

    if (this.expandedTaskId !== null) {
      this.expandedTaskId = null;
      return;
    }
    if (this.selectedView !== 'hoy') {
      this.selectView('hoy');
      return;
    }
    await App.exitApp();
  }

  private refreshView(): void {
    this.changeDetector.markForCheck();
  }

  get visibleSections(): TaskSection[] {
    if (this.selectedView === 'hoy') {
      const homeOrder: TaskSection['id'][] = [
        'sin-fecha',
        'manana',
        'proximas',
        'vencidas',
      ];
      return homeOrder
        .flatMap((id) => this.secciones.filter((section) => section.id === id))
        .map((section) => ({
          ...section,
          tareas: section.tareas.filter((tarea) => {
            if (tarea.tipo === 'evento' && tarea.presetId !== undefined) return false;
            return section.id !== 'proximas' || tarea.tipo === 'tarea';
          }),
        }))
        .filter((section) => section.tareas.length > 0);
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
        (tarea) =>
          tarea.tipo === 'tarea' &&
          (tarea.estado === 'vencida' || tarea.estado === 'ignorada'),
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
      if (
        tarea.estado !== 'pendiente' ||
        tarea.fecha !== today ||
        !tarea.hora
      ) {
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
        if (
          tarea.estado !== 'pendiente' ||
          tarea.fecha !== today ||
          !tarea.hora
        ) return false;
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
      .getTasksForDate(this.selectedDate, this.calendarTasks);
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

  get writableDeviceCalendars(): DeviceCalendar[] {
    return this.deviceCalendars.filter((calendar) => calendar.writable);
  }

  get willSaveEventToDeviceCalendar(): boolean {
    return this.formItemType === 'evento'
      && this.editingTaskId === null
      && this.syncEventToDeviceCalendar
      && !!this.deviceCalendarSettings.destinationCalendarId;
  }

  calendarTaskTitle(tarea: Task): string {
    return tarea.parentId ? `↳ ${tarea.titulo}` : tarea.titulo;
  }

  get timeRangeInvalid(): boolean {
    return !!this.nuevaHora && !!this.nuevaHoraFin && this.nuevaHoraFin <= this.nuevaHora;
  }

  get taskSchedulingInvalid(): boolean {
    if (this.formItemType !== 'tarea') return false;
    return this.taskScheduleEnabled && !this.nuevaFecha;
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
    this.titulo = view === 'cuidado' ? 'Mi autocuidado' : 'Agenda';

    if (view === 'hoy') {
      this.currentTime = new Date();
      this.medicationDoses = this.wellnessService.refreshDoses(this.currentTime);
      this.refreshExpiredTasks();
    }

    if (view === 'calendario' && this.calendarView === 'dia') {
      void this.refreshDeviceCalendarEvents();
      setTimeout(() => this.scrollToCurrentHour());
    }
  }

  get selfCareTodayEntries(): Array<{ habit: SelfCareHabit; timeKey: string; completed: boolean }> {
    const date = this.taskService.toISODate(this.currentTime);
    const day = this.currentTime.getDay();
    return this.selfCareState.habits
      .filter((habit) => habit.days.includes(day))
      .flatMap((habit) => (habit.times.length ? habit.times : ['Durante el día']).map((timeKey) => ({
        habit, timeKey,
        completed: this.selfCareState.completions.some((item) => item.habitId === habit.id && item.date === date && item.timeKey === timeKey),
      })))
      .filter((entry) => !this.selfCareState.lowEnergy || entry.habit.essential)
      .filter((entry) => this.matchesSelfCareFilter(entry.timeKey));
  }

  get selfCareActiveEntries(): Array<{ habit: SelfCareHabit; timeKey: string; completed: boolean }> {
    return this.selfCareTodayEntries.filter((entry) => !entry.completed);
  }

  get selfCareHistoryEntries(): Array<{ habit: SelfCareHabit; timeKey: string; completed: boolean }> {
    return this.selfCareTodayEntries.filter((entry) => entry.completed);
  }

  get selfCareActiveMedicationEntries(): MedicationDose[] {
    return this.selfCareMedicationEntries.filter((dose) => dose.status === 'pending');
  }

  get selfCareHistoryMedicationEntries(): MedicationDose[] {
    return this.selfCareMedicationEntries.filter((dose) => dose.status === 'taken');
  }

  get selfCareProgress(): number {
    const entries = this.selfCareTodayEntries;
    const medication = this.selfCareMedicationEntries;
    const total = entries.length + medication.length;
    return total ? Math.round(((entries.filter((entry) => entry.completed).length + medication.filter((dose) => dose.status === 'taken').length) / total) * 100) : 0;
  }

  get selfCareTotalCount(): number { return this.selfCareTodayEntries.length + this.selfCareMedicationEntries.length; }

  get selfCareCompletedCount(): number {
    return this.selfCareTodayEntries.filter((entry) => entry.completed).length
      + this.selfCareMedicationEntries.filter((dose) => dose.status === 'taken').length;
  }

  get selfCareMedicationEntries(): MedicationDose[] {
    if (!this.wellnessSettings.enabled) return [];
    return this.todayMedicationDoses.filter((dose) => dose.status === 'pending' || dose.status === 'taken');
  }

  toggleSelfCareEntry(habit: SelfCareHabit, timeKey: string): void {
    this.selfCareState = this.selfCareService.toggleCompletion(habit.id, this.taskService.toISODate(this.currentTime), timeKey);
  }

  setSelfCareFilter(filter: SelfCareFilter): void { this.selfCareFilter = filter; }

  setLowEnergyMode(enabled: boolean): void { this.selfCareState = this.selfCareService.setLowEnergy(enabled); }

  setSelfCareEnabled(enabled: boolean): void {
    this.selfCareState = this.selfCareService.setEnabled(enabled);
    if (!enabled && this.selectedView === 'cuidado') this.selectView('hoy');
  }

  openSelfCareEditor(habit?: SelfCareHabit): void {
    this.editingSelfCareHabitId = habit?.id ?? null;
    this.selfCareName = habit?.name ?? '';
    this.selfCareIcon = habit?.icon ?? '✨';
    this.selfCareColor = habit?.color ?? '#8b5cf6';
    this.selfCareDays = habit?.days ? [...habit.days] : [0,1,2,3,4,5,6];
    this.selfCareTimes = habit?.times ? [...habit.times] : [];
    this.selfCareTimeDraft = this.selfCareTimes.at(-1) ?? '08:00';
    this.selfCareEssential = habit?.essential ?? false;
    this.selfCareReminders = habit?.reminders ?? false;
    this.selfCareEditorOpen = true;
  }

  saveSelfCareHabit(): void {
    this.selfCareState = this.selfCareService.saveHabit({ name: this.selfCareName, icon: this.selfCareIcon, color: this.selfCareColor, days: this.selfCareDays, times: this.selfCareTimes, essential: this.selfCareEssential, reminders: this.selfCareReminders }, this.editingSelfCareHabitId ?? undefined);
    if (this.selfCareName.trim()) this.selfCareEditorOpen = false;
  }

  deleteSelfCareHabit(): void {
    if (!this.editingSelfCareHabitId) return;
    this.selfCareState = this.selfCareService.deleteHabit(this.editingSelfCareHabitId);
    this.selfCareEditorOpen = false;
  }

  toggleSelfCareDay(day: number): void {
    this.selfCareDays = this.selfCareDays.includes(day) ? this.selfCareDays.filter((item) => item !== day) : [...this.selfCareDays, day];
  }

  addSelfCareTime(): void {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(this.selfCareTimeDraft)) return;
    if (!this.selfCareTimes.includes(this.selfCareTimeDraft)) {
      this.selfCareTimes = [...this.selfCareTimes, this.selfCareTimeDraft].sort();
    }
  }

  removeSelfCareTime(time: string): void {
    this.selfCareTimes = this.selfCareTimes.filter((item) => item !== time);
  }

  selfCareMedicationName(dose: MedicationDose): string { return this.medicationForDose(dose)?.name ?? 'Medicamento'; }

  private matchesSelfCareFilter(timeKey: string): boolean {
    if (this.selfCareFilter === 'daily' || this.selfCareFilter === 'mine') return true;
    if (!/^\d{2}:\d{2}$/.test(timeKey)) return false;
    const hour = Number(timeKey.slice(0, 2));
    return this.selfCareFilter === 'morning' ? hour < 12 : hour >= 18;
  }

  async refreshPage(event: RefresherCustomEvent): Promise<void> {
    try {
      this.currentTime = new Date();
      const { presets } = await this.taskService.initializePersistence();
      this.preestablecidos = presets;
      this.labelReminderSettings = this.labelReminderService.load(
        this.etiquetas.map((label) => label.nombre),
      );
      this.deviceCalendarSettings = this.deviceCalendarService.loadSettings();
      this.wellnessSettings = this.wellnessService.loadSettings();
      this.medicationTreatments = await this.wellnessService.initializePersistence();
      this.medicationDoses = this.wellnessService.getDoses();
      this.quickNotes = await this.noteService.initializePersistence();
      this.setTasks(this.taskService.refreshExpired(this.currentTime));
      await Promise.all([
        this.refreshDeviceCalendarEvents(),
        this.refreshBatteryOptimizationStatus(),
      ]);
    } finally {
      await event.target.complete();
    }
  }

  startFabDrag(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const button = event.currentTarget as HTMLElement;
    const fab = button.closest('ion-fab');
    if (!fab) return;

    this.fabDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: this.fabOffsetX,
      startOffsetY: this.fabOffsetY,
      startRect: fab.getBoundingClientRect(),
      button,
    };
    this.fabDragging = true;
    button.setPointerCapture(event.pointerId);
  }

  moveFab(event: PointerEvent): void {
    const drag = this.fabDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const movementX = event.clientX - drag.startX;
    const movementY = event.clientY - drag.startY;
    if (!this.suppressFabClick && Math.hypot(movementX, movementY) < 6) return;

    this.suppressFabClick = true;
    event.preventDefault();
    void this.todayFab?.close();

    const headerBottom = document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0;
    const footerTop = document.querySelector('.bottom-nav')?.getBoundingClientRect().top ?? window.innerHeight;
    const minLeft = 8;
    const maxLeft = Math.max(minLeft, window.innerWidth - drag.startRect.width - 8);
    const minTop = headerBottom + 8;
    const maxTop = Math.max(minTop, footerTop - drag.startRect.height - 8);
    const left = Math.min(maxLeft, Math.max(minLeft, drag.startRect.left + movementX));
    const top = Math.min(maxTop, Math.max(minTop, drag.startRect.top + movementY));

    this.fabOffsetX = drag.startOffsetX + left - drag.startRect.left;
    this.fabOffsetY = drag.startOffsetY + top - drag.startRect.top;
    this.fabListSide = top + drag.startRect.height / 2 < (headerBottom + footerTop) / 2
      ? 'bottom'
      : 'top';
  }

  endFabDrag(event: PointerEvent): void {
    const drag = this.fabDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.button.hasPointerCapture(event.pointerId)) {
      drag.button.releasePointerCapture(event.pointerId);
    }
    this.fabDrag = undefined;

    if (this.suppressFabClick) {
      const currentLeft = drag.startRect.left + this.fabOffsetX - drag.startOffsetX;
      const edgeLeft = 8;
      const edgeRight = Math.max(edgeLeft, window.innerWidth - drag.startRect.width - 8);
      const snappedLeft = currentLeft + drag.startRect.width / 2 < window.innerWidth / 2
        ? edgeLeft
        : edgeRight;
      this.fabOffsetX += snappedLeft - currentLeft;
      this.fabDragging = false;
      this.saveFabPosition();
      void this.todayFab?.close();
      setTimeout(() => { this.suppressFabClick = false; }, 300);
    } else {
      this.fabDragging = false;
    }
  }

  handleFabClick(event: MouseEvent): void {
    if (!this.suppressFabClick) return;
    event.preventDefault();
    event.stopPropagation();
    void this.todayFab?.close();
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
    this.resetForm(fecha ?? this.taskService.toISODate(new Date()));
    this.taskScheduleEnabled = !!fecha;
    this.nuevaHora = hora ?? '';
    this.nuevaHoraFin = hora ? this.addMinutesToTime(hora, 60) : '';
    this.eventColor = '#2563eb';
    this.modal?.present();
  }

  nuevoEvento(fecha?: string, hora?: string): void {
    this.formMode = 'create';
    this.formItemType = 'evento';
    this.editingTaskId = null;
    this.resetForm(fecha ?? this.taskService.toISODate(new Date()));
    this.nuevaHora = hora ?? '';
    this.nuevaHoraFin = hora ? this.addMinutesToTime(hora, 60) : '';
    this.eventColor = '#2563eb';
    this.eventRepeatExpanded = false;
    this.confirmingEventDeletion = false;
    this.eventEditorOpen = true;
  }

  nuevoCumpleanos(): void {
    this.birthdayNameValue = '';
    this.birthdayDate = '';
    this.birthdayRepeatsYearly = true;
    this.syncBirthdayToDeviceCalendar = false;
    this.birthdayRepeatExpanded = false;
    this.birthdaySaveError = '';
    this.birthdayEditorOpen = true;
  }

  cerrarEditorCumpleanos(): void {
    this.birthdayEditorOpen = false;
    this.birthdayRepeatExpanded = false;
    this.birthdaySaveError = '';
  }

  async guardarCumpleanos(): Promise<void> {
    const name = this.birthdayNameValue.trim();
    if (!name || !this.birthdayDate) return;

    this.birthdaySaveError = '';
    this.setTasks(this.taskService.create({
      titulo: `Cumpleaños de ${name}`,
      tipo: 'evento',
      fecha: this.nextBirthdayDate(this.birthdayDate),
      color: '#c45b86',
      prioridad: 'media',
      repeticion: this.birthdayRepeatsYearly ? 'yearly' : 'none',
    }));

    if (!this.syncBirthdayToDeviceCalendar) {
      this.cerrarEditorCumpleanos();
      return;
    }

    const calendarId = this.deviceCalendarSettings.destinationCalendarId ?? this.writableDeviceCalendars[0]?.id;
    if (!calendarId) {
      this.birthdaySaveError = 'Se guardó en Todo en Orden. Para sincronizarlo, activa Calendarios del dispositivo desde el menú.';
      return;
    }
    try {
      await this.deviceCalendarService.createEvent({
        calendarId,
        title: `Cumpleaños de ${name}`,
        date: this.birthdayDate,
        recurrence: this.birthdayRepeatsYearly ? 'yearly' : 'none',
      });
      await this.refreshDeviceCalendarEvents();
      this.cerrarEditorCumpleanos();
    } catch (error) {
      this.birthdaySaveError = this.errorMessage(error);
    }
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
    if (this.timeRangeInvalid || this.taskSchedulingInvalid) return;

    if (this.editingTaskId !== null && this.formMode === 'reschedule' && this.formItemType === 'tarea') {
      this.setTasks(
        this.taskService.reschedule(
          this.editingTaskId,
          this.nuevaFecha,
          this.nuevaHora,
          this.nuevaHoraFin,
        ),
      );
      this.cerrarModal();
      return;
    }

    const taskWithoutSchedule = this.formItemType === 'tarea' && !this.taskScheduleEnabled;
    const draft = {
      titulo: this.nuevoTitulo,
      tipo: this.formItemType,
      fecha: taskWithoutSchedule ? '' : this.nuevaFecha,
      hora: taskWithoutSchedule ? '' : this.nuevaHora,
      horaFin: taskWithoutSchedule ? '' : this.nuevaHoraFin,
      color: this.formItemType === 'evento' ? this.eventColor : undefined,
      prioridad: this.prioridad,
      etiqueta: this.etiqueta,
      insistentReminder: this.formItemType === 'tarea' && this.taskInsistentReminder,
      reminderDate: this.formItemType === 'tarea' && this.taskReminderEnabled
        ? this.taskReminderDate
        : undefined,
      reminderTime: this.formItemType === 'tarea' && this.taskReminderEnabled
        ? this.taskReminderTime
        : undefined,
      eventReminderMinutes: this.formItemType === 'evento'
        ? this.eventReminderMinutes ?? undefined
        : undefined,
      favorita: this.favorita,
      repeticion: this.repeticion,
      parentId: this.formItemType === 'tarea' ? this.actividadMadreId : undefined,
      subtasks: this.formItemType === 'tarea' ? this.taskSubtasks : undefined,
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

    const destinationCalendarId = this.deviceCalendarSettings.destinationCalendarId;
    if (this.editingTaskId === null && this.formItemType === 'evento' && this.syncEventToDeviceCalendar && destinationCalendarId) {
      if (!this.nuevaFecha) {
        this.calendarEditError = 'Selecciona una fecha para sincronizar el evento.';
        return;
      }
      this.calendarEditError = '';
      // La Agenda conserva siempre su propio evento; la sincronización es una copia opcional.
      this.setTasks(this.taskService.create(draft));
      try {
        await this.deviceCalendarService.createEvent({
          calendarId: destinationCalendarId,
          title: this.nuevoTitulo.trim(),
          date: this.nuevaFecha,
          startTime: this.nuevaHora || undefined,
          endTime: this.nuevaHoraFin || undefined,
          recurrence: this.repeticion,
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

  agregarSubtarea(): void {
    const title = this.newSubtaskTitle.trim();
    if (!title) return;
    this.taskSubtasks = [
      ...this.taskSubtasks,
      { id: this.createSubtaskId(), title, completed: false },
    ];
    this.newSubtaskTitle = '';
  }

  eliminarSubtarea(id: string): void {
    this.taskSubtasks = this.taskSubtasks.filter((subtask) => subtask.id !== id);
  }

  toggleDraftSubtask(id: string): void {
    this.taskSubtasks = this.taskSubtasks.map((subtask) => subtask.id === id
      ? { ...subtask, completed: !subtask.completed }
      : subtask);
  }

  toggleSavedSubtask(task: Task, subtaskId: string): void {
    this.setTasks(this.taskService.toggleSubtask(task.id, subtaskId));
  }

  subtaskProgress(task: Task): { completed: number; total: number; percentage: number } {
    const subtasks = task.subtasks ?? [];
    const completed = subtasks.filter((subtask) => subtask.completed).length;
    return {
      completed,
      total: subtasks.length,
      percentage: subtasks.length ? Math.round((completed / subtasks.length) * 100) : 0,
    };
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

  setTaskScheduleEnabled(enabled: boolean): void {
    this.taskScheduleEnabled = enabled;
    if (enabled) {
      this.nuevaFecha ||= this.taskService.toISODate(new Date());
      return;
    }
    this.nuevaFecha = '';
    this.nuevaHora = '';
    this.nuevaHoraFin = '';
    this.repeticion = 'none';
    this.syncEventToDeviceCalendar = false;
  }

  setTaskReminderEnabled(enabled: boolean): void {
    this.taskReminderEnabled = enabled;
    if (!enabled) {
      this.taskInsistentReminder = false;
      return;
    }
    this.taskReminderDate ||= this.nuevaFecha || this.taskService.toISODate(this.currentTime);
    this.taskReminderTime = this.taskReminderTime || this.nuevaHora || '09:00';
  }

  focusEndTime(input: IonInput): void {
    window.setTimeout(() => void input.setFocus(), 0);
  }

  setEndTimeOneHourLater(input: IonInput): void {
    if (this.nuevaHora) this.nuevaHoraFin = this.addMinutesToTime(this.nuevaHora, 60);
    this.focusEndTime(input);
  }

  setPresetEndTimeOneHourLater(): void {
    if (this.presetHoraInicio) this.presetHoraFin = this.addMinutesToTime(this.presetHoraInicio, 60);
    this.actualizarHorarioPreestablecido();
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
    this.routineEditorOpen = false;
  }

  editarPreestablecido(preset: EventPreset): void {
    this.routineEditorOpen = true;
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
    this.routineEditorOpen = false;
  }

  nuevaRutina(): void {
    this.resetPresetForm();
    this.routineEditorOpen = true;
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
    this.resetPresetForm();
    this.routineEditorOpen = false;
    this.presetModal?.present();
  }

  cerrarPreestablecidos(): void {
    this.resetPresetForm();
    this.routineEditorOpen = false;
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

  setAdvancedModeEnabled(enabled: boolean): void {
    this.advancedModeEnabled = enabled;
    localStorage.setItem(this.advancedModeKey, String(enabled));
  }

  get globalSearchResults(): GlobalSearchResult[] {
    const query = this.normalizeSearchText(this.globalSearchQuery.trim());
    if (!query) return [];

    const results: GlobalSearchResult[] = [];
    const tasks = [...this.tareas, ...this.deviceCalendarTasks];
    const seenTasks = new Set<string>();
    for (const task of tasks) {
      const external = this.deviceCalendarTasks.find((item) => item.id === task.id);
      const sourceKey = `${external ? 'external' : 'local'}:${task.id}`;
      if (seenTasks.has(sourceKey)) continue;
      seenTasks.add(sourceKey);
      const kind: GlobalSearchResultKind = external?.externalKind === 'birthday'
        ? 'birthday'
        : task.tipo === 'evento' ? 'event' : 'task';
      const searchable = this.normalizeSearchText([
        task.titulo,
        ...(task.subtasks?.map((subtask) => subtask.title) ?? []),
        task.etiqueta,
        task.fecha,
        task.hora,
        this.globalSearchKindLabel(kind),
      ].filter(Boolean).join(' '));
      if (!searchable.includes(query)) continue;
      const matchingSubtask = task.subtasks?.find((subtask) =>
        this.normalizeSearchText(subtask.title).includes(query));
      const details = [
        matchingSubtask ? `Subtarea: ${matchingSubtask.title}` : undefined,
        task.fecha ? this.taskService.formatDate(task.fecha) : 'Sin fecha',
        task.hora,
        task.etiqueta,
      ].filter(Boolean).join(' · ');
      results.push({
        id: `${sourceKey}:${kind}`,
        kind,
        title: kind === 'birthday' && external ? this.birthdayName(external) : this.calendarTaskTitle(task),
        subtitle: details,
        task,
      });
    }

    for (const group of this.treatmentGroups) {
      const groupText = this.normalizeSearchText(`${group.name} tratamiento ${group.treatments.map((item) => item.name).join(' ')}`);
      if (groupText.includes(query)) {
        results.push({
          id: `treatment:${group.key}`,
          kind: 'treatment',
          title: group.name,
          subtitle: `${group.treatments.length} ${group.treatments.length === 1 ? 'medicamento' : 'medicamentos'} · Desde ${this.formatTreatmentDate(group.startDate)}`,
          treatmentGroupKey: group.key,
        });
      }
      for (const treatment of group.treatments) {
        const medicationText = this.normalizeSearchText(`${treatment.name} ${treatment.dose} ${treatment.instructions ?? ''} ${group.name}`);
        if (!medicationText.includes(query)) continue;
        results.push({
          id: `medication:${treatment.id}`,
          kind: 'medication',
          title: treatment.name,
          subtitle: `${treatment.dose} · ${group.name}`,
          treatment,
          treatmentGroupKey: group.key,
        });
      }
    }

    for (const note of this.quickNotes) {
      const searchable = this.normalizeSearchText(`${note.title} ${note.content} nota`);
      if (!searchable.includes(query)) continue;
      results.push({
        id: `note:${note.id}`,
        kind: 'note',
        title: this.noteDisplayTitle(note),
        subtitle: note.content || 'Nota sin contenido',
        note,
      });
    }

    return results.slice(0, 60);
  }

  async abrirBuscadorGlobal(): Promise<void> {
    this.globalSearchQuery = '';
    this.medicationTreatments = this.wellnessService.loadTreatments();
    this.quickNotes = this.noteService.load();
    await this.globalSearchModal?.present();
  }

  cerrarBuscadorGlobal(): void {
    this.globalSearchQuery = '';
    this.globalSearchModal?.dismiss();
  }

  globalSearchKindLabel(kind: GlobalSearchResultKind): string {
    if (kind === 'task') return 'Tarea';
    if (kind === 'event') return 'Evento';
    if (kind === 'birthday') return 'Cumpleaños';
    if (kind === 'treatment') return 'Tratamiento';
    if (kind === 'note') return 'Nota';
    return 'Medicamento';
  }

  globalSearchIcon(kind: GlobalSearchResultKind): string {
    if (kind === 'task') return 'checkbox-outline';
    if (kind === 'birthday') return 'gift-outline';
    if (kind === 'treatment' || kind === 'medication') return 'medical-outline';
    if (kind === 'note') return 'document-text-outline';
    return 'calendar-outline';
  }

  async abrirResultadoGlobal(result: GlobalSearchResult): Promise<void> {
    await this.globalSearchModal?.dismiss();
    this.globalSearchQuery = '';
    if (result.note) {
      await this.abrirNotas(result.note);
      return;
    }
    if (result.treatmentGroupKey) {
      await this.abrirTratamientos();
      this.expandedTreatmentGroupKey = result.treatmentGroupKey;
      return;
    }

    const task = result.task;
    if (!task) return;
    if (task.fecha) {
      this.selectedView = 'calendario';
      this.calendarView = 'dia';
      this.selectMonthDate(task.fecha);
      setTimeout(() => this.scrollToCurrentHour());
    }
    const external = this.deviceCalendarTasks.some((item) => item.id === task.id);
    if (external || task.tipo === 'evento') this.openCalendarItem(task);
    else this.editarTarea(task);
  }

  private normalizeSearchText(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX');
  }

  async abrirNotas(note?: QuickNote): Promise<void> {
    this.quickNotes = this.noteService.load();
    if (note) this.editarNota(this.quickNotes.find((item) => item.id === note.id) ?? note);
    else this.notesView = 'list';
    await this.notesModal?.present();
  }

  cerrarNotas(): void {
    this.resetNoteEditor();
    this.notesModal?.dismiss();
  }

  nuevaNota(): void {
    this.editingNoteId = null;
    this.noteTitle = '';
    this.noteContent = '';
    this.notesView = 'editor';
  }

  editarNota(note: QuickNote): void {
    this.editingNoteId = note.id;
    this.noteTitle = note.title;
    this.noteContent = note.content;
    this.notesView = 'editor';
  }

  volverANotas(): void {
    this.resetNoteEditor();
  }

  guardarNota(): void {
    if (!this.noteTitle.trim() && !this.noteContent.trim()) return;
    this.quickNotes = this.noteService.save(
      { title: this.noteTitle, content: this.noteContent },
      this.editingNoteId ?? undefined,
    );
    this.resetNoteEditor();
  }

  eliminarNota(): void {
    if (!this.editingNoteId) return;
    this.quickNotes = this.noteService.delete(this.editingNoteId);
    this.resetNoteEditor();
  }

  async convertirNotaEnTarea(note?: QuickNote): Promise<void> {
    const title = note ? this.noteConversionTitle(note) : this.prepareNoteConversion();
    if (!title) return;
    await this.notesModal?.dismiss();
    this.resetNoteEditor();
    this.nuevaTarea();
    this.nuevoTitulo = title;
  }

  async convertirNotaEnEvento(note?: QuickNote): Promise<void> {
    const title = note ? this.noteConversionTitle(note) : this.prepareNoteConversion();
    if (!title) return;
    await this.notesModal?.dismiss();
    this.resetNoteEditor();
    this.nuevoEvento();
    this.nuevoTitulo = title;
  }

  private prepareNoteConversion(): string {
    const source = this.noteTitle.trim() || this.noteContent.trim();
    if (!source) return '';
    this.quickNotes = this.noteService.save(
      { title: this.noteTitle, content: this.noteContent },
      this.editingNoteId ?? undefined,
    );
    return this.noteConversionTitle({ title: this.noteTitle, content: this.noteContent });
  }

  private noteConversionTitle(note: Pick<QuickNote, 'title' | 'content'>): string {
    const source = note.title.trim() || note.content.trim();
    return source.split(/\r?\n/)[0].trim().slice(0, 120);
  }

  noteDisplayTitle(note: QuickNote): string {
    return note.title || note.content.split(/\r?\n/)[0].trim().slice(0, 70) || 'Nota';
  }

  noteUpdatedLabel(note: QuickNote): string {
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })
      .format(new Date(note.updatedAt));
  }

  get walletSummary() {
    return this.walletService.summary(this.currentTime);
  }

  get walletCategories(): string[] {
    return this.walletService.categories;
  }

  get walletModalTitle(): string {
    if (this.walletView === 'dashboard') return 'Billetera';
    if (this.walletView === 'transaction') return this.walletTransactionKind === 'expense' ? 'Registrar gasto' : 'Registrar ingreso';
    if (this.walletView === 'fixed') return this.editingFixedExpenseId ? 'Editar gasto fijo' : 'Nuevo gasto fijo';
    if (this.walletView === 'payment') return 'Registrar pago';
    if (this.walletView === 'loans') return 'Préstamos';
    if (this.walletView === 'loan-form') return this.editingLoanId ? 'Editar préstamo' : 'Nuevo préstamo';
    if (this.walletView === 'loan-payment') return 'Registrar abono';
    return 'Configuración de sueldo';
  }

  get homeFixedExpenses(): FixedExpenseOccurrence[] {
    const today = this.taskService.toISODate(this.currentTime);
    const tomorrow = this.taskService.toISODate(new Date(
      this.currentTime.getFullYear(),
      this.currentTime.getMonth(),
      this.currentTime.getDate() + 1,
    ));
    return this.walletService.occurrences(this.currentTime, 0, 1)
      .filter((item) => !item.paid && (item.dueDate === today || item.dueDate === tomorrow))
      .filter((item) => !this.isWalletReminderDismissedToday(item));
  }

  get walletPendingExpenses(): FixedExpenseOccurrence[] {
    const today = this.taskService.toISODate(this.currentTime);
    return this.walletService.occurrences(this.currentTime, 2, 2)
      .filter((item) => !item.paid && item.dueDate >= today)
      .slice(0, 12);
  }

  get walletOverdueExpenses(): FixedExpenseOccurrence[] {
    const today = this.taskService.toISODate(this.currentTime);
    return this.walletService.occurrences(this.currentTime, 3, 0)
      .filter((item) => !item.paid && item.dueDate < today)
      .sort((left, right) => right.dueDate.localeCompare(left.dueDate));
  }

  get walletRecentTransactions() {
    return [...this.walletState.transactions]
      .sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt))
      .slice(0, 30);
  }

  loanPaymentHistory(loanId: string) {
    return this.walletState.transactions
      .filter((item) => item.type === 'loan-payment' && item.loanId === loanId)
      .sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt));
  }

  async abrirBilletera(): Promise<void> {
    this.walletState = this.walletService.load();
    this.walletView = 'dashboard';
    this.loansStandalone = false;
    await this.walletModal?.present();
  }

  cerrarBilletera(): void {
    this.walletView = 'dashboard';
    this.loansStandalone = false;
    this.walletModal?.dismiss();
  }

  volverEnBilletera(): void {
    this.walletView = 'dashboard';
    this.loansStandalone = false;
  }

  nuevaTransaccionBilletera(kind: WalletTransactionKind = 'expense'): void {
    this.walletTransactionKind = kind;
    this.walletDescription = '';
    this.walletAmount = null;
    this.walletCategory = kind === 'income' ? 'Otros' : 'Alimentos';
    this.walletDate = this.taskService.toISODate(new Date());
    this.walletExpenseLoanId = null;
    this.walletIncomeLoanId = null;
    this.walletView = 'transaction';
  }

  async nuevoGastoDesdeFab(): Promise<void> {
    this.walletState = this.walletService.load();
    this.nuevaTransaccionBilletera('expense');
    await this.walletModal?.present();
  }

  async nuevoIngresoDesdeFab(): Promise<void> {
    this.walletState = this.walletService.load();
    this.nuevaTransaccionBilletera('income');
    await this.walletModal?.present();
  }

  guardarTransaccionBilletera(): void {
    if (!this.walletDescription.trim() || !this.walletAmount || this.walletAmount <= 0 || !this.walletDate) return;
    if (this.walletTransactionKind === 'expense' && this.walletCategory === 'Préstamo' && this.walletExpenseLoanId) {
      const loan = this.walletState.loans.find((item) => item.id === this.walletExpenseLoanId);
      if (!loan) return;
      this.walletState = this.walletService.payLoan(loan, this.walletAmount, this.walletDate);
      this.walletView = 'dashboard';
      return;
    }
    if (this.walletTransactionKind === 'income' && this.walletCategory === 'Préstamo' && this.walletIncomeLoanId) {
      const loan = this.walletState.loans.find((item) => item.id === this.walletIncomeLoanId);
      if (!loan) return;
      this.walletState = this.walletService.receiveLoanFunds(
        loan,
        this.walletAmount,
        this.walletDate,
        this.walletDescription,
      );
      this.walletView = 'dashboard';
      return;
    }
    this.walletState = this.walletService.addTransaction({
      kind: this.walletTransactionKind,
      description: this.walletDescription,
      amount: this.walletAmount,
      category: this.walletCategory,
      date: this.walletDate,
    });
    this.walletView = 'dashboard';
  }

  nuevoGastoFijo(expense?: FixedExpense): void {
    this.editingFixedExpenseId = expense?.id ?? null;
    this.fixedExpenseName = expense?.name ?? '';
    this.fixedExpenseAmount = expense?.amount ?? null;
    this.fixedExpenseCategory = expense?.category ?? 'Servicios';
    this.fixedExpenseDueDay = expense?.dueDay ?? 1;
    this.fixedExpenseFrequencyMonths = expense?.frequencyMonths ?? 1;
    this.fixedExpenseFirstDueDate = expense?.firstDueDate ?? this.taskService.toISODate(this.currentTime);
    this.fixedExpenseReminderTime = expense?.reminderTime ?? '09:00';
    this.fixedExpenseInsistentReminder = expense?.insistentReminder ?? false;
    this.walletView = 'fixed';
  }

  guardarGastoFijo(): void {
    if (!this.fixedExpenseName.trim() || !this.fixedExpenseAmount || this.fixedExpenseAmount <= 0) return;
    this.walletState = this.walletService.saveFixedExpense({
      name: this.fixedExpenseName,
      amount: this.fixedExpenseAmount,
      category: this.fixedExpenseCategory,
      dueDay: this.fixedExpenseDueDay,
      frequencyMonths: this.fixedExpenseFrequencyMonths,
      firstDueDate: this.fixedExpenseFirstDueDate,
      reminderTime: this.fixedExpenseReminderTime,
      insistentReminder: this.fixedExpenseInsistentReminder,
      active: true,
    }, this.editingFixedExpenseId ?? undefined);
    this.walletView = 'dashboard';
  }

  eliminarGastoFijo(id: string): void {
    this.walletState = this.walletService.deleteFixedExpense(id);
    this.walletView = 'dashboard';
  }

  verPrestamosDesdeBilletera(): void {
    this.walletView = 'loans';
    this.loansStandalone = false;
  }

  nuevoPrestamo(loan?: WalletLoan): void {
    this.editingLoanId = loan?.id ?? null;
    this.loanCreditor = loan?.creditor ?? '';
    this.loanOriginalAmount = loan?.originalAmount ?? null;
    this.loanRemainingAmount = loan?.remainingAmount ?? null;
    this.loanPaymentAmount = loan?.paymentAmount ?? null;
    this.loanPaymentSchedule = loan?.paymentSchedule ?? 'fixed';
    this.loanDueDay = loan?.dueDay ?? 1;
    this.loanDueWeekday = loan?.dueWeekday ?? 1;
    this.loanTentativePaymentDate = loan?.tentativePaymentDate ?? '';
    this.loanNotes = loan?.notes ?? '';
    this.walletView = 'loan-form';
  }

  guardarPrestamo(): void {
    if (!this.loanCreditor.trim() || !this.loanOriginalAmount || !this.loanPaymentAmount) return;
    this.walletState = this.walletService.saveLoan({
      creditor: this.loanCreditor,
      originalAmount: this.loanOriginalAmount,
      remainingAmount: this.loanRemainingAmount ?? this.loanOriginalAmount,
      paymentAmount: this.loanPaymentAmount,
      paymentSchedule: this.loanPaymentSchedule,
      dueDay: this.loanDueDay,
      dueWeekday: this.loanDueWeekday,
      tentativePaymentDate: this.loanTentativePaymentDate,
      notes: this.loanNotes,
      active: true,
    }, this.editingLoanId ?? undefined);
    this.walletView = 'loans';
  }

  eliminarPrestamo(id: string): void {
    this.walletState = this.walletService.deleteLoan(id);
    this.walletView = 'loans';
  }

  abrirPagoPrestamo(loan: WalletLoan): void {
    this.payingLoan = loan;
    this.loanPaymentValue = Math.min(loan.paymentAmount, loan.remainingAmount);
    this.loanPaymentDate = this.taskService.toISODate(this.currentTime);
    this.walletView = 'loan-payment';
  }

  guardarPagoPrestamo(): void {
    if (!this.payingLoan || !this.loanPaymentValue || !this.loanPaymentDate) return;
    this.walletState = this.walletService.payLoan(this.payingLoan, this.loanPaymentValue, this.loanPaymentDate);
    this.walletView = 'loans';
  }

  loanWeekdayLabel(day: number): string {
    return this.loanWeekdays.find((item) => item.value === day)?.label ?? 'Lunes';
  }

  editarSueldo(): void {
    this.walletSalaryAmount = this.walletState.settings.salaryAmount || null;
    this.walletPaySchedule = this.walletState.settings.paySchedule;
    this.walletFirstPayDate = this.walletState.settings.firstPayDate || this.taskService.toISODate(new Date());
    this.walletWeeklyPayDay = this.walletState.settings.weeklyPayDay ?? 1;
    this.walletMoveWeekendPayToFriday = this.walletState.settings.moveWeekendPayToFriday;
    this.walletView = 'settings';
  }

  guardarConfiguracionBilletera(): void {
    this.walletState = this.walletService.saveSettings({
      salaryAmount: Math.max(0, Number(this.walletSalaryAmount) || 0),
      paySchedule: this.walletPaySchedule,
      firstPayDate: this.walletFirstPayDate || this.taskService.toISODate(new Date()),
      weeklyPayDay: this.walletWeeklyPayDay,
      moveWeekendPayToFriday: this.walletMoveWeekendPayToFriday,
      currency: 'MXN',
    });
    this.walletView = 'dashboard';
  }

  pagarGastoFijo(occurrence: FixedExpenseOccurrence): void {
    this.payingFixedOccurrence = occurrence;
    this.fixedPaymentAmount = occurrence.expense.amount;
    this.fixedPaymentDate = this.taskService.toISODate(this.currentTime);
    this.walletView = 'payment';
  }

  startWalletReminderSwipe(event: PointerEvent): void {
    this.walletSwipeStartX = event.clientX;
    this.walletSwipingOccurrenceId = (event.currentTarget as HTMLElement).dataset['occurrenceId'] ?? null;
  }

  moveWalletReminderSwipe(event: PointerEvent): void {
    if (this.walletSwipeStartX === null) return;
    this.walletSwipeOffset = Math.max(0, Math.min(150, event.clientX - this.walletSwipeStartX));
  }

  cancelWalletReminderSwipe(): void {
    this.walletSwipeOffset = 0;
    this.walletSwipeStartX = null;
    this.walletSwipingOccurrenceId = null;
  }

  endWalletReminderSwipe(event: PointerEvent, occurrence: FixedExpenseOccurrence): void {
    if (this.walletSwipeStartX === null) return;
    const distance = event.clientX - this.walletSwipeStartX;
    this.walletSwipeStartX = null;
    this.walletSwipeOffset = 0;
    this.walletSwipingOccurrenceId = null;
    if (distance < 80) return;
    const dismissed = this.loadDismissedWalletReminders();
    dismissed[occurrence.id] = this.taskService.toISODate(this.currentTime);
    localStorage.setItem(this.dismissedWalletReminderKey, JSON.stringify(dismissed));
    this.refreshView();
  }

  private isWalletReminderDismissedToday(occurrence: FixedExpenseOccurrence): boolean {
    return this.loadDismissedWalletReminders()[occurrence.id] === this.taskService.toISODate(this.currentTime);
  }

  private loadDismissedWalletReminders(): Record<string, string> {
    try {
      return JSON.parse(localStorage.getItem(this.dismissedWalletReminderKey) ?? '{}') as Record<string, string>;
    } catch {
      return {};
    }
  }

  guardarPagoGastoFijo(): void {
    if (!this.payingFixedOccurrence || !this.fixedPaymentAmount || this.fixedPaymentAmount <= 0 || !this.fixedPaymentDate) return;
    this.walletState = this.walletService.markFixedPaid(
      this.payingFixedOccurrence,
      this.fixedPaymentDate,
      this.fixedPaymentAmount,
    );
    this.payingFixedOccurrence = null;
    this.walletView = 'dashboard';
  }

  eliminarMovimientoBilletera(id: string): void {
    this.walletState = this.walletService.deleteTransaction(id);
  }

  walletMoney(value: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
  }

  walletDueLabel(occurrence: FixedExpenseOccurrence): string {
    const today = this.taskService.toISODate(this.currentTime);
    const tomorrow = this.taskService.toISODate(new Date(
      this.currentTime.getFullYear(), this.currentTime.getMonth(), this.currentTime.getDate() + 1,
    ));
    if (occurrence.dueDate === today) return 'Vence hoy';
    if (occurrence.dueDate === tomorrow) return 'Vence mañana';
    if (occurrence.dueDate < today) return `Venció ${this.taskService.formatDate(occurrence.dueDate)}`;
    return `Vence ${this.taskService.formatDate(occurrence.dueDate)}`;
  }

  private resetNoteEditor(): void {
    this.notesView = 'list';
    this.editingNoteId = null;
    this.noteTitle = '';
    this.noteContent = '';
  }

  async abrirPanelConfiguracion(): Promise<void> {
    await this.refreshBatteryOptimizationStatus();
    await this.menuController.open('settings-menu');
  }

  async abrirMenuPrincipal(): Promise<void> { await this.menuController.open('main-menu'); }
  async cerrarMenuPrincipal(): Promise<void> { await this.menuController.close('main-menu'); }

  async abrirBuscadorDesdeMenu(): Promise<void> { await this.cerrarMenuPrincipal(); await this.abrirBuscadorGlobal(); }
  async abrirNotasDesdeMenu(): Promise<void> { await this.cerrarMenuPrincipal(); await this.abrirNotas(); }
  async abrirBilleteraDesdeMenu(): Promise<void> { await this.cerrarMenuPrincipal(); await this.abrirBilletera(); }
  async abrirRutinasDesdeMenu(): Promise<void> { await this.cerrarMenuPrincipal(); await this.abrirPreestablecidos(); }
  async abrirEtiquetasDesdeMenu(): Promise<void> { await this.cerrarMenuPrincipal(); await this.abrirConfiguracion(); }
  async abrirTratamientosDesdeMenu(): Promise<void> {
    await this.cerrarMenuPrincipal();
    if (!this.wellnessSettings.enabled) this.setWellnessEnabled(true);
    await this.abrirTratamientos();
  }

  cerrarPanelConfiguracion(): void {
    void this.menuController.close('settings-menu');
  }

  async abrirAlarmasDesdePanel(): Promise<void> {
    await this.menuController.close('settings-menu');
    await this.abrirConfiguracionBateria();
  }

  async abrirCalendariosDesdePanel(): Promise<void> {
    await this.menuController.close('settings-menu');
    await this.abrirCalendariosDispositivo();
  }

  setWellnessEnabled(enabled: boolean): void {
    this.wellnessSettings = this.wellnessService.saveSettings({ enabled });
    if (!enabled) this.cerrarBienestar();
  }

  async abrirBienestar(): Promise<void> {
    if (!this.wellnessSettings.enabled) return;
    this.medicationTreatments = this.wellnessService.loadTreatments();
    this.startNewTreatment();
    await this.wellnessModal?.present();
  }

  async abrirTratamientos(): Promise<void> {
    if (!this.wellnessSettings.enabled) return;
    this.medicationTreatments = this.wellnessService.loadTreatments();
    this.medicationDoses = this.wellnessService.refreshDoses(this.currentTime);
    this.confirmingTreatmentGroupDeleteKey = null;
    this.selectedHistoryGroupKey = null;
    this.medicationHistoryFilter = 'all';
    await this.treatmentsModal?.present();
  }

  cerrarTratamientos(): void {
    this.expandedTreatmentGroupKey = null;
    this.confirmingTreatmentGroupDeleteKey = null;
    this.selectedHistoryGroupKey = null;
    this.medicationHistoryFilter = 'all';
    this.treatmentsModal?.dismiss();
  }

  async agregarTratamientoDesdeAdministrador(): Promise<void> {
    await this.treatmentsModal?.dismiss();
    this.startNewTreatment();
    this.returnToTreatmentManager = true;
    await this.wellnessModal?.present();
  }

  async nuevoMedicamentoDesdeFab(): Promise<void> {
    if (!this.wellnessSettings.enabled) return;
    this.medicationTreatments = this.wellnessService.loadTreatments();
    this.startNewTreatment();
    await this.wellnessModal?.present();
  }

  cerrarBienestar(): void {
    this.resetWellnessFlow();
    this.wellnessModal?.dismiss();
  }

  nuevoTratamiento(): void {
    this.startNewTreatment();
  }

  private startNewTreatment(): void {
    this.returnToTreatmentManager = false;
    this.resetMedicationForm();
    this.treatmentName = '';
    this.treatmentStartDate = this.taskService.toISODate(new Date());
    this.treatmentMedicationDrafts = [];
    this.wellnessView = 'treatment';
  }

  agregarMedicamentoAlTratamiento(): void {
    this.resetMedicationForm();
    this.editingDraftKey = null;
    this.wellnessView = 'medication';
  }

  editarMedicamentoDelTratamiento(draft: TreatmentMedicationDraft): void {
    this.editingDraftKey = draft.key;
    this.editingMedicationId = null;
    this.medicationName = draft.name;
    this.medicationDose = draft.dose;
    this.medicationInstructions = draft.instructions;
    this.medicationFrequencyHours = draft.frequencyHours;
    this.medicationDurationDays = draft.durationDays;
    this.medicationFirstTime = draft.firstTime;
    this.medicationColor = draft.color;
    this.medicationStrictTracking = draft.strictTracking;
    this.medicationStockEnabled = draft.stockEnabled;
    this.medicationStockQuantity = draft.stockQuantity;
    this.medicationDoseUnits = draft.doseUnits;
    this.medicationStockUnit = draft.stockUnit;
    this.medicationLowStockThreshold = draft.lowStockThreshold;
    this.wellnessView = 'medication';
  }

  volverDesdeBienestar(): void {
    if (this.wellnessView === 'medication' && !this.editingMedicationId) {
      this.resetMedicationForm();
      this.wellnessView = 'treatment';
      return;
    }
    if (this.wellnessView === 'medication') {
      if (this.returnToTreatmentManager) {
        this.volverAlAdministradorDeTratamientos();
        return;
      }
      this.resetMedicationForm();
      this.wellnessView = 'treatment';
      return;
    }
    if (this.wellnessView === 'treatment') {
      if (this.returnToTreatmentManager) {
        this.volverAlAdministradorDeTratamientos();
        return;
      }
      this.cerrarBienestar();
    }
  }

  editarTratamiento(treatment: MedicationTreatment): void {
    this.editingMedicationId = treatment.id;
    this.treatmentName = treatment.treatmentName ?? '';
    this.medicationName = treatment.name;
    this.medicationDose = treatment.dose;
    this.medicationInstructions = treatment.instructions ?? '';
    this.medicationStartDate = treatment.startDate;
    this.medicationEndDate = treatment.endDate ?? '';
    this.medicationContinuous = treatment.continuous;
    this.medicationDays = [...treatment.schedule.days];
    this.medicationTimes = [...treatment.schedule.times];
    this.medicationColor = treatment.color;
    this.medicationStrictTracking = treatment.strictTracking;
    this.medicationStockEnabled = treatment.stockEnabled;
    this.medicationStockQuantity = treatment.stockQuantity;
    this.medicationDoseUnits = treatment.doseUnits;
    this.medicationStockUnit = treatment.stockUnit;
    this.medicationLowStockThreshold = treatment.lowStockThreshold;
    this.medicationFrequencyHours = this.inferMedicationFrequency(treatment.schedule.times);
    this.medicationDurationDays = treatment.continuous
      ? null
      : this.daysBetween(treatment.startDate, treatment.endDate ?? treatment.startDate) + 1;
    this.medicationFirstTime = treatment.schedule.times[0] ?? '08:00';
    this.confirmingMedicationDeletion = false;
    this.wellnessView = 'medication';
  }

  async editarMedicamentoGuardado(treatment: MedicationTreatment): Promise<void> {
    this.returnToTreatmentManager = true;
    await this.treatmentsModal?.dismiss();
    this.editarTratamiento(treatment);
    await this.wellnessModal?.present();
  }

  get calculatedMedicationTimes(): string[] {
    const [hours, minutes] = this.medicationFirstTime.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || this.medicationFrequencyHours <= 0) return [];
    const firstMinutes = hours * 60 + minutes;
    const times: string[] = [];
    for (let offset = 0; offset < 24 * 60; offset += this.medicationFrequencyHours * 60) {
      const value = (firstMinutes + offset) % (24 * 60);
      const time = `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
      if (!times.includes(time)) times.push(time);
    }
    return times;
  }

  get calculatedDoseCount(): number | null {
    return this.medicationDurationDays === null
      ? null
      : this.calculatedMedicationTimes.length * this.medicationDurationDays;
  }

  get medicationFormValid(): boolean {
    const stockQuantity = Number(this.medicationStockQuantity);
    const doseUnits = Number(this.medicationDoseUnits);
    const lowStockThreshold = Number(this.medicationLowStockThreshold);

    return !!this.medicationName.trim() &&
      !!this.medicationDose.trim() &&
      this.medicationFrequencyHours > 0 &&
      (this.medicationDurationDays === null || this.medicationDurationDays > 0) &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(this.medicationFirstTime) &&
      this.calculatedMedicationTimes.length > 0 &&
      (!this.medicationStockEnabled || (
        Number.isFinite(stockQuantity) && stockQuantity >= 0 &&
        Number.isFinite(doseUnits) && doseUnits > 0 &&
        Number.isFinite(lowStockThreshold) && lowStockThreshold >= 0 &&
        !!this.medicationStockUnit
      ));
  }

  guardarMedicamento(): void {
    if (!this.medicationFormValid) return;
    if (this.editingMedicationId) {
      const reopenManager = this.returnToTreatmentManager;
      const startDate = this.medicationStartDate || this.taskService.toISODate(new Date());
      this.medicationTreatments = this.wellnessService.saveTreatment(
        this.buildTreatmentDraft(startDate),
        this.editingMedicationId,
      );
      this.medicationDoses = this.wellnessService.getDoses();
      this.buildCalendar();
      this.syncNotifications();
      if (reopenManager) {
        this.volverAlAdministradorDeTratamientos();
        return;
      }
      this.resetMedicationForm();
      this.wellnessView = 'treatment';
      return;
    }

    const draft: TreatmentMedicationDraft = {
      key: this.editingDraftKey ?? this.createMedicationDraftKey(),
      name: this.medicationName.trim(),
      dose: this.medicationDose.trim(),
      instructions: this.medicationInstructions.trim(),
      frequencyHours: this.medicationFrequencyHours,
      durationDays: this.medicationDurationDays,
      firstTime: this.medicationFirstTime,
      color: this.medicationColor,
      strictTracking: this.medicationStrictTracking,
      insistentReminder: this.medicationInsistentReminder,
      stockEnabled: this.medicationStockEnabled,
      stockQuantity: Number(this.medicationStockQuantity),
      doseUnits: Number(this.medicationDoseUnits),
      stockUnit: this.medicationStockUnit,
      lowStockThreshold: Number(this.medicationLowStockThreshold),
    };
    this.treatmentMedicationDrafts = this.editingDraftKey
      ? this.treatmentMedicationDrafts.map((item) => item.key === this.editingDraftKey ? draft : item)
      : [...this.treatmentMedicationDrafts, draft];
    this.resetMedicationForm();
    this.wellnessView = 'treatment';
  }

  guardarNuevoTratamiento(): void {
    if (!this.treatmentName.trim() || !this.treatmentStartDate || this.treatmentMedicationDrafts.length === 0) return;
    for (const medication of this.treatmentMedicationDrafts) {
      this.medicationName = medication.name;
      this.medicationDose = medication.dose;
      this.medicationInstructions = medication.instructions;
      this.medicationFrequencyHours = medication.frequencyHours;
      this.medicationDurationDays = medication.durationDays;
      this.medicationFirstTime = medication.firstTime;
      this.medicationColor = medication.color;
      this.medicationStrictTracking = medication.strictTracking;
      this.medicationStockEnabled = medication.stockEnabled;
      this.medicationStockQuantity = medication.stockQuantity;
      this.medicationDoseUnits = medication.doseUnits;
      this.medicationStockUnit = medication.stockUnit;
      this.medicationLowStockThreshold = medication.lowStockThreshold;
      this.medicationTreatments = this.wellnessService.saveTreatment(
        this.buildTreatmentDraft(this.treatmentStartDate),
      );
    }
    this.medicationDoses = this.wellnessService.getDoses();
    this.buildCalendar();
    this.syncNotifications(true);
    if (this.returnToTreatmentManager) {
      this.volverAlAdministradorDeTratamientos();
      return;
    }
    this.cerrarBienestar();
  }

  medicationDraftSummary(draft: TreatmentMedicationDraft): string {
    const duration = draft.durationDays === null ? 'Indefinido' : `${draft.durationDays} días`;
    return `${draft.dose} · ${this.medicationFrequencyLabel(draft.frequencyHours)} · ${duration}`;
  }

  medicationFrequencyLabel(hours: number): string {
    return hours === 24 ? 'Una vez al día' : `Cada ${hours} horas`;
  }

  get treatmentGroups(): TreatmentGroup[] {
    const groups = new Map<string, MedicationTreatment[]>();
    for (const treatment of this.medicationTreatments) {
      const reference = treatment.treatmentName?.trim();
      const key = reference ? `name:${reference.toLocaleLowerCase('es-MX')}` : `legacy:${treatment.id}`;
      groups.set(key, [...(groups.get(key) ?? []), treatment]);
    }
    return [...groups.entries()]
      .map(([key, treatments]) => ({
        key,
        name: treatments[0].treatmentName?.trim() || treatments[0].name,
        treatments,
        status: treatments.some((item) => item.status === 'active')
          ? 'active' as const
          : treatments.some((item) => item.status === 'paused') ? 'paused' as const : 'finished' as const,
        startDate: [...treatments].sort((a, b) => a.startDate.localeCompare(b.startDate))[0].startDate,
      }))
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  get selectedHistoryGroup(): TreatmentGroup | undefined {
    return this.treatmentGroups.find((group) => group.key === this.selectedHistoryGroupKey);
  }

  get medicationHistoryEntries(): MedicationHistoryEntry[] {
    const group = this.selectedHistoryGroup;
    if (!group) return [];
    const ids = new Set(group.treatments.map((item) => item.id));
    const today = this.taskService.toISODate(this.currentTime);
    const cutoff = this.addCalendarDays(today, -30);
    return this.medicationDoses
      .filter((dose) => {
        const date = dose.scheduledAt.slice(0, 10);
        return ids.has(dose.treatmentId) && date >= cutoff && date <= today;
      })
      .map((dose) => ({
        dose,
        treatment: group.treatments.find((item) => item.id === dose.treatmentId)!,
        status: this.medicationHistoryStatus(dose),
      }))
      .filter((entry) => {
        if (this.medicationHistoryFilter === 'all') return true;
        if (this.medicationHistoryFilter === 'taken') {
          return entry.status === 'taken' || entry.status === 'late';
        }
        return entry.status === this.medicationHistoryFilter;
      })
      .sort((a, b) => b.dose.scheduledAt.localeCompare(a.dose.scheduledAt));
  }

  abrirHistorialTratamiento(group: TreatmentGroup, filter: MedicationHistoryFilter = 'all'): void {
    this.selectedHistoryGroupKey = group.key;
    this.medicationHistoryFilter = filter;
  }

  cerrarHistorialTratamiento(): void {
    this.selectedHistoryGroupKey = null;
    this.medicationHistoryFilter = 'all';
  }

  medicationHistoryStatus(dose: MedicationDose): MedicationHistoryStatus {
    if (dose.status === 'taken') {
      const scheduledAt = new Date(dose.scheduledAt).getTime();
      const recordedAt = dose.recordedAt ? new Date(dose.recordedAt).getTime() : scheduledAt;
      return recordedAt > scheduledAt + 60_000 ? 'late' : 'taken';
    }
    if (dose.status === 'missed' || dose.status === 'skipped') return 'missed';
    const date = dose.scheduledAt.slice(0, 10);
    const today = this.taskService.toISODate(this.currentTime);
    if (date < today) return 'missed';
    return this.isMedicationDoseOverdue(dose) ? 'overdue' : 'pending';
  }

  medicationHistoryStatusLabel(status: MedicationHistoryStatus): string {
    if (status === 'taken') return 'Sí';
    if (status === 'late') return 'Tarde';
    if (status === 'missed') return 'No';
    if (status === 'overdue') return 'Atrasada';
    return 'Pendiente';
  }

  formatMedicationHistoryDate(scheduledAt: string): string {
    return new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
      .format(new Date(`${scheduledAt.slice(0, 10)}T12:00:00`));
  }

  medicationHistoryRecordedTime(entry: MedicationHistoryEntry): string {
    if (!entry.dose.recordedAt || (entry.status !== 'taken' && entry.status !== 'late')) return '';
    return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' })
      .format(new Date(entry.dose.recordedAt));
  }

  toggleTreatmentGroup(group: TreatmentGroup): void {
    this.expandedTreatmentGroupKey = this.expandedTreatmentGroupKey === group.key ? null : group.key;
    this.confirmingTreatmentGroupDeleteKey = null;
  }

  treatmentStatusLabel(status: MedicationTreatment['status']): string {
    if (status === 'paused') return 'Pausado';
    if (status === 'finished') return 'Finalizado';
    return 'Activo';
  }

  treatmentDurationLabel(treatment: MedicationTreatment): string {
    if (treatment.continuous) return 'Indefinido';
    return `${this.daysBetween(treatment.startDate, treatment.endDate ?? treatment.startDate) + 1} días`;
  }

  treatmentFrequencyLabel(treatment: MedicationTreatment): string {
    return this.medicationFrequencyLabel(this.inferMedicationFrequency(treatment.schedule.times));
  }

  medicationStockLabel(treatment: MedicationTreatment): string {
    if (!treatment.stockEnabled) return '';
    const days = this.medicationStockDays(treatment);
    return `${this.formatStockAmount(treatment.stockQuantity)} ${treatment.stockUnit} · aprox. ${days} ${days === 1 ? 'día' : 'días'}`;
  }

  medicationStockDays(treatment: MedicationTreatment): number {
    const dailyUse = Math.max(1, treatment.schedule.times.length) * treatment.doseUnits;
    return Math.floor(treatment.stockQuantity / dailyUse);
  }

  isMedicationLowStock(treatment: MedicationTreatment): boolean {
    return treatment.stockEnabled && treatment.stockQuantity <= treatment.lowStockThreshold;
  }

  iniciarReposicion(treatment: MedicationTreatment): void {
    this.restockingMedicationId = treatment.id;
    this.restockAmount = 0;
  }

  cancelarReposicion(): void {
    this.restockingMedicationId = null;
    this.restockAmount = 0;
  }

  confirmarReposicion(treatment: MedicationTreatment): void {
    const quantity = Number(this.restockAmount);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    this.medicationTreatments = this.wellnessService.addStock(treatment.id, quantity);
    const updated = this.medicationTreatments.find((item) => item.id === treatment.id);
    if (updated) void this.notificationScheduler.syncLowStockNotification(updated);
    this.cancelarReposicion();
  }

  private formatStockAmount(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  treatmentTodayStats(group: TreatmentGroup): { taken: number; pending: number; overdue: number } {
    const ids = new Set(group.treatments.map((item) => item.id));
    const today = this.taskService.toISODate(this.currentTime);
    return this.medicationDoses
      .filter((dose) => ids.has(dose.treatmentId) && dose.scheduledAt.startsWith(today))
      .reduce((stats, dose) => {
        if (dose.status === 'taken') stats.taken += 1;
        else if (this.isMedicationDoseOverdue(dose)) stats.overdue += 1;
        else stats.pending += 1;
        return stats;
      }, { taken: 0, pending: 0, overdue: 0 });
  }

  cambiarEstadoTratamiento(group: TreatmentGroup, status: MedicationTreatment['status']): void {
    this.medicationTreatments = this.wellnessService.setTreatmentsStatus(
      group.treatments.map((item) => item.id),
      status,
    );
    this.medicationDoses = this.wellnessService.getDoses();
    this.buildCalendar();
    this.syncNotifications();
  }

  eliminarGrupoTratamiento(group: TreatmentGroup): void {
    this.medicationTreatments = this.wellnessService.deleteTreatments(
      group.treatments.map((item) => item.id),
    );
    this.medicationDoses = this.wellnessService.getDoses();
    this.expandedTreatmentGroupKey = null;
    this.confirmingTreatmentGroupDeleteKey = null;
    this.buildCalendar();
    this.syncNotifications();
  }

  formatTreatmentDate(date: string): string {
    if (!date) return 'Seleccionar fecha';
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(`${date}T12:00:00`));
  }

  eliminarTratamiento(): void {
    if (!this.editingMedicationId) return;
    this.medicationTreatments = this.wellnessService.deleteTreatment(this.editingMedicationId);
    this.medicationDoses = this.wellnessService.getDoses();
    this.buildCalendar();
    this.syncNotifications();
    this.resetMedicationForm();
    this.wellnessView = 'treatment';
  }

  medicationScheduleText(treatment: MedicationTreatment): string {
    const days = treatment.schedule.days.length === 7
      ? 'Todos los días'
      : treatment.schedule.days.map((day) => this.diasSemana[day]).join(', ');
    return `${days} · ${treatment.schedule.times.join(', ')}`;
  }

  get todayMedicationDoses(): MedicationDose[] {
    const today = this.taskService.toISODate(this.currentTime);
    return this.medicationDoses
      .filter((dose) => dose.scheduledAt.startsWith(today))
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }

  get todayMedicationOverdueDoses(): MedicationDose[] {
    return this.todayMedicationDoses.filter((dose) => this.isMedicationDoseOverdue(dose));
  }

  get todayMedicationPendingDoses(): MedicationDose[] {
    return this.todayMedicationDoses.filter((dose) =>
      (dose.status === 'pending' || dose.status === 'postponed') && !this.isMedicationDoseOverdue(dose));
  }

  get todayMedicationTakenDoses(): MedicationDose[] {
    return this.todayMedicationDoses.filter((dose) => dose.status === 'taken');
  }

  get todayMedicationActionableDoses(): MedicationDose[] {
    return [...this.todayMedicationOverdueDoses, ...this.todayMedicationPendingDoses];
  }

  get visibleTodayMedicationOverdueDoses(): MedicationDose[] {
    return this.medicationHomeExpanded
      ? this.todayMedicationOverdueDoses
      : this.todayMedicationOverdueDoses.slice(0, 1);
  }

  get visibleTodayMedicationPendingDoses(): MedicationDose[] {
    if (this.medicationHomeExpanded) return this.todayMedicationPendingDoses;
    return this.todayMedicationOverdueDoses.length === 0
      ? this.todayMedicationPendingDoses.slice(0, 1)
      : [];
  }

  get hiddenTodayMedicationDoseCount(): number {
    return Math.max(0, this.todayMedicationActionableDoses.length - 1);
  }

  toggleMedicationHomeExpanded(): void {
    this.medicationHomeExpanded = !this.medicationHomeExpanded;
  }

  get todayMedicationProgress(): number {
    if (this.todayMedicationDoses.length === 0) return 0;
    return Math.round((this.todayMedicationTakenDoses.length / this.todayMedicationDoses.length) * 100);
  }

  medicationForDose(dose: MedicationDose): MedicationTreatment | undefined {
    return this.medicationTreatments.find((item) => item.id === dose.treatmentId);
  }

  medicationDoseTime(dose: MedicationDose): string {
    return dose.scheduledAt.slice(11, 16);
  }

  medicationDoseRecordedTime(dose: MedicationDose): string {
    if (!dose.recordedAt) return '';
    return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' })
      .format(new Date(dose.recordedAt));
  }

  isMedicationDoseOverdue(dose: MedicationDose): boolean {
    if (dose.status !== 'pending') return false;
    const scheduledAt = new Date(dose.scheduledAt).getTime();
    return !Number.isNaN(scheduledAt) && scheduledAt < this.currentTime.getTime();
  }

  toggleMedicationDose(dose: MedicationDose): void {
    this.medicationDoses = this.wellnessService.setDoseStatus(
      dose.id,
      dose.status === 'taken' ? 'pending' : 'taken',
    );
    this.medicationTreatments = this.wellnessService.getTreatments();
    this.syncNotifications();
  }

  resetMedicationForm(): void {
    this.editingMedicationId = null;
    this.editingDraftKey = null;
    this.medicationName = '';
    this.medicationDose = '';
    this.medicationInstructions = '';
    this.medicationStartDate = this.treatmentStartDate || this.taskService.toISODate(new Date());
    this.medicationEndDate = '';
    this.medicationContinuous = false;
    this.medicationDays = [0, 1, 2, 3, 4, 5, 6];
    this.medicationTimes = ['08:00'];
    this.medicationColor = '#22c55e';
    this.medicationStrictTracking = false;
    this.medicationInsistentReminder = false;
    this.medicationStockEnabled = false;
    this.medicationStockQuantity = 30;
    this.medicationDoseUnits = 1;
    this.medicationStockUnit = 'tabletas';
    this.medicationLowStockThreshold = 5;
    this.medicationFrequencyHours = 8;
    this.medicationDurationDays = 4;
    this.medicationFirstTime = '08:00';
    this.confirmingMedicationDeletion = false;
  }

  private resetWellnessFlow(): void {
    this.wellnessView = 'treatment';
    this.treatmentName = '';
    this.treatmentStartDate = '';
    this.treatmentMedicationDrafts = [];
    this.resetMedicationForm();
  }

  private volverAlAdministradorDeTratamientos(): void {
    this.returnToTreatmentManager = false;
    this.resetWellnessFlow();
    void this.wellnessModal?.dismiss().then(() => this.abrirTratamientos());
  }

  private buildTreatmentDraft(startDate: string) {
    const continuous = this.medicationDurationDays === null;
    return {
      treatmentName: this.treatmentName,
      name: this.medicationName,
      dose: this.medicationDose,
      instructions: this.medicationInstructions,
      startDate,
      endDate: continuous ? undefined : this.addCalendarDays(startDate, (this.medicationDurationDays ?? 1) - 1),
      continuous,
      days: [0, 1, 2, 3, 4, 5, 6],
      times: this.calculatedMedicationTimes,
      color: this.medicationColor,
      strictTracking: this.medicationStrictTracking,
      insistentReminder: this.medicationInsistentReminder,
      stockEnabled: this.medicationStockEnabled,
      stockQuantity: this.medicationStockQuantity,
      doseUnits: this.medicationDoseUnits,
      stockUnit: this.medicationStockUnit,
      lowStockThreshold: this.medicationLowStockThreshold,
    };
  }

  private inferMedicationFrequency(times: string[]): number {
    if (times.length < 2) return 24;
    const minutes = times
      .map((time) => {
        const [hours, mins] = time.split(':').map(Number);
        return hours * 60 + mins;
      })
      .sort((a, b) => a - b);
    const gaps = minutes.map((value, index) => {
      const next = minutes[(index + 1) % minutes.length] + (index === minutes.length - 1 ? 24 * 60 : 0);
      return next - value;
    });
    const frequency = Math.round(Math.min(...gaps) / 60);
    return this.medicationFrequencyOptions.includes(frequency) ? frequency : 24;
  }

  private daysBetween(start: string, end: string): number {
    const startDate = new Date(`${start}T12:00:00`).getTime();
    const endDate = new Date(`${end}T12:00:00`).getTime();
    return Math.max(0, Math.round((endDate - startDate) / 86_400_000));
  }

  private nextBirthdayDate(date: string): string {
    const [, month, day] = date.split('-').map(Number);
    const today = this.currentTime;
    let candidate = new Date(today.getFullYear(), month - 1, day);
    if (candidate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
      candidate = new Date(today.getFullYear() + 1, month - 1, day);
    }
    return this.taskService.toISODate(candidate);
  }

  private addCalendarDays(date: string, days: number): string {
    const value = new Date(`${date}T12:00:00`);
    value.setDate(value.getDate() + days);
    return this.taskService.toISODate(value);
  }

  private createMedicationDraftKey(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `medication-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private createSubtaskId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `subtask-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private async requestInitialAndroidPermissions(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return;

    if (localStorage.getItem(this.initialPermissionKey) !== 'done') {
      localStorage.setItem(this.initialPermissionKey, 'done');
      try {
        const notificationsGranted = await this.notificationScheduler.requestNotificationPermission();
        if (notificationsGranted) this.syncNotifications();
      } catch (error) {
        console.warn('No fue posible solicitar el permiso de notificaciones.', error);
      }
    }

    if (localStorage.getItem(this.initialCalendarPermissionKey) === 'done') return;
    // Se marca antes de abrir el diálogo para evitar solicitudes duplicadas durante este inicio.
    localStorage.setItem(this.initialCalendarPermissionKey, 'done');
    const granted = await this.deviceCalendarService.requestInitialPermissions();
    if (!granted) {
      this.deviceCalendarStatus = 'denied';
      this.refreshView();
      return;
    }

    this.deviceCalendarSettings = { ...this.deviceCalendarSettings, enabled: true };
    await this.loadDeviceCalendars(false);
    if (this.deviceCalendarStatus !== 'ready') return;
    if (!this.deviceCalendarSettings.selectionConfigured) {
      this.deviceCalendarSettings = {
        ...this.deviceCalendarSettings,
        selectedCalendarIds: this.deviceCalendars.map((calendar) => calendar.id),
        selectionConfigured: true,
      };
    }
    if (!this.deviceCalendarSettings.destinationCalendarId) {
      this.deviceCalendarSettings = {
        ...this.deviceCalendarSettings,
        destinationCalendarId: this.writableDeviceCalendars[0]?.id,
      };
    }
    this.deviceCalendarService.saveSettings(this.deviceCalendarSettings);
    await this.refreshDeviceCalendarEvents();
    void this.deviceCalendarService.observeChanges(() => {
      if (this.calendarRefreshTimer) clearTimeout(this.calendarRefreshTimer);
      this.calendarRefreshTimer = setTimeout(() => this.refreshDeviceCalendarEvents(), 500);
    }).then((listener) => {
      this.calendarChangeListener = listener;
    });
  }

  async abrirConfiguracionBateria(): Promise<void> {
    await this.refreshBatteryOptimizationStatus();
    await this.batteryModal?.present();
  }

  cerrarConfiguracionBateria(): void {
    this.batteryModal?.dismiss();
  }

  async solicitarExclusionBateria(): Promise<void> {
    await this.notificationScheduler.requestBatteryOptimizationExemption();
  }

  async abrirAjustesAplicacion(): Promise<void> {
    await this.notificationScheduler.openAppSettings();
  }

  async abrirAjustesBateriaFabricante(): Promise<void> {
    await this.notificationScheduler.openManufacturerBatterySettings();
  }

  get batteryManufacturerTitle(): string {
    const titles: Record<string, string> = {
      xos: 'XOS puede limitar Agenda',
      xiaomi: 'HyperOS o MIUI puede limitar Agenda',
      samsung: 'Samsung puede limitar Agenda',
      huawei: 'Huawei puede limitar Agenda',
      oppo: 'ColorOS puede limitar Agenda',
      vivo: 'Vivo puede limitar Agenda',
    };
    return titles[this.batteryDeviceInfo.family] || 'Revisa la actividad en segundo plano';
  }

  get batteryManufacturerInstructions(): string {
    const instructions: Record<string, string> = {
      xos: 'Permite actividad en segundo plano, inicio automático y ejecución sin restricciones.',
      xiaomi: 'Activa el inicio automático y selecciona Sin restricciones en Ahorro de batería.',
      samsung: 'Quita Agenda de Aplicaciones en suspensión y permite actividad en segundo plano.',
      huawei: 'En Inicio de aplicaciones, administra Agenda manualmente y permite las tres opciones.',
      oppo: 'Activa inicio automático, actividad en segundo plano y Sin restricciones.',
      vivo: 'Permite el inicio automático y el consumo de batería en segundo plano.',
    };
    return instructions[this.batteryDeviceInfo.family]
      || 'Busca Agenda y permite su actividad en segundo plano sin restricciones.';
  }

  private async refreshBatteryOptimizationStatus(): Promise<void> {
    this.batteryOptimizationStatus = 'checking';
    try {
      const [status, deviceInfo] = await Promise.all([
        this.notificationScheduler.checkBatteryOptimization(),
        this.notificationScheduler.getBatteryDeviceInfo(),
      ]);
      this.batteryDeviceInfo = deviceInfo;
      this.batteryOptimizationStatus = !status.supported
        ? 'unavailable'
        : status.ignoring ? 'protected' : 'restricted';
    } catch {
      this.batteryOptimizationStatus = 'unavailable';
    }
    this.refreshView();
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
    if (!this.deviceCalendarSettings.destinationCalendarId) {
      this.deviceCalendarSettings = {
        ...this.deviceCalendarSettings,
        destinationCalendarId: this.writableDeviceCalendars[0]?.id,
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
      destinationCalendarId: !selected && this.deviceCalendarSettings.destinationCalendarId === calendarId
        ? undefined
        : this.deviceCalendarSettings.destinationCalendarId,
    };
    this.deviceCalendarService.saveSettings(this.deviceCalendarSettings);
    await this.refreshDeviceCalendarEvents();
  }

  setDestinationCalendar(calendarId: string | null | undefined): void {
    const selectedCalendarIds = new Set(this.deviceCalendarSettings.selectedCalendarIds);
    if (calendarId) selectedCalendarIds.add(calendarId);
    this.deviceCalendarSettings = {
      ...this.deviceCalendarSettings,
      destinationCalendarId: calendarId || undefined,
      selectedCalendarIds: [...selectedCalendarIds],
    };
    this.deviceCalendarService.saveSettings(this.deviceCalendarSettings);
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
      const destination = this.deviceCalendarSettings.destinationCalendarId;
      if (destination && !this.deviceCalendars.some((calendar) => calendar.id === destination && calendar.writable)) {
        this.setDestinationCalendar(undefined);
      }
    } catch {
      this.deviceCalendarStatus = 'error';
      this.deviceCalendars = [];
    }
    this.refreshView();
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
    this.refreshView();
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

  setLabelInsistentEnabled(label: TaskLabel, insistentEnabled: boolean): void {
    this.updateLabelReminderSettings(label, { insistentEnabled });
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

  setInsistentNotificationsEnabled(enabled: boolean): void {
    this.insistentNotificationsEnabled = enabled;
    this.notificationScheduler.saveInsistentNotificationsEnabled(enabled);
    this.syncNotifications(enabled);
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
      .sync(
        this.tareas,
        this.labelReminderSettings,
        requestPermission,
        this.medicationDoses,
        this.medicationTreatments,
        this.walletService.occurrences(this.currentTime, 0, 2),
        this.insistentNotificationsEnabled,
      )
      .then((result) => {
        this.notificationSyncStatus = result.status;
        if (result.status === 'scheduled') {
          for (const treatment of this.medicationTreatments) {
            void this.notificationScheduler.syncLowStockNotification(treatment);
          }
        }
      })
      .catch(() => {
        this.notificationSyncStatus = 'error';
      });
  }

  private async handleNotificationAction(action: ActionPerformed): Promise<void> {
    const taskId = Number(action.notification.extra?.taskId);
    if (!Number.isInteger(taskId)) return;
    const task = this.taskService.findById(taskId);
    if (!task || task.tipo !== 'tarea') return;

    if (!['complete', 'snooze', 'discard'].includes(action.actionId)) return;

    if (action.actionId === 'snooze') {
      this.prepararReagenda(task);
      return;
    }

    this.setTasks(
      action.actionId === 'complete'
        ? this.taskService.complete(taskId)
        : this.taskService.discard(taskId),
    );
    await this.notificationScheduler.clearTaskNotifications(taskId);
  }

  private addMinutesToTime(time: string, minutes: number): string {
    const [hour, minute] = time.split(':').map(Number);
    const total = (hour * 60 + minute + minutes) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  tasksForHour(hour: string): Task[] {
    return this.selectedDateTasks.filter(
      (tarea) => tarea.hora?.startsWith(hour.slice(0, 2)),
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
        (tarea) => tarea.hora?.startsWith(hour.slice(0, 2)),
      );
  }

  private layoutsForDate(date: string): Map<number, TimedEventLayout> {
    const timed = this.taskService
      .getTasksForDate(date, this.calendarTasks)
      .filter((tarea) => !!tarea.hora)
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
    this.refreshView();
  }

  private refreshExpiredTasks(): void {
    const previousStates = new Map(this.tareas.map((task) => [task.id, task.estado]));
    const refreshed = this.taskService.refreshExpired(this.currentTime);
    const changed = refreshed.some((task) => previousStates.get(task.id) !== task.estado);

    if (changed) this.setTasks(refreshed);
  }

  private loadFabPosition(): void {
    try {
      const stored = JSON.parse(localStorage.getItem(this.fabPositionKey) ?? 'null') as {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        side?: 'top' | 'bottom';
      } | null;
      if (!stored || !Number.isFinite(stored.x) || !Number.isFinite(stored.y)) return;

      const widthScale = stored.width ? window.innerWidth / stored.width : 1;
      const heightScale = stored.height ? window.innerHeight / stored.height : 1;
      this.fabOffsetX = stored.x! * widthScale;
      this.fabOffsetY = stored.y! * heightScale;
      this.fabListSide = stored.side === 'bottom' ? 'bottom' : 'top';
    } catch {
      localStorage.removeItem(this.fabPositionKey);
    }
  }

  private saveFabPosition(): void {
    localStorage.setItem(this.fabPositionKey, JSON.stringify({
      x: this.fabOffsetX,
      y: this.fabOffsetY,
      width: window.innerWidth,
      height: window.innerHeight,
      side: this.fabListSide,
    }));
  }

  private resetForm(fecha = ''): void {
    this.nuevoTitulo = '';
    this.nuevaFecha = fecha;
    this.nuevaHora = '';
    this.nuevaHoraFin = '';
    this.taskScheduleEnabled = false;
    this.taskSubtasks = [];
    this.newSubtaskTitle = '';
    this.eventColor = '#2563eb';
    this.prioridad = 'media';
    this.etiqueta = undefined;
    this.taskInsistentReminder = false;
    this.taskReminderEnabled = false;
    this.taskReminderDate = '';
    this.taskReminderTime = '09:00';
    this.eventReminderMinutes = null;
    this.actividadMadreId = undefined;
    this.favorita = false;
    this.repeticion = 'none';
  }

  private fillForm(tarea: Task): void {
    this.nuevoTitulo = tarea.titulo;
    this.nuevaFecha = tarea.fecha ?? '';
    this.nuevaHora = tarea.hora ?? '';
    this.nuevaHoraFin = this.taskEndTime(tarea);
    this.taskScheduleEnabled = tarea.tipo === 'tarea' && !!tarea.fecha;
    this.taskSubtasks = tarea.subtasks?.map((subtask) => ({ ...subtask })) ?? [];
    this.newSubtaskTitle = '';
    this.eventColor = tarea.color ?? '#2563eb';
    this.prioridad = tarea.prioridad;
    this.etiqueta = tarea.etiqueta;
    this.taskInsistentReminder = tarea.insistentReminder === true;
    this.taskReminderDate = tarea.reminderDate ?? '';
    this.taskReminderTime = tarea.reminderTime ?? '09:00';
    this.taskReminderEnabled = !!this.taskReminderDate && !!tarea.reminderTime;
    this.eventReminderMinutes = tarea.eventReminderMinutes ?? null;
    this.actividadMadreId = tarea.parentId;
    this.favorita = tarea.favorita ?? false;
    this.repeticion = tarea.repeticion ?? 'none';
    this.syncEventToDeviceCalendar = false;
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
