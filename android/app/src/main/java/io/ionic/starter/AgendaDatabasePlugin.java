package io.ionic.starter;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(name = "AgendaDatabase")
public class AgendaDatabasePlugin extends Plugin {
    private AgendaDatabaseHelper databaseHelper;

    @Override
    public void load() {
        databaseHelper = new AgendaDatabaseHelper();
    }

    @PluginMethod
    public void initialize(PluginCall call) {
        try {
            SQLiteDatabase database = databaseHelper.getWritableDatabase();
            database.beginTransaction();
            try {
                if (!hasMetadata(database, "local_storage_migrated_v1")) {
                    saveTasks(database, new JSONArray(call.getString("tasksJson", "[]")), false);
                    savePresets(database, new JSONArray(call.getString("presetsJson", "[]")));
                    putMetadata(database, "local_storage_migrated_v1", String.valueOf(System.currentTimeMillis()));
                }
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }

            JSObject result = new JSObject();
            result.put("tasksJson", loadTasks(database).toString());
            result.put("presetsJson", loadPresets(database).toString());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No fue posible inicializar la base de datos local", error);
        }
    }

    @PluginMethod
    public void saveTasks(PluginCall call) {
        try {
            SQLiteDatabase database = databaseHelper.getWritableDatabase();
            database.beginTransaction();
            try {
                saveTasks(database, new JSONArray(call.getString("tasksJson", "[]")), true);
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("No fue posible guardar las tareas", error);
        }
    }

    @PluginMethod
    public void savePresets(PluginCall call) {
        try {
            SQLiteDatabase database = databaseHelper.getWritableDatabase();
            database.beginTransaction();
            try {
                savePresets(database, new JSONArray(call.getString("presetsJson", "[]")));
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("No fue posible guardar los eventos preestablecidos", error);
        }
    }

    @PluginMethod
    public void initializeTreatments(PluginCall call) {
        try {
            SQLiteDatabase database = databaseHelper.getWritableDatabase();
            database.beginTransaction();
            try {
                if (!hasMetadata(database, "wellness_treatments_migrated_v1")) {
                    saveTreatments(database, new JSONArray(call.getString("treatmentsJson", "[]")));
                    putMetadata(database, "wellness_treatments_migrated_v1", String.valueOf(System.currentTimeMillis()));
                }
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
            JSObject result = new JSObject();
            result.put("treatmentsJson", loadTreatments(database).toString());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No fue posible inicializar los tratamientos", error);
        }
    }

    @PluginMethod
    public void saveTreatments(PluginCall call) {
        try {
            SQLiteDatabase database = databaseHelper.getWritableDatabase();
            database.beginTransaction();
            try {
                saveTreatments(database, new JSONArray(call.getString("treatmentsJson", "[]")));
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("No fue posible guardar los tratamientos", error);
        }
    }

    @PluginMethod
    public void initializeMedicationDoses(PluginCall call) {
        try {
            SQLiteDatabase database = databaseHelper.getWritableDatabase();
            database.beginTransaction();
            try {
                if (!hasMetadata(database, "medication_doses_migrated_v1")) {
                    saveMedicationDoses(database, new JSONArray(call.getString("dosesJson", "[]")));
                    putMetadata(database, "medication_doses_migrated_v1", String.valueOf(System.currentTimeMillis()));
                }
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
            JSObject result = new JSObject();
            result.put("dosesJson", loadMedicationDoses(database).toString());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No fue posible inicializar las tomas", error);
        }
    }

    @PluginMethod
    public void saveMedicationDoses(PluginCall call) {
        try {
            SQLiteDatabase database = databaseHelper.getWritableDatabase();
            database.beginTransaction();
            try {
                saveMedicationDoses(database, new JSONArray(call.getString("dosesJson", "[]")));
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("No fue posible guardar las tomas", error);
        }
    }

    @PluginMethod
    public void initializeNotes(PluginCall call) {
        try {
            SQLiteDatabase database = databaseHelper.getWritableDatabase();
            database.beginTransaction();
            try {
                if (!hasMetadata(database, "quick_notes_migrated_v1")) {
                    saveNotes(database, new JSONArray(call.getString("notesJson", "[]")));
                    putMetadata(database, "quick_notes_migrated_v1", String.valueOf(System.currentTimeMillis()));
                }
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
            JSObject result = new JSObject();
            result.put("notesJson", loadNotes(database).toString());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No fue posible inicializar las notas", error);
        }
    }

    @PluginMethod
    public void saveNotes(PluginCall call) {
        try {
            SQLiteDatabase database = databaseHelper.getWritableDatabase();
            database.beginTransaction();
            try {
                saveNotes(database, new JSONArray(call.getString("notesJson", "[]")));
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("No fue posible guardar las notas", error);
        }
    }

    @PluginMethod
    public void initializeWallet(PluginCall call) {
        try {
            SQLiteDatabase database = databaseHelper.getWritableDatabase();
            database.beginTransaction();
            try {
                if (!hasMetadata(database, "wallet_migrated_v1")) {
                    saveWallet(database, call.getString("walletJson", "{}"));
                    putMetadata(database, "wallet_migrated_v1", String.valueOf(System.currentTimeMillis()));
                }
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
            JSObject result = new JSObject();
            result.put("walletJson", loadWallet(database));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No fue posible inicializar la billetera", error);
        }
    }

    @PluginMethod
    public void saveWallet(PluginCall call) {
        try {
            saveWallet(databaseHelper.getWritableDatabase(), call.getString("walletJson", "{}"));
            call.resolve();
        } catch (Exception error) {
            call.reject("No fue posible guardar la billetera", error);
        }
    }

    private void saveTasks(SQLiteDatabase database, JSONArray tasks, boolean markMissingAsDeleted) throws Exception {
        Set<String> activeUuids = new HashSet<>();
        long now = System.currentTimeMillis();
        for (int index = 0; index < tasks.length(); index++) {
            JSONObject task = tasks.getJSONObject(index);
            long localId = task.optLong("id", now + index);
            String uuid = task.optString("uuid", "");
            if (uuid.isEmpty()) {
                uuid = UUID.randomUUID().toString();
                task.put("uuid", uuid);
            }
            activeUuids.add(uuid);

            ContentValues values = new ContentValues();
            values.put("local_id", localId);
            values.put("uuid", uuid);
            values.put("payload", task.toString());
            values.put("created_at", task.optString("createdAt", String.valueOf(now)));
            values.put("updated_at", task.optString("updatedAt", String.valueOf(now)));
            values.putNull("deleted_at");
            values.put("version", Math.max(1, task.optInt("version", 1)));
            values.put("sync_status", task.optString("syncStatus", "pending"));
            database.insertWithOnConflict("tasks", null, values, SQLiteDatabase.CONFLICT_REPLACE);
        }

        if (!markMissingAsDeleted) return;
        try (Cursor cursor = database.query("tasks", new String[]{"uuid", "version"}, "deleted_at IS NULL", null, null, null, null)) {
            while (cursor.moveToNext()) {
                String uuid = cursor.getString(0);
                if (activeUuids.contains(uuid)) continue;
                ContentValues deleted = new ContentValues();
                deleted.put("deleted_at", String.valueOf(now));
                deleted.put("updated_at", String.valueOf(now));
                deleted.put("version", cursor.getInt(1) + 1);
                deleted.put("sync_status", "pending");
                database.update("tasks", deleted, "uuid = ?", new String[]{uuid});
            }
        }
    }

    private JSONArray loadTasks(SQLiteDatabase database) throws Exception {
        JSONArray result = new JSONArray();
        try (Cursor cursor = database.query("tasks", new String[]{"payload"}, "deleted_at IS NULL", null, null, null, "local_id ASC")) {
            while (cursor.moveToNext()) result.put(new JSONObject(cursor.getString(0)));
        }
        return result;
    }

    private void savePresets(SQLiteDatabase database, JSONArray presets) throws Exception {
        database.delete("event_presets", null, null);
        for (int index = 0; index < presets.length(); index++) {
            JSONObject preset = presets.getJSONObject(index);
            ContentValues values = new ContentValues();
            values.put("local_id", preset.optLong("id", System.currentTimeMillis() + index));
            values.put("payload", preset.toString());
            database.insertWithOnConflict("event_presets", null, values, SQLiteDatabase.CONFLICT_REPLACE);
        }
    }

    private JSONArray loadPresets(SQLiteDatabase database) throws Exception {
        JSONArray result = new JSONArray();
        try (Cursor cursor = database.query("event_presets", new String[]{"payload"}, null, null, null, null, "local_id ASC")) {
            while (cursor.moveToNext()) result.put(new JSONObject(cursor.getString(0)));
        }
        return result;
    }

    private void saveTreatments(SQLiteDatabase database, JSONArray treatments) throws Exception {
        database.delete("medication_treatments", null, null);
        for (int index = 0; index < treatments.length(); index++) {
            JSONObject treatment = treatments.getJSONObject(index);
            ContentValues values = new ContentValues();
            values.put("id", treatment.optString("id", UUID.randomUUID().toString()));
            values.put("payload", treatment.toString());
            values.put("updated_at", treatment.optString("updatedAt", String.valueOf(System.currentTimeMillis())));
            database.insertWithOnConflict("medication_treatments", null, values, SQLiteDatabase.CONFLICT_REPLACE);
        }
    }

    private JSONArray loadTreatments(SQLiteDatabase database) throws Exception {
        JSONArray result = new JSONArray();
        try (Cursor cursor = database.query("medication_treatments", new String[]{"payload"}, null, null, null, null, "updated_at ASC")) {
            while (cursor.moveToNext()) result.put(new JSONObject(cursor.getString(0)));
        }
        return result;
    }

    private void saveMedicationDoses(SQLiteDatabase database, JSONArray doses) throws Exception {
        database.delete("medication_doses", null, null);
        for (int index = 0; index < doses.length(); index++) {
            JSONObject dose = doses.getJSONObject(index);
            ContentValues values = new ContentValues();
            values.put("id", dose.optString("id", UUID.randomUUID().toString()));
            values.put("treatment_id", dose.optString("treatmentId", ""));
            values.put("scheduled_at", dose.optString("scheduledAt", ""));
            values.put("status", dose.optString("status", "pending"));
            values.put("payload", dose.toString());
            database.insertWithOnConflict("medication_doses", null, values, SQLiteDatabase.CONFLICT_REPLACE);
        }
    }

    private JSONArray loadMedicationDoses(SQLiteDatabase database) throws Exception {
        JSONArray result = new JSONArray();
        try (Cursor cursor = database.query("medication_doses", new String[]{"payload"}, null, null, null, null, "scheduled_at ASC")) {
            while (cursor.moveToNext()) result.put(new JSONObject(cursor.getString(0)));
        }
        return result;
    }

    private void saveNotes(SQLiteDatabase database, JSONArray notes) throws Exception {
        database.delete("quick_notes", null, null);
        for (int index = 0; index < notes.length(); index++) {
            JSONObject note = notes.getJSONObject(index);
            ContentValues values = new ContentValues();
            values.put("id", note.optString("id", UUID.randomUUID().toString()));
            values.put("payload", note.toString());
            values.put("updated_at", note.optString("updatedAt", String.valueOf(System.currentTimeMillis())));
            database.insertWithOnConflict("quick_notes", null, values, SQLiteDatabase.CONFLICT_REPLACE);
        }
    }

    private JSONArray loadNotes(SQLiteDatabase database) throws Exception {
        JSONArray result = new JSONArray();
        try (Cursor cursor = database.query("quick_notes", new String[]{"payload"}, null, null, null, null, "updated_at DESC")) {
            while (cursor.moveToNext()) result.put(new JSONObject(cursor.getString(0)));
        }
        return result;
    }

    private void saveWallet(SQLiteDatabase database, String walletJson) {
        ContentValues values = new ContentValues();
        values.put("id", 1);
        values.put("payload", walletJson);
        values.put("updated_at", String.valueOf(System.currentTimeMillis()));
        database.insertWithOnConflict("wallet_state", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private String loadWallet(SQLiteDatabase database) {
        try (Cursor cursor = database.query("wallet_state", new String[]{"payload"}, "id = 1", null, null, null, null)) {
            return cursor.moveToFirst() ? cursor.getString(0) : "{}";
        }
    }

    private boolean hasMetadata(SQLiteDatabase database, String key) {
        try (Cursor cursor = database.query("metadata", new String[]{"value"}, "key = ?", new String[]{key}, null, null, null)) {
            return cursor.moveToFirst();
        }
    }

    private void putMetadata(SQLiteDatabase database, String key, String value) {
        ContentValues values = new ContentValues();
        values.put("key", key);
        values.put("value", value);
        database.insertWithOnConflict("metadata", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    @Override
    protected void handleOnDestroy() {
        if (databaseHelper != null) databaseHelper.close();
        super.handleOnDestroy();
    }

    private class AgendaDatabaseHelper extends SQLiteOpenHelper {
        AgendaDatabaseHelper() {
            super(getContext(), "agenda.db", null, 5);
        }

        @Override
        public void onConfigure(SQLiteDatabase database) {
            database.setForeignKeyConstraintsEnabled(true);
        }

        @Override
        public void onCreate(SQLiteDatabase database) {
            database.execSQL("CREATE TABLE tasks (local_id INTEGER NOT NULL, uuid TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, version INTEGER NOT NULL DEFAULT 1, sync_status TEXT NOT NULL DEFAULT 'pending')");
            database.execSQL("CREATE INDEX tasks_updated_at_index ON tasks(updated_at)");
            database.execSQL("CREATE INDEX tasks_sync_status_index ON tasks(sync_status, deleted_at)");
            database.execSQL("CREATE TABLE event_presets (local_id INTEGER PRIMARY KEY, payload TEXT NOT NULL)");
            database.execSQL("CREATE TABLE medication_treatments (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)");
            database.execSQL("CREATE TABLE medication_doses (id TEXT PRIMARY KEY, treatment_id TEXT NOT NULL, scheduled_at TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL)");
            database.execSQL("CREATE UNIQUE INDEX medication_doses_schedule_index ON medication_doses(treatment_id, scheduled_at)");
            database.execSQL("CREATE TABLE quick_notes (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)");
            database.execSQL("CREATE TABLE wallet_state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at TEXT NOT NULL)");
            database.execSQL("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
        }

        @Override
        public void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion) {
            if (oldVersion < 2) {
                database.execSQL("CREATE TABLE IF NOT EXISTS medication_treatments (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)");
            }
            if (oldVersion < 3) {
                database.execSQL("CREATE TABLE IF NOT EXISTS medication_doses (id TEXT PRIMARY KEY, treatment_id TEXT NOT NULL, scheduled_at TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL)");
                database.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS medication_doses_schedule_index ON medication_doses(treatment_id, scheduled_at)");
            }
            if (oldVersion < 4) {
                database.execSQL("CREATE TABLE IF NOT EXISTS quick_notes (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)");
            }
            if (oldVersion < 5) {
                database.execSQL("CREATE TABLE IF NOT EXISTS wallet_state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at TEXT NOT NULL)");
            }
        }
    }
}
