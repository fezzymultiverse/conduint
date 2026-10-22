package com.fezzy.conduint;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Base64;

/**
 * Foreground service that keeps the music alive while Conduint is in the background and shows the media notification
 * (title, artist, artwork, previous / play-pause / next / close). The sound itself is played by the web view; the buttons
 * are sent back to the web page through PlayerPlugin.emit().
 */
public class MediaService extends Service {

    static final String CH = "conduint_player";
    static final int ID = 7151;
    static volatile boolean running = false;
    private static PowerManager.WakeLock wake;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent i, int flags, int startId) {
        String a = i == null ? null : i.getAction();
        if (a == null || "show".equals(a)) {
            Notification n = build(this, i == null ? null : i.getStringExtra("title"), i == null ? null : i.getStringExtra("artist"),
                i != null && i.getBooleanExtra("playing", true), i == null ? null : i.getStringExtra("art"),
                i == null ? 0 : i.getIntExtra("pos", 0), i == null ? 0 : i.getIntExtra("dur", 0));
            try {
                if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                else startForeground(ID, n);
                running = true;
            } catch (Throwable t) {
                stopSelf();
                return START_NOT_STICKY;
            }
            hold(this, i != null && i.getBooleanExtra("playing", true));
            return START_NOT_STICKY;
        }
        if ("close".equals(a)) {
            PlayerPlugin.emit("close");
            halt(this);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!running) { // a button was tapped after the service had already been stopped: nothing to control, do not linger
            stopSelf();
            return START_NOT_STICKY;
        }
        PlayerPlugin.emit(a); // toggle, next, prev
        return START_NOT_STICKY;
    }

    /** The task was swiped away from recent apps: the web view that makes the sound is gone, so remove the notification too. */
    @Override public void onTaskRemoved(Intent rootIntent) {
        halt(this);
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override public void onDestroy() {
        running = false;
        hold(this, false);
        drop();
        super.onDestroy();
    }

    /** Keeps the processor awake while a song is playing (screen off). Released when paused or stopped. */
    static synchronized void hold(Context c, boolean on) {
        try {
            if (on) {
                if (wake == null) {
                    PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
                    if (pm == null) return;
                    wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "conduint:player");
                    wake.setReferenceCounted(false);
                }
                if (!wake.isHeld()) wake.acquire(6L * 60L * 60L * 1000L);
            } else if (wake != null && wake.isHeld()) {
                wake.release();
            }
        } catch (Throwable ignored) { }
    }

    static void halt(Context c) {
        hold(c, false);
        running = false;
        drop();
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(ID);
        } catch (Throwable ignored) { }
    }

    private static PendingIntent act(Context c, String action, int req) {
        Intent i = new Intent(c, MediaService.class).setAction(action);
        int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getService(c, req, i, fl);
    }

    /* ---------- V0.10.1: the media session. Android 13+ (and Honor MagicOS) draw the artwork, title and buttons of the
       lock screen and quick settings player from a MediaSession, not from the notification itself. ---------- */
    private static MediaSession session;
    private static String metaKey = "";
    private static String artKey = null;
    private static Bitmap artBmp = null;

    /** Decodes the base64 artwork once and reuses it while the same picture is sent again (pause / play, seeks). */
    private static Bitmap artOf(String art) {
        if (art == null || art.isEmpty()) { artKey = null; artBmp = null; return null; }
        if (art.equals(artKey) && artBmp != null) return artBmp;
        try {
            byte[] raw = Base64.decode(art, Base64.DEFAULT);
            Bitmap bm = BitmapFactory.decodeByteArray(raw, 0, raw.length);
            artKey = art; artBmp = bm;
            return bm;
        } catch (Throwable t) { artKey = null; artBmp = null; return null; }
    }

    private static synchronized MediaSession session(Context c) {
        if (session == null) {
            try {
                MediaSession s = new MediaSession(c.getApplicationContext(), "ConduintPlayer");
                if (Build.VERSION.SDK_INT < 33) s.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
                s.setCallback(new MediaSession.Callback() {
                    @Override public void onPlay() { PlayerPlugin.emit("play"); }
                    @Override public void onPause() { PlayerPlugin.emit("pause"); }
                    @Override public void onSkipToNext() { PlayerPlugin.emit("next"); }
                    @Override public void onSkipToPrevious() { PlayerPlugin.emit("prev"); }
                    @Override public void onStop() { PlayerPlugin.emit("close"); halt(c.getApplicationContext()); }
                    @Override public void onSeekTo(long pos) { PlayerPlugin.emit("seek", pos); }
                }, new Handler(Looper.getMainLooper()));
                s.setActive(true);
                session = s;
            } catch (Throwable t) { session = null; }
        }
        return session;
    }

    private static synchronized void drop() {
        try { if (session != null) { session.setActive(false); session.release(); } } catch (Throwable ignored) { }
        session = null; metaKey = ""; artKey = null; artBmp = null;
    }

    /** Pushes title, artist, artwork, duration and the play state into the session. */
    private static void sync(MediaSession s, String title, String artist, boolean playing, Bitmap bm, int pos, int dur) {
        try {
            String t = title == null || title.isEmpty() ? "Conduint Files" : title;
            String key = t + "|" + artist + "|" + dur + "|" + (bm == null ? 0 : System.identityHashCode(bm));
            if (!key.equals(metaKey)) {
                MediaMetadata.Builder m = new MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE, t)
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, artist == null ? "" : artist)
                    .putString(MediaMetadata.METADATA_KEY_ALBUM, "S.O.I \u00d7 Bojack Security")
                    .putLong(MediaMetadata.METADATA_KEY_DURATION, Math.max(0, dur));
                if (bm != null) {
                    m.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, bm);
                    m.putBitmap(MediaMetadata.METADATA_KEY_ART, bm);
                    m.putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, bm);
                }
                s.setMetadata(m.build());
                metaKey = key;
            }
            long acts = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_STOP;
            s.setPlaybackState(new PlaybackState.Builder().setActions(acts)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, Math.max(0, pos), playing ? 1f : 0f, SystemClock.elapsedRealtime())
                .build());
        } catch (Throwable ignored) { }
    }

    static Notification build(Context c, String title, String artist, boolean playing, String art, int pos, int dur) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CH) == null) {
            NotificationChannel ch = new NotificationChannel(CH, "Music player", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
        b.setSmallIcon(playing ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause);
        b.setContentTitle(title == null || title.isEmpty() ? "Conduint Files" : title);
        b.setContentText(artist == null ? "" : artist);
        b.setOngoing(playing);
        b.setOnlyAlertOnce(true);
        b.setShowWhen(false);
        b.setSubText("S.O.I \u00d7 Bojack Security");
        b.setColor(0xFF22D3EE); // cyan, same as the app icon
        if (Build.VERSION.SDK_INT >= 21) b.setVisibility(Notification.VISIBILITY_PUBLIC);
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (open != null) {
            open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            b.setContentIntent(PendingIntent.getActivity(c, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)));
        }
        Bitmap bm = artOf(art);
        if (bm != null) b.setLargeIcon(bm);
        MediaSession ms = session(c);
        if (ms != null) sync(ms, title, artist, playing, bm, pos, dur);
        b.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, "Previous", act(c, "prev", 1)).build());
        b.addAction(new Notification.Action.Builder(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
            playing ? "Pause" : "Play", act(c, "toggle", 2)).build());
        b.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, "Next", act(c, "next", 3)).build());
        b.addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Close", act(c, "close", 4)).build());
        Notification.MediaStyle st = new Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2);
        if (ms != null) st.setMediaSession(ms.getSessionToken());
        b.setStyle(st);
        return b.build();
    }

    /** Refreshes the notification of a service that is already running (no service start, so it also works from the background). */
    static void refresh(Context c, String title, String artist, boolean playing, String art, int pos, int dur) {
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(ID, build(c, title, artist, playing, art, pos, dur));
            hold(c, playing);
        } catch (Throwable ignored) { }
    }
}
