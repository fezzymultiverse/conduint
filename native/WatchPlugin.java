package com.fezzy.conduint;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Watch: the web side's door to the keep-alive service and the folder watcher's questions (V0.27.0).
 *
 * The watching itself (what changed, what to upload) is done by the web side, which already knows how to read every kind
 * of storage. This plugin only does what the web side cannot do alone:
 *   - start / stop KeepService, a foreground service that stops Android from freezing Conduint, and that fires a "tick"
 *     event every few minutes so the web side checks the watched folders even with the screen off;
 *   - show a notification with Upload and Deny buttons. The answer is stored here (so it is not lost if Conduint was
 *     not on screen) and the web side collects it with takeAnswers().
 */
@CapacitorPlugin(name = "Watch")
public class WatchPlugin extends Plugin {
    static final String CH = "conduint_watch";
    private static final String PREFS = "conduint_watch";
    private static volatile WatchPlugin live;

    @Override
    public void load() { live = this; }

    @Override
    protected void handleOnDestroy() { if (live == this) live = null; }

    private Context ctx() { return getContext().getApplicationContext(); }

    // ------------------------------------------------------------------ events to the web side

    /** Called by KeepService on every interval. */
    static void tick() {
        try {
            WatchPlugin p = live;
            if (p != null) p.notifyListeners("tick", new JSObject());
        } catch (Throwable ignore) { }
    }

    /** Called by WatchReceiver when a notification button was tapped. The answer is kept until the web side collects it. */
    static void addAnswer(Context c, String id, boolean ok) {
        try {
            SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray a = new JSONArray(sp.getString("answers", "[]"));
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("ok", ok);
            a.put(o);
            sp.edit().putString("answers", a.toString()).apply();
            WatchPlugin p = live;
            if (p != null) p.notifyListeners("answer", new JSObject());
        } catch (Throwable ignore) { }
    }

    static int noteId(String id) { return 0x5000 + (id.hashCode() & 0xfff); }

    // ------------------------------------------------------------------ plugin methods

    /** start({minutes, text}): starts (or updates) the keep-alive service. */
    @PluginMethod
    public void start(PluginCall call) {
        try {
            int m = call.getInt("minutes", 5);
            KeepService.start(ctx(), m, call.getString("text", "Conduint is running in the background"));
            JSObject o = new JSObject();
            o.put("running", true);
            call.resolve(o);
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()));
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try { KeepService.stop(ctx()); } catch (Throwable ignore) { }
        call.resolve();
    }

    @PluginMethod
    public void state(PluginCall call) {
        JSObject o = new JSObject();
        o.put("running", KeepService.running);
        call.resolve(o);
    }

    /** ask({id, title, text}): one notification per watch rule. Asking again with the same id replaces it. */
    @PluginMethod
    public void ask(PluginCall call) {
        try {
            String id = call.getString("id", "w");
            Context c = ctx();
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) { call.resolve(); return; }
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
                NotificationChannel ch = new NotificationChannel(CH, "Folder watcher questions", NotificationManager.IMPORTANCE_HIGH);
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
            b.setSmallIcon(android.R.drawable.stat_sys_upload);
            b.setContentTitle(call.getString("title", "Folder changed"));
            b.setContentText(call.getString("text", "Upload the changes?"));
            b.setAutoCancel(false);
            b.setOnlyAlertOnce(true);
            try {
                Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
                if (open != null) b.setContentIntent(PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            } catch (Throwable ignore) { }
            int n = noteId(id);
            b.addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_upload, "Upload", answer(c, id, true, n * 2)).build());
            b.addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Deny", answer(c, id, false, n * 2 + 1)).build());
            nm.notify(n, b.build());
            call.resolve();
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()));
        }
    }

    private static PendingIntent answer(Context c, String id, boolean ok, int req) {
        Intent i = new Intent(c, WatchReceiver.class).setAction("conduint.watch.answer." + (ok ? "yes" : "no") + "." + id);
        i.putExtra("id", id);
        i.putExtra("ok", ok);
        return PendingIntent.getBroadcast(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static final String CH_SCAN = "conduint_shield_scan";
    static final String CH_BLOCK = "conduint_shield_block";

    /**
     * V0.28.0: note({id, kind, title, text}) shows one Shield notification. kind "scan" = a scan finished (quiet channel),
     * kind "block" = Shield stopped a file (loud channel). They are two Android channels so each can be silenced on its own
     * in Android's notification settings. Resolves {shown:false, reason} when Android has notifications switched off for
     * Conduint, so the web side knows nothing appeared. Tapping the notification opens Conduint.
     */
    @PluginMethod
    public void note(PluginCall call) {
        JSObject res = new JSObject();
        try {
            Context c = ctx();
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) { res.put("shown", false); res.put("reason", "unavailable"); call.resolve(res); return; }
            if (!nm.areNotificationsEnabled()) { res.put("shown", false); res.put("reason", "denied"); call.resolve(res); return; }
            boolean block = "block".equals(call.getString("kind", "scan"));
            String ch = block ? CH_BLOCK : CH_SCAN;
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(ch) == null) {
                NotificationChannel nc = new NotificationChannel(ch,
                    block ? "Shield blocked a file" : "Shield scan finished",
                    block ? NotificationManager.IMPORTANCE_HIGH : NotificationManager.IMPORTANCE_LOW);
                nc.setShowBadge(false);
                nm.createNotificationChannel(nc);
            }
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, ch) : new Notification.Builder(c);
            // V0.28.2: Shield badge (white shield, tinted by the colour below): hot pink for a dangerous file, cyan for a finished scan.
            int badge = c.getResources().getIdentifier("ic_stat_shield", "drawable", c.getPackageName());
            b.setSmallIcon(badge != 0 ? badge : (block ? android.R.drawable.stat_notify_error : android.R.drawable.stat_sys_download_done));
            b.setColor(block ? 0xFFFF005F : 0xFF00E5FF);
            String title = call.getString("title", block ? "Shield stopped a file" : "Shield scan finished");
            String text = call.getString("text", "");
            b.setContentTitle(title);
            b.setContentText(text);
            b.setStyle(new Notification.BigTextStyle().bigText(text));
            b.setAutoCancel(true);
            try {
                Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
                if (open != null) b.setContentIntent(PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            } catch (Throwable ignore) { }
            nm.notify(0x6000 + (call.getString("id", "s").hashCode() & 0xfff), b.build());
            res.put("shown", true);
            call.resolve(res);
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()));
        }
    }

    /** clear({id}): removes the question (the web side answered it from inside the app). */
    @PluginMethod
    public void clear(PluginCall call) {
        try {
            NotificationManager nm = (NotificationManager) ctx().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(noteId(call.getString("id", "w")));
        } catch (Throwable ignore) { }
        call.resolve();
    }

    /** takeAnswers(): the Upload / Deny taps since the last call, oldest first. */
    @PluginMethod
    public void takeAnswers(PluginCall call) {
        JSObject res = new JSObject();
        JSArray out = new JSArray();
        try {
            SharedPreferences sp = ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray a = new JSONArray(sp.getString("answers", "[]"));
            for (int k = 0; k < a.length(); k++) {
                JSONObject s = a.getJSONObject(k);
                JSObject o = new JSObject();
                o.put("id", s.optString("id"));
                o.put("ok", s.optBoolean("ok"));
                out.put(o);
            }
            sp.edit().putString("answers", "[]").apply();
        } catch (Throwable ignore) { }
        res.put("items", out);
        call.resolve(res);
    }
}
