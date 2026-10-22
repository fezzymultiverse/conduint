package com.fezzy.conduint;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.VpnService;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import com.wireguard.android.backend.BackendException;
import com.wireguard.android.backend.GoBackend;
import com.wireguard.android.backend.Tunnel;
import com.wireguard.config.BadConfigException;
import com.wireguard.config.Config;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * VpnCore: everything the VPN needs that must work without the web view (V0.26.0).
 *  - the WireGuard engine (GoBackend) and the one tunnel Conduint uses
 *  - the profile store: every profile is kept in one file, encrypted with an AES-GCM key that lives in the Android
 *    Keystore and cannot be exported. The config text (with the private key) never goes back to the web side.
 *  - rotation: switching to the next profile on a timer, driven by an alarm so it works with the screen off
 *
 * The web view is not needed for any of this, so rotation keeps working while the app is in the background.
 */
final class VpnCore {
    private VpnCore() { }

    static final String ACTION_ROTATE = "com.fezzy.conduint.VPN_ROTATE";
    static final String ACTION_NEXT = "com.fezzy.conduint.VPN_NEXT";
    static final String ACTION_STOP = "com.fezzy.conduint.VPN_STOP";

    private static final String FILE = "vpn_profiles.bin";
    private static final String KEY_ALIAS = "conduint_vpn_key";
    private static final String PREFS = "conduint_vpn";
    private static final String TUNNEL = "conduint";
    private static final Pattern PKG_OK = Pattern.compile("[A-Za-z0-9_.]{1,255}");
    private static final Pattern SPLIT_LINE = Pattern.compile("(?im)^[ \\t]*(Excluded|Included)Applications[ \\t]*=.*(\\r?\\n|$)");
    private static final Pattern DNS_LINE = Pattern.compile("(?im)^[ \\t]*DNS[ \\t]*=.*(\\r?\\n|$)");
    private static final Pattern DNS_OK = Pattern.compile("[0-9a-fA-F:.]{2,45}");
    private static final Pattern IFACE_HEAD = Pattern.compile("(?im)^[ \\t]*\\[Interface\\][ \\t]*\\r?\\n?");

    // ------------------------------------------------------------------ engine

    private static final class Tun implements Tunnel {
        volatile Tunnel.State state = Tunnel.State.DOWN;
        @Override public String getName() { return TUNNEL; }
        @Override public void onStateChange(Tunnel.State s) { state = s; }
    }

    private static GoBackend backend;
    private static final Tun TUN = new Tun();
    private static volatile String lastError = "";
    private static final Object LOCK = new Object();

    static GoBackend engine(Context c) throws Exception {
        synchronized (LOCK) {
            if (backend == null) {
                try { backend = new GoBackend(c.getApplicationContext()); }
                catch (Throwable t) { throw new Exception("The WireGuard engine could not start on this device."); }
            }
            return backend;
        }
    }

    static GoBackend engineOrNull() { return backend; }
    static Tunnel tunnel() { return TUN; }
    static String lastError() { return lastError; }
    static void setError(String e) { lastError = e == null ? "" : e; }

    static boolean isUp() {
        try { return backend != null && String.valueOf(backend.getState(TUN)).equals("UP"); }
        catch (Throwable t) { return false; }
    }

    // ------------------------------------------------------------------ settings

    static SharedPreferences prefs(Context c) { return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** Defaults: rotation off, 60 minutes, in order, keep running in the background on, free memory off. */
    static JSONObject settings(Context c) throws Exception {
        SharedPreferences p = prefs(c);
        JSONObject o = new JSONObject();
        o.put("rotate", p.getBoolean("rotate", false));
        o.put("minutes", p.getInt("minutes", 60));
        o.put("random", p.getBoolean("random", false));
        o.put("keepAlive", p.getBoolean("keepAlive", true));
        o.put("freeMem", p.getBoolean("freeMem", false));
        o.put("dns", p.getString("dns", ""));
        o.put("activeId", p.getString("activeId", ""));
        o.put("nextAt", p.getLong("nextAt", 0));
        return o;
    }

    // ------------------------------------------------------------------ encrypted profile store

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return (SecretKey) ks.getKey(KEY_ALIAS, null);
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build());
        return g.generateKey();
    }

    /** True when a store file exists but cannot be opened (for example the Keystore key was lost). Saving is then blocked. */
    private static volatile boolean broken = false;

    private static JSONArray load(Context c) throws Exception {
        File f = new File(c.getFilesDir(), FILE);
        if (!f.exists()) { broken = false; return new JSONArray(); }
        byte[] all;
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[8192]; int n;
            while ((n = in.read(b)) > 0) bo.write(b, 0, n);
            all = bo.toByteArray();
        }
        try {
            if (all.length < 13) throw new Exception("short");
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, all, 0, 12));
            byte[] plain = ci.doFinal(all, 12, all.length - 12);
            broken = false;
            return new JSONArray(new String(plain, StandardCharsets.UTF_8));
        } catch (Throwable t) {
            broken = true;
            throw new Exception("Saved VPN profiles could not be unlocked on this phone. They are kept untouched and nothing will be overwritten.");
        }
    }

    private static void save(Context c, JSONArray arr) throws Exception {
        if (broken) throw new Exception("Saved VPN profiles could not be unlocked, so saving is blocked to protect them.");
        Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
        ci.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = ci.getIV();
        byte[] enc = ci.doFinal(arr.toString().getBytes(StandardCharsets.UTF_8));
        File tmp = new File(c.getFilesDir(), FILE + ".tmp"), dst = new File(c.getFilesDir(), FILE);
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(iv); out.write(enc); out.getFD().sync();
        }
        if (!tmp.renameTo(dst)) throw new Exception("The profiles could not be saved.");
    }

    // ------------------------------------------------------------------ profile operations

    static String newId() {
        byte[] b = new byte[4]; new SecureRandom().nextBytes(b);
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }

    /** Safe summaries only. The private key and the config text are never included. */
    static JSONArray list(Context c) throws Exception {
        JSONArray src = load(c), out = new JSONArray();
        String active = isUp() ? prefs(c).getString("activeId", "") : "";
        for (int i = 0; i < src.length(); i++) {
            JSONObject p = src.getJSONObject(i);
            JSONObject o = new JSONObject();
            o.put("id", p.getString("id"));
            o.put("name", p.getString("name"));
            o.put("mode", p.optString("mode", "all"));
            o.put("apps", p.optJSONArray("apps") == null ? new JSONArray() : p.getJSONArray("apps"));
            o.put("active", p.getString("id").equals(active));
            try {
                JSONObject s = VpnPlugin.summaryOf(parse(p.getString("config")));
                o.put("endpoint", s.optString("endpoint"));
                o.put("fullTunnel", s.optBoolean("fullTunnel"));
                o.put("dns", s.optJSONArray("dns"));
                o.put("v4route", s.optBoolean("v4route"));
                o.put("v6route", s.optBoolean("v6route"));
            } catch (Throwable t) { o.put("endpoint", ""); o.put("bad", true); }
            out.put(o);
        }
        return out;
    }

    static JSONObject find(Context c, String id) throws Exception {
        JSONArray a = load(c);
        for (int i = 0; i < a.length(); i++) if (a.getJSONObject(i).getString("id").equals(id)) return a.getJSONObject(i);
        throw new Exception("That profile no longer exists.");
    }

    /** Validates the config first. Returns the new profile id. Duplicate names get a number. */
    static String add(Context c, String name, String config) throws Exception {
        parse(config); // throws a plain sentence when the config is bad
        JSONArray a = load(c);
        String base = (name == null || name.trim().isEmpty()) ? "VPN" : name.trim();
        if (base.length() > 40) base = base.substring(0, 40);
        String nm = base; int n = 2;
        while (hasName(a, nm)) nm = base + " " + (n++);
        JSONObject p = new JSONObject();
        p.put("id", newId()); p.put("name", nm); p.put("config", config.replace("\r\n", "\n"));
        p.put("mode", "all"); p.put("apps", new JSONArray()); p.put("added", System.currentTimeMillis());
        a.put(p);
        save(c, a);
        return p.getString("id");
    }

    private static boolean hasName(JSONArray a, String nm) throws Exception {
        for (int i = 0; i < a.length(); i++) if (a.getJSONObject(i).getString("name").equalsIgnoreCase(nm)) return true;
        return false;
    }

    static void rename(Context c, String id, String name) throws Exception {
        if (name == null || name.trim().isEmpty()) throw new Exception("Give the profile a name.");
        JSONArray a = load(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject p = a.getJSONObject(i);
            if (p.getString("id").equals(id)) { p.put("name", name.trim().length() > 40 ? name.trim().substring(0, 40) : name.trim()); save(c, a); return; }
        }
        throw new Exception("That profile no longer exists.");
    }

    static void setRouting(Context c, String id, String mode, JSONArray apps) throws Exception {
        if (!"all".equals(mode) && !"exclude".equals(mode) && !"include".equals(mode)) throw new Exception("Unknown routing mode.");
        JSONArray clean = new JSONArray();
        for (int i = 0; apps != null && i < apps.length(); i++) {
            String p = apps.optString(i, "").trim();
            if (p.isEmpty()) continue;
            if (!PKG_OK.matcher(p).matches()) throw new Exception("Not a valid app id.");
            clean.put(p);
        }
        if ("include".equals(mode) && clean.length() == 0) throw new Exception("Pick at least one app to send through the VPN.");
        JSONArray a = load(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject p = a.getJSONObject(i);
            if (p.getString("id").equals(id)) { p.put("mode", mode); p.put("apps", clean); save(c, a); return; }
        }
        throw new Exception("That profile no longer exists.");
    }

    static void delete(Context c, String id) throws Exception {
        JSONArray a = load(c), out = new JSONArray();
        boolean found = false;
        for (int i = 0; i < a.length(); i++) {
            if (a.getJSONObject(i).getString("id").equals(id)) { found = true; continue; }
            out.put(a.getJSONObject(i));
        }
        if (!found) return;
        if (isUp() && prefs(c).getString("activeId", "").equals(id)) disconnect(c);
        save(c, out);
    }

    // ------------------------------------------------------------------ config handling

    /** Parses config text. Errors are plain sentences and never contain the config text. */
    static Config parse(String text) throws Exception {
        if (text == null || text.trim().isEmpty()) throw new Exception("The config is empty.");
        if (text.length() > 200000) throw new Exception("That file is too big to be a WireGuard config.");
        try {
            return Config.parse(new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8)));
        } catch (BadConfigException e) {
            throw new Exception("That config can't be used (" + String.valueOf(e.getSection()).toLowerCase().replace('_', ' ') + ", "
                    + String.valueOf(e.getLocation()).toLowerCase().replace('_', ' ') + ": "
                    + String.valueOf(e.getReason()).toLowerCase().replace('_', ' ') + "). Check the file is a WireGuard .conf.");
        } catch (java.io.IOException e) {
            throw new Exception("The config could not be read.");
        }
    }

    /** Per-app routing: writes ExcludedApplications or IncludedApplications into [Interface], replacing any existing line. */
    private static String withSplit(String text, String mode, JSONArray apps) throws Exception {
        if (mode == null || mode.equals("all") || apps == null || apps.length() == 0) return SPLIT_LINE.matcher(text).replaceAll("");
        StringBuilder list = new StringBuilder();
        for (int i = 0; i < apps.length(); i++) {
            String p = apps.optString(i, "");
            if (!PKG_OK.matcher(p).matches()) continue;
            if (list.length() > 0) list.append(", ");
            list.append(p);
        }
        String clean = SPLIT_LINE.matcher(text).replaceAll("");
        if (list.length() == 0) return clean;
        Matcher m = IFACE_HEAD.matcher(clean);
        if (!m.find()) throw new Exception("The config has no [Interface] section.");
        String head = clean.substring(0, m.end());
        if (!head.endsWith("\n")) head += "\n";
        return head + (mode.equals("exclude") ? "ExcludedApplications = " : "IncludedApplications = ") + list + "\n" + clean.substring(m.end());
    }

    /** V0.32.1: DNS chosen in the app (a filtering resolver such as AdGuard or Cloudflare Family) replaces the DNS line of the config. Empty = keep the server\u2019s own DNS. */
    private static String withDns(Context c, String text) throws Exception {
        String dns = prefs(c).getString("dns", "");
        if (dns == null || dns.trim().isEmpty()) return text;
        String clean = DNS_LINE.matcher(text).replaceAll("");
        Matcher m = IFACE_HEAD.matcher(clean);
        if (!m.find()) throw new Exception("The config has no [Interface] section.");
        String head = clean.substring(0, m.end());
        if (!head.endsWith("\n")) head += "\n";
        return head + "DNS = " + dns + "\n" + clean.substring(m.end());
    }

    // ------------------------------------------------------------------ connect, disconnect, rotate

    /** Plain-language message and stable code for any failure. */
    static String[] explain(Throwable t) {
        if (t instanceof BackendException) {
            String r = String.valueOf(((BackendException) t).getReason());
            switch (r) {
                case "VPN_NOT_AUTHORIZED": return new String[]{r, "Android has not allowed Conduint to set up a VPN yet."};
                case "DNS_RESOLUTION_FAILURE": return new String[]{r, "The VPN server name could not be looked up. Check your internet connection."};
                case "UNABLE_TO_START_VPN": return new String[]{r, "Android refused to start the VPN. Another VPN app may be blocking it."};
                case "TUN_CREATION_ERROR": return new String[]{r, "Android could not create the VPN interface. Turn off any other VPN and try again."};
                case "GO_ACTIVATION_ERROR_CODE": return new String[]{r, "The WireGuard engine failed to start the tunnel. The keys or the server address may be wrong."};
                default: return new String[]{r, "The VPN could not be switched. (" + r.toLowerCase().replace('_', ' ') + ")"};
            }
        }
        String m = t.getMessage();
        return new String[]{"VPN_ERROR", (m != null && m.length() < 200) ? m : "The VPN could not be switched."};
    }

    /** Connects to a stored profile. Blocking: call from a background thread. Switching profiles while up is done by the library in one step. */
    private static void nap(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
    }

    /** The config of the profile that is connected right now, or null. Used to put the old server back when a switch fails. */
    private static Config currentConfig(Context c) {
        try {
            String cur = prefs(c).getString("activeId", "");
            if (cur.isEmpty()) return null;
            JSONObject q = find(c, cur);
            return parse(withDns(c, withSplit(q.getString("config"), q.optString("mode", "all"), q.optJSONArray("apps"))));
        } catch (Throwable t) { return null; }
    }

    /**
     * V0.31.3: switching servers. The library brings the old tunnel down and the new one up in one go, and in between it stops the
     * VpnService. Android destroys that service a moment later, and when the destroy lands after the new tunnel is up it tears the new
     * tunnel down too: the VPN "disconnects" on Next server. So a switch is done in two steps with a pause for Android to retire the
     * old service, the result is checked after a moment, and a tunnel that dropped is brought up again (3 tries). If every try fails the
     * server that was connected before is put back.
     */
    static void connect(Context c, String id) throws Exception {
        synchronized (LOCK) {
            JSONObject p = find(c, id);
            String text = withDns(c, withSplit(p.getString("config"), p.optString("mode", "all"), p.optJSONArray("apps")));
            Config cfg = parse(text);
            if (VpnService.prepare(c.getApplicationContext()) != null) throw new BackendException(BackendException.Reason.VPN_NOT_AUTHORIZED);
            GoBackend be = engine(c);
            // V0.34.0: Android allows one VPN at a time, so the app firewall (also a VPN) is turned off first.
            if (FirewallService.running || FirewallService.enabled(c)) { FirewallService.stop(c); nap(900); }
            Config before = isUp() ? currentConfig(c) : null;
            if (isUp()) {
                TUN.state = be.setState(TUN, Tunnel.State.DOWN, null);
                nap(1300);
            }
            Exception last = null;
            boolean good = false;
            for (int attempt = 0; attempt < 3 && !good; attempt++) {
                try {
                    TUN.state = be.setState(TUN, Tunnel.State.UP, cfg);
                    nap(1000);
                    if (isUp()) good = true;
                    else last = new Exception("The VPN dropped right after it connected.");
                } catch (Exception ex) {
                    last = ex;
                }
                if (!good) {
                    try { if (isUp()) TUN.state = be.setState(TUN, Tunnel.State.DOWN, null); } catch (Exception ignore) { }
                    nap(1300);
                }
            }
            if (!good) {
                if (before != null) {
                    try { TUN.state = be.setState(TUN, Tunnel.State.UP, before); } catch (Exception ignore) { }
                }
                throw last == null ? new Exception("The VPN could not be switched.") : last;
            }
            SharedPreferences.Editor e = prefs(c).edit();
            e.putString("activeId", id).putString("activeName", p.getString("name")).apply();
            lastError = "";
        }
        VpnKeeper.onConnected(c);
        scheduleNext(c);
    }

    static void disconnect(Context c) throws Exception {
        synchronized (LOCK) {
            cancelAlarm(c);
            prefs(c).edit().putLong("nextAt", 0).apply();
            if (backend != null) TUN.state = backend.setState(TUN, Tunnel.State.DOWN, null);
        }
        VpnKeeper.onDisconnected(c);
    }

    /**
     * Moves to the next profile (in order, or random). A profile that fails is skipped and the next one is tried, so one dead
     * server cannot stop rotation. If every profile fails the VPN stays on the one it had (the library restores it).
     */
    static String rotateNow(Context c) throws Exception {
        JSONArray a = load(c);
        int n = a.length();
        if (n < 2) throw new Exception("Add a second profile to rotate between servers.");
        String cur = prefs(c).getString("activeId", "");
        int at = -1;
        for (int i = 0; i < n; i++) if (a.getJSONObject(i).getString("id").equals(cur)) at = i;
        boolean random = prefs(c).getBoolean("random", false);
        int start = random ? new SecureRandom().nextInt(n) : (at + 1) % n;
        Exception last = null;
        for (int k = 0; k < n; k++) {
            int i = (start + k) % n;
            String id = a.getJSONObject(i).getString("id");
            if (id.equals(cur) && n > 1) continue;
            try { connect(c, id); return a.getJSONObject(i).getString("name"); }
            catch (Exception ex) { last = ex; }
        }
        String[] e = explain(last == null ? new Exception("No profile could connect.") : last);
        lastError = "Rotation: " + e[1];
        scheduleNext(c);
        throw last == null ? new Exception(e[1]) : last;
    }

    // ------------------------------------------------------------------ alarm

    private static PendingIntent alarmIntent(Context c) {
        Intent i = new Intent(c, VpnRotateReceiver.class).setAction(ACTION_ROTATE);
        return PendingIntent.getBroadcast(c, 77, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void cancelAlarm(Context c) {
        try { ((AlarmManager) c.getSystemService(Context.ALARM_SERVICE)).cancel(alarmIntent(c)); } catch (Throwable ignore) { }
    }

    /** Sets (or clears) the next rotation. setAndAllowWhileIdle needs no special permission; Android may delay it by a few minutes in deep sleep. */
    static void scheduleNext(Context c) {
        try {
            SharedPreferences p = prefs(c);
            cancelAlarm(c);
            if (!p.getBoolean("rotate", false) || !isUp()) { p.edit().putLong("nextAt", 0).apply(); VpnKeeper.refresh(c); return; }
            int min = Math.max(5, Math.min(1440, p.getInt("minutes", 60)));
            long at = System.currentTimeMillis() + min * 60000L;
            ((AlarmManager) c.getSystemService(Context.ALARM_SERVICE)).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarmIntent(c));
            p.edit().putLong("nextAt", at).apply();
            VpnKeeper.refresh(c);
        } catch (Throwable ignore) { }
    }

    static void setOptions(Context c, JSONObject o) {
        SharedPreferences.Editor e = prefs(c).edit();
        if (o.has("rotate")) e.putBoolean("rotate", o.optBoolean("rotate"));
        if (o.has("minutes")) e.putInt("minutes", Math.max(5, Math.min(1440, o.optInt("minutes", 60))));
        if (o.has("random")) e.putBoolean("random", o.optBoolean("random"));
        if (o.has("keepAlive")) e.putBoolean("keepAlive", o.optBoolean("keepAlive"));
        if (o.has("freeMem")) e.putBoolean("freeMem", o.optBoolean("freeMem"));
        if (o.has("dns")) {
            StringBuilder d = new StringBuilder();
            int n = 0;
            for (String t : o.optString("dns", "").split("[,\\s]+")) {
                if (t.isEmpty() || !DNS_OK.matcher(t).matches() || n >= 4) continue;
                if (d.length() > 0) d.append(", ");
                d.append(t);
                n++;
            }
            e.putString("dns", d.toString());
        }
        e.apply();
        scheduleNext(c);
        VpnKeeper.onOptionsChanged(c);
    }

}
