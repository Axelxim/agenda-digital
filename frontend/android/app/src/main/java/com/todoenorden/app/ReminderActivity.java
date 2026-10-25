package com.todoenorden.app;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Space;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;

import java.util.Locale;

public class ReminderActivity extends ComponentActivity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView countdownView;
    private long dueAt;
    private boolean medicationReminder;
    private boolean walletReminder;

    private final Runnable updateCountdown = new Runnable() {
        @Override
        public void run() {
            renderCountdown();
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                closeReminder();
            }
        });
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.rgb(9, 13, 21));
        getWindow().setNavigationBarColor(Color.rgb(9, 13, 21));
        buildScreen();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        buildScreen();
    }

    @Override
    protected void onStart() {
        super.onStart();
        handler.post(updateCountdown);
    }

    @Override
    protected void onResume() {
        super.onResume();
        ReminderAlarmService.markScreenVisible(this);
    }

    @Override
    protected void onStop() {
        handler.removeCallbacks(updateCountdown);
        super.onStop();
    }

    private void buildScreen() {
        String taskTitle = getIntent().getStringExtra("taskTitle");
        String label = getIntent().getStringExtra("label");
        medicationReminder = "medication".equals(getIntent().getStringExtra("kind"));
        walletReminder = "wallet".equals(getIntent().getStringExtra("kind"));
        dueAt = getIntent().getLongExtra("dueAt", System.currentTimeMillis());

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(24), dp(36), dp(24), dp(28));
        root.setBackgroundColor(Color.rgb(9, 13, 21));

        TextView eyebrow = text(
            medicationReminder ? "MEDICAMENTO" : walletReminder ? "PAGO FIJO" : "RECORDATORIO",
            13,
            medicationReminder ? Color.rgb(52, 211, 153) : walletReminder ? Color.rgb(245, 173, 61) : Color.rgb(96, 165, 250),
            Typeface.BOLD
        );
        root.addView(eyebrow, matchWrap());

        TextView title = text(
            medicationReminder
                ? "Es hora de tomar " + (taskTitle == null ? "tu medicamento" : taskTitle)
                : walletReminder
                    ? (taskTitle == null ? "Tu pago" : taskTitle) + " est\u00e1 pendiente"
                : (taskTitle == null ? "Esta tarea" : taskTitle) + " est\u00e1 pendiente",
            30,
            Color.WHITE,
            Typeface.BOLD
        );
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = matchWrap();
        titleParams.topMargin = dp(18);
        root.addView(title, titleParams);

        TextView question = text(
            medicationReminder ? "\u00bfYa lo tomaste?" : walletReminder ? "\u00bfYa lo pagaste?" : "\u00bfYa la hiciste?",
            20,
            Color.rgb(203, 213, 225),
            Typeface.NORMAL
        );
        question.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams questionParams = matchWrap();
        questionParams.topMargin = dp(12);
        root.addView(question, questionParams);

        if (label != null && !label.isEmpty()) {
            TextView labelView = text(label, 14, Color.rgb(226, 232, 240), Typeface.BOLD);
            labelView.setGravity(Gravity.CENTER);
            labelView.setPadding(dp(14), dp(8), dp(14), dp(8));
            GradientDrawable labelBackground = new GradientDrawable();
            labelBackground.setColor(Color.rgb(24, 34, 51));
            labelBackground.setCornerRadius(dp(8));
            labelView.setBackground(labelBackground);
            LinearLayout.LayoutParams labelParams = matchWrap();
            labelParams.topMargin = dp(22);
            root.addView(labelView, labelParams);
        }

        countdownView = text("", 28, Color.rgb(96, 165, 250), Typeface.BOLD);
        countdownView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams countdownParams = matchWrap();
        countdownParams.topMargin = dp(44);
        root.addView(countdownView, countdownParams);

        Space spacer = new Space(this);
        root.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1));

        Button close = new Button(this);
        close.setText(R.string.reminder_close);
        close.setTextSize(17);
        close.setTextColor(Color.WHITE);
        close.setAllCaps(false);
        close.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        close.setMinHeight(dp(56));
        GradientDrawable buttonBackground = new GradientDrawable();
        buttonBackground.setColor(Color.rgb(37, 99, 235));
        buttonBackground.setCornerRadius(dp(8));
        close.setBackground(buttonBackground);
        close.setOnClickListener(view -> closeReminder());
        root.addView(close, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));

        setContentView(root);
    }

    private void renderCountdown() {
        if (countdownView == null) return;
        long difference = dueAt - System.currentTimeMillis();
        boolean overdue = difference < 0;
        long totalSeconds = Math.abs(difference) / 1000;
        long days = totalSeconds / 86400;
        long hours = (totalSeconds % 86400) / 3600;
        long minutes = (totalSeconds % 3600) / 60;
        long seconds = totalSeconds % 60;
        String time = days > 0
            ? String.format(Locale.getDefault(), "%d d\u00edas  %02d:%02d:%02d", days, hours, minutes, seconds)
            : String.format(Locale.getDefault(), "%02d:%02d:%02d", hours, minutes, seconds);
        int prefixResource = medicationReminder && overdue
            ? R.string.reminder_medication_overdue
            : overdue
                ? R.string.reminder_overdue
                : walletReminder
                    ? R.string.reminder_wallet_remaining
                    : R.string.reminder_remaining;
        countdownView.setText(getString(
            R.string.reminder_countdown,
            getString(prefixResource),
            time
        ));
    }

    private void closeReminder() {
        stopService(new Intent(this, ReminderAlarmService.class));
        finish();
    }

    private TextView text(String value, int size, int color, int style) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setTypeface(Typeface.DEFAULT, style);
        return view;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
