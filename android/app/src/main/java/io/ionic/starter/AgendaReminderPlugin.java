package io.ionic.starter;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(name = "AgendaReminder")
public class AgendaReminderPlugin extends Plugin {
    private static final String TAG = "AgendaReminder";
    static final String ACTION_REMINDER = "io.ionic.starter.ACTION_URGENT_REMINDER";
    static final String EXTRA_REMINDER = "agendaReminder";
    private static final String PREFS = "agenda_urgent_reminders";
    private static final String REMINDERS = "reminders";

    @PluginMethod
    public void sync(PluginCall call) {
        try {
            JSONArray reminders = new JSONArray(call.getString("remindersJson", "[]"));
            cancelStored(getContext());
            preferences(getContext()).edit().putString(REMINDERS, reminders.toString()).apply();
            scheduleAll(getContext(), reminders);
            call.resolve();
        } catch (Exception error) {
            call.reject("No fue posible programar los avisos insistentes", error);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        try {
            JSArray values = call.getArray("ids", new JSArray());
            Set<Integer> ids = new HashSet<>();
            for (int index = 0; index < values.length(); index++) {
                ids.add(values.getInt(index));
            }

            JSONArray stored = storedReminders(getContext());
            JSONArray remaining = new JSONArray();
            for (int index = 0; index < stored.length(); index++) {
                JSONObject reminder = stored.getJSONObject(index);
                int id = reminder.getInt("id");
                if (ids.contains(id)) {
                    cancelOne(getContext(), id);
                } else {
                    remaining.put(reminder);
                }
            }
            preferences(getContext()).edit().putString(REMINDERS, remaining.toString()).apply();
            ReminderAlarmService.stopIfActive(getContext(), ids);
            call.resolve();
        } catch (Exception error) {
            call.reject("No fue posible cancelar los avisos insistentes", error);
        }
    }

    @PluginMethod
    public void requestFullScreenPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            NotificationManager manager = getContext().getSystemService(NotificationManager.class);
            if (manager != null && !manager.canUseFullScreenIntent()) {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void checkFullScreenPermission(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        result.put("granted", manager != null && manager.canUseFullScreenIntent());
        call.resolve(result);
    }

    @PluginMethod
    public void checkBatteryOptimization(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            result.put("supported", false);
            result.put("ignoring", true);
            call.resolve(result);
            return;
        }

        PowerManager manager = getContext().getSystemService(PowerManager.class);
        result.put("supported", true);
        result.put(
            "ignoring",
            manager != null && manager.isIgnoringBatteryOptimizations(getContext().getPackageName())
        );
        call.resolve(result);
    }

    @PluginMethod
    public void requestBatteryOptimizationExemption(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            call.resolve();
            return;
        }

        try {
            Intent intent = new Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + getContext().getPackageName())
            );
            Activity activity = getActivity();
            if (activity != null) {
                activity.startActivity(intent);
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("No fue posible abrir la exclusion de bateria", error);
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName())
            );
            Activity activity = getActivity();
            if (activity != null) {
                activity.startActivity(intent);
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("No fue posible abrir los ajustes de Agenda", error);
        }
    }

    @PluginMethod
    public void getBatterySettingsInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("manufacturer", Build.MANUFACTURER == null ? "Android" : Build.MANUFACTURER);
        result.put("family", batterySettingsFamily());
        call.resolve(result);
    }

    @PluginMethod
    public void openManufacturerBatterySettings(PluginCall call) {
        try {
            Intent[] candidates = manufacturerBatteryIntents(batterySettingsFamily());
            for (Intent intent : candidates) {
                if (intent.resolveActivity(getContext().getPackageManager()) != null) {
                    startSettingsActivity(intent);
                    call.resolve();
                    return;
                }
            }
            startSettingsActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            call.resolve();
        } catch (Exception error) {
            Log.w(TAG, "Manufacturer battery settings are not available", error);
            openAppSettings(call);
        }
    }

    private String batterySettingsFamily() {
        String maker = ((Build.MANUFACTURER == null ? "" : Build.MANUFACTURER) + " "
            + (Build.BRAND == null ? "" : Build.BRAND)).toLowerCase();
        if (maker.contains("infinix") || maker.contains("tecno") || maker.contains("itel") || maker.contains("transsion")) return "xos";
        if (maker.contains("xiaomi") || maker.contains("redmi") || maker.contains("poco")) return "xiaomi";
        if (maker.contains("samsung")) return "samsung";
        if (maker.contains("huawei") || maker.contains("honor")) return "huawei";
        if (maker.contains("oppo") || maker.contains("realme") || maker.contains("oneplus")) return "oppo";
        if (maker.contains("vivo") || maker.contains("iqoo")) return "vivo";
        return "android";
    }

    private Intent[] manufacturerBatteryIntents(String family) {
        if ("xos".equals(family)) {
            Intent batteryLab = new Intent("com.transsion.batterylab.app_saving");
            batteryLab.setPackage("com.transsion.batterylab");
            return new Intent[] { batteryLab };
        }
        if ("xiaomi".equals(family)) {
            Intent power = new Intent("miui.intent.action.POWER_HIDE_MODE_APP_LIST");
            power.setPackage("com.miui.securitycenter");
            Intent autostart = new Intent();
            autostart.setComponent(new ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"
            ));
            return new Intent[] { power, autostart };
        }
        if ("huawei".equals(family)) {
            Intent startup = new Intent();
            startup.setComponent(new ComponentName(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
            ));
            return new Intent[] { startup };
        }
        if ("oppo".equals(family)) {
            Intent startup = new Intent();
            startup.setComponent(new ComponentName(
                "com.coloros.safecenter",
                "com.coloros.safecenter.startupapp.StartupAppListActivity"
            ));
            return new Intent[] { startup };
        }
        if ("vivo".equals(family)) {
            Intent startup = new Intent();
            startup.setComponent(new ComponentName(
                "com.vivo.permissionmanager",
                "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
            ));
            return new Intent[] { startup };
        }
        return new Intent[0];
    }

    private void startSettingsActivity(Intent intent) {
        Activity activity = getActivity();
        if (activity != null) {
            activity.startActivity(intent);
        } else {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
    }

    static void restore(Context context) {
        try {
            scheduleAll(context, storedReminders(context));
        } catch (Exception ignored) {
        }
    }

    private static void scheduleAll(Context context, JSONArray reminders) throws Exception {
        for (int index = 0; index < reminders.length(); index++) {
            JSONObject reminder = reminders.getJSONObject(index);
            if (reminder.getLong("scheduledAt") >= System.currentTimeMillis()) {
                scheduleOne(context, reminder);
            }
        }
    }

    private static void scheduleOne(Context context, JSONObject reminder) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;

        int id = reminder.optInt("id");
        Intent intent = new Intent(context, UrgentReminderReceiver.class);
        intent.setAction(ACTION_REMINDER);
        intent.setData(Uri.parse("agenda-reminder://alarm/" + id));
        intent.putExtra(EXTRA_REMINDER, reminder.toString());
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        long triggerAt = reminder.optLong("scheduledAt");
        Log.i(TAG, "Scheduling id=" + id + " triggerAt=" + triggerAt);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
        } else {
            Intent showIntent = new Intent(context, ReminderActivity.class);
            showIntent.putExtra("kind", reminder.optString("kind", "task"));
            showIntent.putExtra("taskTitle", reminder.optString("taskTitle"));
            showIntent.putExtra("label", reminder.optString("label"));
            showIntent.putExtra("dueAt", reminder.optLong("dueAt"));
            showIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent showPendingIntent = PendingIntent.getActivity(
                context,
                id,
                showIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            manager.setAlarmClock(
                new AlarmManager.AlarmClockInfo(triggerAt, showPendingIntent),
                pendingIntent
            );
        }
    }

    private static void cancelStored(Context context) throws Exception {
        JSONArray stored = storedReminders(context);
        for (int index = 0; index < stored.length(); index++) {
            cancelOne(context, stored.getJSONObject(index).getInt("id"));
        }
    }

    private static void cancelOne(Context context, int id) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        cancelAlarm(context, manager, id, false);
        cancelAlarm(context, manager, id, true);
        NotificationManager notifications = context.getSystemService(NotificationManager.class);
        if (notifications != null) notifications.cancel(id);
    }

    private static void cancelAlarm(Context context, AlarmManager manager, int id, boolean identified) {
        Intent intent = new Intent(context, UrgentReminderReceiver.class);
        intent.setAction(ACTION_REMINDER);
        if (identified) intent.setData(Uri.parse("agenda-reminder://alarm/" + id));
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (manager != null && pendingIntent != null) {
            manager.cancel(pendingIntent);
            pendingIntent.cancel();
        }
    }

    private static JSONArray storedReminders(Context context) throws Exception {
        return new JSONArray(preferences(context).getString(REMINDERS, "[]"));
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
