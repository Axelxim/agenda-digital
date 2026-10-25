import { Injectable } from '@angular/core';
import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { Task } from './task.model';

export interface DeviceCalendar {
  id: string;
  name: string;
  accountName: string;
  color: string;
  writable: boolean;
}

interface NativeCalendarEvent {
  instanceId: string;
  eventId: string;
  calendarId: string;
  calendarName: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  color: string;
  writable: boolean;
  allDay: boolean;
  instanceStart: number;
  instanceEnd: number;
  recurring: boolean;
}

export interface DeviceCalendarTask extends Task {
  externalKind: 'birthday' | 'calendar';
  externalEventId: string;
  externalCalendarId: string;
  originalInstanceStart: number;
  originalInstanceEnd: number;
  allDay: boolean;
  writable: boolean;
  externalRecurring: boolean;
}

export function deduplicateCalendarEvents<
  T extends { title: string; date: string; startTime?: string; endTime?: string },
>(events: readonly T[]): T[] {
  const seen = new Set<string>();

  return events.filter((event) => {
    const normalizedTitle = event.title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('es-MX');
    const key = [
      event.date,
      event.startTime ?? 'all-day',
      event.endTime ?? 'all-day',
      normalizedTitle,
    ].join('|');

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface DeviceCalendarPlugin {
  checkPermissions(): Promise<{ readCalendar: PermissionState; writeCalendar: PermissionState }>;
  requestPermissions(): Promise<{ readCalendar: PermissionState; writeCalendar: PermissionState }>;
  listCalendars(): Promise<{ calendars: DeviceCalendar[] }>;
  listEvents(options: { start: number; end: number; calendarIds: string[] }): Promise<{ events: NativeCalendarEvent[] }>;
  updateEvent(options: {
    eventId: string;
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    originalInstanceStart: number;
  }): Promise<void>;
  deleteEvent(options: { eventId: string }): Promise<void>;
  createEvent(options: {
    calendarId: string;
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  }): Promise<{ eventId: string }>;
  startObserving(): Promise<void>;
  addListener(eventName: 'calendarChanged', listener: () => void): Promise<PluginListenerHandle>;
}

type PermissionState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

export interface DeviceCalendarSettings {
  enabled: boolean;
  selectedCalendarIds: string[];
  selectionConfigured: boolean;
  destinationCalendarId?: string;
}

const DeviceCalendarNative = registerPlugin<DeviceCalendarPlugin>('DeviceCalendar');

@Injectable({ providedIn: 'root' })
export class DeviceCalendarService {
  private readonly storageKey = 'agenda_device_calendars_v1';

  get supported(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  loadSettings(): DeviceCalendarSettings {
    const fallback: DeviceCalendarSettings = {
      enabled: false,
      selectedCalendarIds: [],
      selectionConfigured: false,
      destinationCalendarId: undefined,
    };
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) return fallback;

    try {
      const parsed = JSON.parse(stored) as Partial<DeviceCalendarSettings>;
      return {
        enabled: parsed.enabled === true,
        selectedCalendarIds: Array.isArray(parsed.selectedCalendarIds)
          ? parsed.selectedCalendarIds.filter((id): id is string => typeof id === 'string')
          : [],
        selectionConfigured: parsed.selectionConfigured === true,
        destinationCalendarId: typeof parsed.destinationCalendarId === 'string'
          ? parsed.destinationCalendarId
          : undefined,
      };
    } catch {
      return fallback;
    }
  }

  async requestInitialPermissions(): Promise<void> {
    if (!this.supported) return;
    try {
      await DeviceCalendarNative.requestPermissions();
    } catch (error) {
      console.warn('No fue posible solicitar los permisos de calendario.', error);
    }
  }

  saveSettings(settings: DeviceCalendarSettings): void {
    localStorage.setItem(this.storageKey, JSON.stringify(settings));
  }

  async getCalendars(requestPermission = false): Promise<{
    status: 'ready' | 'denied' | 'unavailable';
    calendars: DeviceCalendar[];
  }> {
    if (!this.supported) return { status: 'unavailable', calendars: [] };

    let permission = await DeviceCalendarNative.checkPermissions();
    if (permission.readCalendar !== 'granted' && requestPermission) {
      permission = await DeviceCalendarNative.requestPermissions();
    }
    if (permission.readCalendar !== 'granted') return { status: 'denied', calendars: [] };

    const result = await DeviceCalendarNative.listCalendars();
    return { status: 'ready', calendars: result.calendars };
  }

  async getEvents(settings: DeviceCalendarSettings, reference = new Date()): Promise<DeviceCalendarTask[]> {
    if (!this.supported || !settings.enabled || settings.selectedCalendarIds.length === 0) return [];

    const permission = await DeviceCalendarNative.checkPermissions();
    if (permission.readCalendar !== 'granted') return [];

    const start = new Date(reference.getFullYear() - 1, 0, 1).getTime();
    const end = new Date(reference.getFullYear() + 2, 0, 1).getTime();
    const result = await DeviceCalendarNative.listEvents({
      start,
      end,
      calendarIds: settings.selectedCalendarIds,
    });

    const events = [...result.events].sort((a, b) => Number(b.writable) - Number(a.writable));
    return deduplicateCalendarEvents(events).map((event) => {
      const birthday = this.isBirthday(event);
      return {
      id: this.externalTaskId(event),
      titulo: event.title || 'Evento',
      tipo: 'evento',
      fecha: event.date,
      hora: event.startTime,
      horaFin: event.endTime,
      color: birthday ? '#c45b86' : event.color || '#2563eb',
      prioridad: 'media',
      estado: 'pendiente',
      repeticion: 'none',
      externalKind: birthday ? 'birthday' : 'calendar',
      externalEventId: event.eventId,
      externalCalendarId: event.calendarId,
      originalInstanceStart: event.instanceStart,
      originalInstanceEnd: event.instanceEnd,
      allDay: event.allDay,
      writable: event.writable,
      externalRecurring: event.recurring,
      };
    });
  }

  async updateEvent(
    event: DeviceCalendarTask,
    changes: { title: string; date: string; startTime?: string; endTime?: string },
  ): Promise<void> {
    await this.requireWritePermission();
    await DeviceCalendarNative.updateEvent({
      eventId: event.externalEventId,
      title: changes.title,
      date: changes.date,
      startTime: changes.startTime,
      endTime: changes.endTime,
      originalInstanceStart: event.originalInstanceStart,
    });
  }

  async deleteEvent(event: DeviceCalendarTask): Promise<void> {
    await this.requireWritePermission();
    await DeviceCalendarNative.deleteEvent({ eventId: event.externalEventId });
  }

  async createEvent(options: {
    calendarId: string;
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  }): Promise<string> {
    await this.requireWritePermission();
    const result = await DeviceCalendarNative.createEvent(options);
    return result.eventId;
  }

  async observeChanges(listener: () => void): Promise<PluginListenerHandle | undefined> {
    if (!this.supported) return undefined;
    const handle = await DeviceCalendarNative.addListener('calendarChanged', listener);
    await DeviceCalendarNative.startObserving();
    return handle;
  }

  private async requireWritePermission(): Promise<void> {
    let permission = await DeviceCalendarNative.checkPermissions();
    if (permission.writeCalendar !== 'granted') {
      permission = await DeviceCalendarNative.requestPermissions();
    }
    if (permission.writeCalendar !== 'granted') {
      throw new Error('Se necesita permiso para modificar el calendario');
    }
  }

  private isBirthday(event: NativeCalendarEvent): boolean {
    const text = `${event.calendarName} ${event.title}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-MX');
    return /\b(cumple|cumpleanos|birthday|birthdays)\b/.test(text);
  }

  private externalTaskId(event: NativeCalendarEvent): number {
    const value = `${event.calendarId}:${event.eventId}:${event.instanceId}:${event.date}`;
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
    }
    return -(Math.abs(hash) + 1);
  }
}
