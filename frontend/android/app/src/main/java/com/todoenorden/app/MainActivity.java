package com.todoenorden.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeviceCalendarPlugin.class);
        registerPlugin(AgendaDatabasePlugin.class);
        registerPlugin(AgendaReminderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
