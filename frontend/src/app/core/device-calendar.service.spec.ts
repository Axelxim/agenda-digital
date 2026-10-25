import { deduplicateCalendarEvents } from './device-calendar.service';

describe('DeviceCalendarService', () => {
  it('deduplicates matching events received from different calendars', () => {
    const events = deduplicateCalendarEvents([
      { title: 'Día de la Raza', date: '2026-10-12', color: '#2563eb' },
      { title: 'DIA  DE LA RAZA', date: '2026-10-12', color: '#16a34a' },
      { title: 'Day of Race', date: '2026-10-12', color: '#f97316' },
    ]);

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.title)).toEqual(['Día de la Raza', 'Day of Race']);
  });

  it('keeps events with the same title when their schedule differs', () => {
    const events = deduplicateCalendarEvents([
      { title: 'Clase', date: '2026-10-12', startTime: '09:00', endTime: '10:00' },
      { title: 'Clase', date: '2026-10-12', startTime: '11:00', endTime: '12:00' },
    ]);

    expect(events).toHaveLength(2);
  });
});
