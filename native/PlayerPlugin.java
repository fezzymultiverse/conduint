package com.fezzy.conduint;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge between the web player and the media notification. The web page calls update() whenever the song or the
 * play / pause state changes; notification buttons come back as an "action" event (toggle, next, prev, close).
 */
@CapacitorPlugin(name = "Player")
public class PlayerPlugin extends Plugin {

    private static PlayerPlugin inst;
    private static final Handler UI = new Handler(Looper.getMainLooper());

    @Override public void load() { inst = this; }

    static void emit(final String action) { emit(action, -1); }

    static void emit(final String action, final long pos) {
        final PlayerPlugin p = inst;
        if (p == null || action == null) return;
        UI.post(new Runnable() {
            @Override public void run() {
                JSObject o = new JSObject();
                o.put("action", action);
                if (pos >= 0) o.put("pos", pos);
                p.notifyListeners("action", o);
            }
        });
    }

    private static boolean asked = false;

    /** Android 13+ hides the notification (and its artwork) until the notification permission is allowed. Asked once per launch. */
    private void askNotif(Context c) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && !asked && getActivity() != null
                && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                asked = true;
                ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 42);
            }
        } catch (Throwable ignored) { }
    }

    @PluginMethod
    public void update(PluginCall call) {
        Context c = getContext();
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", true));
        String art = call.getString("art", "");
        int pos = call.getInt("pos", 0), dur = call.getInt("dur", 0);
        askNotif(c);
        try {
            if (MediaService.running) {
                MediaService.refresh(c, title, artist, playing, art, pos, dur);
            } else {
                Intent i = new Intent(c, MediaService.class).setAction("show");
                i.putExtra("title", title);
                i.putExtra("artist", artist);
                i.putExtra("playing", playing);
                i.putExtra("art", art);
                i.putExtra("pos", pos);
                i.putExtra("dur", dur);
                if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
                else c.startService(i);
            }
            call.resolve();
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()));
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            Context c = getContext();
            c.stopService(new Intent(c, MediaService.class));
            MediaService.halt(c);
        } catch (Throwable ignored) { }
        call.resolve();
    }
}
