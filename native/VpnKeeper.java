package com.fezzy.conduint;

import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import java.text.DateFormat;
import java.util.Date;
import java.util.List;

/**
 * VpnKeeper: a foreground service that keeps the VPN and its rotation alive while Conduint is in the background (V0.26.0).
 * It shows one low-priority notification with Next server and Disconnect buttons. The WireGuard tunnel itself is Android's own
 * VpnService; this service exists so Android does not stop Conduint's process, which owns the rotation and the notification.
 *
 * Optional: when the screen has been off for two minutes it asks Android to stop other apps' background processes (same call
 * as the RAM optimizer). Apps playing music or using a foreground service are left alone by Android.
 */
public class VpnKeeper extends Service {
    private static final int ID = 4107;
    private static final String CH = "conduint_vpn";
    private static volatile boolean running = false;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable freeJob = new Runnable() {
        @Override public void run() { new Thread(() -> freeMemory(getApplicationContext())).start(); }
    };
    private final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            try {
                main.removeCallbacks(freeJob);
                if (Intent.ACTION_SCREEN_OFF.equals(i.getAction()) && VpnCore.prefs(c).getBoolean("freeMem", false)) main.postDelayed(freeJob, 120000);
            } catch (Throwable ignore) { }
        }
    };

    // ------------------------------------------------------------------ control (called from VpnCore)

    static void onConnected(Context c) {
        try {
            if (!VpnCore.prefs(c).getBoolean("keepAlive", true)) { refresh(c); return; }
            if (running) { refresh(c); return; }
            Intent i = new Intent(c.getApplicationContext(), VpnKeeper.class);
            if (Build.VERSION.SDK_INT >= 26) c.getApplicationContext().startForegroundService(i); else c.getApplicationContext().startService(i);
        } catch (Throwable ignore) { /* started from the background by Android's rules: the VPN still works, only the notification is missing */ }
    }

    static void onDisconnected(Context c) {
        try { c.getApplicationContext().stopService(new Intent(c.getApplicationContext(), VpnKeeper.class)); } catch (Throwable ignore) { }
    }

    static void onOptionsChanged(Context c) {
        try {
            boolean keep = VpnCore.prefs(c).getBoolean("keepAlive", true);
            if (!keep && running) onDisconnected(c);
            else if (keep && !running && VpnCore.isUp()) onConnected(c);
            else refresh(c);
        } catch (Throwable ignore) { }
    }

    /** Re-draws the notification (new profile name, next switch time). Does nothing when the service is not running. */
    static void refresh(Context c) {
        try {
            if (!running) return;
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(ID, build(c.getApplicationContext()));
        } catch (Throwable ignore) { }
    }

    // ------------------------------------------------------------------ service

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        try {
            IntentFilter f = new IntentFilter();
            f.addAction(Intent.ACTION_SCREEN_OFF);
            f.addAction(Intent.ACTION_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(screen, f, 4 /* RECEIVER_NOT_EXPORTED */); else registerReceiver(screen, f);
        } catch (Throwable ignore) { }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = build(getApplicationContext());
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(ID, n, 0x40000000 /* FOREGROUND_SERVICE_TYPE_SPECIAL_USE */);
            else startForeground(ID, n);
            running = true;
        } catch (Throwable t) {
            running = false;
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        running = false;
        try { main.removeCallbacks(freeJob); unregisterReceiver(screen); } catch (Throwable ignore) { }
        super.onDestroy();
    }

    // ------------------------------------------------------------------ notification

    private static PendingIntent act(Context c, String action, int req) {
        Intent i = new Intent(c, VpnRotateReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static Notification build(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CH) == null) {
            NotificationChannel ch = new NotificationChannel(CH, "VPN", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
        String name = VpnCore.prefs(c).getString("activeName", "");
        long next = VpnCore.prefs(c).getLong("nextAt", 0);
        boolean rot = VpnCore.prefs(c).getBoolean("rotate", false);
        b.setSmallIcon(android.R.drawable.ic_lock_lock);
        b.setContentTitle("VPN on" + (name.isEmpty() ? "" : " · " + name));
        b.setContentText(rot && next > 0 ? "Next server at " + DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(next)) : "Your connection is going through the VPN");
        b.setOngoing(true);
        b.setOnlyAlertOnce(true);
        b.setShowWhen(false);
        try {
            Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (open != null) b.setContentIntent(PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        } catch (Throwable ignore) { }
        if (rot) b.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, "Next server", act(c, VpnCore.ACTION_NEXT, 1)).build());
        b.addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Disconnect", act(c, VpnCore.ACTION_STOP, 2)).build());
        return b.build();
    }

    // ------------------------------------------------------------------ free memory when the screen is off

    static void freeMemory(Context c) {
        try {
            if (!VpnCore.prefs(c).getBoolean("freeMem", false)) return;
            ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
            PackageManager pm = c.getPackageManager();
            List<ApplicationInfo> apps = pm.getInstalledApplications(0);
            for (ApplicationInfo ai : apps) {
                if (ai.packageName.equals(c.getPackageName())) continue;
                if ((ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0) continue;
                if ((ai.flags & ApplicationInfo.FLAG_STOPPED) != 0) continue;
                try { am.killBackgroundProcesses(ai.packageName); } catch (Throwable ignored) { }
            }
        } catch (Throwable ignore) { }
    }
}
