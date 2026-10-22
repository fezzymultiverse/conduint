package com.fezzy.conduint;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.net.VpnService;
import android.provider.OpenableColumns;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.wireguard.config.Config;
import com.wireguard.config.InetEndpoint;
import com.wireguard.config.InetNetwork;
import com.wireguard.config.Peer;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Vpn: the web side's door to the built-in WireGuard client (V0.26.0, Shield phase 4).
 * Conduint runs no servers: the person imports their own WireGuard configs (for example from Proton VPN).
 *
 * Privacy rules kept here:
 *  - config text goes in (file import or paste) and never comes back out. The web side only ever receives summaries.
 *  - nothing is logged. Error messages are plain sentences that never contain config text.
 *  - profiles are stored encrypted by VpnCore with a non-exportable Keystore key.
 * Only one VPN can be active on Android at a time. Turning this one on replaces any other VPN.
 */
@CapacitorPlugin(name = "Vpn")
public class VpnPlugin extends Plugin {

    /** One worker thread for everything that touches the tunnel or the store, so calls can never overlap. */
    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor();

    private interface Job { void run() throws Exception; }

    private void run(final PluginCall call, final Job job) {
        EXEC.execute(() -> {
            try {
                job.run();
            } catch (Throwable t) {
                String[] e = VpnCore.explain(t);
                VpnCore.setError(e[1]);
                call.reject(e[1], e[0]);
            }
        });
    }

    private Context ctx() { return getContext().getApplicationContext(); }

    /** Safe description of a config. Never includes the private key. */
    static JSObject summaryOf(Config cfg) {
        JSObject o = new JSObject();
        JSArray addrs = new JSArray();
        for (InetNetwork n : cfg.getInterface().getAddresses()) addrs.put(n.toString());
        JSArray dns = new JSArray();
        for (InetAddress a : cfg.getInterface().getDnsServers()) dns.put(a.getHostAddress());
        boolean full = false, v4 = false, v6 = false;
        String endpoint = "";
        for (Peer p : cfg.getPeers()) {
            for (InetNetwork n : p.getAllowedIps()) {
                String s = n.toString();
                if (s.equals("0.0.0.0/0") || s.equals("::/0")) full = true;
                if (s.equals("0.0.0.0/0")) v4 = true;
                if (s.equals("::/0")) v6 = true;
            }
            if (endpoint.isEmpty()) {
                java.util.Optional<InetEndpoint> e = p.getEndpoint();
                if (e.isPresent()) endpoint = e.get().toString();
            }
        }
        o.put("endpoint", endpoint);
        o.put("addresses", addrs);
        o.put("dns", dns);
        o.put("peers", cfg.getPeers().size());
        o.put("fullTunnel", full);
        o.put("v4route", v4);   /* V0.38.0: does the config send all IPv4 / all IPv6 through the tunnel (leak test) */
        o.put("v6route", v6);
        return o;
    }

    private JSObject everything() throws Exception {
        JSObject o = new JSObject();
        o.put("profiles", new JSArray(VpnCore.list(ctx()).toString()));
        o.put("settings", new JSObject(VpnCore.settings(ctx()).toString()));
        o.put("error", VpnCore.lastError());
        return o;
    }

    // ---------------------------------------------------------------- profiles

    /** profiles() -> {profiles:[{id,name,endpoint,fullTunnel,mode,apps,active,bad?}], settings, error} */
    @PluginMethod
    public void profiles(final PluginCall call) {
        run(call, () -> call.resolve(everything()));
    }

    /** addProfile({name, config}) saves a pasted config. Rejects with a plain sentence when the config is bad. */
    @PluginMethod
    public void addProfile(final PluginCall call) {
        final String name = call.getString("name", "VPN");
        final String text = call.getString("config");
        run(call, () -> {
            VpnCore.add(ctx(), name, text);
            call.resolve(everything());
        });
    }

    /**
     * importFiles() opens Android's file picker (several files at once) and saves each valid WireGuard config as a profile.
     * Resolves with {added:[names], failed:[{name,error}], ...everything}. Config text is read here and never returned.
     */
    @PluginMethod
    public void importFiles(PluginCall call) {
        try {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            startActivityForResult(call, i, "importResult");
        } catch (Throwable t) {
            call.reject("The file picker could not be opened.", "NO_PICKER");
        }
    }

    @ActivityCallback
    private void importResult(final PluginCall call, final ActivityResult r) {
        if (call == null) return;
        final Intent data = r.getData();
        if (r.getResultCode() != Activity.RESULT_OK || data == null) {
            call.reject("Cancelled", "CANCELLED");
            return;
        }
        run(call, () -> {
            java.util.List<Uri> uris = new java.util.ArrayList<>();
            if (data.getClipData() != null) {
                for (int k = 0; k < data.getClipData().getItemCount(); k++) uris.add(data.getClipData().getItemAt(k).getUri());
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
            JSArray added = new JSArray();
            JSArray failed = new JSArray();
            for (Uri u : uris) {
                String name = displayName(u);
                try {
                    String text = readSmall(u);
                    String base = name.replaceAll("(?i)\\.(conf|txt)$", "");
                    VpnCore.add(ctx(), base, text);
                    added.put(base);
                } catch (Throwable t) {
                    JSObject f = new JSObject();
                    f.put("name", name);
                    f.put("error", VpnCore.explain(t)[1]);
                    failed.put(f);
                }
            }
            JSObject o = everything();
            o.put("added", added);
            o.put("failed", failed);
            call.resolve(o);
        });
    }

    private String displayName(Uri u) {
        String n = "config";
        try (Cursor c = getContext().getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst() && c.getString(0) != null) n = c.getString(0);
        } catch (Throwable ignore) { }
        return n;
    }

    /** Reads at most 200 KB: a WireGuard config is a few hundred bytes, so a bigger file is not one. */
    private String readSmall(Uri u) throws Exception {
        try (InputStream in = getContext().getContentResolver().openInputStream(u)) {
            if (in == null) throw new Exception("That file could not be opened.");
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n, total = 0;
            while ((n = in.read(b)) > 0) {
                total += n;
                if (total > 200000) throw new Exception("That file is too big to be a WireGuard config.");
                bo.write(b, 0, n);
            }
            return new String(bo.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    @PluginMethod
    public void renameProfile(final PluginCall call) {
        final String id = call.getString("id", ""), name = call.getString("name", "");
        run(call, () -> { VpnCore.rename(ctx(), id, name); call.resolve(everything()); });
    }

    @PluginMethod
    public void deleteProfile(final PluginCall call) {
        final String id = call.getString("id", "");
        run(call, () -> { VpnCore.delete(ctx(), id); call.resolve(everything()); });
    }

    /** setRouting({id, mode:'all'|'exclude'|'include', apps:[package names]}) takes effect the next time the profile connects. */
    @PluginMethod
    public void setRouting(final PluginCall call) {
        final String id = call.getString("id", ""), mode = call.getString("mode", "all");
        final JSArray apps = call.getArray("apps");
        run(call, () -> { VpnCore.setRouting(ctx(), id, mode, apps); call.resolve(everything()); });
    }

    /** setOptions({rotate, minutes, random, keepAlive, freeMem}) any subset. */
    @PluginMethod
    public void setOptions(final PluginCall call) {
        final JSONObject o = call.getData();
        run(call, () -> { VpnCore.setOptions(ctx(), o); call.resolve(everything()); });
    }

    // ---------------------------------------------------------------- connection

    /** requestPermission() -> {granted}. Shows Android's own VPN connection request when it is needed. */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        try {
            Intent i = VpnService.prepare(getContext());
            if (i == null) {
                JSObject o = new JSObject();
                o.put("granted", true);
                call.resolve(o);
                return;
            }
            startActivityForResult(call, i, "vpnPermResult");
        } catch (Throwable t) {
            call.reject(VpnCore.explain(t)[1], VpnCore.explain(t)[0]);
        }
    }

    @ActivityCallback
    private void vpnPermResult(PluginCall call, ActivityResult r) {
        if (call == null) return;
        JSObject o = new JSObject();
        o.put("granted", r.getResultCode() == Activity.RESULT_OK);
        call.resolve(o);
    }

    /** connect({id}). Rejects with code VPN_NOT_AUTHORIZED when Android's consent is missing: call requestPermission() and retry. */
    @PluginMethod
    public void connect(final PluginCall call) {
        final String id = call.getString("id", "");
        run(call, () -> { VpnCore.connect(ctx(), id); call.resolve(everything()); });
    }

    @PluginMethod
    public void disconnect(final PluginCall call) {
        run(call, () -> { VpnCore.disconnect(ctx()); call.resolve(everything()); });
    }

    /** next() rotates to the next profile now. */
    @PluginMethod
    public void next(final PluginCall call) {
        run(call, () -> {
            String name = VpnCore.rotateNow(ctx());
            JSObject o = everything();
            o.put("now", name);
            call.resolve(o);
        });
    }

    /** status() -> cheap snapshot for the 2 second poll. Never rejects. */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject o = new JSObject();
        long rx = 0, tx = 0, hs = 0;
        String version = "";
        boolean up = VpnCore.isUp();
        try {
            if (up) {
                try {
                    com.wireguard.android.backend.Statistics s = VpnCore.engineOrNull().getStatistics(VpnCore.tunnel());
                    rx = s.totalRx();
                    tx = s.totalTx();
                    /* V0.38.0: newest handshake across the peers (0 = none yet). The web side turns it into "no handshake" / "tunnel may have dropped". */
                    for (com.wireguard.crypto.Key k : s.peers()) {
                        com.wireguard.android.backend.Statistics.PeerStats ps = s.peer(k);
                        if (ps != null && ps.latestHandshakeEpochMillis() > hs) hs = ps.latestHandshakeEpochMillis();
                    }
                } catch (Throwable ignore) { }
            }
            if (VpnCore.engineOrNull() != null) {
                try { version = String.valueOf(VpnCore.engineOrNull().getVersion()); } catch (Throwable ignore) { }
            }
            JSONObject st = VpnCore.settings(ctx());
            o.put("rotate", st.optBoolean("rotate"));
            o.put("minutes", st.optInt("minutes"));
            o.put("nextAt", up ? st.optLong("nextAt") : 0);
            o.put("activeId", up ? st.optString("activeId") : "");
            o.put("name", up ? VpnCore.prefs(ctx()).getString("activeName", "") : "");
        } catch (Throwable ignore) { }
        o.put("state", up ? "UP" : "DOWN");
        o.put("rx", rx);
        o.put("tx", tx);
        o.put("version", version);
        o.put("handshakeAgo", hs > 0 ? Math.max(0, System.currentTimeMillis() - hs) : -1);
        o.put("error", VpnCore.lastError());
        o.put("now", System.currentTimeMillis());
        call.resolve(o);
    }

    // ---------------------------------------------------------------- app firewall (V0.34.0)

    private JSObject fwEverything() throws Exception {
        JSObject o = new JSObject();
        o.put("enabled", FirewallService.enabled(ctx()));
        o.put("running", FirewallService.running);
        o.put("net", FirewallService.net);
        o.put("rules", new JSObject(FirewallService.rules(ctx()).toString()));
        o.put("wgUp", VpnCore.isUp());
        return o;
    }

    /** fwState() -> {enabled, running, net:'wifi'|'mobile'|'other'|'none', rules:{pkg:rule}, wgUp}. If it should be on but Android stopped it, it is started again. */
    @PluginMethod
    public void fwState(final PluginCall call) {
        run(call, () -> {
            if (FirewallService.enabled(ctx()) && !FirewallService.running && VpnService.prepare(ctx()) == null && !VpnCore.isUp()) FirewallService.start(ctx());
            call.resolve(fwEverything());
        });
    }

    /** fwSetRules({rules:{pkg:'wifi'|'mobile'|'both'|'focus'}}) replaces every rule. Applies at once when the firewall is on. */
    @PluginMethod
    public void fwSetRules(final PluginCall call) {
        final JSObject r = call.getObject("rules", new JSObject());
        run(call, () -> { FirewallService.setRules(ctx(), r); call.resolve(fwEverything()); });
    }

    /** fwEnable({on}). Turning on needs Android's VPN consent (rejects VPN_NOT_AUTHORIZED, ask requestPermission() and retry) and turns the WireGuard VPN off. */
    @PluginMethod
    public void fwEnable(final PluginCall call) {
        final boolean on = call.getBoolean("on", false);
        run(call, () -> {
            if (!on) { FirewallService.stop(ctx()); call.resolve(fwEverything()); return; }
            if (FirewallService.rules(ctx()).length() == 0) throw new Exception("Pick at least one app to block first.");
            if (VpnService.prepare(ctx()) != null) throw new com.wireguard.android.backend.BackendException(com.wireguard.android.backend.BackendException.Reason.VPN_NOT_AUTHORIZED);
            if (VpnCore.isUp()) { VpnCore.disconnect(ctx()); try { Thread.sleep(1300); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); } }
            FirewallService.start(ctx());
            try { Thread.sleep(700); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            call.resolve(fwEverything());
        });
    }

    /** openSettings() opens Android's VPN page, where Always-on VPN and Block connections without VPN (the kill switch) live. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_VPN_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Throwable t) {
            try {
                Intent i = new Intent(Settings.ACTION_WIRELESS_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
            } catch (Throwable t2) {
                call.reject("Android's VPN settings page could not be opened.", "NO_SETTINGS");
            }
        }
    }
}
