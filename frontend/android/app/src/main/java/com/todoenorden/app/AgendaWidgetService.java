package com.todoenorden.app;

import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

public class AgendaWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new AgendaWidgetFactory();
    }

    private final class AgendaWidgetFactory implements RemoteViewsFactory {
        private final List<ListItem> items = new ArrayList<>();

        @Override
        public void onCreate() {
            reload();
        }

        @Override
        public void onDataSetChanged() {
            reload();
        }

        private void reload() {
            AgendaWidgetProvider.WidgetAgenda agenda = AgendaWidgetProvider.loadAgenda(AgendaWidgetService.this);
            items.clear();
            items.add(ListItem.section(false, "Pendientes", agenda.pending.size()));
            if (agenda.pending.isEmpty()) items.add(ListItem.empty("Sin tareas pendientes"));
            else for (AgendaWidgetProvider.WidgetTask task : agenda.pending) items.add(ListItem.task(task, false));
            items.add(ListItem.section(true, "Tareas programadas para hoy", agenda.today.size()));
            if (agenda.today.isEmpty()) items.add(ListItem.empty("Sin tareas programadas para hoy"));
            else for (AgendaWidgetProvider.WidgetTask task : agenda.today) items.add(ListItem.task(task, true));
        }

        @Override
        public int getCount() {
            return items.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= items.size()) return null;
            ListItem item = items.get(position);
            if (item.kind == ListItem.SECTION) {
                RemoteViews views = new RemoteViews(getPackageName(), R.layout.agenda_widget_section);
                views.setViewVisibility(R.id.widget_section_divider, item.divider ? View.VISIBLE : View.GONE);
                views.setImageViewResource(
                    R.id.widget_section_icon,
                    item.divider ? R.drawable.ic_widget_tasks : R.drawable.ic_widget_clipboard
                );
                views.setTextViewText(R.id.widget_section_title, item.label);
                views.setTextViewText(R.id.widget_section_count, String.valueOf(item.count));
                return views;
            }
            if (item.kind == ListItem.EMPTY) {
                RemoteViews views = new RemoteViews(getPackageName(), R.layout.agenda_widget_empty);
                views.setTextViewText(R.id.widget_empty_text, item.label);
                return views;
            }

            RemoteViews views = new RemoteViews(getPackageName(), R.layout.agenda_widget_task);
            views.setTextViewText(R.id.widget_list_task_title, item.task.title);
            views.setTextColor(R.id.widget_list_task_check, item.task.accentColor);
            views.setViewVisibility(R.id.widget_list_task_time, item.showTime && !item.task.time.isEmpty() ? View.VISIBLE : View.GONE);
            views.setTextViewText(R.id.widget_list_task_time, item.task.time);
            Intent fillInIntent = new Intent()
                .putExtra(AgendaWidgetProvider.EXTRA_TASK_ID, item.task.id);
            views.setOnClickFillInIntent(R.id.widget_list_task_check, fillInIntent);
            return views;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 3; }
        @Override public long getItemId(int position) {
            if (position < 0 || position >= items.size()) return position;
            ListItem item = items.get(position);
            return item.task == null ? -1000L - position : item.task.id;
        }
        @Override public boolean hasStableIds() { return true; }
        @Override public void onDestroy() { items.clear(); }
    }

    private static final class ListItem {
        static final int SECTION = 0;
        static final int TASK = 1;
        static final int EMPTY = 2;

        final int kind;
        final String label;
        final int count;
        final boolean divider;
        final AgendaWidgetProvider.WidgetTask task;
        final boolean showTime;

        private ListItem(int kind, String label, int count, boolean divider, AgendaWidgetProvider.WidgetTask task, boolean showTime) {
            this.kind = kind;
            this.label = label;
            this.count = count;
            this.divider = divider;
            this.task = task;
            this.showTime = showTime;
        }

        static ListItem section(boolean divider, String label, int count) {
            return new ListItem(SECTION, label, count, divider, null, false);
        }

        static ListItem task(AgendaWidgetProvider.WidgetTask task, boolean showTime) {
            return new ListItem(TASK, "", 0, false, task, showTime);
        }

        static ListItem empty(String label) {
            return new ListItem(EMPTY, label, 0, false, null, false);
        }
    }
}
