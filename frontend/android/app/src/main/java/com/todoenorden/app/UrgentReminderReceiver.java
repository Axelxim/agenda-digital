package com.todoenorden.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

public class UrgentReminderReceiver extends BroadcastReceiver {
    private static final String TAG = "AgendaReminder";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            AgendaReminderPlugin.restore(context);
            return;
        }

        String raw = intent.getStringExtra(AgendaReminderPlugin.EXTRA_REMINDER);
        if (raw == null || raw.isEmpty()) return;
        Log.i(TAG, "Alarm broadcast received at=" + System.currentTimeMillis());

        Intent serviceIntent = new Intent(context, ReminderAlarmService.class);
        serviceIntent.setAction(ReminderAlarmService.ACTION_START);
        serviceIntent.putExtra(AgendaReminderPlugin.EXTRA_REMINDER, raw);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }
}
