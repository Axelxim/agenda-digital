package com.todoenorden.app;

import android.app.ActivityOptions;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.util.Set;

public class ReminderAlarmService extends Service {
    private static final String TAG = "AgendaReminder";
    static final String ACTION_START = "com.todoenorden.app.START_REMINDER_ALARM";
    static final String ACTION_STOP = "com.todoenorden.app.STOP_REMINDER_ALARM";
    private static final String ACTION_SCREEN_VISIBLE = "com.todoenorden.app.REMINDER_SCREEN_VISIBLE";

    private static final String CHANNEL_ID = "agenda-urgent-alarm-v2";
    private static final String QUIET_CHANNEL_ID = "agenda-active-alarm-v1";
    private static final int SERVICE_NOTIFICATION_ID = 76001;
    private static final String ACTIVE_PREFS = "agenda_active_alarm";
    private static final String ACTIVE_ID = "activeId";
    private static final String LOCAL_ID = "LocalNotificationId";
    private static final String LOCAL_ACTION = "LocalNotificationUserAction";
    private static final String LOCAL_OBJECT = "LocalNotficationObject";

    private MediaPlayer player;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private JSONObject activeReminder;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopSelfSafely();
            return START_NOT_STICKY;
        }

        if (ACTION_SCREEN_VISIBLE.equals(intent.getAction())) {
            moveNotificationToQuietChannel();
            return START_NOT_STICKY;
        }

        String raw = intent.getStringExtra(AgendaReminderPlugin.EXTRA_REMINDER);
        if (raw == null || raw.isEmpty()) {
            stopSelfSafely();
            return START_NOT_STICKY;
        }

        try {
            JSONObject reminder = new JSONObject(raw);
            activeReminder = reminder;
            int reminderId = reminder.optInt("id");
            Log.i(TAG, "Alarm service started id=" + reminderId + " at=" + System.currentTimeMillis());
            getSharedPreferences(ACTIVE_PREFS, MODE_PRIVATE)
                .edit()
                .putInt(ACTIVE_ID, reminderId)
                .apply();

            PendingIntent screenIntent = createScreenIntent(reminder);
            startForeground(SERVICE_NOTIFICATION_ID, buildNotification(reminder, screenIntent));
            stopAlertEffects();
            acquireWakeLock();
            startAlarmSound();
            startVibration();
            openReminderScreen(screenIntent);
        } catch (Exception ignored) {
            stopSelfSafely();
        }

        return START_NOT_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        stopAlertEffects();
        getSharedPreferences(ACTIVE_PREFS, MODE_PRIVATE).edit().remove(ACTIVE_ID).apply();
        super.onDestroy();
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, ReminderAlarmService.class));
    }

    static void markScreenVisible(Context context) {
        Intent intent = new Intent(context, ReminderAlarmService.class);
        intent.setAction(ACTION_SCREEN_VISIBLE);
        context.startService(intent);
    }

    static void stopIfActive(Context context, Set<Integer> reminderIds) {
        int activeId = context.getSharedPreferences(ACTIVE_PREFS, MODE_PRIVATE)
            .getInt(ACTIVE_ID, Integer.MIN_VALUE);
        if (reminderIds.contains(activeId)) stop(context);
    }

    private android.app.Notification buildNotification(JSONObject reminder, PendingIntent screenIntent) {
        String title = reminder.optString("taskTitle", "Esta tarea");
        boolean medication = "medication".equals(reminder.optString("kind"));
        boolean wallet = "wallet".equals(reminder.optString("kind"));
        String notificationTitle = medication ? "Hora de tomar " + title : wallet ? "Pago pendiente: " + title : title + " est\u00e1 pendiente";
        String notificationText = medication
            ? "\u00bfYa lo tomaste? Toca para abrir el recordatorio."
            : wallet ? "Toca para ver el tiempo restante." : "\u00bfYa la hiciste? Toca para ver el tiempo restante.";
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setColor(Color.rgb(59, 130, 246))
            .setContentTitle(notificationTitle)
            .setContentText(notificationText)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(
                medication ? notificationTitle + ". \u00bfYa lo tomaste?" : wallet ? notificationTitle : title + " est\u00e1 pendiente. \u00bfYa la hiciste?"
            ))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(screenIntent)
            .setFullScreenIntent(screenIntent, true);

        if (!medication && !wallet) {
            addAction(builder, reminder, "complete", "Hecho", 101);
            addAction(builder, reminder, "snooze", "Posponer", 202);
            addAction(builder, reminder, "discard", "Descartar", 303);
        }
        return builder.build();
    }

    private android.app.Notification buildQuietNotification(JSONObject reminder, PendingIntent screenIntent) {
        String title = reminder.optString("taskTitle", "Recordatorio activo");
        return new NotificationCompat.Builder(this, QUIET_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setColor(Color.rgb(59, 130, 246))
            .setContentTitle(title)
            .setContentText("Recordatorio en pantalla")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(screenIntent)
            .build();
    }

    private void moveNotificationToQuietChannel() {
        if (activeReminder == null) return;
        PendingIntent screenIntent = createScreenIntent(activeReminder);
        startForeground(
            SERVICE_NOTIFICATION_ID,
            buildQuietNotification(activeReminder, screenIntent)
        );
    }

    private PendingIntent createScreenIntent(JSONObject reminder) {
        int id = reminder.optInt("id");
        Intent intent = new Intent(this, ReminderActivity.class);
        intent.setData(Uri.parse("agenda-reminder://screen/" + id));
        intent.putExtra("kind", reminder.optString("kind", "task"));
        intent.putExtra("taskTitle", reminder.optString("taskTitle"));
        intent.putExtra("label", reminder.optString("label"));
        intent.putExtra("dueAt", reminder.optLong("dueAt"));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            this,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void openReminderScreen(PendingIntent screenIntent) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                Bundle options = ActivityOptions.makeBasic()
                    .setPendingIntentBackgroundActivityStartMode(
                        ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
                    )
                    .toBundle();
                screenIntent.send(this, 0, null, null, null, null, options);
            } else {
                screenIntent.send();
            }
        } catch (PendingIntent.CanceledException ignored) {
        }
    }

    private void addAction(
        NotificationCompat.Builder builder,
        JSONObject reminder,
        String action,
        String title,
        int salt
    ) {
        int id = reminder.optInt("id");
        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra(LOCAL_ID, id);
        intent.putExtra(LOCAL_ACTION, action);
        intent.putExtra(LOCAL_OBJECT, reminder.optString("sourceJson", "{}"));
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        flags |= Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ? PendingIntent.FLAG_MUTABLE
            : 0;
        PendingIntent actionIntent = PendingIntent.getActivity(this, id + salt, intent, flags);
        builder.addAction(new NotificationCompat.Action.Builder(0, title, actionIntent).build());
    }

    private void acquireWakeLock() {
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        if (power == null) return;
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Agenda:ReminderAlarm");
        wakeLock.acquire(10 * 60 * 1000L);
    }

    private void startAlarmSound() {
        stopPlayer();
        Uri sound = Settings.System.DEFAULT_ALARM_ALERT_URI;
        if (sound == null) sound = Settings.System.DEFAULT_NOTIFICATION_URI;
        try {
            player = new MediaPlayer();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            } else {
                player.setAudioStreamType(AudioManager.STREAM_ALARM);
            }
            player.setDataSource(this, sound);
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception ignored) {
            stopPlayer();
        }
    }

    private void startVibration() {
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long[] pattern = {0, 700, 350, 700, 900};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
        } else {
            vibrator.vibrate(pattern, 0);
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Alarmas de tareas",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Pantalla y sonido para recordatorios urgentes");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.enableLights(true);
            channel.setLightColor(Color.rgb(59, 130, 246));
            channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(channel);
        }

        if (manager.getNotificationChannel(QUIET_CHANNEL_ID) == null) {
            NotificationChannel quietChannel = new NotificationChannel(
                QUIET_CHANNEL_ID,
                "Alarma activa",
                NotificationManager.IMPORTANCE_LOW
            );
            quietChannel.setDescription("Mantiene activa una alarma que ya está en pantalla");
            quietChannel.setSound(null, null);
            quietChannel.enableVibration(false);
            quietChannel.enableLights(false);
            quietChannel.setShowBadge(false);
            quietChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_SECRET);
            manager.createNotificationChannel(quietChannel);
        }
    }

    private void stopSelfSafely() {
        stopAlertEffects();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
    }

    private void stopAlertEffects() {
        stopPlayer();
        if (vibrator != null) {
            vibrator.cancel();
            vibrator = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }

    private void stopPlayer() {
        if (player == null) return;
        try {
            if (player.isPlaying()) player.stop();
        } catch (IllegalStateException ignored) {
        }
        player.release();
        player = null;
    }
}
