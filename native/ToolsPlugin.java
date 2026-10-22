package com.fezzy.conduint;

import android.Manifest;
import android.app.ActivityManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.content.pm.Signature;
import android.os.BatteryManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.os.StatFs;
import android.provider.Settings;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Tools: permissions, RAM, storage analysis and cleanup, on real file paths.
 * Scans need "All files access" (MANAGE_EXTERNAL_STORAGE) on Android 11+, because plain file paths are
 * used. Deleting from the tools moves items into a hidden .conduint-trash folder on the same volume first,
 * so the recycle bin can bring them back.
 */
@CapacitorPlugin(name = "Tools")
public class ToolsPlugin extends Plugin {

    private static final String TRASH = ".conduint-trash";
    private static final Pattern PKG = Pattern.compile("^[a-z][a-z0-9_]*(\\.[a-zA-Z0-9_]+)+$");
    private static final Set<String> KEEP = new HashSet<String>();
    static {
        String[] k = {"Android", "DCIM", "Download", "Downloads", "Pictures", "Music", "Movies", "Documents",
            "Alarms", "Notifications", "Podcasts", "Ringtones", "Audiobooks", "Recordings"};
        for (String s : k) KEEP.add(s);
    }
    private static final String[] JUNK_EXT = {"tmp", "temp", "log", "bak", "old", "crdownload", "part",
        "partial", "download", "dmp", "chk", "thumbdata", "cache"};

    private volatile boolean cancelled = false;
    private long lastTick = 0;
    private PowerManager.WakeLock wake = null;
    private boolean cpuOn = false, screenOn = false;

    private interface Job { void run() throws Exception; }
    private static class Cancel extends IOException { Cancel() { super("Cancelled"); } }

    private Context ctx() { return getContext(); }

    private static String msg(Throwable t) {
        if (t instanceof Cancel) return "Cancelled";
        String m = t.getMessage();
        return m == null || m.isEmpty() ? t.getClass().getSimpleName() : m;
    }

    private void bg(final PluginCall call, final Job job) {
        cancelled = false;
        new Thread(new Runnable() {
            @Override public void run() {
                try { job.run(); }
                catch (Cancel c) { call.reject("Cancelled", "CANCELLED"); }
                catch (Throwable t) { call.reject(msg(t)); }
            }
        }).start();
    }

    private void check() throws Cancel { if (cancelled) throw new Cancel(); }

    private void tick(String text) {
        long n = System.currentTimeMillis();
        if (n - lastTick < 150) return;
        lastTick = n;
        JSObject o = new JSObject();
        o.put("name", text);
        notifyListeners("toolsProgress", o);
    }

    @PluginMethod
    public void cancel(PluginCall call) { cancelled = true; call.resolve(); }

    // ---------------------------------------------------------------- your apps (V0.19.0)
    // Apps you installed or updated (Google, Facebook...), not the bare system ones. Needs QUERY_ALL_PACKAGES (already in the manifest).
    @PluginMethod
    public void userApps(PluginCall call) {
        try {
            PackageManager pm = ctx().getPackageManager();
            List<String[]> rows = new ArrayList<>();
            for (ApplicationInfo ai : pm.getInstalledApplications(0)) {
                if (ai.packageName.equals(ctx().getPackageName())) continue;
                boolean sys = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
                boolean upd = (ai.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0;
                if (sys && !upd) continue;
                if (pm.getLaunchIntentForPackage(ai.packageName) == null) continue;
                rows.add(new String[]{String.valueOf(ai.loadLabel(pm)), ai.packageName});
            }
            Collections.sort(rows, (a, b) -> a[0].compareToIgnoreCase(b[0]));
            JSArray out = new JSArray();
            for (String[] r : rows) { JSObject o = new JSObject(); o.put("name", r[0]); o.put("pkg", r[1]); out.put(o); }
            JSObject res = new JSObject(); res.put("apps", out); call.resolve(res);
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    @PluginMethod
    public void appIcon(PluginCall call) {
        try {
            String pkg = call.getString("pkg", "");
            android.graphics.drawable.Drawable d = ctx().getPackageManager().getApplicationIcon(pkg);
            int n = 96;
            android.graphics.Bitmap bm = android.graphics.Bitmap.createBitmap(n, n, android.graphics.Bitmap.Config.ARGB_8888);
            android.graphics.Canvas c = new android.graphics.Canvas(bm);
            d.setBounds(0, 0, n, n); d.draw(c);
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            bm.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, bo);
            JSObject res = new JSObject();
            res.put("png", android.util.Base64.encodeToString(bo.toByteArray(), android.util.Base64.NO_WRAP));
            call.resolve(res);
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    @PluginMethod
    public void launchApp(PluginCall call) {
        try {
            Intent i = ctx().getPackageManager().getLaunchIntentForPackage(call.getString("pkg", ""));
            if (i == null) { call.reject("That app cannot be opened."); return; }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    // ---------------------------------------------------------------- permissions

    private boolean has(String p) {
        return ContextCompat.checkSelfPermission(ctx(), p) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean allFiles() {
        if (Build.VERSION.SDK_INT >= 30) return Environment.isExternalStorageManager();
        return has(Manifest.permission.READ_EXTERNAL_STORAGE) && has(Manifest.permission.WRITE_EXTERNAL_STORAGE);
    }

    private boolean battery() {
        if (Build.VERSION.SDK_INT >= 23) {
            PowerManager pm = (PowerManager) ctx().getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(ctx().getPackageName());
        }
        return true;
    }

    private boolean notif() {
        if (Build.VERSION.SDK_INT >= 33) return has(Manifest.permission.POST_NOTIFICATIONS);
        return true;
    }

    private JSObject permState() {
        JSObject o = new JSObject();
        o.put("sdk", Build.VERSION.SDK_INT);
        boolean media;
        if (Build.VERSION.SDK_INT >= 33) {
            media = has(Manifest.permission.READ_MEDIA_IMAGES) && has(Manifest.permission.READ_MEDIA_VIDEO)
                && has(Manifest.permission.READ_MEDIA_AUDIO);
            o.put("images", has(Manifest.permission.READ_MEDIA_IMAGES));
            o.put("video", has(Manifest.permission.READ_MEDIA_VIDEO));
            o.put("audio", has(Manifest.permission.READ_MEDIA_AUDIO));
        } else {
            media = has(Manifest.permission.READ_EXTERNAL_STORAGE);
            o.put("images", media);
            o.put("video", media);
            o.put("audio", media);
        }
        o.put("media", media);
        o.put("allFiles", allFiles());
        o.put("notifications", notif());
        o.put("battery", battery());
        o.put("wakeCpu", cpuOn);
        o.put("wakeScreen", screenOn);
        return o;
    }

    @PluginMethod
    public void permissions(PluginCall call) { call.resolve(permState()); }

    /** Asks for runtime permissions. Resolves at once; the web side re-reads permissions() when the app regains focus. */
    @PluginMethod
    public void request(PluginCall call) {
        try {
            String what = call.getString("what", "media");
            if (getActivity() == null) throw new IOException("No screen to ask from.");
            if ("allFiles".equals(what)) {
                if (Build.VERSION.SDK_INT >= 30) {
                    Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                        Uri.parse("package:" + ctx().getPackageName()));
                    try { getActivity().startActivity(i); }
                    catch (Exception e) { getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)); }
                } else {
                    ActivityCompat.requestPermissions(getActivity(), new String[]{
                        Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE}, 41);
                }
            } else if ("battery".equals(what)) {
                if (!battery()) {
                    try {
                        Intent bi = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            Uri.parse("package:" + ctx().getPackageName()));
                        bi.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        ctx().startActivity(bi);
                    } catch (Exception e) { openSettingsIntent("battery"); }
                }
            } else if ("notifications".equals(what)) {
                if (Build.VERSION.SDK_INT >= 33) {
                    String[] np = new String[]{Manifest.permission.POST_NOTIFICATIONS};
                    // V0.28.0: after "Don't allow" twice Android never shows the dialog again and the button looked dead. Open the settings page instead.
                    if (stuck("notifications", np)) openSettingsIntent("notifications");
                    else { markAsked("notifications"); ActivityCompat.requestPermissions(getActivity(), np, 42); }
                } else openSettingsIntent("notifications");
            } else {
                String[] p = Build.VERSION.SDK_INT >= 33
                    ? new String[]{Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.READ_MEDIA_AUDIO}
                    : new String[]{Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE};
                if (stuck("media", p)) openSettingsIntent("app");
                else { markAsked("media"); ActivityCompat.requestPermissions(getActivity(), p, 43); }
            }
            call.resolve(permState());
        } catch (Throwable t) {
            call.reject(msg(t));
        }
    }

    // V0.28.0: remembers that a runtime permission was asked for, so a permission Android will no longer ask about is sent to its settings page.
    private void markAsked(String key) {
        ctx().getSharedPreferences("conduint_perm", Context.MODE_PRIVATE).edit().putBoolean("asked_" + key, true).apply();
    }

    private boolean stuck(String key, String[] perms) {
        if (getActivity() == null) return false;
        if (!ctx().getSharedPreferences("conduint_perm", Context.MODE_PRIVATE).getBoolean("asked_" + key, false)) return false;
        for (String p : perms)
            if (!has(p) && !ActivityCompat.shouldShowRequestPermissionRationale(getActivity(), p)) return true;
        return false;
    }

    private void openSettingsIntent(String what) {
        Intent i;
        if ("storage".equals(what)) i = new Intent(Settings.ACTION_INTERNAL_STORAGE_SETTINGS);
        else if ("notifications".equals(what)) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx().getPackageName());
        } else if ("battery".equals(what)) i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
        else if ("apps".equals(what)) i = new Intent(Settings.ACTION_MANAGE_ALL_APPLICATIONS_SETTINGS);
        else i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { ctx().startActivity(i); }
        catch (Exception e) {
            Intent f = new Intent(Settings.ACTION_SETTINGS);
            f.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx().startActivity(f);
        }
    }

    /** Wake lock: cpu keeps the processor running with the screen off, screen keeps the display on while the app is open. */
    @PluginMethod
    public void wakeLock(PluginCall call) {
        try {
            cpuOn = call.getBoolean("cpu", false);
            screenOn = call.getBoolean("screen", false);
            PowerManager pm = (PowerManager) ctx().getSystemService(Context.POWER_SERVICE);
            if (cpuOn) {
                if (wake == null) wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "conduint:files");
                if (!wake.isHeld()) wake.acquire();
            } else if (wake != null && wake.isHeld()) {
                wake.release();
            }
            if (getActivity() != null) {
                final boolean sc = screenOn;
                getActivity().runOnUiThread(new Runnable() {
                    @Override public void run() {
                        Window w = getActivity().getWindow();
                        if (sc) w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                        else w.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    }
                });
            }
            call.resolve(permState());
        } catch (Throwable t) {
            call.reject(msg(t));
        }
    }

    @Override
    protected void handleOnDestroy() {
        try { if (wake != null && wake.isHeld()) wake.release(); } catch (Throwable ignore) { }
        super.handleOnDestroy();
    }

    // ---------------------------------------------------------------- library auto-detect

    private void libWalk(File d, Set<String> exts, JSArray out, int cap, int depth) throws Exception {
        check();
        if (depth > 14 || out.length() >= cap) return;
        File[] fs = d.listFiles();
        if (fs == null) return;
        for (File f : fs) {
            if (out.length() >= cap) return;
            String n = f.getName();
            if (n.startsWith(".")) continue;
            if (f.isDirectory()) {
                if (n.equals("node_modules") || n.equals("Android")) continue;
                libWalk(f, exts, out, cap, depth + 1);
            } else {
                int dot = n.lastIndexOf('.');
                if (dot < 0 || !exts.contains(n.substring(dot + 1).toLowerCase(Locale.ROOT))) continue;
                JSObject o = new JSObject();
                o.put("name", n);
                o.put("uri", Uri.fromFile(f).toString());
                o.put("dir", false);
                o.put("size", f.length());
                o.put("mtime", f.lastModified());
                File par = f.getParentFile();
                o.put("pname", par == null ? "" : par.getName());
                out.put(o);
                tick(n);
            }
        }
    }

    /** Finds every file of a kind on internal storage and SD cards by itself (needs All files access). */
    @PluginMethod
    public void library(final PluginCall call) {
        if (!allFiles()) {
            call.reject("Allow \"All files access\" first (Settings, Permissions).", "NOPERM");
            return;
        }
        bg(call, new Job() {
            @Override public void run() throws Exception {
                JSArray ea = call.getArray("exts");
                Set<String> exts = new HashSet<String>();
                if (ea != null) for (int i = 0; i < ea.length(); i++) exts.add(ea.getString(i).toLowerCase(Locale.ROOT));
                int cap = call.getInt("cap", 3000);
                JSArray out = new JSArray();
                libWalk(Environment.getExternalStorageDirectory(), exts, out, cap, 0);
                File[] vols = new File("/storage").listFiles();
                if (vols != null) for (File v : vols) {
                    String n = v.getName();
                    if (n.equals("emulated") || n.equals("self") || !v.isDirectory()) continue;
                    libWalk(v, exts, out, cap, 0);
                }
                JSObject o = new JSObject();
                o.put("items", out);
                call.resolve(o);
            }
        });
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try { openSettingsIntent(call.getString("what", "app")); call.resolve(); }
        catch (Throwable t) { call.reject(msg(t)); }
    }

    @PluginMethod
    public void notice(PluginCall call) {
        try {
            if (!notif()) { call.resolve(); return; }
            NotificationManager nm = (NotificationManager) ctx().getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel("conduint") == null)
                nm.createNotificationChannel(new NotificationChannel("conduint", "Cleanup results", NotificationManager.IMPORTANCE_DEFAULT));
            int icon = ctx().getApplicationInfo().icon;
            if (icon == 0) icon = android.R.drawable.stat_notify_more;
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx(), "conduint")
                .setSmallIcon(icon).setContentTitle(call.getString("title", "Conduint Files"))
                .setContentText(call.getString("text", "")).setAutoCancel(true);
            nm.notify((int) (System.currentTimeMillis() & 0x7fffffff), b.build());
            call.resolve();
        } catch (Throwable t) {
            call.reject(msg(t));
        }
    }

    // ---------------------------------------------------------------- storage and RAM info

    private List<File> roots() {
        List<File> out = new ArrayList<File>();
        File p = Environment.getExternalStorageDirectory();
        if (p != null && p.exists()) out.add(p);
        try {
            File[] ds = ctx().getExternalFilesDirs(null);
            if (ds != null) for (File d : ds) {
                if (d == null) continue;
                String s = d.getAbsolutePath();
                int k = s.indexOf("/Android/");
                if (k > 0) {
                    File r = new File(s.substring(0, k));
                    boolean dup = false;
                    for (File x : out) if (x.getAbsolutePath().equals(r.getAbsolutePath())) dup = true;
                    if (!dup && r.exists()) out.add(r);
                }
            }
        } catch (Throwable ignored) { }
        return out;
    }

    private File rootOf(File f) {
        String s = f.getAbsolutePath();
        for (File r : roots()) {
            String rs = r.getAbsolutePath();
            if (s.equals(rs) || s.startsWith(rs + "/")) return r;
        }
        return Environment.getExternalStorageDirectory();
    }

    @PluginMethod
    public void storageInfo(PluginCall call) {
        try {
            JSArray a = new JSArray();
            for (File r : roots()) {
                StatFs s = new StatFs(r.getAbsolutePath());
                JSObject o = new JSObject();
                o.put("path", r.getAbsolutePath());
                o.put("total", s.getTotalBytes());
                o.put("free", s.getAvailableBytes());
                o.put("primary", r.equals(Environment.getExternalStorageDirectory()));
                a.put(o);
            }
            JSObject res = new JSObject();
            res.put("volumes", a);
            call.resolve(res);
        } catch (Throwable t) {
            call.reject(msg(t));
        }
    }

    private JSObject mem() {
        ActivityManager am = (ActivityManager) ctx().getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        am.getMemoryInfo(mi);
        JSObject o = new JSObject();
        o.put("total", mi.totalMem);
        o.put("avail", mi.availMem);
        o.put("threshold", mi.threshold);
        o.put("low", mi.lowMemory);
        return o;
    }

    @PluginMethod
    public void ramInfo(PluginCall call) { call.resolve(mem()); }

    /**
     * Android does not let an app clear other apps' memory directly. What an app can do is ask the system to
     * stop other apps' background processes (they restart later when needed) and release its own memory.
     */
    @PluginMethod
    public void ramBoost(final PluginCall call) {
        bg(call, new Job() {
            @Override public void run() throws Exception {
                long before = mem().getLong("avail");
                ActivityManager am = (ActivityManager) ctx().getSystemService(Context.ACTIVITY_SERVICE);
                PackageManager pm = ctx().getPackageManager();
                int n = 0;
                List<ApplicationInfo> apps = pm.getInstalledApplications(0);
                for (ApplicationInfo ai : apps) {
                    check();
                    if (ai.packageName.equals(ctx().getPackageName())) continue;
                    if ((ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0) continue;
                    if ((ai.flags & ApplicationInfo.FLAG_STOPPED) != 0) continue;
                    try { am.killBackgroundProcesses(ai.packageName); n++; } catch (Throwable ignored) { }
                    tick(ai.packageName);
                }
                System.gc();
                Runtime.getRuntime().gc();
                try { Thread.sleep(900); } catch (InterruptedException ignored) { }
                JSObject m = mem();
                JSObject o = new JSObject();
                o.put("before", before);
                o.put("after", m.getLong("avail"));
                o.put("total", m.getLong("total"));
                o.put("apps", n);
                call.resolve(o);
            }
        });
    }

    // ---------------------------------------------------------------- walking

    private static String ext(String name) {
        int d = name.lastIndexOf('.');
        return d < 0 || d == name.length() - 1 ? "" : name.substring(d + 1).toLowerCase(Locale.ROOT);
    }

    private static boolean in(String list, String e) { return !e.isEmpty() && (" " + list + " ").contains(" " + e + " "); }

    private static String cat(String e) {
        if (in("jpg jpeg png gif webp bmp svg avif heic", e)) return "images";
        if (in("mp4 mkv webm mov m4v 3gp avi", e)) return "videos";
        if (in("mp3 m4a aac wav ogg opus flac amr", e)) return "audio";
        if (in("pdf txt md csv json html doc docx xls xlsx ppt pptx odt rtf", e)) return "docs";
        if (in("apk xapk apks", e)) return "apks";
        if (in("zip rar 7z tar gz bz2 xz", e)) return "archives";
        return "other";
    }

    private interface Visit { void file(File f, long size, long mtime) throws Exception; }

    /** Depth-first walk. Skips the recycle bin, hidden system folders and Android/ unless asked. */
    private void walk(File dir, int depth, boolean inclAndroid, Visit v) throws Exception {
        check();
        if (depth > 25) return;
        File[] kids = dir.listFiles();
        if (kids == null) return;
        for (File k : kids) {
            check();
            String n = k.getName();
            if (k.isDirectory()) {
                if (n.equals(TRASH)) continue;
                if (!inclAndroid && depth == 0 && n.equals("Android")) continue;
                tick(n);
                walk(k, depth + 1, inclAndroid, v);
            } else {
                v.file(k, k.length(), k.lastModified());
            }
        }
    }

    private long sizeOf(File f) {
        if (f.isFile()) return f.length();
        long[] t = {0};
        try {
            walk(f, 0, true, new Visit() {
                @Override public void file(File x, long s, long m) { t[0] += s; }
            });
        } catch (Exception ignored) { }
        return t[0];
    }

    private JSObject fe(File f, long size, long mtime) {
        JSObject o = new JSObject();
        o.put("path", f.getAbsolutePath());
        o.put("name", f.getName());
        o.put("size", size);
        o.put("mtime", mtime);
        o.put("dir", f.isDirectory());
        return o;
    }

    private boolean needAll(PluginCall call) {
        if (allFiles()) return true;
        call.reject("Allow \"All files access\" first (Settings, Permissions).", "NOPERM");
        return false;
    }

    // ---------------------------------------------------------------- scans

    @PluginMethod
    public void analyze(final PluginCall call) {
        if (!needAll(call)) return;
        bg(call, new Job() {
            @Override public void run() throws Exception {
                final Map<String, long[]> byCat = new HashMap<String, long[]>();
                final Map<String, long[]> top = new HashMap<String, long[]>();
                for (File r : roots()) {
                    final String rp = r.getAbsolutePath();
                    walk(r, 0, false, new Visit() {
                        @Override public void file(File f, long s, long m) {
                            String c = cat(ext(f.getName()));
                            long[] a = byCat.get(c); if (a == null) { a = new long[2]; byCat.put(c, a); }
                            a[0] += s; a[1]++;
                            String rel = f.getAbsolutePath().substring(rp.length() + 1);
                            int sl = rel.indexOf('/');
                            String t = sl < 0 ? "(root files)" : rel.substring(0, sl);
                            long[] b = top.get(t); if (b == null) { b = new long[2]; top.put(t, b); }
                            b[0] += s; b[1]++;
                        }
                    });
                }
                JSArray cats = new JSArray();
                for (Map.Entry<String, long[]> e : byCat.entrySet()) {
                    JSObject o = new JSObject();
                    o.put("name", e.getKey()); o.put("size", e.getValue()[0]); o.put("count", e.getValue()[1]);
                    cats.put(o);
                }
                List<Map.Entry<String, long[]>> tl = new ArrayList<Map.Entry<String, long[]>>(top.entrySet());
                Collections.sort(tl, new Comparator<Map.Entry<String, long[]>>() {
                    @Override public int compare(Map.Entry<String, long[]> x, Map.Entry<String, long[]> y) {
                        return Long.compare(y.getValue()[0], x.getValue()[0]);
                    }
                });
                JSArray folders = new JSArray();
                for (int i = 0; i < tl.size() && i < 12; i++) {
                    JSObject o = new JSObject();
                    o.put("name", tl.get(i).getKey()); o.put("size", tl.get(i).getValue()[0]); o.put("count", tl.get(i).getValue()[1]);
                    folders.put(o);
                }
                JSObject res = new JSObject();
                res.put("cats", cats);
                res.put("folders", folders);
                call.resolve(res);
            }
        });
    }

    /**
     * V0.28.2: folderSizes({path}) -> {items:[{name,path,size,count}], looseSize, looseCount, total, totalCount}.
     * One level of a folder: every sub-folder with its full size (everything inside it, hidden files and Android/ included),
     * biggest first, plus the files that sit directly in the folder. Only paths under /storage are accepted. cancel() stops it.
     * Android 11+ hides other apps' folders under Android/data, so those count as empty.
     */
    @PluginMethod
    public void folderSizes(final PluginCall call) {
        if (!needAll(call)) return;
        bg(call, new Job() {
            @Override public void run() throws Exception {
                String p = call.getString("path", "");
                File dir = new File(p == null ? "" : p).getCanonicalFile();
                if (!dir.getPath().startsWith("/storage/") || !dir.isDirectory()) throw new IOException("That folder is not available.");
                File[] kids = dir.listFiles();
                if (kids == null) throw new IOException("Android would not let Conduint open that folder.");
                final List<JSObject> out = new ArrayList<JSObject>();
                long looseSize = 0, looseCount = 0, total = 0, totalCount = 0;
                for (File k : kids) {
                    check();
                    if (k.isDirectory()) {
                        if (k.getName().equals(TRASH)) continue;
                        final long[] t = new long[2];
                        tick(k.getName());
                        walk(k, 1, true, new Visit() {
                            @Override public void file(File f, long s, long m) { t[0] += s; t[1]++; }
                        });
                        JSObject o = new JSObject();
                        o.put("name", k.getName());
                        o.put("path", k.getAbsolutePath());
                        o.put("size", t[0]);
                        o.put("count", t[1]);
                        out.add(o);
                        total += t[0];
                        totalCount += t[1];
                    } else {
                        looseSize += k.length();
                        looseCount++;
                        total += k.length();
                        totalCount++;
                    }
                }
                Collections.sort(out, new Comparator<JSObject>() {
                    @Override public int compare(JSObject x, JSObject y) { return Long.compare(y.optLong("size"), x.optLong("size")); }
                });
                JSArray arr = new JSArray();
                for (int i = 0; i < out.size() && i < 300; i++) arr.put(out.get(i));
                JSObject res = new JSObject();
                res.put("items", arr);
                res.put("looseSize", looseSize);
                res.put("looseCount", looseCount);
                res.put("total", total);
                res.put("totalCount", totalCount);
                call.resolve(res);
            }
        });
    }

    @PluginMethod
    public void largeFiles(final PluginCall call) {
        if (!needAll(call)) return;
        bg(call, new Job() {
            @Override public void run() throws Exception {
                final long min = (long) (call.getDouble("minMb", 50.0) * 1048576L);
                final List<JSObject> out = new ArrayList<JSObject>();
                for (File r : roots()) walk(r, 0, false, new Visit() {
                    @Override public void file(File f, long s, long m) {
                        if (s >= min && !f.getName().startsWith(".")) out.add(fe(f, s, m));
                    }
                });
                Collections.sort(out, new Comparator<JSObject>() {
                    @Override public int compare(JSObject x, JSObject y) {
                        try { return Long.compare(y.getLong("size"), x.getLong("size")); } catch (Exception e) { return 0; }
                    }
                });
                JSArray a = new JSArray();
                for (int i = 0; i < out.size() && i < 150; i++) a.put(out.get(i));
                JSObject res = new JSObject();
                res.put("items", a);
                call.resolve(res);
            }
        });
    }

    @PluginMethod
    public void filesByAge(final PluginCall call) {
        if (!needAll(call)) return;
        bg(call, new Job() {
            @Override public void run() throws Exception {
                final long now = System.currentTimeMillis();
                final long day = 86400000L;
                final long minAge = (long) (call.getDouble("minDays", 0.0) * day);
                final long maxAge = (long) (call.getDouble("maxDays", 100000.0) * day);
                final long minSize = (long) (call.getDouble("minKb", 0.0) * 1024L);
                final boolean newest = Boolean.TRUE.equals(call.getBoolean("newest", false));
                final List<JSObject> out = new ArrayList<JSObject>();
                for (File r : roots()) walk(r, 0, false, new Visit() {
                    @Override public void file(File f, long s, long m) {
                        long age = now - m;
                        if (s >= minSize && age >= minAge && age <= maxAge && !f.getName().startsWith(".")) out.add(fe(f, s, m));
                    }
                });
                final boolean byNew = newest;
                Collections.sort(out, new Comparator<JSObject>() {
                    @Override public int compare(JSObject x, JSObject y) {
                        try {
                            return byNew ? Long.compare(y.getLong("mtime"), x.getLong("mtime")) : Long.compare(y.getLong("size"), x.getLong("size"));
                        } catch (Exception e) { return 0; }
                    }
                });
                JSArray a = new JSArray();
                for (int i = 0; i < out.size() && i < 200; i++) a.put(out.get(i));
                JSObject res = new JSObject();
                res.put("items", a);
                call.resolve(res);
            }
        });
    }

    @PluginMethod
    public void junk(final PluginCall call) {
        if (!needAll(call)) return;
        bg(call, new Job() {
            @Override public void run() throws Exception {
                final List<JSObject> out = new ArrayList<JSObject>();
                final Set<String> je = new HashSet<String>();
                for (String s : JUNK_EXT) je.add(s);
                for (File r : roots()) scanJunk(r, 0, je, out);
                JSArray a = new JSArray();
                for (int i = 0; i < out.size() && i < 2000; i++) a.put(out.get(i));
                JSObject res = new JSObject();
                res.put("items", a);
                call.resolve(res);
            }
        });
    }

    private void scanJunk(File dir, int depth, Set<String> je, List<JSObject> out) throws Exception {
        check();
        if (depth > 25) return;
        File[] kids = dir.listFiles();
        if (kids == null) return;
        for (File k : kids) {
            check();
            String n = k.getName();
            if (k.isDirectory()) {
                if (n.equals(TRASH) || (depth == 0 && n.equals("Android"))) continue;
                String l = n.toLowerCase(Locale.ROOT);
                if (l.equals(".thumbnails") || l.equals("thumbnails") || l.equals(".cache") || l.equals("lost+found")) {
                    JSObject o = fe(k, sizeOf(k), k.lastModified()); o.put("why", "Cache folder"); out.add(o);
                    continue;
                }
                tick(n);
                scanJunk(k, depth + 1, je, out);
            } else {
                String e = ext(n);
                long s = k.length();
                String why = null;
                if (s == 0 && !n.equals(".nomedia")) why = "Empty file";
                else if (je.contains(e)) why = e.equals("log") ? "Log file" : "Temporary or leftover file";
                else if (n.endsWith("~")) why = "Backup leftover";
                if (why != null) { JSObject o = fe(k, s, k.lastModified()); o.put("why", why); out.add(o); }
            }
        }
    }

    @PluginMethod
    public void apks(final PluginCall call) {
        if (!needAll(call)) return;
        bg(call, new Job() {
            @Override public void run() throws Exception {
                final List<JSObject> out = new ArrayList<JSObject>();
                for (File r : roots()) walk(r, 0, false, new Visit() {
                    @Override public void file(File f, long s, long m) {
                        String e = ext(f.getName());
                        if (e.equals("apk") || e.equals("xapk") || e.equals("apks")) out.add(fe(f, s, m));
                    }
                });
                JSArray a = new JSArray();
                for (JSObject o : out) a.put(o);
                JSObject res = new JSObject();
                res.put("items", a);
                call.resolve(res);
            }
        });
    }

    @PluginMethod
    public void emptyFolders(final PluginCall call) {
        if (!needAll(call)) return;
        bg(call, new Job() {
            @Override public void run() throws Exception {
                final List<JSObject> out = new ArrayList<JSObject>();
                for (File r : roots()) emptyTree(r, 0, out, true);
                JSArray a = new JSArray();
                for (int i = 0; i < out.size() && i < 3000; i++) a.put(out.get(i));
                JSObject res = new JSObject();
                res.put("items", a);
                call.resolve(res);
            }
        });
    }

    /** Returns true when dir holds no files at any depth. Reports the top-most empty folder of each empty tree. */
    private boolean emptyTree(File dir, int depth, List<JSObject> out, boolean isRoot) throws Exception {
        check();
        File[] kids = dir.listFiles();
        if (kids == null) return false;
        if (depth > 25) return false;
        boolean allEmpty = true;
        List<File> emptyKids = new ArrayList<File>();
        for (File k : kids) {
            check();
            if (k.isDirectory()) {
                String n = k.getName();
                if (n.equals(TRASH) || (depth == 0 && n.equals("Android"))) { allEmpty = false; continue; }
                tick(n);
                if (emptyTree(k, depth + 1, out, false)) emptyKids.add(k); else allEmpty = false;
            } else allEmpty = false;
        }
        if (isRoot) {
            for (File k : emptyKids) addEmpty(k, depth + 1, out);
            return false;
        }
        if (allEmpty) return true;
        for (File k : emptyKids) addEmpty(k, depth + 1, out);
        return false;
    }

    private void addEmpty(File k, int depth, List<JSObject> out) {
        // standard top-level folders stay: Android recreates them and apps expect them
        if (depth == 1 && KEEP.contains(k.getName())) return;
        JSObject o = fe(k, 0, k.lastModified());
        out.add(o);
    }

    @PluginMethod
    public void orphans(final PluginCall call) {
        if (!needAll(call)) return;
        bg(call, new Job() {
            @Override public void run() throws Exception {
                PackageManager pm = ctx().getPackageManager();
                final Set<String> installed = new HashSet<String>();
                for (ApplicationInfo ai : pm.getInstalledApplications(0)) installed.add(ai.packageName);
                List<JSObject> out = new ArrayList<JSObject>();
                for (File r : roots()) {
                    checkOrphans(r, installed, out, "Top level");
                    for (String sub : new String[]{"Android/data", "Android/media", "Android/obb"})
                        checkOrphans(new File(r, sub), installed, out, sub);
                }
                JSArray a = new JSArray();
                for (JSObject o : out) a.put(o);
                JSObject res = new JSObject();
                res.put("items", a);
                res.put("installedCount", installed.size());
                // If only a handful of packages are visible the system is hiding them, so a result would be unsafe.
                res.put("visibleOk", installed.size() > 15);
                call.resolve(res);
            }
        });
    }

    private void checkOrphans(File dir, Set<String> installed, List<JSObject> out, String where) throws Exception {
        File[] kids = dir.listFiles();
        if (kids == null) return;
        for (File k : kids) {
            check();
            if (!k.isDirectory()) continue;
            String n = k.getName();
            if (!PKG.matcher(n).matches() || installed.contains(n)) continue;
            tick(n);
            JSObject o = fe(k, sizeOf(k), k.lastModified());
            o.put("where", where);
            out.add(o);
        }
    }

    @PluginMethod
    public void duplicates(final PluginCall call) {
        if (!needAll(call)) return;
        bg(call, new Job() {
            @Override public void run() throws Exception {
                final long min = (long) (call.getDouble("minKb", 4.0) * 1024L);
                final Map<Long, List<File>> bySize = new HashMap<Long, List<File>>();
                for (File r : roots()) walk(r, 0, false, new Visit() {
                    @Override public void file(File f, long s, long m) {
                        if (s < min || f.getName().startsWith(".")) return;
                        List<File> l = bySize.get(s);
                        if (l == null) { l = new ArrayList<File>(); bySize.put(s, l); }
                        l.add(f);
                    }
                });
                List<JSObject> groups = new ArrayList<JSObject>();
                for (Map.Entry<Long, List<File>> e : bySize.entrySet()) {
                    if (e.getValue().size() < 2) continue;
                    check();
                    Map<String, List<File>> byHash = new HashMap<String, List<File>>();
                    for (File f : e.getValue()) {
                        tick(f.getName());
                        String hsh;
                        try { hsh = hash(f); } catch (IOException x) { continue; }
                        List<File> l = byHash.get(hsh);
                        if (l == null) { l = new ArrayList<File>(); byHash.put(hsh, l); }
                        l.add(f);
                    }
                    for (List<File> same : byHash.values()) {
                        if (same.size() < 2) continue;
                        Collections.sort(same, new Comparator<File>() {
                            @Override public int compare(File x, File y) { return Long.compare(x.lastModified(), y.lastModified()); }
                        });
                        JSArray fs = new JSArray();
                        for (File f : same) fs.put(fe(f, e.getKey().longValue(), f.lastModified()));
                        JSObject g = new JSObject();
                        g.put("size", e.getKey().longValue());
                        g.put("files", fs);
                        groups.add(g);
                    }
                }
                Collections.sort(groups, new Comparator<JSObject>() {
                    @Override public int compare(JSObject x, JSObject y) {
                        try {
                            long a = x.getLong("size") * (x.getJSONArray("files").length() - 1);
                            long b = y.getLong("size") * (y.getJSONArray("files").length() - 1);
                            return Long.compare(b, a);
                        } catch (Exception e) { return 0; }
                    }
                });
                JSArray a = new JSArray();
                for (int i = 0; i < groups.size() && i < 300; i++) a.put(groups.get(i));
                JSObject res = new JSObject();
                res.put("groups", a);
                call.resolve(res);
            }
        });
    }

    /** Full-content hash (MD5) so two files are only called duplicates when every byte matches. */
    private String hash(File f) throws IOException {
        FileInputStream in = new FileInputStream(f);
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) { check(); md.update(buf, 0, n); }
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest()) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IOException("MD5 is not available");
        } finally {
            try { in.close(); } catch (IOException ignored) { }
        }
    }

    // ---------------------------------------------------------------- cleanup

    private long wipe(File f, boolean self) {
        long freed = 0;
        if (f == null || !f.exists()) return 0;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) freed += wipe(k, true);
        if (f.isFile()) { long s = f.length(); if (f.delete()) freed += s; }
        else if (self) f.delete();
        return freed;
    }

    /** Clears this app's own cache folders. Android does not allow clearing other apps' caches from an app. */
    @PluginMethod
    public void clearCache(PluginCall call) {
        try {
            long freed = 0;
            freed += wipe(ctx().getCacheDir(), false);
            freed += wipe(ctx().getCodeCacheDir(), false);
            File ext = ctx().getExternalCacheDir();
            if (ext != null) freed += wipe(ext, false);
            JSObject o = new JSObject();
            o.put("freed", freed);
            call.resolve(o);
        } catch (Throwable t) {
            call.reject(msg(t));
        }
    }

    @PluginMethod
    public void cacheSize(PluginCall call) {
        try {
            long s = sizeOf(ctx().getCacheDir()) + sizeOf(ctx().getCodeCacheDir());
            File ext = ctx().getExternalCacheDir();
            if (ext != null) s += sizeOf(ext);
            JSObject o = new JSObject();
            o.put("size", s);
            call.resolve(o);
        } catch (Throwable t) {
            call.reject(msg(t));
        }
    }

    private static void rmTree(File f) throws IOException {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) rmTree(k);
        if (!f.delete() && f.exists()) throw new IOException("Couldn't delete " + f.getName());
    }

    private File uniq(File dir, String name) {
        File t = new File(dir, name);
        int i = 1;
        while (t.exists()) t = new File(dir, i++ + "~" + name);
        return t;
    }

    private static void copyTree(File a, File b) throws IOException {
        if (a.isDirectory()) {
            if (!b.mkdirs() && !b.isDirectory()) throw new IOException("Couldn't create " + b.getName());
            File[] kids = a.listFiles();
            if (kids != null) for (File k : kids) copyTree(k, new File(b, k.getName()));
        } else {
            java.io.FileOutputStream o = new java.io.FileOutputStream(b);
            FileInputStream in = new FileInputStream(a);
            try {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
            } finally { in.close(); o.close(); }
        }
    }

    /** Move into the hidden recycle folder of the same volume. Returns where each item went. */
    @PluginMethod
    public void trash(final PluginCall call) {
        if (!needAll(call)) return;
        bg(call, new Job() {
            @Override public void run() throws Exception {
                JSArray paths = call.getArray("paths");
                if (paths == null) throw new IOException("Nothing to delete");
                JSArray out = new JSArray();
                int failed = 0;
                for (int i = 0; i < paths.length(); i++) {
                    check();
                    File f = new File(paths.getString(i));
                    if (!f.exists()) { failed++; continue; }
                    File tr = new File(rootOf(f), TRASH);
                    tr.mkdirs();
                    try { new File(tr, ".nomedia").createNewFile(); } catch (IOException ignored) { }
                    long size = sizeOf(f);
                    boolean dir = f.isDirectory();
                    File dst = uniq(tr, f.getName());
                    if (!f.renameTo(dst)) {
                        copyTree(f, dst);
                        rmTree(f);
                    }
                    tick(f.getName());
                    JSObject o = new JSObject();
                    o.put("from", f.getAbsolutePath());
                    o.put("trash", dst.getAbsolutePath());
                    o.put("tname", dst.getName());
                    o.put("name", f.getName());
                    o.put("size", size);
                    o.put("dir", dir);
                    out.put(o);
                }
                JSObject res = new JSObject();
                res.put("items", out);
                res.put("failed", failed);
                call.resolve(res);
            }
        });
    }

    @PluginMethod
    public void fsRemove(final PluginCall call) {
        if (!needAll(call)) return;
        bg(call, new Job() {
            @Override public void run() throws Exception {
                JSArray paths = call.getArray("paths");
                if (paths == null) throw new IOException("Nothing to delete");
                long freed = 0;
                for (int i = 0; i < paths.length(); i++) {
                    check();
                    File f = new File(paths.getString(i));
                    if (!f.exists()) continue;
                    freed += sizeOf(f);
                    rmTree(f);
                    tick(f.getName());
                }
                JSObject res = new JSObject();
                res.put("freed", freed);
                call.resolve(res);
            }
        });
    }

    @PluginMethod
    public void fsRestore(final PluginCall call) {
        bg(call, new Job() {
            @Override public void run() throws Exception {
                JSArray items = call.getArray("items");
                if (items == null) throw new IOException("Nothing to restore");
                JSArray out = new JSArray();
                for (int i = 0; i < items.length(); i++) {
                    check();
                    org.json.JSONObject it = items.getJSONObject(i);
                    File src = new File(it.getString("trash"));
                    File from = new File(it.getString("from"));
                    String id = it.optString("id");
                    if (!src.exists()) { JSObject o = new JSObject(); o.put("id", id); o.put("lost", true); out.put(o); continue; }
                    File parent = from.getParentFile();
                    if (parent == null || (!parent.exists() && !parent.mkdirs())) parent = rootOf(src);
                    File dst = uniq(parent, from.getName());
                    if (!src.renameTo(dst)) { copyTree(src, dst); rmTree(src); }
                    JSObject o = new JSObject();
                    o.put("id", id);
                    o.put("path", dst.getAbsolutePath());
                    out.put(o);
                }
                JSObject res = new JSObject();
                res.put("items", out);
                call.resolve(res);
            }
        });
    }

    @PluginMethod
    public void fsExists(PluginCall call) {
        JSArray paths = call.getArray("paths");
        JSArray out = new JSArray();
        try {
            if (paths != null) for (int i = 0; i < paths.length(); i++) out.put(new File(paths.getString(i)).exists());
        } catch (Exception ignored) { }
        JSObject res = new JSObject();
        res.put("exists", out);
        call.resolve(res);
    }

    // ---------- V0.15.0: install apps, hidden files, charging state, files handed over by other apps ----------

    /** Installs an APK from a real path (a cache copy of a picked file, or a file on storage). Android asks the person to confirm. */
    @PluginMethod
    public void installApk(PluginCall call) {
        try {
            String p = call.getString("path");
            if (p == null) throw new IOException("No file to install");
            File f = new File(p);
            if (!f.isFile()) throw new IOException("That file is gone");
            if (getActivity() == null) throw new IOException("No screen to ask from.");
            if (Build.VERSION.SDK_INT >= 26 && !ctx().getPackageManager().canRequestPackageInstalls()) {
                Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx().getPackageName()));
                getActivity().startActivity(s);
                JSObject o = new JSObject();
                o.put("needAllow", true);
                call.resolve(o);
                return;
            }
            Uri u = FileProvider.getUriForFile(ctx(), ctx().getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(u, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            JSObject o = new JSObject();
            o.put("needAllow", false);
            call.resolve(o);
        } catch (Throwable t) { call.reject(msg(t)); }
    }

    // ---------- V0.25.0: APK inspector (Shield phase 3) ----------

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format(Locale.ROOT, "%02x", x));
        return sb.toString();
    }

    /** Signing certificates of a package, oldest first. Key rotation gives a history, several signers give all of them. */
    @SuppressWarnings("deprecation")
    private static Signature[] signersOf(PackageInfo pi) {
        if (pi == null) return new Signature[0];
        if (Build.VERSION.SDK_INT >= 28) {
            android.content.pm.SigningInfo si = pi.signingInfo;
            if (si != null) {
                Signature[] s = si.hasMultipleSigners() ? si.getApkContentsSigners() : si.getSigningCertificateHistory();
                if (s != null && s.length > 0) return s;
            }
        }
        Signature[] s = pi.signatures;
        return s == null ? new Signature[0] : s;
    }

    private static List<String> prints(Signature[] sigs) {
        List<String> out = new ArrayList<String>();
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            for (Signature sg : sigs) out.add(hex(md.digest(sg.toByteArray())));
        } catch (Throwable t) { /* no fingerprints */ }
        return out;
    }

    /**
     * Reads an APK without installing it: name, version, SDK levels, requested permissions, the permissions that guard its services and
     * receivers (accessibility, notification listener, device admin, VPN), the signing certificates, and whether a copy with the same
     * package id is installed and signed by the same key. Never throws for a bad file: ok=false means Android could not read it.
     */
    @PluginMethod
    public void inspectApk(final PluginCall call) {
        bg(call, new Job() {
            @SuppressWarnings("deprecation")
            @Override public void run() throws Exception {
                String p = call.getString("path");
                if (p == null) throw new IOException("No file to inspect");
                File f = new File(p);
                if (!f.isFile()) throw new IOException("That file is gone");
                PackageManager pm = ctx().getPackageManager();
                int base = PackageManager.GET_PERMISSIONS | PackageManager.GET_SERVICES | PackageManager.GET_RECEIVERS;
                int sig = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
                PackageInfo pi = null;
                boolean signRead = true;
                try { pi = pm.getPackageArchiveInfo(p, base | sig); } catch (Throwable t) { pi = null; }
                if (pi == null) {
                    signRead = false;
                    try { pi = pm.getPackageArchiveInfo(p, base); } catch (Throwable t) { pi = null; }
                }
                JSObject o = new JSObject();
                o.put("size", f.length());
                if (pi == null || pi.applicationInfo == null || pi.packageName == null) {
                    o.put("ok", false);
                    call.resolve(o);
                    return;
                }
                ApplicationInfo ai = pi.applicationInfo;
                ai.sourceDir = p;
                ai.publicSourceDir = p;
                o.put("ok", true);
                o.put("pkg", pi.packageName);
                String label = pi.packageName;
                try { CharSequence l = ai.loadLabel(pm); if (l != null) label = l.toString(); } catch (Throwable t) { /* keep the package id */ }
                o.put("label", label);
                o.put("verName", pi.versionName == null ? "" : pi.versionName);
                o.put("verCode", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : (long) pi.versionCode);
                o.put("targetSdk", ai.targetSdkVersion);
                o.put("minSdk", Build.VERSION.SDK_INT >= 24 ? ai.minSdkVersion : 0);
                o.put("debuggable", (ai.flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
                JSArray req = new JSArray();
                if (pi.requestedPermissions != null) for (String r : pi.requestedPermissions) if (r != null) req.put(r);
                o.put("requested", req);
                Set<String> binds = new HashSet<String>();
                if (pi.services != null) for (ServiceInfo si : pi.services) if (si != null && si.permission != null) binds.add(si.permission);
                if (pi.receivers != null) for (ActivityInfo ri : pi.receivers) if (ri != null && ri.permission != null) binds.add(ri.permission);
                JSArray bd = new JSArray();
                for (String b : binds) bd.put(b);
                o.put("binds", bd);
                o.put("signRead", signRead);
                Signature[] sigs = signRead ? signersOf(pi) : new Signature[0];
                boolean multi = false;
                if (Build.VERSION.SDK_INT >= 28 && pi.signingInfo != null) multi = pi.signingInfo.hasMultipleSigners();
                o.put("multi", multi);
                JSArray sa = new JSArray();
                try {
                    CertificateFactory cf = CertificateFactory.getInstance("X.509");
                    MessageDigest md = MessageDigest.getInstance("SHA-256");
                    for (Signature sg : sigs) {
                        try {
                            X509Certificate c = (X509Certificate) cf.generateCertificate(new ByteArrayInputStream(sg.toByteArray()));
                            JSObject so = new JSObject();
                            so.put("sha256", hex(md.digest(c.getEncoded())));
                            String subj = c.getSubjectX500Principal().getName();
                            String iss = c.getIssuerX500Principal().getName();
                            so.put("subject", subj);
                            so.put("issuer", iss);
                            so.put("selfSigned", subj.equals(iss));
                            so.put("from", c.getNotBefore().getTime());
                            so.put("to", c.getNotAfter().getTime());
                            so.put("alg", c.getSigAlgName());
                            sa.put(so);
                        } catch (Throwable t) { /* skip one unreadable certificate */ }
                    }
                } catch (Throwable t) { /* no certificate factory: leave the list empty */ }
                o.put("signers", sa);
                PackageInfo inst = null;
                try { inst = pm.getPackageInfo(pi.packageName, sig); } catch (Throwable t) { inst = null; }
                o.put("installed", inst != null);
                if (inst != null) {
                    o.put("installedVer", inst.versionName == null ? "" : inst.versionName);
                    if (signRead) {
                        List<String> a = prints(sigs), b = prints(signersOf(inst));
                        boolean same = false;
                        for (String x : a) if (b.contains(x)) same = true;
                        if (!a.isEmpty() && !b.isEmpty()) o.put("installedMatch", same);
                    }
                }
                call.resolve(o);
            }
        });
    }

    /** Files and folders that start with a dot, or sit inside a dot folder, biggest first. System noise (thumbnails, trash) is skipped. */
    @PluginMethod
    public void hiddenFiles(final PluginCall call) {
        if (!needAll(call)) return;
        bg(call, new Job() {
            @Override public void run() throws Exception {
                final List<JSObject> out = new ArrayList<JSObject>();
                for (File r : roots()) walkHidden(r, false, 0, out);
                Collections.sort(out, new Comparator<JSObject>() {
                    @Override public int compare(JSObject x, JSObject y) {
                        try { return Long.compare(y.getLong("size"), x.getLong("size")); } catch (Exception e) { return 0; }
                    }
                });
                JSArray a = new JSArray();
                for (int i = 0; i < out.size() && i < 250; i++) a.put(out.get(i));
                JSObject res = new JSObject();
                res.put("items", a);
                res.put("total", out.size());
                call.resolve(res);
            }
        });
    }

    private void walkHidden(File dir, boolean inHidden, int depth, List<JSObject> out) throws Exception {
        check();
        if (depth > 25 || out.size() > 5000) return;
        File[] kids = dir.listFiles();
        if (kids == null) return;
        for (File k : kids) {
            check();
            String n = k.getName();
            String low = n.toLowerCase(Locale.ROOT);
            boolean noise = low.equals(".nomedia") || low.startsWith(".thumbnails") || low.startsWith(".trash") || low.startsWith(".trashed") || n.equals(TRASH) || low.equals(".spotlight-v100");
            if (noise) continue;
            if (k.isDirectory()) {
                if (depth == 0 && n.equals("Android")) continue;
                boolean h = inHidden || n.startsWith(".");
                if (n.startsWith(".")) out.add(fe(k, sizeOf(k), k.lastModified()));
                tick(n);
                walkHidden(k, h, depth + 1, out);
            } else if (!inHidden && n.startsWith(".")) {
                out.add(fe(k, k.length(), k.lastModified()));
            }
        }
    }

    /** True while the phone is plugged in and charging (or full on the charger). */
    @PluginMethod
    public void charging(PluginCall call) {
        Intent b = ctx().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int st = b == null ? -1 : b.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        JSObject o = new JSObject();
        o.put("charging", st == BatteryManager.BATTERY_STATUS_CHARGING || st == BatteryManager.BATTERY_STATUS_FULL);
        call.resolve(o);
    }

    /** V0.29.2: Back at the very first screen sends Conduint to the background (like Home) instead of closing it, so it comes back exactly as left. */
    @PluginMethod
    public void toBack(final PluginCall call) {
        try {
            getActivity().runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try { getActivity().moveTaskToBack(true); } catch (Throwable ignored) { }
                    call.resolve();
                }
            });
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()));
        }
    }

    /** A file another app opened with Conduint ("Open with"): hands over its uri, type and name once. */
    @PluginMethod
    public void incoming(PluginCall call) {
        JSObject o = new JSObject();
        Uri u = MainActivity.takeIncoming();
        if (u != null) {
            o.put("uri", u.toString());
            o.put("mime", MainActivity.incomingMime);
            String n = null;
            try {
                android.database.Cursor c = ctx().getContentResolver().query(u, new String[]{android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null);
                if (c != null) { try { if (c.moveToFirst()) n = c.getString(0); } finally { c.close(); } }
            } catch (Throwable ignore) { }
            if (n == null) n = u.getLastPathSegment();
            o.put("name", n == null ? "file" : n);
        }
        call.resolve(o);
    }
}
