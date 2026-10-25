package com.todoenorden.app;

import android.Manifest;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.ContentObserver;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.CalendarContract;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "DeviceCalendar",
    permissions = {
        @Permission(alias = "readCalendar", strings = { Manifest.permission.READ_CALENDAR }),
        @Permission(alias = "writeCalendar", strings = { Manifest.permission.WRITE_CALENDAR })
    }
)
public class DeviceCalendarPlugin extends Plugin {
    private static final DateTimeFormatter DATE = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");
    private ContentObserver calendarObserver;

    @PluginMethod
    public void listCalendars(PluginCall call) {
        JSArray calendars = new JSArray();
        String[] projection = {
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.ACCOUNT_NAME,
            CalendarContract.Calendars.CALENDAR_COLOR,
            CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL
        };
        String selection = CalendarContract.Calendars.VISIBLE + "=1 AND " + CalendarContract.Calendars.SYNC_EVENTS + "=1";

        try (Cursor cursor = getContext().getContentResolver().query(
            CalendarContract.Calendars.CONTENT_URI,
            projection,
            selection,
            null,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME + " COLLATE NOCASE"
        )) {
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    JSObject calendar = new JSObject();
                    calendar.put("id", String.valueOf(cursor.getLong(0)));
                    calendar.put("name", valueOrDefault(cursor.getString(1), "Calendario"));
                    calendar.put("accountName", valueOrDefault(cursor.getString(2), ""));
                    calendar.put("color", colorToHex(cursor.getInt(3)));
                    calendar.put("writable", cursor.getInt(4) >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR);
                    calendars.put(calendar);
                }
            }
            JSObject result = new JSObject();
            result.put("calendars", calendars);
            call.resolve(result);
        } catch (SecurityException error) {
            call.reject("No se concedió acceso al calendario", error);
        } catch (Exception error) {
            call.reject("No fue posible leer los calendarios", error);
        }
    }

    @PluginMethod
    public void listEvents(PluginCall call) {
        Long start = call.getLong("start");
        Long end = call.getLong("end");
        JSArray requestedIds = call.getArray("calendarIds");
        if (start == null || end == null || requestedIds == null) {
            call.reject("El rango y los calendarios son obligatorios");
            return;
        }

        List<String> calendarIds = new ArrayList<>();
        try {
            for (Object value : requestedIds.toList()) calendarIds.add(String.valueOf(value));
        } catch (Exception error) {
            call.reject("La selección de calendarios no es válida", error);
            return;
        }
        if (calendarIds.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("events", new JSArray());
            call.resolve(empty);
            return;
        }

        Uri.Builder builder = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(builder, start);
        ContentUris.appendId(builder, end);
        String placeholders = String.join(",", java.util.Collections.nCopies(calendarIds.size(), "?"));
        String selection = CalendarContract.Instances.CALENDAR_ID + " IN (" + placeholders + ")";
        String[] projection = {
            CalendarContract.Instances._ID,
            CalendarContract.Instances.EVENT_ID,
            CalendarContract.Instances.CALENDAR_ID,
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.DISPLAY_COLOR,
            CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
            CalendarContract.Instances.CALENDAR_ACCESS_LEVEL,
            CalendarContract.Instances.RRULE
        };

        JSArray events = new JSArray();
        try (Cursor cursor = getContext().getContentResolver().query(
            builder.build(),
            projection,
            selection,
            calendarIds.toArray(new String[0]),
            CalendarContract.Instances.BEGIN + " ASC"
        )) {
            if (cursor != null) {
                ZoneId localZone = ZoneId.systemDefault();
                while (cursor.moveToNext()) {
                    long begin = cursor.getLong(4);
                    long finish = cursor.getLong(5);
                    boolean allDay = cursor.getInt(6) == 1;
                    LocalDate date = Instant.ofEpochMilli(begin)
                        .atZone(allDay ? ZoneOffset.UTC : localZone)
                        .toLocalDate();

                    JSObject event = new JSObject();
                    event.put("instanceId", cursor.getString(0));
                    event.put("eventId", cursor.getString(1));
                    event.put("calendarId", cursor.getString(2));
                    event.put("calendarName", valueOrDefault(cursor.getString(8), "Calendario"));
                    event.put("title", valueOrDefault(cursor.getString(3), "Evento"));
                    event.put("date", DATE.format(date));
                    event.put("color", colorToHex(cursor.getInt(7)));
                    event.put("writable", cursor.getInt(9) >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR);
                    event.put("allDay", allDay);
                    event.put("instanceStart", begin);
                    event.put("instanceEnd", finish);
                    event.put("recurring", cursor.getString(10) != null && !cursor.getString(10).isEmpty());
                    if (!allDay) {
                        event.put("startTime", TIME.format(Instant.ofEpochMilli(begin).atZone(localZone)));
                        event.put("endTime", TIME.format(Instant.ofEpochMilli(finish).atZone(localZone)));
                    }
                    events.put(event);
                }
            }
            JSObject result = new JSObject();
            result.put("events", events);
            call.resolve(result);
        } catch (SecurityException error) {
            call.reject("No se concedió acceso al calendario", error);
        } catch (Exception error) {
            call.reject("No fue posible leer los eventos", error);
        }
    }

    @PluginMethod
    public void updateEvent(PluginCall call) {
        if (!canWrite(call)) return;
        String eventId = call.getString("eventId");
        String title = call.getString("title");
        String dateValue = call.getString("date");
        Long originalInstanceStart = call.getLong("originalInstanceStart");
        if (eventId == null || title == null || dateValue == null || originalInstanceStart == null) {
            call.reject("Faltan datos para actualizar el evento");
            return;
        }

        Uri eventUri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, Long.parseLong(eventId));
        String[] projection = {
            CalendarContract.Events.DTSTART,
            CalendarContract.Events.RRULE,
            CalendarContract.Events.CALENDAR_ACCESS_LEVEL
        };
        try (Cursor cursor = getContext().getContentResolver().query(eventUri, projection, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) {
                call.reject("El evento ya no está disponible");
                return;
            }
            if (cursor.getInt(2) < CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR) {
                call.reject("Este calendario es de solo lectura");
                return;
            }

            String startTime = call.getString("startTime");
            String endTime = call.getString("endTime");
            boolean allDay = startTime == null || startTime.isEmpty() || endTime == null || endTime.isEmpty();
            LocalDate date = LocalDate.parse(dateValue, DATE);
            ZoneId zone = ZoneId.systemDefault();
            long newInstanceStart;
            long newInstanceEnd;
            if (allDay) {
                newInstanceStart = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli();
                newInstanceEnd = date.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli();
            } else {
                newInstanceStart = LocalDateTime.parse(dateValue + "T" + startTime).atZone(zone).toInstant().toEpochMilli();
                newInstanceEnd = LocalDateTime.parse(dateValue + "T" + endTime).atZone(zone).toInstant().toEpochMilli();
            }

            long masterStart = cursor.getLong(0);
            long updatedMasterStart = masterStart + (newInstanceStart - originalInstanceStart);
            long durationMillis = Math.max(60_000L, newInstanceEnd - newInstanceStart);
            boolean recurring = cursor.getString(1) != null && !cursor.getString(1).isEmpty();

            ContentValues values = new ContentValues();
            values.put(CalendarContract.Events.TITLE, title.trim());
            values.put(CalendarContract.Events.DTSTART, updatedMasterStart);
            values.put(CalendarContract.Events.ALL_DAY, allDay ? 1 : 0);
            values.put(CalendarContract.Events.EVENT_TIMEZONE, allDay ? "UTC" : zone.getId());
            if (recurring) {
                values.putNull(CalendarContract.Events.DTEND);
                values.put(CalendarContract.Events.DURATION, allDay
                    ? "P" + Math.max(1L, durationMillis / 86_400_000L) + "D"
                    : "PT" + Math.max(60L, durationMillis / 1000L) + "S");
            } else {
                values.put(CalendarContract.Events.DTEND, updatedMasterStart + durationMillis);
                values.putNull(CalendarContract.Events.DURATION);
            }

            int updated = getContext().getContentResolver().update(eventUri, values, null, null);
            if (updated == 0) call.reject("No fue posible actualizar el evento"); else call.resolve();
        } catch (Exception error) {
            call.reject("No fue posible actualizar el evento", error);
        }
    }

    @PluginMethod
    public void deleteEvent(PluginCall call) {
        if (!canWrite(call)) return;
        String eventId = call.getString("eventId");
        if (eventId == null) {
            call.reject("El evento es obligatorio");
            return;
        }

        Uri eventUri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, Long.parseLong(eventId));
        String[] projection = { CalendarContract.Events.CALENDAR_ACCESS_LEVEL };
        try (Cursor cursor = getContext().getContentResolver().query(eventUri, projection, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) {
                call.reject("El evento ya no está disponible");
                return;
            }
            if (cursor.getInt(0) < CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR) {
                call.reject("Este calendario es de solo lectura");
                return;
            }
            int deleted = getContext().getContentResolver().delete(eventUri, null, null);
            if (deleted == 0) call.reject("No fue posible eliminar el evento"); else call.resolve();
        } catch (Exception error) {
            call.reject("No fue posible eliminar el evento", error);
        }
    }

    @PluginMethod
    public void createEvent(PluginCall call) {
        if (!canWrite(call)) return;
        String calendarId = call.getString("calendarId");
        String title = call.getString("title");
        String dateValue = call.getString("date");
        String recurrence = call.getString("recurrence", "none");
        if (calendarId == null || title == null || dateValue == null) {
            call.reject("Faltan datos para crear el evento");
            return;
        }

        try {
            long calendarIdValue = Long.parseLong(calendarId);
            if (!isCalendarWritable(calendarIdValue)) {
                call.reject("El calendario seleccionado es de solo lectura");
                return;
            }

            String startTime = call.getString("startTime");
            String endTime = call.getString("endTime");
            boolean allDay = startTime == null || startTime.isEmpty() || endTime == null || endTime.isEmpty();
            LocalDate date = LocalDate.parse(dateValue, DATE);
            ZoneId zone = ZoneId.systemDefault();
            long start;
            long end;
            if (allDay) {
                start = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli();
                end = date.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli();
            } else {
                start = LocalDateTime.parse(dateValue + "T" + startTime).atZone(zone).toInstant().toEpochMilli();
                end = LocalDateTime.parse(dateValue + "T" + endTime).atZone(zone).toInstant().toEpochMilli();
            }
            long durationMillis = Math.max(60_000L, end - start);

            ContentValues values = new ContentValues();
            values.put(CalendarContract.Events.CALENDAR_ID, calendarIdValue);
            values.put(CalendarContract.Events.TITLE, title.trim());
            values.put(CalendarContract.Events.DTSTART, start);
            values.put(CalendarContract.Events.ALL_DAY, allDay ? 1 : 0);
            values.put(CalendarContract.Events.EVENT_TIMEZONE, allDay ? "UTC" : zone.getId());
            String rule = recurrenceRule(recurrence);
            if (rule == null) {
                values.put(CalendarContract.Events.DTEND, end);
            } else {
                values.put(CalendarContract.Events.RRULE, rule);
                values.put(CalendarContract.Events.DURATION, allDay
                    ? "P" + Math.max(1L, durationMillis / 86_400_000L) + "D"
                    : "PT" + Math.max(60L, durationMillis / 1000L) + "S");
            }

            Uri created = getContext().getContentResolver().insert(CalendarContract.Events.CONTENT_URI, values);
            if (created == null) {
                call.reject("No fue posible crear el evento");
                return;
            }
            JSObject result = new JSObject();
            result.put("eventId", String.valueOf(ContentUris.parseId(created)));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No fue posible crear el evento", error);
        }
    }

    @PluginMethod
    public void startObserving(PluginCall call) {
        if (calendarObserver == null) {
            calendarObserver = new ContentObserver(new Handler(Looper.getMainLooper())) {
                @Override
                public void onChange(boolean selfChange, Uri uri) {
                    notifyListeners("calendarChanged", new JSObject());
                }
            };
            getContext().getContentResolver().registerContentObserver(
                CalendarContract.Events.CONTENT_URI,
                true,
                calendarObserver
            );
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (calendarObserver != null) {
            getContext().getContentResolver().unregisterContentObserver(calendarObserver);
            calendarObserver = null;
        }
        super.handleOnDestroy();
    }

    private boolean isCalendarWritable(long calendarId) {
        Uri uri = ContentUris.withAppendedId(CalendarContract.Calendars.CONTENT_URI, calendarId);
        String[] projection = { CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL };
        try (Cursor cursor = getContext().getContentResolver().query(uri, projection, null, null, null)) {
            return cursor != null && cursor.moveToFirst()
                && cursor.getInt(0) >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR;
        }
    }

    private String recurrenceRule(String recurrence) {
        switch (recurrence) {
            case "daily": return "FREQ=DAILY";
            case "weekly": return "FREQ=WEEKLY";
            case "monthly": return "FREQ=MONTHLY";
            case "yearly": return "FREQ=YEARLY";
            default: return null;
        }
    }

    private boolean canWrite(PluginCall call) {
        if (getPermissionState("writeCalendar") == PermissionState.GRANTED) return true;
        call.reject("No se concedió permiso para modificar el calendario");
        return false;
    }

    private String valueOrDefault(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value;
    }

    private String colorToHex(int color) {
        return String.format("#%06X", 0xFFFFFF & color);
    }
}
