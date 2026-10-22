package com.fezzy.conduint;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Upload / Deny buttons of the folder watcher's notification (V0.27.0). Stores the answer and removes the notification. */
public class WatchReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        try {
            String id = i.getStringExtra("id");
            if (id == null) return;
            boolean ok = i.getBooleanExtra("ok", false);
            WatchPlugin.addAnswer(c.getApplicationContext(), id, ok);
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(WatchPlugin.noteId(id));
        } catch (Throwable ignore) { }
    }
}
