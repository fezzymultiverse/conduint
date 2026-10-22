package com.fezzy.conduint;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Cred (V0.29.0): the web side's handle on passkeys and autofill. The real work is in PasskeyService, AutofillSvc and CredStore.
 *
 *  status()                 what this phone can do and what is switched on
 *  openProviderSettings()   Android's "Passwords, passkeys and accounts" page, where Conduint is picked as the passkey provider
 *  openAutofillSettings()   Android's "Autofill service" picker for Conduint
 *  listPasskeys() / deletePasskey({id})
 *  pendingPasskeys()        new vault passkeys the password manager has not copied yet, with their private keys (vault use only)
 *  ackPasskeys({ids})       the vault now holds these
 *  setVaultPasskeys({json}) the vault's passkey list becomes the phone's copy
 *  syncPasswords({json}) / clearPasswords()   the shared password list for autofill (encrypted in the Keystore)
 */
@CapacitorPlugin(name = "Cred")
public class CredPlugin extends Plugin {

    private static final String PROVIDER_ACTION = "android.settings.CREDENTIAL_PROVIDER";

    private String autofillCurrent() {
        try { return Settings.Secure.getString(getContext().getContentResolver(), "autofill_service"); } catch (Throwable t) { return null; }
    }

    private boolean providerOn() {
        String pkg = getContext().getPackageName();
        for (String key : new String[]{"credential_service", "credential_service_primary"}) {
            try {
                String v = Settings.Secure.getString(getContext().getContentResolver(), key);
                if (v != null && v.contains(pkg + "/")) return true;
            } catch (Throwable ignored) { }
        }
        return false;
    }

    @PluginMethod
    public void status(PluginCall call) {
        try {
            Context c = getContext();
            JSObject o = new JSObject();
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("passkeyCapable", Build.VERSION.SDK_INT >= 34);
            o.put("autofillCapable", Build.VERSION.SDK_INT >= 26);
            o.put("passkeys", CredStore.allPasskeys(c).length());
            o.put("pendingPasskeys", CredStore.pendingPasskeys(c).length());
            o.put("passwords", CredStore.passwordCount(c));
            String cur = autofillCurrent();
            o.put("autofillOn", cur != null && cur.startsWith(c.getPackageName() + "/"));
            o.put("providerOn", providerOn());
            call.resolve(o);
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()));
        }
    }

    private void launch(PluginCall call, Intent i) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Throwable t) {
            call.reject("Android could not open that page. Open Settings > Passwords, passkeys & accounts yourself.");
        }
    }

    @PluginMethod
    public void openProviderSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < 34) {
            call.reject("Passkey providers need Android 14 or newer.");
            return;
        }
        /* V0.51.0: some phones (Honor / MagicOS among them) do not answer the exact Android 14 intent, so try the plain one, then the Privacy page, then Settings. */
        String pkg = getContext().getPackageName();
        Intent[] tries = new Intent[]{
            new Intent(PROVIDER_ACTION).setData(Uri.parse("package:" + pkg)),
            new Intent(PROVIDER_ACTION),
            new Intent(Settings.ACTION_PRIVACY_SETTINGS),
            new Intent(Settings.ACTION_SETTINGS)
        };
        for (Intent i : tries) {
            try {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
                return;
            } catch (Throwable ignored) { }
        }
        call.reject("Android could not open that page. Open Settings > Passwords, passkeys & accounts yourself and pick Conduint.");
    }

    @PluginMethod
    public void openAutofillSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < 26) {
            call.reject("Autofill needs Android 8 or newer.");
            return;
        }
        launch(call, new Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).setData(Uri.parse("package:" + getContext().getPackageName())));
    }

    @PluginMethod
    public void listPasskeys(PluginCall call) {
        try {
            JSONArray a = CredStore.allPasskeys(getContext());
            JSArray out = new JSArray();
            for (int i = 0; i < a.length(); i++) {
                JSONObject r = a.optJSONObject(i);
                if (r == null) continue;
                JSObject o = new JSObject();
                o.put("id", r.optString("id"));
                o.put("rp", r.optString("rp"));
                o.put("rpName", r.optString("rpName"));
                o.put("user", r.optString("user"));
                o.put("display", r.optString("display"));
                o.put("created", r.optLong("created"));
                o.put("vault", CredStore.isSoft(r));
                out.put(o);
            }
            JSObject res = new JSObject();
            res.put("items", out);
            call.resolve(res);
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()));
        }
    }

    @PluginMethod
    public void deletePasskey(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("No passkey id.");
            return;
        }
        JSObject o = new JSObject();
        o.put("deleted", CredStore.deletePasskey(getContext(), id));
        call.resolve(o);
    }

    @PluginMethod
    public void pendingPasskeys(PluginCall call) {
        try {
            JSONArray a = CredStore.pendingPasskeys(getContext());
            JSArray out = new JSArray();
            for (int i = 0; i < a.length(); i++) {
                JSONObject r = a.optJSONObject(i);
                if (r == null) continue;
                JSObject o = new JSObject();
                o.put("id", r.optString("id"));
                o.put("rp", r.optString("rp"));
                o.put("rpName", r.optString("rpName"));
                o.put("uid", r.optString("uid"));
                o.put("user", r.optString("user"));
                o.put("display", r.optString("display"));
                o.put("priv", r.optString("priv"));
                o.put("created", r.optLong("created"));
                out.put(o);
            }
            JSObject res = new JSObject();
            res.put("items", out);
            call.resolve(res);
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()));
        }
    }

    @PluginMethod
    public void ackPasskeys(PluginCall call) {
        try {
            JSArray ids = call.getArray("ids");
            java.util.Set<String> set = new java.util.HashSet<>();
            if (ids != null) for (int i = 0; i < ids.length(); i++) set.add(ids.optString(i));
            JSObject o = new JSObject();
            o.put("acked", CredStore.ackPasskeys(getContext(), set));
            call.resolve(o);
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()));
        }
    }

    @PluginMethod
    public void setVaultPasskeys(PluginCall call) {
        try {
            String json = call.getString("json");
            if (json == null) {
                call.reject("No list.");
                return;
            }
            JSObject o = new JSObject();
            o.put("count", CredStore.setVaultPasskeys(getContext(), json));
            call.resolve(o);
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()));
        }
    }

    @PluginMethod
    public void syncPasswords(PluginCall call) {
        try {
            String json = call.getString("json");
            if (json == null) {
                call.reject("No list.");
                return;
            }
            CredStore.savePasswords(getContext(), json);
            JSObject o = new JSObject();
            o.put("count", CredStore.passwordCount(getContext()));
            call.resolve(o);
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()));
        }
    }

    @PluginMethod
    public void clearPasswords(PluginCall call) {
        CredStore.clearPasswords(getContext());
        call.resolve();
    }
}
