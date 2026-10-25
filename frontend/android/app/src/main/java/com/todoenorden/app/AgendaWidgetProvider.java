package com.todoenorden.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ContentValues;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;
import org.json.JSONArray;

import java.io.File;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

public class AgendaWidgetProvider extends AppWidgetProvider {
    static final String ACTION_COMPLETE_TASK = "com.todoenorden.app.ACTION_WIDGET_COMPLETE_TASK";
    static final String EXTRA_TASK_ID = "taskId";
    private static final DateTimeFormatter DATE_LABEL = DateTimeFormatter.ofPattern("d MMM", new Locale("es", "MX"));

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int widgetId : widgetIds) updateWidget(context, manager, widgetId);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_COMPLETE_TASK.equals(intent.getAction())) {
            long taskId = intent.getLongExtra(EXTRA_TASK_ID, Long.MIN_VALUE);
            if (taskId != Long.MIN_VALUE && completeTask(context, taskId)) {
                AgendaReminderPlugin.cancelTaskReminders(context, taskId);
            }
            updateAllWidgets(context);
            return;
        }
        super.onReceive(context, intent);
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, AgendaWidgetProvider.class);
        int[] widgetIds = manager.getAppWidgetIds(provider);
        for (int widgetId : widgetIds) updateWidget(context, manager, widgetId);
        manager.notifyAppWidgetViewDataChanged(widgetIds, R.id.widget_task_list);
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.agenda_widget);
        WidgetAgenda agenda = loadAgenda(context);
        bindNextEvent(context, views, agenda.nextEvent);

        Intent serviceIntent = new Intent(context, AgendaWidgetService.class)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            .setData(Uri.parse("todoenorden://widget/list/" + widgetId));
        views.setRemoteAdapter(R.id.widget_task_list, serviceIntent);

        Intent complete = new Intent(context, AgendaWidgetProvider.class)
            .setAction(ACTION_COMPLETE_TASK)
            .setData(Uri.parse("todoenorden://widget/complete/" + widgetId));
        PendingIntent completionTemplate = PendingIntent.getBroadcast(
            context,
            5100 + widgetId,
            complete,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
        );
        views.setPendingIntentTemplate(R.id.widget_task_list, completionTemplate);

        Intent openApp = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            4100,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
        manager.updateAppWidget(widgetId, views);
        manager.notifyAppWidgetViewDataChanged(widgetId, R.id.widget_task_list);
    }

    private static void bindNextEvent(Context context, RemoteViews views, WidgetTask event) {
        if (event == null) {
            views.setTextViewText(R.id.widget_event_title, "Sin eventos próximos");
            views.setTextViewText(R.id.widget_event_time, "Tu agenda está libre");
            views.setTextColor(R.id.widget_event_title, context.getColor(R.color.widget_text_primary));
            return;
        }
        views.setTextViewText(R.id.widget_event_title, event.title);
        views.setTextViewText(R.id.widget_event_time, event.eventLabel());
        views.setTextColor(R.id.widget_event_title, event.accentColor);
    }

    private static boolean completeTask(Context context, long taskId) {
        File databaseFile = context.getDatabasePath("agenda.db");
        if (!databaseFile.exists()) return false;
        try (SQLiteDatabase database = SQLiteDatabase.openDatabase(
            databaseFile.getPath(), null, SQLiteDatabase.OPEN_READWRITE
        )) {
            database.beginTransaction();
            try (Cursor cursor = database.query(
                "tasks",
                new String[]{"uuid", "payload", "version"},
                "local_id = ? AND deleted_at IS NULL",
                new String[]{String.valueOf(taskId)},
                null,
                null,
                null,
                "1"
            )) {
                if (!cursor.moveToFirst()) return false;
                String uuid = cursor.getString(0);
                JSONObject task = new JSONObject(cursor.getString(1));
                int version = Math.max(1, cursor.getInt(2)) + 1;
                if (!"tarea".equals(task.optString("tipo")) || "completada".equals(task.optString("estado"))) {
                    return false;
                }

                String updatedAt = java.time.Instant.now().toString();
                task.put("uuid", uuid);
                task.put("estado", "completada");
                task.put("updatedAt", updatedAt);
                task.put("version", version);
                task.put("syncStatus", "pending");

                ContentValues values = new ContentValues();
                values.put("payload", task.toString());
                values.put("updated_at", updatedAt);
                values.put("version", version);
                values.put("sync_status", "pending");
                database.update("tasks", values, "uuid = ?", new String[]{uuid});
                ensureNextOccurrence(database, task);
                database.setTransactionSuccessful();
                return true;
            } finally {
                database.endTransaction();
            }
        } catch (Exception ignored) {
            return false;
        }
    }

    private static void ensureNextOccurrence(SQLiteDatabase database, JSONObject task) throws Exception {
        String repetition = task.optString("repeticion", "none");
        String rawDate = task.optString("fecha", "");
        if ("none".equals(repetition) || rawDate.isEmpty()) return;

        LocalDate sourceDate = LocalDate.parse(rawDate);
        LocalDate nextDate;
        if ("daily".equals(repetition)) nextDate = sourceDate.plusDays(1);
        else if ("weekly".equals(repetition)) nextDate = sourceDate.plusWeeks(1);
        else if ("monthly".equals(repetition)) nextDate = sourceDate.plusMonths(1);
        else return;

        String seriesId = task.optString("seriesId", "");
        if (seriesId.isEmpty()) seriesId = "serie-" + task.optLong("id");
        if (occurrenceExists(database, seriesId, nextDate.toString())) return;

        long localId = System.currentTimeMillis();
        while (localIdExists(database, localId)) localId += 1;
        String uuid = UUID.randomUUID().toString();
        String now = java.time.Instant.now().toString();
        JSONObject next = new JSONObject(task.toString());
        next.put("id", localId);
        next.put("uuid", uuid);
        next.put("fecha", nextDate.toString());
        next.put("estado", "pendiente");
        next.put("seriesId", seriesId);
        next.put("occurrenceDate", nextDate.toString());
        next.remove("parentId");
        next.put("createdAt", now);
        next.put("updatedAt", now);
        next.put("version", 1);
        next.put("syncStatus", "pending");
        JSONArray subtasks = next.optJSONArray("subtasks");
        if (subtasks != null) {
            for (int index = 0; index < subtasks.length(); index++) {
                subtasks.getJSONObject(index).put("completed", false);
            }
        }

        ContentValues values = new ContentValues();
        values.put("local_id", localId);
        values.put("uuid", uuid);
        values.put("payload", next.toString());
        values.put("created_at", now);
        values.put("updated_at", now);
        values.putNull("deleted_at");
        values.put("version", 1);
        values.put("sync_status", "pending");
        database.insertWithOnConflict("tasks", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static boolean occurrenceExists(SQLiteDatabase database, String seriesId, String date) throws Exception {
        try (Cursor cursor = database.query(
            "tasks", new String[]{"payload"}, "deleted_at IS NULL", null, null, null, null
        )) {
            while (cursor.moveToNext()) {
                JSONObject candidate = new JSONObject(cursor.getString(0));
                if (seriesId.equals(candidate.optString("seriesId")) && date.equals(candidate.optString("fecha"))) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean localIdExists(SQLiteDatabase database, long localId) {
        try (Cursor cursor = database.query(
            "tasks", new String[]{"local_id"}, "local_id = ?", new String[]{String.valueOf(localId)}, null, null, null, "1"
        )) {
            return cursor.moveToFirst();
        }
    }

    static WidgetAgenda loadAgenda(Context context) {
        WidgetAgenda agenda = new WidgetAgenda();
        File databaseFile = context.getDatabasePath("agenda.db");
        if (!databaseFile.exists()) return agenda;

        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();
        try (SQLiteDatabase database = SQLiteDatabase.openDatabase(
            databaseFile.getPath(), null, SQLiteDatabase.OPEN_READONLY
        ); Cursor cursor = database.query(
            "tasks", new String[]{"payload"}, "deleted_at IS NULL", null, null, null, "local_id ASC"
        )) {
            List<WidgetTask> futureEvents = new ArrayList<>();
            while (cursor.moveToNext()) {
                WidgetTask task = WidgetTask.fromJson(new JSONObject(cursor.getString(0)));
                if (task == null || !"pendiente".equals(task.status)) continue;
                if ("evento".equals(task.type) && task.date != null) {
                    LocalDateTime eventDateTime = task.dateTime();
                    if (eventDateTime != null && !eventDateTime.isBefore(now)) futureEvents.add(task);
                    continue;
                }
                if (!"tarea".equals(task.type)) continue;
                if (task.date == null) agenda.pending.add(task);
                else if (today.equals(task.date)) agenda.today.add(task);
            }

            futureEvents.sort(Comparator.comparing(WidgetTask::dateTime));
            agenda.nextEvent = futureEvents.isEmpty() ? null : futureEvents.get(0);
            agenda.pending.sort(WidgetTask.PENDING_ORDER);
            agenda.today.sort(WidgetTask.TODAY_ORDER);
        } catch (Exception ignored) {
            // Keep the widget usable while the database is being created or updated.
        }
        return agenda;
    }

    static final class WidgetAgenda {
        WidgetTask nextEvent;
        final List<WidgetTask> pending = new ArrayList<>();
        final List<WidgetTask> today = new ArrayList<>();
    }

    static final class WidgetTask {
        static final Comparator<WidgetTask> PENDING_ORDER = Comparator
            .comparing((WidgetTask task) -> !task.favorite)
            .thenComparingInt(task -> task.priorityOrder)
            .thenComparingLong(task -> task.id);
        static final Comparator<WidgetTask> TODAY_ORDER = Comparator
            .comparing((WidgetTask task) -> task.time.isEmpty())
            .thenComparing(task -> task.time)
            .thenComparingLong(task -> task.id);

        final long id;
        final String title;
        final String type;
        final String status;
        final LocalDate date;
        final String time;
        final boolean favorite;
        final int priorityOrder;
        final int accentColor;

        WidgetTask(long id, String title, String type, String status, LocalDate date, String time, boolean favorite, int priorityOrder, int accentColor) {
            this.id = id;
            this.title = title;
            this.type = type;
            this.status = status;
            this.date = date;
            this.time = time;
            this.favorite = favorite;
            this.priorityOrder = priorityOrder;
            this.accentColor = accentColor;
        }

        static WidgetTask fromJson(JSONObject value) {
            String title = value.optString("titulo", "").trim();
            if (title.isEmpty()) return null;
            LocalDate date = null;
            String rawDate = value.optString("fecha", "").trim();
            try {
                if (!rawDate.isEmpty()) date = LocalDate.parse(rawDate);
            } catch (Exception ignored) {
                return null;
            }
            String priority = value.optString("prioridad", "media");
            int priorityOrder = "alta".equals(priority) ? 0 : "media".equals(priority) ? 1 : 2;
            int accentColor = taskColor(value, priority);
            return new WidgetTask(
                value.optLong("id", 0),
                title,
                value.optString("tipo", "tarea"),
                value.optString("estado", "pendiente"),
                date,
                value.optString("hora", "").trim(),
                value.optBoolean("favorita", false),
                priorityOrder,
                accentColor
            );
        }

        private static int taskColor(JSONObject value, String priority) {
            String customColor = value.optString("color", "").trim();
            if (!customColor.isEmpty()) {
                try {
                    return Color.parseColor(customColor);
                } catch (IllegalArgumentException ignored) {
                    // Continue with the label or priority color.
                }
            }
            String label = value.optString("etiqueta", "");
            if ("Universidad".equals(label)) return Color.parseColor("#EF4444");
            if ("Trabajo".equals(label)) return Color.parseColor("#F97316");
            if ("Personal".equals(label)) return Color.parseColor("#16A34A");
            if ("Salud".equals(label)) return Color.parseColor("#3B82F6");
            if ("Ocio".equals(label)) return Color.parseColor("#8B5CF6");
            if ("alta".equals(priority)) return Color.parseColor("#EF4444");
            if ("baja".equals(priority)) return Color.parseColor("#10B981");
            return Color.parseColor("#F59E0B");
        }

        LocalDateTime dateTime() {
            if (date == null) return null;
            LocalTime localTime = LocalTime.MAX;
            try {
                if (!time.isEmpty()) localTime = LocalTime.parse(time);
            } catch (Exception ignored) {
                localTime = LocalTime.MAX;
            }
            return LocalDateTime.of(date, localTime);
        }

        String eventLabel() {
            LocalDate today = LocalDate.now();
            String day = date.equals(today)
                ? "Hoy"
                : date.equals(today.plusDays(1)) ? "Mañana" : DATE_LABEL.format(date);
            return time.isEmpty() ? day : day + " · " + time;
        }
    }
}
