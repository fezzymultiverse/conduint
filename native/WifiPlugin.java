package com.fezzy.conduint;

import android.Manifest;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PermissionState;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.net.URLConnection;
import java.net.UnknownHostException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.SSLException;

/**
 * Wifi: the Wi-Fi check (V0.28.5). One call, check(), looks at the network the phone is on right now and returns plain facts.
 * The web side (wifi.js) turns them into findings.
 *
 *  - security type: what the connection itself uses (open, WEP, WPA/WPA2, WPA3 ...). Android 12+ only; older phones report unknown.
 *  - captive portal: Android's own flag plus an HTTPS probe that must answer 204 and must not be rewritten.
 *  - DNS: the servers in use, whether Private DNS is on, and three tests (a name that cannot exist, two names with fixed answers,
 *    and public names answered with private addresses).
 *
 * Privacy rules kept here: check() never reads the network name (SSID), the BSSID or the IP address of the phone.
 * V0.50.0: ssid() is the one exception. It returns the name of the Wi-Fi you are connected to, only after you allow Location
 * (Android requires that permission to show a Wi-Fi name), only so Home can show it. It is never stored, logged or sent anywhere.
 * check() itself still needs only ACCESS_NETWORK_STATE and ACCESS_WIFI_STATE.
 * Everything runs on one worker thread and every failure becomes a plain result, never a crash.
 */
@CapacitorPlugin(name = "Wifi", permissions = { @Permission(alias = "loc", strings = { Manifest.permission.ACCESS_FINE_LOCATION }) })
public class WifiPlugin extends Plugin {

    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor();
    private static final SecureRandom RND = new SecureRandom();

    @PluginMethod
    public void check(final PluginCall call) {
        EXEC.execute(() -> {
            try {
                call.resolve(run(getContext()));
            } catch (Throwable t) {
                JSObject o = new JSObject();
                o.put("online", false);
                o.put("transport", "unknown");
                o.put("error", "The check could not run on this phone.");
                call.resolve(o);
            }
        });
    }

    /** V0.50.0: the name of the Wi-Fi network the phone is on, for the Home screen. ask:true shows Android's Location prompt once. */
    @PluginMethod
    public void ssid(final PluginCall call) {
        if (getPermissionState("loc") != PermissionState.GRANTED) {
            if (Boolean.TRUE.equals(call.getBoolean("ask", false))) {
                requestPermissionForAlias("loc", call, "ssidPerm");
            } else {
                JSObject o = new JSObject();
                o.put("granted", false);
                call.resolve(o);
            }
            return;
        }
        readSsid(call);
    }

    @PermissionCallback
    private void ssidPerm(PluginCall call) {
        if (getPermissionState("loc") == PermissionState.GRANTED) {
            readSsid(call);
        } else {
            JSObject o = new JSObject();
            o.put("granted", false);
            call.resolve(o);
        }
    }

    @SuppressWarnings({"deprecation", "MissingPermission"})
    private void readSsid(PluginCall call) {
        JSObject o = new JSObject();
        o.put("granted", true);
        try {
            Context ctx = getContext();
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            boolean wifi = false;
            if (cm != null) {
                for (Network n : cm.getAllNetworks()) {
                    NetworkCapabilities c = cm.getNetworkCapabilities(n);
                    if (c != null && c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) && !c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) { wifi = true; break; }
                }
            }
            o.put("wifi", wifi);
            if (wifi) {
                WifiManager wm = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                WifiInfo wi = wm == null ? null : wm.getConnectionInfo();
                String s = wi == null ? null : wi.getSSID();
                if (s != null) {
                    if (s.length() > 1 && s.startsWith("\"") && s.endsWith("\"")) s = s.substring(1, s.length() - 1);
                    if (!s.isEmpty() && !"<unknown ssid>".equals(s)) o.put("ssid", s);
                }
            }
        } catch (Throwable ignored) { }
        call.resolve(o);
    }

    private JSObject run(Context ctx) {
        JSObject out = new JSObject();
        ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
        Network net = cm == null ? null : cm.getActiveNetwork();
        NetworkCapabilities caps = (cm == null || net == null) ? null : cm.getNetworkCapabilities(net);
        if (net == null || caps == null) {
            out.put("online", false);
            out.put("transport", "none");
            return out;
        }
        out.put("online", true);
        String tr = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ? "wifi"
                : caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ? "cellular"
                : caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ? "ethernet"
                : caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) ? "vpn" : "other";
        out.put("transport", tr);
        out.put("vpn", caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN));
        boolean wifi = "wifi".equals(tr) || (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) && underlyingWifi(cm));
        out.put("viaWifi", wifi);
        if (wifi) out.put("security", security(ctx));
        out.put("captive", captive(net, caps));
        out.put("dns", dns(net, cm));
        return out;
    }

    /** With a VPN on, the active network is the tunnel. This finds out whether a real Wi-Fi network sits underneath it. */
    @SuppressWarnings("deprecation")
    private boolean underlyingWifi(ConnectivityManager cm) {
        try {
            for (Network n : cm.getAllNetworks()) {
                NetworkCapabilities c = cm.getNetworkCapabilities(n);
                if (c != null && c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) && !c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return true;
            }
        } catch (Throwable ignored) { }
        return false;
    }

    /** Security type of the current Wi-Fi connection. Never reads the network name. */
    @SuppressWarnings({"deprecation", "MissingPermission"})
    private JSObject security(Context ctx) {
        JSObject s = new JSObject();
        s.put("type", -1);
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                WifiManager wm = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                WifiInfo wi = wm == null ? null : wm.getConnectionInfo();
                if (wi != null) s.put("type", wi.getCurrentSecurityType());
            }
        } catch (Throwable ignored) { }
        return s;
    }

    /** Captive portal: Android's flag plus our own HTTPS probe on the active network. */
    private JSObject captive(Network net, NetworkCapabilities caps) {
        JSObject c = new JSObject();
        c.put("flag", caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_CAPTIVE_PORTAL));
        c.put("validated", caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
        String r = probe(net, "https://connectivitycheck.gstatic.com/generate_204");
        if ("fail".equals(r)) r = probe(net, "https://cp.cloudflare.com/generate_204");
        c.put("probe", r);
        return c;
    }

    /** ok = answered 204 untouched; redirect = a login page or rewrite came back; tls = the secure connection was tampered with; fail = no answer. */
    private String probe(Network net, String u) {
        HttpURLConnection h = null;
        try {
            URLConnection uc = net.openConnection(new URL(u));
            h = (HttpURLConnection) uc;
            h.setInstanceFollowRedirects(false);
            h.setConnectTimeout(6000);
            h.setReadTimeout(6000);
            h.setUseCaches(false);
            h.setRequestMethod("GET");
            int code = h.getResponseCode();
            return code == 204 ? "ok" : "redirect";
        } catch (SSLException e) {
            return "tls";
        } catch (IOException e) {
            return "fail";
        } catch (Throwable t) {
            return "fail";
        } finally {
            if (h != null) try { h.disconnect(); } catch (Throwable ignored) { }
        }
    }

    private JSObject dns(Network net, ConnectivityManager cm) {
        JSObject d = new JSObject();
        JSArray servers = new JSArray();
        try {
            LinkProperties lp = cm.getLinkProperties(net);
            if (lp != null) {
                for (InetAddress a : lp.getDnsServers()) servers.put(a.getHostAddress());
                if (Build.VERSION.SDK_INT >= 28) {
                    d.put("privateOn", lp.isPrivateDnsActive());
                    String pn = lp.getPrivateDnsServerName();
                    if (pn != null) d.put("privateHost", pn);
                }
            }
        } catch (Throwable ignored) { }
        d.put("servers", servers);

        /* test 1: a name that can never exist (.invalid is reserved). Any address back means unknown names are being rewritten. */
        String bogus = "cnd" + Long.toHexString(RND.nextLong() & 0xffffffffffL) + ".invalid";
        String got = first(net, bogus);
        d.put("nxdomain", got == null ? "ok" : "rewritten");

        /* test 2: names whose answers never change. A different address means the answer was replaced. */
        d.put("anchors", new JSArray()
                .put(anchor(net, "one.one.one.one", "1.1.1.1", "1.0.0.1", "2606:4700:4700:0:0:0:0:1111", "2606:4700:4700:0:0:0:0:1001"))
                .put(anchor(net, "dns.google", "8.8.8.8", "8.8.4.4", "2001:4860:4860:0:0:0:0:8888", "2001:4860:4860:0:0:0:0:8844")));

        /* test 3: ordinary public sites answered with a private or empty address */
        JSArray priv = new JSArray();
        for (String h : new String[]{"www.wikipedia.org", "www.google.com"}) {
            try {
                for (InetAddress a : net.getAllByName(h)) {
                    if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress()) {
                        priv.put(h);
                        break;
                    }
                }
            } catch (UnknownHostException ignored) { } catch (Throwable ignored) { }
        }
        d.put("private", priv);
        return d;
    }

    private JSObject anchor(Network net, String host, String... expect) {
        JSObject o = new JSObject();
        o.put("host", host);
        Set<String> ok = new HashSet<>(Arrays.asList(expect));
        try {
            boolean bad = false;
            InetAddress[] all = net.getAllByName(host);
            for (InetAddress a : all) {
                String ip = a.getHostAddress();
                int pct = ip.indexOf('%');
                if (pct > 0) ip = ip.substring(0, pct);
                if (!ok.contains(ip)) bad = true;
            }
            o.put("result", all.length == 0 ? "none" : bad ? "wrong" : "ok");
        } catch (UnknownHostException e) {
            o.put("result", "none");
        } catch (Throwable t) {
            o.put("result", "none");
        }
        return o;
    }

    private String first(Network net, String host) {
        try {
            InetAddress[] a = net.getAllByName(host);
            return a.length > 0 ? a[0].getHostAddress() : null;
        } catch (Throwable t) {
            return null;
        }
    }
}
