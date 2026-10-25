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
  eliminada?: boolean;
  horarios?: Array<{ dia_semana: number; hora_inicio: string; hora_fin: string }>;
}

const app = document.querySelector<HTMLDivElement>('#app')!;
const TOKEN_KEY = 'todo-en-orden-desktop-token';
const USER_KEY = 'todo-en-orden-desktop-user';
let token = localStorage.getItem(TOKEN_KEY);
let user = readUser();
let items: AgendaItem[] = [];
let routines: Routine[] = [];
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
    const [agendaResponse, routinesResponse] = await Promise.all([
      api<{ data: { elementos: AgendaItem[] } }>('/agenda'),
      api<{ data: { rutinas: Routine[] } }>('/rutinas'),
    ]);
    items = agendaResponse.data.elementos.filter((item) => !item.eliminado);
    routines = routinesResponse.data.rutinas.filter((routine) => !routine.eliminada);
    message = '';
  } catch (error) {
    message = error instanceof Error ? error.message : 'No pudimos actualizar la agenda.';
  } finally {
    loading = false;
    renderApp();
  }
}

async function api<T>(path: string, options: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
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
  const descriptions: Record<Exclude<ViewName, 'inicio' | 'agenda' | 'tareas' | 'rutinas'>, string> = {
    notas: 'Un espacio ligero para capturar ideas y convertirlas después.',
    billetera: 'Resumen de ingresos, compromisos y movimientos del periodo.',
    bienestar: 'Tratamientos, horarios y seguimiento de tu bienestar.',
  };
  const label = nav.find((entry) => entry.id === activeView)?.label ?? '';
  return `<div class="page-heading"><div><p class="eyebrow">MÓDULO</p><h1>${label}</h1><p>${descriptions[activeView as keyof typeof descriptions]}</p></div></div><section class="empty-state"><div class="empty-icon">${icons[nav.find((entry) => entry.id === activeView)?.icon ?? 'home']}</div><h2>Diseño de escritorio en preparación</h2><p>Este módulo se conectará con los mismos datos de tu cuenta sin copiar la pantalla móvil.</p></section>`;
}

function renderRoutinesPage(): string {
  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  return `<div class="page-heading"><div><p class="eyebrow">ACTIVIDADES RECURRENTES</p><h1>Rutinas</h1><p>Sincronizadas con la misma cuenta de tu aplicación móvil.</p></div><span class="count-pill">${routines.length} rutinas</span></div>
    <section class="routine-grid">${routines.length ? routines.map((routine) => `<article class="routine-card" style="--routine:${safeColor(routine.color)}"><div class="routine-icon">${icons.repeat}</div><div class="routine-info"><strong>${escapeHtml(routine.nombre)}</strong><span>${routine.hora_inicio_predeterminada.slice(0, 5)} – ${routine.hora_fin_predeterminada.slice(0, 5)}</span><div class="routine-days">${dayNames.map((day, index) => `<i class="${routine.horarios?.some((schedule) => Number(schedule.dia_semana) === index) ? 'active' : ''}">${day}</i>`).join('')}</div></div><span class="routine-status">${routine.activa ? 'Activa' : 'Pausada'}</span></article>`).join('') : '<div class="compact-empty"><strong>No hay rutinas sincronizadas</strong><span>Las rutinas creadas desde Ionic aparecerán aquí después de actualizar.</span></div>'}</section>`;
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
  return `<article class="calendar-event ${item.estado === 'completada' ? 'completed' : ''}" style="--event:${safeColor(item.color)}"><time>${formatItemTime(item)}</time><strong>${escapeHtml(item.titulo)}</strong><span>${escapeHtml(item.etiqueta ?? (item.tipo === 'evento' ? 'Evento' : 'Tarea'))}</span></article>`;
}

function calendarItems(): AgendaItem[] {
  const term = searchTerm.trim().toLocaleLowerCase('es');
  return items.filter((item) => item.fecha_programada && item.estado !== 'ignorada' && (!term || `${item.titulo} ${item.etiqueta ?? ''}`.toLocaleLowerCase('es').includes(term)));
}

function renderListPage(title: string, subtitle: string, list: AgendaItem[]): string {
  return `<div class="page-heading"><div><p class="eyebrow">TODO EN ORDEN</p><h1>${title}</h1><p>${subtitle}</p></div><span class="count-pill">${list.length} elementos</span></div><section class="panel list-panel">${renderItems(list.slice().sort(byDate))}</section>`;
}

function renderItems(list: AgendaItem[]): string {
  if (!list.length) return '<div class="compact-empty"><strong>No hay elementos aquí</strong><span>Cuando sincronices o agregues información aparecerá en esta lista.</span></div>';
  return `<div class="agenda-list">${list.map((item) => `<article class="agenda-row ${item.estado === 'vencida' ? 'overdue' : ''}"><button class="check-button" data-complete="${escapeHtml(item.id_cliente)}" title="Marcar como completada">${icons.check}</button><span class="item-dot" style="--item-color:${safeColor(item.color)}"></span><div class="item-main"><strong>${escapeHtml(item.titulo)}</strong><span>${escapeHtml(item.etiqueta ?? (item.tipo === 'evento' ? 'Evento' : 'Tarea'))}</span></div><time>${itemDate(item)}<b>${formatItemTime(item)}</b></time></article>`).join('')}</div>`;
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
function clearSession(): void { token = null; user = null; items = []; routines = []; localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
function escapeHtml(value: string): string { const node = document.createElement('div'); node.textContent = value; return node.innerHTML; }
