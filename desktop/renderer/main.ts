import './styles.css';

type ViewName = 'inicio' | 'agenda' | 'tareas' | 'rutinas' | 'notas' | 'billetera' | 'bienestar';
type CalendarMode = 'dia' | 'semana' | 'mes';

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  locale: string;
  timezone: string;
}

interface AgendaItem {
  id: string;
  id_cliente: string;
  titulo: string;
  tipo: 'tarea' | 'evento';
  fecha_programada: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  duracion_minutos: number | null;
  color: string | null;
  rutina_id: string | null;
  prioridad: 'baja' | 'media' | 'alta';
  estado: 'pendiente' | 'completada' | 'vencida' | 'ignorada';
  etiqueta: string | null;
  favorita: boolean;
  repeticion: 'ninguna' | 'diaria' | 'semanal' | 'mensual';
  serie_id: string | null;
  fecha_ocurrencia: string | null;
  excepciones_repeticion: string[];
  padre_id: string | null;
  version: number;
  eliminado?: boolean;
  subtareas?: Array<{ id_cliente: string; titulo: string; completada: boolean; version: number }>;
}

interface Routine {
  id: string;
  id_cliente: string;
  nombre: string;
  color: string;
  hora_inicio_predeterminada: string;
  hora_fin_predeterminada: string;
  activa: boolean;
  version: number;
  eliminada?: boolean;
  horarios?: Array<{ dia_semana: number; hora_inicio: string; hora_fin: string }>;
}

interface QuickNote {
  id: string;
  titulo: string;
  contenido: string;
  creado_en: string;
  actualizado_en: string;
}

interface Treatment {
  id: string;
  nombre_tratamiento: string;
  nombre_medicamento: string;
  dosis: string;
  indicaciones: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  continuo: boolean;
  dias_programados: number[];
  horas_programadas: string[];
  color: string | null;
  seguimiento_estricto: boolean;
  cantidad_inventario: number;
  unidades_por_toma: number;
  unidad_inventario: string;
  umbral_inventario_bajo: number;
  inventario_activo: boolean;
  estado: string;
}

interface MedicationDose {
  id: string;
  tratamiento_id: string;
  programada_en: string;
  estado: string;
  registrada_en: string | null;
  nota: string | null;
}

interface WalletData {
  configuracion: {
    monto_sueldo: number;
    periodicidad_pago: string;
    primera_fecha_pago: string;
    moneda: string;
  };
  gastos_fijos: Array<{
    id: string;
    nombre: string;
    monto: number;
    categoria: string;
    dia_vencimiento: number;
    frecuencia_meses: number;
    primer_vencimiento: string;
    inicio_seguimiento: string;
    hora_recordatorio: string;
    activo: boolean;
    creado_en: string;
    actualizado_en: string;
  }>;
  movimientos: Array<{
    id: string;
    naturaleza: 'ingreso' | 'gasto';
    tipo: string;
    descripcion: string;
    monto: number;
    categoria: string;
    fecha: string;
    gasto_fijo_id?: string | null;
    periodo_gasto_fijo?: string | null;
    creado_en: string;
    actualizado_en: string;
  }>;
}

interface UserPreferences {
  preferencias: { modo_avanzado: boolean; bienestar_activo: boolean };
  recordatorios_etiqueta: Array<{ etiqueta: string; activo: boolean }>;
}

const app = document.querySelector<HTMLDivElement>('#app')!;
const TOKEN_KEY = 'todo-en-orden-desktop-token';
const USER_KEY = 'todo-en-orden-desktop-user';
let token = localStorage.getItem(TOKEN_KEY);
let user = readUser();
let items: AgendaItem[] = [];
let routines: Routine[] = [];
let notes: QuickNote[] = [];
let treatments: Treatment[] = [];
let doses: MedicationDose[] = [];
let wallet: WalletData = emptyWallet();
let preferences: UserPreferences = { preferencias: { modo_avanzado: false, bienestar_activo: false }, recordatorios_etiqueta: [] };
let activeView: ViewName = 'inicio';
let searchTerm = '';
let loading = false;
let message = '';
let calendarMode: CalendarMode = 'mes';
let calendarCursor = startOfDay(new Date());

const icons: Record<string, string> = {
  logo: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18M8 14h3M14 14h2M8 17h2"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  tasks: '<svg viewBox="0 0 24 24"><path d="m4 7 2 2 4-4M13 7h7M4 14l2 2 4-4M13 14h7M4 21l2-2 2 2M13 20h7"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M5 3h11l4 4v14H5zM15 3v5h5M8 12h8M8 16h8"/></svg>',
  wallet: '<svg viewBox="0 0 24 24"><path d="M4 5h14a2 2 0 0 1 2 2v13H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M16 11h6v5h-6a2 2 0 0 1 0-5z"/></svg>',
  health: '<svg viewBox="0 0 24 24"><path d="M12 21S4 16.5 4 9.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 3.5C20 16.5 12 21 12 21z"/><path d="M8 12h2l1-3 2 6 1-3h2"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 6v5h-5M4 18v-5h5"/><path d="M18 9a7 7 0 0 0-12-2L4 11M6 15a7 7 0 0 0 12 2l2-4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
};

const nav: Array<{ id: ViewName; label: string; icon: string }> = [
  { id: 'inicio', label: 'Inicio', icon: 'home' },
  { id: 'agenda', label: 'Agenda', icon: 'calendar' },
  { id: 'tareas', label: 'Tareas', icon: 'tasks' },
  { id: 'rutinas', label: 'Rutinas', icon: 'repeat' },
  { id: 'notas', label: 'Notas rápidas', icon: 'note' },
  { id: 'billetera', label: 'Billetera', icon: 'wallet' },
  { id: 'bienestar', label: 'Bienestar', icon: 'health' },
];

window.todoEnOrdenDesktop.onAuthSession((session) => {
  token = session.token;
  user = session.user;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  void loadAgenda();
});
window.todoEnOrdenDesktop.onRefreshAgenda(() => void loadAgenda());

void bootstrap();

async function bootstrap(): Promise<void> {
  if (!token || !user) {
    renderLogin();
    return;
  }
  try {
    const response = await api<{ data: User }>('/auth/me');
    user = response.data;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    await loadAgenda();
  } catch {
    clearSession();
    renderLogin('Tu sesión terminó. Vuelve a iniciar sesión.');
  }
}

async function loadAgenda(): Promise<void> {
  loading = true;
  renderApp();
  try {
    const [agendaResponse, routinesResponse, notesResponse, walletResponse, treatmentsResponse, dosesResponse, preferencesResponse] = await Promise.all([
      api<{ data: { elementos: AgendaItem[] } }>('/agenda'),
      api<{ data: { rutinas: Routine[] } }>('/rutinas'),
      api<{ data: { notas: QuickNote[] } }>('/notas'),
      api<{ data: { billetera: WalletData } }>('/billetera'),
      api<{ data: { tratamientos: Treatment[] } }>('/bienestar/tratamientos'),
      api<{ data: { tomas: MedicationDose[] } }>('/bienestar/tomas'),
      api<{ data: UserPreferences }>('/preferencias'),
    ]);
    items = agendaResponse.data.elementos.filter((item) => !item.eliminado);
    routines = routinesResponse.data.rutinas.filter((routine) => !routine.eliminada);
    notes = notesResponse.data.notas;
    wallet = walletResponse.data.billetera;
    treatments = treatmentsResponse.data.tratamientos;
    doses = dosesResponse.data.tomas;
    preferences = preferencesResponse.data;
    message = '';
  } catch (error) {
    message = error instanceof Error ? error.message : 'No pudimos actualizar la agenda.';
  } finally {
    loading = false;
    renderApp();
  }
}

async function api<T>(path: string, options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown } = {}): Promise<T> {
  if (!token) throw new Error('No hay una sesión activa.');
  const response = await window.todoEnOrdenDesktop.apiRequest({ path, token, ...options });
  if (!response.ok) {
    if (response.status === 401) clearSession();
    const body = response.body as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${response.status}`);
  }
  return response.body as T;
}

function renderLogin(error = ''): void {
  app.innerHTML = `
    <main class="auth-screen">
      <section class="auth-card">
        <div class="brand-badge">${icons.logo}</div>
        <p class="eyebrow">TODO EN ORDEN · WINDOWS</p>
        <h1>Tu día, claro y bajo control.</h1>
        <p class="auth-copy">Consulta tu agenda en una vista amplia, sincronizada con tus demás dispositivos.</p>
        <div class="auth-benefits"><span>✓ Agenda sincronizada</span><span>✓ Aplicación independiente para Windows</span></div>
        ${error ? `<p class="alert">${escapeHtml(error)}</p>` : ''}
        <button class="primary-button" data-action="login">Continuar con Google</button>
        <p class="privacy">El acceso se abrirá de forma segura en tu navegador.</p>
      </section>
    </main>`;
  app.querySelector('[data-action="login"]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    button.textContent = 'Abriendo el navegador…';
    try {
      await window.todoEnOrdenDesktop.startGoogleLogin();
      button.textContent = 'Esperando acceso…';
    } catch {
      renderLogin('No fue posible abrir el navegador.');
    }
  });
}

function renderApp(): void {
  if (!user) return renderLogin();
  const avatar = user.avatarUrl
    ? `<img src="${escapeHtml(user.avatarUrl)}" alt="" referrerpolicy="no-referrer">`
    : `<span>${escapeHtml(initials(user.name))}</span>`;
  app.innerHTML = `
    <div class="desktop-shell">
      <aside class="sidebar">
        <div class="brand"><div class="brand-badge small">${icons.logo}</div><div><strong>Todo en Orden</strong><span>Escritorio</span></div></div>
        <nav>${nav.map((entry) => `<button class="nav-item ${entry.id === activeView ? 'active' : ''}" data-view="${entry.id}">${icons[entry.icon]}<span>${entry.label}</span></button>`).join('')}</nav>
        <div class="sidebar-bottom">
          <button class="profile" data-action="profile"><span class="avatar">${avatar}</span><span><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></span><b>•••</b></button>
          <button class="logout-button" data-action="logout">Cerrar sesión</button>
        </div>
      </aside>
      <main class="workspace">
        <header class="topbar">
          <label class="search">${icons.search}<input type="search" placeholder="Buscar en tu agenda" value="${escapeHtml(searchTerm)}"></label>
          <button class="icon-button ${loading ? 'spinning' : ''}" data-action="refresh" title="Actualizar">${icons.refresh}</button>
          <div class="today-label"><span>${capitalizedDate(new Date())}</span><strong>${formatTime(new Date())}</strong></div>
        </header>
        <section class="content">${message ? `<p class="alert">${escapeHtml(message)}</p>` : ''}${renderView()}</section>
      </main>
    </div>`;
  bindAppEvents();
}

function renderView(): string {
  const visible = filteredItems();
  if (activeView === 'inicio') return renderDashboard(visible);
  if (activeView === 'agenda') return renderCalendarPage();
  if (activeView === 'tareas') return renderListPage('Tareas', 'Todo lo que tienes por completar', visible.filter((item) => item.tipo === 'tarea'));
  if (activeView === 'rutinas') return renderRoutinesPage();
  if (activeView === 'notas') return renderNotesPage();
  if (activeView === 'billetera') return renderWalletPage();
  return renderWellnessPage();
}

function renderNotesPage(): string {
  const term = searchTerm.trim().toLocaleLowerCase('es');
  const visibleNotes = notes.filter((note) => !term || `${note.titulo} ${note.contenido}`.toLocaleLowerCase('es').includes(term));
  return `<div class="page-heading"><div><p class="eyebrow">CAPTURA RÁPIDA</p><h1>Notas rápidas</h1><p>Ideas sincronizadas que después puedes convertir en tareas o eventos.</p></div><div class="heading-actions"><span class="count-pill">${visibleNotes.length} notas</span><button class="primary-compact" data-create="note">+ Nueva nota</button></div></div>
    <section class="notes-grid">${visibleNotes.length ? visibleNotes.map((note) => `<article class="note-card"><div><strong>${escapeHtml(note.titulo || 'Sin título')}</strong><time>${formatServerDate(note.actualizado_en)}</time></div><p>${escapeHtml(note.contenido || 'Sin contenido adicional.')}</p><div class="card-actions"><button data-edit-note="${escapeHtml(note.id)}">Editar</button><button class="danger" data-delete-note="${escapeHtml(note.id)}">Eliminar</button></div></article>`).join('') : moduleEmpty('No hay notas sincronizadas', 'Crea una nota desde Windows o Ionic.')}</section>`;
}

function renderWalletPage(): string {
  const income = wallet.movimientos.filter((item) => item.naturaleza === 'ingreso').reduce((total, item) => total + Number(item.monto), 0);
  const spent = wallet.movimientos.filter((item) => item.naturaleza === 'gasto').reduce((total, item) => total + Number(item.monto), 0);
  const committed = wallet.gastos_fijos.filter((item) => item.activo).reduce((total, item) => total + Number(item.monto), 0);
  const available = Number(wallet.configuracion.monto_sueldo) + income - spent - committed;
  return `<div class="page-heading"><div><p class="eyebrow">CONTROL PERSONAL</p><h1>Billetera</h1><p>Ingresos, compromisos y movimientos sincronizados.</p></div><div class="heading-actions"><button class="secondary-compact" data-wallet-settings>Configurar sueldo</button><button class="secondary-compact" data-create="fixed-expense">+ Gasto fijo</button><button class="primary-compact" data-create="movement">+ Movimiento</button></div></div>
    <div class="wallet-summary"><article class="balance-card"><span>Disponible después de compromisos</span><strong>${money(available)}</strong><small>Sueldo registrado: ${money(wallet.configuracion.monto_sueldo)}</small></article>${walletStatCard('Ingresos extra', income, 'primary')}${walletStatCard('Gastado', spent, 'red')}${walletStatCard('Gastos fijos', committed, 'amber')}</div>
    <div class="module-columns"><section class="panel module-panel"><div class="section-heading"><div><h2>Gastos fijos</h2><p>Compromisos activos</p></div><span>${wallet.gastos_fijos.length}</span></div>${wallet.gastos_fijos.length ? `<div class="simple-list">${wallet.gastos_fijos.map((expense) => `<article><div><strong>${escapeHtml(expense.nombre)}</strong><span>${escapeHtml(expense.categoria)} · ${expense.frecuencia_meses === 2 ? 'Bimestral' : 'Mensual'}</span></div><b>${money(expense.monto)}</b><div class="row-actions"><button data-edit-fixed="${escapeHtml(expense.id)}">Editar</button><button class="danger" data-delete-fixed="${escapeHtml(expense.id)}">Eliminar</button></div></article>`).join('')}</div>` : moduleEmpty('Sin gastos fijos', 'Los gastos registrados aparecerán aquí.')}</section>
    <section class="panel module-panel"><div class="section-heading"><div><h2>Movimientos</h2><p>Actividad reciente</p></div><span>${wallet.movimientos.length}</span></div>${wallet.movimientos.length ? `<div class="simple-list">${wallet.movimientos.slice(0, 12).map((movement) => `<article><div><strong>${escapeHtml(movement.descripcion)}</strong><span>${escapeHtml(movement.categoria)} · ${formatDateKey(movement.fecha)}</span></div><b class="${movement.naturaleza}">${movement.naturaleza === 'ingreso' ? '+' : '−'}${money(movement.monto)}</b><div class="row-actions"><button data-edit-movement="${escapeHtml(movement.id)}">Editar</button><button class="danger" data-delete-movement="${escapeHtml(movement.id)}">Eliminar</button></div></article>`).join('')}</div>` : moduleEmpty('Sin movimientos', 'Registra un ingreso o gasto para comenzar.')}</section></div>`;
}

function renderWellnessPage(): string {
  const today = dateKey(new Date());
  const todayDoses = doses.filter((dose) => dose.programada_en.slice(0, 10) === today);
  const taken = todayDoses.filter((dose) => dose.estado === 'taken').length;
  const activeTreatments = treatments.filter((treatment) => treatment.estado === 'active');
  const dosesByTreatment = new Map<string, MedicationDose[]>();
  for (const dose of todayDoses) dosesByTreatment.set(dose.tratamiento_id, [...(dosesByTreatment.get(dose.tratamiento_id) ?? []), dose]);
  return `<div class="page-heading"><div><p class="eyebrow">SALUD Y BIENESTAR</p><h1>Tratamientos</h1><p>Seguimiento sincronizado de medicamentos y tomas.</p></div><div class="heading-actions"><span class="sync-pill">${preferences.preferencias.bienestar_activo ? '● Activo' : '○ Desactivado'}</span><button class="primary-compact" data-create="treatment">+ Tratamiento</button></div></div>
    <div class="wellness-summary"><article class="panel"><span>Tratamientos activos</span><strong>${activeTreatments.length}</strong></article><article class="panel"><span>Tomas de hoy</span><strong>${taken}/${todayDoses.length}</strong></article><article class="panel"><span>Pendientes hoy</span><strong>${todayDoses.filter((dose) => dose.estado === 'pending' || dose.estado === 'missed').length}</strong></article></div>
    <section class="treatment-grid">${activeTreatments.length ? activeTreatments.map((treatment) => {
      const treatmentDoses = (dosesByTreatment.get(treatment.id) ?? []).sort((a, b) => a.programada_en.localeCompare(b.programada_en));
      return `<article class="treatment-card" style="--treatment:${safeColor(treatment.color)}"><div class="treatment-heading"><div class="treatment-icon">${icons.health}</div><div><span>${escapeHtml(treatment.nombre_tratamiento)}</span><strong>${escapeHtml(treatment.nombre_medicamento)}</strong><small>${escapeHtml(treatment.dosis)} · ${treatment.continuo ? 'Indefinido' : `Hasta ${formatDateKey(treatment.fecha_fin ?? treatment.fecha_inicio)}`}</small></div><i>Activo</i></div><div class="dose-chips">${treatmentDoses.length ? treatmentDoses.map((dose) => `<span class="${escapeHtml(dose.estado)}">${dose.programada_en.slice(11, 16)} · ${doseStatus(dose.estado)}</span>`).join('') : '<span>Sin tomas para hoy</span>'}</div>${treatment.inventario_activo ? `<p class="inventory">Inventario: <strong>${treatment.cantidad_inventario} ${escapeHtml(treatment.unidad_inventario)}</strong></p>` : ''}<div class="card-actions"><button data-edit-treatment="${escapeHtml(treatment.id)}">Editar</button><button class="danger" data-delete-treatment="${escapeHtml(treatment.id)}">Eliminar</button></div></article>`;
    }).join('') : moduleEmpty('No hay tratamientos activos', 'Los tratamientos creados desde Ionic aparecerán aquí.')}</section>`;
}

function renderRoutinesPage(): string {
  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  return `<div class="page-heading"><div><p class="eyebrow">ACTIVIDADES RECURRENTES</p><h1>Rutinas</h1><p>Sincronizadas con la misma cuenta de tu aplicación móvil.</p></div><div class="heading-actions"><span class="count-pill">${routines.length} rutinas</span><button class="primary-compact" data-create="routine">+ Nueva rutina</button></div></div>
    <section class="routine-grid">${routines.length ? routines.map((routine) => `<article class="routine-card" style="--routine:${safeColor(routine.color)}"><div class="routine-icon">${icons.repeat}</div><div class="routine-info"><strong>${escapeHtml(routine.nombre)}</strong><span>${routine.hora_inicio_predeterminada.slice(0, 5)} – ${routine.hora_fin_predeterminada.slice(0, 5)}</span><div class="routine-days">${dayNames.map((day, index) => `<i class="${routine.horarios?.some((schedule) => Number(schedule.dia_semana) === index) ? 'active' : ''}">${day}</i>`).join('')}</div></div><span class="routine-status">${routine.activa ? 'Activa' : 'Pausada'}</span><div class="card-actions"><button data-edit-routine="${escapeHtml(routine.id_cliente)}">Editar</button><button class="danger" data-delete-routine="${escapeHtml(routine.id_cliente)}">Eliminar</button></div></article>`).join('') : '<div class="compact-empty"><strong>No hay rutinas sincronizadas</strong><span>Crea una rutina desde Windows o Ionic.</span></div>'}</section>`;
}

function renderDashboard(visible: AgendaItem[]): string {
  const today = dateKey(new Date());
  const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = dateKey(tomorrowDate);
  const pending = visible.filter((item) => item.estado === 'pendiente' || item.estado === 'vencida');
  const todayItems = pending.filter((item) => item.fecha_programada === today);
  const tomorrowItems = pending.filter((item) => item.fecha_programada === tomorrow);
  const overdue = pending.filter((item) => item.fecha_programada && item.fecha_programada < today);
  const nextEvent = pending.filter((item) => item.tipo === 'evento' && item.fecha_programada && item.fecha_programada >= today).sort(byDate)[0];
  return `
    <div class="page-heading"><div><p class="eyebrow">RESUMEN DEL DÍA</p><h1>Hola, ${escapeHtml(firstName(user?.name ?? ''))}</h1><p>${todayItems.length ? `Tienes ${todayItems.length} pendiente${todayItems.length === 1 ? '' : 's'} para hoy.` : 'Tu agenda de hoy está despejada.'}</p></div><span class="sync-pill">● Sincronizado</span></div>
    <div class="stats-grid">
      ${statCard('Hoy', todayItems.length, 'primary')}${statCard('Mañana', tomorrowItems.length, 'purple')}${statCard('Pendientes', pending.length, 'amber')}${statCard('Vencidas', overdue.length, 'red')}
    </div>
    <div class="dashboard-grid">
      <section class="panel next-panel"><div class="panel-title"><div><span>Próximo evento</span><strong>${nextEvent ? escapeHtml(nextEvent.titulo) : 'Sin eventos próximos'}</strong></div><span class="date-chip">${nextEvent ? itemDate(nextEvent) : 'Agenda libre'}</span></div>${nextEvent ? `<div class="event-focus" style="--accent:${safeColor(nextEvent.color)}"><span>${formatItemTime(nextEvent)}</span><p>${escapeHtml(nextEvent.etiqueta ?? 'Evento')}</p></div>` : '<p class="muted">Disfruta el espacio libre o agrega algo cuando lo necesites.</p>'}</section>
      <section class="panel"><div class="panel-title"><div><span>Progreso de hoy</span><strong>${todayItems.length ? 'En marcha' : 'Todo en orden'}</strong></div><span class="progress-number">${todayItems.filter((item) => item.estado === 'completada').length}/${todayItems.length}</span></div><div class="progress-track"><i style="width:${todayItems.length ? 0 : 100}%"></i></div><p class="muted">${todayItems.length ? 'Completa tus pendientes para cerrar el día.' : 'No tienes pendientes programados para hoy.'}</p></section>
    </div>
    ${renderHomeCalendar()}
    <section class="panel list-panel"><div class="section-heading"><div><h2>Pendientes cercanos</h2><p>Hoy y los siguientes días</p></div><button class="text-button" data-view="tareas">Ver todas</button></div>${renderItems(pending.slice().sort(byDate).slice(0, 7))}</section>`;
}

function renderCalendarPage(): string {
  const title = new Intl.DateTimeFormat('es-MX', calendarMode === 'dia'
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { month: 'long', year: 'numeric' }).format(calendarCursor);
  return `
    <div class="calendar-heading">
      <div><p class="eyebrow">AGENDA</p><h1>${capitalize(title)}</h1><p>Eventos y tareas programadas en una sola vista.</p></div>
      <div class="calendar-actions">
        <button class="primary-compact" data-create="agenda">+ Nueva actividad</button>
        <div class="calendar-nav"><button data-calendar-action="previous" aria-label="Anterior">‹</button><button data-calendar-action="today">Hoy</button><button data-calendar-action="next" aria-label="Siguiente">›</button></div>
        <div class="view-switch">${(['dia', 'semana', 'mes'] as CalendarMode[]).map((mode) => `<button class="${calendarMode === mode ? 'active' : ''}" data-calendar-mode="${mode}">${capitalize(mode)}</button>`).join('')}</div>
      </div>
    </div>
    ${calendarMode === 'dia' ? renderDayCalendar() : calendarMode === 'semana' ? renderWeekCalendar() : renderMonthCalendar(false)}`;
}

function renderHomeCalendar(): string {
  const selectedKey = dateKey(calendarCursor);
  const selectedItems = calendarItems().filter((item) => item.fecha_programada === selectedKey).sort(byDate);
  const selectedLabel = capitalize(new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(calendarCursor));
  return `<section class="panel home-calendar-panel">
    <div class="home-calendar-header">
      <div><h2>Calendario</h2><p>${capitalize(new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(calendarCursor))}</p></div>
      <div class="home-calendar-controls"><button data-home-calendar-action="previous" aria-label="Mes anterior">‹</button><button data-home-calendar-action="today">Hoy</button><button data-home-calendar-action="next" aria-label="Mes siguiente">›</button><button class="open-agenda" data-view="agenda">Abrir agenda</button></div>
    </div>
    <div class="home-calendar-content">
      ${renderMonthCalendar(true, true)}
      <aside class="selected-day-panel"><div class="selected-day-heading"><span>Seleccionado</span><strong>${selectedLabel}</strong><small>${selectedItems.length} ${selectedItems.length === 1 ? 'actividad' : 'actividades'}</small></div>${selectedItems.length ? `<div class="selected-day-list">${selectedItems.map(calendarEventCard).join('')}</div>` : '<div class="selected-day-empty"><strong>Día libre</strong><span>No hay eventos ni pendientes programados.</span></div>'}</aside>
    </div>
  </section>`;
}

function renderMonthCalendar(compact: boolean, home = false): string {
  const first = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const today = dateKey(new Date());
  const cells = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  return `<div class="month-calendar ${compact ? 'compact' : ''} ${home ? 'home-size' : ''}">
    <div class="weekdays">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => `<span>${day}</span>`).join('')}</div>
    <div class="month-grid">${cells.map((date) => {
      const key = dateKey(date);
      const dayItems = calendarItems().filter((item) => item.fecha_programada === key).sort(byDate);
      const outside = date.getMonth() !== calendarCursor.getMonth();
      return `<button class="calendar-day ${outside ? 'outside' : ''} ${key === today ? 'today' : ''} ${key === dateKey(calendarCursor) ? 'selected' : ''}" data-calendar-date="${key}" ${home ? 'data-home-calendar="true"' : ''}>
        <span class="day-number">${date.getDate()}</span>
        ${compact
          ? `<span class="day-dots">${dayItems.slice(0, 3).map((item) => `<i style="--dot:${safeColor(item.color)}"></i>`).join('')}</span>`
          : `<span class="day-events">${dayItems.slice(0, 3).map((item) => `<b style="--event:${safeColor(item.color)}">${escapeHtml(item.hora_inicio?.slice(0, 5) ?? '')} ${escapeHtml(item.titulo)}</b>`).join('')}${dayItems.length > 3 ? `<small>+${dayItems.length - 3} más</small>` : ''}</span>`}
      </button>`;
    }).join('')}</div>
  </div>`;
}

function renderWeekCalendar(): string {
  const start = startOfWeek(calendarCursor);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  return `<section class="panel week-calendar"><div class="week-columns">${days.map((date) => {
    const key = dateKey(date);
    const dayItems = calendarItems().filter((item) => item.fecha_programada === key).sort(byDate);
    return `<div class="week-day ${key === dateKey(new Date()) ? 'today' : ''}"><button data-calendar-date="${key}"><span>${new Intl.DateTimeFormat('es-MX', { weekday: 'short' }).format(date)}</span><strong>${date.getDate()}</strong></button><div>${dayItems.length ? dayItems.map(calendarEventCard).join('') : '<span class="no-events">Sin eventos</span>'}</div></div>`;
  }).join('')}</div></section>`;
}

function renderDayCalendar(): string {
  const key = dateKey(calendarCursor);
  const dayItems = calendarItems().filter((item) => item.fecha_programada === key).sort(byDate);
  return `<section class="panel day-calendar"><div class="day-date"><strong>${calendarCursor.getDate()}</strong><span>${capitalize(new Intl.DateTimeFormat('es-MX', { weekday: 'long', month: 'long' }).format(calendarCursor))}</span></div><div class="day-schedule">${dayItems.length ? dayItems.map(calendarEventCard).join('') : '<div class="compact-empty"><strong>No hay actividades este día</strong><span>Puedes moverte a otro día o cambiar la vista.</span></div>'}</div></section>`;
}

function calendarEventCard(item: AgendaItem): string {
  return `<article class="calendar-event ${item.estado === 'completada' ? 'completed' : ''}" style="--event:${safeColor(item.color)}"><time>${formatItemTime(item)}</time><strong>${escapeHtml(item.titulo)}</strong><span>${escapeHtml(item.etiqueta ?? (item.tipo === 'evento' ? 'Evento' : 'Tarea'))}</span><div class="calendar-card-actions"><button data-edit-agenda="${escapeHtml(item.id_cliente)}">Editar</button><button class="danger" data-delete-agenda="${escapeHtml(item.id_cliente)}">Eliminar</button></div></article>`;
}

function calendarItems(): AgendaItem[] {
  const term = searchTerm.trim().toLocaleLowerCase('es');
  return items.filter((item) => item.fecha_programada && item.estado !== 'ignorada' && (!term || `${item.titulo} ${item.etiqueta ?? ''}`.toLocaleLowerCase('es').includes(term)));
}

function renderListPage(title: string, subtitle: string, list: AgendaItem[]): string {
  return `<div class="page-heading"><div><p class="eyebrow">TODO EN ORDEN</p><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions"><span class="count-pill">${list.length} elementos</span><button class="primary-compact" data-create="agenda">+ Nueva tarea</button></div></div><section class="panel list-panel">${renderItems(list.slice().sort(byDate))}</section>`;
}

function renderItems(list: AgendaItem[]): string {
  if (!list.length) return '<div class="compact-empty"><strong>No hay elementos aquí</strong><span>Cuando sincronices o agregues información aparecerá en esta lista.</span></div>';
  return `<div class="agenda-list">${list.map((item) => `<article class="agenda-row ${item.estado === 'vencida' ? 'overdue' : ''}"><button class="check-button" data-complete="${escapeHtml(item.id_cliente)}" title="Marcar como completada">${icons.check}</button><span class="item-dot" style="--item-color:${safeColor(item.color)}"></span><div class="item-main"><strong>${escapeHtml(item.titulo)}</strong><span>${escapeHtml(item.etiqueta ?? (item.tipo === 'evento' ? 'Evento' : 'Tarea'))}</span></div><time>${itemDate(item)}<b>${formatItemTime(item)}</b></time><div class="row-actions"><button data-edit-agenda="${escapeHtml(item.id_cliente)}">Editar</button><button class="danger" data-delete-agenda="${escapeHtml(item.id_cliente)}">Eliminar</button></div></article>`).join('')}</div>`;
}

function bindAppEvents(): void {
  app.querySelectorAll<HTMLElement>('[data-view]').forEach((element) => element.addEventListener('click', () => {
    activeView = element.dataset['view'] as ViewName;
    renderApp();
  }));
  app.querySelector('[data-action="refresh"]')?.addEventListener('click', () => void loadAgenda());
  app.querySelector('[data-action="logout"]')?.addEventListener('click', () => { clearSession(); renderLogin(); });
  app.querySelector<HTMLInputElement>('.search input')?.addEventListener('input', (event) => {
    searchTerm = (event.target as HTMLInputElement).value;
    renderApp();
    requestAnimationFrame(() => { const input = app.querySelector<HTMLInputElement>('.search input'); input?.focus(); input?.setSelectionRange(searchTerm.length, searchTerm.length); });
  });
  app.querySelectorAll<HTMLElement>('[data-complete]').forEach((button) => button.addEventListener('click', () => void completeItem(button.dataset['complete'] ?? '')));
  app.querySelectorAll<HTMLElement>('[data-create]').forEach((button) => button.addEventListener('click', () => openCreateModal(button.dataset['create'] ?? '')));
  app.querySelector('[data-wallet-settings]')?.addEventListener('click', () => openWalletSettingsModal());
  bindEntityActions('agenda', openAgendaModal, deleteAgendaItem);
  bindEntityActions('routine', openRoutineModal, deleteRoutine);
  bindEntityActions('note', openNoteModal, deleteNote);
  bindEntityActions('fixed', openFixedExpenseModal, deleteFixedExpense);
  bindEntityActions('movement', openMovementModal, deleteMovement);
  bindEntityActions('treatment', openTreatmentModal, deleteTreatment);
  app.querySelectorAll<HTMLElement>('[data-calendar-mode]').forEach((button) => button.addEventListener('click', () => {
    calendarMode = button.dataset['calendarMode'] as CalendarMode;
    renderApp();
  }));
  app.querySelectorAll<HTMLElement>('[data-calendar-date]').forEach((button) => button.addEventListener('click', () => {
    calendarCursor = parseDateKey(button.dataset['calendarDate'] ?? dateKey(new Date()));
    if (activeView === 'agenda') {
      activeView = 'agenda';
      calendarMode = 'dia';
    }
    renderApp();
  }));
  app.querySelectorAll<HTMLElement>('[data-calendar-action]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset['calendarAction'];
    if (action === 'today') calendarCursor = startOfDay(new Date());
    else if (calendarMode === 'dia') calendarCursor = addDays(calendarCursor, action === 'previous' ? -1 : 1);
    else if (calendarMode === 'semana') calendarCursor = addDays(calendarCursor, action === 'previous' ? -7 : 7);
    else calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + (action === 'previous' ? -1 : 1), 1);
    renderApp();
  }));
  app.querySelectorAll<HTMLElement>('[data-home-calendar-action]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset['homeCalendarAction'];
    if (action === 'today') calendarCursor = startOfDay(new Date());
    else calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + (action === 'previous' ? -1 : 1), 1);
    renderApp();
  }));
}

function bindEntityActions(entity: string, edit: (id: string) => void, remove: (id: string) => Promise<void>): void {
  app.querySelectorAll<HTMLElement>(`[data-edit-${entity}]`).forEach((button) => button.addEventListener('click', () => edit(button.dataset[`edit${capitalize(entity)}`] ?? '')));
  app.querySelectorAll<HTMLElement>(`[data-delete-${entity}]`).forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset[`delete${capitalize(entity)}`] ?? '';
    if (id && window.confirm('¿Deseas eliminar este elemento? Esta acción se sincronizará con tus otros dispositivos.')) void remove(id);
  }));
}

function openCreateModal(entity: string): void {
  if (entity === 'agenda') openAgendaModal();
  else if (entity === 'routine') openRoutineModal();
  else if (entity === 'note') openNoteModal();
  else if (entity === 'fixed-expense') openFixedExpenseModal();
  else if (entity === 'movement') openMovementModal();
  else if (entity === 'treatment') openTreatmentModal();
}

function showFormModal(title: string, content: string, submitLabel: string, onSubmit: (form: HTMLFormElement) => Promise<void>): void {
  document.querySelector('.modal-backdrop')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = `<section class="desktop-modal"><header><h2>${escapeHtml(title)}</h2><button type="button" data-modal-close aria-label="Cerrar">×</button></header><form><div class="modal-content">${content}</div><footer><button type="button" class="secondary-compact" data-modal-close>Cancelar</button><button type="submit" class="primary-compact">${escapeHtml(submitLabel)}</button></footer></form></section>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-modal-close]').forEach((button) => button.addEventListener('click', close));
  overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
  overlay.querySelector('form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try { await onSubmit(form); close(); } catch (error) {
      const alert = document.createElement('p'); alert.className = 'modal-error'; alert.textContent = error instanceof Error ? error.message : 'No se pudo guardar.';
      form.querySelector('.modal-error')?.remove(); form.querySelector('.modal-content')?.appendChild(alert);
      if (button) button.disabled = false;
    }
  });
  overlay.querySelector<HTMLInputElement>('input, textarea, select')?.focus();
}

function field(label: string, name: string, type: string, value = '', required = false, extra = ''): string {
  return `<label class="form-field"><span>${escapeHtml(label)}${required ? ' *' : ''}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? 'required' : ''} ${extra}></label>`;
}

function inputValue(form: HTMLFormElement, name: string): string {
  return String(new FormData(form).get(name) ?? '').trim();
}

function openAgendaModal(id = ''): void {
  const item = items.find((entry) => entry.id_cliente === id);
  showFormModal(item ? 'Editar actividad' : 'Nueva actividad', `
    ${field('Título', 'title', 'text', item?.titulo ?? '', true, 'maxlength="255"')}
    <div class="form-grid"><label class="form-field"><span>Tipo *</span><select name="type"><option value="tarea" ${item?.tipo !== 'evento' ? 'selected' : ''}>Tarea</option><option value="evento" ${item?.tipo === 'evento' ? 'selected' : ''}>Evento</option></select></label>${field('Fecha', 'date', 'date', item?.fecha_programada ?? dateKey(new Date()))}</div>
    <div class="form-grid">${field('Hora de inicio', 'start', 'time', item?.hora_inicio?.slice(0, 5) ?? '')}${field('Hora de fin', 'end', 'time', item?.hora_fin?.slice(0, 5) ?? '')}</div>
    <div class="form-grid">${field('Etiqueta', 'label', 'text', item?.etiqueta ?? '', false, 'maxlength="30"')}<label class="form-field"><span>Prioridad</span><select name="priority">${['baja','media','alta'].map((value) => `<option value="${value}" ${item?.prioridad === value ? 'selected' : ''}>${capitalize(value)}</option>`).join('')}</select></label></div>
    ${field('Color', 'color', 'color', safeColor(item?.color ?? '#4f8cff'))}
  `, item ? 'Guardar cambios' : 'Crear actividad', async (form) => {
    const payload = agendaPayload(item, {
      titulo: inputValue(form, 'title'), tipo: inputValue(form, 'type') as 'tarea' | 'evento',
      fecha_programada: inputValue(form, 'date') || null, hora_inicio: inputValue(form, 'start') || null,
      hora_fin: inputValue(form, 'end') || null, etiqueta: inputValue(form, 'label') || null,
      prioridad: inputValue(form, 'priority') as AgendaItem['prioridad'], color: inputValue(form, 'color'),
    });
    await api('/agenda/sincronizar', { method: 'POST', body: { elementos: [payload] } });
    await loadAgenda();
  });
}

function agendaPayload(item: AgendaItem | undefined, changes: Partial<AgendaItem> = {}): Record<string, unknown> {
  return {
    id_cliente: item?.id_cliente ?? crypto.randomUUID(), version_base: Number(item?.version ?? 0),
    titulo: changes.titulo ?? item?.titulo ?? 'Nueva actividad', tipo: changes.tipo ?? item?.tipo ?? 'tarea',
    fecha_programada: changes.fecha_programada !== undefined ? changes.fecha_programada : item?.fecha_programada ?? null,
    hora_inicio: changes.hora_inicio !== undefined ? changes.hora_inicio : item?.hora_inicio ?? null,
    hora_fin: changes.hora_fin !== undefined ? changes.hora_fin : item?.hora_fin ?? null,
    duracion_minutos: item?.duracion_minutos ?? null, color: changes.color ?? item?.color ?? '#4f8cff', rutina_id: item?.rutina_id ?? null,
    prioridad: changes.prioridad ?? item?.prioridad ?? 'media', estado: item?.estado ?? 'pendiente',
    etiqueta: changes.etiqueta !== undefined ? changes.etiqueta : item?.etiqueta ?? null, favorita: item?.favorita ?? false,
    repeticion: item?.repeticion ?? 'ninguna', serie_id: item?.serie_id ?? null, fecha_ocurrencia: item?.fecha_ocurrencia ?? null,
    excepciones_repeticion: item?.excepciones_repeticion ?? [], padre_id: item?.padre_id ?? null,
    subtareas: (item?.subtareas ?? []).map((subtask, position) => ({ id_cliente: subtask.id_cliente, version_base: Number(subtask.version), titulo: subtask.titulo, completada: subtask.completada, posicion: position })),
  };
}

async function deleteAgendaItem(id: string): Promise<void> {
  const item = items.find((entry) => entry.id_cliente === id); if (!item) return;
  await api('/agenda/sincronizar', { method: 'POST', body: { elementos: [{ id_cliente: id, version_base: Number(item.version), eliminado: true }] } });
  await loadAgenda();
}

function openRoutineModal(id = ''): void {
  const routine = routines.find((entry) => entry.id_cliente === id);
  const selectedDays = new Set((routine?.horarios ?? []).map((schedule) => Number(schedule.dia_semana)));
  showFormModal(routine ? 'Editar rutina' : 'Nueva rutina', `
    ${field('Nombre', 'name', 'text', routine?.nombre ?? '', true, 'maxlength="150"')}
    <div class="form-grid">${field('Hora de inicio', 'start', 'time', routine?.hora_inicio_predeterminada.slice(0, 5) ?? '08:00', true)}${field('Hora de fin', 'end', 'time', routine?.hora_fin_predeterminada.slice(0, 5) ?? '09:00', true)}</div>
    ${field('Color', 'color', 'color', safeColor(routine?.color ?? '#2563eb'))}
    <fieldset class="day-picker"><legend>Días *</legend>${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((day, index) => `<label><input type="checkbox" name="days" value="${index}" ${selectedDays.has(index) || (!routine && index < 5) ? 'checked' : ''}><span>${day}</span></label>`).join('')}</fieldset>
  `, routine ? 'Guardar cambios' : 'Crear rutina', async (form) => {
    const days = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="days"]:checked')).map((input) => Number(input.value));
    if (!days.length) throw new Error('Selecciona al menos un día.');
    const start = inputValue(form, 'start'); const end = inputValue(form, 'end');
    await api('/rutinas/sincronizar', { method: 'POST', body: { rutinas: [{
      id_cliente: routine?.id_cliente ?? crypto.randomUUID(), version_base: Number(routine?.version ?? 0), nombre: inputValue(form, 'name'),
      color: inputValue(form, 'color'), hora_inicio_predeterminada: start, hora_fin_predeterminada: end, activa: routine?.activa ?? true,
      horarios: days.map((day) => ({ dia_semana: day, hora_inicio: start, hora_fin: end })),
    }] } });
    await loadAgenda();
  });
}

async function deleteRoutine(id: string): Promise<void> {
  const routine = routines.find((entry) => entry.id_cliente === id); if (!routine) return;
  await api('/rutinas/sincronizar', { method: 'POST', body: { rutinas: [{ id_cliente: id, version_base: Number(routine.version), eliminada: true }] } });
  await loadAgenda();
}

function openNoteModal(id = ''): void {
  const note = notes.find((entry) => entry.id === id);
  showFormModal(note ? 'Editar nota' : 'Nueva nota', `${field('Título', 'title', 'text', note?.titulo ?? '', true, 'maxlength="200"')}<label class="form-field"><span>Contenido</span><textarea name="content" rows="7">${escapeHtml(note?.contenido ?? '')}</textarea></label>`, note ? 'Guardar cambios' : 'Crear nota', async (form) => {
    const now = new Date().toISOString();
    const next = note
      ? notes.map((entry) => entry.id === id ? { ...entry, titulo: inputValue(form, 'title'), contenido: inputValue(form, 'content'), actualizado_en: now } : entry)
      : [...notes, { id: crypto.randomUUID(), titulo: inputValue(form, 'title'), contenido: inputValue(form, 'content'), creado_en: now, actualizado_en: now }];
    await syncNotes(next); await loadAgenda();
  });
}

async function deleteNote(id: string): Promise<void> { await syncNotes(notes.filter((note) => note.id !== id)); await loadAgenda(); }

async function syncNotes(next: QuickNote[]): Promise<void> {
  await api('/notas/sincronizar', { method: 'PUT', body: { notas: next.map((note) => ({ id: note.id, title: note.titulo, content: note.contenido, createdAt: note.creado_en, updatedAt: note.actualizado_en })) } });
}

function openWalletSettingsModal(): void {
  showFormModal('Configurar sueldo', `<div class="form-grid">${field('Sueldo', 'salary', 'number', String(wallet.configuracion.monto_sueldo), true, 'min="0" step="0.01"')}<label class="form-field"><span>Periodicidad</span><select name="schedule"><option value="quincenal" ${wallet.configuracion.periodicidad_pago === 'quincenal' ? 'selected' : ''}>Quincenal</option><option value="catorcenal" ${wallet.configuracion.periodicidad_pago === 'catorcenal' ? 'selected' : ''}>Cada 14 días</option></select></label></div>${field('Primera fecha de pago', 'firstDate', 'date', wallet.configuracion.primera_fecha_pago || dateKey(new Date()), true)}`, 'Guardar configuración', async (form) => {
    await syncWallet({ ...wallet, configuracion: { ...wallet.configuracion, monto_sueldo: Number(inputValue(form, 'salary')), periodicidad_pago: inputValue(form, 'schedule'), primera_fecha_pago: inputValue(form, 'firstDate') } });
    await loadAgenda();
  });
}

function openFixedExpenseModal(id = ''): void {
  const expense = wallet.gastos_fijos.find((entry) => entry.id === id);
  showFormModal(expense ? 'Editar gasto fijo' : 'Nuevo gasto fijo', `
    ${field('Nombre', 'name', 'text', expense?.nombre ?? '', true, 'maxlength="150"')}
    <div class="form-grid">${field('Monto estimado', 'amount', 'number', String(expense?.monto ?? ''), true, 'min="0" step="0.01"')}${field('Categoría', 'category', 'text', expense?.categoria ?? 'Servicios', true)}</div>
    <div class="form-grid">${field('Día de vencimiento', 'dueDay', 'number', String(expense?.dia_vencimiento ?? 1), true, 'min="1" max="31"')}<label class="form-field"><span>Frecuencia</span><select name="frequency"><option value="1" ${expense?.frecuencia_meses !== 2 ? 'selected' : ''}>Mensual</option><option value="2" ${expense?.frecuencia_meses === 2 ? 'selected' : ''}>Bimestral</option></select></label></div>
    <div class="form-grid">${field('Primer vencimiento', 'firstDue', 'date', expense?.primer_vencimiento ?? dateKey(new Date()), true)}${field('Recordatorio', 'reminder', 'time', expense?.hora_recordatorio?.slice(0, 5) ?? '09:00', true)}</div>
  `, expense ? 'Guardar cambios' : 'Crear gasto fijo', async (form) => {
    const now = new Date().toISOString();
    const nextExpense: WalletData['gastos_fijos'][number] = {
      id: expense?.id ?? crypto.randomUUID(), nombre: inputValue(form, 'name'), monto: Number(inputValue(form, 'amount')),
      categoria: inputValue(form, 'category'), dia_vencimiento: Number(inputValue(form, 'dueDay')), frecuencia_meses: Number(inputValue(form, 'frequency')),
      primer_vencimiento: inputValue(form, 'firstDue'), inicio_seguimiento: expense?.inicio_seguimiento ?? dateKey(new Date()),
      hora_recordatorio: inputValue(form, 'reminder'), activo: expense?.activo ?? true, creado_en: expense?.creado_en ?? now, actualizado_en: now,
    };
    const next = expense ? wallet.gastos_fijos.map((entry) => entry.id === id ? nextExpense : entry) : [...wallet.gastos_fijos, nextExpense];
    await syncWallet({ ...wallet, gastos_fijos: next }); await loadAgenda();
  });
}

async function deleteFixedExpense(id: string): Promise<void> {
  await syncWallet({ ...wallet, gastos_fijos: wallet.gastos_fijos.filter((entry) => entry.id !== id), movimientos: wallet.movimientos.map((entry) => entry.gasto_fijo_id === id ? { ...entry, gasto_fijo_id: null } : entry) });
  await loadAgenda();
}

function openMovementModal(id = ''): void {
  const movement = wallet.movimientos.find((entry) => entry.id === id);
  showFormModal(movement ? 'Editar movimiento' : 'Nuevo movimiento', `
    ${field('Descripción', 'description', 'text', movement?.descripcion ?? '', true, 'maxlength="255"')}
    <div class="form-grid"><label class="form-field"><span>Tipo</span><select name="kind"><option value="gasto" ${movement?.naturaleza !== 'ingreso' ? 'selected' : ''}>Gasto</option><option value="ingreso" ${movement?.naturaleza === 'ingreso' ? 'selected' : ''}>Ingreso</option></select></label>${field('Monto', 'amount', 'number', String(movement?.monto ?? ''), true, 'min="0" step="0.01"')}</div>
    <div class="form-grid">${field('Categoría', 'category', 'text', movement?.categoria ?? 'Otros', true)}${field('Fecha', 'date', 'date', movement?.fecha ?? dateKey(new Date()), true)}</div>
  `, movement ? 'Guardar cambios' : 'Registrar movimiento', async (form) => {
    const now = new Date().toISOString(); const kind = inputValue(form, 'kind') as 'ingreso' | 'gasto';
    const nextMovement: WalletData['movimientos'][number] = {
      id: movement?.id ?? crypto.randomUUID(), naturaleza: kind, tipo: kind === 'ingreso' ? 'ingreso_extra' : 'gasto_variable',
      descripcion: inputValue(form, 'description'), monto: Number(inputValue(form, 'amount')), categoria: inputValue(form, 'category'),
      fecha: inputValue(form, 'date'), gasto_fijo_id: movement?.gasto_fijo_id ?? null, periodo_gasto_fijo: movement?.periodo_gasto_fijo ?? null,
      creado_en: movement?.creado_en ?? now, actualizado_en: now,
    };
    const next = movement ? wallet.movimientos.map((entry) => entry.id === id ? nextMovement : entry) : [nextMovement, ...wallet.movimientos];
    await syncWallet({ ...wallet, movimientos: next }); await loadAgenda();
  });
}

async function deleteMovement(id: string): Promise<void> { await syncWallet({ ...wallet, movimientos: wallet.movimientos.filter((entry) => entry.id !== id) }); await loadAgenda(); }

async function syncWallet(next: WalletData): Promise<void> {
  await api('/billetera/sincronizar', { method: 'PUT', body: {
    configuracion: { salaryAmount: next.configuracion.monto_sueldo, paySchedule: next.configuracion.periodicidad_pago === 'catorcenal' ? 'biweekly' : 'semi-monthly', firstPayDate: next.configuracion.primera_fecha_pago, currency: next.configuracion.moneda },
    gastos_fijos: next.gastos_fijos.map((entry) => ({ id: entry.id, name: entry.nombre, amount: entry.monto, category: entry.categoria, dueDay: entry.dia_vencimiento, frequencyMonths: entry.frecuencia_meses, firstDueDate: entry.primer_vencimiento, trackingStartDate: entry.inicio_seguimiento, reminderTime: entry.hora_recordatorio, active: entry.activo, createdAt: entry.creado_en, updatedAt: entry.actualizado_en })),
    movimientos: next.movimientos.map((entry) => ({ id: entry.id, kind: entry.naturaleza === 'ingreso' ? 'income' : 'expense', type: ({ ingreso_extra: 'extra-income', gasto_fijo: 'fixed-expense' } as Record<string,string>)[entry.tipo] ?? 'variable-expense', description: entry.descripcion, amount: entry.monto, category: entry.categoria, date: entry.fecha, fixedExpenseId: entry.gasto_fijo_id, fixedPeriod: entry.periodo_gasto_fijo, createdAt: entry.creado_en, updatedAt: entry.actualizado_en })),
  } });
}

function openTreatmentModal(id = ''): void {
  const treatment = treatments.find((entry) => entry.id === id);
  const selectedDays = new Set(treatment?.dias_programados ?? [0, 1, 2, 3, 4, 5, 6]);
  showFormModal(treatment ? 'Editar tratamiento' : 'Nuevo tratamiento', `
    ${field('Nombre del tratamiento', 'treatmentName', 'text', treatment?.nombre_tratamiento ?? '', true, 'placeholder="Ej. Depresión"')}
    <div class="form-grid">${field('Medicamento', 'medicine', 'text', treatment?.nombre_medicamento ?? '', true)}${field('Dosis', 'dose', 'text', treatment?.dosis ?? '', true, 'placeholder="Ej. 1 tableta"')}</div>
    <div class="form-grid">${field('Fecha de inicio', 'startDate', 'date', treatment?.fecha_inicio ?? dateKey(new Date()), true)}${field('Fecha final', 'endDate', 'date', treatment?.fecha_fin ?? '')}</div>
    <label class="check-field"><input type="checkbox" name="continuous" ${treatment?.continuo || !treatment ? 'checked' : ''}><span>Tratamiento indefinido</span></label>
    ${field('Horarios separados por coma', 'times', 'text', (treatment?.horas_programadas ?? ['08:00']).map((time) => time.slice(0, 5)).join(', '), true, 'placeholder="08:00, 20:00"')}
    <fieldset class="day-picker"><legend>Días *</legend>${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((day, index) => `<label><input type="checkbox" name="days" value="${index}" ${selectedDays.has(index) ? 'checked' : ''}><span>${day}</span></label>`).join('')}</fieldset>
    <div class="form-grid">${field('Color', 'color', 'color', safeColor(treatment?.color ?? '#22c55e'))}${field('Inventario actual', 'stock', 'number', String(treatment?.cantidad_inventario ?? 0), false, 'min="0" step="0.01"')}</div>
    <label class="form-field"><span>Indicaciones</span><textarea name="instructions" rows="3">${escapeHtml(treatment?.indicaciones ?? '')}</textarea></label>
  `, treatment ? 'Guardar cambios' : 'Crear tratamiento', async (form) => {
    const days = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="days"]:checked')).map((input) => Number(input.value));
    const times = inputValue(form, 'times').split(',').map((time) => time.trim()).filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
    if (!days.length || !times.length) throw new Error('Selecciona días y escribe al menos un horario válido.');
    const continuous = (form.elements.namedItem('continuous') as HTMLInputElement).checked;
    const startDate = inputValue(form, 'startDate'); const endDate = inputValue(form, 'endDate');
    if (!continuous && !endDate) throw new Error('Selecciona la fecha final del tratamiento.');
    const now = new Date().toISOString();
    const nextTreatment: Treatment = {
      id: treatment?.id ?? crypto.randomUUID(), nombre_tratamiento: inputValue(form, 'treatmentName'), nombre_medicamento: inputValue(form, 'medicine'),
      dosis: inputValue(form, 'dose'), indicaciones: inputValue(form, 'instructions') || null, fecha_inicio: startDate, fecha_fin: continuous ? null : endDate,
      continuo: continuous, dias_programados: days, horas_programadas: times, color: inputValue(form, 'color'), seguimiento_estricto: treatment?.seguimiento_estricto ?? false,
      inventario_activo: Number(inputValue(form, 'stock')) > 0, cantidad_inventario: Number(inputValue(form, 'stock')) || 0,
      unidades_por_toma: treatment?.unidades_por_toma ?? 1, unidad_inventario: treatment?.unidad_inventario ?? 'tabletas', umbral_inventario_bajo: treatment?.umbral_inventario_bajo ?? 5,
      estado: treatment?.estado ?? 'active',
    };
    const nextTreatments = treatment ? treatments.map((entry) => entry.id === id ? nextTreatment : entry) : [...treatments, nextTreatment];
    let nextDoses = doses;
    if (treatment) {
      const current = new Date();
      const currentMinute = `${dateKey(current)}T${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`;
      nextDoses = nextDoses.filter((dose) => dose.tratamiento_id !== id || dose.estado !== 'pending' || dose.programada_en.slice(0, 16) < currentMinute);
    }
    nextDoses = generateTreatmentDoses(nextTreatment, nextDoses);
    await syncWellness(nextTreatments, nextDoses); await loadAgenda();
  });
}

async function deleteTreatment(id: string): Promise<void> {
  await syncWellness(treatments.filter((entry) => entry.id !== id), doses.filter((dose) => dose.tratamiento_id !== id));
  await loadAgenda();
}

function generateTreatmentDoses(treatment: Treatment, current: MedicationDose[]): MedicationDose[] {
  const result = [...current]; const existing = new Set(result.map((dose) => `${dose.tratamiento_id}|${dose.programada_en}`));
  const today = startOfDay(new Date()); const rangeStart = addDays(today, -30); const rangeEnd = addDays(today, 60);
  let start = parseDateKey(treatment.fecha_inicio); if (start < rangeStart) start = rangeStart;
  let end = treatment.continuo || !treatment.fecha_fin ? rangeEnd : parseDateKey(treatment.fecha_fin); if (end > rangeEnd) end = rangeEnd;
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const day = (date.getDay() + 6) % 7; if (!treatment.dias_programados.includes(day)) continue;
    for (const time of treatment.horas_programadas) {
      const scheduled = `${dateKey(date)}T${time.slice(0, 5)}:00`; const key = `${treatment.id}|${scheduled}`; if (existing.has(key)) continue;
      existing.add(key); result.push({ id: crypto.randomUUID(), tratamiento_id: treatment.id, programada_en: scheduled, estado: 'pending', registrada_en: null, nota: null });
    }
  }
  return result.sort((a, b) => a.programada_en.localeCompare(b.programada_en));
}

async function syncWellness(nextTreatments: Treatment[], nextDoses: MedicationDose[]): Promise<void> {
  await api('/bienestar/sincronizar', { method: 'PUT', body: {
    preferencias: { advancedMode: preferences.preferencias.modo_avanzado, wellnessEnabled: preferences.preferencias.bienestar_activo },
    tratamientos: nextTreatments.map((entry) => ({ id: entry.id, treatmentName: entry.nombre_tratamiento, name: entry.nombre_medicamento, dose: entry.dosis, instructions: entry.indicaciones, startDate: entry.fecha_inicio, endDate: entry.fecha_fin, continuous: entry.continuo, schedule: { days: entry.dias_programados, times: entry.horas_programadas.map((time) => time.slice(0, 5)) }, color: entry.color, strictTracking: entry.seguimiento_estricto, stockEnabled: entry.inventario_activo, stockQuantity: entry.cantidad_inventario, doseUnits: entry.unidades_por_toma, stockUnit: entry.unidad_inventario, lowStockThreshold: entry.umbral_inventario_bajo, status: entry.estado })),
    tomas: nextDoses.map((dose) => ({ id: dose.id, treatmentId: dose.tratamiento_id, scheduledAt: dose.programada_en, status: dose.estado, recordedAt: dose.registrada_en, note: dose.nota })),
  } });
}

async function completeItem(id: string): Promise<void> {
  const item = items.find((candidate) => candidate.id_cliente === id);
  if (!item) return;
  try {
    await api('/agenda/sincronizar', { method: 'POST', body: { elementos: [{
      id_cliente: item.id_cliente, version_base: Number(item.version), titulo: item.titulo, tipo: item.tipo,
      fecha_programada: item.fecha_programada, hora_inicio: item.hora_inicio, hora_fin: item.hora_fin,
      duracion_minutos: item.duracion_minutos, color: item.color, rutina_id: item.rutina_id,
      prioridad: item.prioridad, estado: 'completada', etiqueta: item.etiqueta, favorita: item.favorita,
      repeticion: item.repeticion, serie_id: item.serie_id, fecha_ocurrencia: item.fecha_ocurrencia,
      excepciones_repeticion: item.excepciones_repeticion, padre_id: item.padre_id,
      subtareas: (item.subtareas ?? []).map((subtask, position) => ({ id_cliente: subtask.id_cliente, version_base: Number(subtask.version), titulo: subtask.titulo, completada: subtask.completada, posicion: position })),
    }] } });
    await loadAgenda();
  } catch (error) {
    message = error instanceof Error ? error.message : 'No se pudo completar la tarea.';
    renderApp();
  }
}

function filteredItems(): AgendaItem[] {
  const term = searchTerm.trim().toLocaleLowerCase('es');
  return items.filter((item) => item.estado !== 'completada' && item.estado !== 'ignorada' && (!term || `${item.titulo} ${item.etiqueta ?? ''}`.toLocaleLowerCase('es').includes(term)));
}

function moduleEmpty(title: string, description: string): string {
  return `<div class="compact-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div>`;
}

function emptyWallet(): WalletData {
  return {
    configuracion: { monto_sueldo: 0, periodicidad_pago: 'quincenal', primera_fecha_pago: '', moneda: 'MXN' },
    gastos_fijos: [],
    movimientos: [],
  };
}

function money(value: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: wallet.configuracion.moneda || 'MXN' }).format(value);
}

function formatDateKey(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || 'Sin fecha';
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(parseDateKey(value));
}

function formatServerDate(value: string): string {
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
}

function doseStatus(status: string): string {
  return ({ taken: 'Tomada', missed: 'Atrasada', skipped: 'Omitida', postponed: 'Pospuesta', pending: 'Pendiente' } as Record<string, string>)[status] ?? capitalize(status);
}

function walletStatCard(label: string, value: number, tone: string): string {
  return `<article class="stat-card ${tone}"><span>${escapeHtml(label)}</span><strong>${money(value)}</strong><i></i></article>`;
}

function statCard(label: string, value: number, tone: string): string { return `<article class="stat-card ${tone}"><span>${label}</span><strong>${value}</strong><i></i></article>`; }
function byDate(a: AgendaItem, b: AgendaItem): number { return `${a.fecha_programada ?? '9999'} ${a.hora_inicio ?? '23:59'}`.localeCompare(`${b.fecha_programada ?? '9999'} ${b.hora_inicio ?? '23:59'}`); }
function itemDate(item: AgendaItem): string { if (!item.fecha_programada) return 'Sin fecha'; const date = new Date(`${item.fecha_programada}T12:00:00`); return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(date); }
function formatItemTime(item: AgendaItem): string { const start = item.hora_inicio?.slice(0, 5); const end = item.hora_fin?.slice(0, 5); return start ? `${start}${end ? ` – ${end}` : ''}` : 'Todo el día'; }
function dateKey(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function parseDateKey(value: string): Date { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); }
function startOfDay(date: Date): Date { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function startOfWeek(date: Date): Date { const result = startOfDay(date); result.setDate(result.getDate() - ((result.getDay() + 6) % 7)); return result; }
function addDays(date: Date, amount: number): Date { const result = new Date(date); result.setDate(result.getDate() + amount); return result; }
function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
function capitalizedDate(date: Date): string { const value = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(date); return value.charAt(0).toUpperCase() + value.slice(1); }
function formatTime(date: Date): string { return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(date); }
function firstName(value: string): string { return value.trim().split(/\s+/)[0] || 'Hola'; }
function initials(value: string): string { return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function safeColor(value: string | null): string { return value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#4f8cff'; }
function readUser(): User | null { try { return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') as User | null; } catch { return null; } }
function clearSession(): void { token = null; user = null; items = []; routines = []; notes = []; treatments = []; doses = []; wallet = emptyWallet(); localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
function escapeHtml(value: string): string { const node = document.createElement('div'); node.textContent = value; return node.innerHTML; }
