package com.fezzy.conduint;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

/**
 * KeepService (V0.27.0): a foreground service that keeps Conduint's process alive in the background so Android does not
 * freeze it, and wakes the web side every few minutes (the "tick" event) to check the watched folders.
 * It shows one quiet notification. It never starts by itself: the web side starts it (Settings > Keep running, or when a
 * folder watch is on) while Conduint is open, and swiping Conduint away from recent apps stops it, because the web side
 * that does the checking is gone by then.
 */
public class KeepService extends Service {
    private static final int ID = 4108;
    private static final String CH = "conduint_keep";
    static volatile boolean running = false;
    private static volatile int minutes = 5;
    private static volatile String text = "Conduint is running in the background";

    private final Handler main = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock wl;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            try {
                if (wl != null) wl.acquire(120000L);
                WatchPlugin.tick();
            } catch (Throwable ignore) { }
            main.postDelayed(this, Math.max(1, minutes) * 60000L);
        }
    };

    // ------------------------------------------------------------------ control (called from WatchPlugin)

    static void start(Context c, int min, String t) {
        minutes = Math.max(1, Math.min(min, 120));
        if (t != null && t.length() > 0) text = t;
        Context a = c.getApplicationContext();
        if (running) { refresh(a); return; }
        Intent i = new Intent(a, KeepService.class);
        if (Build.VERSION.SDK_INT >= 26) a.startForegroundService(i); else a.startService(i);
    }

    static void stop(Context c) {
        try { c.getApplicationContext().stopService(new Intent(c.getApplicationContext(), KeepService.class)); } catch (Throwable ignore) { }
    }

    static void refresh(Context c) {
        try {
            if (!running) return;
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(ID, build(c));
        } catch (Throwable ignore) { }
    }

    // ------------------------------------------------------------------ service

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "conduint:watch");
                wl.setReferenceCounted(false);
            }
        } catch (Throwable ignore) { }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = build(getApplicationContext());
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(ID, n, 0x40000000 /* FOREGROUND_SERVICE_TYPE_SPECIAL_USE */);
            else startForeground(ID, n);
            running = true;
            main.removeCallbacks(tick);
            main.postDelayed(tick, 20000L);
        } catch (Throwable t) {
            running = false;
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override public void onDestroy() {
        running = false;
        try { main.removeCallbacks(tick); if (wl != null && wl.isHeld()) wl.release(); } catch (Throwable ignore) { }
        super.onDestroy();
    }

    // ------------------------------------------------------------------ notification

    static Notification build(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CH) == null) {
            NotificationChannel ch = new NotificationChannel(CH, "Keep running", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
        boolean sh = text != null && text.startsWith("Shield");
        int badge = 0;
        if (sh) { try { badge = c.getResources().getIdentifier("ic_stat_shield", "drawable", c.getPackageName()); } catch (Throwable ignore) { } }
        b.setSmallIcon(badge != 0 ? badge : android.R.drawable.stat_notify_sync);
        b.setContentTitle(sh ? "Conduint Shield" : "Conduint Files");
        b.setContentText(text);
        b.setOngoing(true);
        b.setOnlyAlertOnce(true);
        b.setShowWhen(false);
        try {
            Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (open != null) b.setContentIntent(PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        } catch (Throwable ignore) { }
        return b.build();
    }
}
