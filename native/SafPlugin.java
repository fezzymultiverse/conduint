package com.fezzy.conduint;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.storage.StorageManager;
import android.os.storage.StorageVolume;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.media.MediaMetadataRetriever;
import android.os.ParcelFileDescriptor;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * Saf: real file operations on any folder the user grants through Android's Storage Access Framework.
 * Internal storage, SD cards, USB, Termux, Acode and cloud apps (Drive, OneDrive, Dropbox...) all
 * appear in the system picker because each one ships a DocumentsProvider. No storage permission is
 * needed in the manifest. Most URIs handled here are tree-based document URIs.
 *
 * V0.9.0 adds a second kind of location: plain file:// URIs. With "All files access" (MANAGE_EXTERNAL_STORAGE)
 * the app can open /storage/emulated/0 (internal storage), the Download folder and SD cards directly, which
 * the system folder picker refuses on Android 11+. This is the same trick Material Files uses. Every helper
 * below (list, create, delete, rename, move, copy, zip) works on both kinds of URI.
 */
@CapacitorPlugin(name = "Saf")
public class SafPlugin extends Plugin {

    private static final String DIR = DocumentsContract.Document.MIME_TYPE_DIR;
    private static final String BIN = "application/octet-stream";
    private static final String[] COLS = {
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE,
        DocumentsContract.Document.COLUMN_SIZE,
        DocumentsContract.Document.COLUMN_LAST_MODIFIED,
        DocumentsContract.Document.COLUMN_FLAGS
    };

    private volatile boolean cancelled = false;
    private long lastProgress = 0;
    private int doneCount = 0;
    private int cacheSeq = 0;

    /** Thrown when the user taps Cancel. */
    private static class Cancel extends IOException {
        Cancel() { super("Cancelled"); }
    }

    private interface Job { void run() throws Exception; }

    /** One file or folder as reported by the provider. */
    private static class Ent {
        String id, name, mime;
        Uri uri;
        boolean dir;
        long size, mtime;
        int flags;
    }

    private ContentResolver cr() { return getContext().getContentResolver(); }

    private static String msg(Throwable t) {
        String m = t.getMessage();
        return (m == null || m.isEmpty()) ? t.getClass().getSimpleName() : m;
    }

    /** Runs a long operation off the shared plugin thread so cancel() and progress keep working. */
    private void bg(final PluginCall call, final Job job) {
        cancelled = false;
        doneCount = 0;
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    job.run();
                } catch (Cancel c) {
                    call.reject("Cancelled", "CANCELLED");
                } catch (Throwable t) {
                    call.reject(msg(t));
                }
            }
        }).start();
    }

    private void check() throws Cancel { if (cancelled) throw new Cancel(); }

    private void tick(String name) {
        doneCount++;
        long now = System.currentTimeMillis();
        if (now - lastProgress < 150) return;
        lastProgress = now;
        JSObject o = new JSObject();
        o.put("name", name);
        o.put("done", doneCount);
        notifyListeners("progress", o);
    }

    private static String need(PluginCall call, String key) throws IOException {
        String v = call.getString(key);
        if (v == null || v.isEmpty()) throw new IOException("Missing " + key);
        return v;
    }

    private static boolean isF(Uri u) { return u != null && "file".equals(u.getScheme()); }

    /** V0.52.0: content://.../tree/ID (no /document/ part) becomes that tree's root document URI. Anything else is returned as it came. */
    private static Uri normDir(Uri u) {
        if (isF(u)) return u;
        List<String> seg = u.getPathSegments();
        if (seg.size() == 2 && "tree".equals(seg.get(0))) return DocumentsContract.buildDocumentUriUsingTree(u, DocumentsContract.getTreeDocumentId(u));
        return u;
    }

    private static String idOf(Uri u) { return isF(u) ? u.getPath() : DocumentsContract.getDocumentId(u); }

    /** "name (1).ext" style alternative, like the system does when a name is taken. */
    private static File freeFile(File dir, String name, boolean isDir) {
        File f = new File(dir, name);
        if (!f.exists()) return f;
        int dot = isDir ? -1 : name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 1; i < 10000; i++) {
            f = new File(dir, base + " (" + i + ")" + ext);
            if (!f.exists()) return f;
        }
        return new File(dir, base + "-" + System.currentTimeMillis() + ext);
    }

    /** True for a symbolic link: never follow one while deleting (works on every Android version). */
    private static boolean isLink(File f) {
        try {
            File par = f.getParentFile();
            File c = par == null ? f : new File(par.getCanonicalFile(), f.getName());
            return !c.getCanonicalFile().equals(c.getAbsoluteFile());
        } catch (IOException x) { return true; }
    }

    private static void deleteTree(File f) throws IOException {
        if (f.isDirectory() && !isLink(f)) {
            File[] k = f.listFiles();
            if (k != null) for (File c : k) deleteTree(c);
        }
        if (!f.delete() && f.exists()) throw new IOException("Couldn't delete " + f.getName());
    }

    private List<Ent> fileKids(Uri dir) throws IOException {
        File d = new File(dir.getPath());
        File[] fs = d.listFiles();
        if (fs == null) throw new IOException("This folder can't be read. Turn on All files access for Conduint Files in Settings, Permissions.");
        List<Ent> out = new ArrayList<Ent>();
        for (File f : fs) {
            Ent e = new Ent();
            e.id = f.getAbsolutePath();
            e.name = f.getName();
            e.uri = Uri.fromFile(f);
            e.dir = f.isDirectory();
            e.mime = e.dir ? DIR : "";
            e.size = e.dir ? 0 : f.length();
            e.mtime = f.lastModified();
            e.flags = 0;
            out.add(e);
        }
        return out;
    }

    // ---------- provider helpers ----------

    private Ent ent(Uri base, Cursor c) {
        Ent e = new Ent();
        e.id = c.getString(0);
        e.name = c.getString(1);
        e.mime = c.getString(2);
        e.size = c.isNull(3) ? 0 : c.getLong(3);
        e.mtime = c.isNull(4) ? 0 : c.getLong(4);
        e.flags = c.isNull(5) ? 0 : c.getInt(5);
        e.dir = DIR.equals(e.mime);
        try {
            e.uri = DocumentsContract.buildDocumentUriUsingTree(base, e.id);
        } catch (IllegalArgumentException x) {
            e.uri = base; // a single picked document (Google Drive file), not a tree
        }
        return e;
    }

    private List<Ent> kids(Uri dir) throws IOException {
        if (isF(dir)) return fileKids(dir);
        List<Ent> out = new ArrayList<Ent>();
        Uri q = DocumentsContract.buildChildDocumentsUriUsingTree(dir, idOf(dir));
        Cursor c = null;
        try {
            c = cr().query(q, COLS, null, null, null);
            if (c == null) throw new IOException("This folder can't be read");
            while (c.moveToNext()) {
                Ent e = ent(dir, c);
                if (e.name != null) out.add(e);
            }
        } finally {
            if (c != null) c.close();
        }
        return out;
    }

    private Ent stat(Uri u) throws IOException {
        if ("file".equals(u.getScheme())) {
            File f = new File(u.getPath());
            if (!f.exists()) throw new IOException("Item not found");
            Ent e = new Ent();
            e.name = f.getName();
            e.uri = u;
            e.mime = f.isDirectory() ? DIR : "";
            e.dir = f.isDirectory();
            e.size = f.length();
            e.mtime = f.lastModified();
            return e;
        }
        // V0.26.1: cloud providers (OneDrive, Drive) can answer empty on the first ask. Try twice, then ask for name and size only.
        for (int tries = 0; tries < 2; tries++) {
            Cursor c = null;
            try {
                c = cr().query(u, COLS, null, null, null);
                if (c != null && c.moveToFirst()) {
                    Ent e = ent(u, c);
                    e.uri = u;
                    if (e.name == null) e.name = "Item";
                    return e;
                }
            } catch (IllegalArgumentException | SecurityException | UnsupportedOperationException x) {
                break;
            } catch (Exception x) {
                // fall through to the retry
            } finally {
                if (c != null) c.close();
            }
            try { Thread.sleep(350); } catch (InterruptedException ie) { break; }
        }
        Cursor c2 = null;
        try {
            c2 = cr().query(u, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null);
            if (c2 != null && c2.moveToFirst()) {
                Ent e = new Ent();
                e.uri = u;
                e.name = c2.isNull(0) ? null : c2.getString(0);
                if (e.name == null || e.name.length() == 0) e.name = u.getLastPathSegment() == null ? "Item" : u.getLastPathSegment();
                e.mime = "";
                e.dir = false;
                e.size = c2.isNull(1) ? 0 : c2.getLong(1);
                e.mtime = 0;
                return e;
            }
        } catch (Exception x) {
            // give up below
        } finally {
            if (c2 != null) c2.close();
        }
        throw new IOException("Item not found or access was lost");
    }

    private JSObject js(Ent e) {
        JSObject o = new JSObject();
        o.put("name", e.name);
        o.put("uri", e.uri.toString());
        o.put("dir", e.dir);
        o.put("mime", e.mime == null ? "" : e.mime);
        o.put("size", e.size);
        o.put("mtime", e.mtime);
        o.put("flags", e.flags);
        return o;
    }

    private Uri mk(Uri parent, String mime, String name) throws IOException {
        if (isF(parent)) {
            File d = new File(parent.getPath());
            boolean dir = DIR.equals(mime);
            File f = freeFile(d, name, dir);
            boolean ok = dir ? f.mkdirs() : f.createNewFile();
            if (!ok && !f.exists()) throw new IOException("Can't create \"" + name + "\" here");
            return Uri.fromFile(f);
        }
        Uri u;
        try {
            u = DocumentsContract.createDocument(cr(), parent, mime, name);
        } catch (SecurityException | IllegalArgumentException x) {
            throw new IOException("Can't create \"" + name + "\" here (" + msg(x) + ")");
        }
        if (u == null) throw new IOException("Can't create \"" + name + "\" here");
        return u;
    }

    private void rm(Uri u) throws IOException {
        if (isF(u)) {
            File f = new File(u.getPath());
            if (!f.exists()) throw new IOException("Item not found");
            deleteTree(f);
            return;
        }
        boolean ok;
        try {
            ok = DocumentsContract.deleteDocument(cr(), u);
        } catch (SecurityException x) {
            throw new IOException("No permission to delete this item");
        }
        if (!ok) throw new IOException("Couldn't delete the item");
    }

    private void pipe(InputStream in, OutputStream out) throws IOException {
        byte[] b = new byte[65536];
        int n;
        while ((n = in.read(b)) != -1) {
            check();
            out.write(b, 0, n);
        }
    }

    private boolean sameDoc(Uri a, Uri b) {
        return a != null && b != null && idOf(a).equals(idOf(b));
    }

    private void guardSelf(Ent src, Uri dstParent) throws IOException {
        if (!src.dir) return;
        String s = idOf(src.uri), d = idOf(dstParent);
        if (d.equals(s) || d.startsWith(s + "/")) throw new IOException("A folder can't be placed inside itself");
    }

    // ---------- copy / move ----------

    private Uri copyEnt(Ent e, Uri dstParent) throws IOException {
        check();
        if (e.dir) {
            Uri d = mk(dstParent, DIR, e.name);
            String dId = idOf(d);
            for (Ent k : kids(e.uri)) {
                if (idOf(k.uri).equals(dId)) continue; // never recurse into the copy itself
                copyEnt(k, d);
            }
            return d;
        }
        Uri d = mk(dstParent, BIN, e.name);
        try {
            InputStream in = cr().openInputStream(e.uri);
            OutputStream out = cr().openOutputStream(d, "w");
            try {
                if (in == null || out == null) throw new IOException("Can't open " + e.name);
                pipe(in, out);
            } finally {
                try { if (in != null) in.close(); } catch (IOException ignore) { }
                try { if (out != null) out.close(); } catch (IOException ignore) { }
            }
        } catch (IOException | RuntimeException x) {
            try { rm(d); } catch (Exception ignore) { }
            throw x;
        }
        tick(e.name);
        return d;
    }

    private Uri moveEnt(Ent e, Uri srcParent, Uri dstParent) throws IOException {
        check();
        guardSelf(e, dstParent);
        if (isF(e.uri) && isF(dstParent)) {
            File from = new File(e.uri.getPath());
            File to = freeFile(new File(dstParent.getPath()), e.name, e.dir);
            if (from.renameTo(to)) { tick(e.name); return Uri.fromFile(to); } // same volume: instant
            // another volume: fall through to copy + delete
        }
        if (Build.VERSION.SDK_INT >= 24
                && (e.flags & DocumentsContract.Document.FLAG_SUPPORTS_MOVE) != 0
                && e.uri.getAuthority() != null
                && e.uri.getAuthority().equals(dstParent.getAuthority())) {
            try {
                Uri r = DocumentsContract.moveDocument(cr(), e.uri, srcParent, dstParent);
                if (r != null) { tick(e.name); return r; }
            } catch (Exception ignore) {
                // provider refused the native move: fall back to copy + delete below
            }
        }
        Uri d = copyEnt(e, dstParent);
        try {
            rm(e.uri);
        } catch (IOException x) {
            throw new IOException("Copied \"" + e.name + "\" but couldn't remove the original");
        }
        return d;
    }

    // ---------- zip ----------

    private void zipEnt(ZipOutputStream z, Ent e, String prefix, Uri skip) throws IOException {
        check();
        if (sameDoc(e.uri, skip)) return; // never put the archive inside itself
        String path = prefix + e.name;
        if (e.dir) {
            z.putNextEntry(new ZipEntry(path + "/"));
            z.closeEntry();
            for (Ent k : kids(e.uri)) zipEnt(z, k, path + "/", skip);
            return;
        }
        ZipEntry ze = new ZipEntry(path);
        if (e.mtime > 0) ze.setTime(e.mtime);
        z.putNextEntry(ze);
        InputStream in = cr().openInputStream(e.uri);
        if (in == null) throw new IOException("Can't read " + e.name);
        try {
            pipe(in, z);
        } finally {
            try { in.close(); } catch (IOException ignore) { }
        }
        z.closeEntry();
        tick(e.name);
    }

    private Uri unzipTo(Uri src, Uri parent, String folder) throws IOException {
        InputStream raw = cr().openInputStream(src);
        if (raw == null) throw new IOException("Can't open the archive");
        Uri root = mk(parent, DIR, folder);
        boolean ok = false;
        try {
            Map<String, Uri> dirs = new HashMap<String, Uri>();
            ZipInputStream zi = new ZipInputStream(new BufferedInputStream(raw));
            try {
                ZipEntry e;
                while ((e = zi.getNextEntry()) != null) {
                    check();
                    List<String> parts = new ArrayList<String>();
                    boolean bad = false;
                    for (String s : e.getName().replace('\\', '/').split("/")) {
                        if (s.isEmpty() || s.equals(".")) continue;
                        if (s.equals("..")) { bad = true; break; } // zip-slip guard
                        parts.add(s);
                    }
                    if (bad || parts.isEmpty()) continue;
                    int depth = e.isDirectory() ? parts.size() : parts.size() - 1;
                    Uri at = root;
                    String key = "";
                    for (int i = 0; i < depth; i++) {
                        key = key + "/" + parts.get(i);
                        Uri d = dirs.get(key);
                        if (d == null) {
                            d = mk(at, DIR, parts.get(i));
                            dirs.put(key, d);
                        }
                        at = d;
                    }
                    if (!e.isDirectory()) {
                        String nm = parts.get(parts.size() - 1);
                        Uri f = mk(at, BIN, nm);
                        OutputStream out = cr().openOutputStream(f, "w");
                        if (out == null) throw new IOException("Can't write " + nm);
                        try {
                            pipe(zi, out);
                        } finally {
                            try { out.close(); } catch (IOException ignore) { }
                        }
                        tick(nm);
                    }
                }
            } finally {
                try { zi.close(); } catch (IOException ignore) { }
            }
            ok = true;
        } finally {
            if (!ok) { try { rm(root); } catch (Exception ignore) { } }
        }
        return root;
    }

    // ---------- plugin methods: access ----------

    private static final int RW = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;

    /** Removable volumes that are mounted right now (SD card, USB drive). */
    private List<StorageVolume> removable() {
        List<StorageVolume> out = new ArrayList<StorageVolume>();
        if (Build.VERSION.SDK_INT < 24) return out;
        try {
            StorageManager sm = (StorageManager) getContext().getSystemService(Context.STORAGE_SERVICE);
            for (StorageVolume v : sm.getStorageVolumes()) {
                if (!v.isPrimary() && v.isRemovable() && Environment.MEDIA_MOUNTED.equals(v.getState())) out.add(v);
            }
        } catch (Throwable ignore) { }
        return out;
    }

    @PluginMethod
    public void volumes(PluginCall call) {
        JSArray names = new JSArray();
        for (StorageVolume v : removable()) {
            String d = null;
            try { d = v.getDescription(getContext()); } catch (Throwable ignore) { }
            names.put(d == null || d.isEmpty() ? "SD card" : d);
        }
        JSObject o = new JSObject();
        o.put("removable", names);
        call.resolve(o);
    }

    /** Cloud apps (Drive, OneDrive, Dropbox...) that ship a DocumentsProvider. System providers are skipped. */
    @PluginMethod
    public void providers(PluginCall call) {
        JSArray out = new JSArray();
        try {
            PackageManager pm = getContext().getPackageManager();
            List<ResolveInfo> rs = pm.queryIntentContentProviders(new Intent("android.content.action.DOCUMENTS_PROVIDER"), 0);
            Set<String> seen = new HashSet<String>();
            if (rs != null) for (ResolveInfo ri : rs) {
                if (ri.providerInfo == null) continue;
                String pkg = ri.providerInfo.packageName;
                if (pkg == null || pkg.startsWith("com.android.") || pkg.startsWith("android") || pkg.equals(getContext().getPackageName())) continue;
                if (!seen.add(pkg)) continue;
                JSObject o = new JSObject();
                o.put("label", String.valueOf(ri.providerInfo.applicationInfo.loadLabel(pm)));
                o.put("pkg", pkg);
                out.put(o);
            }
        } catch (Throwable ignore) { }
        JSObject res = new JSObject();
        res.put("items", out);
        call.resolve(res);
    }

    /**
     * V0.27.0: who owns a connected cloud folder. Looks up the app that serves the folder's address (Drive, OneDrive, Dropbox...)
     * and returns its name and its launcher icon as a small PNG data URL, so the side panel can show the real logo.
     * "email" is only filled when the provider put an address in the folder's own URI; most providers do not, and
     * Conduint holds no cloud accounts, so the person can type it in (Edit account).
     */
    @PluginMethod
    public void providerInfo(PluginCall call) {
        try {
            String raw = call.getString("uri", "");
            Uri u = Uri.parse(raw == null ? "" : raw);
            String auth = u.getAuthority();
            JSObject o = new JSObject();
            o.put("authority", auth == null ? "" : auth);
            PackageManager pm = getContext().getPackageManager();
            android.content.pm.ProviderInfo pi = (auth == null || auth.length() == 0) ? null : pm.resolveContentProvider(auth, 0);
            if (pi != null && pi.packageName != null) {
                o.put("pkg", pi.packageName);
                try {
                    android.content.pm.ApplicationInfo ai = pm.getApplicationInfo(pi.packageName, 0);
                    o.put("label", String.valueOf(pm.getApplicationLabel(ai)));
                    o.put("icon", iconPng(pm.getApplicationIcon(ai), 96));
                } catch (Throwable ignore) { }
            }
            String hay = Uri.decode(String.valueOf(u));
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}").matcher(hay);
            if (m.find()) o.put("email", m.group());
            call.resolve(o);
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()));
        }
    }

    private static String iconPng(android.graphics.drawable.Drawable d, int px) {
        Bitmap b = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        d.setBounds(0, 0, px, px);
        d.draw(c);
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.PNG, 100, bo);
        b.recycle();
        return "data:image/png;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
    }

    /** Folder picker. volume="external" opens the SD card / USB drive directly; start="primary:Documents" opens at that folder. */
    @PluginMethod
    public void pickTree(PluginCall call) {
        Intent i = null;
        boolean direct = false;
        if ("external".equals(call.getString("volume", "")) && Build.VERSION.SDK_INT >= 29) {
            try {
                List<StorageVolume> vs = removable();
                if (!vs.isEmpty()) { i = vs.get(0).createOpenDocumentTreeIntent(); direct = true; }
            } catch (Throwable ignore) { i = null; }
        }
        if (i == null) i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        String start = call.getString("start", "");
        if (!direct && start != null && start.length() > 0 && Build.VERSION.SDK_INT >= 26) {
            try {
                i.putExtra(DocumentsContract.EXTRA_INITIAL_URI,
                        DocumentsContract.buildDocumentUri(
                            call.getString("authority", "").length() > 0 ? call.getString("authority", "") : "com.android.externalstorage.documents", start));
            } catch (Throwable ignore) { }
        }
        i.addFlags(RW | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, i, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult r) {
        if (call == null) return;
        Intent data = r.getData();
        if (r.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("Cancelled", "CANCELLED");
            return;
        }
        Uri tree = data.getData();
        try {
            try {
                cr().takePersistableUriPermission(tree, RW);
            } catch (SecurityException x) {
                // read-only providers: keep read access so the folder still saves
                cr().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
            Uri root = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            try {
                kids(root); // prove the folder can really be read before it is saved
            } catch (Throwable x) {
                try { cr().releasePersistableUriPermission(tree, RW); } catch (Exception ignore) { }
                call.reject("Android won't let apps read that folder. Pick a folder inside it instead.");
                return;
            }
            String name = "Folder";
            try { name = stat(root).name; } catch (IOException ignore) { }
            JSObject o = new JSObject();
            o.put("uri", tree.toString());
            o.put("root", root.toString());
            o.put("name", name);
            call.resolve(o);
        } catch (Exception x) {
            call.reject(msg(x));
        }
    }

    /** File picker for cloud apps that only share single files (Google Drive). persist=false is used for one-off uploads. */
    @PluginMethod
    public void pickDocs(PluginCall call) {
        if (call.getBoolean("app", false)) {
            // V0.26.1: app picker. Android asks which app to pick from (OneDrive, Dropbox, Drive...) and that app shows ALL its own folders.
            Intent g = new Intent(Intent.ACTION_GET_CONTENT);
            g.addCategory(Intent.CATEGORY_OPENABLE);
            g.setType("*/*");
            g.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            g.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(call, Intent.createChooser(g, "Add from"), "docsResult");
            return;
        }
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        i.addFlags(RW | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, i, "docsResult");
    }

    @ActivityCallback
    private void docsResult(PluginCall call, ActivityResult r) {
        if (call == null) return;
        Intent data = r.getData();
        if (r.getResultCode() != Activity.RESULT_OK || data == null) {
            call.reject("Cancelled", "CANCELLED");
            return;
        }
        boolean keep = call.getBoolean("persist", true);
        List<Uri> us = new ArrayList<Uri>();
        if (data.getClipData() != null) {
            for (int k = 0; k < data.getClipData().getItemCount(); k++) us.add(data.getClipData().getItemAt(k).getUri());
        } else if (data.getData() != null) {
            us.add(data.getData());
        }
        JSArray out = new JSArray();
        for (Uri u : us) {
            if (keep) {
                try { cr().takePersistableUriPermission(u, RW); }
                catch (Exception x) {
                    try { cr().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignore) { }
                }
            }
            try { out.put(js(stat(u))); } catch (Exception ignore) { }
        }
        if (out.length() == 0 && !us.isEmpty()) {
            call.reject("Android picked the file but the app would not share it yet. Open it once in that app, then try again.");
            return;
        }
        JSObject o = new JSObject();
        o.put("items", out);
        call.resolve(o);
    }

    private String saveSrc = null;

    /** Upload: copies one file to a place the user picks in Drive, OneDrive, Dropbox or any other app. */
    @PluginMethod
    public void saveCopy(PluginCall call) {
        try {
            saveSrc = need(call, "uri");
            String mime = call.getString("mime", "application/octet-stream");
            if (mime == null || mime.isEmpty() || "*/*".equals(mime)) mime = "application/octet-stream";
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType(mime);
            i.putExtra(Intent.EXTRA_TITLE, call.getString("name", "file"));
            startActivityForResult(call, i, "saveResult");
        } catch (Throwable t) {
            call.reject(msg(t));
        }
    }

    @ActivityCallback
    private void saveResult(final PluginCall call, ActivityResult r) {
        if (call == null) return;
        Intent data = r.getData();
        if (r.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null || saveSrc == null) {
            call.reject("Cancelled", "CANCELLED");
            return;
        }
        final Uri dst = data.getData();
        final Uri src = Uri.parse(saveSrc);
        bg(call, new Job() {
            @Override public void run() throws Exception {
                InputStream in = cr().openInputStream(src);
                OutputStream out = cr().openOutputStream(dst, "w");
                try {
                    if (in == null || out == null) throw new IOException("Can't open the file");
                    pipe(in, out);
                } finally {
                    try { if (in != null) in.close(); } catch (IOException ignore) { }
                    try { if (out != null) out.close(); } catch (IOException ignore) { }
                }
                call.resolve();
            }
        });
    }

    /** file:// items (Library auto-scan) must go through the app's FileProvider before another app can read them. */
    private Uri shareable(Uri u) throws IOException {
        if (!"file".equals(u.getScheme())) return u;
        try {
            return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", new File(u.getPath()));
        } catch (Exception x) {
            throw new IOException("Android won't hand this file to another app (" + msg(x) + ")");
        }
    }

    @PluginMethod
    public void release(PluginCall call) {
        try {
            cr().releasePersistableUriPermission(Uri.parse(need(call, "uri")),
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception ignore) { }
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled = true;
        call.resolve();
    }

    // ---------- plugin methods: browse ----------

    @PluginMethod
    public void list(PluginCall call) {
        try {
            JSArray items = new JSArray();
            for (Ent e : kids(Uri.parse(need(call, "uri")))) items.put(js(e));
            JSObject o = new JSObject();
            o.put("items", items);
            call.resolve(o);
        } catch (Throwable t) {
            call.reject(msg(t));
        }
    }

    @PluginMethod
    public void stat(PluginCall call) {
        try {
            call.resolve(js(stat(Uri.parse(need(call, "uri")))));
        } catch (Throwable t) {
            call.reject(msg(t));
        }
    }

    @PluginMethod
    public void scan(final PluginCall call) {
        bg(call, new Job() {
            @Override public void run() throws Exception {
                Uri root = Uri.parse(need(call, "uri"));
                int cap = call.getInt("cap", 3000);
                final boolean hidden = Boolean.TRUE.equals(call.getBoolean("hidden", false));
                Set<String> exts = new HashSet<String>();
                JSArray ea = call.getArray("exts");
                if (ea != null) for (int i = 0; i < ea.length(); i++) exts.add(ea.getString(i).toLowerCase());
                JSArray out = new JSArray();
                Deque<Object[]> stack = new ArrayDeque<Object[]>();
                stack.push(new Object[]{root, ""});
                while (!stack.isEmpty() && out.length() < cap) {
                    check();
                    Object[] top = stack.pop();
                    Uri dir = (Uri) top[0];
                    List<Ent> list;
                    try { list = kids(dir); } catch (IOException x) { continue; }
                    for (Ent e : list) {
                        if (e.dir) {
                            if ((hidden || !e.name.startsWith(".")) && !e.name.equals("node_modules")) stack.push(new Object[]{e.uri, e.name});
                        } else {
                            int dot = e.name.lastIndexOf('.');
                            String ext = dot < 0 ? "" : e.name.substring(dot + 1).toLowerCase();
                            if (exts.contains(ext) && out.length() < cap) {
                                JSObject o = js(e);
                                o.put("parent", dir.toString());
                                o.put("pname", (String) top[1]);
                                out.put(o);
                            }
                        }
                    }
                }
                JSObject res = new JSObject();
                res.put("items", out);
                res.put("capped", out.length() >= cap);
                call.resolve(res);
            }
        });
    }

    /**
     * V0.28.0: dirSize({uri}) -> {files, folders, bytes, skipped}. Counts everything under a folder (hidden files included) on a
     * background thread. cancel() stops it, progress events show the folder being read. A folder that cannot be read is skipped
     * and counted in "skipped" so the total is never presented as complete when it is not.
     */
    @PluginMethod
    public void dirSize(final PluginCall call) {
        bg(call, new Job() {
            @Override public void run() throws Exception {
                Uri root = Uri.parse(need(call, "uri"));
                long files = 0, folders = 0, bytes = 0, skipped = 0;
                Deque<Uri> stack = new ArrayDeque<Uri>();
                stack.push(root);
                while (!stack.isEmpty()) {
                    check();
                    Uri dir = stack.pop();
                    List<Ent> list;
                    try { list = kids(dir); } catch (IOException x) { skipped++; continue; }
                    String nm = dir.getLastPathSegment();
                    if (nm != null && nm.lastIndexOf('/') >= 0) nm = nm.substring(nm.lastIndexOf('/') + 1);
                    for (Ent e : list) {
                        if (e.dir) { folders++; stack.push(e.uri); }
                        else { files++; if (e.size > 0) bytes += e.size; tick(nm == null ? "" : nm); }
                    }
                }
                JSObject res = new JSObject();
                res.put("files", files);
                res.put("folders", folders);
                res.put("bytes", bytes);
                res.put("skipped", skipped);
                call.resolve(res);
            }
        });
    }

    @PluginMethod
    public void ensureDir(PluginCall call) {
        try {
            Uri parent = Uri.parse(need(call, "parent"));
            String name = need(call, "name");
            Uri found = null;
            for (Ent e : kids(parent)) if (e.dir && e.name.equals(name)) { found = e.uri; break; }
            if (found == null) found = mk(parent, DIR, name);
            JSObject o = new JSObject();
            o.put("uri", found.toString());
            call.resolve(o);
        } catch (Throwable t) {
            call.reject(msg(t));
        }
    }

    // ---------- plugin methods: edit ----------

    @PluginMethod
    public void mkdir(PluginCall call) { create(call, DIR); }

    @PluginMethod
    public void mkfile(PluginCall call) { create(call, BIN); }

    private void create(PluginCall call, String mime) {
        try {
            Uri u = mk(Uri.parse(need(call, "parent")), mime, need(call, "name"));
            JSObject o = new JSObject();
            o.put("uri", u.toString());
            call.resolve(o);
        } catch (Throwable t) {
            call.reject(msg(t));
        }
    }

    @PluginMethod
    public void rename(PluginCall call) {
        try {
            Uri src = Uri.parse(need(call, "uri"));
            Uri u;
            if (isF(src)) {
                File f = new File(src.getPath());
                File t = new File(f.getParentFile(), need(call, "name"));
                u = (!t.exists() && f.renameTo(t)) ? Uri.fromFile(t) : null;
            } else try {
                u = DocumentsContract.renameDocument(cr(), src, need(call, "name"));
            } catch (IllegalStateException | IllegalArgumentException | SecurityException x) {
                u = null;
            }
            if (u == null) throw new IOException("Couldn't rename. That name may already be taken.");
            JSObject o = new JSObject();
            o.put("uri", u.toString());
            call.resolve(o);
        } catch (Throwable t) {
            call.reject(msg(t));
        }
    }

    @PluginMethod
    public void remove(final PluginCall call) {
        bg(call, new Job() {
            @Override public void run() throws Exception {
                JSArray a = call.getArray("uris");
                if (a == null) throw new IOException("Nothing to delete");
                for (int i = 0; i < a.length(); i++) {
                    check();
                    Uri u = Uri.parse(a.getString(i));
                    rm(u);
                    tick("Deleting");
                }
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void copy(final PluginCall call) {
        bg(call, new Job() {
            @Override public void run() throws Exception {
                Uri parent = Uri.parse(need(call, "parent"));
                JSArray a = call.getArray("items");
                if (a == null) throw new IOException("Nothing to copy");
                JSArray res = new JSArray();
                for (int i = 0; i < a.length(); i++) {
                    JSONObject it = a.getJSONObject(i);
                    Ent e = stat(Uri.parse(it.getString("uri")));
                    guardSelf(e, parent);
                    res.put(copyEnt(e, parent).toString());
                }
                JSObject o = new JSObject();
                o.put("uris", res);
                call.resolve(o);
            }
        });
    }

    @PluginMethod
    public void move(final PluginCall call) {
        bg(call, new Job() {
            @Override public void run() throws Exception {
                Uri parent = Uri.parse(need(call, "parent"));
                JSArray a = call.getArray("items");
                if (a == null) throw new IOException("Nothing to move");
                JSArray res = new JSArray();
                for (int i = 0; i < a.length(); i++) {
                    JSONObject it = a.getJSONObject(i);
                    Ent e = stat(Uri.parse(it.getString("uri")));
                    res.put(moveEnt(e, Uri.parse(it.getString("parent")), parent).toString());
                }
                JSObject o = new JSObject();
                o.put("uris", res);
                call.resolve(o);
            }
        });
    }

    @PluginMethod
    public void zip(final PluginCall call) {
        bg(call, new Job() {
            @Override public void run() throws Exception {
                Uri parent = Uri.parse(need(call, "parent"));
                String name = need(call, "name");
                int level = Math.max(0, Math.min(9, call.getInt("level", 6)));
                JSArray a = call.getArray("items");
                if (a == null || a.length() == 0) throw new IOException("Nothing to compress");
                Uri out = mk(parent, BIN, name);
                boolean ok = false;
                try {
                    OutputStream os = cr().openOutputStream(out, "w");
                    if (os == null) throw new IOException("Can't write the archive");
                    ZipOutputStream z = new ZipOutputStream(new BufferedOutputStream(os));
                    try {
                        z.setLevel(level);
                        for (int i = 0; i < a.length(); i++) {
                            Ent e = stat(Uri.parse(a.getJSONObject(i).getString("uri")));
                            zipEnt(z, e, "", out);
                        }
                    } finally {
                        z.close();
                    }
                    ok = true;
                } finally {
                    if (!ok) { try { rm(out); } catch (Exception ignore) { } }
                }
                JSObject o = new JSObject();
                o.put("uri", out.toString());
                call.resolve(o);
            }
        });
    }

    @PluginMethod
    public void unzip(final PluginCall call) {
        bg(call, new Job() {
            @Override public void run() throws Exception {
                Uri root = unzipTo(Uri.parse(need(call, "uri")), Uri.parse(need(call, "parent")), need(call, "name"));
                JSObject o = new JSObject();
                o.put("uri", root.toString());
                call.resolve(o);
            }
        });
    }

    // ---------- plugin methods: other apps ----------

    @PluginMethod
    public void openWith(PluginCall call) {
        try {
            final Uri u = shareable(Uri.parse(need(call, "uri")));
            boolean edit = call.getBoolean("edit", false);
            String mime = call.getString("mime");
            if (mime == null || mime.isEmpty() || mime.equals("*/*")) {
                String t = cr().getType(u);
                mime = t == null ? "*/*" : t;
            }
            Intent i = new Intent(Intent.ACTION_VIEW);/* one Open with: every viewer and editor is listed; edit only decides whether write access is granted */
            i.setDataAndType(u, mime);
            i.setClipData(ClipData.newRawUri("file", u));
            int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
            if (edit) flags |= Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            i.addFlags(flags);
            final Intent chooser = Intent.createChooser(i, "Open with");
            getActivity().runOnUiThread(new Runnable() {
                @Override public void run() { getActivity().startActivity(chooser); }
            });
            call.resolve();
        } catch (Throwable t) {
            call.reject("No app can open this file (" + msg(t) + ")");
        }
    }

    @PluginMethod
    public void share(PluginCall call) {
        try {
            JSArray a = call.getArray("uris");
            if (a == null || a.length() == 0) throw new IOException("Nothing to share");
            ArrayList<Uri> list = new ArrayList<Uri>();
            for (int i = 0; i < a.length(); i++) list.add(shareable(Uri.parse(a.getString(i))));
            Intent i;
            if (list.size() == 1) {
                i = new Intent(Intent.ACTION_SEND);
                i.putExtra(Intent.EXTRA_STREAM, list.get(0));
                String t = cr().getType(list.get(0));
                i.setType(t == null ? "*/*" : t);
            } else {
                i = new Intent(Intent.ACTION_SEND_MULTIPLE);
                i.putParcelableArrayListExtra(Intent.EXTRA_STREAM, list);
                i.setType("*/*");
            }
            ClipData cd = ClipData.newRawUri("files", list.get(0));
            for (int k = 1; k < list.size(); k++) cd.addItem(new ClipData.Item(list.get(k)));
            i.setClipData(cd);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            final Intent chooser = Intent.createChooser(i, "Share");
            getActivity().runOnUiThread(new Runnable() {
                @Override public void run() { getActivity().startActivity(chooser); }
            });
            call.resolve();
        } catch (Throwable t) {
            call.reject(msg(t));
        }
    }

    // ---------- plugin methods: preview cache (the player reads a real file path) ----------

    private File previewDir() {
        File d = new File(getContext().getCacheDir(), "preview");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    @PluginMethod
    public void cacheCopy(final PluginCall call) {
        bg(call, new Job() {
            @Override public void run() throws Exception {
                Uri u = Uri.parse(need(call, "uri"));
                String name = call.getString("name", "file");
                int dot = name.lastIndexOf('.');
                String ext = dot < 0 ? "" : name.substring(dot + 1).replaceAll("[^A-Za-z0-9]", "");
                if (ext.length() > 8) ext = ext.substring(0, 8);
                File f = new File(previewDir(), (++cacheSeq) + (ext.isEmpty() ? "" : "." + ext));
                InputStream in = cr().openInputStream(u);
                if (in == null) throw new IOException("Can't read this file");
                boolean ok = false;
                try {
                    OutputStream out = new FileOutputStream(f);
                    try { pipe(in, out); } finally { out.close(); }
                    ok = true;
                } finally {
                    try { in.close(); } catch (IOException ignore) { }
                    if (!ok) //noinspection ResultOfMethodCallIgnored
                        f.delete();
                }
                JSObject o = new JSObject();
                o.put("path", f.getAbsolutePath());
                call.resolve(o);
            }
        });
    }

    /**
     * Writes a small file (text or base64 bytes) into a folder: a SAF folder uri or a file:// folder.
     * Used to save lyrics (.lrc) and cover art next to a song. An existing file with the same name is replaced.
     */
    @PluginMethod
    public void writeFile(final PluginCall call) {
        bg(call, new Job() {
            @Override public void run() throws Exception {
                Uri dir = normDir(Uri.parse(need(call, "dir")));/* V0.52.0: a folder-picker tree URI is turned into its root document URI, so exports can write into it */
                String name = need(call, "name");
                if (name.indexOf('/') >= 0 || name.indexOf('\\') >= 0 || name.equals("..") || name.equals(".")) throw new IOException("Bad file name");
                String text = call.getString("text");
                String b64 = call.getString("b64");
                byte[] data;
                if (b64 != null && !b64.isEmpty()) data = Base64.decode(b64, Base64.DEFAULT);
                else data = (text == null ? "" : text).getBytes("UTF-8");
                OutputStream out;
                Uri result;
                if ("file".equals(dir.getScheme())) {
                    File d = new File(dir.getPath());
                    if (!d.isDirectory()) throw new IOException("Folder not found");
                    File f = new File(d, name);
                    out = new FileOutputStream(f);
                    result = Uri.fromFile(f);
                } else {
                    Uri target = null;
                    for (Ent e : kids(dir)) if (!e.dir && e.name.equals(name)) { target = e.uri; break; }
                    if (target == null) target = mk(dir, call.getString("mime", BIN), name);
                    out = cr().openOutputStream(target, "wt");
                    if (out == null) throw new IOException("Can't write here");
                    result = target;
                }
                try { out.write(data); } finally { out.close(); }
                JSObject o = new JSObject();
                o.put("uri", result.toString());
                call.resolve(o);
            }
        });
    }


    /* ---------- V0.7.0 previews: PDF first page, EPUB / Office / OpenDocument cover, image, video frame ---------- */
    private static final ExecutorService THUMBS = Executors.newFixedThreadPool(2);

    /* ---- V0.8.0 Reader: PDF pages and bytes handed over from the web side ---- */
    private final java.util.concurrent.atomic.AtomicInteger pgSeq = new java.util.concurrent.atomic.AtomicInteger();

    /** Writes base64 bytes into the app cache and resolves {path}. Used to open decrypted vault PDFs. */
    @PluginMethod
    public void cachePut(final PluginCall call) {
        bg(call, new Job() {
            @Override public void run() throws Exception {
                String name = call.getString("name", "file");
                int dot = name.lastIndexOf('.');
                String ext = dot < 0 ? "" : name.substring(dot + 1).replaceAll("[^A-Za-z0-9]", "");
                if (ext.length() > 8) ext = ext.substring(0, 8);
                byte[] data = Base64.decode(need(call, "b64"), Base64.DEFAULT);
                File f = new File(previewDir(), "put" + pgSeq.incrementAndGet() + (ext.isEmpty() ? "" : "." + ext));
                OutputStream out = new FileOutputStream(f);
                try { out.write(data); } finally { out.close(); }
                JSObject o = new JSObject();
                o.put("path", f.getAbsolutePath());
                call.resolve(o);
            }
        });
    }

    /** Page count and page sizes (points) of a local PDF: {pages, sizes:[w,h,w,h...]} (sizes for the first 500 pages). */
    @PluginMethod
    public void pdfInfo(final PluginCall call) {
        final String p = call.getString("path");
        if (p == null || p.isEmpty()) { call.reject("Missing path"); return; }
        THUMBS.execute(new Runnable() {
            @Override public void run() {
                ParcelFileDescriptor pfd = null;
                PdfRenderer pr = null;
                try {
                    pfd = ParcelFileDescriptor.open(new File(p), ParcelFileDescriptor.MODE_READ_ONLY);
                    pr = new PdfRenderer(pfd);
                    int n = pr.getPageCount();
                    JSArray sizes = new JSArray();
                    for (int i = 0; i < n && i < 500; i++) {
                        PdfRenderer.Page pg = pr.openPage(i);
                        try { sizes.put(pg.getWidth()); sizes.put(pg.getHeight()); } finally { pg.close(); }
                    }
                    JSObject o = new JSObject();
                    o.put("pages", n);
                    o.put("sizes", sizes);
                    call.resolve(o);
                } catch (Throwable t) {
                    call.reject("This PDF is password protected or damaged (" + msg(t) + ")");
                } finally {
                    try { if (pr != null) pr.close(); } catch (Throwable ignored) { }
                    try { if (pfd != null) pfd.close(); } catch (Throwable ignored) { }
                }
            }
        });
    }

    /** Renders one page of a local PDF to a jpeg in the app cache: {path, w, h}. */
    @PluginMethod
    public void pdfPage(final PluginCall call) {
        final String p = call.getString("path");
        final int page = call.getInt("page", 0);
        final int width = Math.max(200, Math.min(2400, call.getInt("width", 1080)));
        if (p == null || p.isEmpty()) { call.reject("Missing path"); return; }
        THUMBS.execute(new Runnable() {
            @Override public void run() {
                ParcelFileDescriptor pfd = null;
                PdfRenderer pr = null;
                try {
                    pfd = ParcelFileDescriptor.open(new File(p), ParcelFileDescriptor.MODE_READ_ONLY);
                    pr = new PdfRenderer(pfd);
                    if (page < 0 || page >= pr.getPageCount()) throw new IOException("No such page");
                    PdfRenderer.Page pg = pr.openPage(page);
                    Bitmap bm;
                    try {
                        int h = Math.max(1, Math.round((float) width * pg.getHeight() / pg.getWidth()));
                        bm = Bitmap.createBitmap(width, h, Bitmap.Config.ARGB_8888);
                        bm.eraseColor(Color.WHITE);
                        pg.render(bm, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                    } finally { pg.close(); }
                    File f = new File(previewDir(), "pg" + pgSeq.incrementAndGet() + ".jpg");
                    OutputStream out = new FileOutputStream(f);
                    try { bm.compress(Bitmap.CompressFormat.JPEG, 88, out); } finally { out.close(); }
                    JSObject o = new JSObject();
                    o.put("path", f.getAbsolutePath());
                    o.put("w", bm.getWidth());
                    o.put("h", bm.getHeight());
                    bm.recycle();
                    call.resolve(o);
                } catch (Throwable t) {
                    call.reject(msg(t));
                } finally {
                    try { if (pr != null) pr.close(); } catch (Throwable ignored) { }
                    try { if (pfd != null) pfd.close(); } catch (Throwable ignored) { }
                }
            }
        });
    }

    /** Small jpeg preview as base64. kind: pdf, zip (epub, docx, xlsx, pptx, odt...), img, vid, aud (album art). Resolves {b64}, empty when there is no preview. */
    @PluginMethod
    public void thumb(final PluginCall call) {
        final String us = call.getString("uri");
        final String kind = call.getString("kind", "");
        final int px = Math.max(64, Math.min(512, call.getInt("size", 256)));
        if (us == null || us.isEmpty()) { call.reject("Missing uri"); return; }
        THUMBS.execute(new Runnable() {
            @Override public void run() {
                String b64 = "";
                try {
                    Uri u = Uri.parse(us);
                    Bitmap bm = null;
                    if ("pdf".equals(kind)) bm = thumbPdf(u, px);
                    else if ("zip".equals(kind)) bm = thumbZip(u, px);
                    else if ("img".equals(kind)) bm = thumbImg(u, px);
                    else if ("vid".equals(kind)) bm = thumbVid(u, px);
                    else if ("aud".equals(kind)) bm = thumbAud(u, px);
                    if (bm != null) {
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        flat(bm).compress(Bitmap.CompressFormat.JPEG, 82, bo);
                        b64 = Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
                    }
                } catch (Throwable ignored) { }
                JSObject o = new JSObject();
                o.put("b64", b64);
                call.resolve(o);
            }
        });
    }

    private InputStream tin(Uri u) throws IOException {
        if ("file".equals(u.getScheme())) return new java.io.FileInputStream(new File(u.getPath()));
        InputStream s = cr().openInputStream(u);
        if (s == null) throw new IOException("Can't open");
        return s;
    }

    private static Bitmap fit(Bitmap b, int px) {
        if (b == null) return null;
        float sc = Math.min(1f, (float) px / Math.max(b.getWidth(), b.getHeight()));
        if (sc >= 1f) return b;
        return Bitmap.createScaledBitmap(b, Math.max(1, Math.round(b.getWidth() * sc)), Math.max(1, Math.round(b.getHeight() * sc)), true);
    }

    /** jpeg has no transparency: put transparent pictures on white. */
    private static Bitmap flat(Bitmap b) {
        if (!b.hasAlpha()) return b;
        Bitmap o = Bitmap.createBitmap(b.getWidth(), b.getHeight(), Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(o);
        c.drawColor(Color.WHITE);
        c.drawBitmap(b, 0, 0, null);
        return o;
    }

    private static byte[] readAll(InputStream in, int max) throws IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[32768];
        int n, total = 0;
        while ((n = in.read(buf)) > 0) { total += n; if (total > max) return null; bo.write(buf, 0, n); }
        return bo.toByteArray();
    }

    private Bitmap thumbImg(Uri u, int px) throws IOException {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        InputStream a = tin(u);
        try { BitmapFactory.decodeStream(a, null, o); } finally { a.close(); }
        int ss = 1;
        while (o.outWidth / (ss * 2) >= px && o.outHeight / (ss * 2) >= px) ss *= 2;
        BitmapFactory.Options d = new BitmapFactory.Options();
        d.inSampleSize = ss;
        InputStream b = tin(u);
        try { return fit(BitmapFactory.decodeStream(b, null, d), px); } finally { b.close(); }
    }

    /** Album art: the picture inside the tags first, then a picture beside the song (song name, cover, folder, album...). */
    private Bitmap thumbAud(Uri u, int px) {
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            r.setDataSource(getContext(), u);
            byte[] pic = r.getEmbeddedPicture();
            if (pic != null && pic.length > 200) {
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(pic, 0, pic.length, o);
                int ss = 1;
                while (o.outWidth / (ss * 2) >= px && o.outHeight / (ss * 2) >= px) ss *= 2;
                BitmapFactory.Options d = new BitmapFactory.Options();
                d.inSampleSize = ss;
                Bitmap b = BitmapFactory.decodeByteArray(pic, 0, pic.length, d);
                if (b != null) return fit(b, px);
            }
        } catch (Throwable ignored) {
        } finally {
            try { r.release(); } catch (Throwable ignored) { }
        }
        if (isF(u)) {
            try {
                File song = new File(u.getPath());
                File dir = song.getParentFile();
                File[] near = dir == null ? null : dir.listFiles();
                if (near != null) {
                    String n = song.getName();
                    int dot = n.lastIndexOf('.');
                    String base = (dot > 0 ? n.substring(0, dot) : n).toLowerCase();
                    String[] want = {base, "cover", "folder", "albumart", "album", "front", "artwork", "albumartsmall"};
                    for (String w : want) {
                        for (File f : near) {
                            String fn = f.getName().toLowerCase();
                            if (f.isFile() && (fn.equals(w + ".jpg") || fn.equals(w + ".jpeg") || fn.equals(w + ".png") || fn.equals(w + ".webp"))) {
                                Bitmap b = thumbImg(Uri.fromFile(f), px);
                                if (b != null) return b;
                            }
                        }
                    }
                }
            } catch (Throwable ignored) { }
        }
        return null;
    }

    /**
     * Direct file-path locations (needs All files access). Resolves the paths of internal storage, Downloads,
     * Documents and every mounted SD card / USB drive, so the app can open them without the system folder picker.
     */
    @PluginMethod
    public void roots(PluginCall call) {
        JSObject o = new JSObject();
        boolean all = Build.VERSION.SDK_INT >= 30
                ? Environment.isExternalStorageManager()
                : androidx.core.content.ContextCompat.checkSelfPermission(getContext(), android.Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        o.put("allFiles", all);
        File in = Environment.getExternalStorageDirectory();
        o.put("internal", Uri.fromFile(in).toString());
        o.put("downloads", Uri.fromFile(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)).toString());
        o.put("documents", Uri.fromFile(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)).toString());
        JSArray rem = new JSArray();
        try {
            for (StorageVolume v : removable()) {
                File d = null;
                if (Build.VERSION.SDK_INT >= 30) d = v.getDirectory();
                if (d == null) continue;
                JSObject x = new JSObject();
                x.put("label", String.valueOf(v.getDescription(getContext())));
                x.put("uri", Uri.fromFile(d).toString());
                rem.put(x);
            }
        } catch (Throwable ignore) { }
        o.put("removable", rem);
        call.resolve(o);
    }

    private Bitmap thumbVid(Uri u, int px) {
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            r.setDataSource(getContext(), u);
            Bitmap f = r.getFrameAtTime(1000000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            if (f == null) f = r.getFrameAtTime();
            return fit(f, px);
        } finally {
            try { r.release(); } catch (Throwable ignored) { }
        }
    }

    private File copyTmp(Uri u) throws IOException {
        File d = new File(getContext().getCacheDir(), "thumbtmp");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        File t = File.createTempFile("t", ".bin", d);
        InputStream in = tin(u);
        OutputStream out = new FileOutputStream(t);
        try {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        } finally { in.close(); out.close(); }
        return t;
    }

    private Bitmap thumbPdf(Uri u, int px) throws IOException {
        File tmp = null;
        ParcelFileDescriptor pfd = null;
        PdfRenderer pr = null;
        try {
            try {
                pfd = "file".equals(u.getScheme())
                    ? ParcelFileDescriptor.open(new File(u.getPath()), ParcelFileDescriptor.MODE_READ_ONLY)
                    : cr().openFileDescriptor(u, "r");
                pr = new PdfRenderer(pfd);
            } catch (Throwable t) { // cloud providers hand out streams that cannot seek: render from a temporary copy
                try { if (pr != null) pr.close(); } catch (Throwable ignored) { }
                try { if (pfd != null) pfd.close(); } catch (Throwable ignored) { }
                tmp = copyTmp(u);
                pfd = ParcelFileDescriptor.open(tmp, ParcelFileDescriptor.MODE_READ_ONLY);
                pr = new PdfRenderer(pfd);
            }
            if (pr.getPageCount() < 1) return null;
            PdfRenderer.Page pg = pr.openPage(0);
            try {
                float sc = (float) px / Math.max(pg.getWidth(), pg.getHeight());
                int w = Math.max(1, Math.round(pg.getWidth() * sc)), h = Math.max(1, Math.round(pg.getHeight() * sc));
                Bitmap bm = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                bm.eraseColor(Color.WHITE);
                pg.render(bm, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                return bm;
            } finally { pg.close(); }
        } finally {
            try { if (pr != null) pr.close(); } catch (Throwable ignored) { }
            try { if (pfd != null) pfd.close(); } catch (Throwable ignored) { }
            if (tmp != null) //noinspection ResultOfMethodCallIgnored
                tmp.delete();
        }
    }

    /** EPUB cover, or the thumbnail that Word, Excel, PowerPoint and LibreOffice embed in their files. */
    private Bitmap thumbZip(Uri u, int px) throws IOException {
        ZipInputStream z = new ZipInputStream(new BufferedInputStream(tin(u)));
        try {
            ZipEntry e;
            while ((e = z.getNextEntry()) != null) {
                if (e.isDirectory()) continue;
                String n = e.getName().toLowerCase();
                boolean hit = n.matches("(^|.*/)(docprops/thumbnail|thumbnails/thumbnail)\\.(jpe?g|png)")
                    || n.matches(".*cover.*\\.(jpe?g|png|gif|webp)");
                if (!hit) continue;
                byte[] raw = readAll(z, 6 * 1024 * 1024);
                if (raw == null) continue;
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(raw, 0, raw.length, o);
                int ss = 1;
                while (o.outWidth / (ss * 2) >= px && o.outHeight / (ss * 2) >= px) ss *= 2;
                BitmapFactory.Options d = new BitmapFactory.Options();
                d.inSampleSize = ss;
                Bitmap bm = fit(BitmapFactory.decodeByteArray(raw, 0, raw.length, d), px);
                if (bm != null) return bm;
            }
            return null;
        } finally { z.close(); }
    }

    @PluginMethod
    public void clearCache(PluginCall call) {
        String keep = call.getString("keep");
        File[] fs = previewDir().listFiles();
        if (fs != null) for (File f : fs) {
            if (keep != null && f.getAbsolutePath().equals(keep)) continue; // V0.10.0: leave the file that is playing
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
        call.resolve();
    }

    /** V0.10.0: overwrite an existing document (or file://) with text or base64 bytes. Used by the text editor. */
    @PluginMethod
    public void writeUri(final PluginCall call) {
        bg(call, new Job() {
            @Override public void run() throws Exception {
                Uri u = Uri.parse(need(call, "uri"));
                String b64 = call.getString("b64");
                String text = call.getString("text");
                byte[] data = (b64 != null && !b64.isEmpty()) ? Base64.decode(b64, Base64.DEFAULT) : (text == null ? "" : text).getBytes("UTF-8");
                OutputStream out = "file".equals(u.getScheme()) ? new FileOutputStream(new File(u.getPath())) : cr().openOutputStream(u, "wt");
                if (out == null) throw new IOException("Can't write this file");
                try { out.write(data); } finally { out.close(); }
                call.resolve();
            }
        });
    }

    /** V0.26.2: overwrite an existing file with the content of another (Sync Storage). The source is read fully first (32 MB limit)
     *  so a failed read never leaves the destination half written. */
    @PluginMethod
    public void copyOver(final PluginCall call) {
        bg(call, new Job() {
            @Override public void run() throws Exception {
                Uri from = Uri.parse(need(call, "from"));
                Uri to = Uri.parse(need(call, "to"));
                java.io.ByteArrayOutputStream mem = new java.io.ByteArrayOutputStream();
                InputStream in = cr().openInputStream(from);
                try {
                    if (in == null) throw new IOException("Can't open the file");
                    byte[] buf = new byte[65536];
                    int n;
                    long tot = 0;
                    while ((n = in.read(buf)) > 0) {
                        tot += n;
                        if (tot > 32L * 1024 * 1024) throw new IOException("File is over 32 MB, skipped");
                        mem.write(buf, 0, n);
                    }
                } finally {
                    try { if (in != null) in.close(); } catch (IOException ignore) { }
                }
                OutputStream out = "file".equals(to.getScheme()) ? new FileOutputStream(new File(to.getPath())) : cr().openOutputStream(to, "wt");
                if (out == null) throw new IOException("Can't write the file");
                try { out.write(mem.toByteArray()); } finally { out.close(); }
                call.resolve();
            }
        });
    }
}
