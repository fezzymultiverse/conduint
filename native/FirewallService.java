package com.fezzy.conduint;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.VpnService;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;

import org.json.JSONObject;

import java.io.FileInputStream;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * FirewallService: per-app network blocking (V0.34.0). Rootless: it is a VpnService that sends ONLY the blocked apps into
 * a tunnel that goes nowhere (every packet is read and thrown away), so those apps get no connection. Every other app
 * is not routed through it and is not touched. Nothing leaves the phone and nothing is logged.
 *
 * Rules per app:  wifi = blocked on Wi-Fi only,  mobile = blocked on mobile data only,  both = blocked on Wi-Fi and mobile data,
 *                 focus = blocked completely: every network, Wi-Fi, mobile, Ethernet, hotspot, anything.
 * When the phone changes network (Wi-Fi to mobile data and back) the tunnel is rebuilt with the apps that are blocked on the
 * new network, so "Wi-Fi only" and "Mobile only" follow the phone.
 *
 * Android allows ONE VPN at a time: starting this turns the WireGuard VPN off, and connecting the WireGuard VPN turns this off.
 */
public class FirewallService extends VpnService {

    static final String PREFS = "conduint_fw";
    static final String ACTION_STOP = "com.fezzy.conduint.FW_STOP";
    static final String ACTION_REFRESH = "com.fezzy.conduint.FW_REFRESH";
    private static final Pattern PKG_OK = Pattern.compile("[A-Za-z0-9_.]{1,255}");

    static volatile boolean running = false;
    static volatile String net = "none"; // wifi | mobile | other | none

    private ParcelFileDescriptor tun;
    private ConnectivityManager cm;
    private ConnectivityManager.NetworkCallback cb;
    private final Map<Network, String> nets = new HashMap<>();
    private final Handler main = new Handler(Looper.getMainLooper());
    private String builtFor = "";

    // ------------------------------------------------------------------ rules store (shared with VpnPlugin)

    static SharedPreferences prefs(Context c) { return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static boolean validRule(String r) {
        return "wifi".equals(r) || "mobile".equals(r) || "both".equals(r) || "focus".equals(r);
    }

    /** {pkg: "wifi"|"mobile"|"both"|"focus"}; apps with no rule are simply absent. */
    static JSONObject rules(Context c) {
        try { return new JSONObject(prefs(c).getString("rules", "{}")); } catch (Throwable t) { return new JSONObject(); }
    }

    /** Replaces the whole rule map. Bad package names and unknown rules are dropped. Returns how many rules were kept. */
    static int setRules(Context c, JSONObject in) throws Exception {
        JSONObject clean = new JSONObject();
        Iterator<String> it = in.keys();
        while (it.hasNext()) {
            String pkg = it.next();
            String r = in.optString(pkg, "");
            if (!PKG_OK.matcher(pkg).matches() || !validRule(r)) continue;
            if (pkg.equals(c.getApplicationContext().getPackageName())) continue; // never block Conduint itself
            clean.put(pkg, r);
        }
        prefs(c).edit().putString("rules", clean.toString()).apply();
        if (running) {
            Intent i = new Intent(c.getApplicationContext(), FirewallService.class).setAction(ACTION_REFRESH);
            try { c.getApplicationContext().startService(i); } catch (Throwable ignore) { }
        }
        return clean.length();
    }

    static boolean enabled(Context c) { return prefs(c).getBoolean("enabled", false); }

    /** Apps blocked on a given network type. Focus is blocked everywhere, "both" on Wi-Fi, mobile and when the phone has no network. */
    static Set<String> blockedOn(Context c, String network) {
        Set<String> out = new HashSet<>();
        JSONObject r = rules(c);
        Iterator<String> it = r.keys();
        while (it.hasNext()) {
            String pkg = it.next();
            String rule = r.optString(pkg, "");
            boolean hit;
            switch (network) {
                case "wifi": hit = rule.equals("wifi") || rule.equals("both") || rule.equals("focus"); break;
                case "mobile": hit = rule.equals("mobile") || rule.equals("both") || rule.equals("focus"); break;
                default: hit = rule.equals("both") || rule.equals("focus"); // other / none: Ethernet, hotspot, unknown
            }
            if (hit) out.add(pkg);
        }
        return out;
    }

    // ------------------------------------------------------------------ start / stop (called from the plugin and VpnCore)

    static void start(Context c) {
        prefs(c).edit().putBoolean("enabled", true).apply();
        try { c.getApplicationContext().startService(new Intent(c.getApplicationContext(), FirewallService.class)); } catch (Throwable ignore) { }
    }

    /** Turns the firewall off and remembers that. */
    static void stop(Context c) {
        prefs(c).edit().putBoolean("enabled", false).apply();
        try { c.getApplicationContext().startService(new Intent(c.getApplicationContext(), FirewallService.class).setAction(ACTION_STOP)); } catch (Throwable ignore) { }
        running = false;
    }

    // ------------------------------------------------------------------ service

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(a)) {
            teardown();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!enabled(this)) { teardown(); stopSelf(); return START_NOT_STICKY; }
        if (VpnService.prepare(this) != null) { // consent lost: do not pretend to block
            prefs(this).edit().putBoolean("enabled", false).apply();
            teardown(); stopSelf(); return START_NOT_STICKY;
        }
        listen();
        main.post(this::apply);
        return START_STICKY;
    }

    private void listen() {
        if (cb != null) return;
        try {
            cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkRequest req = new NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN).build();
            cb = new ConnectivityManager.NetworkCallback() {
                @Override public void onCapabilitiesChanged(Network n, NetworkCapabilities nc) {
                    String t = nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ? "wifi"
                            : nc.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ? "mobile" : "other";
                    synchronized (nets) { nets.put(n, t); }
                    main.post(FirewallService.this::apply);
                }
                @Override public void onLost(Network n) {
                    synchronized (nets) { nets.remove(n); }
                    main.post(FirewallService.this::apply);
                }
            };
            cm.registerNetworkCallback(req, cb, main);
        } catch (Throwable t) { cb = null; }
    }

    /** The phone uses Wi-Fi whenever it is connected, otherwise mobile data. */
    private String currentNet() {
        boolean w = false, m = false, o = false;
        synchronized (nets) {
            for (String t : nets.values()) { if (t.equals("wifi")) w = true; else if (t.equals("mobile")) m = true; else o = true; }
        }
        return w ? "wifi" : m ? "mobile" : o ? "other" : "none";
    }

    /** Rebuilds the tunnel for the current network. Nothing blocked on this network = no tunnel at all (every app is online). */
    private void apply() {
        if (!enabled(this)) return;
        net = currentNet();
        Set<String> blocked = blockedOn(this, net);
        java.util.List<String> sorted = new java.util.ArrayList<>(blocked);
        java.util.Collections.sort(sorted);
        String sig = net + "|" + sorted;
        if (sig.equals(builtFor) && (tun != null || sorted.isEmpty())) { running = true; return; }
        ParcelFileDescriptor fresh = null;
        if (!sorted.isEmpty()) {
            try {
                Builder b = new Builder().setSession("Conduint app firewall").setMtu(1400)
                        .addAddress("10.77.77.2", 32).addRoute("0.0.0.0", 0)
                        .addAddress("fd77:7777::2", 128).addRoute("::", 0);
                int added = 0;
                PackageManager pm = getPackageManager();
                for (String pkg : sorted) {
                    try { pm.getPackageInfo(pkg, 0); b.addAllowedApplication(pkg); added++; }
                    catch (Throwable ignore) { /* app was uninstalled */ }
                }
                // With no allowed application Android would send EVERY app into the tunnel, so never build in that case.
                if (added > 0) fresh = b.establish();
            } catch (Throwable t) { fresh = null; }
        }
        ParcelFileDescriptor old = tun;
        tun = fresh;
        builtFor = sig;
        running = true;
        if (fresh != null) drain(fresh);
        if (old != null) { try { old.close(); } catch (Throwable ignore) { } }
    }

    /** Reads and discards everything the blocked apps try to send, so their connections simply time out. */
    private void drain(final ParcelFileDescriptor p) {
        Thread t = new Thread(() -> {
            byte[] buf = new byte[32768];
            try (FileInputStream in = new FileInputStream(p.getFileDescriptor())) {
                while (in.read(buf) >= 0) { /* dropped */ }
            } catch (Throwable ignore) { }
        }, "cnd-fw-drain");
        t.setDaemon(true);
        t.start();
    }

    private void teardown() {
        running = false;
        net = "none";
        builtFor = "";
        try { if (cm != null && cb != null) cm.unregisterNetworkCallback(cb); } catch (Throwable ignore) { }
        cb = null;
        synchronized (nets) { nets.clear(); }
        if (tun != null) { try { tun.close(); } catch (Throwable ignore) { } tun = null; }
    }

    /** Another VPN (the WireGuard one) took over, or the person removed the permission: the firewall is off. */
    @Override
    public void onRevoke() {
        prefs(this).edit().putBoolean("enabled", false).apply();
        teardown();
        stopSelf();
        super.onRevoke();
    }

    @Override
    public void onDestroy() {
        teardown();
        super.onDestroy();
    }
}
