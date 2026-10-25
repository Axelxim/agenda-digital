import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Task } from './task.model';

export interface GoogleCalendarConnection {
  connected: boolean;
  connectedAt: string | null;
  selectedCalendarIds: string[];
}

export interface GoogleCalendarItem {
  id: string;
  name: string;
  color: string;
  primary: boolean;
  selected: boolean;
  accessRole: string;
}

interface GoogleCalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  startDateTime?: string | null;
  endDateTime?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status: string;
  htmlLink?: string | null;
}

export interface GoogleCalendarTask extends Task {
  googleCalendarEvent: true;
  googleEventId: string;
  googleCalendarId: string;
  googleEventUrl?: string;
  allDay: boolean;
}

@Injectable({ providedIn: 'root' })
export class GoogleCalendarService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/integraciones/google-calendar`;

  async status(): Promise<GoogleCalendarConnection> {
    const response = await firstValueFrom(this.http.get<{ data: GoogleCalendarConnection }>(`${this.baseUrl}/estado`));
    return response.data;
  }

  async connect(): Promise<void> {
    const response = await firstValueFrom(this.http.post<{
      data: { authorizationUrl: string };
    }>(`${this.baseUrl}/autorizar`, {}));
    window.location.assign(response.data.authorizationUrl);
  }

  async calendars(): Promise<GoogleCalendarItem[]> {
    const response = await firstValueFrom(this.http.get<{
      data: { calendars: GoogleCalendarItem[] };
    }>(`${this.baseUrl}/calendarios`));
    return response.data.calendars;
  }

  async selectCalendars(calendarIds: string[]): Promise<void> {
    await firstValueFrom(this.http.put(`${this.baseUrl}/calendarios`, { calendarIds }));
  }

  async events(from: string, to: string): Promise<GoogleCalendarTask[]> {
    const params = new HttpParams().set('from', from).set('to', to);
    const response = await firstValueFrom(this.http.get<{
      data: { events: GoogleCalendarEvent[] };
    }>(`${this.baseUrl}/eventos`, { params }));
    return response.data.events
      .filter((event) => event.status !== 'cancelled')
      .map((event) => this.toTask(event));
  }

  async disconnect(): Promise<void> {
    await firstValueFrom(this.http.delete(this.baseUrl));
  }

  private toTask(event: GoogleCalendarEvent): GoogleCalendarTask {
    const start = event.startDateTime ? new Date(event.startDateTime) : null;
    const end = event.endDateTime ? new Date(event.endDateTime) : null;
    const date = start ? this.localDate(start) : (event.startDate ?? this.localDate(new Date()));
    return {
      id: this.externalId(`${event.calendarId}:${event.id}:${event.startDateTime ?? event.startDate ?? ''}`),
      titulo: event.title || 'Evento de Google',
      tipo: 'evento',
      fecha: date,
      hora: start ? this.localTime(start) : undefined,
      horaFin: end ? this.localTime(end) : undefined,
      color: '#4285f4',
      prioridad: 'media',
      estado: 'pendiente',
      repeticion: 'none',
      googleCalendarEvent: true,
      googleEventId: event.id,
      googleCalendarId: event.calendarId,
      googleEventUrl: event.htmlLink ?? undefined,
      allDay: !start,
    };
  }

  private localDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private localTime(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  private externalId(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
    }
    return -(1_000_000_000 + Math.abs(hash));
  }
}
